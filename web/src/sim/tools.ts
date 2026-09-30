/**
 * Pure geometry for the potential-drawing tools (Task 15). No DOM, no worker:
 * every function maps physics-space pointer samples (`Pt`, from
 * `screenToGrid`) to the exact `paint-disc`/`paint-segment` protocol messages,
 * so the Svelte components stay thin and all batching math is unit-testable.
 *
 * Ledger conventions: y is not flipped (screen-down = +y physics), and paint
 * ops SET absolute values — erasing is painting 0.
 */

import type { MainToWorker } from './protocol.js'

/** The six canvas tools. `packet` is the wave-packet emitter, handled by
 * `dragToPacket` (see packet.ts); `measure` is the position-measurement
 * trigger (Task 14), handled as a click in SimCanvas — in the paint-op
 * pipeline both produce nothing. */
export type Tool = 'brush' | 'barrier' | 'well' | 'eraser' | 'packet' | 'measure'

/** One pointer sample in physics (grid) coordinates. */
export type Pt = { x: number; y: number }

/** Capsule thickness (grid units) for brush / barrier / well segments. */
export const BRUSH_THICKNESS = 0.6
/** Disc radius (grid units) of the eraser. */
export const ERASER_RADIUS = 0.5
/** Sub-step between eraser discs along a drag — 0.8·r, so consecutive discs
 * always overlap (0.4 < 2r = 1.0) and no gap survives a fast pointer move. */
export const ERASER_STEP = ERASER_RADIUS * 0.8

/** Safety bound: even a full-diagonal drag on the extent-40 grid needs ~142
 * discs; anything past this means non-finite input. */
const MAX_STROKE_OPS = 4096

function dist(from: Pt, to: Pt): number {
  return Math.hypot(to.x - from.x, to.y - from.y)
}

/**
 * The next paint op for a one-pointer-step stroke segment (`from` -> `to`):
 *
 * - brush / barrier / well — one `paint-segment` capsule over the segment,
 *   thickness {@link BRUSH_THICKNESS}, value +height (barrier), −height
 *   (well), +height (brush);
 * - eraser — one `paint-disc` (r {@link ERASER_RADIUS}, value 0) advanced one
 *   {@link ERASER_STEP} from `from` toward `to`, landing exactly on `to` when
 *   the remaining distance is at most one step. Walk it repeatedly (or use
 *   {@link strokeToOps}) to cover a long drag with overlapping discs.
 * - packet — `null` (the emitter lives in `dragToPacket`, packet.ts).
 * - measure — `null` (a pure TRIGGER: SimCanvas sends `measure-position` on
 *   a click, not a paint op — see the quantum-measurement note there).
 */
export function strokeToOp(
  tool: Tool,
  height: number,
  from: Pt,
  to: Pt,
): MainToWorker | null {
  switch (tool) {
    case 'brush':
    case 'barrier':
      return {
        type: 'paint-segment',
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
        thickness: BRUSH_THICKNESS,
        value: height,
      }
    case 'well':
      return {
        type: 'paint-segment',
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
        thickness: BRUSH_THICKNESS,
        value: -height,
      }
    case 'eraser': {
      const d = dist(from, to)
      if (!Number.isFinite(d)) return null
      // One sub-step at most; a short hop (or a click) lands on the pointer.
      const t = d <= ERASER_STEP || d === 0 ? 1 : ERASER_STEP / d
      return {
        type: 'paint-disc',
        cx: from.x + (to.x - from.x) * t,
        cy: from.y + (to.y - from.y) * t,
        r: ERASER_RADIUS,
        value: 0,
      }
    }
    case 'packet':
    case 'measure':
      return null
  }
}

/**
 * All paint ops for one pointer-step (`from` -> `to`) — what the canvas
 * flushes per rAF tick per buffered point pair:
 *
 * - segment tools wrap their single {@link strokeToOp};
 * - the eraser divides the step into `ceil(d / ERASER_STEP)` even samples
 *   (each ≤ one step apart, so consecutive discs overlap; the last sample is
 *   exactly `to`), one `paint-disc` per sample;
 * - `packet` yields nothing.
 */
export function strokeToOps(
  tool: Tool,
  height: number,
  from: Pt,
  to: Pt,
): MainToWorker[] {
  if (tool === 'eraser') {
    const d = dist(from, to)
    if (!Number.isFinite(d)) return []
    const samples = Math.max(1, Math.ceil(d / ERASER_STEP))
    if (samples > MAX_STROKE_OPS) return []
    const ops: MainToWorker[] = []
    for (let i = 1; i <= samples; i++) {
      ops.push({
        type: 'paint-disc',
        cx: from.x + ((to.x - from.x) * i) / samples,
        cy: from.y + ((to.y - from.y) * i) / samples,
        r: ERASER_RADIUS,
        value: 0,
      })
    }
    return ops
  }
  const single = strokeToOp(tool, height, from, to)
  return single === null ? [] : [single]
}
