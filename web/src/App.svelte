<script lang="ts">
  import { getLang, lang, setLang, t } from './i18n/index.js'
  import { startSimLoop } from './render/simLoop.js'
  import { simStore } from './sim/simStore.svelte.js'

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
  const playPauseLabel = $derived.by(() => {
    active
    return simStore.running ? t('app.pause') : t('app.play')
  })
  const fatalPrefix = $derived.by(() => {
    active
    return t('app.fatal')
  })
  const hudLabels = $derived.by(() => {
    active
    return {
      fps: t('perf.fps'),
      substeps: t('perf.substeps'),
      workerMs: t('perf.workerMs'),
    }
  })

  // Worker lifecycle: create once on mount (grid from `?grid=`, interim
  // gaussian inside), terminate on unmount.
  $effect(() => {
    simStore.init()
    return () => simStore.destroy()
  })

  let canvas = $state<HTMLCanvasElement | undefined>(undefined)
  let renderFailed = $state(false)

  // The render loop lives in a TS module; the component only mounts it onto
  // the canvas and tears it down on unmount. A missing WebGL2 context is a
  // visible dead end, not a crash.
  $effect(() => {
    const element = canvas
    if (element === undefined) return
    try {
      return startSimLoop(element, simStore)
    } catch {
      renderFailed = true
    }
  })
</script>

<main>
  <header>
    <h1>{title}</h1>
    <div class="controls">
      <button
        data-testid="play-pause"
        onclick={() => (simStore.running = !simStore.running)}
      >
        {playPauseLabel}
      </button>
      <button onclick={() => setLang(active === 'vi' ? 'en' : 'vi')}>{toggleLabel}</button>
    </div>
  </header>
  <p>{tagline}</p>
  {#if renderFailed}
    <p class="error" role="alert">{t('app.noWebgl')}</p>
  {:else}
    <div class="stage">
      <canvas bind:this={canvas} aria-label={t('app.canvasLabel')}></canvas>
    </div>
  {/if}
  {#if simStore.fatal !== undefined}
    <p class="error" role="alert">{fatalPrefix} {simStore.fatal}</p>
  {/if}
  {#if simStore.perfMode}
    <div class="hud" data-testid="perf-hud" aria-hidden="true">
      <span>{hudLabels.fps}: {Math.round(simStore.perf.fps)}</span>
      <span>{hudLabels.substeps}: {simStore.perf.substeps}</span>
      <span>{hudLabels.workerMs}: {simStore.perf.workerMs.toFixed(1)}</span>
    </div>
  {/if}
</main>
