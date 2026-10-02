<script lang="ts">
  import { untrack } from 'svelte'
  import { getLang, lang, setLang, t } from '../i18n/index.js'
  import { LANDING_ORDER, PRESETS, type PresetId } from '../presets/index.js'
  import { hasWebGl2 } from '../sim/webglDetect.js'
  import { simStore } from '../sim/simStore.svelte.js'
  import {
    cancelLandingDebounce,
    landingStore,
    setLandingPreset,
  } from '../sim/landingStore.svelte.js'
  import SimCanvas from './SimCanvas.svelte'

  // Local mirror of the language store (same pattern as App.svelte): every
  // derived block below re-translates the moment `setLang` fires. The
  // subscription lives in an $effect cleanup because this component mounts
  // on every landing visit — without the unsubscribe, each navigation would
  // leak a subscriber pinning a dead component's closure.
  let active = $state(getLang())
  $effect(() => {
    return lang.subscribe((value) => {
      active = value
    })
  })

  // Landing's own WebGL2 gate (ruling 6): App no longer hides the landing
  // behind its global gate — a no-WebGL2 browser still gets the full page
  // over a static backdrop, and only the live background stands down.
  const webglOk = hasWebGl2()

  // ---- worker lifecycle (controller ruling 1) -----------------------------
  // Landing OWNS its sim while mounted: init the strip's current preset on
  // mount, destroy + init on every debounce-landed switch (Svelte runs the
  // previous cleanup before the re-init — the same pattern as App's
  // route-driven preset switching), destroy on unmount. `untrack` keeps the
  // effect's dependency contract to landingStore.preset alone: SimStore.init
  // READS modeStore.mode (its boot cadence send), and a tracked read here
  // would tear the worker down on every explore <-> advanced flip.
  //
  // WHY THE INIT IS MICROTASK-DEFERRED (empirical e2e finding, ruling 1's
  // "verify the ordering" note): on sim -> landing, Landing's mount-effect
  // runs BEFORE App's route-effect cleanup destroy() — SimStore.init would
  // no-op on the sim's still-alive worker and the cleanup would then
  // terminate it, leaving the landing backdrop dead. Deferring the init past
  // the flush puts every synchronous destroy (App's cleanup, this effect's
  // own cleanup on preset switches/unmount) before it, which is exactly the
  // destroy-then-init contract both handover directions need; the landing ->
  // sim direction already destroys synchronously in Landing's teardown and
  // is unaffected. The `cancelled` flag drops a pending init whose effect
  // run was cleaned up (unmount) so it can never boot a dead component's
  // worker.
  $effect(() => {
    const preset = PRESETS[landingStore.preset]
    if (!webglOk) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      untrack(() => {
        simStore.init(preset)
        // Observables stay quiet on the landing (explore cadence): the
        // backdrop is decorative and nothing subscribes to obs history.
        simStore.send({ type: 'set-observables-cadence', on: false })
      })
    })
    return () => {
      cancelled = true
      simStore.destroy()
    }
  })

  // A navigation click often leaves a hover debounce pending — the backdrop
  // it would swap is already gone, so unmount cancels it.
  $effect(() => {
    return () => cancelLandingDebounce()
  })

  // ---- copy (all through keys; re-translates on flip) ---------------------
  const hero = $derived.by(() => {
    active // dependency: re-translate when the language changes
    return {
      kicker: t('landing.kicker'),
      lines: t('landing.title').split('\n'),
      desc: t('landing.desc'),
      ctaPrimary: t('landing.ctaPrimary'),
      ctaFree: t('landing.ctaFree'),
      schrodinger: t('landing.schrodinger'),
    }
  })

  // One strip item per LANDING_ORDER slot (registry order is the product
  // decision): presets number 01–04, the sandbox is the un-numbered "—".
  const tiles = $derived.by(() => {
    active // dependency: re-translate when the language changes
    return LANDING_ORDER.map((id: PresetId, index: number) => ({
      id,
      number: id === 'sandbox' ? '—' : String(index + 1).padStart(2, '0'),
      title: t(`preset.${id}.title`),
      teaser: t(`preset.${id}.teaser`),
    }))
  })

  // Status line: "ĐANG CHIẾU · <preset>" — the name follows the live
  // background preset AND the language.
  const statusText = $derived.by(() => {
    active // dependency: re-translate when the language changes
    return t('landing.status', { name: t(`preset.${landingStore.preset}.title`) })
  })
  const langLabel = $derived.by(() => {
    active // dependency: re-translate when the language changes
    return t(active === 'vi' ? 'app.lang.switchToEn' : 'app.lang.switchToVi')
  })
</script>

