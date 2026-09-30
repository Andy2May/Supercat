<script lang="ts">
  import { getLang, lang, t } from '../i18n/index.js'
  import { simStore } from '../sim/simStore.svelte.js'

  /**
   * Position <-> momentum segmented control (Task 12, advanced mode only —
   * App.svelte gates the mount). Clicking drives `simStore.setView`, which
   * flips the worker's momentum flag; the render loop follows the frames
   * (a frame carrying `momentumDensity` displays k-space). The caption
   * under the canvas lives in App.svelte.
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
    }
  })

  const view = $derived(simStore.view)
</script>

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

<style>
  .view-toggle {
    display: inline-flex;
    margin-top: 0.75rem;
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
</style>
