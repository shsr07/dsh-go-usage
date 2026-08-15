/**
 * Client-side structural service mirrors (slots), same containment strategy
 * as dsh-usage-lens: third-party bundles cannot rely on the upstream
 * augmentations reaching their Context, so only the slices this plugin
 * touches are restated.
 * @module dsh-go-usage/client/context
 */

import type { Context } from '@deepseek-ai/cordis'

/** Registration options passed to `ctx.slots.register` (subset of the real options). */
export interface GoUsageSlotRegisterOptions {
  name: string
  key?: string
  id?: string
  order?: number
  label?: string | (() => string)
  locale?: string
  registrant?: string
  /** Business-face factory; args depend on the slot scope. */
  inject?: (...args: unknown[]) => Record<string, unknown>
  children?: Record<string, unknown>
}

/** The client slots service face (register returns the disposer). */
export interface GoUsageSlotsService {
  register(options: GoUsageSlotRegisterOptions, component: unknown): () => void
  /** Run a callback for each declaration lifetime of a slot (a no-op while
   *  the slot is undeclared). */
  inject(key: string, callback: () => () => void): () => void
}

/** Immutable locale snapshot (mirror of the locale service's LocaleSnapshot). */
export interface GoUsageLocaleSnapshot {
  /** Active locale id ('zh' | 'en'). */
  active: string
  /** Selectable locales in display order. */
  locales: readonly { id: string; label: string }[]
  /** Monotonic change counter (registry or active changes). */
  revision: number
}

/** The client locale service face (@deepseek-ai/dsh-client-locale). */
export interface GoUsageLocaleService {
  /** Current immutable locale snapshot. */
  getSnapshot(): GoUsageLocaleSnapshot
  /** Subscribe to snapshot changes; returns the disposer. */
  subscribe(fn: () => void): () => void
  /** Register one locale's dictionary for a namespace; returns the disposer. */
  register(ns: string, locale: string, dict: Record<string, string>): () => void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    slots: GoUsageSlotsService
    locale: GoUsageLocaleService
  }
}

export type { Context }
