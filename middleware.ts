/**
 * middleware.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Enforces role-based routing on every request.
 * Unauthenticated users are redirected to /login.
 * Authenticated users are blocked from screens outside their role.
 *
 * Role → permitted paths:
 *   warehouse → /screen1
 *   office    → /screen1, /complaints
 *   sales     → /complaints, /visits
 *   admin     → /screen4, /screen5
 *   driver    → /driver (route view only)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { NextRequest, NextResponse } from 'next/server'

// Paths that are public (no auth required)
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/type', '/api/auth/logout', '/api/auth/team']

// Role → array of permitted path prefixes
const ROLE_PERMISSIONS: Record<string, string[]> = {
  warehouse: ['/screen1', '/routes', '/runs'],
  office:    ['/screen1', '/complaints', '/routes', '/runs'],
  sales:     ['/complaints', '/visits', '/routes', '/runs'],
  admin:     ['/screen4', '/screen5', '/screen6', '/driver', '/routes', '/runs', '/complaints', '/visits', '/screen1', '/api/reference', '/api/admin', '/api/dashboard', '/api/map', '/api/admin/runs'],
  driver:    ['/driver', '/routes', '/complaints'],  // drivers: route view + complaints
}

// Default landing page per role
const ROLE_HOME: Record<string, string> = {
  warehouse: '/screen1',
  office:    '/screen1',
  sales:     '/complaints',
  admin:     '/screen4',
  driver:    '/driver',
}

// Paths that any authenticated user can access (APIs used by multiple roles)
const SHARED_API_PATHS = [
  '/api/reference',
  '/api/screen1/sync',
  '/api/screen2/sync',
  '/api/screen2/open',
  '/api/screen2/resolve',
  '/api/screen2/all',
  '/api/screen2/note',
  '/api/screen3/sync',
  '/api/screen3/today',
  '/api/screen3/visit',
  '/api/detail/visit',
  '/api/detail/complaint',
  '/api/detail/discrepancy',
  '/api/admin/geocode-all',
  '/api/admin/runs',
  '/api/routes',
]

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Always allow public paths and Next.js internals
  // Pass through static assets — SVG/PNG/ICO/JSON files in /public
  // These must be excluded BEFORE the session check or the middleware
  // intercepts them and redirects unauthenticated requests to /login.
  const ext = pathname.split('.').pop()?.toLowerCase() ?? ''
  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/manifest') ||
    pathname.startsWith('/icons') ||
    ['svg', 'png', 'jpg', 'jpeg', 'webp', 'ico', 'json', 'txt', 'xml'].includes(ext)
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

  // Build enriched headers once — used by every authenticated pass-through.
  // Sync routes read x-mfs-user-id to identify the caller without re-parsing
  // the cookie. This must happen BEFORE the shared-path early return.
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-mfs-user-id',   session.userId)
  requestHeaders.set('x-mfs-user-name', session.name)
  requestHeaders.set('x-mfs-user-role', session.role)

  // Shared API paths — allow any authenticated user (all roles can sync)
  if (SHARED_API_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  // Check role permissions for screen paths
  const permitted = ROLE_PERMISSIONS[role] ?? []
  const isPermitted = permitted.some((p) => pathname.startsWith(p))

  if (!isPermitted) {
    return NextResponse.redirect(new URL(ROLE_HOME[role] ?? '/login', req.url))
  }

  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
