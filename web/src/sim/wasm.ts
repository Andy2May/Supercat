/**
 * Loader for the wasm-pack output (gitignored; produced by
 * `npm run build:wasm` — wasm-pack 0.13.1, `--target web`). Called from the
 * physics worker, never the main thread, so the ~2 MB module download,
 * compile, and instantiate all stay off the UI thread.
 */

/** The wasm-pack ES module: `Simulation2D` plus the default `init()`. */
export type WasmModule = typeof import('../wasm/psiforge-wasm/psiforge_wasm.js')

let pending: Promise<WasmModule> | undefined

/**
 * Dynamically imports the bindings and instantiates the wasm binary once per
 * agent (the module-level `init()` guard in the glue makes double init a
 * no-op anyway; caching here also collapses concurrent callers onto one
 * promise). A failed load clears the cache so a retry is possible.
 */
export async function loadWasm(): Promise<WasmModule> {
  pending ??= (async () => {
    const mod = await import('../wasm/psiforge-wasm/psiforge_wasm.js')
    await mod.default()
    return mod
  })().catch((error: unknown) => {
    pending = undefined
    throw error
  })
  return pending
}
