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
import { modeStore, type Mode } from './modeStore.svelte.js'
import type {
  FrameMessage,
  MainToWorker,
  MeasuredOutcome,
  ObservablesFrame,
  StateMessage,
  WorkerToMain,
} from './protocol.js'
import { potentialMessage, type PresetConfig } from '../presets/index.js'
import { ringPush } from './sparkline.js'
import type { RawState } from './stateFile.js'

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

/** Which space the sim canvas displays (Task 12): |psi(x)|^2 or |phi(k)|^2. */
export type SimView = 'position' | 'momentum'

/**
 * Pure explore-snapback predicate (Task 12): the momentum view is
 * advanced-mode only (Task 7 gating), so App.svelte reconciles the stored
 * view against the experience mode on every flip — explore always resolves
 * to 'position'. Extracted pure so the transition is unit-testable without
 * a DOM; App's effect only acts when this disagrees with the stored view,
 * which is what makes the snapback send `set-momentum-view off` exactly
 * once.
 */
export function effectiveView(mode: Mode, view: SimView): SimView {
  return mode === 'advanced' ? view : 'position'
}

/**
 * Pure render-mode predicate (Task 13): the HSV phase colormap applies only
 * in ADVANCED + POSITION view. Two independent disqualifiers:
 *   - momentum view: the k-space texture interleaves (v, 0), so its phase
 *     channel is 0 everywhere and hue would be a garbage constant — momentum
 *     frames ALWAYS render density inferno;
 *   - explore mode (spec v1 §2.1): explore has no phase colormap at all —
 *     the stored flag may persist into explore (nothing resets it), but the
 *     canvas must fall back to inferno there or the user would be stuck
 *     with HSV and no button to turn it off.
 * The stored `phaseColor` flag survives explore/momentum round-trips
 * untouched; when advanced + position return, the coloring resumes.
 */
