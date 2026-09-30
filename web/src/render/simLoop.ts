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
import { interleaveScalarToRG } from '../sim/fftshift.js'
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
   * Momentum view (Task 12). `momentumScratch` is the REUSED upload buffer:
   * the worker ships a fresh (transferred) shifted |phi(k)|^2 every cadence
   * frame, this loop copies it into (v, 0) RG32F pairs and never reallocates
   * (one 2*nx*ny allocation for the whole session; re-sized only if the grid
   * changed). `momentumViewActive` tracks which space the LAST displayed
   * frame belonged to — it drives the u_showV toggle and the switch-back
   * potential re-upload below. `momentumDisplayMax` is a SEPARATE
   * auto-exposure EMA: |phi(k)|^2 lives on a completely different physical
   * scale than |psi(x)|^2 (dA^2/(2*pi)^2-scaled bins), so the position peak
   * would either saturate or black out the k-space picture.
   */
  let momentumScratch: Float32Array | undefined
  let momentumViewActive = false
  let momentumDisplayMax = 0

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
    // Re-assert the V-overlay setting for the CURRENT view: a frame that
    // arrived while the context was lost may have switched spaces without
    // being able to touch the (dead) renderer — rebuild() alone would then
    // re-apply the stale pre-switch value.
    renderer.setShowV(!momentumViewActive)
  }
  canvas.addEventListener('webglcontextlost', onContextLost)
  canvas.addEventListener('webglcontextrestored', onContextRestored)

  const offFrame = store.onFrame((frame) => {
    if (disposed) return
    advanceInFlight = false

    const now = performance.now()
    fpsEma = nextFpsEma(fpsEma, lastDrawAt === 0 ? 0 : now - lastDrawAt)
    lastDrawAt = now

    // A momentum frame carries BOTH buffers: densityPhase keeps flowing
    // (charts + instant switch-back), momentumDensity says which space to
    // DISPLAY this frame.
    const isMomentum = frame.momentumDensity !== undefined
    displayMax = Math.max(frame.maxDensity, displayMax * 0.97)
    if (frame.potential !== undefined) {
      lastPotential = frame.potential
    }
    if (isMomentum && frame.momentumDensity !== undefined) {
      // k-space has its own physical scale (dA^2/(2*pi)^2-scaled bins):
      // exposure must track the momentum peak, not the position peak. Same
      // EMA recipe as displayMax.
      let peak = 0
      for (let i = 0; i < frame.momentumDensity.length; i++) {
        if (frame.momentumDensity[i] > peak) peak = frame.momentumDensity[i]
      }
      momentumDisplayMax = Math.max(peak, momentumDisplayMax * 0.97)
    }
    if (!contextLost) {
      renderer.resize(canvas.clientWidth, canvas.clientHeight)
      if (isMomentum && frame.momentumDensity !== undefined) {
        // Copy the transferred array into the reused (v, 0) RG32F scratch
        // buffer and upload THAT — the worker's copy is then dead to us.
        if (
          momentumScratch === undefined ||
          momentumScratch.length !== 2 * frame.momentumDensity.length
        ) {
          momentumScratch = new Float32Array(2 * frame.momentumDensity.length)
        }
        interleaveScalarToRG(frame.momentumDensity, momentumScratch)
        renderer.uploadField(momentumScratch, store.grid, store.grid)
        // No potential upload on k-space frames — V(x) is not a k-space
        // object; the shader's u_showV keeps it fully hidden.
      } else {
        renderer.uploadField(frame.densityPhase, store.grid, store.grid)
        if (frame.potential !== undefined) {
          potentialMax = maxAbs(frame.potential)
          renderer.uploadPotential(frame.potential, store.grid, store.grid)
        } else if (momentumViewActive && lastPotential !== undefined) {
          // Switch-back from momentum: the worker (correctly) did not
          // resend the potential — its version never changed — but the V
          // overlay must return together with the position view, so force a
          // re-upload from the Task-2 cache. Runs exactly once per switch.
          potentialMax = maxAbs(lastPotential)
          renderer.uploadPotential(lastPotential, store.grid, store.grid)
        }
      }
      if (isMomentum !== momentumViewActive) {
        renderer.setShowV(!isMomentum)
      }
      renderer.draw(potentialMax, isMomentum ? momentumDisplayMax : displayMax)
    }
    momentumViewActive = isMomentum
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
