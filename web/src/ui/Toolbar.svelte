<script lang="ts">
  import { getLang, lang, t } from '../i18n/index.js'
  import { toolState } from '../sim/toolStore.svelte.js'
  import type { Tool } from '../sim/tools.js'

  // Local mirror of the language store (same pattern as App.svelte): the
  // derived label block re-translates the moment `setLang` fires. The
  // subscription lives in an $effect cleanup — hash routing unmounts this
  // component on every landing visit, and each unmount must unsubscribe or
  // the dead toolbar's closure leaks.
  let active = $state(getLang())
  $effect(() => {
    return lang.subscribe((value) => {
      active = value
    })
  })

  const TOOLS: readonly Tool[] = ['brush', 'barrier', 'well', 'eraser', 'packet', 'measure']

  // Swatch dot per tool, mirroring the canvas rendering so the button
  // previews what a stroke looks like: warm = positive V (brush/barrier),
  // teal = negative V (well), dashed ring = eraser, arrow = packet. The
  // measure tool's dot renders as a hollow target ring (see .swatch-ring)
  // — crosshair semantics, no potential value.
  const SWATCH: Record<Tool, string> = {
    brush: '#f2730d',
    barrier: '#f2730d',
    well: '#1f9eb8',
    eraser: '#888',
    packet: '#e6c040',
    measure: 'transparent',
  }

  const labels = $derived.by(() => {
    active // dependency: re-translate when the language changes
    return {
      brush: t('tool.brush'),
      barrier: t('tool.barrier'),
      well: t('tool.well'),
      eraser: t('tool.eraser'),
      packet: t('tool.packet'),
      measure: t('measure.positionTool'),
      height: t('tool.height'),
      kMag: t('tool.kMag'),
    }
  })
</script>

<div class="toolbar" role="toolbar">
  <div class="tools">
    {#each TOOLS as tool (tool)}
      <button
        data-testid="tool-{tool}"
        aria-pressed={toolState.tool === tool}
        class:active={toolState.tool === tool}
        onclick={() => (toolState.tool = tool)}
      >
        <span
          class="swatch"
          class:swatch-ring={tool === 'measure'}
          style={`--swatch: ${SWATCH[tool]}`}
        ></span>
        {labels[tool]}
      </button>
    {/each}
  </div>
  <label class="slider">
    <span>{labels.height}</span>
    <input
      data-testid="height-slider"
      type="range"
      min="0.5"
      max="20"
      step="0.5"
      bind:value={toolState.height}
    />
    <span class="value">{toolState.height}</span>
  </label>
  <label class="slider">
    <span>{labels.kMag}</span>
    <input
      data-testid="k-slider"
      type="range"
      min="0"
      max="15"
      step="0.5"
      bind:value={toolState.kMag}
    />
    <span class="value">{toolState.kMag}</span>
  </label>
</div>

<style>
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.75rem 1.25rem;
    margin-top: 1.25rem;
  }

  .tools {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;
  }

  button.active {
    background: currentColor;
    /* Keep the pressed label readable against the inverted background. */
    color: light-dark(white, black);
  }

  .swatch {
    display: inline-block;
    width: 0.55rem;
    height: 0.55rem;
    margin-inline-end: 0.4rem;
    border-radius: 50%;
    background: var(--swatch);
    vertical-align: baseline;
  }

  /* Measure tool: a hollow ring reads as a target/crosshair — the click
     aims a measurement, it paints no potential. */
  .swatch-ring {
    border: 1.5px solid currentColor;
    box-sizing: border-box;
  }

  .slider {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
  }

  .slider input {
    width: 8rem;
  }

  .slider .value {
    min-width: 2.2rem;
    text-align: right;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  }
</style>
