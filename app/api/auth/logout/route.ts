import { NextResponse } from 'next/server'

export async function POST() {
  const response = NextResponse.json({ success: true })

  // Clear both session cookies
  const shared = {
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge:   0,
    path:     '/',
  }
  response.cookies.set('mfs_session', '', { ...shared, httpOnly: true  })
  response.cookies.set('mfs_role',    '', { ...shared, httpOnly: false })

  return response
}