export function effectiveColorMode(view: SimView, phaseColor: boolean, mode: Mode): 0 | 1 {
  return mode === 'advanced' && view === 'position' && phaseColor ? 1 : 0
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
  /**
   * Displayed space (Task 12): position |psi(x)|^2 (default) or momentum
   * |phi(k)|^2 (advanced only). `setView` drives the worker flag; `init`
   * resets to position (the fresh worker boots with its own flag off, so
   * no message is needed on init).
   */
  view = $state<SimView>('position')
  /**
   * HSV phase colormap on (Task 13): PURE render state — flipping it sends
   * nothing to the worker. The flag is only a REQUEST: the render loop
   * derives the effective u_colorMode every frame via `effectiveColorMode`,
   * which honors it solely in advanced + position view (explore and
   * momentum always render inferno — spec v1 §2.1 / phaseless k-space
   * texture). Nothing clears it on explore or momentum round-trips (the
   * button hides, the flag survives, the coloring resumes); `init` does (a
   * fresh scene boots on the inferno default).
   */
  phaseColor = $state(false)
  /** Set by a worker `fatal`; cleared by the next `init`. */
  fatal = $state<string | undefined>(undefined)
  /**
   * NON-fatal load error (Task 17): set when a JSON state file fails to
   * decode (main thread) or fails wasm's deserialize validation (worker
   * `load-error`). Unlike `fatal` it never stops the simulation — the
   * banner is informational. Cleared by `init` (covers preset switches)
   * and optimistically by App the moment a fresh file passes decoding.
   */
  loadError = $state<string | undefined>(undefined)
  /**
   * Latest measurement outcome (Task 14): set (a fresh object each time —
   * identical coordinates still re-trigger the marker/toast effect) when a
   * frame carrying `measured` lands, read by SimCanvas to spawn the ring
   * marker + toast. Cleared by `init` so a preset switch never flashes the
   * previous scene's outcome.
   */
  lastMeasurement = $state<MeasuredOutcome | undefined>(undefined)

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

  /**
   * PNG export queue (Task 16): plain counter, NOT reactive — consumed by
   * the render loop inside its frame callback. Every export-button click
   * queues exactly one capture; the loop takes one per drawn frame. A
   * boolean flag would collapse two clicks landing inside the same
   * inter-frame gap (< 16 ms) into a single file — the counter keeps the
   * one-click-one-file contract.
   */
  capturePending = 0

  private worker: Worker | undefined
  private readonly frameListeners = new Set<(frame: FrameMessage) => void>()
  /**
   * `state`-reply subscribers (Task 17): App registers one to encode the
   * serialized payload and trigger the JSON download. Same pattern as
   * `frameListeners` — a Set + unsubscribe closure, so the download path
   * survives any number of mount/unmount cycles.
   */
  private readonly stateListeners = new Set<(state: StateMessage) => void>()
  /**
   * Grid to RESTORE if the in-flight cross-grid state load is rejected
   * (Task 17 fix round 1): `loadState` switches `grid` to the file's grid
   * up front (the render loop sizes every upload from it), so a rejection
   * must put the session grid back — otherwise the still-running old-grid
   * sim would have every frame dropped by the render loop's grid guard
   * and the canvas would freeze forever. Cleared by the load's
   * confirmation frame (sized for the NEW grid) or by `init`.
   */
  private pendingGridRestore: number | undefined

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
    this.loadError = undefined
    this.pendingGridRestore = undefined
    this.lastMeasurement = undefined
    this.t = 0
    this.norm = 0
    this.frames = 0
    this.view = 'position'
    this.phaseColor = false
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
   * Switches the displayed space (Task 12). A no-op when already there —
   * repeated clicks (or re-running effects) must not spam the worker with
   * flag messages. The worker resets its cadence counter on this message,
   * so the first frame after an "on" toggle already carries momentum data.
   */
  setView(next: SimView): void {
    if (this.view === next) return
    this.view = next
    this.send({ type: 'set-momentum-view', on: next === 'momentum' })
  }

  /**
   * Queues a PNG snapshot of the canvas (Task 16). The capture itself
   * runs in the render loop's next frame callback, synchronously after
   * `draw()` — the only point where the (preserveDrawingBuffer:false)
   * backbuffer is guaranteed readable. No worker message involved: this
   * is a main-thread render concern.
   */
  requestCapture(): void {
    this.capturePending++
  }

  /**
   * Hands a decoded state file to the worker (Task 17) and owns the grid
   * bookkeeping a CROSS-GRID load needs: `grid` switches to the file's
   * grid right here (the render loop sizes every texture upload from it
   * and drops straggler old-grid frames), with the previous grid
   * remembered in `pendingGridRestore` and restored if the worker's
   * answer is a `load-error` — a rejected construct/deserialize must
   * leave the session exactly as it was, or the still-running old-grid
   * sim would never draw again.
   */
  loadState(raw: RawState): void {
    this.loadError = undefined // optimistic; a rejection re-sets it
    if (raw.nx !== this.grid) {
      this.pendingGridRestore = this.grid
      this.grid = raw.nx
    } else {
      this.pendingGridRestore = undefined
    }
    this.send(
      {
        type: 'deserialize-state',
        nx: raw.nx,
        ny: raw.ny,
        extentX: raw.extentX,
        extentY: raw.extentY,
        dt: raw.dt,
        m: raw.m,
        hbar: raw.hbar,
        t: raw.t,
        potential: raw.potential,
        psi: raw.psi,
      },
      [raw.potential.buffer, raw.psi.buffer],
    )
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

  /**
   * Subscribes to `state` replies (Task 17, the answer to `serialize-state`
   * — a send the App side triggers with its Save button); same contract as
   * `onFrame`. The payload's arrays were transferred to this thread, so
   * each subscriber must treat them as read-only single-shot data.
   */
  onState(cb: (state: StateMessage) => void): () => void {
    this.stateListeners.add(cb)
    return () => {
      this.stateListeners.delete(cb)
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
    if (msg.type === 'state') {
      // The serialized scene (Task 17): handed to the save subscribers —
      // App encodes it into the JSON download. Not frame-shaped; nothing
      // else here applies.
      for (const cb of this.stateListeners) cb(msg)
      return
    }
    if (msg.type === 'load-error') {
      // A rejected state file (Task 17): informational only — the worker
      // kept the live simulation running. A cross-grid attempt had moved
      // `grid` to the file's grid; put it back so the old sim's frames
      // pass the render loop's grid guard again (fix round 1: without
      // this, every frame was dropped and the canvas froze forever).
      if (this.pendingGridRestore !== undefined) {
        this.grid = this.pendingGridRestore
        this.pendingGridRestore = undefined
      }
      this.loadError = msg.message
      return
    }
    // The confirmation frame of a pending cross-grid load: sized for the
    // NEW grid (which `loadState` already installed in `this.grid`), so
    // the attempt landed — the rollback marker is spent. A straggler
    // old-grid frame can never match this size (that's the guard's own
    // criterion), and worker messages keep arrival order, so this cannot
    // fire early.
    if (
      this.pendingGridRestore !== undefined &&
      msg.densityPhase.length === 2 * this.grid * this.grid
    ) {
      this.pendingGridRestore = undefined
    }
    this.t = msg.t
    this.norm = msg.norm
    this.frames++
    if (msg.obs !== undefined) {
      // Mutating the $state proxy array through ringPush notifies the
      // ObservablesBar's redraw effect (push drops the oldest past 600).
      ringPush(this.observablesHistory, { t: msg.t, ...msg.obs })
    }
    if (msg.measured !== undefined) {
      // Fresh object identity per outcome: consecutive measurements landing
      // on the same spot must still re-fire the marker/toast effect.
      this.lastMeasurement = msg.measured
    }
    for (const cb of this.frameListeners) cb(msg)
  }
}

/** Single app-level instance — App.svelte mounts/destroys it. */
export const simStore = new SimStore()
