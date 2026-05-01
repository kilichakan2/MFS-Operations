/**
 * app/haccp/layout.tsx
 * Full-screen layout for the HACCP kiosk.
 * No standard RoleNav, no header — standalone kiosk interface.
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
