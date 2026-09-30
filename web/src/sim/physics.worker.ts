/**
 * The physics Web Worker: sole owner of the wasm `Simulation2D`. Handles the
 * whole MainToWorker protocol (see protocol.ts); every reply is either a
 * `frame` (densityPhase transferred zero-copy via the postMessage transfer
 * list) or a `fatal` that halts advancing until a `reset-wave`.
 *
 * Ordering: the only `await` in the message path is the one-time wasm load,
 * and every handler awaits the same cached promise, so continuations run in
 * message-arrival order — `init` is always processed before the first
 * `advance` behind it.
 */
import type { MainToWorker, WorkerToMain } from './protocol.js'
import { loadWasm, type WasmModule } from './wasm.js'

/**
 * Dedicated-worker scope. Narrowed by a local declaration (instead of the
 * webworker lib, which clashes with the DOM lib the rest of the app uses):
 * `postMessage(message, transfer)` is the worker signature we rely on.
 */
declare const self: {
  onmessage: ((ev: MessageEvent<MainToWorker>) => void) | null
  postMessage(message: WorkerToMain, transfer: Transferable[]): void
}

type Simulation2D = InstanceType<WasmModule['Simulation2D']>

let sim: Simulation2D | undefined
let wasmReady: Promise<WasmModule> | undefined
/** Set by any fatal error; blocks `advance` until `reset-wave`/`init`. */
let halted = false
/** potential_version last shipped to the main thread (-1 = nothing yet). */
let lastSentPotentialVersion = -1
/**
 * Frame buffers the main thread returned via `advance.recycle` (Task-6
 * micro-opt): transferring a buffer detaches it here, so ping-pong reuse is
 * only possible when main lends each buffer back after its upload. With at
 * most one advance in flight, steady state cycles ~two buffers instead of
 * orphaning every frame's ~0.5-2 MB to the GC on either side.
 */
const recyclePool: Float32Array[] = []
/**
 * maxDensity scan cadence (Task-6 micro-opt b): every 2nd frame the scan
 * is skipped and the previous frame's peak is shipped instead — the main
 * thread's display peak is already a 0.97/frame EMA over maxDensity, so
 * one frame of staleness is invisible. State resets (`init`,
 * `set-gaussian`, `reset-wave`) force the next scan: a fresh packet's peak
 * must not ride the old state's value.
 */
let scanMaxDensity = true
let lastMaxDensity = 0

function fatal(message: string): void {
  halted = true
  self.postMessage({ type: 'fatal', message }, [])
}

function ensureWasm(): Promise<WasmModule> {
  wasmReady ??= loadWasm()
  return wasmReady
}

/**
 * Ships the current state as a `frame`: interleaved (rho, phi) buffer plus
 * the sampled potential, but only when its revision moved since the last
 * shipped frame (the renderer caches the potential texture). The frame
 * buffer is a recycled one when the pool has a same-size spare (.set()
 * copy; wasm's `density_phase()` always returns a fresh array); everything
 * shipped goes into the transfer list — the worker never touches it again.
 */
function postFrame(t: number): void {
  if (sim === undefined) return
  const fresh = sim.density_phase()
  const norm = sim.norm()

  // |psi|^2 lives at even indices of the interleaved pairs; wasm exposes no
  // max getter, and one linear scan over rho is ~0.1 ms at 512^2 — halved
  // by the every-2nd-frame cadence (see scanMaxDensity).
  let maxDensity: number
  if (scanMaxDensity) {
    maxDensity = 0
    for (let i = 0; i < fresh.length; i += 2) {
      if (fresh[i] > maxDensity) maxDensity = fresh[i]
    }
    lastMaxDensity = maxDensity
  } else {
    maxDensity = lastMaxDensity
  }
  scanMaxDensity = !scanMaxDensity

  const pooled = recyclePool.pop()
  const densityPhase =
    pooled !== undefined && pooled.length === fresh.length
      ? pooled
      : new Float32Array(fresh.length)
  densityPhase.set(fresh)

  const potentialVersion = sim.potential_version()
  const transfer: Transferable[] = [densityPhase.buffer]
  let potential: Float32Array | undefined
  if (potentialVersion !== lastSentPotentialVersion) {
    potential = sim.read_potential_f32()
    transfer.push(potential.buffer)
    lastSentPotentialVersion = potentialVersion
  }

  self.postMessage(
    { type: 'frame', densityPhase, t, norm, maxDensity, potentialVersion, potential },
    transfer,
  )
}

