import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULTS } from '../src/sim/simParams.js'
import type { MainToWorker } from '../src/sim/protocol.js'
import { SimStore } from '../src/sim/simStore.svelte.js'
import {
  LANDING_ORDER,
  PRESETS,
  type PresetConfig,
  type PresetId,
} from '../src/presets/index.js'

/**
 * The five launch presets pinned by the spec (M2 §5.1 + the M1 default
 * scene). Each entry byte-matches the brief: physics values, packets,
 * autoplay. Kept exhaustive on purpose — these numbers ARE the product
 * decision (e.g. tunneling's E≈18 < V0=24 sub-barrier energy).
 */
const PINNED: Record<PresetId, { potential: object; packet: object; autoplay: boolean }> = {
  'double-slit': {
    potential: {
      type: 'wall',
      xCenter: 0,
      thickness: 0.6,
      value: 30,
      gapCenters: [-3, 3],
      gapWidths: [1.2, 1.2],
    },
    packet: { x0: -10, y0: 0, kx: 6, ky: 0, sigmaX: 1.5, sigmaY: 1.5 },
    autoplay: true,
  },
  tunneling: {
    // Sealed barrier: no gaps at all (~6-7 cells thick at 256²).
    potential: {
      type: 'wall',
      xCenter: 0,
      thickness: 1.0,
      value: 24,
      gapCenters: [],
      gapWidths: [],
    },
    packet: { x0: -10, y0: 0, kx: 6, ky: 0, sigmaX: 1.5, sigmaY: 1.5 },
    autoplay: true,
  },
  'free-packet': {
    potential: { type: 'zero' },
    packet: { x0: 0, y0: 0, kx: 3, ky: 2, sigmaX: 2, sigmaY: 2 },
    autoplay: true,
  },
  harmonic: {
    // sigma = 1/sqrt(2) — the true coherent-state width for m = omega =
    // hbar = 1 (physics audit 2026-10-01, finding 3): the packet orbits
    // without breathing, so the "barely spreads" narration is exact.
    potential: { type: 'harmonic', omega: 1 },
    packet: { x0: -6, y0: 0, kx: 0, ky: 3, sigmaX: 0.7071067811865476, sigmaY: 0.7071067811865476 },
    autoplay: true,
  },
  sandbox: {
    potential: { type: 'zero' },
    packet: { x0: 0, y0: 0, kx: 0, ky: 0, sigmaX: 3, sigmaY: 3 },
    autoplay: false,
  },
}

describe('PRESETS registry', () => {
  it('LANDING_ORDER is exactly the five launch presets in spec order', () => {
    expect(LANDING_ORDER).toEqual([
      'double-slit',
      'tunneling',
      'free-packet',
      'harmonic',
      'sandbox',
    ])
  })

  it('every LANDING_ORDER entry resolves to a preset (and no extras exist)', () => {
    for (const id of LANDING_ORDER) {
      expect(PRESETS[id], `PRESETS[${id}]`).toBeDefined()
    }
    expect(Object.keys(PRESETS).sort()).toEqual([...LANDING_ORDER].sort())
  })

  it('every preset is complete: id matches its key, grid 256, titleKey convention, autoplay boolean', () => {
    for (const id of LANDING_ORDER) {
      const preset = PRESETS[id]
      expect(preset.id, `${id}.id`).toBe(id)
      expect(preset.grid, `${id}.grid`).toBe(256)
      expect(preset.titleKey, `${id}.titleKey`).toBe(`preset.${id}.title`)
      expect(typeof preset.autoplay, `${id}.autoplay`).toBe('boolean')
      expect(preset.packet, `${id}.packet`).toBeDefined()
    }
  })

  it('physics configs match the pinned spec values for all five presets', () => {
    for (const id of LANDING_ORDER) {
      const preset = PRESETS[id]
      const pinned = PINNED[id]
      expect(preset.potential, `${id}.potential`).toEqual(pinned.potential)
      expect(preset.packet, `${id}.packet`).toEqual(pinned.packet)
      expect(preset.autoplay, `${id}.autoplay`).toBe(pinned.autoplay)
    }
  })

  it('tunneling has NO gaps (sealed barrier), sandbox does not autoplay', () => {
    const tunneling = PRESETS['tunneling'].potential
    expect(tunneling).toMatchObject({ type: 'wall' })
    if (tunneling.type === 'wall') {
      expect(tunneling.gapCenters).toHaveLength(0)
      expect(tunneling.gapWidths).toHaveLength(0)
    }
    expect(PRESETS['sandbox'].autoplay).toBe(false)
  })
})

