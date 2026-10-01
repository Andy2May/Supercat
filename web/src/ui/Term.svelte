<script lang="ts">
  import { getLang, lang } from '../i18n/index.js'
  import { GLOSSARY } from '../i18n/glossary.js'

  /**
   * Inline glossary term (Task 15, advanced-mode UI only — spec §2.1 keeps
   * explore labels plain). Dotted underline; the tooltip appears on hover
   * AND on keyboard focus (`:focus-within` — the span itself is tabbable,
   * see the global `.term` / `.tip` rules in app.css; they live there, not
   * in a scoped <style>, so they stay overridable next to the other global
   * overlay styles). Styling is global because the tip must float above
   * canvases and out of clipping containers owned by other components.
   *
   * `label` is the visible text (callers pass the existing i18n label —
   * math notation like ⟨x⟩ is language-independent by design); `key`
   * indexes GLOSSARY. A missing entry degrades to the key text inside the
   * tooltip — visible, never silent, never an error.
   */
  let { key, label = undefined }: { key: string; label?: string } = $props()

  // Local mirror of the language store (same pattern as Landing.svelte):
  // the tip re-translates the moment `setLang` fires. The subscription
  // returns its own unsubscribe for the $effect cleanup — without it, every
  // mount of a term (mode flips, view swaps) would leak a subscriber.
  let active = $state(getLang())
  $effect(() => {
    return lang.subscribe((value) => {
      active = value
    })
  })

  const tip = $derived.by(() => {
    active // dependency: re-translate when the language changes
    const entry = GLOSSARY[key]
    return entry === undefined ? key : entry[active]
  })
</script>

<!-- The span is deliberately tabbable: keyboard users must be able to
     focus the term to reveal the tip (:focus-within rule in app.css). That
     is the standard focus-trigger + role="tooltip" pattern, so the lint
     rule's "noninteractive element" heuristic does not apply here. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<span class="term" tabindex="0">
  {label ?? key}
  <span class="tip" role="tooltip">{tip}</span>
</span>
