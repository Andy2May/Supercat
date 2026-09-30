/**
 * Pure sparkline helpers (Task 11): the ring buffer behind the observables
 * history and the series -> normalized-polyline mapping the
 * ObservablesBar canvases consume. No DOM, no state — unit-tested in
 * isolation (tests/observablesBar.test.ts).
 */

/**
 * Appends `item` and drops the oldest entries past `cap` (FIFO ring). The
 * default cap matches the ObservablesBar history: 600 samples at ~15 obs
 * frames/s is ~40 s of visible trail — plenty for a sparkline, bounded for
 * memory. Mutates (and returns) `arr` so a `$state` proxy array notifies
 * on every push; callers own the array.
 */
export function ringPush<T>(arr: T[], item: T, cap = 600): T[] {
  arr.push(item)
  while (arr.length > cap) arr.shift()
  return arr
}

/**
 * Maps `values` onto normalized [0..1] polyline points: interleaved
 * (x, y) pairs (`[x0, y0, x1, y1, ...]`) with `x = i / (n - 1)` (0 for a
 * single point) and `y = clamp((v - lo) / (hi - lo))`. A degenerate range
 * (`lo === hi`, e.g. the first energy sample) centers every y at 0.5
 * instead of NaN-ing. The caller flips y when drawing (canvas y grows
 * downward).
 */
export function mapSeries(values: number[], lo: number, hi: number): Float32Array {
  const n = values.length
  const out = new Float32Array(n * 2)
  const span = hi - lo
  for (let i = 0; i < n; i++) {
    const raw = span > 0 ? (values[i] - lo) / span : 0.5
    out[2 * i] = n > 1 ? i / (n - 1) : 0
    out[2 * i + 1] = raw < 0 ? 0 : raw > 1 ? 1 : raw
  }
  return out
}
