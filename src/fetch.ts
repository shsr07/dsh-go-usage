/**
 * The OpenCode GO usage fetch: one `powershell.exe` invocation through the
 * subprocess seam. The subprocess seam is used instead of the shell executor
 * because the shell's Windows ACL sandbox forces ConstrainedLanguage mode,
 * which rejects the `SecurityProtocol` assignment TLS 1.2 requires on Windows
 * PowerShell 5.1.
 * @module dsh-go-usage/fetch
 */

import type { GoUsageResponse } from './types.ts'

/**
 * Windows PowerShell 5.1 last-resort path (also the pwsh executor's fallback).
 * The well-known path is stable on every supported Windows host.
 */
export const POWERSHELL_EXE = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'

/** Remote-call grace for the PowerShell fetch (SIGTERM → kill escalation). */
const GRACE_MS = 3000
/** Stdio collection caps: the usage payload is a few hundred bytes at most. */
const OUTPUT_CAP_BYTES = 65536

/** Fetch options resolved from plugin config (defaults applied by the schema). */
export interface GoUsageFetchOptions {
  /** Absolute path of the opencode auth.json to read. */
  readonly authJsonPath: string
  /** The OpenCode GO usage API URL. */
  readonly apiUrl: string
  /** The PowerShell executable to run. */
  readonly powershellExe: string
  /** The API request timeout in seconds. */
  readonly timeoutSec: number
}

/** Minimal structural face of the subprocess service this plugin uses. */
export interface GoUsageSubprocess {
  spawn(spec: {
    argv: readonly string[]
    cwd: string
    stdio: {
      stdin: 'ignore'
      stdout: { maxBytes: number }
      stderr: { maxBytes: number }
    }
    graceMs: number
  }): {
    done: Promise<{ exitCode: number | null }>
    collected: {
      stdout?: { readFrom(offset: number): { text: string } }
      stderr?: { readFrom(offset: number): { text: string } }
    }
  }
}

/**
 * UTF-8 output pinning prepended to every command (mirrors the pwsh
 * executor's ENCODING_PREAMBLE). Windows PowerShell 5.1 writes the console
 * code page by default, which garbles non-ASCII stderr (localized errors) on
 * Chinese Windows; the subprocess collector decodes bytes as UTF-8.
 */
const ENCODING_PREAMBLE =
  '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); $OutputEncoding = [System.Text.UTF8Encoding]::new($false); '

/**
 * One PowerShell invocation that reads the opencode-go API key from the
 * user's `auth.json`, fetches the usage API, and prints the JSON. TLS 1.2
 * is enabled explicitly because Windows PowerShell 5.1 defaults to
 * TLS 1.0/1.1 and the endpoint rejects those.
 * @param options - resolved fetch options (auth path, API URL, executable).
 * @returns the PowerShell command line.
 */
export function buildUsageCommand(options: GoUsageFetchOptions): string {
  const quoted = options.authJsonPath.replaceAll("'", "''")
  const apiQuoted = options.apiUrl.replaceAll("'", "''")
  return [
    ENCODING_PREAMBLE,
    '[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12',
    `$k = (Get-Content '${quoted}' -Raw | ConvertFrom-Json).'opencode-go'.key`,
    "if (-not $k) { throw 'opencode-go key not found' }",
    `(Invoke-RestMethod -Uri '${apiQuoted}' -Headers @{Authorization="Bearer $k"} -TimeoutSec ${options.timeoutSec}) | ConvertTo-Json -Compress -Depth 5`,
  ].join('; ')
}

/**
 * Spawn one PowerShell fetch and settle with its collected stdout/stderr.
 * @param subprocess - the mounted subprocess service.
 * @param options - resolved fetch options (executable, auth path, API URL).
 * @returns exit code, stdout, and stderr after the process tree exits.
 */
export async function runUsageFetch(
  subprocess: GoUsageSubprocess,
  options: GoUsageFetchOptions,
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  const command = buildUsageCommand(options)
  const handle = subprocess.spawn({
    argv: [options.powershellExe, '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command],
    cwd: 'C:\\',
    stdio: {
      stdin: 'ignore',
      stdout: { maxBytes: OUTPUT_CAP_BYTES },
      stderr: { maxBytes: OUTPUT_CAP_BYTES },
    },
    graceMs: GRACE_MS,
  })
  const outcome = await handle.done
  const stdout = handle.collected.stdout?.readFrom(0).text ?? ''
  const stderr = handle.collected.stderr?.readFrom(0).text ?? ''
  return { exitCode: outcome.exitCode, stdout, stderr }
}

/**
 * Fetch and parse the current OpenCode GO usage buckets.
 * @param subprocess - the mounted subprocess service.
 * @param options - resolved fetch options (auth path, API URL, executable).
 * @returns the usage snapshot, or a failure reason.
 */
export async function fetchGoUsage(
  subprocess: GoUsageSubprocess,
  options: GoUsageFetchOptions,
): Promise<GoUsageResponse> {
  try {
    const { exitCode, stdout, stderr } = await runUsageFetch(subprocess, options)
    const text = stdout.trim()
    if (exitCode !== 0 || text.length === 0) {
      const detail = stderr.trim() || 'no output'
      return { ok: false, error: `usage fetch failed (exit ${String(exitCode)}): ${detail}` }
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch (error) {
      return { ok: false, error: `usage response is not JSON: ${error instanceof Error ? error.message : String(error)}` }
    }
    const usage = parsed as { usage?: { rolling?: unknown; weekly?: unknown; monthly?: unknown } }
    const { rolling, weekly, monthly } = usage.usage ?? {}
    const entry = (value: unknown): { status: 'ok' | 'rate-limited'; percent: number; resetsAt: string } | undefined => {
      if (value === null || typeof value !== 'object') return undefined
      const record = value as Record<string, unknown>
      if (typeof record.percent !== 'number' || typeof record.resetsAt !== 'string') return undefined
      return {
        status: record.status === 'rate-limited' ? 'rate-limited' : 'ok',
        percent: record.percent,
        resetsAt: record.resetsAt,
      }
    }
    const rollingEntry = entry(rolling)
    const weeklyEntry = entry(weekly)
    const monthlyEntry = entry(monthly)
    if (rollingEntry === undefined || weeklyEntry === undefined || monthlyEntry === undefined) {
      return { ok: false, error: 'usage response is missing rolling/weekly/monthly buckets' }
    }
    return { ok: true, usage: { rolling: rollingEntry, weekly: weeklyEntry, monthly: monthlyEntry } }
  } catch (error) {
    return { ok: false, error: `usage fetch failed: ${error instanceof Error ? error.message : String(error)}` }
  }
}
