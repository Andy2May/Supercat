<script lang="ts">
  import { getLang, lang, t } from '../i18n/index.js'
  import type { PresetId } from '../presets/index.js'

  // Whose narration to show. App.svelte keys this component on the preset
  // id, so every entry into a preset remounts it: the card is open by
  // default and nothing is remembered between visits (deliberate — Task 9).
  let { id }: { id: PresetId } = $props()

  // Local mirror of the language store (same pattern as App.svelte): the
  // derived values re-translate the moment `setLang` fires. The subscription
  // lives in an $effect cleanup because App keys this component on the preset
  // id — every preset switch remounts it, and each remount must unsubscribe
  // or the dead card's closure leaks.
  let active = $state(getLang())
  $effect(() => {
    return lang.subscribe((value) => {
      active = value
    })
  })

  const title = $derived.by(() => {
    active // dependency: re-translate when the language changes
    return t(`preset.${id}.title`)
  })
  // The card body: one sentence per line, '\n'-separated in the dictionary.
  const lines = $derived.by(() => {
    active
    return t(`preset.${id}.card`).split('\n')
  })
  const collapseLabel = $derived.by(() => {
    active
    return t('preset.card.collapse')
  })
  const showLabel = $derived.by(() => {
    active
    return t('preset.card.show')
  })

  let open = $state(true)
</script>

{#if open}
  <section class="preset-card" data-testid="preset-card">
    <div class="head">
      <h2>{title}</h2>
      <button data-testid="preset-card-toggle" onclick={() => (open = false)}>
        {collapseLabel}
      </button>
    </div>
    {#each lines as line, index (index)}
      <p>{line}</p>
    {/each}
  </section>
{:else}
  <div class="collapsed">
    <button
      data-testid="preset-info"
      aria-label={showLabel}
      title={showLabel}
      onclick={() => (open = true)}
    >
      ⓘ
    </button>
  </div>
{/if}

<style>
  .preset-card {
    max-width: 38rem;
    margin: 1.25rem auto 0;
    padding: 0.75rem 1rem;
    text-align: left;
    font-size: 0.92rem;
    border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
    border-radius: 0.5rem;
    background: color-mix(in srgb, canvas 55%, transparent);
  }

  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .preset-card h2 {
    font-size: 1.02rem;
    margin: 0;
  }

  .preset-card p {
    margin: 0.4rem 0 0;
  }

  .collapsed {
    margin-top: 0.9rem;
  }
</style>
