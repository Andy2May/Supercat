/**
 * Browser-download plumbing shared by the PNG canvas export (Task 16) and
 * the JSON state export (Task 17). Both produce a local-time timestamped
 * `supercat[-suffix]-<YYYYMMDD-HHmmss>.<ext>` file — a user artifact must
 * not carry a UTC stamp that is off by the viewer's timezone.
 */

function two(n: number): string {
  return String(n).padStart(2, '0')
}

function localTimestamp(): string {
  const now = new Date()
  return (
    `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}` +
    `-${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`
  )
}

/** `supercat-<stamp>.png` (suffix '') / `supercat-state-<stamp>.json`
 * (suffix 'state'). */
export function supercatFilename(suffix: string, ext: string): string {
  return `supercat${suffix === '' ? '' : `-${suffix}`}-${localTimestamp()}.${ext}`
}

/**
 * Fires a browser download for the blob. Firefox needs the anchor in the
 * DOM to fire a download; Chrome is fine either way — insert-click-remove
 * keeps both honest. The browser takes ownership of the blob at click
 * time; revoking on a later task lets the URL outlive the download start.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
