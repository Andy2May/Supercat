/**
 * One-shot WebGL2 capability probe (Task 16). The heatmap renderer requires
 * a WebGL2 context; when this returns false the app renders the
 * `WebGlMissing` page instead of mounting the simulator at all.
 */

/** True when a scratch canvas can acquire a `webgl2` context. */
export function hasWebGl2(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return canvas.getContext('webgl2') !== null
  } catch {
    return false
  }
}
