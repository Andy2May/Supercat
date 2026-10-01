<script module lang="ts">
  /** Per-instance tip-id counter — aria-describedby targets must be unique
   * across the document (module scope: one counter for every Term). */
  let termCount = 0
</script>

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
   *
   * Task-18 deferred T15 minors, folded in here: the tip carries a stable
   * id and the span wires aria-describedby so screen readers announce it;
   * the tip clamps horizontally inside the viewport when it would overflow;
   * and a HOSTING button (the ViewToggle terms live inside <button>s)
   * reveals the tip on its own :focus-visible too (app.css).
   */
  let { key, label = undefined }: { key: string; label?: string } = $props()

  /** aria-describedby target for this instance ("term-tip-7", ...). */
  const tipId = `term-tip-${++termCount}`

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

  let root = $state<HTMLSpanElement | undefined>(undefined)
  let tipEl = $state<HTMLSpanElement | undefined>(undefined)

  /** Viewport padding kept clear on either side when clamping. */
  const CLAMP_PAD = 8

  /**
   * Horizontal viewport clamp (T18, deferred T15 minor): the centered tip
   * overflows the right edge when the term sits near it (both ViewToggle
   * terms do). Runs on hover/focus ENTER, before the reveal rule applies:
   * the tip is display:none by default (a permanently laid-out tip near the
   * edge would create viewport scrollbars), so it is materialized
   * invisibly for one synchronous measurement — everything happens inside
   * the event handler, before the browser paints, so the transient state
   * never flickers. The clamp is a transform shift, keeping the anchored
   * look; any previous clamp is reset first so the measurement reads the
   * natural position.
   */
  function clampTip(): void {
    const tip = tipEl
    if (tip === undefined) return
    tip.style.transform = ''
    tip.style.display = 'block'
    tip.style.visibility = 'hidden'
    const rect = tip.getBoundingClientRect()
    const overRight = rect.right - (window.innerWidth - CLAMP_PAD)
    const overLeft = CLAMP_PAD - rect.left
    if (overRight > 0) {
      tip.style.transform = `translateX(calc(-50% - ${Math.ceil(overRight)}px))`
    } else if (overLeft > 0) {
      tip.style.transform = `translateX(calc(-50% + ${Math.ceil(overLeft)}px))`
    }
    tip.style.display = ''
    tip.style.visibility = ''
  }

  /**
   * The tip also reveals when a HOSTING button takes keyboard focus (the
   * app.css `button:focus-visible .term .tip` rule) — that focus event
   * never passes through this span, so the clamp is wired to the host
   * here via closest('button'). No host changes needed in the callers.
   */
  $effect(() => {
    const el = root
    if (el === undefined) return
    const host = el.closest('button')
    if (host === null) return
    host.addEventListener('focusin', clampTip)
    return () => host.removeEventListener('focusin', clampTip)
  })
</script>

<!-- The span is deliberately tabbable: keyboard users must be able to
     focus the term to reveal the tip (:focus-within rule in app.css). That
     is the standard focus-trigger + role="tooltip" pattern, so the lint
     rule's "noninteractive element" heuristic does not apply here.
     aria-describedby points at the tip so screen readers announce the
     glossary text when the span is focused. The pointerenter/focusin
     handlers are POSITIONING only (the viewport clamp) — the reveal itself
     is pure CSS (:hover / :focus-visible / :focus-within), so the static-
     element-interactions heuristic does not apply either. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_static_element_interactions -->
<span
  class="term"
  tabindex="0"
  aria-describedby={tipId}
  bind:this={root}
  onpointerenter={clampTip}
  onfocusin={clampTip}
>
  {label ?? key}
  <span class="tip" id={tipId} role="tooltip" bind:this={tipEl}>{tip}</span>
</span>
