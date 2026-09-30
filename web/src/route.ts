/**
 * Hash routing (Task 9): a pure string -> route mapping with no DOM access,
 * so it is unit-testable in node and App.svelte only owns the hashchange
 * listener. No router dependency.
 *
 * Contract:
 *   '' | '#' | '#/'                      -> landing (the five preset tiles)
 *   '#/sim/<valid preset id>'            -> that preset's simulation
 *   anything else (unknown id, garbage)  -> the double-slit simulation
 *
 * '#' is included in the landing set because it is the browser's
 * empty-fragment form (a URL like `.../#` reports location.hash as '#').
 * Unknown hashes deliberately fall back to the M1 hero scene instead of a
 * 404 view — every route always shows a working simulation.
 */
import { LANDING_ORDER, type PresetId } from './presets/index.js'

/** discriminated union consumed by App.svelte's `{#if}` branches */
export type Route = { view: 'landing' } | { view: 'sim'; id: PresetId }

const SIM_PREFIX = '#/sim/'

const KNOWN_IDS = new Set<string>(LANDING_ORDER)

function isPresetId(value: string): value is PresetId {
  return KNOWN_IDS.has(value)
}

export function parseRoute(hash: string): Route {
  if (hash === '' || hash === '#' || hash === '#/') return { view: 'landing' }
  const id = hash.startsWith(SIM_PREFIX) ? hash.slice(SIM_PREFIX.length) : ''
  return { view: 'sim', id: isPresetId(id) ? id : 'double-slit' }
}
