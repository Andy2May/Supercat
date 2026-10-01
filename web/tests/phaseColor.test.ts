import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FRAGMENT_SHADER_SRC } from '../src/render/shaders.js'
import { modeStore } from '../src/sim/modeStore.svelte.js'
import { SimStore, effectiveColorMode } from '../src/sim/simStore.svelte.js'
import { PRESETS } from '../src/presets/index.js'
import type { MainToWorker } from '../src/sim/protocol.js'

/**
 * HSV phase colormap (Task 13). The shader is a TS string constant, so the
 * GLSL contract gets a cheap STRUCTURAL pin here: the uniform exists, both
 * code paths exist, and the mode-0 arithmetic is untouched (rendering
 * itself is manual polish). The render-mode predicate and the store flag
 * get real behavioral unit tests.
 *
 * Same Worker-stub seams as momentumView.test.ts.
 */
class FakeWorker {
  static last: FakeWorker | undefined
  onmessage: ((ev: { data: unknown }) => void) | null = null
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_url: URL, _opts?: { type?: string }) {
    FakeWorker.last = this
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  postMessage(_msg: unknown, _transfer?: unknown[]): void {}
  terminate(): void {}
}

class RecordingStore extends SimStore {
  readonly sent: MainToWorker[] = []
  send(msg: MainToWorker): void {
    this.sent.push(msg)
  }
}

describe('FRAGMENT_SHADER_SRC phase colormap (structural)', () => {
  it('declares u_colorMode and carries both code paths', () => {
    // Uniform declaration (int, so uniform1i drives it).
    expect(FRAGMENT_SHADER_SRC).toContain('uniform int u_colorMode;')
    // Mode-1 branch + the inline hsv2rgb helper it calls.
    expect(FRAGMENT_SHADER_SRC).toContain('if (u_colorMode == 1)')
    expect(FRAGMENT_SHADER_SRC).toContain('vec3 hsv2rgb(vec3 hsv)')
    // Hue: phi in (-pi, pi] -> [0, 1) via fract((phi + PI) / TAU) — both
    // sides of the branch cut land on hue 0 (red).
    expect(FRAGMENT_SHADER_SRC).toContain('fract((phi + 3.14159265358979) / 6.28318530717959)')
    // Saturation 0.9, and VALUE is the shared tonemapped brightness b.
    expect(FRAGMENT_SHADER_SRC).toContain('vec3(hue, 0.9, b)')
  })

  it('keeps the mode-0 inferno path byte-equivalent in behavior', () => {
    // The auto-exposure tonemap line feeds BOTH modes unchanged. The
    // exponent is 0.45 scaled by u_contrast (Task 18 round 1) — at the
    // default 1.0 the arithmetic is the original 0.45 gamma exactly.
    expect(FRAGMENT_SHADER_SRC).toContain(
      'float b = pow(clamp(rho / max(u_maxDensity, 1e-6), 0.0, 1.0), 0.45 / u_contrast)',
    )
    // All three inferno stops still mixed on b exactly as before.
    expect(FRAGMENT_SHADER_SRC).toContain('mix(vec3(0.0), c1, b * 3.0)')
    expect(FRAGMENT_SHADER_SRC).toContain('mix(c1, c2, b * 3.0 - 1.0)')
    expect(FRAGMENT_SHADER_SRC).toContain('mix(c2, c3, b * 3.0 - 2.0)')
    // Mode 1 is a leading branch: the mode-0 chain stays the else-if tail,
    // so with the uniform at its default 0 the arithmetic is identical.
    expect(FRAGMENT_SHADER_SRC.indexOf('if (u_colorMode == 1)')).toBeLessThan(
      FRAGMENT_SHADER_SRC.indexOf('mix(vec3(0.0), c1, b * 3.0)'),
    )
  })

  it('declares u_contrast and applies it to the shared tonemap gamma (Task 18)', () => {
    // Uniform declaration (float, driven by uniform1f from the renderer).
    expect(FRAGMENT_SHADER_SRC).toContain('uniform float u_contrast;')
    // The slider's contract: contrast DIVIDES the 0.45 gamma, and it acts
    // on b BEFORE the colormap branch — one line, inferno and the HSV
    // value both follow, in position and momentum views alike.
    expect(FRAGMENT_SHADER_SRC).toContain('0.45 / u_contrast')
    // u_contrast must be consumed before the mode-1 branch reads b.
    expect(FRAGMENT_SHADER_SRC.indexOf('0.45 / u_contrast')).toBeLessThan(
      FRAGMENT_SHADER_SRC.indexOf('if (u_colorMode == 1)'),
    )
  })
})

