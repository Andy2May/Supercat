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
import {
  shouldSendMomentum,
  shouldSendObs,
  toObservables,
  type MainToWorker,
  type MeasuredOutcome,
  type ObservablesFrame,
  type WorkerToMain,
} from './protocol.js'
import { fftshift2d } from './fftshift.js'
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
/**
 * Observables side-channel (Task 11): `set-observables-cadence` flips this
 * flag; while on, every OBSERVABLES_CADENCE-th postFrame attaches an `obs`
 * block (a plain object — structured-cloned, never in the transfer list,
 * so the densityPhase recycle channel is untouched). The frame counter
 * resets when the flag turns on so the first frame after the toggle
 * carries obs immediately.
 */
let obsOn = false
let frameCount = 0
/**
 * Momentum-space view (Task 12): `set-momentum-view` flips this flag; while
 * on, every OBSERVABLES_CADENCE-th postFrame also attaches a
 * `momentumDensity` block (a separate FFT from the observables pass —
 * `momentum_density()` is its own wasm call), fftshifted so k = 0 sits at
 * the display center and transferred (a fresh array every time; the main
 * thread copies it into a reused scratch buffer, so no recycle channel is
 * needed). `densityPhase` keeps flowing regardless — position data feeds
 * the charts and the switch back. Reset on `init` like every other
 * worker-session flag.
 */
let momentumView = false
/** Grid dims from `init` — fftshift2d needs them; 0 until boot. */
let gridNx = 0
let gridNy = 0
/**
 * One-shot momentum cadence override (Task 14): either measure handler sets
 * this so the IMMEDIATE post-collapse postFrame attaches momentumDensity
 * even when the 4-frame cadence would skip it — the momentum-view
 * crossfade must fade between old and new |phi(k)|^2 starting exactly on
 * the measured frame (a POSITION measurement also changes |phi(k)|^2, so
 * the k-space display must refresh on it too). Consumed (cleared) by the
 * very next postFrame, and still gated on `momentumView` — a collapse
 * watched in position view crossfades the position display, so no extra
 * FFT is owed.
 */
