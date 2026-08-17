import { describe, expect, it, vi } from 'vitest'
import { buildUsageCommand, fetchGoUsage, runUsageFetch } from '../src/fetch.ts'
import type { GoUsageFetchOptions, GoUsageSubprocess } from '../src/fetch.ts'
import { isTrustedApiRequest } from '../src/trust-fence.ts'
import { writeError, writeJson } from '../src/wire.ts'
import { resolveFetchOptions } from '../src/index.ts'
import type { IncomingMessage, ServerResponse } from 'node:http'

const USAGE_JSON = JSON.stringify({
  usage: {
    rolling: { status: 'ok', percent: 6, resetsAt: '2026-08-15T11:57:51.401Z' },
    weekly: { status: 'ok', percent: 10, resetsAt: '2026-08-17T00:00:00.401Z' },
    monthly: { status: 'rate-limited', percent: 100, resetsAt: '2026-09-14T04:39:32.401Z' },
  },
})

/** Default fetch options for tests. */
function options(overrides: Partial<GoUsageFetchOptions> = {}): GoUsageFetchOptions {
  return {
    authJsonPath: 'C:\\Users\\me\\.local\\share\\opencode\\auth.json',
    apiUrl: 'https://opencode.ai/zen/go/v1/usage',
    powershellExe: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    timeoutSec: 15,
    ...overrides,
  }
}

/** Minimal collected reader. */
function reader(text: string) {
  return { readFrom: () => ({ text, nextOffset: 0, lossy: false }) }
}

/** Minimal subprocess provider returning scripted handles. */
function stubSubprocess(script: { exitCode: number | null; stdout: string; stderr: string }): GoUsageSubprocess {
  return {
    spawn: () => ({
      done: Promise.resolve({ exitCode: script.exitCode }),
      collected: { stdout: reader(script.stdout), stderr: reader(script.stderr) },
    }),
  }
}

function req(host: string): IncomingMessage {
  return { headers: { host } } as IncomingMessage
}

describe('buildUsageCommand', () => {
  it('enables UTF-8 output, TLS 1.2, reads the configured auth.json, and requests the usage endpoint', () => {
    const command = buildUsageCommand(options())
    expect(command).toContain('[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)')
    expect(command).toContain('[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12')
    expect(command).toContain("'C:\\Users\\me\\.local\\share\\opencode\\auth.json'")
    expect(command).toContain("'opencode-go'.key")
    expect(command).toContain('https://opencode.ai/zen/go/v1/usage')
    expect(command).toContain('Authorization="Bearer $k"')
    expect(command).toContain('ConvertTo-Json -Compress -Depth 5')
  })

  it('uses the configured API URL', () => {
    const command = buildUsageCommand(options({ apiUrl: 'https://example.test/usage' }))
    expect(command).toContain("'https://example.test/usage'")
  })

  it('escapes a single quote in the auth path', () => {
    const command = buildUsageCommand(options({ authJsonPath: "C:\\Users\\o'brien\\auth.json" }))
    expect(command).toContain("'C:\\Users\\o''brien\\auth.json'")
  })
})

