<script lang="ts">
  /**
   * Dead-end page rendered instead of the app when WebGL2 is unavailable
   * (`hasWebGl2() === false`): no worker, no canvas, just the explanation.
   */
  import { getLang, lang, t } from '../i18n/index.js'

  let active = $state(getLang())
  lang.subscribe((value) => {
    active = value
  })

  const labels = $derived.by(() => {
    active // dependency: re-translate when the language changes
    return { title: t('webgl.missingTitle'), body: t('app.noWebgl') }
  })
</script>

<div class="webgl-missing" data-testid="webgl-missing">
  <h2>{labels.title}</h2>
  <p>{labels.body}</p>
</div>

<style>
  .webgl-missing {
    margin-top: 3rem;
  }

  .webgl-missing p {
    color: color-mix(in srgb, currentColor 70%, transparent);
  }
</style>
