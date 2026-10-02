import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { FrameMessage, WorkerToMain } from '../src/sim/protocol.js'

/**
 * Worker measure handlers (Task 14) — via the loadWasm seam: the worker
 * module only touches the wasm crate through `loadWasm()`, so a mock module
 * with a scriptable FakeSim lets these tests drive the REAL message
 * dispatcher (onmessage closure, postFrame, cadence + forceMomentumNext
 * state) without a browser. The worker's `self` is stubbed globally before
 * the dynamic import so its top-level `self.onmessage = ...` lands on our
 * recorder.
 *
 * (The Task-17 state save/load describe was removed with the 2026-10-02
 * feature trim, along with the worker's serialize/deserialize handlers
 * and the FakeSim stubs for them.)
 */

/** Every call the FakeSim receives, in order (construct params, seeds,
 * state loads). */
interface CallLogEntry {
  op: string
  seed?: bigint
  nx?: number
  ny?: number
  extentX?: number
  extentY?: number
  dt?: number
  m?: number
  hbar?: number
}
const calls = vi.hoisted(() => ({ log: [] as CallLogEntry[] }))

vi.mock('../src/sim/wasm.js', () => ({
  loadWasm: async () => ({
    Simulation2D: class {
      private nx = 4
      private ny = 4
      private extentX = 40
      private extentY = 40
      private dt = 0.005
      private m = 1
      private hbar = 1
      private t = 0
      private version = 0
      constructor(
        nx: number,
        ny: number,
        extentX = 40,
        extentY = 40,
        dt = 0.005,
        m = 1,
        hbar = 1,
      ) {
        this.nx = nx
        this.ny = ny
        this.extentX = extentX
        this.extentY = extentY
        this.dt = dt
        this.m = m
        this.hbar = hbar
        calls.log.push({ op: 'construct', nx, ny, extentX, extentY, dt, m, hbar })
      }
      set_gaussian(): void {}
      advance(substeps: number): number {
        this.t += substeps * 0.005
        return this.t
      }
      density_phase(): Float32Array {
        return new Float32Array(2 * this.nx * this.ny).fill(0.5)
      }
      norm(): number {
        return 1
      }
      potential_version(): number {
        return this.version
      }
      read_potential_f32(): Float32Array {
        return new Float32Array(this.nx * this.ny)
      }
      observables(): Float64Array {
        return new Float64Array(11)
      }
      momentum_density(): Float32Array {
        return new Float32Array(this.nx * this.ny).fill(1)
      }
      measure_position(seed: bigint): { ix: number; iy: number; x: number; y: number } {
        calls.log.push({ op: 'measure_position', seed })
        return { ix: 10, iy: 20, x: 1.5, y: -2.5 }
      }
      measure_momentum(seed: bigint): { i: number; j: number; kx: number; ky: number } {
        calls.log.push({ op: 'measure_momentum', seed })
        return { i: 3, j: 5, kx: 0.75, ky: -0.9 }
      }
      reset_wave(): void {}
    },
  }),
}))

/** Worker-scope stub: captures onmessage, records postMessage output.
 * Installed ONCE at file scope — the worker module assigns `self.onmessage`
 * exactly once at its (cached) first evaluation, so the stub object must
 * stay alive and its handler must never be nulled between tests. */
const workerScope = vi.hoisted(() => ({
  onmessage: null as ((ev: { data: unknown }) => void) | null,
  posted: [] as WorkerToMain[],
}))

let workerOnMessage: (ev: { data: unknown }) => void = () => {}