let forceMomentumNext = false

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
function postFrame(t: number, measured?: MeasuredOutcome): void {
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

  // Observables side-channel: decided before the counter ticks so a fresh
  // flag-on (counter reset to 0) sends on this very frame. Never runs while
  // halted — a dead sim must not pay the FFT, and its numbers would be the
  // stale pre-fatal state anyway. The plain object rides the structured
  // clone; nothing here touches `transfer`.
  let obs: ObservablesFrame | undefined
  if (!halted && shouldSendObs(frameCount, obsOn)) {
    obs = toObservables(sim.observables())
  }
  // Momentum view (Task 12): rides the SAME cadence counter and the same
  // first-frame-after-flag-on guarantee (the counter resets on the flag
  // message). The shifted copy is freshly allocated (wasm allocates,
  // fftshift2d copies), so it is safe to hand over via the transfer list —
  // and equally never pooled. Task 14's forceMomentumNext (set by
  // measure-momentum) overrides the cadence for THIS frame only; the flag
  // is consumed whether or not it fires (momentumView gate), so it can
  // never leak into a later view.
  let momentumDensity: Float32Array | undefined
  if (!halted && shouldSendMomentum(frameCount, momentumView, forceMomentumNext)) {
    momentumDensity = fftshift2d(sim.momentum_density(), gridNx, gridNy)
    transfer.push(momentumDensity.buffer)
  }
  forceMomentumNext = false
  frameCount++

  self.postMessage(
    {
      type: 'frame',
      densityPhase,
      t,
      norm,
      maxDensity,
      potentialVersion,
      potential,
      obs,
      momentumDensity,
      measured,
    },
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
          // frame must also scan maxDensity fresh. The momentum-view flag
          // is worker-session state: a brand-new sim boots in position view
          // (SimStore.init resets its own `view` field to match).
          recyclePool.length = 0
          scanMaxDensity = true
          momentumView = false
          forceMomentumNext = false
          gridNx = msg.nx
          gridNy = msg.ny
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
        case 'measure-position': {
          if (sim === undefined) throw new Error('measure-position before init')
          // wasm wants the seed as BigInt; the protocol carries a plain
          // number (< 2^48, exactly representable as a double).
          const out = sim.measure_position(BigInt(msg.seed))
          // The collapsed packet's |psi|^2 peak is nothing like the spread
          // state's — force a fresh maxDensity scan so the post-measure
          // exposure tracks the new state, then frame it AT ONCE: the
          // collapse must be visible immediately (spec 5.6), and the frame
          // carries the outcome for the crossfade + marker + toast. If the
          // user is watching k-space, |phi(k)|^2 collapsed too — the forced
          // momentum send below ships that on the same frame.
          scanMaxDensity = true
          forceMomentumNext = true
          postFrame(sim.advance(0), { kind: 'position', x: out.x, y: out.y })
          break
        }
        case 'measure-momentum': {
          if (sim === undefined) throw new Error('measure-momentum before init')
          const out = sim.measure_momentum(BigInt(msg.seed))
          // The k-space collapse must ride THIS frame when the view is
          // momentum (see forceMomentumNext above); the position collapse
          // is framed regardless — both spaces see the new state.
          scanMaxDensity = true
          forceMomentumNext = true
          postFrame(sim.advance(0), {
            kind: 'momentum',
            x: out.kx,
            y: out.ky,
            i: out.i,
            j: out.j,
          })
          break
        }
        case 'serialize-state': {
          if (sim === undefined) throw new Error('serialize-state before init')
          // serialize_state() returns its payload as a plain object
          // (scalars + two freshly-allocated Float32Arrays — see the wasm
          // docs); both arrays are wasm-owned copies, so they leave through
          // the transfer list untouched by any recycle channel.
          const s = sim.serialize_state() as {
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
          self.postMessage(
            {
              type: 'state',
              nx: s.nx,
              ny: s.ny,
              extentX: s.extentX,
              extentY: s.extentY,
              dt: s.dt,
              m: s.m,
              hbar: s.hbar,
              t: s.t,
              potential: s.potential,
              psi: s.psi,
            },
            [s.potential.buffer, s.psi.buffer],
          )
          break
        }
        case 'deserialize-state': {
          if (sim === undefined) throw new Error('deserialize-state before init')
          // A bad FILE is a caller problem, not a worker fault: every
          // failure below (fresh-sim construction with impossible scalars,
          // wasm's dimension/non-finite rejections) lands on load-error so
          // the live simulation keeps running untouched — never on fatal.
          // (wasm rejects atomically: a failed deserialize leaves the
          // target sim exactly as it was.)
          try {
            // Grid rule: wasm's deserialize only enforces nx/ny —
            // extent/dt/m/ħ are validated but NOT applied, and the
            // propagator is never rebuilt in place. A file saved on a
            // different grid therefore needs a FRESH Simulation2D built
            // from the file's own scalars (which is also what applies
            // them); the live reference is swapped only once construction
            // succeeded, so a rejection keeps the old sim.
            if (msg.nx !== gridNx || msg.ny !== gridNy) {
              sim = new wasm.Simulation2D(
                msg.nx,
                msg.ny,
                msg.extentX,
                msg.extentY,
                msg.dt,
                msg.m,
                msg.hbar,
              )
              gridNx = msg.nx
              gridNy = msg.ny
              // Same session reset an `init` does for a new grid: the
              // version/pool bookkeeping belongs to the old sim, and stale
              // pooled buffers would fail the same-size check anyway. The
              // experience flags (obsOn/momentumView) are session state —
              // they carry over untouched.
              lastSentPotentialVersion = -1
              recyclePool.length = 0
              halted = false
            }
            sim.deserialize_state({
              nx: msg.nx,
              ny: msg.ny,
              extentX: msg.extentX,
              extentY: msg.extentY,
              dt: msg.dt,
              m: msg.m,
              hbar: msg.hbar,
              t: msg.t,
              potential: msg.potential,
              psi: msg.psi,
            })
            // Ship the restored state AT ONCE (advance(0) is the t getter;
            // deserialize restored t) so the load is visible even while
            // paused. The loaded |psi|^2 peak is a different state's —
            // force a fresh maxDensity scan, and (if the user watches
            // k-space) a momentum snapshot on this very frame.
            scanMaxDensity = true
            forceMomentumNext = true
            postFrame(sim.advance(0))
          } catch (error) {
            self.postMessage(
              {
                type: 'load-error',
                message: error instanceof Error ? error.message : String(error),
              },
              [],
            )
          }
          break
        }
        case 'set-observables-cadence': {
          obsOn = msg.on
          // Land the flag change on the cadence grid: the next frame (count
          // 0) carries obs, so toggling advanced never waits 4 frames for
          // first data.
          frameCount = 0
          break
        }
        case 'set-momentum-view': {
          momentumView = msg.on
          // Same rephase as the observables flag: the very next frame
          // (count 0) carries momentum data — no 4-frame dead delay after
          // the toggle.
          frameCount = 0
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
