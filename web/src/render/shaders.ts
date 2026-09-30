/**
 * GLSL ES 3.00 sources for the fullscreen-quad heatmap pass.
 *
 * Y orientation (ledger ruling "Y no-flip"): grid row j = 0 sits at
 * y = -extent/2 and must display at the canvas TOP (screen-down = +y).
 * texImage2D stores the first row of the uploaded Float32Array at texture
 * coordinate t = 0, so the quad wires t = 0 to the top scanline (clip y = +1)
 * via `0.5 - a_pos.y * 0.5`. Nothing flips data anywhere: no
 * UNPACK_FLIP_Y_WEBGL, no row reordering.
 */

export const VERTEX_SHADER_SRC = `#version 300 es
layout(location = 0) in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

export const FRAGMENT_SHADER_SRC = `#version 300 es
precision highp float;

// Field: RG32F, interleaved (rho, phase) per grid point. The phase channel
// is unsampled in M1 — hue-phase visualisation is M2 work.
uniform sampler2D u_field;
// Potential: R32F, one value per grid point.
uniform sampler2D u_potential;
uniform float u_potentialMax;
// Smoothed peak |psi|^2 of the current frame — the auto-exposure reference.
uniform float u_maxDensity;
// Grid size (nx, ny) in texels — the step for potential neighbor sampling.
uniform vec2 u_gridSize;
// 1 = draw the potential overlay, 0 = skip it entirely (alpha contribution
// zero). The momentum-space view (Task 12) turns the overlay off: V(x) has
// no meaning on the k-space grid.
uniform int u_showV;

in vec2 v_uv;
out vec4 outColor;

void main() {
  float rho = texture(u_field, v_uv).x;

  // Auto-exposure tone map: normalize by the frame's (smoothed) peak so
  // spread-out late stages and dim diffraction fringes keep full contrast
  // instead of sinking into near-black under a fixed gain. The max() guard
  // keeps a zero peak (no frames yet / zero state) from dividing by zero;
  // the 0.45 gamma lifts the low-density tail.
  float b = pow(clamp(rho / max(u_maxDensity, 1e-6), 0.0, 1.0), 0.45);

  // 4-stop inferno-like colormap (black -> dark purple -> magenta-red ->
  // pale yellow): perceptually stepped and physics-standard, far stronger
  // contrast than the original black -> blue -> white ramp.
  vec3 c1 = vec3(0.26, 0.05, 0.43);
  vec3 c2 = vec3(0.73, 0.21, 0.30);
  vec3 c3 = vec3(0.99, 0.91, 0.63);
  vec3 color;
  if (b < 0.3333) {
    color = mix(vec3(0.0), c1, b * 3.0);
  } else if (b < 0.6667) {
    color = mix(c1, c2, b * 3.0 - 1.0);
  } else {
    color = mix(c2, c3, b * 3.0 - 2.0);
  }

  if (u_showV == 1) {
    // Potential overlay, two layers:
    //   1. Fill — opacity rises with the square-ish curve a = w * (0.4 +
    //      0.45*w), exactly 0 where V = 0, ~0.85 at the reference level. The
    //      reference is HALF the potential max so mid-height drawn walls stay
    //      visible next to the default scene's tall slit wall. Positive V
    //      (barriers) reads warm orange; negative V (wells) reads teal.
    //   2. Edge — every sharp jump in V between neighboring grid cells draws
    //      a bright outline, so thin hand-drawn walls (a few pixels) pop as
    //      crisp shapes over any background, regardless of fill strength.
    // The max() guards keep an all-zero potential from evaluating x/0 = NaN.
    float v = texture(u_potential, v_uv).x;
    float vScale = max(0.5 * u_potentialMax, 1e-6);
    if (v > 0.0) {
      float w = clamp(v / vScale, 0.0, 1.0);
      color = mix(color, vec3(0.95, 0.32, 0.08), w * (0.40 + 0.45 * w));
    } else {
      float w = clamp(-v / vScale, 0.0, 1.0);
      color = mix(color, vec3(0.12, 0.62, 0.72), w * (0.40 + 0.45 * w));
    }
    vec2 texel = 1.0 / max(u_gridSize, vec2(1.0));
    float vL = texture(u_potential, v_uv - vec2(texel.x, 0.0)).x;
    float vR = texture(u_potential, v_uv + vec2(texel.x, 0.0)).x;
    float vU = texture(u_potential, v_uv + vec2(0.0, texel.y)).x;
    float vD = texture(u_potential, v_uv - vec2(0.0, texel.y)).x;
    float dv = max(max(abs(v - vL), abs(v - vR)), max(abs(v - vU), abs(v - vD)));
    float edge = clamp(dv / vScale, 0.0, 1.0);
    // Edge hue follows the SIGN of the shape: warm amber outlines barriers
    // (V > 0), cool cyan outlines wells (V < 0) — the neighborhood sum picks
    // the dominant sign so the outer rim of a well stays cyan, not amber.
    vec3 edgeColor = (v + vL + vR + vU + vD) > 0.0
      ? vec3(1.0, 0.62, 0.15)
      : vec3(0.35, 0.90, 1.0);
    color = mix(color, edgeColor, edge * 0.9);
  }

  outColor = vec4(color, 1.0);
}
`
