/**
 * Small JSON wire helpers for the plugin's fenced route.
 * @module dsh-go-usage/wire
 */

import type { ServerResponse } from 'node:http'

/** The route's JSON error envelope. */
export interface GoUsageWireError {
  readonly error: {
    readonly code: string
    readonly message: string
  }
}

/**
 * Write a JSON response with the standard headers.
 * @param res - the server response.
 * @param status - HTTP status code.
 * @param body - the JSON-serializable body.
 */
export function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(payload)
}

/**
 * Write an error envelope.
 * @param res - the server response.
 * @param status - HTTP status code.
 * @param code - machine-routable error code.
 * @param message - human-readable message.
 */
export function writeError(res: ServerResponse, status: number, code: string, message: string): void {
  writeJson(res, status, { error: { code, message } } satisfies GoUsageWireError)
}
