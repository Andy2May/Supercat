import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import { en } from '../src/i18n/en.js'
import { vi } from '../src/i18n/vi.js'

import { GLOSSARY } from '../src/i18n/glossary.js'
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

describe('glossary (Task 15)', () => {
  // The exact key set is pinned: adding or removing a term is a product
  // decision that must update this list (and the physics audit in T19).
  const GLOSSARY_KEYS = [
    'density',
    'phase',
    'norm',
    'mx',
    'my',
    'sigma',
    'sigmaProduct',
    'momentumSpace',
    'energy',
    'energyJump',
    'k',
    'tunneling',
    'collapse',
  ]

  it('GLOSSARY has exactly the pinned 13-key set', () => {
    expect(Object.keys(GLOSSARY).sort()).toEqual([...GLOSSARY_KEYS].sort())
  })

  it('every entry has non-empty vi and en copy, at most 2 sentences each', () => {
    for (const [key, entry] of Object.entries(GLOSSARY)) {
      for (const lang of ['vi', 'en'] as const) {
        expect(entry[lang], `${key}.${lang}`).toBeTruthy()
        // The brief caps entries at two sentences (everyday first,
        // optional technical second). Count sentence-ending punctuation
        // rather than splitting — a final "(... Born)." would otherwise
        // produce a phantom ')' fragment.
        const enders = entry[lang].match(/[.!?]/g) ?? []
        expect(enders.length, `${key}.${lang}`).toBeLessThanOrEqual(2)
      }
    }
  })

  it('every Term key="..." used in the wired components resolves in GLOSSARY', () => {
    // Static scan of the components that import Term (hardcoded by design —
    // the brief keeps this a simple string scan, not a module graph walk).
    const termFiles = [
      'src/ui/ObservablesBar.svelte',
      'src/ui/ViewToggle.svelte',
    ]
    const root = join(dirname(fileURLToPath(import.meta.url)), '..')
    const used = new Set<string>()
    for (const file of termFiles) {
      const source = readFileSync(join(root, file), 'utf8')
      for (const match of source.matchAll(/<Term\s+key="([a-zA-Z]+)"/g)) {
        used.add(match[1])
      }
    }
    expect(used.size).toBeGreaterThan(0)
    for (const key of used) {
      expect(GLOSSARY[key], `Term key="${key}"`).toBeDefined()
    }
  })
})
