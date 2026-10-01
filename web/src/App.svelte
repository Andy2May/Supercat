<script lang="ts">
  import { untrack } from 'svelte'
  import { getLang, lang, t } from './i18n/index.js'
  import { PRESETS } from './presets/index.js'
  import { parseRoute } from './route.js'
  import { hasWebGl2 } from './sim/webglDetect.js'
  import { modeStore } from './sim/modeStore.svelte.js'
  import { effectiveView, simStore } from './sim/simStore.svelte.js'
  import { decodeState, encodeState, StateFileError } from './sim/stateFile.js'
  import { downloadBlob, psiforgeFilename } from './ui/download.js'
  import ErrorBanner from './ui/ErrorBanner.svelte'
  import Landing from './ui/Landing.svelte'
  import NarrationPanel from './ui/NarrationPanel.svelte'
  import PlaybackBar from './ui/PlaybackBar.svelte'
  import ReadoutRail from './ui/ReadoutRail.svelte'
  import SimCanvas from './ui/SimCanvas.svelte'
  import ToolRail from './ui/ToolRail.svelte'
  import TopBar from './ui/TopBar.svelte'
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
  // Load-error banner (Task 17 fix round 1): the localized headline is
  // composed at render time (the stored detail keeps the worker's raw
  // wasm text — mirroring the fatal banner — so only the headline
  // re-translates on a language flip), and the dismiss control's
  // accessible name is localized (the visible glyph stays "×").
  const loadFailedHeadline = $derived.by(() => {
    active
    return t('loadFailed')
  })
  const dismissLabel = $derived.by(() => {
    active
    return t('loadFailed.dismiss')
  })
  // 512² save-size notice (final review, spec §5.7 + risk row "khi
  // mở/lưu"): the transient banner's text and its dismiss control's
  // accessible name (the visible glyph stays "×", mirroring the load-error
  // banner). One direction-neutral message serves BOTH the Save download
  // and a heavy Load — the warning is about file weight, not direction.
  const saveSizeNoteText = $derived.by(() => {
    active
    return t('export.sizeNote')
  })
  const saveSizeDismissLabel = $derived.by(() => {
    active
    return t('export.sizeNote.dismiss')
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
  // already matches — the off flag ships exactly once per snapback, and
  // this effect never fires a message while already in position view.
  $effect(() => {
    const target = effectiveView(modeStore.mode, simStore.view)
    if (target !== simStore.view) simStore.setView(target)
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

  // ---- JSON state save/load (Task 17, advanced mode) --------------------
  /** True while the large-grid save-size note is up (final review, spec
   * §5.7 + risk table): transient — auto-dismisses via the timer below, or
   * early through the dismiss button. Independent of loadError/fatal so it
   * can coexist with them. */
  let saveSizeNote = $state(false)
  let saveSizeTimer: number | undefined

  /** Shows the save-size note and (re)arms its 8 s auto-dismiss. */
  function showSaveSizeNote(): void {
    saveSizeNote = true
    window.clearTimeout(saveSizeTimer)
    saveSizeTimer = window.setTimeout(() => {
      saveSizeNote = false
      saveSizeTimer = undefined
    }, 8_000)
  }

  /** The dismiss button: same end state as the auto-dismiss. */
  function dismissSaveSizeNote(): void {
    saveSizeNote = false
    window.clearTimeout(saveSizeTimer)
    saveSizeTimer = undefined
  }

  // The auto-dismiss timer is plain (not reactive); clear it on unmount so
  // a dead App never fires the callback (same hygiene as the cleanups
  // above).
  $effect(() => {
    return () => window.clearTimeout(saveSizeTimer)
  })

  /** Save: only posts the request — the reply lands in the onState
   * subscription below, which encodes and downloads the file. */
  function saveState(): void {
    simStore.send({ type: 'serialize-state' })
  }

  // The download half of Save: the worker's `state` reply (transferred
  // arrays) goes through encodeState into a timestamped JSON file.
  $effect(() => {
    const off = simStore.onState((state) => {
      // A 512² state JSON is ~4 MB (spec §5.7: "cảnh báo nếu 512²") and
      // would otherwise download silently — surface the size note BEFORE
      // the download starts. It is a warning, never a confirmation: the
      // download below always fires.
      if (simStore.grid >= 512) showSaveSizeNote()
      try {
        downloadBlob(
          new Blob([JSON.stringify(encodeState(state))], { type: 'application/json' }),
          psiforgeFilename('state', 'json'),
        )
      } catch {
        // encodeState refusing non-finite data cannot happen for a state
        // the propagator is still stepping (its norm guard fires first) —
        // and a failed save must never take the app down. Swallow.
      }
    })
    return off
  })

  /** Load-failure DETAIL: the codec's classified reason, localized. The
   * banner headline (`loadFailed`) is composed at render time so the whole
   * message re-translates on a language flip; worker-side rejections keep
   * their raw wasm text as the detail (same deal as the fatal banner). */
  function loadErrorDetail(error: unknown): string {
    if (error instanceof StateFileError) {
      return t(`loadFailed.${error.reason}`)
    }
    // JSON.parse / read failures: no classification, but still a broken
    // file.
    return t('loadFailed.corrupt')
  }

  /** Load: read -> parse -> decode -> hand to the worker via the store
   * (which owns the cross-grid bookkeeping). Any throw on the way is a
   * NON-fatal loadError banner — the running simulation is untouched.
   * Takes the File directly: the ReadoutRail's hidden input (and its
   * same-file-again reset) owns the picking. */
  async function importStateFile(file: File): Promise<void> {
    try {
      const raw = decodeState(JSON.parse(await file.text()))
      // The codec validates the file against its OWN grid; THIS app is
      // square-grid only (every texture upload is sized from a single
      // store.grid), so a hand-crafted nx≠ny file is rejected here with
      // the same shape class the codec uses.
      if (raw.nx !== raw.ny) {
        throw new StateFileError('shape', `state file: non-square grid ${raw.nx}x${raw.ny}`)
      }
      // 512² warning, LOAD direction (spec risk row "khi mở/lưu"): the
      // decoded arrays imply a several-MB file — the same note Save shows,
      // and equally non-blocking: the load below proceeds regardless of it.
      if (raw.nx >= 512) showSaveSizeNote()
      simStore.loadState(raw)
    } catch (error) {
      simStore.loadError = loadErrorDetail(error)
    }
  }
</script>

{#if !webglOk}
  <WebGlMissing />
{:else if route.view === 'landing'}
  <Landing />
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
            <ReadoutRail onSaveState={saveState} onImportFile={importStateFile} />
          </aside>
        {/if}
      </div>
    {/if}
    {#if simStore.fatal !== undefined}
      <ErrorBanner message={simStore.fatal} />
    {:else if simStore.loadError !== undefined}
      <!-- Non-fatal load error (Task 17): a rejected state file. Amber, not
           red — the simulation keeps running; dismiss or load another file
           (a successful load clears it). Localized headline + raw detail,
           the same shape as the fatal banner. -->
      <div class="load-error" role="alert" data-testid="load-error">
        <span>
          <strong>{loadFailedHeadline}</strong>
          {simStore.loadError}
        </span>
        <button
          data-testid="load-error-dismiss"
          aria-label={dismissLabel}
          onclick={() => (simStore.loadError = undefined)}
        >
          ×
        </button>
      </div>
    {/if}
    {#if saveSizeNote}
      <!-- Large-grid size note (final review, spec §5.7 + risk row "khi
           mở/lưu"): shown by Save (download already fired) and by Load
           (which proceeds regardless) — a 512² state file can weigh
           several MB either way. Informational (role=status, not alert),
           transient (auto-dismiss), never blocking. -->
      <div class="save-note" role="status" data-testid="save-size-note">
        <span>{saveSizeNoteText}</span>
        <button
          data-testid="save-size-note-dismiss"
          aria-label={saveSizeDismissLabel}
          onclick={dismissSaveSizeNote}
        >
          ×
        </button>
      </div>
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

  /* Bottom-edge banners (fatal / load-error / save-note): pinned under the
     bench at the frame's bottom. Fixed tints that read on the dark ground
     — dark-only base, so no scheme branch is needed (same deal as
     app.css's .error). */
  .load-error {
    flex: none;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    margin: 0 1rem 0.75rem;
    padding: 0.6rem 1rem;
    border-radius: 0.5rem;
    text-align: left;
    color: #fbbf24;
    background: color-mix(in srgb, #fbbf24 14%, transparent);
    border: 1px solid #fbbf24;
  }

  /* Save-size note: the load-error banner's layout, but an INFORMATIONAL
     blue tint — nothing went wrong, the file is just heavy. */
  .save-note {
    flex: none;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    margin: 0 1rem 0.75rem;
    padding: 0.6rem 1rem;
    border-radius: 0.5rem;
    text-align: left;
    color: #93c5fd;
    background: color-mix(in srgb, #93c5fd 14%, transparent);
    border: 1px solid #93c5fd;
  }

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