async function post(msg: unknown): Promise<void> {
  workerOnMessage({ data: msg })
  // Every handler awaits the (cached) wasm promise; one macrotask drain
  // lets the continuation run. Handlers run in arrival order, so a drain
  // after each post keeps the sequencing deterministic.
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function frames(): FrameMessage[] {
  return workerScope.posted.filter((m) => m.type === 'frame')
}

function constructs(): CallLogEntry[] {
  return calls.log.filter((entry) => entry.op === 'construct')
}

/** Installs the self stub + (cached) worker import, then boots a 4x4 sim. */
async function bootWorker(): Promise<void> {
  calls.log.length = 0
  workerScope.posted.length = 0
  vi.stubGlobal('self', {
    set onmessage(value: ((ev: { data: unknown }) => void) | null) {
      workerOnMessage = value ?? (() => {})
    },
    postMessage(message: WorkerToMain) {
      workerScope.posted.push(message)
    },
  })
  // Cached after the first run; the evaluation-time `self.onmessage =`
  // assignment lands on the stub above through the setter. (.js specifier
  // — the same bundler-style resolution every other test import uses.)
  await import('../src/sim/physics.worker.js')

  await post({
    type: 'init',
    nx: 4,
    ny: 4,
    extentX: 40,
    extentY: 40,
    dt: 0.005,
    m: 1,
    hbar: 1,
  })
}

describe('physics.worker measure handlers', () => {
  beforeEach(bootWorker)

  it('measure-position replies IMMEDIATELY with a frame carrying measured (position, physical coords)', async () => {
    const before = frames().length
    await post({ type: 'measure-position', seed: 123456 })

    // No advance was posted: the frame the worker ships is the collapsed
    // state itself (postFrame right after the wasm call).
    expect(frames()).toHaveLength(before + 1)
    const frame = frames()[frames().length - 1]
    expect(frame.measured).toEqual({ kind: 'position', x: 1.5, y: -2.5 })
    // The seed crosses the number -> BigInt boundary into wasm exactly.
    expect(calls.log.filter((e) => e.op === 'measure_position')).toEqual([
      { op: 'measure_position', seed: 123456n },
    ])
    // The collapsed state really shipped (density + norm for the render).
    expect(frame.densityPhase.length).toBe(2 * 4 * 4)
    expect(frame.norm).toBe(1)
  })

  it('measure-momentum forces momentumDensity onto the SAME frame even off-cadence', async () => {
    // Momentum view on resets the cadence counter; frame 0 would carry
    // momentum anyway, so advance once to land OFF the 4-frame grid before
    // measuring.
    await post({ type: 'set-momentum-view', on: true })
    await post({ type: 'advance', substeps: 1 }) // frameCount 0 -> carries momentum
    await post({ type: 'advance', substeps: 1 }) // frameCount 1 -> NO momentum
    expect(frames()[frames().length - 1].momentumDensity).toBeUndefined()

    await post({ type: 'measure-momentum', seed: 42 })
    const frame = frames()[frames().length - 1]
    // The measured frame itself carries the collapsed k-space density
    // (forceMomentumNext) — the momentum-view crossfade needs old and new
    // |phi(k)|^2 on adjacent draws.
    expect(frame.measured).toEqual({ kind: 'momentum', x: 0.75, y: -0.9, i: 3, j: 5 })
    expect(frame.momentumDensity).toBeDefined()
    expect(frame.momentumDensity!.length).toBe(4 * 4)

    // And the force is one-shot: the NEXT advance (still off-cadence at
    // frameCount 2) must NOT carry momentum again.
    await post({ type: 'advance', substeps: 1 })
    expect(frames()[frames().length - 1].momentumDensity).toBeUndefined()
    expect(calls.log.filter((e) => e.op === 'measure_momentum')).toEqual([
      { op: 'measure_momentum', seed: 42n },
    ])
  })

  it('measure-position in momentum view also forces momentumDensity (k-space collapsed too)', async () => {
    // A position measurement changes |phi(k)|^2 as well; watching k-space,
    // the measured frame must refresh the momentum texture on the spot or
    // the crossfade would have nothing new to fade to.
    await post({ type: 'set-momentum-view', on: true })
    await post({ type: 'advance', substeps: 1 }) // frameCount 0 -> carries momentum
    await post({ type: 'advance', substeps: 1 }) // frameCount 1 -> NO momentum
    await post({ type: 'measure-position', seed: 99 })
    const frame = frames()[frames().length - 1]
    expect(frame.measured).toEqual({ kind: 'position', x: 1.5, y: -2.5 })
    expect(frame.momentumDensity).toBeDefined()
  })

  it('measure-momentum in position view ships measured but no momentumDensity (view-gated)', async () => {
    // Momentum view never turned on: the k-space FFT stays off even though
    // the collapse happened (position display crossfades from densityPhase).
    await post({ type: 'advance', substeps: 1 })
    await post({ type: 'measure-momentum', seed: 7 })
    const frame = frames()[frames().length - 1]
    expect(frame.measured).toEqual({ kind: 'momentum', x: 0.75, y: -0.9, i: 3, j: 5 })
    expect(frame.momentumDensity).toBeUndefined()
  })
})

