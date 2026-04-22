'use client'

/**
 * components/PwaGuard.tsx
 *
 * iOS PWA restores the last visited URL when the app is brought back from
 * background — even after the user "closes" it. This means an admin who was
 * on /runs will land there on next open, instead of their role home.
 *
 * This component fires on every page mount in standalone (PWA) mode and
 * checks that the current URL is appropriate for the logged-in role.
 * If it isn't, it redirects to role home.
 *
 * Works alongside the server-side middleware (which handles fresh loads).
 */

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'

const ROLE_HOME: Record<string, string> = {
  admin:     '/screen4',
  warehouse: '/screen1',
  office:    '/screen1',
  sales:     '/complaints',
  driver:    '/driver',
  butcher:   '/haccp',
}

const ROLE_ALLOWED_PREFIXES: Record<string, string[]> = {
  admin:     ['/screen4', '/screen5', '/screen6', '/screen1', '/driver', '/routes', '/runs', '/complaints', '/visits', '/cash', '/compliments', '/pricing', '/haccp'],
  warehouse: ['/screen1', '/routes', '/runs', '/compliments', '/complaints', '/haccp'],
  office:    ['/screen1', '/complaints', '/routes', '/runs', '/cash', '/compliments', '/pricing'],
  sales:     ['/complaints', '/visits', '/routes', '/runs', '/compliments', '/pricing'],
  driver:    ['/driver', '/routes', '/complaints', '/compliments'],
  butcher:   ['/haccp'],
}

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.split(';').find(c => c.trim().startsWith(name + '='))
  return match ? decodeURIComponent(match.split('=')[1]) : null
}

function isPwa(): boolean {
  if (typeof window === 'undefined') return false
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
}

export default function PwaGuard() {
  const pathname = usePathname()
  const router   = useRouter()

  useEffect(() => {
    if (!isPwa()) return

    const role = getCookie('mfs_role')
    if (!role) return  // Not logged in — middleware handles redirect

    const allowed  = ROLE_ALLOWED_PREFIXES[role] ?? []
    const isOk     = allowed.some(prefix => pathname.startsWith(prefix))
    const isPublic = ['/login', '/haccp'].some(p => pathname.startsWith(p))

    if (!isOk && !isPublic) {
      const home = ROLE_HOME[role] ?? '/'
      router.replace(home)
    }
  }, [pathname, router])

  return null
}
