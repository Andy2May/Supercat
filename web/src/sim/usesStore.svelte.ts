/**
 * Uses-overlay open state (spec 2026-10-02): a Svelte 5 runes store (same
 * `.svelte.ts` pattern as `modeStore`) holding whether the real-world
 * applications dialog is up, plus the element that opened it so the overlay
 * can hand focus back on close. No persistence: the overlay always starts
 * closed on every entry into the workspace.
 */
export class UsesStore {
  /** Whether the uses overlay should be mounted (App gates on this). */
  open = $state(false)

  #opener: HTMLElement | null = null

  /** Opens the overlay and remembers which element to restore focus to. */
  openFrom(el: HTMLElement): void {
    this.#opener = el
    this.open = true
  }

  close(): void {
    this.open = false
  }

  /** Read once by the overlay's destroy hook; null before any open, and
   * possibly stale (the opener may have unmounted) — callers must guard. */
  get opener(): HTMLElement | null {
    return this.#opener
  }
}

/** Single app-level instance: the top-bar chip and the briefing hook drive it. */
export const usesStore = new UsesStore()
