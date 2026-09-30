/**
 * Main-thread render loop bridging the worker store to the WebGL2 renderer
 * (replaces the Task-10 synthetic demo source). One rAF tick:
 *
 *   running && no advance in flight -> computeSubsteps(dtWall, speed, dt)
 *                                   -> post advance        (drop-if-busy:
 *                                      an unanswered advance skips the post,
 *                                      never queues)
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

  const offFrame = store.onFrame((frame) => {
    if (disposed) return
    advanceInFlight = false

    const now = performance.now()
    fpsEma = nextFpsEma(fpsEma, lastDrawAt === 0 ? 0 : now - lastDrawAt)
    lastDrawAt = now

    renderer.resize(canvas.clientWidth, canvas.clientHeight)
    renderer.uploadField(frame.densityPhase, store.grid, store.grid)
    if (frame.potential !== undefined) {
      potentialMax = maxAbs(frame.potential)
      renderer.uploadPotential(frame.potential, store.grid, store.grid)
    }
    renderer.draw(potentialMax)

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
        store.send({ type: 'advance', substeps })
      }
    }

    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)

  return () => {
    disposed = true
    cancelAnimationFrame(raf)
    offFrame()
    renderer.dispose()
  }
}
