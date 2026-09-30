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

  let active = $state(getLang())
  lang.subscribe((value) => {
    active = value
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
  .banner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    margin-top: 1.25rem;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    text-align: left;
    color: #b91c1c;
    background: color-mix(in srgb, #b91c1c 12%, transparent);
    border: 1px solid #b91c1c;
  }

  .banner button {
    white-space: nowrap;
  }

  @media (prefers-color-scheme: dark) {
    .banner {
      color: #f87171;
      background: color-mix(in srgb, #f87171 14%, transparent);
      border-color: #f87171;
    }
  }
</style>
