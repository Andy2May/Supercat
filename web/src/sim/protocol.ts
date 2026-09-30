/**
 * Wire protocol between the main thread and the simulation Web Worker
 * (Task 11). Pure types — no runtime code — so both sides import the exact
 * same contract without pulling in execution order dependencies.
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
  | { type: 'advance'; substeps: number }
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
}

/** Worker -> main: an unrecoverable error (norm drift, bad params, panic). */
export type FatalMessage = { type: 'fatal'; message: string }

export type WorkerToMain = FrameMessage | FatalMessage
