<script lang="ts">
  import { untrack } from 'svelte'
  import { getLang, lang, setLang, t } from './i18n/index.js'
  import { PRESETS } from './presets/index.js'
  import { parseRoute } from './route.js'
  import { hasWebGl2 } from './sim/webglDetect.js'
  import { modeStore } from './sim/modeStore.svelte.js'
  import { effectiveView, simStore } from './sim/simStore.svelte.js'
  import { decodeState, encodeState, StateFileError } from './sim/stateFile.js'
  import { downloadBlob, psiforgeFilename } from './ui/download.js'
  import ErrorBanner from './ui/ErrorBanner.svelte'
  import Landing from './ui/Landing.svelte'
  import ObservablesBar from './ui/ObservablesBar.svelte'
  import PlaybackBar from './ui/PlaybackBar.svelte'
  import PresetCard from './ui/PresetCard.svelte'
  import SimCanvas from './ui/SimCanvas.svelte'
  import Toolbar from './ui/Toolbar.svelte'
  import ViewToggle from './ui/ViewToggle.svelte'
  import WebGlMissing from './ui/WebGlMissing.svelte'

  // Local mirror of the language store: `$derived` below reads it, so every
  // label re-translates the moment `setLang` fires.
  let active = $state(getLang())
  lang.subscribe((value) => {
    active = value
  })

  const title = $derived.by(() => {
    active // dependency: re-translate when the language changes
    return t('app.title')
  })
  const backLabel = $derived.by(() => {
    active
    return t('app.backToLanding')
  })
  const toggleLabel = $derived.by(() => {
    active
    return t(active === 'vi' ? 'app.lang.switchToEn' : 'app.lang.switchToVi')
  })
  // Mode toggle: the button always names the mode it switches TO (the hint
  // template '{mode}' is filled with the target mode's translated name), so
  // the label re-derives on both a language change (`active`) and a mode
  // flip (`modeStore.mode`).
  const modeToggleLabel = $derived.by(() => {
    active // dependency: re-translate when the language changes
    const target = modeStore.mode === 'explore' ? 'mode.advanced' : 'mode.explore'
    return t('mode.switchHint', { mode: t(target) })
  })
  const hudLabels = $derived.by(() => {
    active
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
  // JSON state save/load (Task 17, advanced mode): header button labels.
  const saveStateLabel = $derived.by(() => {
    active
    return t('export.json')
  })
  const loadStateLabel = $derived.by(() => {
    active
    return t('import.json')
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
  // streams obs blocks (the ObservablesBar), explore goes quiet. Re-runs on
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
  // The hidden file input behind the "Mở" button.
  let fileInput = $state<HTMLInputElement | undefined>(undefined)

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
   * NON-fatal loadError banner — the running simulation is untouched. */
  async function onStateFile(event: Event): Promise<void> {
    const input = event.currentTarget
    const file = input instanceof HTMLInputElement ? (input.files?.[0] ?? undefined) : undefined
    // Reset so picking the SAME file again still fires a change event.
    if (input instanceof HTMLInputElement) input.value = ''
    if (file === undefined) return
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
    <header>
      <a class="back" data-testid="back-link" href="#/">{backLabel}</a>
      <h1>{title}</h1>
      <div class="controls">
        <button onclick={() => setLang(active === 'vi' ? 'en' : 'vi')}>{toggleLabel}</button>
        <button data-testid="mode-toggle" onclick={() => modeStore.toggle()}>
          {modeToggleLabel}
        </button>
        {#if modeStore.mode === 'advanced'}
          <!-- JSON state save/load (Task 17, advanced only): Save posts
               serialize-state (the reply downloads in the onState effect);
               Load clicks the hidden file input below. -->
          <button data-testid="export-json" onclick={saveState}>
            {saveStateLabel}
          </button>
          <button data-testid="import-json" onclick={() => fileInput?.click()}>
            {loadStateLabel}
          </button>
          <input
            data-testid="import-json-input"
            type="file"
            accept=".json,application/json"
            hidden
            bind:this={fileInput}
            onchange={onStateFile}
          />
        {/if}
      </div>
    </header>
    {#if renderError !== undefined}
      <p class="error" role="alert">{renderFailedLabel}</p>
    {:else}
      <Toolbar />
      {#key route.id}
        <PresetCard id={route.id} />
      {/key}
      <SimCanvas onRenderFailed={(error) => (renderError = error)} />
      {#if modeStore.mode === 'advanced' && simStore.view === 'momentum'}
        <p class="momentum-caption" data-testid="momentum-caption">{momentumCaption}</p>
      {/if}
      <PlaybackBar />
      {#if modeStore.mode === 'advanced'}
        <ViewToggle />
        <ObservablesBar />
      {/if}
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
  .back {
    align-self: center;
    font-size: 0.9rem;
    color: inherit;
    text-decoration: none;
    white-space: nowrap;
  }

  .back:hover {
    opacity: 0.8;
  }

  .momentum-caption {
    margin: 0.5rem 0 0;
    text-align: center;
    font-size: 0.85rem;
    opacity: 0.75;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  }

  .load-error {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    margin-top: 1.25rem;
    padding: 0.6rem 1rem;
    border-radius: 0.5rem;
    text-align: left;
    color: #92400e;
    background: color-mix(in srgb, #92400e 12%, transparent);
    border: 1px solid #92400e;
  }

  @media (prefers-color-scheme: dark) {
    .load-error {
      color: #fbbf24;
      background: color-mix(in srgb, #fbbf24 14%, transparent);
      border-color: #fbbf24;
    }
  }

  /* Save-size note: the load-error banner's layout, but an INFORMATIONAL
     blue tint — nothing went wrong, the file is just heavy. */
  .save-note {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    margin-top: 1.25rem;
    padding: 0.6rem 1rem;
    border-radius: 0.5rem;
    text-align: left;
    color: #1e40af;
    background: color-mix(in srgb, #1e40af 12%, transparent);
    border: 1px solid #1e40af;
  }

  @media (prefers-color-scheme: dark) {
    .save-note {
      color: #93c5fd;
      background: color-mix(in srgb, #93c5fd 14%, transparent);
      border-color: #93c5fd;
    }
  }
</style>
