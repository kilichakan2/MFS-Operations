/**
 * app/haccp/layout.tsx
 * Full-screen layout for the HACCP kiosk.
 * No standard RoleNav, no header — standalone kiosk interface.
 *
 * Stays a SERVER component so the `metadata` export survives. The kiosk now
 * inherits the default light `:root` skin (the 2026-07-01 refresh flipped HACCP
 * off the dark theme); no `data-theme` opt-in and no <ThemeLock> are needed —
 * light is the document default, so Radix-portaled overlays inherit it too.
 */

export const metadata = {
  title: 'MFS HACCP | Processing Room',
}

export default function HaccpLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="haccp-shell" style={{ minHeight: '100dvh', width: '100%' }}>
      {children}
    </div>
  )
}
