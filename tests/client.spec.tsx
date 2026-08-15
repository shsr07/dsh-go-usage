// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatReset, GoUsageWidget } from '../src/client/GoUsageWidget.tsx'
import type { GoUsageLocaleService } from '../src/client/context.ts'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const OK_RESPONSE = {
  ok: true,
  usage: {
    rolling: { status: 'ok', percent: 6, resetsAt: '2026-08-15T11:57:51.401Z' },
    weekly: { status: 'ok', percent: 10, resetsAt: '2026-08-17T00:00:00.401Z' },
    monthly: { status: 'rate-limited', percent: 100, resetsAt: '2026-09-14T04:39:32.401Z' },
  },
}

/** A minimal locale service with a switchable active locale. */
function stubLocale(active = 'zh'): { service: GoUsageLocaleService; setActive: (id: string) => void } {
  const listeners = new Set<() => void>()
  let current = active
  return {
    service: {
      getSnapshot: () => ({ active: current, locales: [], revision: 0 }),
      subscribe: (fn: () => void) => {
        listeners.add(fn)
        return () => { listeners.delete(fn) }
      },
      register: () => () => {},
    },
    setActive: (id: string) => {
      current = id
      for (const fn of listeners) fn()
    },
  }
}

function stubFetch(response: unknown) {
  vi.stubGlobal('fetch', vi.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(response),
    })))
}

describe('formatReset', () => {
  it('formats days and hours in zh', () => {
    expect(formatReset('zh', '2026-08-17T00:00:00.000Z', Date.parse('2026-08-15T08:25:00.000Z'))).toBe('1 天 15 小时')
  })

  it('formats hours and minutes in zh', () => {
    expect(formatReset('zh', '2026-08-15T12:07:00.000Z', Date.parse('2026-08-15T08:25:00.000Z'))).toBe('3 小时 42 分钟')
  })

  it('formats minutes in zh', () => {
    expect(formatReset('zh', '2026-08-15T08:42:00.000Z', Date.parse('2026-08-15T08:25:00.000Z'))).toBe('17 分钟')
  })

  it('formats a near reset as few seconds in zh', () => {
    expect(formatReset('zh', '2026-08-15T08:25:30.000Z', Date.parse('2026-08-15T08:25:00.000Z'))).toBe('几秒')
  })

  it('clamps an already-past reset to zero', () => {
    expect(formatReset('zh', '2026-08-15T08:00:00.000Z', Date.parse('2026-08-15T08:25:00.000Z'))).toBe('几秒')
  })

  it('formats days and hours in en', () => {
    expect(formatReset('en', '2026-08-17T00:00:00.000Z', Date.parse('2026-08-15T08:25:00.000Z'))).toBe('1 day 15 hours')
  })

  it('uses plural units in en', () => {
    expect(formatReset('en', '2026-08-15T12:07:00.000Z', Date.parse('2026-08-15T08:25:00.000Z'))).toBe('3 hours 42 minutes')
    expect(formatReset('en', '2026-08-15T08:42:00.000Z', Date.parse('2026-08-15T08:25:00.000Z'))).toBe('17 minutes')
    expect(formatReset('en', '2026-08-15T08:25:30.000Z', Date.parse('2026-08-15T08:25:00.000Z'))).toBe('a few seconds')
  })
})

describe('GoUsageWidget', () => {
  it('fetches on mount and shows the three buckets in zh', async () => {
    stubFetch(OK_RESPONSE)
    render(<GoUsageWidget locale={stubLocale('zh').service} />)
    expect(await screen.findByText('滚动用量')).toBeTruthy()
    expect(screen.getByText('每周用量')).toBeTruthy()
    expect(screen.getByText('每月用量')).toBeTruthy()
    expect(screen.getByText('6%')).toBeTruthy()
    expect(screen.getByText('10%')).toBeTruthy()
    expect(screen.getByText('100%')).toBeTruthy()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('shows English copy in en locale', async () => {
    stubFetch(OK_RESPONSE)
    render(<GoUsageWidget locale={stubLocale('en').service} />)
    expect(await screen.findByText('Rolling usage')).toBeTruthy()
    expect(screen.getByText('Weekly usage')).toBeTruthy()
    expect(screen.getByText('Monthly usage')).toBeTruthy()
    expect(screen.getByTitle('Refresh')).toBeTruthy()
    expect(screen.getByTitle('Collapse')).toBeTruthy()
  })

  it('switches copy live when the locale changes', async () => {
    stubFetch(OK_RESPONSE)
    const { service, setActive } = stubLocale('zh')
    render(<GoUsageWidget locale={service} />)
    expect(await screen.findByText('滚动用量')).toBeTruthy()
    setActive('en')
    expect(await screen.findByText('Rolling usage')).toBeTruthy()
  })

  it('shows the failure reason when the fetch fails', async () => {
    stubFetch({ ok: false, error: 'usage fetch failed: boom' })
    render(<GoUsageWidget locale={stubLocale('zh').service} />)
    expect(await screen.findByText(/boom/)).toBeTruthy()
  })

  it('shows a network error when the fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('wire down'))))
    render(<GoUsageWidget locale={stubLocale('zh').service} />)
    expect(await screen.findByText('wire down')).toBeTruthy()
  })

  it('collapses to the right-edge tab and expands back on click', async () => {
    stubFetch(OK_RESPONSE)
    render(<GoUsageWidget locale={stubLocale('zh').service} />)
    await screen.findByText('滚动用量')
    fireEvent.click(screen.getByTitle('收起'))
    const tab = screen.getByTitle('展开 OpenCode GO 用量')
    expect(tab).toBeTruthy()
    fireEvent.click(tab)
    expect(screen.getByTitle('收起')).toBeTruthy()
  })

  it('refreshes on the manual refresh button', async () => {
    stubFetch(OK_RESPONSE)
    render(<GoUsageWidget locale={stubLocale('zh').service} />)
    await screen.findByText('滚动用量')
    fireEvent.click(screen.getByTitle('刷新'))
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
