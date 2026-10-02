<script lang="ts">
  import { untrack } from 'svelte'
  import { getLang, lang, t } from './i18n/index.js'
  import { PRESETS } from './presets/index.js'
  import { parseRoute } from './route.js'
  import { hasWebGl2 } from './sim/webglDetect.js'
  import { modeStore } from './sim/modeStore.svelte.js'
  import { effectiveView, simStore } from './sim/simStore.svelte.js'
  import { usesStore } from './sim/usesStore.svelte.js'
  import ErrorBanner from './ui/ErrorBanner.svelte'
  import Landing from './ui/Landing.svelte'
  import NarrationPanel from './ui/NarrationPanel.svelte'
  import PlaybackBar from './ui/PlaybackBar.svelte'
  import ReadoutRail from './ui/ReadoutRail.svelte'
  import SimCanvas from './ui/SimCanvas.svelte'
  import ToolRail from './ui/ToolRail.svelte'
  import TopBar from './ui/TopBar.svelte'
  import UsesOverlay from './ui/UsesOverlay.svelte'
  import WebGlMissing from './ui/WebGlMissing.svelte'

  // Local mirror of the language store: `$derived` below reads it, so every
  // label re-translates the moment `setLang` fires. (The bar's own labels —
  // back/mode/scene/language — mirror the store inside TopBar instead.)
  let active = $state(getLang())
  lang.subscribe((value) => {
    active = value
  })

  const hudLabels = $derived.by(() => {
    active // dependency: re-translate when the language changes
    return {
      fps: t('perf.fps'),
      substeps: t('perf.substeps'),
      workerMs: t('perf.workerMs'),
    }
  })
  const momentumCaption = $derived.by(() => {
    active // dependency: re-translate when the language changes
    return t('view.momentumCaption')
  })

  // WebGL2 gate, probed once: without it the renderer cannot draw, so the
  // app is replaced by the WebGlMissing page and no worker is ever created.
  const webglOk = hasWebGl2()

  // ---- hash routing (Task 9) --------------------------------------------
  // '' / '#/' (and '#', its empty-fragment form) land; '#/sim/<id>' is a
  // preset; anything else falls back to double-slit inside `parseRoute`.
  let route = $state(parseRoute(location.hash))

  $effect(() => {
    const onHashChange = () => {
      route = parseRoute(location.hash)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  })

  // Worker lifecycle, route-driven. `route` is only ever reassigned by the
  // hashchange handler above, so this effect re-runs exactly on route
  // changes — never on unrelated re-renders (language/mode flips don't
  // touch it). Svelte runs the previous cleanup first, so a preset switch
  // is always destroy() then init(): the old worker is terminated before
  // the new scene boots, and leaving for the landing view tears the worker
  // down entirely (no worker runs outside the sim view). The `untrack`
  // keeps the route-only contract honest: SimStore.init READS
  // modeStore.mode (its Task-11 boot cadence send), and a tracked read
  // here would make every explore <-> advanced flip tear the worker down
  // and re-init it — resetting t, view, observables history and Task 13's
  // phaseColor instead of leaving live mode toggles to the message-driven
  // effects below (which is what they are for).
  $effect(() => {
    if (!webglOk) return
    if (route.view !== 'sim') return
    const preset = PRESETS[route.id]
    untrack(() => simStore.init(preset))
    return () => simStore.destroy()
  })

  // Observables cadence wiring (Task 11): the worker computes observables
  // only while told to, so the flag follows the experience mode — advanced
  // streams obs blocks (the ReadoutRail), explore goes quiet. Re-runs on
  // preset switches too: a fresh worker always needs its flag re-sent
  // (SimStore.init already sends it while advanced; this re-send is
  // idempotent and covers any effect-ordering edge at boot). The worker
  // resets its frame counter on this message, so a fresh "on" ships obs on
  // the very next frame — no 4-frame dead delay.
  $effect(() => {
    if (route.view !== 'sim') return
    route.id // dependency: preset switch re-inits the worker
    simStore.send({
      type: 'set-observables-cadence',
      on: modeStore.mode === 'advanced',
    })
  })

  // Momentum-view snapback (Task 12): k-space is advanced-only (Task 7
  // gating), so a flip to explore reconciles the stored view through the
  // pure `effectiveView` predicate. `setView` is a no-op when the view
  // already matches — the off flag ships exactly once per snapback, and this
  // effect never fires a message while already in position view.
  $effect(() => {
    const target = effectiveView(modeStore.mode, simStore.view)
    if (target !== simStore.view) simStore.setView(target)
  })

  // The uses overlay never outlives the sim view (spec 6.5): leaving for the
  // landing unmounts it, and clearing the flag here means a later sim entry
  // (a Back/Forward round-trip) never reopens the dialog unasked.
  $effect(() => {
    if (route.view !== 'sim') usesStore.close()
  })

  // Set when renderer startup throws (SimCanvas hands the error over);
  // undefined means the render loop is alive. Only the renderer's
  // NO_WEBGL2 sentinel means "no WebGL2" — anything else (shader/link
  // bug, ...) gets its own message; the error itself is logged by SimCanvas.
  let renderError = $state<unknown>(undefined)
  const renderFailedLabel = $derived.by(() => {
    active // dependency: re-translate when the language changes
    return renderError instanceof Error && renderError.message === 'NO_WEBGL2'
      ? t('app.noWebgl')
      : t('app.renderFailed')
  })

  // ---- JSON state save/load: REMOVED (2026-10-02 feature trim) ----------
  // Export PNG / Save state / Load state were cut per the trim ruling; the
  // wasm/core serialize APIs stay (library surface), the web plumbing is
  // gone. This stub comment marks where the Task-17 block lived.
</script>

{#if route.view === 'landing'}
  <!-- Landing BEFORE the WebGL2 gate (UI redesign T9): the landing owns its
       own gate (hasWebGl2 inside — a static backdrop replaces the live sim),
       so a no-WebGL2 browser still gets the full marketing page and its
       tiles; only the SIMULATOR view keeps the WebGlMissing dead end. -->
  <Landing />
{:else if !webglOk}
  <WebGlMissing />
{:else}
  <main>
    <TopBar id={route.id} />
    {#if renderError !== undefined}
      <p class="error" role="alert">{renderFailedLabel}</p>
    {:else}
      <!-- Instrument bench (UI redesign T8): left rail (tools + narration) |
           center column (stage + momentum caption + playback) | right rail
           (readouts + view + export, advanced only). -->
      <div class="bench">
        <div class="bench-main">
          <aside class="rail-left">
            <ToolRail compact={modeStore.mode === 'explore'} />
            {#key route.id}
              <NarrationPanel id={route.id} />
            {/key}
          </aside>
          <section class="center">
            <div class="stagewrap">
              <SimCanvas onRenderFailed={(error) => (renderError = error)} />
            </div>
            {#if modeStore.mode === 'advanced' && simStore.view === 'momentum'}
              <p class="momentum-caption" data-testid="momentum-caption">{momentumCaption}</p>
            {/if}
            <PlaybackBar />
          </section>
        </div>
        {#if modeStore.mode === 'advanced'}
          <aside class="rail-right">
            <ReadoutRail />
          </aside>
        {/if}
      </div>
    {/if}
    {#if simStore.fatal !== undefined}
      <ErrorBanner message={simStore.fatal} />
    {/if}
    <!-- Uses overlay (spec 2026-10-02): modal over the bench, mounted only
         while open. Sits after the bench/error gate on purpose: the top-bar
         entry stays usable even if the renderer failed. -->
    {#if usesStore.open}
      <UsesOverlay />
    {/if}
    {#if simStore.perfMode}
      <div class="hud" data-testid="perf-hud" aria-hidden="true">
        <span>{hudLabels.fps}: {Math.round(simStore.perf.fps)}</span>
        <span>{hudLabels.substeps}: {simStore.perf.substeps}</span>
        <span>{hudLabels.workerMs}: {simStore.perf.workerMs.toFixed(1)}</span>
      </div>
    {/if}
  </main>
{/if}

<style>
  /* ---- bench frame (UI redesign T8, mockup ws-body) ----------------------
     App owns the frame: the full-viewport column (bar over bench), the
     three-zone flex row, rail widths/surfaces, and the responsive folds
     (spec §6.3). Rail INTERNS belong to their components. The scoped
     rules below override the global app.css `main` column styles. */

  main {
    max-width: none;
    margin: 0;
    padding: 0;
    height: 100vh;
    height: 100dvh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .bench {
    flex: 1;
    min-height: 0;
    display: flex;
  }

  .bench-main {
    flex: 1;
    min-width: 0;
    display: flex;
  }

  /* Left rail (mockup .ws-rail-l): fixed 216px, panel surface, own scroll. */
  .rail-left {
    width: 216px;
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 14px 13px;
    border-right: 1px solid var(--line);
    background: var(--bg-1);
    overflow-y: auto;
  }

  /* Narration pinned to the rail bottom (mockup .ws-narr margin-top: auto).
     Both roots covered: the open panel and the collapsed ⓘ stub. */
  .bench-main .rail-left :global(.narration),
  .bench-main .rail-left :global(.collapsed) {
    margin-top: auto;
  }

  /* Center column: the square stage, the momentum caption and the playback
     bar, stacked. */
  .center {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  /* Stage host: centers the square stage in whatever room the column has
     left. `container-type: size` lets the stage cap itself by the host's
     HEIGHT too (below) — not just its width. */
  .stagewrap {
    flex: 1;
    min-height: 0;
    display: grid;
    place-items: center;
    container-type: size;
    padding: 14px;
  }

  /* The stage stays square (global .stage aspect-ratio 1/1) and centered;
     re-size it here instead of top-margin + auto centering. */
  .center :global(.stage) {
    margin: 0;
    width: min(100%, 38rem);
  }

  /* Height cap: a 38rem square would overflow short viewports (the 720px
     probe), so the width also yields to the host's height. cq units need
     the @supports gate — without them the fallback declaration above
     keeps the width-only cap. */
  @supports (width: 1cqh) {
    .center :global(.stage) {
      width: min(100%, 38rem, 100cqh);
    }
  }

  .momentum-caption {
    flex: none;
    margin: 0.4rem 0 0;
    text-align: center;
    font-size: 0.85rem;
    opacity: 0.75;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  }

  /* Right rail (mockup .ws-rail-r): fixed 250px, panel surface, own scroll.
     Advanced-only — App mounts the whole aside behind the mode gate. */
  .rail-right {
    width: 250px;
    flex: none;
    padding: 14px;
    border-left: 1px solid var(--line);
    background: var(--bg-1);
    overflow-y: auto;
  }

  /* Bottom-edge fatal banner: pinned under the bench at the frame's bottom
     (ErrorBanner owns its look). */


  /* ---- responsive folds (spec §6.3) -------------------------------------- */

  /* 768–1023px: the right rail drops below the bench as a horizontal panel
     — its three sections grid side by side (hairlines fold away; the grid
     gaps separate the sections). */
  @media (max-width: 1023px) {
    .bench {
      flex-direction: column;
    }

    .rail-right {
      width: auto;
      border-left: none;
      border-top: 1px solid var(--line);
    }

    .bench .rail-right :global(.readoutrail) {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px 18px;
      align-items: start;
    }

    .bench .rail-right :global(.hairline) {
      display: none;
    }
  }

  /* <768px: the page scrolls again (no fixed frame), the tool rail becomes
     a horizontal strip above the canvas (icon buttons only — the params
     card and the rail micro-label fold away; ToolRail's `compact` prop
     already hid the params in explore), and the narration moves below the
     canvas. `display: contents` promotes the rail's children to bench-main
     flex items so `order` can reorder them around the center column. */
  @media (max-width: 767px) {
    main {
      height: auto;
      min-height: 100dvh;
      overflow: visible;
    }

    .bench-main {
      flex-direction: column;
    }

    .rail-left {
      display: contents;
    }

    .bench-main .rail-left :global(.toolrail) {
      order: 0;
      flex: none;
      flex-direction: row;
      align-items: flex-start;
      gap: 10px;
      width: 100%;
      padding: 10px 12px;
      border-bottom: 1px solid var(--line);
      background: var(--bg-1);
      overflow-x: auto;
    }

    .bench-main .rail-left :global(.section-label) {
      display: none;
    }

    .bench-main .rail-left :global(.tools) {
      grid-template-columns: repeat(6, auto);
      flex: none;
    }

    .bench-main .rail-left :global(.params) {
      display: none;
    }

    .center {
      order: 1;
    }

    /* Narration below the canvas (collapsed ⓘ by the R4 viewport rule);
       margin-top: auto from the desktop rule would detach it from the
       canvas, so the fold resets it. */
    .bench-main .rail-left :global(.narration),
    .bench-main .rail-left :global(.collapsed) {
      order: 2;
      margin: 0 14px 14px;
    }

    /* No definite frame height on the scrolling page: size containment
       would collapse the stage host, so the stage sizes by width only. */
    .stagewrap {
      flex: none;
      container-type: normal;
    }

    .center :global(.stage) {
      width: min(100%, 38rem);
    }
  }
</style>
