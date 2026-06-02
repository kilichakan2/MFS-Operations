/**
 * middleware.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Enforces role-based routing on every request.
 * Unauthenticated users are redirected to /login.
 * Authenticated users are blocked from screens outside their role.
 *
 * Role → permitted paths (keep in sync with ROLE_PERMISSIONS below):
 *   warehouse → /dispatch, /routes, /runs, /complaints, /compliments, /orders
 *   office    → /dispatch, /complaints, /routes, /runs, /cash, /compliments, /pricing, /orders
 *   sales     → /complaints, /visits, /routes, /runs, /compliments, /pricing, /orders
 *   admin     → all paths + /api/admin, /api/dashboard, /api/map
 *   driver    → /driver, /routes, /complaints, /compliments
 *   butcher   → /haccp
 *
 * PUBLIC paths (no auth) include /kds — the production-room KDS is a
 * shared kiosk with no per-user session; butchers PIN-authenticate
 * per-action via the modal on the page.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { NextRequest, NextResponse } from 'next/server'

// Paths that are public (no auth required)
// /api/cron/* is included here because external cron services (e.g. cron-job.org) have no
// session cookie. The individual cron routes validate their own auth via CRON_SECRET.
// /sw.js must be public — browsers fetch the service worker without credentials.
// Without this it 307s to /login and pushManager.subscribe() fails silently.
const PUBLIC_PATHS = ['/login', '/haccp', '/api/auth/login', '/api/auth/type', '/api/auth/logout', '/api/auth/team', '/api/auth/haccp-team', '/api/auth/haccp-admin', '/api/auth/kds-pin', '/api/kds', '/kds', '/api/cron', '/sw.js', '/api/haccp/visitor']

// Role → array of permitted path prefixes
const ROLE_PERMISSIONS: Record<string, string[]> = {
  warehouse: ['/dispatch', '/routes', '/runs', '/compliments', '/complaints', '/haccp', '/orders'],
  office:    ['/dispatch', '/complaints', '/routes', '/runs', '/cash', '/compliments', '/pricing', '/orders'],
  sales:     ['/complaints', '/visits', '/routes', '/runs', '/compliments', '/pricing', '/orders'],
  admin:     ['/dashboard/admin', '/admin', '/map', '/driver', '/routes', '/runs', '/complaints', '/visits', '/dispatch', '/cash', '/compliments', '/pricing', '/haccp', '/orders', '/api/reference', '/api/admin', '/api/dashboard', '/api/map', '/api/admin/runs'],
  driver:    ['/driver', '/routes', '/complaints', '/compliments'],  // drivers: route view + complaints
  butcher:   ['/haccp'],  // butchers: HACCP tablet only — KDS is public kiosk (no per-user auth)
}

// Default landing page per role
const ROLE_HOME: Record<string, string> = {
  warehouse: '/dispatch',
  office:    '/dispatch',
  sales:     '/complaints',
  admin:     '/dashboard/admin',
  driver:    '/driver',
  butcher:   '/haccp',
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
  '/api/cash/month',
  '/api/cash/entry',
  '/api/cash/upload',
  '/api/cash/cheques',
  '/api/cash/export',
  '/api/screen3/sync',
  '/api/screen3/today',
  '/api/screen3/visit',
  '/api/screen3/visit/notes',
  '/api/compliments',
  '/api/compliments/users',
  '/api/pricing',
  '/api/detail/visit',
  '/api/detail/complaint',
  '/api/detail/discrepancy',
  '/api/admin/geocode-all',
  '/api/admin/runs',
  '/api/routes',
  '/api/haccp',
  '/api/labels',
  '/api/notifications',
  '/api/orders',
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
    // HACCP paths — redirect to /haccp (kiosk login), not the main app login
    if (pathname.startsWith('/haccp')) {
      return NextResponse.redirect(new URL('/haccp', req.url))
    }
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(loginUrl)
  }

  let session: { userId: string; name: string; role: string; secondaryRoles?: string[] }

  try {
    session = JSON.parse(sessionCookie)
  } catch {
    // Malformed cookie — clear it and redirect to login
    const response = NextResponse.redirect(new URL('/login', req.url))
    response.cookies.delete('mfs_session')
    return response
  }

  const { role } = session
  const allRoles = [role, ...(session.secondaryRoles ?? []).filter(r => r !== 'admin')]

  // Root path — redirect to role home
  // Exception: warehouse/butcher who logged in via the HACCP kiosk door
  // should go back to /haccp, not /dispatch (dispatch log)
  if (pathname === '/') {
    const isHaccpSession = req.cookies.get('mfs_haccp_session')?.value === '1'
    if (isHaccpSession && ['warehouse', 'butcher'].includes(role)) {
      return NextResponse.redirect(new URL('/haccp', req.url))
    }
    return NextResponse.redirect(new URL(ROLE_HOME[role] ?? '/login', req.url))
  }

  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-mfs-user-id',          session.userId)
  requestHeaders.set('x-mfs-user-name',         session.name)
  requestHeaders.set('x-mfs-user-role',         session.role)
  requestHeaders.set('x-mfs-secondary-roles',   (session.secondaryRoles ?? []).join(','))

  // Shared API paths — allow any authenticated user (all roles can sync)
  if (SHARED_API_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  // Check role permissions — union of primary + secondary roles
  const permitted = allRoles.flatMap(r => ROLE_PERMISSIONS[r] ?? [])
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
