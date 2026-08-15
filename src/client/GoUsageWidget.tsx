/**
 * The OpenCode GO usage widget: a bottom-right overlay card showing the
 * rolling/weekly/monthly usage buckets with progress bars and reset
 * countdowns, collapsible to a right-edge vertical tab. Copy follows the DSH
 * locale (zh / en) through the injected locale service. All interaction state
 * is component-local.
 * @module dsh-go-usage/client/widget
 */

import { createElement, useEffect, useState, type ReactNode } from 'react'
import type { GoUsageResponse } from '../types.ts'
import { api } from './api.ts'
import { translate } from './locales.ts'
import type { GoUsageLocaleService } from './context.ts'
import css from './GoUsageWidget.module.css'

/** Data refresh cadence in milliseconds. */
const REFRESH_MS = 60_000
/** Countdown tick cadence in milliseconds. */
const TICK_MS = 15_000

/** One usage bucket's display data. */
interface BucketView {
  readonly label: string
  readonly percent: number
  readonly resetsAt: string
}

/**
 * Format a reset countdown in the active locale: zh "X 天 Y 小时" /
 * "X 小时 Y 分钟" / "X 分钟" / "几秒", en "X days Y hours" / "X hours Y
 * minutes" / "X minutes" / "a few seconds".
 * @param localeId - the active locale id ('zh' | 'en').
 * @param resetsAt - ISO timestamp of the next reset.
 * @param now - current epoch milliseconds.
 * @returns the human-readable remaining time.
 */
export function formatReset(localeId: string, resetsAt: string, now: number): string {
  const en = localeId === 'en'
  const unit = (key: string): string => translate(localeId, key)
  const seconds = Math.max(0, Math.floor((new Date(resetsAt).getTime() - now) / 1000))
  const days = Math.floor(seconds / 86400)
  if (days >= 1) {
    const hours = Math.floor((seconds % 86400) / 3600)
    return en
      ? `${days} ${unit(days === 1 ? 'day' : 'days')} ${hours} ${unit(hours === 1 ? 'hour' : 'hours')}`
      : `${days} ${unit('day')} ${hours} ${unit('hour')}`
  }
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours >= 1) {
    return en
      ? `${hours} ${unit(hours === 1 ? 'hour' : 'hours')} ${minutes} ${unit(minutes === 1 ? 'minute' : 'minutes')}`
      : `${hours} ${unit('hour')} ${minutes} ${unit('minute')}`
  }
  if (minutes === 0) return unit('fewSeconds')
  return en
    ? `${minutes} ${unit(minutes === 1 ? 'minute' : 'minutes')}`
    : `${minutes} ${unit('minute')}`
}

/**
 * One usage row: label, percent, progress bar, and reset countdown.
 * @param props - the bucket view, the active locale id, and the countdown anchor.
 * @returns the row element.
 */
function UsageRow(props: { bucket: BucketView; localeId: string; now: number }): ReactNode {
  const { bucket, localeId, now } = props
  const fill = Math.min(100, Math.max(0, bucket.percent))
  const barClass = bucket.percent >= 100 ? css.danger : bucket.percent >= 80 ? css.warn : css.fill
  return createElement('div', { className: css.row },
    createElement('div', { className: css.rowTop },
      createElement('span', { className: css.label }, bucket.label),
      createElement('span', { className: css.pct }, `${bucket.percent}%`),
    ),
    createElement('div', { className: css.bar },
      createElement('div', { className: barClass, style: { width: `${fill}%` } }),
    ),
    createElement('div', { className: css.reset }, translate(localeId, 'resetsIn'), ' ', formatReset(localeId, bucket.resetsAt, now)),
  )
}

/** The widget's injected face. */
export interface GoUsageWidgetProps {
  /** The DSH locale service (bound in apply's slot inject face). */
  locale: GoUsageLocaleService
}

/**
 * The usage widget rendered in the frame overlay.
 * @param props - the injected locale service.
 * @returns the widget element (expanded card or collapsed tab).
 */
export function GoUsageWidget({ locale }: GoUsageWidgetProps): ReactNode {
  const [collapsed, setCollapsed] = useState(false)
  const [usage, setUsage] = useState<GoUsageResponse | null>(null)
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [localeId, setLocaleId] = useState(() => locale.getSnapshot().active)

  // Follow the active locale: re-render on every snapshot change.
  useEffect(() => locale.subscribe(() => setLocaleId(locale.getSnapshot().active)), [locale])

  useEffect(() => {
    const controller = new AbortController()
    let inFlight = false
    const load = (): void => {
      if (inFlight) return
      inFlight = true
      api.usage(controller.signal).then(
        (result) => {
          setUsage(result)
          setError(result.ok ? '' : result.error)
        },
        (reason: unknown) => {
          if (controller.signal.aborted) return
          setUsage(null)
          setError(reason instanceof Error ? reason.message : String(reason))
        },
      ).finally(() => {
        inFlight = false
      })
    }
    load()
    const refresh = setInterval(load, REFRESH_MS)
    const tick = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => {
      controller.abort()
      clearInterval(refresh)
      clearInterval(tick)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load closes over stable setters only.
  }, [])

  const refreshNow = (): void => {
    api.usage().then(
      (result) => {
        setUsage(result)
        setError(result.ok ? '' : result.error)
      },
      (reason: unknown) => {
        setUsage(null)
        setError(reason instanceof Error ? reason.message : String(reason))
      },
    )
  }

  if (collapsed) {
    return createElement('div', { className: css.tab, onClick: () => setCollapsed(false), title: translate(localeId, 'expand') },
      '‹ ', translate(localeId, 'title'),
    )
  }

  const buckets: BucketView[] = usage !== null && usage.ok
    ? [
        { label: translate(localeId, 'rolling'), percent: usage.usage.rolling.percent, resetsAt: usage.usage.rolling.resetsAt },
        { label: translate(localeId, 'weekly'), percent: usage.usage.weekly.percent, resetsAt: usage.usage.weekly.resetsAt },
        { label: translate(localeId, 'monthly'), percent: usage.usage.monthly.percent, resetsAt: usage.usage.monthly.resetsAt },
      ]
    : []

  const children: ReactNode[] = [
    createElement('div', { key: 'head', className: css.head },
      createElement('span', { className: css.title }, translate(localeId, 'title')),
      createElement('span', { className: css.spacer }),
      createElement('button', { type: 'button', className: css.btn, title: translate(localeId, 'refresh'), onClick: refreshNow }, '↻'),
      createElement('button', { type: 'button', className: css.btn, title: translate(localeId, 'collapse'), onClick: () => setCollapsed(true) }, '»'),
    ),
  ]

  if (usage === null && error === '') {
    children.push(createElement('div', { key: 'loading', className: css.loading }, translate(localeId, 'loading')))
  } else if (usage === null || !usage.ok) {
    children.push(createElement('div', { key: 'error', className: css.error }, error || translate(localeId, 'unavailable')))
  } else {
    for (const bucket of buckets) {
      children.push(createElement(UsageRow, { key: bucket.label, bucket, localeId, now }))
    }
  }

  return createElement('div', { className: css.widget }, children)
}
