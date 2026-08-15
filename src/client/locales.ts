/**
 * Locale dictionaries under the `goUsage` namespace. The widget translates
 * through the pure `translate()` helper driven by the locale service snapshot
 * it already holds, so copy always follows the active DSH locale without
 * module-level state.
 * @module dsh-go-usage/client/locales
 */

export const LOCALE_NS = 'goUsage'

export const zh: Record<string, string> = {
  title: 'OpenCode GO 用量',
  rolling: '滚动用量',
  weekly: '每周用量',
  monthly: '每月用量',
  resetsIn: '重置于',
  day: '天',
  hours: '小时',
  hour: '小时',
  minutes: '分钟',
  minute: '分钟',
  fewSeconds: '几秒',
  refresh: '刷新',
  collapse: '收起',
  expand: '展开 OpenCode GO 用量',
  loading: '加载中…',
  unavailable: '用量数据不可用',
}

export const en: Record<string, string> = {
  title: 'OpenCode GO Usage',
  rolling: 'Rolling usage',
  weekly: 'Weekly usage',
  monthly: 'Monthly usage',
  resetsIn: 'Resets in',
  day: 'day',
  days: 'days',
  hour: 'hour',
  hours: 'hours',
  minute: 'minute',
  minutes: 'minutes',
  fewSeconds: 'a few seconds',
  refresh: 'Refresh',
  collapse: 'Collapse',
  expand: 'Expand OpenCode GO usage',
  loading: 'Loading…',
  unavailable: 'Usage data unavailable',
}

/**
 * Translate one dictionary key for a locale id ('zh' | 'en').
 * @param localeId - the active locale id.
 * @param key - the dictionary key.
 * @returns the translated text, or the key itself when missing (fail loud in
 *   the UI rather than blank).
 */
export function translate(localeId: string, key: string): string {
  const dict = localeId === 'en' ? en : zh
  return dict[key] ?? key
}
