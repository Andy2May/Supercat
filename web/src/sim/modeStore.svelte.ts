/**
 * Explore/advanced experience mode (Task 7). A Svelte 5 runes store (same
 * `.svelte.ts` pattern as `simStore.svelte.ts`): `mode` is `$state`, so every
 * component reading it re-renders on `toggle()`. The mode persists across
 * reloads under localStorage 'psiforge.mode'; anything but the two valid
 * names falls back to 'explore'.
 *
 * Storage comes through a constructor seam: production defaults to
 * `window.localStorage`, node-env tests inject a mock (or `undefined`), and
 * every access is wrapped so a throwing or absent storage degrades to no-op
 * persistence instead of taking the app down.
 */

/** The two experience modes: the friendly default and the full-control one. */
export type Mode = 'explore' | 'advanced'

/** localStorage key the active mode is persisted under. */
const STORAGE_KEY = 'psiforge.mode'

/** The two storage calls the store uses — narrow enough to mock in tests. */
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

/** Browser localStorage when reachable; undefined in node (tests, SSR). */
function defaultStorage(): StorageLike | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    // Some browsers throw on the very access (privacy settings); persistence
    // then quietly turns off rather than taking the app down.
    return undefined
  }
}

/** Reads the persisted mode; anything but 'advanced' (including a read
 * error) leaves the safe default 'explore' in place. */
function readMode(storage: StorageLike | undefined): Mode {
  if (storage === undefined) return 'explore'
  try {
    return storage.getItem(STORAGE_KEY) === 'advanced' ? 'advanced' : 'explore'
  } catch {
    return 'explore'
  }
}

export class ModeStore {
  /** Active mode; 'explore' unless a valid 'advanced' was persisted. */
  mode = $state<Mode>('explore')

  private readonly storage: StorageLike | undefined

  constructor(storage: StorageLike | undefined = defaultStorage()) {
    this.storage = storage
    this.mode = readMode(storage)
  }

  /** Flips explore <-> advanced in memory and persists the new mode
   * (best-effort: a failing write never blocks the flip). */
  toggle(): void {
    this.mode = this.mode === 'explore' ? 'advanced' : 'explore'
    if (this.storage === undefined) return
    try {
      this.storage.setItem(STORAGE_KEY, this.mode)
    } catch {
      // Quota/privacy-mode write failure: keep the in-memory mode.
    }
  }
}

/** Single app-level instance — App.svelte's header button drives it. */
export const modeStore = new ModeStore()
