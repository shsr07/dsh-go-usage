/**
 * Client half of dsh-go-usage: registers the OpenCode GO usage corner widget
 * into the frame overlay (`shell.overlay`). The widget renders the three
 * usage buckets from the plugin's fenced `/go-usage/api/usage` route and
 * follows the DSH locale (zh / en).
 * @module dsh-go-usage/client
 */

import { createElement } from 'react'
import type { Context } from './context.ts'
import { LOCALE_NS, translate, zh, en } from './locales.ts'
import { GoUsageWidget } from './GoUsageWidget.tsx'

/** Services required before mounting (provided by the client runtime). */
export const inject = ['slots', 'locale']

/**
 * Client plugin body.
 * @param ctx - the client cordis context (slots, locale).
 */
export function apply(ctx: Context): void {
  ctx.effect(() => {
    const offZh = ctx.locale.register(LOCALE_NS, 'zh', zh)
    const offEn = ctx.locale.register(LOCALE_NS, 'en', en)
    return () => { offZh(); offEn() }
  }, 'dsh-go-usage: dictionaries')

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'go-usage',
    order: 200,
    label: () => translate(ctx.locale.getSnapshot().active, 'title'),
    inject: () => ({ locale: ctx.locale }),
  }, GoUsageWidget))
}
