/**
 * Svelte 5 runes orchestration around the physics worker (single app-level
 * instance). Lives in a `.svelte.ts` module — the only file extension the
 * Svelte compiler processes for runes outside components.
 *
 * Responsibilities: worker lifecycle (`init(preset)` — grid from the preset,
 * overridable via `?grid=N` accepting 128/256/512; `destroy()` terminates),
 * the reactive surface the UI reads (`running`, `speed`, `t`, `norm`,
 * `frames`, `fatal`, perf stats), `send(msg)` for every MainToWorker message,
 * and `onFrame(cb)` for the render loop.
 *
 * The scene comes from the preset registry (`src/presets`): `init` sends the
 * preset's potential + gaussian, then applies its autoplay flag.
 */
import { DEFAULTS, GRID_SIZES, type GridSize } from './simParams.js'
import { modeStore } from './modeStore.svelte.js'
import type { FrameMessage, MainToWorker, ObservablesFrame, WorkerToMain } from './protocol.js'
import { potentialMessage, type PresetConfig } from '../presets/index.js'
import { ringPush } from './sparkline.js'

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
  /**
   * Playback speed (sim-seconds per wall-second), slider-bound in
   * [0.1, 5]. The render loop reads it live; `DEFAULTS.speed` is the boot
   * value, not a const capture.
   */
  speed = $state(DEFAULTS.speed)
  /** Latest frame's simulation time / norm; 0 until the first frame. */
  t = $state(0)
  norm = $state(0)
  /** Worker frames received (== frames drawn; drawing is frame-driven). */
  frames = $state(0)
  /** Set by a worker `fatal`; cleared by the next `init`. */
  fatal = $state<string | undefined>(undefined)

  /**
   * Effective grid edge count: the `?grid=` override when valid, else the
   * last `init` preset's grid (256 until then). Plain, not reactive — it
   * changes once per scene load and is read by the render loop's texture
   * uploads, not by any derived value.
   */
  grid: number
  /** A valid `?grid=` URL selection (128/256/512); undefined when absent or
   * unsupported — then the preset's grid wins. (Plain: fixed for session.) */
  readonly gridOverride: GridSize | undefined
  /** Perf HUD enabled via `?perf=1` (plain: fixed for the session). */
  readonly perfMode: boolean
  /**
   * Test-only fake-fatal switch (`?debugFatal=1`): the store kills playback
   * from the main thread ~1 s after boot so the banner + frozen-loop +
   * reset-and-run path can be e2e-tested without provoking a real error.
   */
  readonly debugFatal: boolean
  /** Live HUD numbers; mutated in place by the render loop each frame. */
  perf = $state<PerfStats>({ fps: 0, substeps: 0, workerMs: 0 })

  /**
   * Observables side-channel history (Task 11): every frame that carries
   * `obs` appends `{t, ...obs}` through a 600-sample ring (ringPush). The
   * ObservablesBar sparklines read it; `init`/`destroy` reset it so a preset
   * switch never shows the previous scene's curves (Review Focus 3).
   */
  observablesHistory = $state<(ObservablesFrame & { t: number })[]>([])

  /**
   * Bumped by every `init` (plain, not reactive — only the render loop's
   * plain rAF tick reads it). Lets `simLoop` detect a destroy()+init()
   * worker swap mid-session and drop in-flight advance state instead of
   * deadlocking on an answer the terminated worker will never send.
   */
  epoch = 0

  private worker: Worker | undefined
  private readonly frameListeners = new Set<(frame: FrameMessage) => void>()

  constructor() {
    const params = readParams()
    const rawGrid = params.get('grid')
    const n = rawGrid === null ? Number.NaN : Number(rawGrid)
    this.gridOverride = (GRID_SIZES as readonly number[]).includes(n)
      ? (n as GridSize)
      : undefined
    this.grid = this.gridOverride ?? 256
    this.perfMode = params.get('perf') === '1'
    this.debugFatal = params.get('debugFatal') === '1'
    if (this.perfMode && typeof window !== 'undefined') {
      window.__psiforgePerf = { fps: 0, substeps: 0, workerMs: 0 }
    }
  }

  /** Idempotent: creates the worker (once), sends `init` + the preset's
   * potential and packet, and applies the preset's autoplay flag.
   * `destroy()` allows a later re-init. A fresh init resets every reactive
   * field (t, norm, frames, fatal, observablesHistory) so a re-init with a
   * different preset never shows the previous scene's state (Review Focus
   * 3/5). */
  init(preset: PresetConfig): void {
    if (this.worker !== undefined) return
    this.fatal = undefined
    this.t = 0
    this.norm = 0
    this.frames = 0
    this.observablesHistory = []
    // Parked T8 finding: without this, a preset switch inherits the previous
    // scene's HUD numbers until the next frame overwrites them (and under
    // `?perf=1` the window mirror would too).
    this.perf.fps = 0
    this.perf.substeps = 0
    this.perf.workerMs = 0
    if (typeof window !== 'undefined' && window.__psiforgePerf !== undefined) {
      window.__psiforgePerf.fps = 0
      window.__psiforgePerf.substeps = 0
      window.__psiforgePerf.workerMs = 0
    }
    this.epoch++
    this.grid = this.gridOverride ?? preset.grid
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
    this.send(potentialMessage(preset.potential))
    if (preset.packet !== undefined) {
      this.send({ type: 'set-gaussian', ...preset.packet })
    }
    // Boot-time half of the observables cadence wiring (Task 11): a reload
    // straight into advanced mode must not depend on App's mode-flip effect
    // having run. The worker's default is off, so explore stays quiet here;
    // App's effect covers live advanced <-> explore toggles (and re-sends
    // per preset switch — the handler is idempotent).
    if (modeStore.mode === 'advanced') {
      this.send({ type: 'set-observables-cadence', on: true })
    }
    this.running = preset.autoplay
    if (this.debugFatal && typeof window !== 'undefined') {
      window.setTimeout(() => {
        if (this.worker === undefined) return
        this.fatal = 'debugFatal (test param)'
        this.running = false
      }, 1_000)
    }
  }

  /**
   * The recovery action: sends `reset-wave` (ψ -> snapshot, t=0; the worker
   * also un-halts) and clears the fatal banner. The caller decides whether
   * to resume (`running = true`) — the banner's button does, the playback
   * bar's reset keeps the current play state.
   */
  resetWave(): void {
    this.fatal = undefined
    this.send({ type: 'reset-wave' })
  }

  /**
   * Posts to the worker; `transfer` (the recycle channel's returned frame
   * buffer) moves backing stores zero-copy instead of structured-cloning
   * them.
   */
  send(msg: MainToWorker, transfer: Transferable[] = []): void {
    this.worker?.postMessage(msg, transfer)
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
    this.observablesHistory = []
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
    if (msg.obs !== undefined) {
      // Mutating the $state proxy array through ringPush notifies the
      // ObservablesBar's redraw effect (push drops the oldest past 600).
      ringPush(this.observablesHistory, { t: msg.t, ...msg.obs })
    }
    for (const cb of this.frameListeners) cb(msg)
  }
}

/** Single app-level instance — App.svelte mounts/destroys it. */
export const simStore = new SimStore()
