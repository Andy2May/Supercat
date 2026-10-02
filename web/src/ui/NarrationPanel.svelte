<script lang="ts">
  import { getLang, lang, t } from '../i18n/index.js'
  import type { PresetId } from '../presets/index.js'
  import { usesStore } from '../sim/usesStore.svelte.js'

  // Whose narration to show. App.svelte keys this component on the preset
  // id, so every entry into a preset remounts it: the open state re-runs its
  // viewport rule below and nothing is remembered between visits
  // (deliberate; Task 9).
  let { id }: { id: PresetId } = $props()

  // Local mirror of the language store (same pattern as ToolRail): the
  // derived values re-translate the moment `setLang` fires. The subscription
  // lives in an $effect cleanup because App keys this component on the preset
  // id — every preset switch remounts it, and each remount must unsubscribe
  // or the dead panel's closure leaks.
  let active = $state(getLang())
  $effect(() => {
    return lang.subscribe((value) => {
      active = value
    })
  })

  const label = $derived.by(() => {
    active // dependency: re-translate when the language changes
    return t('rail.briefing')
  })
  const title = $derived.by(() => {
    active
    return t(`preset.${id}.title`)
  })
  // The panel body: one sentence per line, '\n'-separated in the dictionary.
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
  // Uses overlay hook (spec 4.1): the open panel's last line points at the
  // real-world applications dialog; the collapsed ⓘ stub carries nothing.
  const hookLabel = $derived.by(() => {
    active
    return t('uses.hook')
  })

  // R4 guard: on short viewports (< 800px) the narration starts collapsed so
  // the canvas keeps its height — the briefing stays one ⓘ away. Read once
  // per mount; a later resize does not retro-collapse an open panel.
  let open = $state(window.innerHeight >= 800)
</script>

{#if open}
  <section class="narration" data-testid="preset-card">
    <div class="head">
      <span class="section-label">{label}</span>
      <button data-testid="preset-card-toggle" onclick={() => (open = false)}>
        {collapseLabel}
      </button>
    </div>
    <h2>{title}</h2>
    {#each lines as line, index (index)}
      <p>{line}</p>
    {/each}
    <button
      class="hook"
      data-testid="uses-hook"
      onclick={(event) => usesStore.openFrom(event.currentTarget)}
    >
      {hookLabel}
    </button>
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
  /* Panel look only — pinning the narration to the rail bottom (mockup
     .ws-narr `margin-top: auto`) belongs to the workspace layout that mounts
     this component (Task 8). Colors are tokens only (spec §4). */

  .narration {
    padding: 11px 12px;
    text-align: left;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--bg-1);
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  /* Micro section label: mono, letterspaced, uppercase — the rail heading
     pattern established by ToolRail (mockup .ws-lab). */
  .section-label {
    font-family: 'JetBrains Mono', ui-monospace, Consolas, monospace;
    font-size: 9.5px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--text-3);
  }

  /* Ghost text control (mockup "⌃ Thu gọn"): no box, quiet until hovered.
     The global app.css button base (focus ring, active press) still applies. */
  .head button {
    padding: 2px 7px;
    border: none;
    font-size: 10.5px;
    color: var(--text-3);
  }

  .head button:hover {
    color: var(--text-1);
  }

  .narration h2 {
    margin: 7px 0 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-1);
  }

  /* Body copy (mockup .ws-narr p): quiet secondary text, roomy 1.6 leading.
     One step up from the rail chrome (user ruling 2026-10-02: the briefing
     is reading text, not a readout). */
  .narration p {
    margin: 6px 0 0;
    font-size: 12.5px;
    line-height: 1.6;
    color: var(--text-2);
  }

  /* Collapsed stub: the ⓘ sits where the collapse control was (right edge). */
  .collapsed {
    display: flex;
    justify-content: flex-end;
  }

  .collapsed button {
    padding: 2px 8px;
    font-size: 11px;
    color: var(--text-2);
  }

  /* Uses hook (spec 4.1): a ghost text control like the collapse button,
     pinned as the briefing's closing line. */
  .hook {
    margin: 8px 0 0;
    padding: 2px 0;
    border: none;
    font-size: 12px;
    color: var(--text-3);
  }

  .hook:hover {
    color: var(--text-1);
  }
</style>
