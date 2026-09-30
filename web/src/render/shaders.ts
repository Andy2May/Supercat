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

in vec2 v_uv;
out vec4 outColor;

void main() {
  float rho = texture(u_field, v_uv).x;

  // Pinned tone map: densities up to 1/8 saturate; the 0.45 gamma lifts the tail.
  float b = pow(clamp(rho * 8.0, 0.0, 1.0), 0.45);

  // 3-stop colormap black -> blue -> white, linear in b over [0, 0.5, 1].
  vec3 blue = vec3(0.08, 0.22, 0.90);
  vec3 color = b < 0.5
    ? mix(vec3(0.0), blue, b * 2.0)
    : mix(blue, vec3(1.0), b * 2.0 - 1.0);

  // Potential overlay: positive -> dark red tint, negative -> faint gray tint.
  float v = texture(u_potential, v_uv).x;
  if (v > 0.0) {
    color = mix(color, vec3(0.55, 0.08, 0.08), 0.35 * clamp(v / u_potentialMax, 0.0, 1.0));
  } else {
    color = mix(color, vec3(0.5), 0.25 * clamp(-v / u_potentialMax, 0.0, 1.0));
  }

  outColor = vec4(color, 1.0);
}
`
