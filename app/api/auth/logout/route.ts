import { NextRequest, NextResponse } from 'next/server'

const COOKIE_CLEAR = {
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge:   0,
  path:     '/',
}

// GET — browser navigation (window.location.href) + optional ?redirect=
export async function GET(req: NextRequest) {
  const redirect = req.nextUrl.searchParams.get('redirect') ?? '/haccp'
  const response = NextResponse.redirect(new URL(redirect, req.url))

  response.cookies.set('mfs_session', '', { ...COOKIE_CLEAR, httpOnly: true  })
  response.cookies.set('mfs_role',    '', { ...COOKIE_CLEAR, httpOnly: false })
  response.cookies.set('mfs_user_id', '', { ...COOKIE_CLEAR, httpOnly: false })
  response.cookies.set('mfs_name',    '', { ...COOKIE_CLEAR, httpOnly: false })

  return response
}

// POST — fetch-based logout (kept for API callers)
export async function POST() {
  const response = NextResponse.json({ success: true })

  response.cookies.set('mfs_session', '', { ...COOKIE_CLEAR, httpOnly: true  })
  response.cookies.set('mfs_role',    '', { ...COOKIE_CLEAR, httpOnly: false })
  response.cookies.set('mfs_user_id', '', { ...COOKIE_CLEAR, httpOnly: false })
  response.cookies.set('mfs_name',    '', { ...COOKIE_CLEAR, httpOnly: false })

  return response
}
