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

describe('t(key, params) interpolation (redesign Task 3)', () => {
  afterEach(() => {
    setLang('en')
  })

  it('fills each {name} placeholder with String(param)', () => {
    setLang('vi')
    expect(t('scene.label', { name: 'Khe kép' })).toBe('THÍ NGHIỆM · Khe kép')
    setLang('en')
    expect(t('scene.label', { name: 'Double slit' })).toBe('EXPERIMENT · Double slit')
  })

  it('replaces the three former manual .replace call sites', () => {
    setLang('vi')
    expect(t('mode.switchHint', { mode: 'Explore' })).toBe('Chuyển sang Explore')
    expect(t('legend.v0', { v: 3.5 })).toBe('max|V| ≈ 3.5')
    expect(t('measure.resultMomentum', { x: '1.20', y: '-0.50' })).toBe('Đo k = (1.20, -0.50)')
    setLang('en')
    expect(t('mode.switchHint', { mode: t('mode.advanced') })).not.toContain('{mode}')
  })

  it('a missing param leaves its placeholder untouched', () => {
    setLang('en')
    expect(t('measure.resultPosition')).toBe('Measured at ({x}, {y})')
    expect(t('measure.resultPosition', { x: '1.00' })).toBe('Measured at (1.00, {y})')
  })

  it('params without a matching placeholder are ignored without error', () => {
    setLang('en')
    expect(t('app.title', { unused: 'x' })).toBe(en['app.title'])
  })

  it('numeric params are stringified', () => {
    setLang('en')
    expect(t('legend.v0', { v: 12 })).toBe('max|V| ≈ 12')
  })

  it('every occurrence of a placeholder is replaced, not just the first', () => {
    // No shipped value repeats a placeholder, so pin the all-occurrences
    // semantics with a scratch key (added to BOTH dictionaries so the parity
    // invariant holds even mid-test, removed afterwards).
    const key = '__test.repeat__'
    vi[key] = en[key] = 'a {x} b {x} c'
    try {
      setLang('vi')
      expect(t(key, { x: 'X' })).toBe('a X b X c')
    } finally {
      delete vi[key]
      delete en[key]
    }
  })

  it('unknown keys still return the key itself, params notwithstanding', () => {
    setLang('en')
    expect(t('no.such.key', { x: 1 })).toBe('no.such.key')
  })
})

describe('redesign keys (redesign Task 3, Appendix A draft copy)', () => {
  it('rail section labels exist in both languages', () => {
    expect(vi['rail.tools']).toBe('CÔNG CỤ')
    expect(en['rail.tools']).toBe('TOOLS')
    expect(vi['rail.briefing']).toBe('THUYẾT MINH')
    expect(en['rail.briefing']).toBe('BRIEFING')
    expect(vi['rail.readouts']).toBe('ĐỌC SỐ')
    expect(en['rail.readouts']).toBe('READOUTS')
    expect(vi['rail.view']).toBe('HIỂN THỊ')
    expect(en['rail.view']).toBe('VIEW')
    // Field colormap legend (on-canvas chip): inferno ramp endpoint words
    // (relative scale — auto-exposure normalizes every frame) + caption and
    // the phase variant's brightness note. −π/+π stay mono symbols, not
    // keys; the captions are WORDS (user ruling 2026-10-02: "ghi hẳn xác
    // suất", not the |ψ|² symbol — the chip is for people who don't know
    // psi yet). Endpoint words CAPITALIZED (same ruling: đồng bộ with
    // Xác suất / Rào / Giếng).
    expect(vi['legend.low']).toBe('Thấp')
    expect(en['legend.low']).toBe('Low')
    expect(vi['legend.high']).toBe('Cao')
    expect(en['legend.high']).toBe('High')
    expect(vi['legend.densityCaption']).toBe('Xác suất')
    expect(en['legend.densityCaption']).toBe('Probability')
    expect(vi['legend.momentumCaption']).toBe('Xác suất động lượng')
    expect(en['legend.momentumCaption']).toBe('Momentum probability')
    // V-legend shape notes (user ruling 2026-10-02: Rào/Giếng must explain
    // what they are and what they DO to the sim — one plain sentence each).
    expect(vi['legend.barrierNote']).toBe('Tường năng lượng — sóng yếu hơn bị bật lại')
    expect(en['legend.barrierNote']).toBe('Energy wall — weaker waves bounce back')
    expect(vi['legend.wellNote']).toBe('Hố năng lượng — hút sóng vào và giữ lại')
    expect(en['legend.wellNote']).toBe('Energy dip — pulls the wave in and traps it')
    expect(vi['legend.phaseNote']).toBe('độ sáng = xác suất')
    expect(en['legend.phaseNote']).toBe('brightness = probability')
  })

  it('scene label carries the {name} template', () => {
    expect(vi['scene.label']).toBe('THÍ NGHIỆM · {name}')
    expect(en['scene.label']).toBe('EXPERIMENT · {name}')
  })

  it('landing hero copy matches the Supercat draft', () => {
    expect(vi['landing.kicker']).toBe('CON MÈO NỔI TIẾNG NHẤT VẬT LÝ CHƯA TỪNG TỒN TẠI')
    expect(en['landing.kicker']).toBe('THE MOST FAMOUS CAT IN PHYSICS NEVER EXISTED')
    // One key holding both hero lines separated by a literal newline; the
    // landing component renders it as split('\n'), like PresetCard cards.
    expect(vi['landing.title']).toBe('Đừng hỏi mèo sống hay chết.\nHỏi xác suất.')
    expect(en['landing.title']).toBe("Don't ask if the cat's alive.\nAsk for the probability.")
    expect(vi['landing.desc']).toBe(
      'Chúa có chơi xúc xắc không? Có — và ngài chơi liên tục, từng attosecond một. Vẽ rào, bắn gói sóng và xem từng lần gieo của thực tại.',
    )
    expect(en['landing.desc']).toBe(
      'Does God play dice? Yes — every single attosecond. Draw barriers, fire wave packets and watch reality roll.',
    )
    expect(vi['landing.ctaPrimary']).toBe('Mở hộp →')
    expect(en['landing.ctaPrimary']).toBe('Open the box →')
    expect(vi['landing.ctaFree']).toBe('Tự do khám phá')
    expect(en['landing.ctaFree']).toBe('Free exploration')
    expect(vi['landing.status']).toBe('ĐANG CHIẾU · {name}')
    expect(en['landing.status']).toBe('NOW SHOWING · {name}')
  })

  it('landing.schrodinger is the same formula string in both languages', () => {
    expect(vi['landing.schrodinger']).toBe('i·ħ ∂ψ/∂t = −ħ²/2m ∇²ψ + Vψ')
    expect(en['landing.schrodinger']).toBe(vi['landing.schrodinger'])
  })

  it('landing.title splits into exactly 2 non-empty lines', () => {
    for (const dict of [vi, en]) {
      const lines = dict['landing.title'].split('\n')
      expect(lines).toHaveLength(2)
      for (const line of lines) {
        expect(line.trim().length).toBeGreaterThan(0)
      }
    }
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
    // T8 folded ObservablesBar + ViewToggle's terms into the ReadoutRail.
    const termFiles = ['src/ui/ReadoutRail.svelte']
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