/**
 * SimStore.init(preset) contract: exact worker message sequence, `?grid=`
 * override precedence, and the full reactive reset on re-init.
 *
 * The store class is constructed for real (runes classes instantiate fine
 * under vitest — see modeStore.test.ts); `Worker` is stubbed globally and a
 * test subclass records `send` instead of posting.
 */
class FakeWorker {
  onmessage: ((ev: { data: unknown }) => void) | null = null
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_url: URL, _opts?: { type?: string }) {}
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

type InitMsg = Extract<MainToWorker, { type: 'init' }>

const firstInit = (store: RecordingStore): InitMsg =>
  store.sent[0] as InitMsg

describe('SimStore.init(preset)', () => {
  beforeEach(() => {
    vi.stubGlobal('Worker', FakeWorker)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('double-slit sends the exact M1 scene: init -> potential-wall -> set-gaussian, autoplay on', () => {
    const store = new RecordingStore()
    store.init(PRESETS['double-slit'])

    expect(store.sent.map((m) => m.type)).toEqual([
      'init',
      'potential-wall',
      'set-gaussian',
    ])
    expect(store.sent[0]).toEqual({
      type: 'init',
      nx: 256,
      ny: 256,
      extentX: DEFAULTS.extent,
      extentY: DEFAULTS.extent,
      dt: DEFAULTS.dt,
      m: DEFAULTS.m,
      hbar: DEFAULTS.hbar,
    })
    expect(store.sent[1]).toEqual({
      ...PINNED['double-slit'].potential,
      type: 'potential-wall',
    })
    expect(store.sent[2]).toEqual({
      type: 'set-gaussian',
      ...PINNED['double-slit'].packet,
    })
    expect(store.running).toBe(true)
  })

  it('harmonic maps to potential-harmonic, sandbox to potential-zero with autoplay off', () => {
    const harmonic = new RecordingStore()
    harmonic.init(PRESETS['harmonic'])
    expect(harmonic.sent.map((m) => m.type)).toEqual([
      'init',
      'potential-harmonic',
      'set-gaussian',
    ])
    expect(harmonic.sent[1]).toEqual({ type: 'potential-harmonic', omega: 1 })

    const sandbox = new RecordingStore()
    sandbox.init(PRESETS['sandbox'])
    expect(sandbox.sent.map((m) => m.type)).toEqual([
      'init',
      'potential-zero',
      'set-gaussian',
    ])
    expect(sandbox.running).toBe(false)
  })

  it('a preset without a packet sends no set-gaussian', () => {
    const bare: PresetConfig = { ...PRESETS['free-packet'], packet: undefined }
    const store = new RecordingStore()
    store.init(bare)
    expect(store.sent.map((m) => m.type)).toEqual(['init', 'potential-zero'])
  })

  it('?grid= override wins over the preset grid; without it the preset grid is used', () => {
    // Node has no `location`; set/remove it manually so the Worker stub
    // from beforeEach survives for the whole test.
    const g = globalThis as Record<string, unknown>
    g.location = { search: '?grid=512' }
    const overridden = new RecordingStore()
    overridden.init(PRESETS['harmonic']) // preset grid 256
    expect(firstInit(overridden).nx).toBe(512)
    expect(firstInit(overridden).ny).toBe(512)
    expect(overridden.grid).toBe(512)
    delete g.location

    const plain = new RecordingStore()
    plain.init(PRESETS['harmonic'])
    expect(firstInit(plain).nx).toBe(256)
    expect(plain.grid).toBe(256)
  })

  it('re-init with a different preset leaves no stale t/norm/frames/fatal', () => {
    const store = new RecordingStore()
    store.init(PRESETS['double-slit'])

    // Simulate a session that ran, drew frames, then died fatally.
    store.t = 12.5
    store.norm = 0.93
    store.frames = 4321
    store.fatal = 'norm drifted'
    store.running = false

    store.destroy()
    store.sent.length = 0

    store.init(PRESETS['sandbox'])
    expect(store.t).toBe(0)
    expect(store.norm).toBe(0)
    expect(store.frames).toBe(0)
    expect(store.fatal).toBeUndefined()
    expect(store.running).toBe(false) // sandbox autoplay
    expect(store.sent.map((m) => m.type)).toEqual([
      'init',
      'potential-zero',
      'set-gaussian',
    ])
    // The second scene's packet is the sandbox blob, not the old scene's.
    expect(store.sent[2]).toEqual({
      type: 'set-gaussian',
      ...PINNED['sandbox'].packet,
    })
  })

  it('init while the worker is still alive stays a no-op (idempotent guard)', () => {
    const store = new RecordingStore()
    store.init(PRESETS['tunneling'])
    store.init(PRESETS['harmonic']) // ignored: no destroy in between
    expect(store.sent.map((m) => m.type)).toEqual([
      'init',
      'potential-wall',
      'set-gaussian',
    ])
  })
})
