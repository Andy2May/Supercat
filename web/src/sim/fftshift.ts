/**
 * Momentum-space display helpers (Task 12).
 *
 * wasm `Simulation2D.momentum_density()` returns |phi(k)|^2 in **native
 * fftfreq order** — k = 0 sits at bin (0, 0) with negative kx/ky in the
 * corners — while the momentum view needs the zero-frequency bin centered
 * like every textbook k-space plot. `fftshift2d` performs that
 * quadrant-swap; `interleaveScalarToRG` repacks the shifted scalars into
 * the RG32F (value, phase) layout `HeatmapRenderer.uploadField` expects.
 */

/**
 * Centers a 2D fftfreq-ordered field: k = 0 moves to the middle of the
 * grid. The ruling formula (n even — every grid the app builds is):
 *
 *   dest[j*nx+i] = src[((j + ny/2) mod ny)*nx + ((i + nx/2) mod nx)]
 *
 * Half-sizes are floored, which equals n/2 exactly on even grids and keeps
 * degenerate odd edges well-defined (a 1-row grid maps to itself in y).
 * Allocates a fresh array — the worker transfers the result to the main
 * thread, so it can never alias (or detach) the wasm source.
 */
export function fftshift2d(src: Float32Array, nx: number, ny: number): Float32Array {
  const dest = new Float32Array(nx * ny)
  const halfY = Math.floor(ny / 2)
  const halfX = Math.floor(nx / 2)
  for (let j = 0; j < ny; j++) {
    const srcRow = ((j + halfY) % ny) * nx
    const destRow = j * nx
    for (let i = 0; i < nx; i++) {
      dest[destRow + i] = src[srcRow + ((i + halfX) % nx)]
    }
  }
  return dest
}

/**
 * Repacks one scalar per bin into interleaved (value, 0) pairs — the RG32F
 * field layout, with a zeroed phase channel (k-space has no phase coloring
 * in M2). Fills the caller's scratch buffer in place so the render loop
 * reuses one allocation for every momentum frame; `dest.length` must be
 * `2 * src.length`.
 */
export function interleaveScalarToRG(src: Float32Array, dest: Float32Array): void {
  for (let i = 0; i < src.length; i++) {
    dest[i * 2] = src[i]
    dest[i * 2 + 1] = 0
  }
}
