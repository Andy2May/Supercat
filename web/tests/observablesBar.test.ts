import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  OBSERVABLES_CADENCE,
  shouldSendObs,
  toObservables,
  type FrameMessage,
  type MainToWorker,
} from '../src/sim/protocol.js'
import { mapSeries, ringPush } from '../src/sim/sparkline.js'
import { modeStore } from '../src/sim/modeStore.svelte.js'
import { SimStore } from '../src/sim/simStore.svelte.js'
import { PRESETS } from '../src/presets/index.js'

// ---------------------------------------------------------------- protocol

/**
 * The wasm contract (Simulation2D.observables, doc'd in wasm/src/lib.rs) is
 * a Float64Array of exactly 11 values in EXACTLY this order:
 * [x, y, sigma_x, sigma_y, px, py, sigma_px, sigma_py, kinetic, potential,
 *  energy]. `toObservables` is the single source of truth for that mapping —
 * a transposed pair here would silently label ⟨y⟩ as σx on screen.
 */
describe('toObservables (11-float wire order)', () => {
  // Distinct values so any transposition fails, not just equal-value pairs.
  const raw = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5]

  it('maps every index to its documented field (11 cases)', () => {
    const obs = toObservables(raw)
    const fields: (keyof ReturnType<typeof toObservables>)[] = [
      'x',
      'y',
      'sigmaX',
      'sigmaY',
      'px',
      'py',
      'sigmaPx',
      'sigmaPy',
      'kinetic',
      'potential',
      'energy',
    ]
    expect(fields).toHaveLength(11)
    for (let i = 0; i < fields.length; i++) {
      expect(obs[fields[i]], `${fields[i]} <- index ${i}`).toBe(raw[i])
    }
  })

  it('accepts the Float64Array the worker actually receives', () => {
    const obs = toObservables(new Float64Array(raw))
    expect(obs.energy).toBe(raw[10])
    expect(obs.sigmaPy).toBe(raw[7])
  })
})

describe('shouldSendObs (worker cadence decision)', () => {
  it('sends every OBSERVABLES_CADENCE-th frame while on, never while off', () => {
    expect(OBSERVABLES_CADENCE).toBe(4)
    // Frame counter starts at 0: the frame right after the flag turns on
    // (worker resets the counter) carries obs — no 4-frame dead delay.
    expect(shouldSendObs(0, true)).toBe(true)
    expect(shouldSendObs(1, true)).toBe(false)
    expect(shouldSendObs(2, true)).toBe(false)
    expect(shouldSendObs(3, true)).toBe(false)
    expect(shouldSendObs(4, true)).toBe(true)
    expect(shouldSendObs(8, true)).toBe(true)
    expect(shouldSendObs(0, false)).toBe(false)
    expect(shouldSendObs(4, false)).toBe(false)
  })
})

// ---------------------------------------------------------------- sparkline

describe('ringPush', () => {
  it('appends in order below the cap', () => {
    const arr = ringPush([1, 2], 3, 5)
    expect(arr).toEqual([1, 2, 3])
  })

  it('drops the oldest items once the cap is exceeded', () => {
    let arr: number[] = []
    for (let i = 1; i <= 7; i++) arr = ringPush(arr, i, 5)
    expect(arr).toEqual([3, 4, 5, 6, 7])
  })

  it('defaults to a cap of 600', () => {
    let arr: number[] = []
    for (let i = 0; i < 603; i++) arr = ringPush(arr, i)
    expect(arr).toHaveLength(600)
    expect(arr[0]).toBe(3) // 0, 1, 2 were dropped (603 pushed, 600 kept)
    expect(arr[599]).toBe(602)
  })
})

describe('mapSeries', () => {
  it('produces interleaved [x, y] polyline pairs with x = i/(n-1)', () => {
    const pts = mapSeries([0, 5, 10], 0, 10)
    expect(pts).toBeInstanceOf(Float32Array)
    expect(pts).toHaveLength(6)
    expect(Array.from(pts)).toEqual([0, 0, 0.5, 0.5, 1, 1])
  })

  it('normalizes against the given lo/hi, not 0..1 of the data', () => {
    const pts = mapSeries([0, 4], -4, 4)
    expect(Array.from(pts)).toEqual([0, 0.5, 1, 1])
  })

  it('clamps y into [0, 1] on both sides', () => {
    const pts = mapSeries([-50, 5, 150], 0, 10)
    expect(pts[1]).toBe(0)
    expect(pts[3]).toBe(0.5)
    expect(pts[5]).toBe(1)
  })

  it('degenerate range (lo === hi) centers every y at 0.5', () => {
    const pts = mapSeries([5, 5, 5], 5, 5)
    expect(Array.from(pts)).toEqual([0, 0.5, 0.5, 0.5, 1, 0.5])
  })

  it('a single point yields one pair at x = 0', () => {
    const pts = mapSeries([3], 0, 10)
    expect(pts).toHaveLength(2)
    expect(pts[0]).toBe(0)
    // Float32 storage: 0.3 is not exactly representable.
    expect(pts[1]).toBeCloseTo(0.3, 5)
  })
})

