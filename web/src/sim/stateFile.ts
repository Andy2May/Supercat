/**
 * JSON state-file codec (Task 17) — PURE, node-testable, no imports. The
 * worker's `serialize_state` / `deserialize_state` speak Float32Arrays; a
 * file on disk speaks text, so this module is the single b64 + validation
 * boundary between them.
 *
 * Contract:
 *   - `encodeState` stamps `STATE_VERSION` and b64-encodes both arrays
 *     (chunked `btoa` over a Uint8 view — `String.fromCharCode` chokes on
 *     argument counts past ~32k, hence the 0x8000 chunks). It REFUSES
 *     non-finite input: a NaN that round-tripped silently would poison the
 *     propagator's 1e-10 norm guard the moment the file loaded.
 *   - `decodeState` accepts `unknown` (anything `JSON.parse` can return)
 *     and throws `StateFileError` — never a bare TypeError — for every
 *     rejection: wrong version (`'version'`), array lengths that disagree
 *     with the file's own nx/ny (`'shape'`), and anything structurally
 *     wrong (`'corrupt'`: non-object, missing/non-finite fields, non-b64
 *     payload, byte length not a multiple of 4, NaN/±Infinity inside the
 *     decoded samples, or an ALL-ZERO ψ — Σ|ψ_k|² = 0. A zero-norm
 *     wavefunction passes wasm's deserialize (its normalize is a no-op at
 *     norm 0), but the very next advance trips the propagator's norm
 *     guard — a FATAL — and the loaded snapshot is the same zeros, so
 *     "Reset & run again" would re-fatal in a loop. The codec rejects it
 *     up front: renormalization is impossible, so the file is unusable).
 *
 * Everything round-trips BIT-EXACTLY: the bytes of an f32 array never pass
 * through a number→text conversion, only through base64, so negative
 * floats, subnormals, and ±0 all survive (the wasm side renormalizes on
 * load to absorb the serialize-side f32 quantization, not this codec).
 */

/** File format version. Bump ONLY on a breaking layout change — the
 * decoder rejects every other value (`reason: 'version'`). */
export const STATE_VERSION = 1

/** The eight scalar fields a saved state carries, mirroring wasm's
 * `serialize_state()` one-to-one. */
export interface StateScalars {
  nx: number
  ny: number
  extentX: number
  extentY: number
  dt: number
  m: number
  hbar: number
  t: number
}

/** What `encodeState` takes / `decodeState` returns: scalars plus the two
 * raw arrays (psi interleaved `(re, im)` pairs, row-major x-fastest). */
export interface RawState extends StateScalars {
  potential: Float32Array
  psi: Float32Array
}

/** The JSON-file shape: same scalars, arrays as base64 strings. */
export interface SavedState extends StateScalars {
  version: number
  potential: string
  psi: string
}

/** Why a state file was rejected — drives the i18n'd load-error copy. */
export type StateFileReason = 'version' | 'shape' | 'corrupt'

export class StateFileError extends Error {
  readonly reason: StateFileReason

  constructor(reason: StateFileReason, message: string) {
    super(message)
    this.name = 'StateFileError'
    this.reason = reason
  }
}

/** `String.fromCharCode(...bytes)` blows the argument limit around 32k —
 * chunk the binary string at 0x8000 (the classic btoa workaround). */
const B64_CHUNK = 0x8000

function bytesToB64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += B64_CHUNK) {
    const end = Math.min(i + B64_CHUNK, bytes.length)
    binary += String.fromCharCode(...bytes.subarray(i, end))
  }
  return btoa(binary)
}

function b64ToBytes(text: string): Uint8Array {
  let binary: string
  try {
    binary = atob(text)
  } catch {
    throw new StateFileError('corrupt', 'state file: invalid base64 payload')
  }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** f32 view over a decoded byte payload; the byte length must be a whole
 * number of f32s or the file is structurally broken. */
function bytesToF32(bytes: Uint8Array, field: string): Float32Array {
  if (bytes.length % 4 !== 0) {
    throw new StateFileError('corrupt', `state file: ${field} payload is not whole f32s`)
  }
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4)
}

