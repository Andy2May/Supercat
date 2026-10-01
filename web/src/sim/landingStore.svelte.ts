/**
 * Landing "theater" store (UI redesign T9): which preset the live landing
 * background runs. Module-scope `$state` (same `.svelte.ts` pattern as
 * simStore) so the strip component, the status line and Landing's worker
 * effect all share ONE source — keeping it as Landing-local state would work
 * only while every consumer stays inside Landing, and the module store makes
 * that contract explicit.
 *
 * `debouncedPreset` is the pure hover debounce: a strip sweep fires many
 * mouseenter/focus events well inside the window, and only the LAST preset
 * should ever reach the worker (each landed switch is a destroy + init).
 */
import type { PresetId } from '../presets/index.js'

/** Hover debounce window (task ruling): one preset swap per settled hover. */
export const LANDING_DELAY_MS = 150

/** A schedule function that can still drop its pending call. */
export interface DebouncedSetter {
  (id: PresetId): void
  /** Drops the pending call, if any (Landing's unmount cleanup). */
  cancel(): void
}

/**
 * Pure 150 ms debounce over preset ids. Each call resets the timer; only a
 * call followed by a quiet window fires — and it fires with the LAST id it
 * was given. `cancel()` kills a pending call outright (unmount hygiene: a
 * navigation click must never swap a background that is already gone).
 */
export function debouncedPreset(
  setter: (id: PresetId) => void,
  ms: number = LANDING_DELAY_MS,
): DebouncedSetter {
  let timer: ReturnType<typeof setTimeout> | undefined
  const schedule = ((id: PresetId) => {
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      setter(id)
    }, ms)
  }) as DebouncedSetter
  schedule.cancel = () => {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
  }
  return schedule
}

/** The shared landing background preset; double-slit is the boot default. */
export const landingStore = $state({ preset: 'double-slit' as PresetId })

// One module-level debounce instance: a second Landing mount in the same
// session (landing -> sim -> landing) must not carry a timer owned by the
// previous mount — the unmount cancel below keeps it clean.
const scheduleLanding = debouncedPreset((id) => {
  landingStore.preset = id
})

/** Strip hover/focus entry point: debounced write into the module store. */
export function setLandingPreset(id: PresetId): void {
  scheduleLanding(id)
}

/** Kills a pending debounce (Landing's unmount effect). */
export function cancelLandingDebounce(): void {
  scheduleLanding.cancel()
}

/** Test hygiene: reset the module store to its boot state. */
export function resetLandingStore(): void {
  cancelLandingDebounce()
  landingStore.preset = 'double-slit'
}
