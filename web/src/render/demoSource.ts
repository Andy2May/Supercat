import { DEFAULTS } from '../sim/simParams.js'
import { debugState } from './debugHook.js'
import { HeatmapRenderer } from './renderer.js'

/**
 * Synthetic frame source for the M1 vertical slice: a drifting gaussian
 * |psi|^2 with plane-wave phase, generated on the main thread in JS. Task 11
 * replaces the generator with worker frames (same interleaved (rho, phase)
 * layout) without touching the loop below.
 */

const GRID = 128
/** Demo wall height — doubles as the shader's u_potentialMax. */
const WALL_HEIGHT = 10

export type SyntheticFrame = {
  densityPhase: Float32Array
  norm: number
  maxDensity: number
}

/**
 * Drifting gaussian at time `t`: |psi|^2 = exp(-((x-x0)^2/sx^2 +
 * (y-y0)^2/sy^2)) with plane-wave phase kx*x + ky*y, packed interleaved
 * (rho, phase) row-major (j*nx + i) — byte-compatible with the wasm
 * `density_phase()` buffer. The packet centre orbits so the demo stays
 * inside the domain forever (hbar = m = 1, so group velocity = k).
 */
export function syntheticFrame(t: number, nx = GRID, ny = GRID): SyntheticFrame {
  const extent = DEFAULTS.extent
  const dx = extent / nx
  const dy = extent / ny
  const sigmaX = 3.2
  const sigmaY = 2.6
  const kx = 1.5
  const ky = -0.8
  const x0 = 6.0 * Math.sin(t * 0.7)
  const y0 = 6.0 * Math.cos(t * 0.53)

  const densityPhase = new Float32Array(nx * ny * 2)
  let sum = 0
  let maxDensity = 0
  for (let j = 0; j < ny; j++) {
    const y = -extent / 2 + (j + 0.5) * dy
    for (let i = 0; i < nx; i++) {
      const x = -extent / 2 + (i + 0.5) * dx
      const ex = (x - x0) / sigmaX
      const ey = (y - y0) / sigmaY
      const rho = Math.exp(-(ex * ex + ey * ey))
      const cell = (j * nx + i) * 2
      densityPhase[cell] = rho
      densityPhase[cell + 1] = kx * x + ky * y
      sum += rho
      if (rho > maxDensity) {
        maxDensity = rho
      }
    }
  }
  return { densityPhase, norm: sum * dx * dy, maxDensity }
}

/**
 * A double-gap vertical wall — the same shape the wasm protocol's
 * `potential-wall` message produces — so the red V-overlay is visible and
 * `uploadPotential` is exercised from day one.
 */
export function syntheticWallPotential(nx = GRID, ny = GRID): Float32Array {
  const extent = DEFAULTS.extent
  const dx = extent / nx
  const dy = extent / ny
  const xCenter = 6
  const thickness = 1.0
  const gaps = [
    { center: -5, width: 3 },
    { center: 5, width: 3 },
  ]
  const potential = new Float32Array(nx * ny)
  for (let j = 0; j < ny; j++) {
    const y = -extent / 2 + (j + 0.5) * dy
    const inGap = gaps.some((gap) => Math.abs(y - gap.center) <= gap.width / 2)
    if (inGap) {
      continue
    }
    for (let i = 0; i < nx; i++) {
      const x = -extent / 2 + (i + 0.5) * dx
      if (Math.abs(x - xCenter) <= thickness / 2) {
        potential[j * nx + i] = WALL_HEIGHT
      }
    }
  }
  return potential
}

/**
 * Mounts the synthetic render loop onto `canvas` and returns the teardown
 * closure (Svelte `$effect` cleanup calls it on unmount). Each rAF tick:
 * generate field -> upload -> draw -> refresh the debug hook.
 */
export function startDemoLoop(canvas: HTMLCanvasElement): () => void {
  const renderer = new HeatmapRenderer(canvas)
  renderer.uploadPotential(syntheticWallPotential(), GRID, GRID)

  let raf = 0
  let t = 0
  let last = performance.now()
  const tick = (now: number): void => {
    // Clamp the wall-clock delta so a background tab waking up cannot
    // teleport the packet across the domain.
    const dtWall = Math.min((now - last) / 1000, 0.1)
    last = now
    t += dtWall

    const frame = syntheticFrame(t)
    renderer.resize(canvas.clientWidth, canvas.clientHeight)
    renderer.uploadField(frame.densityPhase, GRID, GRID)
    renderer.draw(WALL_HEIGHT)

    debugState.t = t
    debugState.norm = frame.norm
    debugState.maxDensity = frame.maxDensity
    debugState.potentialVersion = 0

    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)

  return () => {
    cancelAnimationFrame(raf)
    renderer.dispose()
  }
}
