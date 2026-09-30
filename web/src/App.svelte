<script lang="ts">
  import { getLang, lang, setLang, t } from './i18n/index.js'
  import { PRESETS } from './presets/index.js'
  import { hasWebGl2 } from './sim/webglDetect.js'
  import { modeStore } from './sim/modeStore.svelte.js'
  import { simStore } from './sim/simStore.svelte.js'
  import ErrorBanner from './ui/ErrorBanner.svelte'
  import PlaybackBar from './ui/PlaybackBar.svelte'
  import SimCanvas from './ui/SimCanvas.svelte'
  import Toolbar from './ui/Toolbar.svelte'
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
  const tagline = $derived.by(() => {
    active
    return t('app.tagline')
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

  // WebGL2 gate, probed once: without it the renderer cannot draw, so the
  // app is replaced by the WebGlMissing page and no worker is ever created.
  const webglOk = hasWebGl2()

  // Worker lifecycle: create once on mount (the default double-slit preset;
  // grid still overridable via `?grid=`), terminate on unmount. Task 9
  // replaces the hardcoded preset with hash-routed scene selection.
  $effect(() => {
    if (!webglOk) return
    simStore.init(PRESETS['double-slit'])
    return () => simStore.destroy()
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
{:else}
  <main>
    <header>
      <h1>{title}</h1>
      <div class="controls">
        <button onclick={() => setLang(active === 'vi' ? 'en' : 'vi')}>{toggleLabel}</button>
        <button data-testid="mode-toggle" onclick={() => modeStore.toggle()}>
          {modeToggleLabel}
        </button>
      </div>
    </header>
    <p>{tagline}</p>
    {#if renderError !== undefined}
      <p class="error" role="alert">{renderFailedLabel}</p>
    {:else}
      <Toolbar />
      <SimCanvas onRenderFailed={(error) => (renderError = error)} />
      <PlaybackBar />
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
