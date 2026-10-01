<script lang="ts">
  /**
   * Fatal-error banner (Task 16): shown whenever `simStore.fatal` is set.
   * The simulation is halted at that point (no advances, frames frozen);
   * the single recovery action sends `reset-wave` — the worker restores the
   * ψ snapshot, resets t = 0 and un-halts — and resumes playback.
   */
  import { getLang, lang, t } from '../i18n/index.js'
  import { simStore } from '../sim/simStore.svelte.js'

  let { message }: { message: string } = $props()

  // Local mirror of the language store (same pattern as App.svelte): the
  // derived labels re-translate the moment `setLang` fires. The
  // subscription lives in an $effect cleanup — hash routing unmounts this
  // banner on every landing visit, and each unmount must unsubscribe or
  // the dead banner's closure leaks.
  let active = $state(getLang())
  $effect(() => {
    return lang.subscribe((value) => {
      active = value
    })
  })

  const labels = $derived.by(() => {
    active // dependency: re-translate when the language changes
    return { fatal: t('app.fatal'), resetAndRun: t('error.resetAndRun') }
  })

  function resetAndRun(): void {
    simStore.resetWave()
    simStore.running = true
  }
</script>

<div class="banner" role="alert" data-testid="error-banner">
  <span>
    <strong>{labels.fatal}</strong>
    {message}
  </span>
  <button data-testid="fatal-reset" onclick={resetAndRun}>
    {labels.resetAndRun}
  </button>
</div>

<style>
  /* Fixed light red that reads on the dark ground — dark-only base (spec
     §4 / §12), so no scheme branch is needed (same deal as app.css's
     .error). */
  .banner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    margin: 0 1rem 0.75rem;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    text-align: left;
    color: #f87171;
    background: color-mix(in srgb, #f87171 14%, transparent);
    border: 1px solid #f87171;
  }

  .banner button {
    white-space: nowrap;
  }
</style>
