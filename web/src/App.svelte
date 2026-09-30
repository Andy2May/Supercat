<script lang="ts">
  import { getLang, lang, setLang, t } from './i18n/index.js'
  import { PRESETS } from './presets/index.js'
  import { parseRoute } from './route.js'
  import { hasWebGl2 } from './sim/webglDetect.js'
  import { modeStore } from './sim/modeStore.svelte.js'
  import { effectiveView, simStore } from './sim/simStore.svelte.js'
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
    return t('mode.switchHint').replace('{mode}', t(target))
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
  // down entirely (no worker runs outside the sim view).
  $effect(() => {
    if (!webglOk) return
    if (route.view !== 'sim') return
    const preset = PRESETS[route.id]
    simStore.init(preset)
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
</style>
