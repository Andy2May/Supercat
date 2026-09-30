/**
 * Svelte 5 runes orchestration around the physics worker (single app-level
 * instance). Lives in a `.svelte.ts` module — the only file extension the
 * Svelte compiler processes for runes outside components.
 *
 * Responsibilities: worker lifecycle (`init` from `?grid=N`, default 512,
 * accept 128/256/512; `destroy()` terminates), the reactive surface the UI
 * reads (`running`, `t`, `norm`, `frames`, `fatal`, perf stats), `send(msg)`
 * for every MainToWorker message, and `onFrame(cb)` for the render loop.
 *
 * Interim scene (Task 16 replaces it with the double slit): after `init` a
 * free spreading gaussian `set-gaussian(x0=-8, y0=0, kx=4, ky=0, sigma=1.5)`
 * with V = 0, then autoplay.
 */
import { DEFAULTS, parseGridParam } from './simParams.js'
import type { FrameMessage, MainToWorker, WorkerToMain } from './protocol.js'

/** Perf HUD sample: fps (1 s EMA), substeps of the last advance, and the
 * post-advance -> frame-arrival latency in ms. */
export interface PerfStats {
  fps: number
  substeps: number
  workerMs: number
}

declare global {
  interface Window {
    /** Perf-probe mirror (rounded), present only under `?perf=1`. */
    __psiforgePerf?: PerfStats
  }
}

function readParams(): URLSearchParams {
  return typeof location === 'undefined'
    ? new URLSearchParams()
    : new URLSearchParams(location.search)
}

export class SimStore {
  /** Autoplay flag: the rAF loop posts advances only while this is true. */
  running = $state(false)
  /** Latest frame's simulation time / norm; 0 until the first frame. */
  t = $state(0)
  norm = $state(0)
  /** Worker frames received (== frames drawn; drawing is frame-driven). */
  frames = $state(0)
  /** Set by a worker `fatal`; cleared by the next `init`. */
  fatal = $state<string | undefined>(undefined)

  /** Grid edge count selected via `?grid=` (plain: fixed for the session). */
  readonly grid: number
  /** Perf HUD enabled via `?perf=1` (plain: fixed for the session). */
  readonly perfMode: boolean
  /** Live HUD numbers; mutated in place by the render loop each frame. */
  perf = $state<PerfStats>({ fps: 0, substeps: 0, workerMs: 0 })

  private worker: Worker | undefined
  private readonly frameListeners = new Set<(frame: FrameMessage) => void>()

  constructor() {
    const params = readParams()
    this.grid = parseGridParam(params.get('grid'))
    this.perfMode = params.get('perf') === '1'
    if (this.perfMode && typeof window !== 'undefined') {
      window.__psiforgePerf = { fps: 0, substeps: 0, workerMs: 0 }
    }
  }

  /** Idempotent: creates the worker (once), sends `init` + the interim
   * `set-gaussian`, and starts playback. `destroy()` allows a later re-init. */
  init(): void {
    if (this.worker !== undefined) return
    this.fatal = undefined
    const worker = new Worker(new URL('./physics.worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (ev: MessageEvent<WorkerToMain>) => {
      this.receive(ev.data)
    }
    this.worker = worker
    this.send({
      type: 'init',
      nx: this.grid,
      ny: this.grid,
      extentX: DEFAULTS.extent,
      extentY: DEFAULTS.extent,
      dt: DEFAULTS.dt,
      m: DEFAULTS.m,
      hbar: DEFAULTS.hbar,
    })
    this.send({
      type: 'set-gaussian',
      x0: -8,
      y0: 0,
      kx: 4,
      ky: 0,
      sigmaX: 1.5,
      sigmaY: 1.5,
    })
    this.running = true
  }

  send(msg: MainToWorker): void {
    this.worker?.postMessage(msg)
  }

  /** Subscribes to worker frames; returns the unsubscribe closure. */
  onFrame(cb: (frame: FrameMessage) => void): () => void {
    this.frameListeners.add(cb)
    return () => {
      this.frameListeners.delete(cb)
    }
  }

  /** Tears the worker down for good (component unmount). */
  destroy(): void {
    this.worker?.terminate()
    this.worker = undefined
    this.running = false
  }

  private receive(msg: WorkerToMain): void {
    if (msg.type === 'fatal') {
      this.fatal = msg.message
      this.running = false
      return
    }
    this.t = msg.t
    this.norm = msg.norm
    this.frames++
    for (const cb of this.frameListeners) cb(msg)
  }
}

/** Single app-level instance — App.svelte mounts/destroys it. */
export const simStore = new SimStore()
