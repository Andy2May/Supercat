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
 * refresh the debug hook and the perf HUD — and, if the export button
 * queued one, fire a PNG capture of the just-drawn canvas (Task 16, same
 * task as the draw; see capturePng). Drawing is frame-driven, so a
 * paused simulation draws nothing and `debugState.frames` freezes — with
 * one exception (Task 14): while a measurement crossfade is running, the
 * tick itself draws extra frames to ramp u_fade even when no worker frame
 * arrives (a paused sim can still be mid-fade).
 */

/** Collapse crossfade window (Task 14, spec 5.6): 250 ms old -> new. */
const MEASURE_FADE_MS = 250
import { computeSubsteps, DEFAULTS, nextFpsEma } from '../sim/simParams.js'
import { interleaveScalarToRG } from '../sim/fftshift.js'
import { modeStore } from '../sim/modeStore.svelte.js'
import { effectiveColorMode, type SimStore } from '../sim/simStore.svelte.js'
import { debugState } from './debugHook.js'
import { HeatmapRenderer } from './renderer.js'
import { downloadBlob, supercatFilename } from '../ui/download.js'

/** Max |V| over the shipped potential — scales the shader's V overlay. */
function maxAbs(values: Float32Array): number {
  let max = 0
  for (let i = 0; i < values.length; i++) {
    const a = Math.abs(values[i])
    if (a > max) max = a
  }
  return max
}

/**
 * Encodes the canvas as PNG and triggers a browser download (Task 16).
 * The toBlob CALL must be synchronous within the same task as the last
 * draw — the canvas has preserveDrawingBuffer:false, so the backbuffer is
 * only valid until the browser composites; the async part here is merely
 * the encode (the bitmap snapshot is taken at call time, so a deferred
 * callback reads a captured copy, not the volatile buffer). A null blob is
 * rare (zero-area canvas, OOM) and not fatal: warn and move on. Filename +
 * anchor plumbing live in ui/download.ts (shared with the Task-17 JSON
 * export).
 */