describe('runUsageFetch', () => {
  it('spawns the configured powershell.exe with the command as one argv element and collects stdout', async () => {
    const specs: unknown[] = []
    const subprocess: GoUsageSubprocess = {
      spawn: (spec) => {
        specs.push(spec)
        return {
          done: Promise.resolve({ exitCode: 0 }),
          collected: { stdout: reader(USAGE_JSON), stderr: reader('') },
        }
      },
    }
    const opts = options()
    const result = await runUsageFetch(subprocess, opts)
    expect(result).toEqual({ exitCode: 0, stdout: USAGE_JSON, stderr: '' })
    const spec = specs[0] as { argv: string[]; cwd: string; stdio: unknown; graceMs: number }
    expect(spec.argv[0]).toBe('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
    expect(spec.argv).toContain('-Command')
    const command = spec.argv[spec.argv.indexOf('-Command') + 1] ?? ''
    expect(command).toContain('https://opencode.ai/zen/go/v1/usage')
    expect(command).toContain("'C:\\Users\\me\\.local\\share\\opencode\\auth.json'")
    expect(spec.cwd).toBe('C:\\')
    expect(spec.graceMs).toBe(3000)
    expect(spec.stdio).toEqual({
      stdin: 'ignore',
      stdout: { maxBytes: 65536 },
      stderr: { maxBytes: 65536 },
    })
  })

  it('propagates a spawn rejection', async () => {
    const subprocess: GoUsageSubprocess = {
      spawn: () => ({ done: Promise.reject(new Error('spawn failed')), collected: {} }),
    }
    await expect(runUsageFetch(subprocess, options())).rejects.toThrow('spawn failed')
  })
})

describe('fetchGoUsage', () => {
  it('returns the parsed usage buckets on a successful fetch', async () => {
    const result = await fetchGoUsage(stubSubprocess({ exitCode: 0, stdout: USAGE_JSON, stderr: '' }), options())
    expect(result).toEqual({
      ok: true,
      usage: {
        rolling: { status: 'ok', percent: 6, resetsAt: '2026-08-15T11:57:51.401Z' },
        weekly: { status: 'ok', percent: 10, resetsAt: '2026-08-17T00:00:00.401Z' },
        monthly: { status: 'rate-limited', percent: 100, resetsAt: '2026-09-14T04:39:32.401Z' },
      },
    })
  })

  it('reports a nonzero exit with the stderr detail', async () => {
    const result = await fetchGoUsage(
      stubSubprocess({ exitCode: 1, stdout: '', stderr: 'Invoke-RestMethod failed' }),
      options(),
    )
    expect(result).toEqual({ ok: false, error: expect.stringContaining('Invoke-RestMethod failed') })
  })

  it('reports empty output without an exit code', async () => {
    const result = await fetchGoUsage(stubSubprocess({ exitCode: 0, stdout: '  ', stderr: '' }), options())
    expect(result).toEqual({ ok: false, error: expect.stringContaining('no output') })
  })

  it('reports non-JSON output', async () => {
    const result = await fetchGoUsage(stubSubprocess({ exitCode: 0, stdout: '<html>', stderr: '' }), options())
    expect(result).toEqual({ ok: false, error: expect.stringContaining('not JSON') })
  })

  it('reports a response missing the usage buckets', async () => {
    const result = await fetchGoUsage(stubSubprocess({ exitCode: 0, stdout: '{"other": 1}', stderr: '' }), options())
    expect(result).toEqual({ ok: false, error: expect.stringContaining('missing rolling/weekly/monthly') })
  })

  it('reports a response with a malformed bucket', async () => {
    const bad = JSON.stringify({ usage: { rolling: { percent: 'x' }, weekly: {}, monthly: null } })
    const result = await fetchGoUsage(stubSubprocess({ exitCode: 0, stdout: bad, stderr: '' }), options())
    expect(result).toEqual({ ok: false, error: expect.stringContaining('missing rolling/weekly/monthly') })
  })
})

describe('resolveFetchOptions', () => {
  it('applies configured values when provided', () => {
    const resolved = resolveFetchOptions({
      authJsonPath: 'C:\\custom\\auth.json',
      apiUrl: 'https://example.test/usage',
      powershellExe: 'C:\\pwsh.exe',
      timeoutSec: 30,
    })
    expect(resolved).toEqual({
      authJsonPath: 'C:\\custom\\auth.json',
      apiUrl: 'https://example.test/usage',
      powershellExe: 'C:\\pwsh.exe',
      timeoutSec: 30,
    })
  })

  it('falls back to environment defaults for omitted fields', () => {
    const previous = { ...process.env }
    process.env.USERPROFILE = 'C:\\Users\\tester'
    try {
      const resolved = resolveFetchOptions({})
      expect(resolved.authJsonPath).toBe('C:/Users/tester/.local/share/opencode/auth.json')
      expect(resolved.apiUrl).toBe('https://opencode.ai/zen/go/v1/usage')
      expect(resolved.powershellExe).toBe('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
      expect(resolved.timeoutSec).toBe(15)
    } finally {
      process.env = previous
    }
  })

  it('throws when no authJsonPath is configured and no profile dir exists', () => {
    const previous = { ...process.env }
    delete process.env.USERPROFILE
    delete process.env.HOME
    try {
      expect(() => resolveFetchOptions({})).toThrow(/USERPROFILE/)
    } finally {
      process.env = previous
    }
  })
})

describe('isTrustedApiRequest', () => {
  it('accepts loopback host literals', () => {
    for (const host of ['127.0.0.1:3080', 'localhost:3080', '[::1]:3080']) {
      expect(isTrustedApiRequest(req(host), [])).toBe(true)
    }
  })

  it('accepts an explicitly trusted host', () => {
    expect(isTrustedApiRequest(req('app.internal:3080'), ['app.internal'])).toBe(true)
  })

  it('rejects an untrusted host and a missing host header', () => {
    expect(isTrustedApiRequest(req('evil.example:3080'), [])).toBe(false)
    expect(isTrustedApiRequest({ headers: {} } as IncomingMessage, [])).toBe(false)
  })
})

describe('wire helpers', () => {
  function responseMock() {
    const state = { status: 0, headers: {} as Record<string, string>, body: '' }
    return {
      state,
      res: {
        writeHead: (status: number, headers: Record<string, string>) => {
          state.status = status
          state.headers = headers
        },
        end: (payload: string) => { state.body = payload },
      } as unknown as ServerResponse,
    }
  }

  it('writeJson sets JSON headers and serializes the body', () => {
    const { state, res } = responseMock()
    writeJson(res, 200, { ok: true })
    expect(state.status).toBe(200)
    expect(state.headers['content-type']).toContain('application/json')
    expect(state.headers['cache-control']).toBe('no-store')
    expect(JSON.parse(state.body)).toEqual({ ok: true })
  })

  it('writeError wraps the reason in the error envelope', () => {
    const { state, res } = responseMock()
    writeError(res, 403, 'forbidden', 'untrusted Host header')
    expect(state.status).toBe(403)
    expect(JSON.parse(state.body)).toEqual({ error: { code: 'forbidden', message: 'untrusted Host header' } })
  })
})

describe('host apply', () => {
  interface Route {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }

  /** Mount apply() over fakes and return the registered route plus helpers. */
  function mountApply(options: {
    trustedHosts?: string[]
    failSubprocess?: boolean
  } = {}) {
    const routes: Route[] = []
    const disposers: Array<() => void> = []
    const subprocess: GoUsageSubprocess = options.failSubprocess === true
      ? { spawn: () => { throw new Error('spawn failed') } }
      : stubSubprocess({ exitCode: 0, stdout: USAGE_JSON, stderr: '' })
    const entries = () => [{ options: { name: 'connection', config: { trustedHosts: options.trustedHosts ?? [] } } }]
    const ctx = {
      webServer: { register: (route: Route) => { routes.push(route); return () => {} } },
      loader: { entries },
      effect: (fn: () => () => void) => { disposers.push(fn()); },
      get: (name: string) => (name === 'subprocess' ? subprocess : undefined),
    }
    return { ctx, routes, disposers }
  }

  it('registers the /go-usage/api prefix route', async () => {
    const { ctx, routes, disposers } = mountApply()
    const { apply } = await import('../src/index.ts')
    apply(ctx as never, {})
    expect(routes).toHaveLength(1)
    expect(routes[0]!.kind).toBe('prefix')
    expect(routes[0]!.path).toBe('/go-usage/api')
    expect(disposers).toHaveLength(1)
  })

  it('answers a trusted GET /go-usage/api/usage with the usage payload', async () => {
    const { ctx, routes } = mountApply()
    const { apply } = await import('../src/index.ts')
    apply(ctx as never, { authJsonPath: 'C:\\auth.json' })
    const state = { status: 0, headers: {} as Record<string, string>, body: '' }
    const res = {
      writeHead: (status: number, headers: Record<string, string>) => { state.status = status; state.headers = headers },
      end: (payload: string) => { state.body = payload },
    } as unknown as ServerResponse
    routes[0]!.handler(
      { method: 'GET', headers: { host: '127.0.0.1:3080' }, url: '/go-usage/api/usage' } as IncomingMessage,
      res,
    )
    await vi.waitFor(() => expect(state.body).not.toBe(''))
    expect(state.status).toBe(200)
    expect(JSON.parse(state.body)).toEqual({ ok: true, usage: expect.objectContaining({ rolling: expect.any(Object) }) })
  })

  it('rejects an untrusted host with 403', async () => {
    const { ctx, routes } = mountApply()
    const { apply } = await import('../src/index.ts')
    apply(ctx as never, { authJsonPath: 'C:\\auth.json' })
    const state = { status: 0, body: '' }
    const res = {
      writeHead: (status: number) => { state.status = status },
      end: (payload: string) => { state.body = payload },
    } as unknown as ServerResponse
    routes[0]!.handler(
      { method: 'GET', headers: { host: 'evil.example:3080' }, url: '/go-usage/api/usage' } as IncomingMessage,
      res,
    )
    expect(state.status).toBe(403)
    expect(JSON.parse(state.body)).toEqual({ error: expect.objectContaining({ code: 'forbidden' }) })
  })

  it('rejects a non-GET/POST method with 405', async () => {
    const { ctx, routes } = mountApply()
    const { apply } = await import('../src/index.ts')
    apply(ctx as never, { authJsonPath: 'C:\\auth.json' })
    const state = { status: 0, body: '' }
    const res = {
      writeHead: (status: number) => { state.status = status },
      end: (payload: string) => { state.body = payload },
    } as unknown as ServerResponse
    routes[0]!.handler(
      { method: 'DELETE', headers: { host: '127.0.0.1:3080' }, url: '/go-usage/api/usage' } as IncomingMessage,
      res,
    )
    expect(state.status).toBe(405)
    expect(JSON.parse(state.body)).toEqual({ error: expect.objectContaining({ code: 'method-not-allowed' }) })
  })

  it('answers an unknown sub-path with 404', async () => {
    const { ctx, routes } = mountApply()
    const { apply } = await import('../src/index.ts')
    apply(ctx as never, { authJsonPath: 'C:\\auth.json' })
    const state = { status: 0, body: '' }
    const res = {
      writeHead: (status: number) => { state.status = status },
      end: (payload: string) => { state.body = payload },
    } as unknown as ServerResponse
    routes[0]!.handler(
      { method: 'GET', headers: { host: '127.0.0.1:3080' }, url: '/go-usage/api/other' } as IncomingMessage,
      res,
    )
    expect(state.status).toBe(404)
    expect(JSON.parse(state.body)).toEqual({ error: expect.objectContaining({ code: 'not-found' }) })
  })

  it('throws at apply time when the subprocess service is missing', async () => {
    const { apply } = await import('../src/index.ts')
    const ctx = {
      webServer: { register: () => () => {} },
      loader: { entries: () => [] },
      effect: () => {},
      get: () => undefined,
    }
    expect(() => apply(ctx as never, { authJsonPath: 'C:\\auth.json' })).toThrow(/subprocess/)
  })
})
