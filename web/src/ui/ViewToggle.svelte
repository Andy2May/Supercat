<script lang="ts">
  import { getLang, lang, t } from '../i18n/index.js'
  import { simStore } from '../sim/simStore.svelte.js'
  import Term from './Term.svelte'

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
   *
   * The momentum and phase button labels are glossary terms (Task 15):
   * hover, the Term's own focus stop, or keyboard focus on this button
   * (Task 18) shows the tooltip; the position button and the measurement
   * trigger stay plain.
   *
   * Below the group sits the contrast slider (Task 18 round 1): pure render
   * state (`simStore.contrast`, no worker message) driving the shader's
   * u_contrast — 1 is the default look, higher lifts the dim interference
   * fringes out of the colormap's dark low end. Advanced-only by mount
   * (App gates this whole component).
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
      contrast: t('view.contrast'),
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
      <Term key="momentumSpace" label={labels.momentum} />
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
      <Term key="phase" label={labels.phaseColor} />
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

<!-- Contrast slider (Task 18 round 1): bound straight to the store's pure
     render state; the render loop feeds it to u_contrast every drawn
     frame. 1.0 = the default look exactly. The <label> wraps the text, so
     the input's accessible name is the visible "Contrast" text. -->
<label class="contrast">
  <span>{labels.contrast}</span>
  <input
    data-testid="contrast-slider"
    type="range"
    min="0.5"
    max="2.5"
    step="0.05"
    bind:value={simStore.contrast}
  />
  <span class="value">{simStore.contrast.toFixed(2)}</span>
</label>

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
  }

  /* Rounded ends live on the buttons themselves instead of the old
     `overflow: hidden` on the group: the momentum button now hosts a Term
     whose tooltip floats above it, and overflow clipping would cut the
     tip off at the group's top edge. */
  .view-toggle button:first-child {
    border-radius: 0.5rem 0 0 0.5rem;
  }

  .view-toggle button:last-child {
    border-radius: 0 0.5rem 0.5rem 0;
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

  /* Contrast slider row (Task 18 round 1), same visual grammar as the
     playback speed slider: label, 8rem track, monospace value. */
  .contrast {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.6rem;
    font-size: 0.9rem;
  }

  .contrast input {
    width: 8rem;
  }

  .contrast .value {
    min-width: 2.4rem;
    text-align: right;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  }
</style>
