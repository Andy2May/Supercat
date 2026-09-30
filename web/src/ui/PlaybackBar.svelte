<script lang="ts">
  import { getLang, lang, t } from '../i18n/index.js'
  import { DEFAULTS } from '../sim/simParams.js'
  import { simStore } from '../sim/simStore.svelte.js'

  // Local mirror of the language store (same pattern as App.svelte): the
  // derived label block re-translates the moment `setLang` fires.
  let active = $state(getLang())
  lang.subscribe((value) => {
    active = value
  })

  const labels = $derived.by(() => {
    active // dependency: re-translate when the language changes
    return {
      play: t('app.play'),
      pause: t('app.pause'),
      step: t('playback.step'),
      reset: t('playback.reset'),
      restorePotential: t('playback.restorePotential'),
      speed: t('playback.speed'),
      barLabel: t('playback.barLabel'),
    }
  })
  const playPauseLabel = $derived.by(() => {
    active
    return simStore.running ? labels.pause : labels.play
  })

  /** True while a fatal error is up: play/step must not race the reset. */
  const halted = $derived(simStore.fatal !== undefined)

  /** Exactly one propagator step. Pauses first so "step" always means one
   * visible step, never one-step-on-top-of-a-running-loop. */
  function step(): void {
    simStore.running = false
    simStore.send({ type: 'advance', substeps: 1 })
  }
</script>

<div class="playback" role="toolbar" aria-label={labels.barLabel}>
  <button data-testid="play-pause" disabled={halted} onclick={() => (simStore.running = !simStore.running)}>
    {playPauseLabel}
  </button>
  <button data-testid="step" disabled={halted} onclick={step}>
    {labels.step}
  </button>
  <button data-testid="reset" onclick={() => simStore.resetWave()}>
    {labels.reset}
  </button>
  <button data-testid="restore-potential" onclick={() => simStore.send({ type: 'restore-potential' })}>
    {labels.restorePotential}
  </button>
  <label class="slider">
    <span>{labels.speed}</span>
    <input
      data-testid="speed-slider"
      type="range"
      min="0.1"
      max="5"
      step="0.1"
      bind:value={simStore.speed}
    />
    <span class="value">{simStore.speed.toFixed(1)}</span>
  </label>
</div>

<style>
  .playback {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.5rem 1rem;
    margin-top: 1rem;
  }

  button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .slider {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
  }

  .slider input {
    width: 8rem;
  }

  .slider .value {
    min-width: 2.2rem;
    text-align: right;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  }
</style>
