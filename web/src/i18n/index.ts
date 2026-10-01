/**
 * Minimal i18n: a language store plus a `t(key, params?)` lookup against the
 * active flat dictionary. All UI strings go through keys — components never
 * hard-code labels. `vi` and `en` share an identical key set; a missing key
 * falls back to the other language, then to the key itself (visible, never
 * silent). Values may carry `{name}` placeholders filled from `params`.
 */
import { get, writable } from 'svelte/store'

import { en } from './en.js'
import { vi } from './vi.js'

export type Lang = 'vi' | 'en'

const dictionaries: Record<Lang, Record<string, string>> = { vi, en }

/** `navigator.language` starting with "vi" picks Vietnamese; anything else English. */
function initialLang(): Lang {
  const nav = typeof navigator !== 'undefined' ? navigator.language : undefined
  return nav !== undefined && nav.toLowerCase().startsWith('vi') ? 'vi' : 'en'
}

/** Reactive language store — subscribe (or use `getLang`) to track changes. */
export const lang = writable<Lang>(initialLang())

export function getLang(): Lang {
  return get(lang)
}

export function setLang(next: Lang): void {
  lang.set(next)
}

/**
 * Replace EVERY `{name}` occurrence of each provided param with
 * `String(param)`. A placeholder whose param is absent stays as-is; a param
 * with no matching placeholder is a no-op. Split/join (not String.replace) so
 * replacement values containing `$` or `{}` can never be reinterpreted.
 */
function fill(template: string, params?: Record<string, string | number>): string {
  if (params === undefined) return template
  let result = template
  for (const [name, value] of Object.entries(params)) {
    result = result.split(`{${name}}`).join(String(value))
  }
  return result
}

export function t(key: string, params?: Record<string, string | number>): string {
  const active = getLang()
  const hit = dictionaries[active][key]
  if (hit !== undefined) return fill(hit, params)
  const fallback = dictionaries[active === 'vi' ? 'en' : 'vi'][key]
  return fallback !== undefined ? fill(fallback, params) : key
}
