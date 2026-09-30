<script lang="ts">
  import { getLang, lang, t } from '../i18n/index.js'
  import { simStore } from '../sim/simStore.svelte.js'

  /**
   * Position <-> momentum segmented control (Task 12, advanced mode only —
   * App.svelte gates the mount). Clicking drives `simStore.setView`, which
   * flips the worker's momentum flag; the render loop follows the frames
   * (a frame carrying `momentumDensity` displays k-space). The caption
   * under the canvas lives in App.svelte.
   *
   * Next to it sits the HSV phase-color toggle (Task 13): pure render state
   * (`simStore.phaseColor`, no worker message). It is mounted ONLY in the
   * position view — phase is meaningless in k-space (the texture's phase
   * channel is 0), so switching to momentum HIDES the button while the
   * stored flag survives; the coloring resumes on switch-back.
   *
   * The momentum view swaps the phase button for the momentum MEASUREMENT
   * trigger (Task 14): a click samples a DFT bin from |phi(k)|^2 and
   * collapses ψ in k-space. Same trigger-only contract as the measure tool
   * on the canvas — the click itself fixes nothing about the outcome.
   */

  // Local mirror of the language store (same pattern as App.svelte): the
  // derived label block re-translates the moment `setLang` fires. The
  // subscription returns its own unsubscribe for the $effect cleanup.
  let active = $state(getLang())
  $effect(() => {
    return lang.subscribe((value) => {
      active = value
    })
  })

  const labels = $derived.by(() => {
    active // dependency: re-translate when the language changes
    return {
      toggleLabel: t('view.toggleLabel'),
      position: t('view.position'),
      momentum: t('view.momentum'),
      phaseColor: t('view.phaseColor'),
      measureMomentum: t('measure.momentumTool'),
    }
  })

  const view = $derived(simStore.view)

  function measureMomentum(): void {
    // Never poke a dead sim (nobody would answer), then trigger the
    // Born-rule sampling with a fresh 48-bit seed.
    if (simStore.fatal !== undefined) return
    simStore.send({
      type: 'measure-momentum',
      seed: Math.floor(Math.random() * 2 ** 48),
    })
  }
</script>

<div class="view-controls">
  <div class="view-toggle" role="group" aria-label={labels.toggleLabel} data-testid="view-toggle">
    <button
      type="button"
      data-testid="view-position"
      aria-pressed={view === 'position'}
      class:active={view === 'position'}
      onclick={() => simStore.setView('position')}
    >
      {labels.position}
    </button>
    <button
      type="button"
      data-testid="view-momentum"
      aria-pressed={view === 'momentum'}
      class:active={view === 'momentum'}
      onclick={() => simStore.setView('momentum')}
    >
      {labels.momentum}
    </button>
  </div>
  {#if view === 'position'}
    <button
      type="button"
      data-testid="phase-toggle"
      aria-pressed={simStore.phaseColor}
      class="phase"
      class:active={simStore.phaseColor}
      onclick={() => (simStore.phaseColor = !simStore.phaseColor)}
    >
      {labels.phaseColor}
    </button>
  {:else}
    <button
      type="button"
      data-testid="measure-momentum"
      class="phase"
      onclick={measureMomentum}
    >
      {labels.measureMomentum}
    </button>
  {/if}
</div>

<style>
  .view-controls {
    display: inline-flex;
    gap: 0.5rem;
    margin-top: 0.75rem;
    align-items: stretch;
  }

  .view-toggle {
    display: inline-flex;
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 0.5rem;
    overflow: hidden;
  }

  button {
    padding: 0.3rem 0.9rem;
    font-size: 0.9rem;
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  button + button {
    border-left: 1px solid rgba(255, 255, 255, 0.25);
  }

  button.active {
    background: rgba(255, 255, 255, 0.18);
    font-weight: 600;
  }

  button:not(.active):hover {
    background: rgba(255, 255, 255, 0.08);
  }

  /* The phase toggle stands ALONE (not inside the segmented group), so it
     carries the group's border itself; the sibling selector above must not
     draw a divider between the group's edge and it. */
  .phase {
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 0.5rem;
  }
</style>
