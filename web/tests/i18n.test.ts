import { afterEach, describe, expect, it } from 'vitest'

import { en } from '../src/i18n/en.js'
import { vi } from '../src/i18n/vi.js'

import { getLang, setLang, t } from '../src/i18n/index.js'
import { LANDING_ORDER } from '../src/presets/index.js'

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

  it('mode keys exist in both languages (Task 7 explore/advanced toggle)', () => {
    for (const dict of [vi, en]) {
      for (const key of ['mode.explore', 'mode.advanced', 'mode.switchHint']) {
        expect(dict[key], key).toBeTruthy()
      }
    }
    // The hint names the target mode via a '{mode}' placeholder filled in
    // App.svelte — every language must keep exactly that placeholder.
    expect(vi['mode.switchHint']).toContain('{mode}')
    expect(en['mode.switchHint']).toContain('{mode}')
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

describe('preset narration (Task 9)', () => {
  it('every preset has title/teaser/card in both languages; card 3-5 lines; teaser one short line', () => {
    for (const dict of [vi, en]) {
      for (const id of LANDING_ORDER) {
        const title = dict[`preset.${id}.title`]
        expect(title, `preset.${id}.title`).toBeTruthy()

        const teaser = dict[`preset.${id}.teaser`]
        expect(teaser, `preset.${id}.teaser`).toBeTruthy()
        expect(teaser!.length, `preset.${id}.teaser`).toBeLessThanOrEqual(80)
        expect(teaser!.split('\n')).toHaveLength(1)

        const lines = dict[`preset.${id}.card`]?.split('\n') ?? []
        expect(lines.length, `preset.${id}.card`).toBeGreaterThanOrEqual(3)
        expect(lines.length, `preset.${id}.card`).toBeLessThanOrEqual(5)
        for (const line of lines) {
          expect(line.trim().length, `preset.${id}.card`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('vi preset titles are pinned by the launch spec', () => {
    expect(vi['preset.double-slit.title']).toBe('Khe kép')
    expect(vi['preset.tunneling.title']).toBe('Xuyên hầm')
    expect(vi['preset.free-packet.title']).toBe('Gói sóng tự do')
    expect(vi['preset.harmonic.title']).toBe('Dao động điều hòa')
    expect(vi['preset.sandbox.title']).toBe('Tự do khám phá')
  })

  it('vi and en cards agree on line count (parallel narration)', () => {
    for (const id of LANDING_ORDER) {
      expect(vi[`preset.${id}.card`].split('\n')).toHaveLength(
        en[`preset.${id}.card`].split('\n').length,
      )
    }
  })
})
