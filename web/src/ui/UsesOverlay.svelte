<script lang="ts">
  import { getLang, lang, t } from '../i18n/index.js'
  import { usesStore } from '../sim/usesStore.svelte.js'
  import type { PresetId } from '../presets/index.js'
  import { USES_CARDS } from './usesData.js'

  // Local mirror of the language store (same pattern as NarrationPanel): a
  // language flip while the dialog is open re-translates every label in
  // place, no close/reopen needed. The subscription lives in an $effect
  // cleanup so unmounting the overlay never leaks a subscriber pinning a
  // dead component's closure.
  let active = $state(getLang())
  $effect(() => {
    return lang.subscribe((value) => {
      active = value
    })
  })

  const chrome = $derived.by(() => {
    active // dependency: re-translate when the language changes
    return {
      title: t('uses.title'),
      intro: t('uses.intro'),
      groupToday: t('uses.groupToday'),
      groupTomorrow: t('uses.groupTomorrow'),
      physicsLabel: t('uses.physicsLabel'),
      closeLabel: t('uses.close'),
    }
  })

  // Card view model: structure (group, watch preset) from usesData, every
  // string from the i18n `uses.*` keys, so the parity test guards the copy.
  let cards = $derived.by(() => {
    active // dependency: re-translate when the language changes
    return USES_CARDS.map((card) => ({
      ...card,
      title: t(`uses.${card.id}.title`),
      easy: t(`uses.${card.id}.easy`),
      physics: t(`uses.${card.id}.physics`),
      watchLabel:
        card.watch !== undefined
          ? t('uses.watch', { name: t(`preset.${card.watch}.title`) })
          : undefined,
    }))
  })
  let todayCards = $derived(cards.filter((card) => card.group === 'today'))
  let tomorrowCards = $derived(cards.filter((card) => card.group === 'tomorrow'))

  let panel: HTMLDivElement | undefined = $state()
  let closeBtn: HTMLButtonElement | undefined = $state()

  // Focus contract (spec 6.3): keyboard users land on the close control when
  // the dialog mounts, and focus goes back to the element that opened it when
  // it unmounts. The opener may itself be gone by then (a preset switch
  // remounts the narration panel), hence the isConnected guard.
  $effect(() => {
    closeBtn?.focus()
    return () => {
      const origin = usesStore.opener
      if (origin !== null && origin.isConnected) origin.focus()
    }
  })

  // Escape closes; Tab wraps inside the panel so the dialogue behaves like a
  // native modal (focus never reaches the bench behind the backdrop).
  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      usesStore.close()
      return
    }
    if (event.key !== 'Tab' || panel === undefined) return
    const focusables = [...panel.querySelectorAll<HTMLElement>('a[href], button')]
    if (focusables.length === 0) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  // Closing before the navigation runs (spec 6.5): the hash change drives
  // App's route effect, which destroys/init the worker while the overlay is
  // already on its way out. The hash is also set explicitly: jsdom's
  // dispatched clicks never run an anchor's default navigation, and in a
  // browser setting the fragment the href already targets is an idempotent
  // re-navigation (ruling, ledgered).
  function watch(preset: PresetId): void {
    usesStore.close()
    location.hash = `#/sim/${preset}`
  }

  function close(): void {
    usesStore.close()
  }
</script>

<svelte:window onkeydown={onKeydown} />

<!-- Click-target backdrop: the panel is its sibling, so clicks inside the
     panel never bubble here. No keyboard role on purpose: Escape is the
     keyboard close path. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="backdrop" data-testid="uses-backdrop" onclick={close}></div>

<div
  class="panel"
  data-testid="uses-overlay"
  role="dialog"
  aria-modal="true"
  aria-labelledby="uses-title-heading"
  bind:this={panel}
