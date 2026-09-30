<script lang="ts">
  import { getLang, lang, setLang, t } from './i18n/index.js'
  import { hasWebGl2 } from './sim/webglDetect.js'
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

  // Worker lifecycle: create once on mount (grid from `?grid=`, the
  // double-slit scene inside), terminate on unmount.
  $effect(() => {
    if (!webglOk) return
    simStore.init()
    return () => simStore.destroy()
  })

  let renderFailed = $state(false)
</script>

{#if !webglOk}
  <WebGlMissing />
{:else}
  <main>
    <header>
      <h1>{title}</h1>
      <div class="controls">
        <button onclick={() => setLang(active === 'vi' ? 'en' : 'vi')}>{toggleLabel}</button>
      </div>
    </header>
    <p>{tagline}</p>
    {#if renderFailed}
      <p class="error" role="alert">{t('app.noWebgl')}</p>
    {:else}
      <Toolbar />
      <SimCanvas onRenderFailed={() => (renderFailed = true)} />
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
