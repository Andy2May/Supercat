/**
 * Measurement outcome markers (Task 14): the expanding white ring that
 * flashes where a position/momentum measurement landed. Drawn on the
 * SimCanvas 2D overlay — the same layer barrier/well drag previews use —
 * with the same dark-halo-under-light-stroke treatment so the ring stays
 * readable over any heatmap value.
 *
 * Pure-ish by design: the two geometry decisions are plain functions
 * (`ringGeometry`, `binToScreen`) unit-tested in tests/markers.test.ts;
 * `drawMarkers` only renders and prunes. The marker list is module state —
 * one overlay exists per app, exactly like the overlay previews.
 */

/** Ring lifetime: the marker expands and fades out over 600 ms. */
export const MARKER_LIFETIME_MS = 600
/** Ring radius at full expansion, in CSS pixels. */
export const MARKER_MAX_RADIUS = 30

/** One live marker: overlay-pixel position plus its birth timestamp. */
export interface Marker {
  sx: number
  sy: number
  born: number
}

const markers: Marker[] = []

/** Registers a ring at overlay pixel (sx, sy), born at `now` (ms). */
export function spawnMarker(sx: number, sy: number, now: number): void {
  markers.push({ sx, sy, born: now })
}

/** Drops every marker (component unmount / scene switch). */
export function clearMarkers(): void {
  markers.length = 0
}

/**
 * Ring geometry at `elapsedMs` after birth: radius grows linearly
 * 0 -> MARKER_MAX_RADIUS while alpha falls 1 -> 0 (they are complementary
 * — radius/max + alpha === 1). Returns null once the marker has expired;
 * callers prune it then.
 */
export function ringGeometry(elapsedMs: number): { radius: number; alpha: number } | null {
  if (elapsedMs < 0 || elapsedMs >= MARKER_LIFETIME_MS) return null
  const t = elapsedMs / MARKER_LIFETIME_MS
  return { radius: MARKER_MAX_RADIUS * t, alpha: 1 - t }
}

/**
 * Renders every live marker onto the overlay context and prunes the
 * expired ones. Returns true while at least one marker remains alive —
 * SimCanvas keeps its dedicated markers rAF running exactly that long.
 * The canvas is cleared first, so this owns the whole overlay while a
 * marker lives (markers never coexist with drag previews: the measure
 * tools have no preview).
 */
export function drawMarkers(
  ctx: CanvasRenderingContext2D,
  now: number,
  w: number,
  h: number,
): boolean {
  ctx.clearRect(0, 0, w, h)
  for (let k = markers.length - 1; k >= 0; k--) {
    const g = ringGeometry(now - markers[k].born)
    if (g === null) {
      markers.splice(k, 1)
      continue
    }
    // Dark halo under a bright ring (same recipe as the drag previews):
    // readable over any heatmap value.
    for (const [style, width] of [
      [`rgba(0, 0, 0, ${0.55 * g.alpha})`, 3],
      [`rgba(255, 255, 255, ${0.95 * g.alpha})`, 1.5],
    ] as const) {
      ctx.beginPath()
      ctx.lineWidth = width
      ctx.strokeStyle = style
      ctx.arc(markers[k].sx, markers[k].sy, Math.max(g.radius, 0.01), 0, Math.PI * 2)
      ctx.stroke()
    }
  }
  return markers.length > 0
}

/**
 * Momentum-outcome bin -> overlay pixel (Task 14 Review Focus 1). The wasm
 * `measure_momentum` returns an fftfreq-ordered bin (i, j) — k = 0 at bin
 * (0, 0), negative kx/ky in the corners — while the DISPLAYED k-space
 * texture is `fftshift2d`'d (k = 0 at the grid center, row j = 0 at the
 * canvas top). The marker must land on the same texel the collapsed bin
 * lights up:
 *
 *   shifted = ((i + nx/2) mod nx, (j + ny/2) mod ny)
 *   screen  = ((shifted.x + 0.5) / nx * w, (shifted.y + 0.5) / ny * h)
 *
 * (the + 0.5 lands in the CELL CENTER, matching how the shader's NEAREST
 * sampling lights whole cells; y counts from the top, exactly like
 * gridToScreen for position outcomes — the overlay's 2D context is
 * y-down).
 */
export function binToScreen(
  i: number,
  j: number,
  nx: number,
  ny: number,
  w: number,
  h: number,
): { x: number; y: number } {
  const si = (i + Math.floor(nx / 2)) % nx
  const sj = (j + Math.floor(ny / 2)) % ny
  return { x: ((si + 0.5) / nx) * w, y: ((sj + 0.5) / ny) * h }
}
