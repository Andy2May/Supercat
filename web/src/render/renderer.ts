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
  private readonly canvas: HTMLCanvasElement
  private readonly gl: WebGL2RenderingContext
  private readonly program: WebGLProgram
  private readonly vao: WebGLVertexArrayObject
  private readonly vertexBuffer: WebGLBuffer
  private readonly fieldTexture: WebGLTexture
  private readonly potentialTexture: WebGLTexture
  private readonly uPotentialMax: WebGLUniformLocation | null

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: false })
    if (gl === null) {
      throw new Error('NO_WEBGL2')
    }
    this.canvas = canvas
    this.gl = gl

    this.program = this.buildProgram()
    this.uPotentialMax = gl.getUniformLocation(this.program, 'u_potentialMax')

    gl.useProgram(this.program)
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_field'), 0)
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_potential'), 1)

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
  }

  /** Replaces the field texture: (rho, phase) interleaved, row-major j*nx+i. */
  uploadField(data: Float32Array, nx: number, ny: number): void {
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.fieldTexture)
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RG32F,
      nx,
      ny,
      0,
      this.gl.RG,
      this.gl.FLOAT,
      data,
    )
  }

  /** Replaces the potential texture: one f32 per grid point, row-major. */
  uploadPotential(data: Float32Array, nx: number, ny: number): void {
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.potentialTexture)
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.R32F,
      nx,
      ny,
      0,
      this.gl.RED,
      this.gl.FLOAT,
      data,
    )
  }

  /**
   * Draws one frame. `potentialMax` scales the V overlay (the caller tracks
   * the potential's max magnitude); it must be > 0 whenever the potential is
   * non-zero. A zero value (all-zero V) is safe: the shader clamps its
   * divisor away from zero.
   */
  draw(potentialMax: number): void {
    const gl = this.gl
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    gl.useProgram(this.program)
    gl.bindVertexArray(this.vao)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.fieldTexture)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.potentialTexture)
    gl.uniform1f(this.uPotentialMax, potentialMax)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.bindVertexArray(null)

    debugState.frames++
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
