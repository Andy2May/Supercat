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
 * shipped frame (the renderer caches the potential texture). Both buffers
 * go into the transfer list — the worker never touches them again.
 */
function postFrame(t: number): void {
  if (sim === undefined) return
  const densityPhase = sim.density_phase()
  const norm = sim.norm()

  // |psi|^2 lives at even indices of the interleaved pairs; wasm exposes no
  // max getter, and one linear scan over rho is ~0.1 ms at 512^2.
  let maxDensity = 0
  for (let i = 0; i < densityPhase.length; i += 2) {
    if (densityPhase[i] > maxDensity) maxDensity = densityPhase[i]
  }

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
          break
        }
        case 'set-gaussian': {
          if (sim === undefined) throw new Error('set-gaussian before init')
          sim.set_gaussian(msg.x0, msg.y0, msg.kx, msg.ky, msg.sigmaX, msg.sigmaY)
          break
        }
        case 'advance': {
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
          postFrame(0)
          break
        }
        case 'restore-potential':
        case 'potential-zero':
        case 'potential-harmonic':
        case 'potential-wall':
        case 'paint-disc':
        case 'paint-segment': {
          // The wasm crate exposes no potential mutation yet (Tasks 12/13);
          // refuse loudly rather than pretend the edit landed.
          throw new Error(`message type '${msg.type}' is not implemented by the wasm bindings yet`)
        }
      }
    } catch (error) {
      fatal(error instanceof Error ? error.message : String(error))
    }
  })()
}
