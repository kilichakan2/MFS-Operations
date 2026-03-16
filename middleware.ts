/**
 * middleware.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Enforces role-based routing on every request.
 * Unauthenticated users are redirected to /login.
 * Authenticated users are blocked from screens outside their role.
 *
 * Role → permitted paths:
 *   warehouse → /screen1
 *   office    → /screen1, /screen2
 *   sales     → /screen2, /screen3
 *   admin     → /screen4, /screen5
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { NextRequest, NextResponse } from 'next/server'

// Paths that are public (no auth required)
const PUBLIC_PATHS = ['/login', '/api/auth/login']

// Role → array of permitted path prefixes
const ROLE_PERMISSIONS: Record<string, string[]> = {
  warehouse: ['/screen1'],
  office:    ['/screen1', '/screen2'],
  sales:     ['/screen2', '/screen3'],
  admin:     ['/screen4', '/screen5', '/api/reference'],
}

// Default landing page per role
const ROLE_HOME: Record<string, string> = {
  warehouse: '/screen1',
  office:    '/screen1',
  sales:     '/screen2',
  admin:     '/screen4',
}

// Paths that any authenticated user can access (APIs used by multiple roles)
const SHARED_API_PATHS = [
  '/api/reference',
  '/api/screen1/sync',
  '/api/screen2/sync',
  '/api/screen3/sync',
]

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Always allow public paths and Next.js internals
  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/manifest') ||
    pathname.startsWith('/icons')
  ) {
    return NextResponse.next()
  }

  // Read session cookie
  const sessionCookie = req.cookies.get('mfs_session')?.value

  if (!sessionCookie) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(loginUrl)
  }

  let session: { userId: string; name: string; role: string }

  try {
    session = JSON.parse(sessionCookie)
  } catch {
    // Malformed cookie — clear it and redirect to login
    const response = NextResponse.redirect(new URL('/login', req.url))
    response.cookies.delete('mfs_session')
    return response
  }

  const { role } = session

  // Root path — redirect to role home
  if (pathname === '/') {
    return NextResponse.redirect(new URL(ROLE_HOME[role] ?? '/login', req.url))
  }

  // Shared API paths — allow any authenticated user
  if (SHARED_API_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Check role permissions for screen paths
  const permitted = ROLE_PERMISSIONS[role] ?? []
  const isPermitted = permitted.some((p) => pathname.startsWith(p))

  if (!isPermitted) {
    // Redirect to role's home rather than showing a 403
    return NextResponse.redirect(new URL(ROLE_HOME[role] ?? '/login', req.url))
  }

  // Pass the session identity to API routes via headers
  // (avoids re-parsing the cookie in every route handler)
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-mfs-user-id',   session.userId)
  requestHeaders.set('x-mfs-user-name', session.name)
  requestHeaders.set('x-mfs-user-role', session.role)

  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