const SCALAR_FIELDS = [
  'nx',
  'ny',
  'extentX',
  'extentY',
  'dt',
  'm',
  'hbar',
  't',
] as const

/** Validates that all eight scalar fields are finite numbers and returns
 * them typed; throws `corrupt` naming the first bad field. (encode uses it
 * as a guard on its own input, decode on the parsed JSON object.) */
function checkedScalars(source: Record<string, unknown>): StateScalars {
  const scalars: Record<(typeof SCALAR_FIELDS)[number], unknown> = {
    nx: source.nx,
    ny: source.ny,
    extentX: source.extentX,
    extentY: source.extentY,
    dt: source.dt,
    m: source.m,
    hbar: source.hbar,
    t: source.t,
  }
  for (const field of SCALAR_FIELDS) {
    const value = scalars[field]
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new StateFileError('corrupt', `state file: field "${field}" is missing or non-finite`)
    }
  }
  return scalars as StateScalars
}

/** A NaN or ±Infinity hiding in an array sample — caught on BOTH sides of
 * the codec (encode refuses to write one, decode refuses to read one). */
function assertFiniteSamples(values: Float32Array, field: string): void {
  for (let i = 0; i < values.length; i++) {
    if (!Number.isFinite(values[i])) {
      throw new StateFileError('corrupt', `state file: ${field} holds a non-finite sample`)
    }
  }
}

export function encodeState(raw: RawState): SavedState {
  const scalars = checkedScalars({ ...raw })
  assertFiniteSamples(raw.potential, 'potential')
  assertFiniteSamples(raw.psi, 'psi')
  return {
    version: STATE_VERSION,
    ...scalars,
    potential: bytesToB64(new Uint8Array(raw.potential.buffer, raw.potential.byteOffset, raw.potential.byteLength)),
    psi: bytesToB64(new Uint8Array(raw.psi.buffer, raw.psi.byteOffset, raw.psi.byteLength)),
  }
}

export function decodeState(json: unknown): RawState {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new StateFileError('corrupt', 'state file: not a JSON object')
  }
  const record = json as Record<string, unknown>
  if (record.version !== STATE_VERSION) {
    throw new StateFileError(
      'version',
      `state file: unsupported version ${String(record.version)} (expected ${STATE_VERSION})`,
    )
  }
  const scalars = checkedScalars(record)

  const potentialText = record.potential
  const psiText = record.psi
  if (typeof potentialText !== 'string' || typeof psiText !== 'string') {
    throw new StateFileError('corrupt', 'state file: potential/psi are not base64 strings')
  }
  const potential = bytesToF32(b64ToBytes(potentialText), 'potential')
  const psi = bytesToF32(b64ToBytes(psiText), 'psi')
  assertFiniteSamples(potential, 'potential')
  assertFiniteSamples(psi, 'psi')

  // Lengths must agree with the file's OWN grid before anything is handed
  // to wasm (which would reject them too, but with a generic dimension
  // error — here the caller gets the reason typed and i18n-able).
  if (potential.length !== scalars.nx * scalars.ny || psi.length !== 2 * scalars.nx * scalars.ny) {
    throw new StateFileError(
      'shape',
      `state file: dimension mismatch — ${potential.length}/${psi.length} samples for ` +
        `${scalars.nx}x${scalars.ny} (want nx*ny / 2*nx*ny)`,
    )
  }

  // Zero-norm ψ guard (fix round 1): Σ|ψ_k|² over the decoded f32 samples,
  // accumulated in f64 so even a lone subnormal stays non-zero. Exactly 0
  // iff every sample is ±0 — see the module doc for why that must never
  // reach wasm (renormalize is a no-op at 0, the next advance fatals, and
  // the all-zeros snapshot makes "Reset & run again" re-fatal forever).
  let normSq = 0
  for (let i = 0; i < psi.length; i++) {
    const v = psi[i]
    normSq += v * v
  }
  if (normSq === 0) {
    throw new StateFileError(
      'corrupt',
      'state file: psi has zero norm — renormalization is impossible',
    )
  }

  return { ...scalars, potential, psi }
}
