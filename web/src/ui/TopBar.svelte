<script lang="ts">
  import { getLang, lang, setLang, t } from '../i18n/index.js'
  import type { PresetId } from '../presets/index.js'
  import { modeStore } from '../sim/modeStore.svelte.js'

  /** Whose preset title fills the scene label. */
  let { id }: { id: PresetId } = $props()

  // Local mirror of the language store (same pattern as App.svelte): the
  // derived labels re-translate the moment `setLang` fires. The subscription
  // lives in an $effect cleanup — hash routing unmounts this bar on every
  // landing visit, and each unmount must unsubscribe or the dead bar's
  // closure leaks.
  let active = $state(getLang())
  $effect(() => {
    return lang.subscribe((value) => {
      active = value
    })
  })

  const backLabel = $derived.by(() => {
    active // dependency: re-translate when the language changes
    return t('app.backToLanding')
  })
  // Mockup .ws-scene: "EXPERIMENT · Double slit" — the dictionary template
  // with the preset's localized title in the {name} slot.
  const sceneLabel = $derived.by(() => {
    active
    return t('scene.label', { name: t(`preset.${id}.title`) })
  })
  const langLabel = $derived.by(() => {
    active
    return t(active === 'vi' ? 'app.lang.switchToEn' : 'app.lang.switchToVi')
  })
  // Segmented mode control (mockup .ws-seg): the pressed segment names the
  // CURRENT mode; the one interactive segment keeps the e2e contract — a
  // single `mode-toggle` button whose click flips the mode and whose label
  // names the mode it switches TO (the full switchHint sentence rides its
  // title as the hover/AT hint).
  const currentLabel = $derived.by(() => {
    active
    return t(modeStore.mode === 'explore' ? 'mode.explore' : 'mode.advanced')
  })
  const targetLabel = $derived.by(() => {
    active
    return t(modeStore.mode === 'explore' ? 'mode.advanced' : 'mode.explore')
  })
  const switchHint = $derived.by(() => {
    active
    return t('mode.switchHint', { mode: targetLabel })
  })
</script>

<header class="topbar">
  <a class="back" data-testid="back-link" href="#/">{backLabel}</a>
  <!-- Wordmark: plain text, "CAT" on its own element for the accent
       (mockup .ws-mark pattern: SUPER<i>CAT</i>). -->
  <span class="mark">SUPER<i>CAT</i></span>
  <!-- The view's single h1 (a11y): styled as the mono micro scene label,
       all h1 defaults overridden below. -->
  <h1 class="scene">{sceneLabel}</h1>
  <span class="spacer"></span>
  <div class="seg" role="group" aria-label={switchHint}>
    <span class="current" aria-current="true">{currentLabel}</span>
    <button
      type="button"
      data-testid="mode-toggle"
      title={switchHint}
      onclick={() => modeStore.toggle()}
    >
      {targetLabel}
    </button>
  </div>
  <button type="button" class="lang" onclick={() => setLang(active === 'vi' ? 'en' : 'vi')}>
    {langLabel}
  </button>
</header>

<style>
  /* Bar internals only — the workspace frame below the bar belongs to
     App.svelte's layout (Task 8). Colors are tokens only (spec §4). */

  .topbar {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 8px 16px;
    border-bottom: 1px solid var(--line);
    background: var(--bg-1);
    flex: none;
  }

  .back {
    font-size: 0.8rem;
    color: var(--text-2);
    text-decoration: none;
    white-space: nowrap;
  }

  .back:hover {
    color: var(--text-1);
  }

  /* Wordmark (mockup .ws-mark): bold, "FORGE" in the accent. */
  .mark {
    font-weight: 700;
    font-size: 0.85rem;
    letter-spacing: 0.02em;
    color: var(--text-1);
    white-space: nowrap;
  }

  .mark i {
    font-style: normal;
    color: var(--accent);
  }

  /* Scene label (mockup .ws-scene): mono micro-copy; shrinks with an
     ellipsis when the bar runs out of room (small phones). An <h1> for
     a11y (the sim view's single heading) — the global h1 rules and the
     browser's bold default are both overridden so it stays a micro label. */
  .scene {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: 'JetBrains Mono', ui-monospace, Consolas, monospace;
    font-size: 10px;
    font-weight: 400;
    letter-spacing: 0.1em;
    color: var(--text-3);
  }

  .spacer {
    flex: 1;
  }

  /* Mode segment (mockup .ws-seg): two cells, hairline frame, rounded ends.
     The pressed cell is the accent fill; the other cell IS the toggle. The
     global app.css button base supplies the focus ring. */
  .seg {
    display: flex;
    flex: none;
    border: 1px solid var(--line-strong);
    border-radius: 9px;
    overflow: hidden;
  }

  .seg .current {
    padding: 5px 12px;
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.04em;
    white-space: nowrap;
    background: var(--accent);
    color: var(--accent-ink);
  }

  .seg button {
    padding: 5px 12px;
    border: none;
    border-radius: 0;
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.04em;
    white-space: nowrap;
    color: var(--text-2);
  }

  .seg button:hover {
    border-color: transparent;
    background: color-mix(in srgb, var(--text-1) 6%, transparent);
    color: var(--text-1);
  }

  /* Language toggle (mockup .ws-iconbtn): a quiet mono chip. */
  .lang {
    flex: none;
    padding: 5px 10px;
    font-family: 'JetBrains Mono', ui-monospace, Consolas, monospace;
    font-size: 11px;
    color: var(--text-2);
  }
</style>
