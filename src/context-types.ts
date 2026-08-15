/**
 * Structural types for the cordis services this plugin consumes, plus the
 * Context augmentation. A third-party plugin resolves outside the DSH
 * monorepo's single cordis instance, so the upstream `declare module`
 * augmentations do not reach this Context — the members below mirror the
 * actual runtime shapes this plugin touches (the same containment strategy as
 * dsh-usage-lens).
 * @module dsh-go-usage/context-types
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'

/** One named webserver route (mirror of the host-webserver WebRoute). */
export interface GoUsageWebRoute {
  kind: 'exact' | 'prefix'
  path: string
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

/** The webServer service face this plugin uses. */
export interface GoUsageWebServer {
  register(route: GoUsageWebRoute): () => void
}

/** One loader entry's options slice (the connection row's resolved config). */
export interface GoUsageLoaderEntry {
  options: { name: string; config?: unknown }
}

/** The loader face used to read the connection row's trustedHosts config. */
export interface GoUsageLoader {
  entries(): Iterable<GoUsageLoaderEntry>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    webServer: GoUsageWebServer
    loader: GoUsageLoader
    /** Register a lifecycle callback (DSH-vendored cordis): runs at plugin
     *  activation; its returned cleanup runs at disposal. */
    effect(fn: () => void | (() => void), label?: string): void
  }
}

export type { Context }
