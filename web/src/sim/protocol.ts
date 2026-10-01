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
  | {
      /**
       * Turns the momentum-space side view on/off (Task 12): while on, every
       * `OBSERVABLES_CADENCE`-th frame carries a `momentumDensity` block
       * (fftshifted |phi(k)|^2, transferred) IN ADDITION to `densityPhase` —
       * position data must keep flowing so charts stay live and the switch
       * back to position view is instant. Same counter-reset-on-flag-on
       * behavior as the observables cadence: the first frame after the flag
       * turns on already carries momentum data. Advanced-mode only (Task 7
       * gating); a switch to explore sends `on: false`.
       */
      type: 'set-momentum-view'
      on: boolean
    }
  | {
      /**
       * Born-rule position measurement (Task 14): the worker samples the
       * outcome cell from |psi|^2 (wasm `measure_position`), collapses ψ
       * with the instrument Gaussian, renormalizes, and ships the collapsed
       * state as a frame carrying `measured` AT ONCE. `seed` is a plain
       * JS number (< 2^48); the worker crosses it to BigInt at the wasm
       * boundary. NOTE: the click/seed is only a TRIGGER — the outcome is
       * drawn from the Born distribution, never placed by the user.
       */
      type: 'measure-position'
      seed: number
    }
  | {
      /**
       * The k-space mirror (Task 14): samples a DFT bin with probability
       * |FFT2(psi)_k|^2, collapses ψ in momentum space, renormalizes, and
       * frames the result with `measured` (kx/ky wavenumbers + the sampled
       * bins). Same trigger-only contract as `measure-position`.
       */
      type: 'measure-momentum'
      seed: number
    }
  | {
      /**
       * JSON state save (Task 17): asks the worker to reply with a `state`
       * message holding wasm `serialize_state()`'s full payload (both
       * Float32Arrays transferred). The main thread encodes it to a file
       * via stateFile.ts — the worker never touches the codec.
       */
      type: 'serialize-state'
    }
  | {
      /**
       * JSON state load (Task 17): restores a decoded state file. The
       * arrays were transferred by the main thread (decodeState output,
       * zero-copy). GRID RULE: wasm `deserialize_state` enforces only
       * nx/ny (extent/dt/m/ħ are validated-finite-but-not-applied, and the
       * propagator is never rebuilt in place), so when the file's grid
       * differs from the live sim the worker first constructs a FRESH
       * `Simulation2D` from the file's own scalars — which is also what
       * correctly applies extent/dt/m/ħ — and deserializes into that.
       * Rejections arrive as `load-error`, never `fatal`: a bad file must
       * not stop the running simulation.
       */
      type: 'deserialize-state'
      nx: number
      ny: number
      extentX: number
      extentY: number
      dt: number
      m: number
      hbar: number
      t: number
      potential: Float32Array
      psi: Float32Array
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
  /**
   * Momentum-space density (Task 12): fftshifted |phi(k)|^2, one `f32` per
   * bin, row-major with kx fastest — the display view with k = 0 centered.
   * Attached every `OBSERVABLES_CADENCE`-th frame while the momentum-view
   * flag is on. A fresh array each time (wasm allocates, fftshift2d copies),
   * so the shifted buffer rides the transfer list — unlike `densityPhase`
   * it has no recycle channel; the main thread copies it into a reused
   * scratch buffer immediately and drops the transfer.
   */
  momentumDensity?: Float32Array
  /**
   * The measurement outcome this frame's state collapsed onto (Task 14):
   * present exactly on the frame the worker ships immediately after a
   * `measure-position` / `measure-momentum` message. `x`/`y` carry the
   * outcome in the natural coordinates of the kind — PHYSICAL grid
   * coordinates for a position measurement, kx/ky wavenumbers for a
   * momentum measurement. `i`/`j` (momentum kind only) add the sampled
   * fftfreq bin so the marker can map through the same fftshift the
   * display uses (see markers.ts `binToScreen`).
   */
  measured?: MeasuredOutcome
}

/** One Born-rule measurement outcome, riding the frame that carries the
 * collapsed state (see FrameMessage.measured). */
export interface MeasuredOutcome {
  kind: 'position' | 'momentum'
  /** position: physical x; momentum: kx (1/length). */
  x: number
  /** position: physical y; momentum: ky (1/length). */
  y: number
  /** Sampled fftfreq bin i (momentum kind only) — feeds binToScreen. */
  i?: number
  /** Sampled fftfreq bin j (momentum kind only) — feeds binToScreen. */
  j?: number
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

/**
 * Pure worker cadence decision for the momentum view (Task 12): identical
 * grid to `shouldSendObs` — an FFT-backed snapshot per frame would be waste,
 * and the momentum view rides the same 4-frame cadence with the same
 * reset-on-flag-on behavior (first frame after the toggle carries data).
 *
 * `force` (Task 14): a momentum measurement sets the worker's one-shot
 * `forceMomentumNext` flag so the IMMEDIATE post-measure frame carries
 * |phi(k)|^2 even off-cadence — the momentum-view crossfade needs the new
 * k-space texture on the very frame whose `measured` block starts it.
 */
export function shouldSendMomentum(
  frameCount: number,
  momentumView: boolean,
  force = false,
): boolean {
  return momentumView && (force || frameCount % OBSERVABLES_CADENCE === 0)
}

/** Worker -> main: an unrecoverable error (norm drift, bad params, panic). */
export type FatalMessage = { type: 'fatal'; message: string }

/**
 * Worker -> main: the full serialized state (Task 17), the one-frame reply
 * to `serialize-state`. Field-for-field wasm `serialize_state()`: the eight
 * scalars plus the sampled `potential` (`nx*ny` f32) and interleaved
 * `(re, im)` `psi` (`2*nx*ny` f32). Both arrays were freshly allocated by
 * wasm, so they ride the transfer list — the main thread's `encodeState`
 * reads them exactly once on the way into the JSON file.
 */
export type StateMessage = {
  type: 'state'
  nx: number
  ny: number
  extentX: number
  extentY: number
  dt: number
  m: number
  hbar: number
  t: number
  potential: Float32Array
  psi: Float32Array
}

/**
 * Worker -> main: a REJECTED state load (Task 17). The file failed wasm's
 * `deserialize_state` validation (shape/non-finite) — a caller-file
 * problem, deliberately NOT fatal: the live simulation keeps running
 * untouched, and the main thread surfaces `message` on the non-fatal
 * load-error banner.
 */
export type LoadErrorMessage = { type: 'load-error'; message: string }

export type WorkerToMain = FrameMessage | FatalMessage | StateMessage | LoadErrorMessage
