<script lang="ts">
  import { t } from '../i18n/index.js'
  import { startSimLoop } from '../render/simLoop.js'
  import { DEFAULTS, screenToGrid } from '../sim/simParams.js'
  import { simStore } from '../sim/simStore.svelte.js'
  import { toolState } from '../sim/toolStore.svelte.js'
  import { strokeToOp, strokeToOps, type Pt } from '../sim/tools.js'

  let {
    /** Fires once when WebGL2 initialization fails (App shows the dead end). */
    onRenderFailed = () => {},
  }: { onRenderFailed?: () => void } = $props()

  let canvas = $state<HTMLCanvasElement | undefined>(undefined)
  let overlay = $state<HTMLCanvasElement | undefined>(undefined)

  // The render loop lives in a TS module; the component only mounts it onto
  // the WebGL canvas and tears it down on unmount.
  $effect(() => {
    const element = canvas
    if (element === undefined) return
    try {
      return startSimLoop(element, simStore)
    } catch {
      onRenderFailed()
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
  let flushRaf = 0

  // Cancel any pending flush when the component goes away mid-drag.
  $effect(() => {
    return () => {
      if (flushRaf !== 0) cancelAnimationFrame(flushRaf)
    }
  })

  function isStreamTool(tool: string): tool is 'brush' | 'eraser' {
    return tool === 'brush' || tool === 'eraser'
  }

  function isSegmentTool(tool: string): tool is 'barrier' | 'well' {
    return tool === 'barrier' || tool === 'well'
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
    }
    // 'packet' has no pointer behavior until Task 16.
  }

  function onPointerMove(event: PointerEvent): void {
    if (!dragging) return
    const point = toGrid(event)
    if (isStreamTool(toolState.tool)) {
      pending.push(point)
    } else if (previewFrom !== undefined) {
      previewTo = point
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
    }
  }

  function onPointerCancel(): void {
    if (!dragging) return
    stopDrag()
    pending = []
    last = undefined
    previewFrom = undefined
    previewTo = undefined
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
    if (
      ctx === undefined ||
      canvas === undefined ||
      previewFrom === undefined ||
      previewTo === undefined
    ) {
      return
    }
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

  function clearPreview(): void {
    if (canvas === undefined || overlay === undefined) return
    overlayContext()?.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)
  }
</script>

<div class="stage">
  <canvas
    bind:this={canvas}
    data-testid="sim-canvas"
    aria-label={t('app.canvasLabel')}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerCancel}
  ></canvas>
  <canvas bind:this={overlay} class="overlay" aria-hidden="true"></canvas>
</div>
