/**
 * dsh-go-usage host half: the fenced `/go-usage/api` JSON route.
 *
 * One method, `usage`, reads the local opencode `auth.json` API key and
 * fetches the OpenCode GO rolling/weekly/monthly usage through a direct
 * `powershell.exe` invocation (see {@link fetchGoUsage}). Every request
 * passes the same browser-trust fence as the /api gateway (Host-header
 * loopback or the connection row's trustedHosts, read live from the loader)
 * so a cross-site page can never reach the route.
 *
 * @module dsh-go-usage
 */

import type { Context } from './context-types.ts'
import { isTrustedApiRequest } from './trust-fence.ts'
import { writeError, writeJson } from './wire.ts'
import { fetchGoUsage } from './fetch.ts'
import type { GoUsageResponse } from './types.ts'

export * from './types.ts'
export { buildUsageCommand, fetchGoUsage, runUsageFetch, POWERSHELL_EXE } from './fetch.ts'
export type { GoUsageSubprocess } from './fetch.ts'
export { isTrustedApiRequest } from './trust-fence.ts'
export { writeError, writeJson } from './wire.ts'
export type { GoUsageWebRoute, GoUsageWebServer, GoUsageLoader } from './context-types.ts'

/** Plugin identity for cordis.yml rows. */
export const name = 'dsh-go-usage'

/** Services required before mounting: the webserver routes and the loader's connection row. */
export const inject = ['webServer', 'loader']

/** The plugin's fenced JSON API path. */
export const API_PATH = '/go-usage/api'

/** Default location of the opencode auth file, relative to the user profile dir. */
export const DEFAULT_AUTH_SUBPATH = '.local/share/opencode/auth.json'

/** The connection row's resolved trustedHosts (live read; the /api fence's own list). */
function trustedHostsOf(ctx: Context): string[] {
  for (const entry of ctx.loader.entries()) {
    if (entry.options.name === 'connection') {
      const config = entry.options.config as { trustedHosts?: string[] } | undefined
      return config?.trustedHosts ?? []
    }
  }
  return []
}

/** The user profile directory, from the environment. */
function userProfileDir(): string {
  const value = process.env.USERPROFILE ?? process.env.HOME
  if (value === undefined || value === '') {
    throw new Error('dsh-go-usage: USERPROFILE/HOME is unset — cannot locate the opencode auth.json')
  }
  return value
}

/** Plugin body. */
export function apply(ctx: Context): void {
  // Read the connection row's trustedHosts live on every request so config
  // changes are honored without a plugin reload (matches the /api fence).
  const fence = (req: Parameters<typeof isTrustedApiRequest>[0]): boolean =>
    isTrustedApiRequest(req, trustedHostsOf(ctx))

  const subprocess = ctx.get('subprocess') as
    | import('./fetch.ts').GoUsageSubprocess
    | undefined
  if (subprocess === undefined) {
    throw new Error('dsh-go-usage: the subprocess service is not mounted; the usage fetch cannot run')
  }

  let authJsonPath: string
  try {
    authJsonPath = `${userProfileDir().replaceAll('\\', '/')}/${DEFAULT_AUTH_SUBPATH}`
  } catch (error) {
    throw error
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: API_PATH,
    handler: (req, res) => {
      if (req.method !== 'GET' && req.method !== 'POST') {
        writeError(res, 405, 'method-not-allowed', 'only GET/POST is supported')
        return
      }
      if (!fence(req)) {
        writeError(res, 403, 'forbidden', 'untrusted Host header')
        return
      }
      const pathname = new URL(req.url ?? '/', 'http://x').pathname
      if (pathname !== API_PATH && pathname !== `${API_PATH}/usage`) {
        writeError(res, 404, 'not-found', 'unknown go-usage API method')
        return
      }
      void fetchGoUsage(subprocess, authJsonPath).then(
        (result: GoUsageResponse) => writeJson(res, 200, result),
        (error: unknown) => writeError(res, 500, 'internal', error instanceof Error ? error.message : String(error)),
      )
    },
  }), 'dsh-go-usage: api route')
}
