<script lang="ts">
  import { getLang, lang, t } from '../i18n/index.js'
  import { INFERNO_GRADIENT_CSS, PHASE_GRADIENT_CSS, V_LEGEND_HEX } from '../render/shaders.js'
  import { startSimLoop } from '../render/simLoop.js'
  import { modeStore } from '../sim/modeStore.svelte.js'
  import { dragToPacket } from '../sim/packet.js'
  import { DEFAULTS, screenToGrid } from '../sim/simParams.js'
  import { effectiveColorMode, simStore } from '../sim/simStore.svelte.js'
  import { toolState } from '../sim/toolStore.svelte.js'
  import { strokeToOp, strokeToOps, type Pt } from '../sim/tools.js'
  import { binToScreen, clearMarkers, drawMarkers, spawnMarker } from './markers.js'
  import type { MeasuredOutcome } from '../sim/protocol.js'

  let {
    /**
     * Fires once when renderer startup throws (App shows the dead end).
     * Carries the thrown error so App can tell the NO_WEBGL2 sentinel apart
     * from a shader/link bug; the error is logged here either way.
     */
    onRenderFailed = () => {},
    /**
     * 'landing' (UI redesign T9): the landing's decorative full-bleed
     * background — the stage fills its (non-square) parent with no
     * max-width/radius/border (the renderer stretches its quad over the
     * letterbox; acceptable for a backdrop, the sim view keeps the square
     * stage), pointer handlers stay unattached (no painting, no measuring,
     * touch-action returns to the browser default) and the t-label + V-legend
     * never mount. 'app' (default) is byte-identical to the pre-variant
     * component.
     */
    variant = 'app',
  }: { onRenderFailed?: (error: unknown) => void; variant?: 'app' | 'landing' } = $props()

  /** Landing shorthand used by the template (handlers + label gating). */
  const interactive = $derived(variant !== 'landing')

  // Local mirror of the language store (same pattern as App.svelte): the
  // derived label below re-translates when `setLang` fires. The subscription
  // lives in an $effect cleanup — hash routing unmounts this component on
  // every landing visit, and each unmount must unsubscribe or the dead
  // canvas's closure leaks.
  let active = $state(getLang())
  $effect(() => {
    return lang.subscribe((value) => {
      active = value
    })
  })

  const canvasLabel = $derived.by(() => {
    active // dependency: re-translate when the language changes
    return t('app.canvasLabel')
  })

  // ------------------------------------------------------- V-overlay legend

  /**
   * max|V| readout (Task 18, spec 7.1; relabeled 2026-10-01 physics audit —
   * the value is max|V|, only a single-height preset makes it a "V₀"):
   * at most one decimal ("30", "24", "12.5") — the value is a float32 max
   * over the uploaded potential, not an exact design constant, so
   * pretending more precision is noise.
   */
  function fmtV0(value: number): string {
    const rounded = Math.round(value * 10) / 10
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
  }

  /**
   * Legend copy (Task 18): chip labels + the live scale. `potentialMax` is
   * written by the render loop only on potential uploads, so this derived
   * re-runs on edits, not per frame. The chip COLORS are the shader's own
   * constants (V_LEGEND_HEX) — the legend cannot drift from the renderer.
   */
  const legend = $derived.by(() => {
    active // dependency: re-translate when the language changes
    return {
      barrier: t('legend.barrier'),
      well: t('legend.well'),
      v0: t('legend.v0', { v: fmtV0(simStore.potentialMax) }),
    }
  })

  /**
   * Shown only when there is something to explain: V non-zero somewhere
   * AND the position view (the momentum view hides the V overlay entirely,
   * so its colors must not be narrated there). Free-packet/sandbox boot
   * with V ≡ 0 and stay legendless until the user draws.
   */
  const legendVisible = $derived(
    interactive && simStore.potentialMax > 0 && simStore.view === 'position',
  )

  // ------------------------------------------------- field colormap legend

  /**
   * Which field colormap the canvas is painting right now — derived from
   * the SAME predicates the render loop feeds the shader each frame
   * (store.view + effectiveColorMode against the live experience mode), so
   * the chip can never narrate a colormap the canvas is not in: a
   * phaseColor flag left on underneath explore mode shows the inferno
   * ramp, because that is exactly what the canvas falls back to there.
   * 'none' = landing backdrop (a decorative canvas names no colors).
   */
  const colVariant = $derived.by(() => {
    if (!interactive) return 'none'
    if (simStore.view === 'momentum') return 'momentum'
    return effectiveColorMode(simStore.view, simStore.phaseColor, modeStore.mode) === 1
      ? 'phase'
      : 'density'
  })

  /** Translated caption/endpoint words + the phase note (−π/+π stay mono). */
  const colLabels = $derived.by(() => {
    active // dependency: re-translate when the language changes
    return {
      densityCaption: t('legend.densityCaption'),
      momentumCaption: t('legend.momentumCaption'),
      low: t('legend.low'),
      high: t('legend.high'),
      phaseNote: t('legend.phaseNote'),
    }
  })

  let canvas = $state<HTMLCanvasElement | undefined>(undefined)
  let overlay = $state<HTMLCanvasElement | undefined>(undefined)

  // The render loop lives in a TS module; the component only mounts it onto
  // the WebGL canvas and tears it down on unmount.
  $effect(() => {
    const element = canvas
    if (element === undefined) return
    try {
      return startSimLoop(element, simStore)
    } catch (error) {
      // Never swallow renderer startup failures: without this a shader/link
      // bug would surface only as a dead canvas with no console trace.
      console.error(error)
      onRenderFailed(error)
    }
  })

  // ---------------------------------------------------------------- drawing

  /** True between pointerdown and pointerup/pointercancel. */
  let dragging = false
  /** brush/eraser: pointer samples buffered since the last rAF flush. */
  let pending: Pt[] = []
  /** Last flushed sample — keeps strokes continuous across flush batches. */
  let last: Pt | undefined
  /** barrier/well: drag endpoints (dashed preview; one op on release). */
  let previewFrom: Pt | undefined
  let previewTo: Pt | undefined
  /** packet: press point (the future packet center) and current pointer. */
  let packetFrom: Pt | undefined
  let packetTo: Pt | undefined
  /** measure: pointer-down screen position (click-vs-drag detection). */
  let measureDown: { x: number; y: number } | undefined
  let flushRaf = 0

  // Cancel any pending flush / marker animation / toast timer when the
  // component goes away mid-drag or mid-measurement.
  $effect(() => {
    return () => {
      if (flushRaf !== 0) cancelAnimationFrame(flushRaf)
      if (markerRaf !== 0) cancelAnimationFrame(markerRaf)
      if (toastTimer !== 0) window.clearTimeout(toastTimer)
      clearMarkers()
    }
  })

  function isStreamTool(tool: string): tool is 'brush' | 'eraser' {
    return tool === 'brush' || tool === 'eraser'
  }

  function isSegmentTool(tool: string): tool is 'barrier' | 'well' {
    return tool === 'barrier' || tool === 'well'
  }

  function isPacketTool(tool: string): tool is 'packet' {
    return tool === 'packet'
  }

  function isMeasureTool(tool: string): tool is 'measure' {
    return tool === 'measure'
  }

  function toGrid(event: PointerEvent): Pt {
    const element = canvas!
    // offsetX/Y are relative to the captured target (the sim canvas);
    // screenToGrid clamps, so a drag past the edge saturates at the border.
    return screenToGrid(
      event.offsetX,
      event.offsetY,
      element.clientWidth,
      element.clientHeight,
      DEFAULTS.extent,
      DEFAULTS.extent,
    )
  }

  /**
   * Emits ops for every buffered sample (plus an optional closing one) — one
   * rAF tick's worth of a brush/eraser stroke. Batching keeps the worker at
   * most one message burst per frame instead of one per pointermove.
   */
  function flushPending(extra?: Pt): void {
    const tool = toolState.tool
    if (!isStreamTool(tool)) {
      pending = []
      return
    }
    const points = extra === undefined ? pending : pending.concat([extra])
    for (const point of points) {
      if (last !== undefined) {
        for (const op of strokeToOps(tool, toolState.height, last, point)) {
          simStore.send(op)
        }
      }
      last = point
    }
    pending = []
  }

  /** rAF driver: flush once per frame while the pointer is down. */
  function flushTick(): void {
    flushRaf = dragging ? requestAnimationFrame(flushTick) : 0
    flushPending()
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || canvas === undefined) return
    canvas.setPointerCapture(event.pointerId)
    dragging = true
    const point = toGrid(event)
    if (isStreamTool(toolState.tool)) {
      last = point
      pending = []
      // A click without a move still paints one dot.
      const op = strokeToOp(toolState.tool, toolState.height, point, point)
      if (op !== null) simStore.send(op)
      flushRaf = requestAnimationFrame(flushTick)
    } else if (isSegmentTool(toolState.tool)) {
      previewFrom = point
      previewTo = point
      drawPreview()
    } else if (isPacketTool(toolState.tool)) {
      // Press = packet center; the drag aims (direction -> momentum, length
      // -> sigma). Nothing is sent until pointerup, so aiming is harmless.
      packetFrom = point
      packetTo = point
      drawPreview()
    } else if (isMeasureTool(toolState.tool)) {
      // Record the press position in SCREEN pixels: the release decides
      // click (< 3 px) vs. drag, and only a click measures.
      measureDown = { x: event.offsetX, y: event.offsetY }
    }
  }

  function onPointerMove(event: PointerEvent): void {
    if (!dragging) return
    const point = toGrid(event)
    if (isStreamTool(toolState.tool)) {
      pending.push(point)
    } else if (previewFrom !== undefined) {
      previewTo = point
      drawPreview()
    } else if (packetFrom !== undefined) {
      packetTo = point
      drawPreview()
    }
  }

  function onPointerUp(event: PointerEvent): void {
    if (!dragging) return
    stopDrag()
    if (isStreamTool(toolState.tool)) {
      // Flush the un-ticked tail synchronously, then close the stroke.
      flushPending(toGrid(event))
      last = undefined
    } else if (isSegmentTool(toolState.tool) && previewFrom !== undefined) {
      const op = strokeToOp(
        toolState.tool,
        toolState.height,
        previewFrom,
        previewTo ?? previewFrom,
      )
      if (op !== null) simStore.send(op)
      previewFrom = undefined
      previewTo = undefined
      clearPreview()
    } else if (packetFrom !== undefined) {
      dropPacket(packetFrom, packetTo ?? toGrid(event))
      packetFrom = undefined
      packetTo = undefined
      clearPreview()
    } else if (measureDown !== undefined) {
      const drag = Math.hypot(event.offsetX - measureDown.x, event.offsetY - measureDown.y)
      measureDown = undefined
      if (drag < 3) measurePosition()
    }
  }

  /**
   * Sends a position measurement (Task 14). QUANTUM MEASUREMENT, NOT STATE
   * PREPARATION: the click is purely a TRIGGER — the worker samples the
   * outcome cell from |psi|^2 (Born rule, deterministic per seed) and
   * collapses ψ around it with the instrument Gaussian. The click location
   * itself is never used; there is deliberately no "place the particle
   * here" semantic. The seed spans the full 48-bit wasm domain.
   */
  function measurePosition(): void {
    // A fatal worker state means nobody will ever answer the measurement.
    if (simStore.fatal !== undefined) return
    simStore.send({
      type: 'measure-position',
      seed: Math.floor(Math.random() * 2 ** 48),
    })
  }

  /**
   * Ends a packet drag: converts the anchor -> pointer drag (dead zone = 2
   * css px converted through the live canvas scale) into a `set-gaussian`
   * drop and auto-resumes — a fresh packet always starts playing (the
   * worker resets t = 0 on set-gaussian and frames the state immediately).
   */
  function dropPacket(anchor: Pt, drag: Pt): void {
    // A fatal worker state means nobody will ever answer: never send a
    // packet into a dead simulation (nor auto-resume it via running).
    if (simStore.fatal !== undefined) return
    const element = canvas
    if (element === undefined) return
    const minDrag = (2 / element.clientWidth) * DEFAULTS.extent
    const packet = dragToPacket(anchor, drag, toolState.kMag, minDrag)
    if (packet === null) return
    simStore.send({
      type: 'set-gaussian',
      x0: packet.x0,
      y0: packet.y0,
      kx: packet.kx,
      ky: packet.ky,
      sigmaX: packet.sigma,
      sigmaY: packet.sigma,
    })
    simStore.running = true
  }

  function onPointerCancel(): void {
    if (!dragging) return
    stopDrag()
    pending = []
    last = undefined
    previewFrom = undefined
    previewTo = undefined
    packetFrom = undefined
    packetTo = undefined
    measureDown = undefined
    clearPreview()
  }

  function stopDrag(): void {
    dragging = false
    if (flushRaf !== 0) {
      cancelAnimationFrame(flushRaf)
      flushRaf = 0
    }
  }

  // ------------------------------------------------------- preview overlay

  /** 2D context with the backing store sized to the sim canvas (dpr-aware). */
  function overlayContext(): CanvasRenderingContext2D | undefined {
    if (canvas === undefined || overlay === undefined) return undefined
    const ctx = overlay.getContext('2d')
    if (ctx === null) return undefined
    const dpr = window.devicePixelRatio || 1
    const width = Math.max(1, Math.round(canvas.clientWidth * dpr))
    const height = Math.max(1, Math.round(canvas.clientHeight * dpr))
    if (overlay.width !== width || overlay.height !== height) {
      overlay.width = width
      overlay.height = height
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    return ctx
  }

  /** Inverse of screenToGrid for preview drawing (same center origin). */
  function gridToScreen(point: Pt): { x: number; y: number } {
    const element = canvas!
    return {
      x: (point.x / DEFAULTS.extent + 0.5) * element.clientWidth,
      y: (point.y / DEFAULTS.extent + 0.5) * element.clientHeight,
    }
  }

  function drawPreview(): void {
    const ctx = overlayContext()
    if (ctx === undefined || canvas === undefined) return
    if (packetFrom !== undefined && packetTo !== undefined) {
      drawPacketPreview(
        ctx,
        gridToScreen(packetFrom),
        gridToScreen(packetTo),
      )
      return
    }
    if (previewFrom === undefined || previewTo === undefined) return
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)
    const a = gridToScreen(previewFrom)
    const b = gridToScreen(previewTo)

    // Dark halo under light dashes: readable over any heatmap value.
    for (const [color, width] of [
      ['rgba(0, 0, 0, 0.55)', 3],
      ['rgba(255, 255, 255, 0.95)', 1.5],
    ] as const) {
      ctx.beginPath()
      ctx.setLineDash([6, 6])
      ctx.lineWidth = width
      ctx.strokeStyle = color
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }

    ctx.setLineDash([])
    for (const p of [a, b]) {
      ctx.beginPath()
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  /**
   * Packet aiming preview: a solid arrow from the anchor (packet center)
   * toward the pointer (momentum direction) plus a circle of the σ that the
   * drag length will produce (clamped), both with the dark-halo treatment
   * so they stay readable over any heatmap value.
   */
  function drawPacketPreview(
    ctx: CanvasRenderingContext2D,
    a: { x: number; y: number },
    b: { x: number; y: number },
  ): void {
    if (canvas === undefined || packetFrom === undefined || packetTo === undefined) {
      return
    }
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)

    // σ preview in css px: drag length (grid) clamped, scaled back to screen.
    const length = Math.hypot(packetTo.x - packetFrom.x, packetTo.y - packetFrom.y)
    const sigma = Math.min(
      DEFAULTS.sigmaMax,
      Math.max(DEFAULTS.sigmaMin, length),
    )
    const radius = (sigma / DEFAULTS.extent) * canvas.clientWidth

    for (const [color, width] of [
      ['rgba(0, 0, 0, 0.55)', 3],
      ['rgba(255, 255, 255, 0.95)', 1.5],
    ] as const) {
      ctx.setLineDash([])
      ctx.lineWidth = width
      ctx.strokeStyle = color

      // Aim arrow: anchor -> pointer with a small V head at the tip.
      const angle = Math.atan2(b.y - a.y, b.x - a.x)
      const head = 10
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.moveTo(b.x, b.y)
      ctx.lineTo(b.x - head * Math.cos(angle - Math.PI / 6), b.y - head * Math.sin(angle - Math.PI / 6))
      ctx.moveTo(b.x, b.y)
      ctx.lineTo(b.x - head * Math.cos(angle + Math.PI / 6), b.y - head * Math.sin(angle + Math.PI / 6))
      ctx.stroke()

      // σ-radius circle around the anchor.
      ctx.beginPath()
      ctx.arc(a.x, a.y, radius, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  function clearPreview(): void {
    if (canvas === undefined || overlay === undefined) return
    overlayContext()?.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)
  }

  // ------------------------------------------------ measurement marker/toast

  /** Dedicated markers rAF id — runs exactly while a ring is alive. */
  let markerRaf = 0
  /** Transient outcome toast ("Đo tại (x, y)" / "Đo k = (kx, ky)"). */
  let toast = $state<string | undefined>(undefined)
  let toastTimer = 0

  function markerTick(): void {
    const element = canvas
    if (element === undefined) {
      markerRaf = 0
      return
    }
    const ctx = overlayContext()
    const alive =
      ctx !== undefined &&
      drawMarkers(ctx, performance.now(), element.clientWidth, element.clientHeight)
    markerRaf = alive ? requestAnimationFrame(markerTick) : 0
  }

  /** Outcome -> toast text; hides itself again after 2 s. */
  function showToast(outcome: MeasuredOutcome): void {
    // Non-reactive t() on purpose: a language flip must not re-fire the
    // marker effect (and the toast is long gone before it would matter).
    toast = t(
      outcome.kind === 'position' ? 'measure.resultPosition' : 'measure.resultMomentum',
      { x: fmt(outcome.x), y: fmt(outcome.y) },
    )
    if (toastTimer !== 0) window.clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => {
      toast = undefined
      toastTimer = 0
    }, 2_000)
  }

  /** Fixed 2-decimal readout; keeps "-0.00" from ever rendering. */
  function fmt(value: number): string {
    const s = value.toFixed(2)
    return s === '-0.00' ? '0.00' : s
  }

  // A landed measurement: spawn the ring marker where the OUTCOME sits and
  // announce it. Position outcomes map through the same gridToScreen the
  // previews use; momentum outcomes map their fftfreq bin through the
  // fftshift-consistent binToScreen so the ring lands on the exact texel
  // the collapsed k-space cell lights up.
  $effect(() => {
    const outcome = simStore.lastMeasurement
    const element = canvas
    if (outcome === undefined || element === undefined) return
    if (outcome.kind === 'position') {
      const s = gridToScreen({ x: outcome.x, y: outcome.y })
      spawnMarker(s.x, s.y, performance.now())
    } else if (outcome.i !== undefined && outcome.j !== undefined) {
      const s = binToScreen(
        outcome.i,
        outcome.j,
        simStore.grid,
        simStore.grid,
        element.clientWidth,
        element.clientHeight,
      )
      spawnMarker(s.x, s.y, performance.now())
    }
    showToast(outcome)
    if (markerRaf === 0) markerRaf = requestAnimationFrame(markerTick)
  })
</script>

<div class="stage" class:landing={variant === 'landing'}>
  <canvas
    bind:this={canvas}
    data-testid="sim-canvas"
    aria-label={canvasLabel}
    onpointerdown={interactive ? onPointerDown : undefined}
    onpointermove={interactive ? onPointerMove : undefined}
    onpointerup={interactive ? onPointerUp : undefined}
    onpointercancel={interactive ? onPointerCancel : undefined}
  ></canvas>
  {#if interactive}
    <canvas bind:this={overlay} class="overlay" aria-hidden="true"></canvas>
  {/if}
  <!-- Sim-time readout (UI redesign T8): pure DOM text over the frame's
       top-left corner, reading the existing simStore.t rune — the render
       loop is untouched, Svelte just patches this text node per frame.
       Landing variant: never mounted (the backdrop carries no readouts). -->
  {#if interactive}
    <div class="t-label" data-testid="t-label" aria-hidden="true">
      |ψ|² · t = {simStore.t.toFixed(1)}
    </div>
  {/if}
  {#if legendVisible}
    <!-- Spec 7.1: the M1 review's "user mistook the orange wall for a UI
         element" — the chips name the overlay colors and the max|V| scale
         anchors them. Pointer-transparent (never a pointer target),
         bottom-left away from the top-center toast and the below-canvas
         playback bar. -->
    <div class="v-legend" data-testid="v-legend">
      <span class="row">
        <span class="chip" style:background={V_LEGEND_HEX.barrier}></span>
        {legend.barrier}
      </span>
      <span class="row">
        <span class="chip" style:background={V_LEGEND_HEX.well}></span>
        {legend.well}
      </span>
      <span class="v0">{legend.v0}</span>
    </div>
  {/if}
  {#if colVariant !== 'none'}
    <!-- Field colormap legend: names what the canvas colors mean, in the
         V legend's chip grammar at the stage's bottom-right. Captions say
         the plain word (xác suất / probability — user ruling 2026-10-02,
         not the |ψ|² symbol); density and momentum share the inferno ramp
         with endpoint words (the scale is relative — auto-exposure
         normalizes each frame, so words, not numbers); the phase variant
         labels the hue wheel's branch-cut ends (both read red at −π/+π)
         and keeps the brightness = probability reading. Strip gradients
         come from the shader's own constants. -->
    <div class="col-legend" data-testid="col-legend">
      {#if colVariant === 'phase'}
        <span class="row">
          <span class="mono">−π</span>
          <span class="strip" data-testid="col-strip" style:background={PHASE_GRADIENT_CSS}></span>
          <span class="mono">+π</span>
        </span>
        <span class="note">{colLabels.phaseNote}</span>
      {:else}
        <span class="cap">{colVariant === 'momentum' ? colLabels.momentumCaption : colLabels.densityCaption}</span>
        <span class="row">
          <span>{colLabels.low}</span>
          <span class="strip" data-testid="col-strip" style:background={INFERNO_GRADIENT_CSS}></span>
          <span>{colLabels.high}</span>
        </span>
      {/if}
    </div>
  {/if}
  {#if toast !== undefined}
    <div class="toast" data-testid="measure-toast" role="status">{toast}</div>
  {/if}
</div>

<style>
  /* Landing variant (UI redesign T9): the stage becomes the theater's
     full-bleed backdrop — it fills its (non-square) parent, sheds the
     app.css square sizing/margins and the canvas chrome, and touch drags
     fall back to the browser default (the backdrop is inert, so there is
     nothing to paint). The renderer's fullscreen quad simply stretches over
     the letterbox — decorative by ruling, the sim view keeps the isotropic
     square stage. */
  .stage.landing {
    margin: 0;
    width: 100%;
    height: 100%;
    aspect-ratio: auto;
  }

  .stage.landing canvas {
    border-radius: 0;
    touch-action: auto;
  }

  /* Sim-time label (UI redesign T8, mockup .ws-tlabel): mono micro-copy at
     the stage's top-left, accent-tinted. Never a pointer target, hidden
     from AT (the readouts own the accessible numbers). */
  .t-label {
    position: absolute;
    top: 0.55rem;
    left: 0.6rem;
    font-family: 'JetBrains Mono', ui-monospace, Consolas, monospace;
    font-size: 9.5px;
    letter-spacing: 0.14em;
    color: var(--accent);
    pointer-events: none;
  }

  /* Outcome toast: transient, non-interactive, top-center of the stage. */
  .toast {
    position: absolute;
    top: 0.75rem;
    left: 50%;
    transform: translateX(-50%);
    padding: 0.3rem 0.8rem;
    border-radius: 0.5rem;
    background: rgba(0, 0, 0, 0.78);
    color: #fff;
    font-size: 0.9rem;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    white-space: nowrap;
    pointer-events: none;
  }

  /* V-overlay legend (Task 18): dark translucent chip, bottom-left of the
     stage (the toast owns top-center, the perf HUD the viewport's top-right,
     the playback bar sits below the canvas). Never a pointer target. */
  .v-legend {
    position: absolute;
    bottom: 0.6rem;
    left: 0.6rem;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.15rem;
    padding: 0.4rem 0.6rem;
    border-radius: 0.5rem;
    background: rgba(0, 0, 0, 0.72);
    border: 1px solid rgba(255, 255, 255, 0.18);
    color: #fff;
    font-size: 0.75rem;
    line-height: 1.35;
    text-align: left;
    pointer-events: none;
  }

  .v-legend .row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .v-legend .chip {
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 0.2rem;
    flex: none;
  }

  .v-legend .v0 {
    margin-top: 0.15rem;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    opacity: 0.9;
  }

  /* Field colormap legend: the V legend's chip grammar mirrored at the
     stage's bottom-right (V legend owns bottom-left, toast top-center,
     t-label top-left — the four corners never collide). Same dark
     translucent surface + pointer-transparent rule. */
  .col-legend {
    position: absolute;
    bottom: 0.6rem;
    right: 0.6rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    padding: 0.4rem 0.6rem;
    border-radius: 0.5rem;
    background: rgba(0, 0, 0, 0.72);
    border: 1px solid rgba(255, 255, 255, 0.18);
    color: #fff;
    font-size: 0.75rem;
    line-height: 1.35;
    pointer-events: none;
  }

  .col-legend .row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .col-legend .mono {
    font-family: 'JetBrains Mono', ui-monospace, Consolas, monospace;
    font-size: 0.72rem;
  }

  .col-legend .cap {
    font-size: 0.7rem;
    opacity: 0.9;
  }

  .col-legend .note {
    font-size: 0.7rem;
    opacity: 0.85;
  }

  /* The gradient strip (colors come inline from the shader constants).
     The faint border keeps the ramp's black end visible over the chip's
     own dark surface. */
  .col-legend .strip {
    width: 84px;
    height: 8px;
    border-radius: 2px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    flex: none;
  }
</style>
