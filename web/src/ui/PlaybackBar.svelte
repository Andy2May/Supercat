<script lang="ts">
  import { getLang, lang, t } from '../i18n/index.js'
  import { DEFAULTS } from '../sim/simParams.js'
  import { simStore } from '../sim/simStore.svelte.js'

  // Local mirror of the language store (same pattern as App.svelte): the
  // derived label block re-translates the moment `setLang` fires. The
  // subscription lives in an $effect cleanup — hash routing unmounts this
  // bar on every landing visit, and each unmount must unsubscribe or the
  // dead bar's closure leaks.
  let active = $state(getLang())
  $effect(() => {
    return lang.subscribe((value) => {
      active = value
    })
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
  <!-- Primary transport (mockup .ws-pbtn.pri): accent fill + ink text, no
       border. Icon and label swap with the running state. -->
  <button
    type="button"
    class="primary"
    data-testid="play-pause"
    disabled={halted}
    onclick={() => (simStore.running = !simStore.running)}
  >
    {#if simStore.running}
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <rect x="6" y="5" width="4" height="14" rx="1" />
        <rect x="14" y="5" width="4" height="14" rx="1" />
      </svg>
    {:else}
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M8 5v14l11-7z" />
      </svg>
    {/if}
    <span class="label">{playPauseLabel}</span>
  </button>
  <button type="button" data-testid="step" disabled={halted} onclick={step}>
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 5v14l9-7z" />
      <rect x="17" y="5" width="2.5" height="14" rx="1" />
    </svg>
    <span class="label">{labels.step}</span>
  </button>
  <button type="button" data-testid="reset" onclick={() => simStore.resetWave()}>
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
    <span class="label">{labels.reset}</span>
  </button>
  <button
    type="button"
    data-testid="restore-potential"
    onclick={() => simStore.send({ type: 'restore-potential' })}
  >
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v8" />
      <path d="M8.5 8.5 12 12l3.5-3.5" />
      <path d="M5 16h14" />
      <path d="M7.5 20h9" />
    </svg>
    <span class="label">{labels.restorePotential}</span>
  </button>
  <!-- PNG export moved to the ReadoutRail's Xuất block (UI redesign T8) —
       this bar is transport-only now; ReadoutRail's onExportPng wires the
       same simStore.requestCapture() capture queue. -->
  <label class="slider">
    <span class="slider-label">{labels.speed}</span>
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
  /* Bar internals only (mockup .ws-play) — the layout that mounts this bar
     owns its frame. Secondary button chrome (hairline border, hover →
     accent border, active press, focus ring, disabled dim 0.45) comes from
     the GLOBAL `button` base in app.css and is deliberately not repeated. */

  .playback {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.5rem 0.6rem;
    margin-top: 1rem;
  }

  /* Compact icon+label buttons (mockup .ws-pbtn): 32px targets. */
  .playback button {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 32px;
    padding: 7px 14px;
    border-radius: 9px;
    font-size: 11.5px;
    line-height: 1.2;
    color: var(--text-1);
  }

  /* Global app.css owns the disabled opacity; the bar adds the cursor. */
  .playback button:disabled {
    cursor: not-allowed;
  }

  /* The one primary (mockup .ws-pbtn.pri): accent fill, ink text, no
     border, semibold. */
  .playback button.primary {
    border-color: transparent;
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 600;
  }

  .playback button svg {
    width: 12px;
    height: 12px;
    flex: none;
  }

  .slider {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  /* Micro label over the track (mockup .ws-lab): mono, spaced, uppercase. */
  .slider-label {
    font-family: 'JetBrains Mono', ui-monospace, Consolas, monospace;
    font-size: 9.5px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--text-3);
  }

  .slider input {
    width: 8rem;
    accent-color: var(--accent);
  }

  .slider .value {
    min-width: 2.2rem;
    text-align: right;
    font-family: 'JetBrains Mono', ui-monospace, Consolas, monospace;
    font-size: 11px;
    color: var(--text-1);
  }
</style>