// ------------------------------------------------------------ simStore

/**
 * SimStore observables history: appended from frame.obs in receive(),
 * capped at 600 (ring), reset by init() (Review Focus 3: a preset switch
 * must never show the previous scene's observables), and the boot wiring
 * ships set-observables-cadence while the mode store says advanced.
 *
 * Same seams as presets.test.ts: Worker is stubbed globally; a test
 * subclass records send() instead of posting. The stub also keeps the last
 * instance so tests can drive receive() through the real onmessage hook.
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

function frame(t: number, obs?: ReturnType<typeof toObservables>): FrameMessage {
  return {
    type: 'frame',
    densityPhase: new Float32Array(4),
    t,
    norm: 1,
    maxDensity: 0.5,
    potentialVersion: 0,
    obs,
  }
}

function pushFrame(t: number, obs?: ReturnType<typeof toObservables>): void {
  FakeWorker.last?.onmessage?.({ data: frame(t, obs) })
}

describe('SimStore observables history', () => {
  beforeEach(() => {
    vi.stubGlobal('Worker', FakeWorker)
    FakeWorker.last = undefined
    modeStore.mode = 'explore'
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    modeStore.mode = 'explore'
  })

  it('a frame with obs appends {t, ...obs}; a frame without obs does not', () => {
    const store = new RecordingStore()
    store.init(PRESETS['free-packet'])
    const obs = toObservables([0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5])
    pushFrame(1.25, obs)
    pushFrame(1.5)
    pushFrame(1.75, obs)

    expect(store.observablesHistory).toHaveLength(2)
    expect(store.observablesHistory[0]).toEqual({ t: 1.25, ...obs })
    expect(store.observablesHistory[1]).toEqual({ t: 1.75, ...obs })
  })

  it('caps the history at 600 entries, dropping the oldest', () => {
    const store = new RecordingStore()
    store.init(PRESETS['free-packet'])
    const obs = toObservables(new Array(11).fill(0))
    for (let i = 0; i < 603; i++) pushFrame(i, obs)
    const history = store.observablesHistory
    expect(history).toHaveLength(600)
    expect(history[0].t).toBe(3)
    expect(history[599].t).toBe(602)
  })

  it('init() resets a filled history (preset switch shows no stale obs)', () => {
    const store = new RecordingStore()
    store.init(PRESETS['double-slit'])
    pushFrame(9.9, toObservables(new Array(11).fill(1)))
    expect(store.observablesHistory).toHaveLength(1)

    store.destroy()
    store.sent.length = 0
    store.init(PRESETS['sandbox'])
    expect(store.observablesHistory).toEqual([])
    // The new scene appends fresh from zero.
    pushFrame(0.1, toObservables(new Array(11).fill(2)))
    expect(store.observablesHistory).toEqual([
      { t: 0.1, ...toObservables(new Array(11).fill(2)) },
    ])
  })

  it('destroy() also clears the history', () => {
    const store = new RecordingStore()
    store.init(PRESETS['free-packet'])
    pushFrame(1, toObservables(new Array(11).fill(0)))
    expect(store.observablesHistory).toHaveLength(1)
    store.destroy()
    expect(store.observablesHistory).toEqual([])
  })

  it('init while the mode store is advanced ships set-observables-cadence on', () => {
    modeStore.mode = 'advanced'
    const store = new RecordingStore()
    store.init(PRESETS['free-packet'])
    const cadence = store.sent.filter((m) => m.type === 'set-observables-cadence')
    expect(cadence).toEqual([{ type: 'set-observables-cadence', on: true }])
  })

  it('init in explore mode stays quiet (worker default is obs off)', () => {
    const store = new RecordingStore()
    store.init(PRESETS['free-packet'])
    expect(
      store.sent.filter((m) => m.type === 'set-observables-cadence'),
    ).toEqual([])
  })
})
