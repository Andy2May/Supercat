<script lang="ts">
  import { getLang, lang, t } from '../i18n/index.js'
  import { simStore } from '../sim/simStore.svelte.js'
  import { DEFAULTS } from '../sim/simParams.js'
  import { mapSeries } from '../sim/sparkline.js'
  import Term from './Term.svelte'

  /**
   * Advanced-mode right rail (UI redesign T6): consolidates the three old
   * advanced-only UIs into one column of micro-labeled sections separated
   * by hairlines (mockup `ws-rail-r`) —
   *
   *   READOUTS  the old ObservablesBar: numeric readouts beside three
   *             canvas-2D sparklines over `simStore.observablesHistory`;
   *   VIEW      the old ViewToggle's display-space control — now a single
   *             three-way segment (position / momentum / phase) — plus its
   *             contrast slider, binding untouched, and its momentum-view
   *             measurement trigger (measure-momentum);
   *   EXPORT    the old header buttons (PNG / Save state / Load state),
   *             reduced to entry points: the three callback props own the
   *             actual save/load/capture logic (Task 8 wires them in App).
   *
   * App.svelte mounts this ONLY in advanced mode (the component carries no
   * mode logic of its own) and unmounted until Task 8 — same as ToolRail /
   * NarrationPanel. Everything below the fold is carried over from the two
   * source components; the one behavior change is the F1 fold-in: the means
   * chart's fixed range is DERIVED from DEFAULTS.extent instead of a
   * hardcoded 20, so a future extent change keeps the chart on-scale.
   */

  // Entry points owned by the caller (Task 8 wires App's logic here):
  // PNG queues a capture, Save posts serialize-state, Load receives the
  // picked File directly (App's onStateFile decodes it).
  let {
    onExportPng,
    onSaveState,
    onImportFile,
  }: {
    onExportPng: () => void
    onSaveState: () => void
    onImportFile: (file: File) => void
  } = $props()

  // Local mirror of the language store (same pattern as ToolRail): the
  // derived label block re-translates the moment `setLang` fires. The
  // subscription lives in an $effect cleanup so a rail unmount (mode flip)
  // always unsubscribes — a dead rail's closure must not leak.
  let active = $state(getLang())
  $effect(() => {
    return lang.subscribe((value) => {
      active = value
    })
  })

  const labels = $derived.by(() => {
    active // dependency: re-translate when the language changes
    return {
      railReadouts: t('rail.readouts'),
      railView: t('rail.view'),
      railExport: t('rail.export'),
      barLabel: t('obs.barLabel'),
      xMean: t('obs.xMean'),
      yMean: t('obs.yMean'),
      sigmaProduct: t('obs.sigmaProduct'),
      sigmaProductY: t('obs.sigmaProductY'),
      energy: t('obs.energy'),
      jumpNote: t('obs.energyJumpNote'),
      chartMeans: t('obs.chart.means'),
      chartSigma: t('obs.chart.sigma'),
      chartEnergy: t('obs.chart.energy'),
      toggleLabel: t('view.toggleLabel'),
      position: t('view.position'),
      momentum: t('view.momentum'),
      phaseColor: t('view.phaseColor'),
      contrast: t('view.contrast'),
      measureMomentum: t('measure.momentumTool'),
      exportPng: t('export.png'),
      exportJson: t('export.json'),
      importJson: t('import.json'),
    }
  })

  // ---------------------------------------------------------------- readouts

  /** Sparkline strip height (mockup .ws-spark); width tracks the rail. */
  const SPARK_H = 44
  /** Fallback width for the backing store when clientWidth reads 0 (jsdom). */
  const SPARK_FALLBACK_W = 220
  /**
   * F1 fold-in: the simulation box is [-extent/2, extent/2], so the means
   * chart's fixed range is DERIVED from DEFAULTS.extent (the ObservablesBar
   * hardcoded 20 — same number today, but a future extent change keeps the
   * whole orbit on-scale here automatically).
   */
  const MEANS_RANGE = DEFAULTS.extent / 2
  // Physics palette (spec §4: deliberately NOT design tokens — these ride
  // with the canvas renderer, not the chrome scale).
  const CYAN = '#22d3ee'
  const MAGENTA = '#e879f9'
  const GREEN = '#4ade80'

  let meansCanvas = $state<HTMLCanvasElement | undefined>(undefined)
  let sigmaCanvas = $state<HTMLCanvasElement | undefined>(undefined)
  let energyCanvas = $state<HTMLCanvasElement | undefined>(undefined)

  /** Latest history sample ('—' readouts until the first obs frame). */
  const latest = $derived(
    simStore.observablesHistory[simStore.observablesHistory.length - 1],
  )

  function fmt(value: number | undefined): string {
    return value === undefined ? '—' : value.toFixed(2)
  }

  /** CSS-pixel drawing size: the rail's content width (fallback for jsdom). */
  function sparkSize(canvas: HTMLCanvasElement): { w: number; h: number } {
    return { w: canvas.clientWidth || SPARK_FALLBACK_W, h: SPARK_H }
  }

  /** 2D context with a dpr-scaled backing store (same recipe as
   * ObservablesBar): the transform absorbs the scaling, so drawing below
   * works in CSS pixels. */
  function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D | undefined {
    const ctx = canvas.getContext('2d')
    if (ctx === null) return undefined
    const dpr = window.devicePixelRatio || 1
    const { w, h } = sparkSize(canvas)
    const width = Math.max(1, Math.round(w * dpr))
    const height = Math.max(1, Math.round(h * dpr))
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    return ctx
  }

  /**
   * Strokes each series as a normalized polyline (mapSeries), y flipped —
   * canvas y grows downward, chart y grows upward. A faint zero line anchors
   * charts that cross zero. Fewer than two samples draws nothing (a single
   * dot carries no information; the readout already shows the value).
   */
  function drawSpark(
    canvas: HTMLCanvasElement | undefined,
    series: { values: number[]; color: string }[],
    lo: number,
    hi: number,
    zeroLine: boolean,
  ): void {
    if (canvas === undefined) return
    const ctx = context2d(canvas)
    if (ctx === undefined) return
    const { w, h } = sparkSize(canvas)
    ctx.clearRect(0, 0, w, h)

    if (zeroLine && lo < 0 && hi > 0) {
      const zeroY = (1 - (0 - lo) / (hi - lo)) * h
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, zeroY)
      ctx.lineTo(w, zeroY)
      ctx.stroke()
    }

    ctx.lineWidth = 1.5
    for (const s of series) {
      const pts = mapSeries(s.values, lo, hi)
      if (pts.length < 4) continue
      ctx.strokeStyle = s.color
      ctx.beginPath()
      for (let i = 0; i < pts.length; i += 2) {
        const x = pts[i] * w
        const y = (1 - pts[i + 1]) * h
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
  }

  /** Data-driven lo/hi with 10% margin; a flat series (or the very first
   * sample) pads around its value so the line does not hug an edge or
   * degenerate into mapSeries's 0.5 midline. */
  function autoRange(series: number[][]): { lo: number; hi: number } {
    let lo = Infinity
    let hi = -Infinity
    for (const values of series) {
      for (const v of values) {
        if (v < lo) lo = v
        if (v > hi) hi = v
      }
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { lo: 0, hi: 1 }
    const pad = hi > lo ? (hi - lo) * 0.1 : Math.max(Math.abs(hi) * 0.1, 0.5)
    return { lo: lo - pad, hi: hi + pad }
  }

  // Redraw whenever the ring changes (append drops oldest via ringPush) or
  // a canvas binding lands. Reading every element through the $state proxy
  // tracks the mutation; the canvases are plain refs ($state for the
  // effect's sake — bind:this lands before this effect first runs).
  $effect(() => {
    const history = simStore.observablesHistory
    const xs: number[] = []
    const ys: number[] = []
    const sigX: number[] = []
    const sigY: number[] = []
    const energy: number[] = []
    for (const h of history) {
      xs.push(h.x)
      ys.push(h.y)
      sigX.push(h.sigmaX * h.sigmaPx)
      sigY.push(h.sigmaY * h.sigmaPy)
      energy.push(h.energy)
    }
    drawSpark(
      meansCanvas,
      [
        { values: xs, color: CYAN },
        { values: ys, color: MAGENTA },
      ],
      -MEANS_RANGE,
      MEANS_RANGE,
      true,
    )
    const sigma = autoRange([sigX, sigY])
    drawSpark(
      sigmaCanvas,
      [
        { values: sigX, color: CYAN },
        { values: sigY, color: MAGENTA },
      ],
      sigma.lo,
      sigma.hi,
      false,
    )
    const e = autoRange([energy])
    drawSpark(energyCanvas, [{ values: energy, color: GREEN }], e.lo, e.hi, false)
  })

  // ------------------------------------------------------------- view + phase

  const view = $derived(simStore.view)
  // Segment press states: the three segments are mutually exclusive display
  // modes — "phase" IS the position view with the HSV colormap on, so the
  // plain position segment only reads pressed while phaseColor is off.
  const positionOn = $derived(view === 'position' && !simStore.phaseColor)
  const momentumOn = $derived(view === 'momentum')
  const phaseOn = $derived(view === 'position' && simStore.phaseColor)

  /** Plain position view: the stored phaseColor flag clears with it (the
   * old ViewToggle hid its phase button in k-space for the same reason —
   * the flag survives where it cannot apply, the segment must not). */
  function selectPosition(): void {
    simStore.setView('position')
    simStore.phaseColor = false
  }

  /** k-space. Identical to the old ViewToggle: setView drives the worker's
   * momentum flag and no-ops when already there. */
  function selectMomentum(): void {
    simStore.setView('momentum')
  }

  /** Phase coloring: pure render state, but only meaningful over position
   * space (the k-space texture's phase channel is 0) — the segment routes
   * there first, where the old standalone toggle simply hid in k-space. */
  function selectPhase(): void {
    simStore.setView('position')
    simStore.phaseColor = true
  }

  /** The momentum MEASUREMENT trigger (carried verbatim from ViewToggle):
   * never poke a dead sim (nobody would answer), then trigger the
   * Born-rule sampling with a fresh 48-bit seed. Rendered only in the
   * momentum view — same visibility contract as the old {:else} branch —
   * because a k-space sample is what it draws from. */
  function measureMomentum(): void {
    if (simStore.fatal !== undefined) return
    simStore.send({
      type: 'measure-momentum',
      seed: Math.floor(Math.random() * 2 ** 48),
    })
  }

  // ------------------------------------------------------------------ export

  // The hidden file input behind the Load button (same contract as App's).
  let fileInput = $state<HTMLInputElement | undefined>(undefined)

  /** Hands the picked File to the caller and resets the input, so picking
   * the SAME file again still fires a change event. No file: silent. */
  function onImportChange(event: Event): void {
    const input = event.currentTarget
    const file =
      input instanceof HTMLInputElement ? (input.files?.[0] ?? undefined) : undefined
    if (input instanceof HTMLInputElement) input.value = ''
    if (file === undefined) return
    onImportFile(file)
  }
</script>

<div class="readoutrail">
  <!-- ĐỌC SỐ -->
  <section class="section" data-testid="observables-bar" aria-label={labels.barLabel}>
    <div class="section-label">{labels.railReadouts}</div>

    <div class="chart">
      <div class="pair">
        <span class="k"><i class="swatch" style:background={CYAN}></i><Term key="mx" label={labels.xMean} /></span>
        <b class="num" data-testid="x-mean-value">{fmt(latest?.x)}</b>
      </div>
      <div class="pair">
        <span class="k"><i class="swatch" style:background={MAGENTA}></i><Term key="my" label={labels.yMean} /></span>
        <b class="num" data-testid="y-mean-value">{fmt(latest?.y)}</b>
      </div>
      <canvas class="spark" bind:this={meansCanvas} aria-label={labels.chartMeans}></canvas>
    </div>

    <div class="chart">
      <div class="pair">
        <span class="k"><i class="swatch" style:background={CYAN}></i><Term key="sigmaProduct" label={labels.sigmaProduct} /></span>
        <b class="num" data-testid="sigma-x-value">{fmt(latest === undefined ? undefined : latest.sigmaX * latest.sigmaPx)}</b>
      </div>
      <div class="pair">
        <span class="k"><i class="swatch" style:background={MAGENTA}></i><Term key="sigmaProduct" label={labels.sigmaProductY} /></span>
        <b class="num" data-testid="sigma-y-value">{fmt(latest === undefined ? undefined : latest.sigmaY * latest.sigmaPy)}</b>
      </div>
      <canvas class="spark" bind:this={sigmaCanvas} aria-label={labels.chartSigma}></canvas>
    </div>

    <div class="chart">
      <div class="pair">
        <span class="k"><Term key="energy" label={labels.energy} /></span>
        <b class="num" data-testid="energy-value">{fmt(latest?.energy)}</b>
      </div>
      <canvas class="spark" bind:this={energyCanvas} aria-label={labels.chartEnergy}></canvas>
    </div>

    <!-- Dimmed via color-mix, NOT `opacity`: the note hosts a Term whose
         tooltip must paint fully opaque and escape this element's stacking
         (opacity < 1 would trap the tip's z-index and make it
         translucent). -->
    <p class="note" data-testid="energy-jump-note">
      <Term key="energyJump" label={labels.jumpNote} />
    </p>
  </section>

  <hr class="hairline" />

  <!-- HIỂN THỊ -->
  <section class="section">
    <div class="section-label">{labels.railView}</div>

    <div class="view-toggle" role="group" aria-label={labels.toggleLabel} data-testid="view-toggle">
      <button
        type="button"
        data-testid="view-position"
        aria-pressed={positionOn}
        class:active={positionOn}
        onclick={selectPosition}
      >
        {labels.position}
      </button>
      <button
        type="button"
        data-testid="view-momentum"
        aria-pressed={momentumOn}
        class:active={momentumOn}
        onclick={selectMomentum}
      >
        <Term key="momentumSpace" label={labels.momentum} />
      </button>
      <button
        type="button"
        data-testid="phase-toggle"
        aria-pressed={phaseOn}
        class:active={phaseOn}
        onclick={selectPhase}
      >
        <Term key="phase" label={labels.phaseColor} />
      </button>
    </div>

    <!-- Momentum measurement trigger (old ViewToggle's momentum-view else
         branch): k-space sampling, so it exists ONLY while the momentum
         view is displayed — the position view shows nothing in its place
         (the phase entry point is the segment itself now). -->
    {#if view === 'momentum'}
      <button type="button" data-testid="measure-momentum" class="measure" onclick={measureMomentum}>
        {labels.measureMomentum}
      </button>
    {/if}

    <!-- Contrast slider, binding identical to the old ViewToggle: pure
         render state on the store (no worker message); the <label> wraps
         the text so the input's accessible name is the visible label. -->
    <label class="contrast">
      <span class="row">
        <span class="name">{labels.contrast}</span>
        <span class="num value" data-testid="contrast-slider-value">{simStore.contrast.toFixed(2)}</span>
      </span>
      <input
        data-testid="contrast-slider"
        type="range"
        min="0.5"
        max="2.5"
        step="0.05"
        bind:value={simStore.contrast}
      />
    </label>
  </section>

  <hr class="hairline" />

  <!-- XUẤT -->
  <section class="section">
    <div class="section-label">{labels.railExport}</div>
    <div class="outs">
      <button type="button" data-testid="export-png" onclick={() => onExportPng()}>
        {labels.exportPng}
      </button>
      <button type="button" data-testid="export-json" onclick={() => onSaveState()}>
        {labels.exportJson}
      </button>
      <button type="button" data-testid="import-json" onclick={() => fileInput?.click()}>
        {labels.importJson}
      </button>
    </div>
    <input
      data-testid="import-json-input"
      type="file"
      accept=".json,application/json"
      hidden
      bind:this={fileInput}
      onchange={onImportChange}
    />
  </section>
</div>

<style>
  /* Right-rail internals only — the rail frame itself (width, panel
     surface) belongs to the workspace layout that mounts this component
     (Task 8). Colors are tokens (spec §4) except the physics palette. */

  .readoutrail {
    display: flex;
    flex-direction: column;
    gap: 12px;
    text-align: left;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* Micro section label: mono, letterspaced, uppercase — the rail heading
     pattern established by ToolRail (mockup .ws-lab). */
  .section-label {
    font-family: 'JetBrains Mono', ui-monospace, Consolas, monospace;
    font-size: 9.5px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--text-3);
  }

  .hairline {
    border: 0;
    border-top: 1px solid var(--line);
    margin: 0;
  }

  /* Readout rows (mockup .ws-ro .pair): label left, mono value right. */
  .chart {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .pair {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }

  .pair .k {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--text-2);
    white-space: nowrap;
  }

  .swatch {
    width: 10px;
    height: 3px;
    border-radius: 2px;
    display: inline-block;
    flex: none;
  }

  .num {
    font-family: 'JetBrains Mono', ui-monospace, Consolas, monospace;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-1);
  }

  /* Fixed-height, full-width sparkline strips (mockup .ws-spark). The dark
     #000 backing is deliberate (NOT a token): it keeps the neon physics
     lines readable under both the old and new chrome — see the app.css
     token note. Scoped so the app-wide canvas rule's --bg-1 does not
     wash it out. */
  .spark {
    width: 100%;
    height: 44px;
    border-radius: 7px;
    border: 1px solid var(--line);
    background: #000;
  }

  .note {
    margin: 0;
    font-size: 9.5px;
    line-height: 1.55;
    color: color-mix(in srgb, var(--text-2) 80%, transparent);
  }

  /* View segment (mockup .ws-viewseg): one 3-way grid, hairline dividers
     between cells, accent tint on the pressed cell. Rounded ends live on
     the buttons (an overflow-hidden group would clip a Term tip). */
  .view-toggle {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    border: 1px solid var(--line-strong);
    border-radius: 8px;
  }

  .view-toggle button {
    padding: 7px 0;
    border: none;
    border-radius: 0;
    background: transparent;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-align: center;
    color: var(--text-2);
  }

  .view-toggle button + button {
    border-left: 1px solid var(--line-strong);
  }

  .view-toggle button:first-child {
    border-radius: 8px 0 0 8px;
  }

  .view-toggle button:last-child {
    border-radius: 0 8px 8px 0;
  }

  .view-toggle button.active {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    color: var(--accent);
  }

  .view-toggle button:not(.active):hover {
    border-color: transparent;
    background: color-mix(in srgb, var(--text-1) 6%, transparent);
  }

  /* Momentum measurement trigger: full-width secondary action under the
     segment (the global button base supplies the border/hover/focus). */
  .measure {
    padding: 7px 10px;
    font-size: 10.5px;
    color: var(--text-2);
  }

  /* Contrast row, same grammar as ToolRail's param sliders. */
  .contrast {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .contrast .row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  .contrast .name {
    font-size: 10.5px;
    color: var(--text-2);
  }

  .contrast .value {
    font-size: 11px;
  }

  .contrast input {
    width: 100%;
    accent-color: var(--accent);
  }

  /* Export block (mockup .ws-outs): three equal entry points. */
  .outs {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 7px;
  }

  .outs button {
    padding: 8px 2px;
    border-radius: 8px;
    font-size: 10.5px;
    color: var(--text-2);
  }
</style>
