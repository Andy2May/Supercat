<script lang="ts">
  import { getLang, lang, t } from '../i18n/index.js'
  import { toolState } from '../sim/toolStore.svelte.js'
  import type { Tool } from '../sim/tools.js'

  /** `compact: true` hides the contextual params block (explore mode). */
  let { compact = false }: { compact?: boolean } = $props()

  // Local mirror of the language store (same pattern as Toolbar.svelte): the
  // derived label block re-translates the moment `setLang` fires. The
  // subscription lives in an $effect cleanup so unmounting (Task 8 swaps the
  // rail per mode) always unsubscribes — a dead rail's closure must not leak.
  let active = $state(getLang())
  $effect(() => {
    return lang.subscribe((value) => {
      active = value
    })
  })

  const TOOLS: readonly Tool[] = ['brush', 'barrier', 'well', 'eraser', 'packet', 'measure']

  // Icon stroke per tool, mirroring the canvas physics palette (deliberately
  // NOT design tokens — see the note in app.css): warm = positive V
  // (brush/barrier), teal = negative V (well), gray = removes V (eraser),
  // gold = the packet, accent = the measure crosshair. The color rides a
  // --icon custom property mapped onto the svg in CSS, because measure's
  // var(--accent) cannot go through a presentation attribute.
  const ICON: Record<Tool, string> = {
    brush: '#F2730D',
    barrier: '#F2730D',
    well: '#1F9EB8',
    eraser: '#8b94a3',
    packet: '#E6C040',
    measure: 'var(--accent)',
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
      rail: t('rail.tools'),
    }
  })

  // Contextual params: the V-tools (brush/barrier/well) edit stroke height,
  // packet edits |k|, eraser and measure take no parameters. `compact` hides
  // the whole block — the explore mode rail is tools-only.
  const param = $derived.by(() => {
    if (compact) return null
    switch (toolState.tool) {
      case 'brush':
      case 'barrier':
      case 'well':
        return 'height'
      case 'packet':
        return 'kMag'
      default:
        return null
    }
  })
</script>

<div class="toolrail">
  <div class="section-label">{labels.rail}</div>

  <div class="tools" role="group" aria-label={labels.rail}>
    {#each TOOLS as tool (tool)}
      <button
        type="button"
        data-testid="tool-{tool}"
        aria-pressed={toolState.tool === tool}
        class:active={toolState.tool === tool}
        onclick={() => (toolState.tool = tool)}
        style={`--icon: ${ICON[tool]}`}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          {#if tool === 'brush'}
            <!-- pen nib: one stroke, one tick at the tip -->
            <path d="M4 20c6-1 12-7 15-15M4 20l3-3" />
          {:else if tool === 'barrier'}
            <!-- three pickets -->
            <path d="M8 3v18M12 3v18M16 3v18" />
          {:else if tool === 'well'}
            <!-- downward basin with walls -->
            <path d="M3 8c3 5 6 7 9 7s6-2 9-7M3 8v4M21 8v4" />
          {:else if tool === 'eraser'}
            <!-- parallelogram block with a sweep line -->
            <path d="M7 21l-4-4L14 6l4 4L7 21zM13 4l7 7" />
          {:else if tool === 'packet'}
            <!-- packet disc with an arrow emitting from it -->
            <circle cx="10" cy="12" r="5" />
            <path d="M15 12h6M18 9l3 3-3 3" />
          {:else}
            <!-- crosshair: a pure position measurement -->
            <circle cx="12" cy="12" r="6" />
            <path d="M12 2v5M12 17v5M2 12h5M17 12h5" />
          {/if}
        </svg>
        <span class="label">{labels[tool]}</span>
      </button>
    {/each}
  </div>

  {#if param}
    <div class="params">
      <div class="params-label">{labels[toolState.tool]}</div>
      {#if param === 'height'}
        <label class="param">
          <span class="row">
            <span class="name">{labels.height}</span>
            <span class="value">{toolState.height}</span>
          </span>
          <input
            data-testid="height-slider"
            type="range"
            min="0.5"
            max="20"
            step="0.5"
            bind:value={toolState.height}
          />
        </label>
      {:else}
        <label class="param">
          <span class="row">
            <span class="name">{labels.kMag}</span>
            <span class="value">{toolState.kMag}</span>
          </span>
          <input
            data-testid="k-slider"
            type="range"
            min="0"
            max="15"
            step="0.5"
            bind:value={toolState.kMag}
          />
        </label>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* Left-rail internals only — the rail frame itself (width, panel surface)
     belongs to the workspace layout that mounts this component (Task 8). */

  .toolrail {
    display: flex;
    flex-direction: column;
    gap: 12px;
    text-align: left;
  }

  /* Micro section label: mono, letterspaced, uppercase (mockup .ws-lab). */
  .section-label,
  .params-label {
    font-family: 'JetBrains Mono', ui-monospace, Consolas, monospace;
    font-size: 9.5px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--text-3);
  }

  /* 3x2 tool grid (mockup .ws-tools): icon above label, min 32px targets. */
  .tools {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 7px;
  }

  .tools button {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    min-height: 32px;
    padding: 9px 4px 7px;
    border-radius: 9px;
    border: 1px solid var(--line-strong);
    background: transparent;
    color: var(--text-2);
    line-height: 1.2;
  }

  .tools button:hover {
    border-color: var(--accent);
  }

  .tools button.active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 8%, transparent);
    color: var(--text-1);
  }

  .tools button svg {
    width: 17px;
    height: 17px;
    fill: none;
    stroke: var(--icon);
    stroke-width: 1.75;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .tools .label {
    font-size: 10px;
  }

  /* Contextual params card (mockup .ws-params). */
  .params {
    display: flex;
    flex-direction: column;
    gap: 9px;
    padding: 10px 11px;
    border: 1px solid var(--line-strong);
    border-radius: 10px;
    background: var(--bg-2);
  }

  .param {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .param .row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  .param .name {
    font-size: 10.5px;
    color: var(--text-2);
  }

  .param .value {
    font-family: 'JetBrains Mono', ui-monospace, Consolas, monospace;
    font-size: 11px;
    color: var(--text-1);
  }

  .param input {
    width: 100%;
    accent-color: var(--accent);
  }
</style>
