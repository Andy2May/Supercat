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
import { effectiveColorMode, type SimStore } from '../sim/simStore.svelte.js'
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
   * changed). `showingMomentum` is VIEW-keyed, not frame-keyed (review fix
   * R1): it mirrors `store.view === 'momentum'` and stays true across the 3
   * in-between cadence frames — the worker attaches momentumDensity only
   * every 4th frame, so keying the display to the frame would strobe
   * k-space/position³ and re-fire the u_showV toggle + switch-back potential
   * re-upload at every cadence boundary. It drives the u_showV toggle, the
   * one-shot switch-back re-upload, and the draw's exposure reference.
   * `momentumDisplayMax` is a SEPARATE auto-exposure EMA: |phi(k)|^2 lives
   * on a completely different physical scale than |psi(x)|^2
   * (dA^2/(2*pi)^2-scaled bins), so the position peak would either saturate
   * or black out the k-space picture.
   */
  let momentumScratch: Float32Array | undefined
  let showingMomentum = false
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
    // Re-assert the V-overlay setting for the CURRENT view (read live from
    // the store — a view flip while the context was lost, possibly while
    // paused with no frames arriving, must not leave a stale overlay):
    // rebuild() alone would re-apply the last value actually applied.
    renderer.setShowV(store.view !== 'momentum')
  }
  canvas.addEventListener('webglcontextlost', onContextLost)
  canvas.addEventListener('webglcontextrestored', onContextRestored)

  const offFrame = store.onFrame((frame) => {
    if (disposed) return
    advanceInFlight = false

    const now = performance.now()
    fpsEma = nextFpsEma(fpsEma, lastDrawAt === 0 ? 0 : now - lastDrawAt)
    lastDrawAt = now

    // Which space the canvas DISPLAYS is view-keyed (`store.view`), NOT
    // frame-keyed (review fix R1): momentumDensity rides the worker's
    // 4-frame cadence, so "frame has momentumDensity" would strobe
    // k-space/position³. While the view is momentum, a cadence frame
    // refreshes the k-space texture and the in-between frames hold it (no
    // position-field upload, no potential upload); densityPhase still
    // arrives every frame and its buffer still cycles through the recycle
    // protocol — position data keeps flowing for charts and switch-back.
    const viewIsMomentum = store.view === 'momentum'
    displayMax = Math.max(frame.maxDensity, displayMax * 0.97)
    if (frame.potential !== undefined) {
      lastPotential = frame.potential
    }
    if (viewIsMomentum && frame.momentumDensity !== undefined) {
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
      if (viewIsMomentum) {
        if (frame.momentumDensity !== undefined) {
          // Cadence frame: copy the transferred array into the reused
          // (v, 0) RG32F scratch buffer and upload THAT — the worker's copy
          // is then dead to us. In-between frames upload nothing and keep
          // showing the last k-space texture.
          if (
            momentumScratch === undefined ||
            momentumScratch.length !== 2 * frame.momentumDensity.length
          ) {
            momentumScratch = new Float32Array(2 * frame.momentumDensity.length)
          }
          interleaveScalarToRG(frame.momentumDensity, momentumScratch)
          renderer.uploadField(momentumScratch, store.grid, store.grid)
          debugState.fieldUploads.momentum++
        }
        // No potential upload while the view is momentum — V(x) is not a
        // k-space object; the shader's u_showV keeps it fully hidden for
        // the WHOLE view duration (one transition, not per cadence frame).
      } else {
        // A momentumDensity riding this frame (in-flight across the
        // toggle-off) is ignored: the display follows the user's view.
        renderer.uploadField(frame.densityPhase, store.grid, store.grid)
        debugState.fieldUploads.position++
        if (frame.potential !== undefined) {
          potentialMax = maxAbs(frame.potential)
          renderer.uploadPotential(frame.potential, store.grid, store.grid)
        } else if (showingMomentum && lastPotential !== undefined) {
          // One-shot on the VIEW TRANSITION back: the worker (correctly)
          // did not resend the potential — its version never changed — but
          // the V overlay must return together with the position view, so
          // force a re-upload from the Task-2 cache. `showingMomentum`
          // clears below, so this fires exactly once per switch-back, not
          // per frame.
          potentialMax = maxAbs(lastPotential)
          renderer.uploadPotential(lastPotential, store.grid, store.grid)
        }
      }
      if (viewIsMomentum !== showingMomentum) {
        renderer.setShowV(!viewIsMomentum)
      }
      // Colormap (Task 13), recomputed from live store state EVERY frame:
      // the predicate forces mode 0 (inferno) whenever the view is momentum
      // (the k-space texture's phase channel is 0 — hue would be garbage),
      // and a view round-trip resumes phase coloring without any message.
      // Idempotent + one uniform1i, so per-frame is free.
      renderer.setColorMode(effectiveColorMode(store.view, store.phaseColor))
      renderer.draw(potentialMax, viewIsMomentum ? momentumDisplayMax : displayMax)
    }
    showingMomentum = viewIsMomentum
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
