<script lang="ts">
  import { getLang, lang, setLang, t } from './i18n/index.js'
  import { startDemoLoop } from './render/demoSource.js'

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

  let canvas = $state<HTMLCanvasElement | undefined>(undefined)
  let renderFailed = $state(false)

  // The render loop lives in a TS module; the component only mounts it onto
  // the canvas and tears it down on unmount. A missing WebGL2 context is a
  // visible dead end, not a crash.
  $effect(() => {
    const element = canvas
    if (element === undefined) return
    try {
      return startDemoLoop(element)
    } catch {
      renderFailed = true
    }
  })
</script>

<main>
  <header>
    <h1>{title}</h1>
    <button onclick={() => setLang(active === 'vi' ? 'en' : 'vi')}>{toggleLabel}</button>
  </header>
  <p>{tagline}</p>
  {#if renderFailed}
    <p class="error" role="alert">{t('app.noWebgl')}</p>
  {:else}
    <div class="stage">
      <canvas bind:this={canvas} aria-label={t('app.canvasLabel')}></canvas>
    </div>
  {/if}
</main>
