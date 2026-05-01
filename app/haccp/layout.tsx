/**
 * app/haccp/layout.tsx
 * Full-screen tablet layout for the HACCP processing room.
 * No standard RoleNav, no header — this is a standalone kiosk interface.
 *
 * On mobile (≤640px): full width as designed.
 * On iPad/Mac: constrained to 640px, centered, with slate background outside.
 */

export const metadata = {
  title: 'MFS HACCP | Processing Room',
}

export default function HaccpLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100dvh', width: '100%', background: '#cbd5e1' }}>
      <div
        className="haccp-shell"
        style={{
          minHeight:  '100dvh',
          width:      '100%',
          maxWidth:   640,
          margin:     '0 auto',
          position:   'relative',
          overflow:   'hidden',
        }}
      >
        {children}
      </div>
    </div>
  )
}