describe('effectiveColorMode (pure render-mode predicate)', () => {
  it('phase color applies ONLY in advanced + position view with the flag on', () => {
    expect(effectiveColorMode('position', true, 'advanced')).toBe(1)
    expect(effectiveColorMode('position', false, 'advanced')).toBe(0)
    // Momentum view: ALWAYS inferno, whatever the stored flag — the k-space
    // texture's phase channel is 0 and hue would be a garbage constant.
    expect(effectiveColorMode('momentum', true, 'advanced')).toBe(0)
    expect(effectiveColorMode('momentum', false, 'advanced')).toBe(0)
    // Explore mode has NO phase colormap (spec v1 §2.1): even with the
    // flag still stored and the view position, the canvas renders inferno.
    expect(effectiveColorMode('position', true, 'explore')).toBe(0)
    expect(effectiveColorMode('position', false, 'explore')).toBe(0)
    expect(effectiveColorMode('momentum', true, 'explore')).toBe(0)
    expect(effectiveColorMode('momentum', false, 'explore')).toBe(0)
  })
})

describe('SimStore phaseColor flag', () => {
  beforeEach(() => {
    vi.stubGlobal('Worker', FakeWorker)
    FakeWorker.last = undefined
    modeStore.mode = 'explore'
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    modeStore.mode = 'explore'
  })

  it('defaults false and flips without any worker message (pure render state)', () => {
    const store = new RecordingStore()
    expect(store.phaseColor).toBe(false)

    store.init(PRESETS['free-packet'])
    store.sent.length = 0
    store.phaseColor = true
    store.phaseColor = false
    expect(store.sent).toEqual([])
  })

  it('survives a momentum round-trip but resets on init (fresh scene boots inferno)', () => {
    const store = new RecordingStore()
    store.init(PRESETS['free-packet'])
    store.phaseColor = true
    store.setView('momentum')
    store.setView('position')
    expect(store.phaseColor).toBe(true)

    store.destroy()
    store.init(PRESETS['sandbox'])
    expect(store.phaseColor).toBe(false)
  })

  it('contrast defaults to the neutral 1, is pure render state, and resets on init', () => {
    const store = new RecordingStore()
    // 1.0 = the pre-slider look EXACTLY (0.45 / 1 = 0.45 gamma).
    expect(store.contrast).toBe(1)

    store.init(PRESETS['free-packet'])
    store.sent.length = 0
    store.contrast = 2.5
    store.contrast = 0.5
    // Pure render state (same contract as phaseColor): no worker message.
    expect(store.sent).toEqual([])

    store.destroy()
    store.init(PRESETS['double-slit'])
    // A fresh scene boots with neutral eyes.
    expect(store.contrast).toBe(1)
  })

  it('explore flip does not render HSV (spec v1 §2.1): flag survives, predicate gates it', () => {
    modeStore.mode = 'advanced'
    const store = new RecordingStore()
    store.init(PRESETS['free-packet'])
    store.phaseColor = true
    expect(effectiveColorMode(store.view, store.phaseColor, modeStore.mode)).toBe(1)

    // The reviewer's trap: advanced + position + phase ON -> explore. The
    // flag is NOT cleared (nothing sends, nothing resets), but the canvas
    // must fall back to inferno — explore has no phase colormap and no
    // button to turn one off.
    modeStore.mode = 'explore'
    expect(store.phaseColor).toBe(true)
    expect(effectiveColorMode(store.view, store.phaseColor, modeStore.mode)).toBe(0)

    // Round-trip back: the coloring resumes exactly where it was.
    modeStore.mode = 'advanced'
    expect(effectiveColorMode(store.view, store.phaseColor, modeStore.mode)).toBe(1)
  })
})
