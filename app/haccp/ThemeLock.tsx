'use client'

/**
 * ThemeLock — forces the WHOLE document into the dark theme while the HACCP
 * kiosk is mounted, then restores the prior theme on the way out.
 *
 * Why the document root, not just the kiosk shell: Modal / Popover /
 * DropdownMenu render their content through a Radix Portal whose default
 * container is `document.body` — OUTSIDE the `haccp-shell` subtree. CSS custom
 * properties (the `[data-theme="dark"]` token block) cascade by inheritance to
 * descendants only, so a shell-only flag leaves portaled overlays light.
 * Setting `data-theme="dark"` on `document.documentElement` makes `document.body`
 * and every portal under it inherit the dark variables — one attribute, set
 * once, covers the kiosk body AND its teleported overlays, with no edits to the
 * shared overlay kit components.
 */
import { useEffect } from 'react'

export default function ThemeLock() {
  useEffect(() => {
    // Assumes sole ownership of <html data-theme> while mounted: `prev` is
    // captured once, so if another writer (e.g. an app-wide theme provider)
    // changed it mid-mount, the restore would clobber that newer value. No such
    // writer exists on the kiosk route today (HACCP is a standalone surface).
    const el = document.documentElement
    const prev = el.getAttribute('data-theme')
    el.setAttribute('data-theme', 'dark')
    return () => {
      if (prev === null) el.removeAttribute('data-theme')
      else el.setAttribute('data-theme', prev)
    }
  }, [])

  return null
}
