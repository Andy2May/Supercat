import { afterEach, describe, expect, it } from 'vitest'

import { en } from '../src/i18n/en.js'
import { vi } from '../src/i18n/vi.js'

import { getLang, setLang, t } from '../src/i18n/index.js'

describe('i18n', () => {
  afterEach(() => {
    setLang('en')
  })

  it('vi and en dictionaries are flat with identical key sets', () => {
    expect(Object.keys(vi).sort()).toEqual(Object.keys(en).sort())
    for (const dict of [vi, en]) {
      for (const value of Object.values(dict)) {
        expect(typeof value).toBe('string')
      }
    }
  })

  it('t() reads the active dictionary and setLang switches it', () => {
    setLang('vi')
    expect(getLang()).toBe('vi')
    expect(t('app.title')).toBe(vi['app.title'])
    setLang('en')
    expect(getLang()).toBe('en')
    expect(t('app.title')).toBe(en['app.title'])
  })

  it('unknown keys fall back to the key itself', () => {
    setLang('en')
    expect(t('no.such.key')).toBe('no.such.key')
  })
})
