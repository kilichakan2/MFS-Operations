/**
 * app/haccp/layout.tsx
 * Full-screen tablet layout for the HACCP processing room.
 * No standard RoleNav, no header — this is a standalone kiosk interface.
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
