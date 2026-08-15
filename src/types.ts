/**
 * Shared payload vocabulary for dsh-go-usage.
 * @module dsh-go-usage/types
 */

/** One usage bucket's snapshot as analyzed by the OpenCode console. */
export interface GoUsageEntry {
  /** Whether the bucket is below its limit or rate-limited at 100%. */
  readonly status: 'ok' | 'rate-limited'
  /** Usage as a whole percentage, 0–100. */
  readonly percent: number
  /** ISO timestamp of the bucket's next reset. */
  readonly resetsAt: string
}

/** The three usage buckets of one OpenCode GO subscription. */
export interface GoUsage {
  /** Rolling-window usage (5-hour window on OpenCode GO). */
  readonly rolling: GoUsageEntry
  /** Weekly usage. */
  readonly weekly: GoUsageEntry
  /** Monthly usage. */
  readonly monthly: GoUsageEntry
}

/** Successful usage fetch. */
export interface GoUsageOk {
  readonly ok: true
  /** The three usage buckets. */
  readonly usage: GoUsage
}

/** Failed usage fetch, with a human-readable reason. */
export interface GoUsageError {
  readonly ok: false
  /** What went wrong (missing key, network failure, bad response, …). */
  readonly error: string
}

/** Result of one usage fetch. */
export type GoUsageResponse = GoUsageOk | GoUsageError

/** The plugin's fenced JSON API envelope. */
export type GoUsageApiResponse = GoUsageResponse
