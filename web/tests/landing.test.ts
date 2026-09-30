import { afterEach, describe, expect, it, vi } from 'vitest'

import { parseRoute } from '../src/route.js'
import { LANDING_ORDER, PRESETS } from '../src/presets/index.js'
import { simStore } from '../src/sim/simStore.svelte.js'

describe('parseRoute (Task 9 hash routing)', () => {
  it('empty-ish hashes land on the landing view', () => {
    expect(parseRoute('')).toEqual({ view: 'landing' })
    expect(parseRoute('#/')).toEqual({ view: 'landing' })
    // A bare '#' is the browser's empty-fragment form (location.hash of a
    // URL like `.../#`), so it lands too rather than falling back.
    expect(parseRoute('#')).toEqual({ view: 'landing' })
  })

  it("'#/sim/<id>' resolves every registry id", () => {
    for (const id of LANDING_ORDER) {
      expect(parseRoute(`#/sim/${id}`)).toEqual({ view: 'sim', id })
    }
  })

  it('an unknown preset id falls back to double-slit', () => {
    // The brief's case, plus the e2e garbage case.
    expect(parseRoute('#/sim/khong-ton-tai')).toEqual({
      view: 'sim',
      id: 'double-slit',
    })
    expect(parseRoute('#/sim/nonsense')).toEqual({ view: 'sim', id: 'double-slit' })
  })

  it('garbage hashes fall back to double-slit (no 404 view)', () => {
    for (const hash of [
      'garbage', // not a hash-route at all
      '#foo', // unknown non-sim route
      '#/sim/', // missing id
      '#/sim/tunneling/extra', // trailing garbage after a valid id
      '#/sim/Tunneling', // ids are case-sensitive
    ]) {
      const route = parseRoute(hash)
      expect(route.view, hash).toBe('sim')
      expect(route, hash).toEqual({ view: 'sim', id: 'double-slit' })
    }
  })
})

/** Minimal Worker stand-in so `simStore.init` can run under node. */
class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  postMessage(_msg: unknown): void {}
  terminate(): void {}
}

describe('simStore re-init across a preset switch (Task 9)', () => {
  vi.stubGlobal('Worker', FakeWorker as unknown as typeof Worker)

  afterEach(() => {
    simStore.destroy()
  })

  it('init resets perf stats so a stale HUD cannot survive a switch', () => {
    simStore.init(PRESETS['double-slit'])
    // Simulate a scene that ran and filled the HUD (Task 8 parked finding).
    simStore.perf.fps = 60
    simStore.perf.substeps = 4
    simStore.perf.workerMs = 3.5

    simStore.destroy()
    simStore.init(PRESETS['tunneling'])

    expect(simStore.perf.fps).toBe(0)
    expect(simStore.perf.substeps).toBe(0)
    expect(simStore.perf.workerMs).toBe(0)
    // The rest of the reactive surface resets too (already T8 behavior).
    expect(simStore.frames).toBe(0)
    expect(simStore.t).toBe(0)
    expect(simStore.fatal).toBeUndefined()
    expect(simStore.running).toBe(true) // tunneling autoplays
  })

  it('bumps epoch on every init so the render loop can detect a worker swap', () => {
    simStore.init(PRESETS['double-slit'])
    const first = simStore.epoch
    expect(first).toBeGreaterThan(0)

    simStore.destroy()
    simStore.init(PRESETS['harmonic'])
    expect(simStore.epoch).toBeGreaterThan(first)
  })
})
