import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { shouldSendMomentum } from '../src/sim/protocol.js'
import { modeStore } from '../src/sim/modeStore.svelte.js'
import { SimStore, effectiveView, type SimView } from '../src/sim/simStore.svelte.js'
import { PRESETS } from '../src/presets/index.js'
import type { MainToWorker } from '../src/sim/protocol.js'

/**
 * View-state store transitions (Task 12): `simStore.view` is the single
 * source of truth for position <-> momentum; `setView` drives the worker
 * flag, `init` resets to position, and `effectiveView` is the pure
 * explore-snapback predicate App.svelte applies on mode flips.
 *
 * Same seams as observablesBar.test.ts: Worker stubbed globally, a test
 * subclass records send() instead of posting.
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

describe('SimStore view state', () => {
  beforeEach(() => {
    vi.stubGlobal('Worker', FakeWorker)
    FakeWorker.last = undefined
    modeStore.mode = 'explore'
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    modeStore.mode = 'explore'
  })

  it('defaults to position; setView(momentum) sends the flag and flips state', () => {
    const store = new RecordingStore()
    expect(store.view).toBe<SimView>('position')

    store.setView('momentum')
    expect(store.view).toBe<SimView>('momentum')
    expect(store.sent.filter((m) => m.type === 'set-momentum-view')).toEqual([
      { type: 'set-momentum-view', on: true },
    ])
  })

  it('position -> momentum -> position sends on:true then on:false, in order', () => {
    const store = new RecordingStore()
    store.setView('momentum')
    store.setView('position')
    expect(store.view).toBe<SimView>('position')
    expect(store.sent.filter((m) => m.type === 'set-momentum-view')).toEqual([
      { type: 'set-momentum-view', on: true },
      { type: 'set-momentum-view', on: false },
    ])
  })

  it('setView to the current view is a no-op (no duplicate flag messages)', () => {
    const store = new RecordingStore()
    store.setView('position')
    store.setView('position')
    expect(store.sent.filter((m) => m.type === 'set-momentum-view')).toEqual([])
  })

  it('init() resets the view to position and ships no momentum flag (worker resets its own)', () => {
    const store = new RecordingStore()
    store.init(PRESETS['free-packet'])
    store.setView('momentum')
    expect(store.view).toBe<SimView>('momentum')

    store.destroy()
    store.sent.length = 0
    store.init(PRESETS['sandbox'])
    expect(store.view).toBe<SimView>('position')
    // The fresh worker boots with the flag off (worker-session state reset
    // on init) — init must not need a set-momentum-view message at all.
    expect(store.sent.filter((m) => m.type === 'set-momentum-view')).toEqual([])
  })

  it('explore snapback wiring sends the off message exactly once', () => {
    modeStore.mode = 'advanced'
    const store = new RecordingStore()
    store.init(PRESETS['free-packet'])
    store.setView('momentum')
    store.sent.length = 0

    // Exactly App.svelte's $effect body: reconcile the view against the
    // mode via the pure predicate; only an actual change sends.
    const snapback = (): void => {
      const target = effectiveView(modeStore.mode, store.view)
      if (target !== store.view) store.setView(target)
    }

    modeStore.mode = 'explore'
    snapback()
    expect(store.view).toBe<SimView>('position')
    expect(store.sent.filter((m) => m.type === 'set-momentum-view')).toEqual([
      { type: 'set-momentum-view', on: false },
    ])

    // Re-running the effect (any unrelated reactivity) must NOT send again.
    snapback()
    expect(store.sent.filter((m) => m.type === 'set-momentum-view')).toHaveLength(1)
  })
})

describe('effectiveView (pure snapback predicate)', () => {
  it('explore always resolves to position, whatever the stored view', () => {
    expect(effectiveView('explore', 'momentum')).toBe<SimView>('position')
    expect(effectiveView('explore', 'position')).toBe<SimView>('position')
  })

  it('advanced keeps the stored view', () => {
    expect(effectiveView('advanced', 'momentum')).toBe<SimView>('momentum')
    expect(effectiveView('advanced', 'position')).toBe<SimView>('position')
  })
})

describe('shouldSendMomentum (worker cadence decision)', () => {
  it('rides the OBSERVABLES_CADENCE grid: first frame after flag-on, then every 4th', () => {
    expect(shouldSendMomentum(0, true)).toBe(true)
    expect(shouldSendMomentum(1, true)).toBe(false)
    expect(shouldSendMomentum(3, true)).toBe(false)
    expect(shouldSendMomentum(4, true)).toBe(true)
    expect(shouldSendMomentum(0, false)).toBe(false)
    expect(shouldSendMomentum(4, false)).toBe(false)
  })
})
