<script lang="ts">
  /**
   * Dead-end page rendered instead of the app when WebGL2 is unavailable
   * (`hasWebGl2() === false`): no worker, no canvas, just the explanation.
   * Rendered OUTSIDE App's `<main>` column, so it owns the full viewport:
   * a centered panel card on the page ground (UI redesign T10 restyle —
   * tokens, Space Grotesk via the body font, accent psi mark; the message
   * copy and i18n keys are unchanged).
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
  <div class="card">
    <span class="psi" aria-hidden="true">ψ</span>
    <h2>{labels.title}</h2>
    <p>{labels.body}</p>
  </div>
</div>

<style>
  .webgl-missing {
    min-height: 100vh;
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: 1.5rem 1rem;
    text-align: center;
  }

  /* Raised panel card on the page ground — the same surface language as the
     term tips and the landing glass nav, minus the blur (nothing glows behind
     a dead end). */
  .card {
    max-width: 26rem;
    padding: 2rem 2.25rem 2.25rem;
    border-radius: 12px;
    background: var(--bg-1);
    border: 1px solid var(--line-strong);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
  }

  /* The brand's psi mark in the accent (decorative, mirrors the landing
     nav's glyph). */
  .psi {
    display: block;
    font-size: 1.75rem;
    line-height: 1;
    font-weight: 700;
    color: var(--accent);
    margin-bottom: 0.9rem;
  }

  .webgl-missing h2 {
    margin: 0 0 0.5rem;
    font-size: 1.15rem;
    font-weight: 600;
    letter-spacing: 0.01em;
    color: var(--text-1);
  }

  .webgl-missing p {
    margin: 0;
    color: var(--text-2);
  }
</style>