self.onmessage = (ev: MessageEvent<MainToWorker>): void => {
  void (async () => {
    const msg = ev.data
    try {
      const wasm = await ensureWasm()
      switch (msg.type) {
        case 'init': {
          sim = new wasm.Simulation2D(
            msg.nx,
            msg.ny,
            msg.extentX,
            msg.extentY,
            msg.dt,
            msg.m,
            msg.hbar,
          )
          halted = false
          lastSentPotentialVersion = -1
          // A fresh sim may have different dims; stale pooled buffers would
          // fail the same-size check anyway — drop them up front. Its first
          // frame must also scan maxDensity fresh.
          recyclePool.length = 0
          scanMaxDensity = true
          break
        }
        case 'set-gaussian': {
          if (sim === undefined) throw new Error('set-gaussian before init')
          sim.set_gaussian(msg.x0, msg.y0, msg.kx, msg.ky, msg.sigmaX, msg.sigmaY)
          // set_gaussian resets t = 0; ship the fresh state right away so a
          // dropped packet is visible (and t = 0 observable) even while the
          // simulation is paused. advance(0) is the no-step t getter. The
          // new packet's peak needs a fresh scan, not the old state's.
          scanMaxDensity = true
          postFrame(sim.advance(0))
          break
        }
        case 'advance': {
          // Bank the returned frame buffer before any early return so a
          // dropped advance never leaks it; same-size check happens at use.
          if (msg.recycle !== undefined) {
            recyclePool.push(new Float32Array(msg.recycle))
          }
          // After a fatal the worker refuses advances until reset-wave; the
          // main loop has already stopped on the fatal, so no reply needed.
          if (halted || sim === undefined) return
          const t = sim.advance(msg.substeps)
          postFrame(t)
          break
        }
        case 'reset-wave': {
          if (sim === undefined) throw new Error('reset-wave before init')
          sim.reset_wave()
          halted = false
          scanMaxDensity = true
          postFrame(0)
          break
        }
        case 'restore-potential':
        case 'potential-zero':
        case 'potential-harmonic':
        case 'potential-wall':
        case 'paint-disc':
        case 'paint-segment': {
          if (sim === undefined) throw new Error(`${msg.type} before init`)
          // Every potential mutation bumps potential_version by 1; ship a
          // frame right away (advance(0) is the t getter) so the edit is
          // visible even while the simulation is paused.
          switch (msg.type) {
            case 'restore-potential':
              sim.restore_potential()
              break
            case 'potential-zero':
              sim.potential_zero()
              break
            case 'potential-harmonic':
              sim.potential_harmonic(msg.omega)
              break
            case 'potential-wall':
              sim.potential_wall(
                msg.xCenter,
                msg.thickness,
                msg.value,
                new Float64Array(msg.gapCenters),
                new Float64Array(msg.gapWidths),
              )
              break
            case 'paint-disc':
              sim.paint_disc(msg.cx, msg.cy, msg.r, msg.value)
              break
            case 'paint-segment':
              sim.paint_segment(
                msg.x1,
                msg.y1,
                msg.x2,
                msg.y2,
                msg.thickness,
                msg.value,
              )
              break
          }
          postFrame(sim.advance(0))
          break
        }
      }
    } catch (error) {
      fatal(error instanceof Error ? error.message : String(error))
    }
  })()
}