>
  <div class="head">
    <h2 id="uses-title-heading">{chrome.title}</h2>
    <button
      type="button"
      data-testid="uses-close"
      aria-label={chrome.closeLabel}
      title={chrome.closeLabel}
      onclick={close}
      bind:this={closeBtn}
    >
      ×
    </button>
  </div>

  <p class="intro">{chrome.intro}</p>

  <p class="group">{chrome.groupToday}</p>
  {#each todayCards as card (card.id)}
    <article class="card" data-testid={`uses-card-${card.id}`}>
      <h3>{card.title}</h3>
      <p class="easy">{card.easy}</p>
      <p class="physics"><span class="plabel">{chrome.physicsLabel}</span>{card.physics}</p>
      {#if card.watch !== undefined}
        <a
          class="watch"
          data-testid={`uses-watch-${card.id}`}
          href={`#/sim/${card.watch}`}
          onclick={() => watch(card.watch)}>{card.watchLabel}</a
        >
      {/if}
    </article>
  {/each}

  <p class="group">{chrome.groupTomorrow}</p>
  {#each tomorrowCards as card (card.id)}
    <article class="card" data-testid={`uses-card-${card.id}`}>
      <h3>{card.title}</h3>
      <p class="easy">{card.easy}</p>
      <p class="physics"><span class="plabel">{chrome.physicsLabel}</span>{card.physics}</p>
      {#if card.watch !== undefined}
        <a
          class="watch"
          data-testid={`uses-watch-${card.id}`}
          href={`#/sim/${card.watch}`}
          onclick={() => watch(card.watch)}>{card.watchLabel}</a
        >
      {/if}
    </article>
  {/each}
</div>

<style>
  /* Modal over the bench (spec 4.2): the simulation keeps running behind a
     dim scrim; the panel is a scrolling card in the established panel look.
     Colors are tokens only; the backdrop ink is the scrim family the landing
     veil uses (spec pins rgba(9, 12, 17, 0.72)). */

  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: rgba(9, 12, 17, 0.72);
    animation: backdrop-in 200ms ease both;
  }

  .panel {
    position: fixed;
    z-index: 41;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(560px, calc(100vw - 32px));
    max-height: min(86dvh, 720px);
    overflow-y: auto;
    padding: 18px 20px;
    border: 1px solid var(--line-strong);
    border-radius: 12px;
    background: var(--bg-1);
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);
    text-align: left;
    animation: panel-in 200ms ease both;
  }

  /* Entrance (ruling pattern from the landing hero): the from state is the
     animated one and settles into the element's own transform above, so the
     keyframe stays a pure "fade + rise 8px" (spec 4.2). */
  @keyframes backdrop-in {
    from {
      opacity: 0;
    }
  }

  @keyframes panel-in {
    from {
      opacity: 0;
      transform: translate(-50%, calc(-50% + 8px));
    }
  }

  .head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }

  .head h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--text-1);
  }

  .head button {
    flex: none;
    padding: 2px 9px;
    border: none;
    font-size: 15px;
    line-height: 1.2;
    color: var(--text-3);
  }

  .head button:hover {
    color: var(--text-1);
  }

  .intro {
    margin: 8px 0 0;
    font-size: 12px;
    line-height: 1.6;
    color: var(--text-2);
  }

  /* Group micro label: the mono letterspaced pattern of the rail labels. */
  .group {
    margin: 16px 0 2px;
    font-family: 'JetBrains Mono', ui-monospace, Consolas, monospace;
    font-size: 9.5px;
    letter-spacing: 0.2em;
    color: var(--text-3);
  }

  .card {
    padding: 8px 0 10px;
    border-top: 1px solid var(--line);
  }

  .card h3 {
    margin: 8px 0 0;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text-1);
  }

  .card .easy {
    margin: 5px 0 0;
    font-size: 11px;
    line-height: 1.6;
    color: var(--text-2);
  }

  /* The second tier: a mono line for the reader who wants the actual
     physics, prefixed with the micro label so it reads as a citation. */
  .card .physics {
    margin: 6px 0 0;
    font-family: 'JetBrains Mono', ui-monospace, Consolas, monospace;
    font-size: 10px;
    line-height: 1.55;
    color: var(--text-3);
  }

  .plabel {
    margin-right: 6px;
    letter-spacing: 0.14em;
    color: var(--accent);
  }

  .watch {
    display: inline-block;
    margin: 8px 0 0;
    font-size: 11px;
    font-weight: 600;
    color: var(--accent);
    text-decoration: none;
  }

  .watch:hover {
    text-decoration: underline;
  }

  /* Motion off: entrance animations stand down (spec 4.2). */
  @media (prefers-reduced-motion: reduce) {
    .backdrop,
    .panel {
      animation: none;
    }
  }
</style>
