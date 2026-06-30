/**
 * app/haccp/layout.tsx
 * Full-screen layout for the HACCP kiosk.
 * No standard RoleNav, no header — standalone kiosk interface.
 *
 * Stays a SERVER component so the `metadata` export survives. The
 * `data-theme="dark"` on the shell gives the in-tree page dark colours at first
 * server paint (no flash); <ThemeLock> additionally locks the document root to
 * dark so Radix-portaled overlays (which render to document.body, outside this
 * subtree) inherit the dark tokens too.
 */
import ThemeLock from './ThemeLock'

export const metadata = {
  title: 'MFS HACCP | Processing Room',
}

export default function HaccpLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="haccp-shell" style={{ minHeight: '100dvh', width: '100%' }} data-theme="dark">
      <ThemeLock />
      {children}
    </div>
  )
}
