import { debugState } from './debugHook.js'
import { FRAGMENT_SHADER_SRC, VERTEX_SHADER_SRC } from './shaders.js'

/**
 * WebGL2 |psi|^2 heatmap renderer. One fullscreen quad; the fragment shader
 * samples two NEAREST-filtered float textures — the field (RG32F, interleaved
 * (rho, phase) pairs, the exact layout wasm's `density_phase()` emits) and
 * the potential (R32F). RG32F/R32F are core WebGL2 internal formats and
 * NEAREST filtering needs no extension (LINEAR float filtering would need
 * OES_texture_float_linear).
 *
 * Y orientation (ledger "Y no-flip"): row j = 0 (y = -extent/2) displays at
 * the canvas top; see shaders.ts for how the quad wires it.
 */
export class HeatmapRenderer {
  // Every GL handle below is (re)created by setup() — non-readonly because
  // rebuild() replaces them all after a context restore, and `!` because
  // strictPropertyInitialization cannot see the constructor's setup() call.
  private canvas: HTMLCanvasElement
  private gl: WebGL2RenderingContext
  private program!: WebGLProgram
  private vao!: WebGLVertexArrayObject
  private vertexBuffer!: WebGLBuffer
  private fieldTexture!: WebGLTexture
  private potentialTexture!: WebGLTexture
  /**
   * Pre-measurement field snapshot for the collapse crossfade (Task 14).
   * Holds whatever `fieldTexture` held when `beginFade()` last ran — the
   * position densityPhase or the momentum scratch, i.e. exactly the last
   * DISPLAYED state in whichever space the view is in. Swapped in as a
   * texture-unit-2 sibling of the field; the shader mixes the two under
   * `u_fade` with one shared exposure.
   */
  private fadeTexture!: WebGLTexture
  private uPotentialMax!: WebGLUniformLocation | null
  private uMaxDensity!: WebGLUniformLocation | null
  private uGridSize!: WebGLUniformLocation | null
  private uShowV!: WebGLUniformLocation | null
  private uColorMode!: WebGLUniformLocation | null
  private uFade!: WebGLUniformLocation | null
  /**
   * Whether the potential overlay draws (u_showV, Task 12). Kept as a field
   * so a context-loss rebuild() re-applies the CURRENT setting instead of
   * silently resetting the overlay to visible mid-momentum-view.
   */
  private showV = true
  /**
   * Colormap select (u_colorMode, Task 13): 0 = inferno density, 1 = HSV
   * phase. Kept as a field for the same reason as `showV`: a context-loss
   * rebuild() re-applies the current mode instead of flashing back to the
   * inferno default.
   */
  private colorMode: 0 | 1 = 0
  /** Grid dims (nx, ny) of the last upload — feeds the shader's texel step. */
  private gridW = 1
  private gridH = 1
  /**
   * Allocated size of each texture. Same-size uploads take the in-place
   * texSubImage2D fast path (no GPU reallocation per frame); a mismatch —
   * the 1x1 boot stubs, a context restore, or a grid change — falls back to
   * a full texImage2D and records the new dims. setup() resets both to
   * {0,0}, which is what forces the full path after rebuild().
   */
  private fieldAllocated = { w: 0, h: 0 }
  private potentialAllocated = { w: 0, h: 0 }
  /** Allocation size of the fade texture (see beginFade for the swap). */
  private fadeAllocated = { w: 0, h: 0 }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.gl = HeatmapRenderer.acquireGl(canvas)
    this.setup()
  }

  /**
   * Context-loss recovery (no automated test — hand-verified via
   * about:gpu / WEBGL_lose_context): after `webglcontextrestored` every
   * resource above is gone. Re-acquires the (new) context for the canvas
   * and rebuilds program, quad and textures from scratch — exactly what
   * the constructor built. Textures come back as 1x1 stubs and setup()
   * resets the allocation tracking to {0,0}, so the render loop's next
   * uploads (field with the next frame, potential from its cached copy)
   * take the full texImage2D path.
   */
  rebuild(canvas: HTMLCanvasElement): void {
    this.canvas = canvas
    this.gl = HeatmapRenderer.acquireGl(canvas)
    this.setup()
  }

  private static acquireGl(canvas: HTMLCanvasElement): WebGL2RenderingContext {
    const gl = canvas.getContext('webgl2', { antialias: false })
    if (gl === null) {
      throw new Error('NO_WEBGL2')
    }
    return gl
  }

  /** Creates every GL resource on the current context (boot + rebuild). */
  private setup(): void {
    const gl = this.gl

    this.program = this.buildProgram()
    this.uPotentialMax = gl.getUniformLocation(this.program, 'u_potentialMax')
    this.uMaxDensity = gl.getUniformLocation(this.program, 'u_maxDensity')
    this.uGridSize = gl.getUniformLocation(this.program, 'u_gridSize')
    this.uShowV = gl.getUniformLocation(this.program, 'u_showV')
    this.uColorMode = gl.getUniformLocation(this.program, 'u_colorMode')
    this.uFade = gl.getUniformLocation(this.program, 'u_fade')

    gl.useProgram(this.program)
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_field'), 0)
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_potential'), 1)
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_fadeTex'), 2)
    // No fade is running on a fresh context: the mix collapses to the plain
    // field sample (a rebuild after context loss also lands here — see
    // beginFade for why a lost fade is simply dropped).
    gl.uniform1f(this.uFade, 0)
    // Re-applies the CURRENT overlay setting: a context-loss rebuild must
    // not resurrect V over a momentum view.
    gl.uniform1i(this.uShowV, this.showV ? 1 : 0)
    // Same for the colormap (Task 13): a rebuild must not flash phase mode
    // back to inferno until the next setColorMode call.
    gl.uniform1i(this.uColorMode, this.colorMode)

    // Fullscreen quad as a triangle strip covering clip space; the shader's
    // v_uv mapping (not the vertex order) decides which edge is "up".
    this.vao = gl.createVertexArray()!
    gl.bindVertexArray(this.vao)
    this.vertexBuffer = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    )
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.bindVertexArray(null)

    this.fieldTexture = this.createNearestTexture(gl.RG32F, gl.RG)
    this.potentialTexture = this.createNearestTexture(gl.R32F, gl.RED)
    this.fadeTexture = this.createNearestTexture(gl.RG32F, gl.RG)

    // The 1x1 stubs above match no real upload: the first upload of each
    // texture after boot or a context restore must fully allocate.
    this.fieldAllocated = { w: 0, h: 0 }
    this.potentialAllocated = { w: 0, h: 0 }
    this.fadeAllocated = { w: 0, h: 0 }
  }

  /** Replaces the field texture: (rho, phase) interleaved, row-major j*nx+i. */
  uploadField(data: Float32Array, nx: number, ny: number): void {
    this.gridW = nx
    this.gridH = ny
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, this.fieldTexture)
    if (this.fieldAllocated.w === nx && this.fieldAllocated.h === ny) {
      // Steady state: same-size upload, refresh in place — no per-frame GPU
      // reallocation (the Task-6 perf fix; texImage2D per frame re-allocated
      // the storage and re-specified the texture every time).
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, nx, ny, gl.RG, gl.FLOAT, data)
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, nx, ny, 0, gl.RG, gl.FLOAT, data)
      this.fieldAllocated = { w: nx, h: ny }
    }
  }

  /** Replaces the potential texture: one f32 per grid point, row-major. */
  uploadPotential(data: Float32Array, nx: number, ny: number): void {
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, this.potentialTexture)
    if (this.potentialAllocated.w === nx && this.potentialAllocated.h === ny) {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, nx, ny, gl.RED, gl.FLOAT, data)
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, nx, ny, 0, gl.RED, gl.FLOAT, data)
      this.potentialAllocated = { w: nx, h: ny }
    }
  }

  /**
   * Arms the collapse crossfade (Task 14): captures the CURRENT field
   * texture — the last displayed state, position density or momentum
   * scratch — as the "old" side of the fade, so the next `uploadField`
   * (the collapsed state) can dissolve in over it via `setFade`.
   *
   * Capturing is a pure JS texture-HANDLE swap (fieldTexture <->
   * fadeTexture, allocation records with them): zero GL work, no
   * float-rendering extension, no dependency on the canvas backbuffer.
   * The task sketch suggested `gl.copyTexImage2D`, but that reads the
   * current READ framebuffer — the canvas backbuffer is post-compositing
   * garbage by the time a worker message handler runs (preserveDrawingBuffer
   * is false), and copying into RG32F from an RGBA8 canvas is illegal in
   * WebGL2 anyway; an FBO round-trip would additionally require
   * EXT_color_buffer_float for completeness. The swap achieves the exact
   * same result — the old texture keeps its pixels — deterministically.
   *
   * Returns false when there is nothing to fade from (no field uploaded
   * yet — the very first frames, or right after a context-loss rebuild):
   * callers must then not start a fade. Call BEFORE uploading the new
   * field, or the "old" state is already gone.
   */
  beginFade(): boolean {
    if (this.fieldAllocated.w === 0) return false
    const oldField = this.fieldTexture
    this.fieldTexture = this.fadeTexture
    this.fadeTexture = oldField
    const oldAllocated = this.fieldAllocated
    this.fieldAllocated = this.fadeAllocated
    this.fadeAllocated = oldAllocated
    return true
  }

  /**
   * Drives the crossfade blend (u_fade): 1 = pre-measurement state,
   * 0 = current field. The caller ramps 1 -> 0 over the fade window via
   * rAF, drawing between frames; one uniform1f per call. Setting 0 outside
   * a fade is the neutral state (the shader's mix collapses to the field
   * sample).
   */
  setFade(fade: number): void {
    // Defensive bind (see setShowV): uniform1f writes the CURRENTLY-bound
    // program's uniform.
    this.gl.useProgram(this.program)
    this.gl.uniform1f(this.uFade, fade)
  }

  /**
   * Toggles the potential overlay (u_showV, Task 12). The momentum view
   * hides V: V(x) lives in position space and would be meaningless (and
   * visually confusing) painted over the k-space grid. Cheap and idempotent
   * — one uniform1i on an already-linked program.
   */
  setShowV(on: boolean): void {
    this.showV = on
    // Defensive bind: uniform1i writes the CURRENTLY-bound program's
    // uniform. Today a single program exists and setup() binds it forever,
    // so this useProgram is redundant — but it keeps the call correct the
    // day a second program appears.
    this.gl.useProgram(this.program)
    this.gl.uniform1i(this.uShowV, on ? 1 : 0)
  }

  /**
   * Selects the colormap (u_colorMode, Task 13): 0 = inferno density (the
   * M1 default), 1 = HSV phase. Pure render state — no worker round-trip.
   * The render loop recomputes the effective mode every frame (phase only
   * exists in the position view), so this is cheap and idempotent.
   */
  setColorMode(mode: 0 | 1): void {
    this.colorMode = mode
    // Defensive bind (see setShowV): uniform1i writes the CURRENTLY-bound
    // program's uniform.
    this.gl.useProgram(this.program)
    this.gl.uniform1i(this.uColorMode, mode)
  }

  /**
   * Draws one frame. `potentialMax` scales the V overlay (the caller tracks
   * the potential's max magnitude; a zero value for all-zero V is safe — the
   * shader clamps its divisor away from zero). `maxDensity` is the
   * auto-exposure reference — the caller passes a smoothed per-frame peak of
   * |psi|^2; it must be > 0 whenever the field is non-zero, and zero is safe.
   */
  draw(potentialMax: number, maxDensity: number): void {
    const gl = this.gl
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    gl.useProgram(this.program)
    gl.bindVertexArray(this.vao)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.fieldTexture)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.potentialTexture)
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, this.fadeTexture)
    gl.uniform1f(this.uPotentialMax, potentialMax)
    gl.uniform1f(this.uMaxDensity, maxDensity)
    gl.uniform2f(this.uGridSize, this.gridW, this.gridH)
    gl.uniform1i(this.uColorMode, this.colorMode)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.bindVertexArray(null)

    debugState.frames++
    if (debugState.rowBrightness.size > 0) {
      this.probeRows(debugState.rowBrightness)
    }
  }

  /**
   * Debug row probe (e2e y-orientation trap): mean brightness [0, 1] of the
   * registered screen rows, read from the frame just drawn — readPixels is
   * only valid in-frame (the default framebuffer is cleared after
   * compositing), which is why callers read the cache instead. `yFrac`
   * counts from the TOP of the canvas, matching how tests specify drawn
   * strokes; readPixels counts y from the bottom, hence the 1 - yFrac flip
   * here (the one deliberate y remap — everything else shares screen y).
   * Only rows someone registered are read; empty in normal use.
   */
  private probeRows(rows: Map<number, number>): void {
    const gl = this.gl
    const width = gl.drawingBufferWidth
    const height = gl.drawingBufferHeight
    if (width === 0 || height === 0) return
    const pixels = new Uint8Array(width * 4)
    for (const yFrac of rows.keys()) {
      const y = Math.min(height - 1, Math.max(0, Math.round((1 - yFrac) * (height - 1))))
      gl.readPixels(0, y, width, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
      let sum = 0
      for (let i = 0; i < width; i++) {
        sum += (pixels[i * 4] + pixels[i * 4 + 1] + pixels[i * 4 + 2]) / 3
      }
      rows.set(yFrac, sum / width / 255)
    }
  }

  /** Sizes the drawing buffer to CSS dimensions scaled by devicePixelRatio. */
  resize(width: number, height: number): void {
    const dpr = globalThis.devicePixelRatio ?? 1
    const pixelWidth = Math.max(1, Math.round(width * dpr))
    const pixelHeight = Math.max(1, Math.round(height * dpr))
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth
      this.canvas.height = pixelHeight
    }
  }

  /** Frees all GPU resources; the renderer is unusable afterwards. */
  dispose(): void {
    const gl = this.gl
    gl.deleteTexture(this.fieldTexture)
    gl.deleteTexture(this.fadeTexture)
    gl.deleteTexture(this.potentialTexture)
    gl.deleteBuffer(this.vertexBuffer)
    gl.deleteVertexArray(this.vao)
    gl.deleteProgram(this.program)
  }

  private buildProgram(): WebGLProgram {
    const gl = this.gl
    const vertex = this.compileShader(gl.VERTEX_SHADER, VERTEX_SHADER_SRC)
    const fragment = this.compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SRC)
    const program = gl.createProgram()
    if (program === null) {
      throw new Error('NO_PROGRAM')
    }
    gl.attachShader(program, vertex)
    gl.attachShader(program, fragment)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program) ?? 'unknown'
      gl.deleteProgram(program)
      throw new Error(`PROGRAM_LINK_FAILED: ${info}`)
    }
    gl.deleteShader(vertex)
    gl.deleteShader(fragment)
    return program
  }

  private compileShader(type: number, source: string): WebGLShader {
    const gl = this.gl
    const shader = gl.createShader(type)
    if (shader === null) {
      throw new Error('NO_SHADER')
    }
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader) ?? 'unknown'
      gl.deleteShader(shader)
      throw new Error(`SHADER_COMPILE_FAILED: ${info}`)
    }
    return shader
  }

  private createNearestTexture(internalFormat: number, format: number): WebGLTexture {
    const gl = this.gl
    const texture = gl.createTexture()
    if (texture === null) {
      throw new Error('NO_TEXTURE')
    }
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    // 1x1 zero stub keeps the texture complete before the first real upload.
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      internalFormat,
      1,
      1,
      0,
      format,
      gl.FLOAT,
      new Float32Array(format === gl.RG ? [0, 0] : [0]),
    )
    return texture
  }
}
