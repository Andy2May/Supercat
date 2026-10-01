<script lang="ts">
  import { getLang, lang, t } from '../i18n/index.js'
  import { simStore } from '../sim/simStore.svelte.js'
  import { mapSeries } from '../sim/sparkline.js'
  import Term from './Term.svelte'

  /**
   * Live observables strip (Task 11, advanced mode only — App.svelte mounts
   * it under `{#if modeStore.mode === 'advanced'}`). Three canvas-2D
   * sparklines over `simStore.observablesHistory`:
   *
   *   1. ⟨x⟩ (cyan) + ⟨y⟩ (magenta) on a fixed [-extent/2, extent/2] range —
   *      the box is [-20, 20], so the whole orbit stays on-scale and both
   *      charts share one mental axis;
   *   2. σx·σpx + σy·σpy (the uncertainty products; the hbar/2 floor is the
   *      interesting part), auto-ranged from the data;
   *   3. energy E, auto-ranged.
   *
   * Each chart has numeric readouts beside it (latest sample). E can jump
   * after a measurement — that is correct physics, and the note says so.
   * Drawing is a tiny pure-ish helper over mapSeries; an $effect redraws
   * whenever the history ring changes (append / reset).
   */

  // Local mirror of the language store (same pattern as App.svelte): the
  // derived label block re-translates the moment `setLang` fires. The
  // subscription returns its own unsubscribe for the $effect cleanup.
  let active = $state(getLang())
  $effect(() => {
    return lang.subscribe((value) => {
      active = value
    })
  })

  const labels = $derived.by(() => {
    active // dependency: re-translate when the language changes
    return {
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
    }
  })

  /** Sparkline CSS size: 3×200px + gaps fits the 42rem main column. */
  const SPARK_W = 200
  const SPARK_H = 60
  /** The simulation box is [-extent/2, extent/2] (extent 40). */
  const MEANS_RANGE = 20
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

  /** 2D context with a dpr-scaled backing store (same recipe as SimCanvas's
   * overlay): the transform absorbs the scaling, so drawing below works in
   * CSS pixels. */
  function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D | undefined {
    const ctx = canvas.getContext('2d')
    if (ctx === null) return undefined
    const dpr = window.devicePixelRatio || 1
    const width = Math.max(1, Math.round(SPARK_W * dpr))
    const height = Math.max(1, Math.round(SPARK_H * dpr))
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
    ctx.clearRect(0, 0, SPARK_W, SPARK_H)

    if (zeroLine && lo < 0 && hi > 0) {
      const zeroY = (1 - (0 - lo) / (hi - lo)) * SPARK_H
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, zeroY)
      ctx.lineTo(SPARK_W, zeroY)
      ctx.stroke()
    }

    ctx.lineWidth = 1.5
    for (const s of series) {
      const pts = mapSeries(s.values, lo, hi)
      if (pts.length < 4) continue
      ctx.strokeStyle = s.color
      ctx.beginPath()
      for (let i = 0; i < pts.length; i += 2) {
        const x = pts[i] * SPARK_W
        const y = (1 - pts[i + 1]) * SPARK_H
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
</script>

<section class="obsbar" data-testid="observables-bar" aria-label={labels.barLabel}>
  <div class="panel">
    <div class="head">
      <span class="pair">
        <i class="swatch" style:background={CYAN}></i><Term key="mx" label={labels.xMean} />
        <b data-testid="x-mean-value">{fmt(latest?.x)}</b>
      </span>
      <span class="pair">
        <i class="swatch" style:background={MAGENTA}></i><Term key="my" label={labels.yMean} />
        <b data-testid="y-mean-value">{fmt(latest?.y)}</b>
      </span>
    </div>
    <canvas bind:this={meansCanvas} aria-label={labels.chartMeans}></canvas>
  </div>

  <div class="panel">
    <div class="head">
      <span class="pair">
        <i class="swatch" style:background={CYAN}></i><Term key="sigmaProduct" label={labels.sigmaProduct} />
        <b data-testid="sigma-x-value">{fmt(latest === undefined ? undefined : latest.sigmaX * latest.sigmaPx)}</b>
      </span>
      <span class="pair">
        <i class="swatch" style:background={MAGENTA}></i><Term key="sigmaProduct" label={labels.sigmaProductY} />
        <b data-testid="sigma-y-value">{fmt(latest === undefined ? undefined : latest.sigmaY * latest.sigmaPy)}</b>
      </span>
    </div>
    <canvas bind:this={sigmaCanvas} aria-label={labels.chartSigma}></canvas>
  </div>

  <div class="panel">
    <div class="head">
      <span class="pair"><Term key="energy" label={labels.energy} /><b data-testid="energy-value">{fmt(latest?.energy)}</b></span>
    </div>
    <canvas bind:this={energyCanvas} aria-label={labels.chartEnergy}></canvas>
  </div>

  <p class="note" data-testid="energy-jump-note"><Term key="energyJump" label={labels.jumpNote} /></p>
</section>

<style>
  .obsbar {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: flex-start;
    gap: 0.4rem 0.75rem;
    margin-top: 1rem;
  }

  .panel {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .head {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    font-size: 0.8rem;
  }

  .pair {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    white-space: nowrap;
  }

  .pair b {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-weight: 600;
  }

  .swatch {
    width: 0.6rem;
    height: 0.25rem;
    border-radius: 0.1rem;
    display: inline-block;
  }

  /* Fixed CSS size overrides the app-wide `canvas { width/height: 100% }`;
     the dark backing keeps the neon lines readable in light and dark mode. */
  .panel canvas {
    width: 200px;
    height: 60px;
    background: #000;
  }

  /* Dimmed via color-mix, NOT `opacity`: the note now hosts a Term whose
     tooltip must paint fully opaque and escape this element's stacking —
     opacity < 1 would create a stacking context and trap the tip's z-index
     (plus make it translucent). */
  .note {
    flex-basis: 100%;
    margin: 0;
    font-size: 0.75rem;
    color: color-mix(in srgb, currentColor 70%, transparent);
  }
</style>