function capturePng(canvas: HTMLCanvasElement): void {
  canvas.toBlob((blob) => {
    if (blob === null) {
      console.warn('supercat: PNG export failed — canvas.toBlob returned no blob')
      return
    }
    downloadBlob(blob, supercatFilename('', 'png'))
  }, 'image/png')
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
   * Sets the local overlay scale AND its reactive mirror on the store (the
   * Task-18 V legend reads `store.potentialMax`) in one move, so the two can
   * never disagree. Called ONLY where the potential uploads — the legend
   * updates on potential re-uploads, not per frame.
   */
  const setPotentialMax = (values: Float32Array): void => {
    potentialMax = maxAbs(values)
    store.potentialMax = potentialMax
  }
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
   * Measurement crossfade (Task 14): `fadeActive` while the collapse
   * dissolves old -> new over MEASURE_FADE_MS. `fadeStart` is the
   * arrival time of the measured frame; the tick ramps u_fade 1 -> 0 and
   * draws between worker frames (the fade must animate even when the sim
   * is paused or advancing slower than the window). Exposure: the fade
   * renders BOTH textures under the post-collapse frame's displayMax —
   * one u_maxDensity uniform for the whole pass, so the no-flicker rule
   * (spec 5.6) holds by construction.
   */
  let fadeActive = false
  let fadeStart = 0

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
    // A fade in flight when the context died cannot continue: rebuild()
    // reset u_fade to 0 and stubbed both field textures, so the swap's
    // captured "old" state is gone. Drop the fade — the next frame simply
    // shows the collapsed state.
    fadeActive = false
    renderer.rebuild(canvas)
    // Drop the stale overlay scale, then re-upload the cached potential and
    // re-derive the scale from it (full texImage2D — rebuild reset the
    // allocation tracking). The field re-uploads with the next frame anyway.
    potentialMax = 0
    store.potentialMax = 0
    if (lastPotential !== undefined) {
      renderer.uploadPotential(lastPotential, store.grid, store.grid)
      setPotentialMax(lastPotential)
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

    // Grid mirror for the debug hook (Task 17): updated BEFORE the guard
    // so dropped frames reflect the store's grid too — an e2e watching
    // `__psiforge.grid` sees a cross-grid load switch it and (on a
    // rejected load) the store roll it back, regardless of what draws.
    debugState.grid = store.grid

    // Grid-consistency guard (Task 17): a loaded state file can carry a
    // different grid than the session booted with — the store switches
    // grid the moment a decoded file is sent, so any frame still sized for
    // the OLD grid is a straggler from the superseded sim (an advance that
    // was in flight across the load). Uploading it under the new dims would
    // hand texImage2D a wrongly-sized buffer; drop it instead — the load's
    // own confirmation frame follows immediately.
    if (frame.densityPhase.length !== 2 * store.grid * store.grid) {
      recycleBuffer = frame.densityPhase.buffer as ArrayBuffer
      return
    }

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
      // Measurement crossfade (Task 14): capture the OLD state — whatever
      // the field texture currently displays, position or k-space — BEFORE
      // the upload branches below overwrite it, and hold u_fade at 1 so
      // this very draw still shows the pre-collapse state at full. In the
      // momentum view the fade additionally requires the frame to carry
      // momentumDensity (the worker's forceMomentumNext guarantees it on
      // measured frames); without it no new k-space upload would follow
      // and the fade would dissolve into a stale texture.
      if (
        frame.measured !== undefined &&
        (!viewIsMomentum || frame.momentumDensity !== undefined) &&
        renderer.beginFade()
      ) {
        fadeActive = true
        fadeStart = now
        renderer.setFade(1)
      }
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
          setPotentialMax(frame.potential)
          renderer.uploadPotential(frame.potential, store.grid, store.grid)
        } else if (showingMomentum && lastPotential !== undefined) {
          // One-shot on the VIEW TRANSITION back: the worker (correctly)
          // did not resend the potential — its version never changed — but
          // the V overlay must return together with the position view, so
          // force a re-upload from the Task-2 cache. `showingMomentum`
          // clears below, so this fires exactly once per switch-back, not
          // per frame.
          setPotentialMax(lastPotential)
          renderer.uploadPotential(lastPotential, store.grid, store.grid)
        }
      }
      if (viewIsMomentum !== showingMomentum) {
        renderer.setShowV(!viewIsMomentum)
        // View transition (fix round 1): a fade armed in the OLD view
        // cannot continue into the new one — the fade texture still holds
        // the old space's image while the field is about to receive the
        // new space's, and mix(oldSpace, newSpace) under the new view's
        // exposure is physically meaningless. Cancel it; the new view's
        // first upload simply lands at full.
        if (fadeActive) {
          fadeActive = false
          renderer.setFade(0)
        }
      }
      // Colormap (Task 13), recomputed from live store state EVERY frame:
      // the predicate forces mode 0 (inferno) whenever the view is momentum
      // (the k-space texture's phase channel is 0 — hue would be garbage) OR
      // the mode is explore (spec v1 §2.1: explore has no phase colormap —
      // the flag persists but must stop rendering, or the user would be
      // stuck with HSV and no button to turn it off), and any round-trip
      // back to advanced + position resumes phase coloring with no message.
      // Idempotent + one uniform1i, so per-frame is free.
      renderer.setColorMode(effectiveColorMode(store.view, store.phaseColor, modeStore.mode))
      // Contrast (Task 18 round 1), same recipe: read live from the store
      // every drawn frame — idempotent, one uniform1f, covers both spaces
      // (the shader applies it to the shared tonemap brightness).
      renderer.setContrast(store.contrast)
      renderer.draw(potentialMax, viewIsMomentum ? momentumDisplayMax : displayMax)
      // PNG export (Task 16): consume the queue exactly here — one capture
      // per queued click, at most one per frame, inside the `!contextLost`
      // branch so a capture lost to a dead context stays queued for the
      // first frame after restoration instead of encoding a garbage
      // backbuffer. capturePng's toBlob is synchronous with the draw above
      // (same task) — the preserveDrawingBuffer:false buffer would already
      // be cleared by the time any deferred call read it.
      if (store.capturePending > 0) {
        store.capturePending--
        capturePng(canvas)
      }
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

    // Measurement crossfade driver (Task 14): ramp u_fade 1 -> 0 over the
    // window and DRAW even without a new worker frame — the collapse must
    // animate at full rAF rate whether the sim runs, is paused, or advances
    // slower than the fade. The exposure argument mirrors the frame-driven
    // draw (per-view EMA), so both fade textures share it (spec 5.6).
    if (fadeActive) {
      if ((store.view === 'momentum') !== showingMomentum) {
        // The view flipped since the fade was armed, but the first frame of
        // the new view has not landed yet (the onFrame transition above
        // catches it afterwards) — same cancel: the fade texture holds the
        // OLD space's image, ramping it against the incoming space would
        // mix two different spaces.
        fadeActive = false
        renderer.setFade(0)
      } else {
        // Clamp at 0: a rAF frame timestamp can sit marginally before the
        // performance.now() fadeStart captured inside a message handler of
        // the same frame — an unclamped negative elapsed would extrapolate
        // u_fade past 1 for one frame (fix round 1).
        const elapsed = Math.max(0, (now - fadeStart) / MEASURE_FADE_MS)
        if (elapsed >= 1) {
          fadeActive = false
          renderer.setFade(0)
        } else {
          renderer.setFade(1 - elapsed)
        }
        if (!contextLost) {
          renderer.resize(canvas.clientWidth, canvas.clientHeight)
          renderer.draw(potentialMax, store.view === 'momentum' ? momentumDisplayMax : displayMax)
        }
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
