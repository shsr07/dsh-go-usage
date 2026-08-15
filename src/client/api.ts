/**
 * Typed fetch wrapper over the plugin's fenced JSON API.
 * @module dsh-go-usage/client/api
 */

import type { GoUsageResponse } from '../types.ts'

/** One wire failure. */
export class GoUsageApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

async function call(signal?: AbortSignal): Promise<GoUsageResponse> {
  let response: Response
  try {
    response = await fetch('/go-usage/api/usage', {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal,
    })
  } catch (error) {
    throw new GoUsageApiError('network', error instanceof Error ? error.message : String(error))
  }
  const parsed: GoUsageResponse | { error?: { code?: string; message?: string } } | null
    = await response.json().catch(() => null)
  if (!response.ok || parsed === null || typeof parsed !== 'object') {
    const err = (parsed as { error?: { code?: string; message?: string } } | null)?.error
    throw new GoUsageApiError(err?.code ?? 'http', err?.message ?? `HTTP ${response.status}`)
  }
  return parsed as GoUsageResponse
}

/** The go-usage API surface. */
export const api = {
  usage: (signal?: AbortSignal) => call(signal),
}