<main class="theater">
  {#if webglOk}
    <!-- Live background: the strip's current preset, rendered full-bleed by
         SimCanvas's landing variant. Purely decorative — no pointer input,
         hidden from AT. -->
    <div class="bg" aria-hidden="true">
      <SimCanvas variant="landing" />
    </div>
  {:else}
    <!-- Static fallback (ruling 6): the same composition over a gradient +
         grid backdrop; everything above it stays fully functional. -->
    <div class="bg fallback" data-testid="landing-fallback" aria-hidden="true"></div>
  {/if}
  <!-- Subtle grid + vignette over whichever backdrop is showing (mockup
       .lg-grid/.lg-vig): reads the live canvas as a stage. -->
  <div class="veil" aria-hidden="true"></div>
  <!-- Legibility scrim: a fixed dark field under the left column so the hero
       text/photo stay readable over ANY colormap state of the live canvas
       (inferno swings black -> white as the packet spreads). Separate from
       .veil on purpose — the veil's center-punch mask would hole the scrim
       right where the hero sits. -->
  <div class="scrim" aria-hidden="true"></div>

  <header class="nav" data-testid="landing-nav">
    <div class="mark">
      <b>SUPER<i>CAT</i></b>
      <!-- Brand lockup micro-tag (mockup "2D QUANTUM LAB"): part of the
           wordmark like SUPERCAT itself, not translatable copy. -->
      <span class="tag">2D QUANTUM LAB</span>
    </div>
    <div class="right">
      <button type="button" class="lang" onclick={() => setLang(active === 'vi' ? 'en' : 'vi')}>
        {langLabel}
      </button>
      <a
        class="gh"
        href="https://github.com/Andy2May/Supercat"
        target="_blank"
        rel="noopener">GitHub</a
      >
    </div>
  </header>

  <section class="hero" data-testid="landing-hero">
    <!-- Entrance wrapper (ruling 4): fade + translateY(8px -> 0) once on
         mount, transform/opacity only. A from-only keyframe settles into the
         element's own styles, so the same entrance serves the absolute
         desktop hero and the static reflowed one below 1024px. -->
    <div class="hero-in">
      <p class="kicker">{hero.kicker}</p>
      <h1>
        {#each hero.lines as line, index (line)}
          {#if index > 0}<br />{/if}<span>{line}</span>
        {/each}
      </h1>
      <p class="desc">{hero.desc}</p>
      <div class="cta">
        <a class="btn pri" href="#/sim/double-slit">{hero.ctaPrimary}</a>
        <a class="btn gho" href="#/sim/sandbox">{hero.ctaFree}</a>
      </div>
      <!-- The equation that (allegedly) spawned the cat — and the cat itself,
           mid-scheme, right beside it. Both decorative (aria-hidden): the
           grin is the brand, the math is the alibi. -->
      <p class="schrodinger" aria-hidden="true">
        <img class="cat" src="/cat-meme.png" alt="" loading="lazy" decoding="async" />
        <span aria-hidden="true">{hero.schrodinger}</span>
      </p>
    </div>
  </section>

  <nav class="strip" data-testid="landing-strip">
    {#each tiles as tile (tile.id)}
      <a
        class="exp"
        class:on={tile.id === landingStore.preset}
        data-testid="preset-tile"
        data-preset={tile.id}
        href={`#/sim/${tile.id}`}
        onmouseenter={() => setLandingPreset(tile.id)}
        onfocus={() => setLandingPreset(tile.id)}
      >
        <span class="no">{tile.number}</span>
        <span class="nm">{tile.title}</span>
        <span class="ds">{tile.teaser}</span>
      </a>
    {/each}
  </nav>

  <div class="status" data-testid="landing-status">
    <span class="live">
      <span class="dot" data-testid="status-dot" aria-hidden="true"></span>
      {statusText}
    </span>
    <span class="mono">|ψ|² · ħ = m = 1</span>
  </div>
</main>

<style>
  /* ---- theater frame ------------------------------------------------------
     Landing owns the whole viewport (mockup .lg-frame): a full-bleed
     backdrop (live SimCanvas or static fallback) with the nav, hero, strip
     and status composed over it. The global app.css `main` column styles are
     fully overridden here. Colors are tokens only; the mockup's scattered
     rgba values are expressed as token mixes. */

  main.theater {
    position: relative;
    max-width: none;
    margin: 0;
    padding: 0;
    min-height: 100vh;
    min-height: 100dvh;
    overflow: hidden;
    text-align: left;
  }

  /* Backdrop: fills the frame; SimCanvas's landing variant does the rest. */
  .bg {
    position: absolute;
    inset: 0;
  }

  /* Static fallback (ruling 6): bg-0 -> bg-1 gradient plus a faint grid —
     the same stage feeling with zero WebGL. */
  .fallback {
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.025) 1px, transparent 1px) 0 0 / 100% 64px,
      linear-gradient(90deg, rgba(255, 255, 255, 0.025) 1px, transparent 1px) 0 0 / 64px 100%,
      linear-gradient(160deg, var(--bg-0), var(--bg-1));
  }

  /* Grid + vignette veil over the live canvas (mockup .lg-grid/.lg-vig):
     decorative depth only — text contrast is the scrim's job below. */
  .veil {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px) 0 0 / 100% 64px,
      linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px) 0 0 / 64px 100%,
      radial-gradient(ellipse 90% 90% at 38% 50%, transparent 30%, rgba(9, 12, 17, 0.72) 100%);
    -webkit-mask-image: radial-gradient(ellipse at 50% 45%, transparent 30%, black 100%);
    mask-image: radial-gradient(ellipse at 50% 45%, transparent 30%, black 100%);
  }

  /* Left-anchored legibility scrim: full-dark under the hero column, fading
     out before mid-screen so the simulation's focal zone stays uncovered.
     #090C11 is the veil vignette's ink — same family, not a new color. */
  .scrim {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(
      90deg,
      rgba(9, 12, 17, 0.88) 0%,
      rgba(9, 12, 17, 0.6) 34%,
      rgba(9, 12, 17, 0.15) 58%,
      transparent 72%
    );
  }

  /* ---- glass nav (mockup .lg-nav) --------------------------------------- */

  .nav {
    position: absolute;
    top: 18px;
    left: 22px;
    right: 22px;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 10px 16px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--bg-1) 55%, transparent);
    border: 1px solid var(--line-strong);
    backdrop-filter: blur(10px);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.07);
  }

  .mark {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }

  .mark b {
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  .mark b i {
    font-style: normal;
    color: var(--accent);
  }

  .mark .tag {
    font-family: 'JetBrains Mono', ui-monospace, Consolas, monospace;
    font-size: 9px;
    letter-spacing: 0.18em;
    color: var(--text-3);
    white-space: nowrap;
  }

  .nav .right {
    display: flex;
    align-items: center;
    gap: 14px;
    font-size: 11px;
    color: var(--text-2);
  }

  .nav .lang {
    padding: 5px 10px;
    font-family: 'JetBrains Mono', ui-monospace, Consolas, monospace;
    font-size: 11px;
    color: var(--text-2);
  }

  /* GitHub ghost pill (ruling 5). */
  .gh {
    padding: 4px 10px;
    border-radius: 8px;
    border: 1px solid var(--line-strong);
    color: var(--text-2);
    text-decoration: none;
    white-space: nowrap;
  }

  .gh:hover {
    border-color: var(--accent);
    color: var(--text-1);
  }

  /* ---- hero (mockup .lg-hero): left-aligned, asymmetric ----------------- */

  .hero {
    position: absolute;
    z-index: 4;
    left: 46px;
    top: 50%;
    transform: translateY(-54%);
    max-width: 450px;
  }

  /* Entrance (ruling 4): the only `from` state is the animated one — the
     keyframe settles into the wrapper's own (identity) styles, so the same
     300 ms fade+rise serves every layout. */
  .hero-in {
    animation: hero-in 300ms ease both;
  }

  @keyframes hero-in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }

  .kicker {
    margin: 0 0 14px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: 'JetBrains Mono', ui-monospace, Consolas, monospace;
    font-size: 10px;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: var(--accent);
  }

  .kicker::before {
    content: '';
    width: 22px;
    height: 1px;
    background: var(--accent);
  }

  .hero h1 {
    margin: 0 0 12px;
    font-size: 48px;
    line-height: 1.04;
    font-weight: 700;
    letter-spacing: -0.025em;
    /* Both locales wrap their long first line at this width; balance keeps
       the ragged edge deliberate instead of orphaning a short last word. */
    text-wrap: balance;
  }

  /* The second title line carries the accent (mockup <em>). */
  .hero h1 span:last-child {
    color: var(--accent);
  }

  .desc {
    margin: 0 0 22px;
    font-size: 15.5px;
    line-height: 1.65;
    color: var(--text-2);
    max-width: 36ch;
  }

  .cta {
    display: flex;
    gap: 10px;
  }

  /* CTA anchors styled as buttons (mockup .lg-btn): the global button base
     covers <button> only, so the anchors carry their own states. */
  .btn {
    font-size: 13px;
    font-weight: 600;
    text-decoration: none;
    cursor: pointer;
    padding: 11px 18px;
    border-radius: 10px;
    border: 1px solid transparent;
    transition:
      transform 0.15s ease,
      background 0.2s ease,
      border-color 0.2s ease;
  }

  .btn:active {
    transform: translateY(1px) scale(0.985);
  }

  .btn:focus-visible {
    outline: 1px solid var(--accent);
    outline-offset: 2px;
  }

  .btn.pri {
    background: var(--accent);
    color: var(--accent-ink);
  }

  .btn.pri:hover {
    background: color-mix(in srgb, var(--accent) 85%, #fff);
  }

  .btn.gho {
    background: color-mix(in srgb, var(--bg-1) 50%, transparent);
    color: var(--text-1);
    border-color: var(--line-strong);
    backdrop-filter: blur(8px);
  }

  .btn.gho:hover {
    border-color: color-mix(in srgb, var(--accent) 60%, transparent);
  }

  .schrodinger {
    margin: 18px 0 0;
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: 'JetBrains Mono', ui-monospace, Consolas, monospace;
    font-size: 9.5px;
    color: var(--text-3);
    letter-spacing: 0.06em;
  }

  /* The scheming cat beside its equation (Supercat rebrand): the meme photo
     as a polaroid sticker — a light mat the photo carries with it, so the
     card stays bright on empty-black backdrop zones while the soft dark
     drop shadow separates it over bright fringes. The cat itself stays
     pitch black: that IS the meme. */
  .schrodinger .cat {
    height: 92px;
    width: auto;
    flex: none;
    padding: 4px;
    background: #e8ecf1;
    border-radius: 10px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.55);
    display: block;
  }

  /* ---- film-strip selector (mockup .lg-strip) ---------------------------- */

  .strip {
    position: absolute;
    z-index: 4;
    right: 22px;
    top: 96px;
    width: 218px;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .exp {
    display: grid;
    grid-template-columns: 30px 1fr;
    align-items: center;
    gap: 4px 10px;
    padding: 9px 12px;
    border-radius: 10px;
    text-decoration: none;
    color: inherit;
    background: color-mix(in srgb, var(--bg-1) 50%, transparent);
    border: 1px solid var(--line);
    backdrop-filter: blur(8px);
    transition:
      border-color 0.2s ease,
      background 0.2s ease,
      transform 0.2s ease;
  }

  .exp:hover,
  .exp:focus-visible {
    transform: translateX(-3px);
    border-color: color-mix(in srgb, var(--accent) 50%, transparent);
  }

  /* The preset currently on the backdrop. */
  .exp.on {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 9%, transparent);
  }

  .exp .no {
    grid-row: span 2;
    font-family: 'JetBrains Mono', ui-monospace, Consolas, monospace;
    font-size: 10px;
    color: var(--accent);
  }

  .exp .nm {
    font-size: 12.5px;
    font-weight: 600;
  }

  .exp .ds {
    font-size: 9.5px;
    color: var(--text-2);
    letter-spacing: 0.02em;
  }

  /* ---- status line (mockup .lg-status) ----------------------------------- */

  .status {
    position: absolute;
    z-index: 4;
    left: 46px;
    bottom: 20px;
    display: flex;
    align-items: center;
    gap: 18px;
    font-family: 'JetBrains Mono', ui-monospace, Consolas, monospace;
    font-size: 9.5px;
    color: var(--text-3);
    letter-spacing: 0.08em;
  }

  .status .live {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--accent);
  }

  .dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--accent);
    animation: blink 1.6s infinite;
  }

  @keyframes blink {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.25;
    }
  }

  .status .mono {
    color: var(--text-3);
  }

  /* ---- motion off (ruling 3/4): entrance and blink stand down ------------ */

  @media (prefers-reduced-motion: reduce) {
    .hero-in {
      animation: none;
    }

    .dot {
      animation: none;
    }
  }

  /* ---- responsive fold (ruling 7) -----------------------------------------
     <1024px: the strip becomes a horizontal scroll row UNDER the hero and
     the frame reflows into a scrolling column; the nav stays a floating bar
     and the status line stays visible (static, below the strip). */

  @media (max-width: 1023px) {
    main.theater {
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 1.5rem;
      padding: 5.5rem 1.25rem 2rem;
      min-height: 100dvh;
    }

    /* The hero stacks below the floating nav, so the scrim guards from the
       top down instead of from the left. */
    .scrim {
      background: linear-gradient(
        180deg,
        rgba(9, 12, 17, 0.86) 0%,
        rgba(9, 12, 17, 0.55) 42%,
        transparent 72%
      );
    }

    .hero {
      position: static;
      transform: none;
      max-width: 30rem;
    }

    .strip {
      position: static;
      width: auto;
      flex-direction: row;
      flex: none;
      overflow-x: auto;
      padding-bottom: 4px;
      overscroll-behavior-x: contain;
    }

    .exp {
      flex: none;
      width: 11.5rem;
      grid-template-columns: 26px 1fr;
      align-items: start;
    }

    .exp:hover,
    .exp:focus-visible {
      transform: none; /* no sideways shift while the row scrolls */
    }

    .status {
      position: static;
      flex-wrap: wrap;
      gap: 10px 18px;
    }
  }
</style>
