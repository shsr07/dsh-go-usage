/**
 * Trust fence for the plugin's fenced JSON route: answers only requests whose
 * Host header names the local server (loopback) or a host the connection row
 * explicitly trusted. This mirrors the /api gateway's fence so a cross-site
 * page can never reach the route.
 * @module dsh-go-usage/trust-fence
 */

import type { IncomingMessage } from 'node:http'

/** Loopback host literals the local server binds or is reached as. */
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost', '[::1]'])

/**
 * Whether one request's Host header is a trusted authority.
 * @param req - the incoming request.
 * @param trustedHosts - extra authorities from the connection row.
 * @returns true when the Host header is loopback or explicitly trusted.
 */
export function isTrustedApiRequest(
  req: IncomingMessage,
  trustedHosts: readonly string[],
): boolean {
  const hostHeader = req.headers.host
  if (typeof hostHeader !== 'string') return false
  const rawHost = hostHeader.trim()
  const host = rawHost.startsWith('[')
    ? rawHost.slice(0, rawHost.indexOf(']') + 1)
    : (rawHost.split(':')[0] ?? rawHost)
  const normalized = host.toLowerCase()
  if (LOOPBACK_HOSTS.has(normalized)) return true
  return trustedHosts.some(entry => entry.toLowerCase() === normalized)
}
