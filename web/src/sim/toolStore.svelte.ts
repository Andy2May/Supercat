/**
 * Drawing-tool UI state (Task 15), shared between Toolbar (writes) and
 * SimCanvas (reads). A Svelte 5 runes module store: one exported `$state`
 * object mutated in place — any component reading a field re-renders.
 */
import type { Tool } from './tools.js'

export const toolState = $state({
  /** Active drawing tool (radio-select in the toolbar). */
  tool: 'brush' as Tool,
  /** Barrier/well/brush height ∈ [0.5, 20], step 0.5. */
  height: 5,
  /** Packet |k| ∈ [0, 15], step 0.5 — read by Task 16's emitter. */
  kMag: 4,
})
