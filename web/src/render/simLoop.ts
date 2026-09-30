/**
 * Main-thread render loop bridging the worker store to the WebGL2 renderer
 * (replaces the Task-10 synthetic demo source). One rAF tick:
 *
 *   running && no advance in flight -> computeSubsteps(dtWall, speed, dt)
 *                                   -> post advance        (drop-if-busy:
 *                                      an unanswered advance skips the post,
 *                                      never queues; carries the previous
 *                                      frame's buffer back for reuse)
 *
 * A worker frame -> upload field (+ potential when shipped) -> draw ->
 * refresh the debug hook and the perf HUD. Drawing is frame-driven, so a
 * paused simulation draws nothing and `debugState.frames` freezes.
 */
import { computeSubsteps, DEFAULTS, nextFpsEma } from '../sim/simParams.js'
import type { SimStore } from '../sim/simStore.svelte.js'
import { debugState } from './debugHook.js'
import { HeatmapRenderer } from './renderer.js'

/** Max |V| over the shipped potential — scales the shader's V overlay. */
function maxAbs(values: Float32Array): number {
  let max = 0
  for (let i = 0; i < values.length; i++) {
    const a = Math.abs(values[i])
    if (a > max) max = a
  }
  return max
}

export function startSimLoop(canvas: HTMLCanvasElement, store: SimStore): () => void {
  const renderer = new HeatmapRenderer(canvas)

  let raf = 0
  let disposed = false
  let last = performance.now()
  /** True from posting an advance until its frame answer lands. */
  let advanceInFlight = false
  let postedAt = 0
  let lastSubsteps = 0
  let fpsEma = 0
  let lastDrawAt = 0
  let potentialMax = 0
  /**
   * Smoothed display peak of |psi|^2 — the renderer's auto-exposure
   * reference. Follows rises instantly (a fresh packet jumps to full
   * brightness at once) and decays slowly (x0.97 per frame, ~0.4 s half-life)
   * so the picture neither flickers as the packet spreads nor snaps dark the
   * instant the peak dips.
   */
  let displayMax = 0

  /**
   * True between webglcontextlost and webglcontextrestored: every renderer
   * call is skipped (GL calls on a lost context are silent no-ops, but
   * skipping keeps the intent loud). The worker keeps advancing; only
   * drawing pauses.
   */
  let contextLost = false
  /**
   * Last potential the worker shipped, kept ONLY for context-loss recovery:
   * the worker re-sends the potential just when potential_version changes,
   * and a context loss changes nothing — without this cache the V overlay
   * would stay on the rebuilt 1x1 stub texture until the next potential
   * edit. The buffers are transferred (main owns them), never mutated.
   */
  let lastPotential: Float32Array | undefined
  /**
   * The previous frame's densityPhase backing buffer, returned to the
   * worker (zero-copy) with the next advance so frame buffers ping-pong
   * instead of piling up on the GC. Stashed only after the texture upload
   * consumed the data; nothing reads it afterwards.
   */
  let recycleBuffer: ArrayBuffer | undefined
  /**
   * Worker generation this loop last saw. Hash routing (Task 9) can
   * destroy()+init() the store mid-session (preset switch) while an
   * `advance` is in flight — the terminated worker never answers, so
   * `advanceInFlight` would stay true forever and the new worker would
   * never receive an advance. A bumped epoch means: drop all in-flight
   * state (the flag and any stale recycle buffer) and start clean.
   */
  let epoch = store.epoch

  // Context-loss recovery (hand-verified — about:gpu or WEBGL_lose_context;
  // no CI story for killing a real context). preventDefault on `lost` is
  // what makes the browser attempt the restore at all.
  const onContextLost = (event: Event): void => {
    event.preventDefault()
    contextLost = true
  }
  const onContextRestored = (): void => {
    contextLost = false
    renderer.rebuild(canvas)
    // Drop the stale overlay scale, then re-upload the cached potential and
    // re-derive the scale from it (full texImage2D — rebuild reset the
    // allocation tracking). The field re-uploads with the next frame anyway.
    potentialMax = 0
    if (lastPotential !== undefined) {
      renderer.uploadPotential(lastPotential, store.grid, store.grid)
      potentialMax = maxAbs(lastPotential)
    }
  }
  canvas.addEventListener('webglcontextlost', onContextLost)
  canvas.addEventListener('webglcontextrestored', onContextRestored)

  const offFrame = store.onFrame((frame) => {
    if (disposed) return
    advanceInFlight = false

    const now = performance.now()
    fpsEma = nextFpsEma(fpsEma, lastDrawAt === 0 ? 0 : now - lastDrawAt)
    lastDrawAt = now

    displayMax = Math.max(frame.maxDensity, displayMax * 0.97)
    if (frame.potential !== undefined) {
      lastPotential = frame.potential
    }
    if (!contextLost) {
      renderer.resize(canvas.clientWidth, canvas.clientHeight)
      renderer.uploadField(frame.densityPhase, store.grid, store.grid)
      if (frame.potential !== undefined) {
        potentialMax = maxAbs(frame.potential)
        renderer.uploadPotential(frame.potential, store.grid, store.grid)
      }
      renderer.draw(potentialMax, displayMax)
    }
    // The upload (or the context-loss skip) was the last read of the frame
    // buffer — hand it back with the next advance. `frame.potential` stays
    // cached in lastPotential and is never recycled. The cast: typed-array
    // `.buffer` is ArrayBufferLike, but these arrays were transferred from
    // the worker as plain ArrayBuffers (never SharedArrayBuffer).
    recycleBuffer = frame.densityPhase.buffer as ArrayBuffer

    debugState.t = frame.t
    debugState.norm = frame.norm
    debugState.maxDensity = frame.maxDensity
    debugState.potentialVersion = frame.potentialVersion

    if (store.perfMode) {
      store.perf.fps = fpsEma
      store.perf.substeps = lastSubsteps
      store.perf.workerMs = now - postedAt
      const hook = window.__psiforgePerf
      if (hook !== undefined) {
        hook.fps = Math.round(fpsEma)
        hook.substeps = lastSubsteps
        hook.workerMs = Math.round(now - postedAt)
      }
    }
  })

  const tick = (now: number): void => {
    if (disposed) return
    // Worker swap (see `epoch` above): reset the advance bookkeeping the
    // dead worker stranded. Checked in `tick` (not onFrame) because a swap
    // can also happen while paused, and this must run before the next post.
    if (store.epoch !== epoch) {
      epoch = store.epoch
      advanceInFlight = false
      recycleBuffer = undefined
    }
    // Clamp the wall-clock delta so a background tab waking up cannot
    // teleport the simulation (or explode the substep count).
    const dtWall = Math.min((now - last) / 1000, 0.1)
    last = now

    if (!store.running) {
      // No new advance can be outstanding for long; clear the flag so a
      // later resume never deadlocks on a stale in-flight marker.
      advanceInFlight = false
    } else if (!advanceInFlight) {
      const substeps = computeSubsteps(dtWall, store.speed, DEFAULTS.dt)
      if (substeps > 0) {
        advanceInFlight = true
        postedAt = now
        lastSubsteps = substeps
        store.send(
          { type: 'advance', substeps, recycle: recycleBuffer },
          recycleBuffer === undefined ? [] : [recycleBuffer],
        )
        recycleBuffer = undefined
      }
    }

    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)

  return () => {
    disposed = true
    cancelAnimationFrame(raf)
    offFrame()
    canvas.removeEventListener('webglcontextlost', onContextLost)
    canvas.removeEventListener('webglcontextrestored', onContextRestored)
    renderer.dispose()
  }
}
