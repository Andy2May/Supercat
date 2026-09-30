/**
 * Wave-packet emitter geometry (Task 16): maps one pointer drag on the sim
 * canvas to the parameters of a `set-gaussian` message. Pure physics-unit
 * math, no DOM — `screenToGrid` has already been applied by the canvas layer.
 *
 * Interaction contract: press = packet center (`anchor`), drag = aim. The
 * drag direction sets the momentum, the drag length sets the packet width
 * (longer drag = wider, lazier packet), and `kMag` (toolbar slider) sets
 * |k| independently of the drag.
 */

import { DEFAULTS } from './simParams.js'
import type { Pt } from './tools.js'

/** A drop-ready gaussian: fields of the `set-gaussian` message, isotropic. */
export interface PacketParams {
  x0: number
  y0: number
  kx: number
  ky: number
  sigma: number
}

/**
 * Default dead zone in grid units — 2 px converted at the reference stage
 * (38 rem ≈ 608 css px over extent 40): 2 · 40/608 ≈ 0.13. SimCanvas passes
 * the exact value it computes from the live canvas size; this default keeps
 * the function sensible when called without one.
 */
export const MIN_PACKET_DRAG = 0.13

/**
 * Converts one anchor->pointer drag into a gaussian packet, or `null` when
 * the drag is shorter than `minDrag` (grid units) — an accidental click
 * must not wipe the wavefunction.
 *
 * - `drag` is the current pointer position in grid coordinates; the drag
 *   vector is `drag - anchor`;
 * - `kx, ky` = unit(drag vector) · kMag (y unflipped, per ledger convention);
 * - `sigma` = clamp(|drag vector|, DEFAULTS.sigmaMin, DEFAULTS.sigmaMax);
 * - non-finite input yields `null`.
 */
export function dragToPacket(
  anchor: Pt,
  drag: Pt,
  kMag: number,
  minDrag: number = MIN_PACKET_DRAG,
): PacketParams | null {
  const dx = drag.x - anchor.x
  const dy = drag.y - anchor.y
  const length = Math.hypot(dx, dy)
  if (!Number.isFinite(length) || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) {
    return null
  }
  if (length < minDrag) return null
  const sigma = Math.min(
    DEFAULTS.sigmaMax,
    Math.max(DEFAULTS.sigmaMin, length),
  )
  const scale = kMag / length
  return {
    x0: anchor.x,
    y0: anchor.y,
    kx: dx * scale,
    ky: dy * scale,
    sigma,
  }
}
