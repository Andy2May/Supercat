<script lang="ts">
  import { getLang, lang, setLang, t } from './i18n/index.js'

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
</script>

<main>
  <header>
    <h1>{title}</h1>
    <button onclick={() => setLang(active === 'vi' ? 'en' : 'vi')}>{toggleLabel}</button>
  </header>
  <p>{tagline}</p>
</main>
