/**
 * Wire protocol between the main thread and the simulation Web Worker
 * (Task 11). Types plus the couple of pure mapping/cadence helpers both
 * sides share (`toObservables`, `shouldSendObs`) — no state, no side
 * effects, so both sides import the exact same contract without pulling in
 * execution order dependencies.
 *
 * Field names mirror the `wasm` crate's `Simulation2D` API one-to-one:
 * `init` maps onto the constructor, `set-gaussian` onto `set_gaussian`, and
 * so on; the worker is a thin dispatcher around those calls.
 */

/** Main thread -> worker: create / drive / mutate the simulation. */
export type MainToWorker =
  | {
      type: 'init'
      nx: number
      ny: number
      extentX: number
      extentY: number
      dt: number
      m: number
      hbar: number
    }
  | {
      type: 'set-gaussian'
      x0: number
      y0: number
      kx: number
      ky: number
      sigmaX: number
      sigmaY: number
    }
  | {
      type: 'advance'
      substeps: number
      /**
       * Buffer-recycling channel (Task-6 micro-opt): the previous frame's
       * `densityPhase` backing buffer, returned zero-copy once the main
       * thread's texture upload has consumed it. Transferring a buffer
       * detaches it in the sender, so the worker can only reuse frame
       * buffers the main thread lends back — with at most one advance in
       * flight, steady state cycles ~two buffers (ping-pong) instead of
       * orphaning each frame's ~0.5-2 MB to the GC. Absent on the first
       * advance after boot or a pause (nothing to return yet).
       */
      recycle?: ArrayBuffer
    }
  | { type: 'reset-wave' }
  | { type: 'restore-potential' }
  | { type: 'potential-zero' }
  | { type: 'potential-harmonic'; omega: number }
  | {
      type: 'potential-wall'
      xCenter: number
      thickness: number
      value: number
      gapCenters: number[]
      gapWidths: number[]
    }
  | { type: 'paint-disc'; cx: number; cy: number; r: number; value: number }
  | {
      type: 'paint-segment'
      x1: number
      y1: number
      x2: number
      y2: number
      thickness: number
      value: number
    }
  | {
      /**
       * Turns the observables side-channel on/off (Task 11): while on, every
       * `OBSERVABLES_CADENCE`-th frame carries an `obs` block (and the first
       * frame after the flag turns on does too — the worker resets its frame
       * counter on this message, so toggling never waits a full cadence).
       * Sent by App whenever the experience mode flips advanced <-> explore
       * and (belt-and-braces) by `SimStore.init` while advanced.
       */
      type: 'set-observables-cadence'
      on: boolean
    }

/**
 * Worker -> main: one renderable frame. `densityPhase` holds interleaved
 * `(rho, phi)` pairs per grid point, row-major with x fastest (`j*nx + i`) —
 * the exact layout `Simulation2D.density_phase()` returns.
 */
export type FrameMessage = {
  type: 'frame'
  densityPhase: Float32Array
  t: number
  norm: number
  maxDensity: number
  potentialVersion: number
  /** Sampled potential, one `f32` per grid point; sent only when it changed. */
  potential?: Float32Array
  /**
   * Live observables (Task 11), attached every `OBSERVABLES_CADENCE`-th
   * frame while the cadence flag is on. A plain object of numbers —
   * structurally cloned cheaply, never part of the transfer list — so it
   * leaves the densityPhase buffer-recycling channel untouched.
   */
  obs?: ObservablesFrame
}

/**
 * The 11 live observables (Task 11), camelCased per this file's convention.
 * Comes from `Simulation2D.observables()`; `toObservables` is the single
 * source of truth for the flat-array -> object mapping.
 */
export interface ObservablesFrame {
  x: number
  y: number
  sigmaX: number
  sigmaY: number
  px: number
  py: number
  sigmaPx: number
  sigmaPy: number
  kinetic: number
  potential: number
  energy: number
}

/**
 * Frames between two `obs` blocks (Task 11 cadence): an FFT-backed snapshot
 * per frame would be waste — 4 frames (~15 Hz of samples at 60 fps) is well
 * past what a sparkline can show.
 */
export const OBSERVABLES_CADENCE = 4

/**
 * Maps the wasm `Simulation2D.observables()` array onto `ObservablesFrame`.
 * The index order is the one documented in wasm/src/lib.rs — EXACTLY:
 * [x, y, sigma_x, sigma_y, px, py, sigma_px, sigma_py, kinetic, potential,
 * energy]. Unit-tested field-by-field; nothing else may re-derive this
 * order.
 */
export function toObservables(a: number[] | Float64Array): ObservablesFrame {
  return {
    x: a[0],
    y: a[1],
    sigmaX: a[2],
    sigmaY: a[3],
    px: a[4],
    py: a[5],
    sigmaPx: a[6],
    sigmaPy: a[7],
    kinetic: a[8],
    potential: a[9],
    energy: a[10],
  }
}

/**
 * Pure worker cadence decision (Task 11): with the flag on, a frame ships
 * `obs` when its 0-based counter sits on a multiple of OBSERVABLES_CADENCE.
 * The worker resets the counter to 0 when the flag turns on, so the very
 * next frame carries obs — no 4-frame dead delay after the toggle.
 */
export function shouldSendObs(frameCount: number, obsOn: boolean): boolean {
  return obsOn && frameCount % OBSERVABLES_CADENCE === 0
}

/** Worker -> main: an unrecoverable error (norm drift, bad params, panic). */
export type FatalMessage = { type: 'fatal'; message: string }

export type WorkerToMain = FrameMessage | FatalMessage
