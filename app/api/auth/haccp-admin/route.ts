/**
 * app/api/auth/haccp-admin/route.ts
 *
 * HACCP kiosk admin login.
 * Accepts a 4-digit password and sets session cookies identically to the
 * regular login route — same Secure/SameSite flags so they properly overwrite
 * any existing session rather than creating duplicate same-name cookies.
 */

import { NextRequest, NextResponse } from 'next/server'

const ADMIN_PASSWORD = '0505'
const ADMIN_USER_ID  = 'e5320cb8-8977-4f86-80d7-6bbc595ce183'  // Hakan — admin
const ADMIN_NAME     = 'Admin'

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json()

    if (!password || password !== ADMIN_PASSWORD) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })
    }

    const cookieOpts = {
      httpOnly: false,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      maxAge:   60 * 60 * 8,  // 8-hour kiosk session
      path:     '/',
    }

    const res = NextResponse.json({ ok: true })

    // mfs_session is httpOnly — the authoritative server-side session
    res.cookies.set('mfs_session', JSON.stringify({
      userId: ADMIN_USER_ID,
      name:   ADMIN_NAME,
      role:   'admin',
    }), { ...cookieOpts, httpOnly: true })

    // Client-readable cookies — same Secure flag as mfs_session
    res.cookies.set('mfs_role',    'admin',       cookieOpts)
    res.cookies.set('mfs_user_id', ADMIN_USER_ID, cookieOpts)
    res.cookies.set('mfs_name',    ADMIN_NAME,    cookieOpts)

    return res

  } catch (err) {
    console.error('[POST /api/auth/haccp-admin]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
