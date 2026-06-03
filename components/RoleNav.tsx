'use client'

/**
 * components/RoleNav.tsx
 *
 * Reads only the mfs_role cookie and renders that single role's nav.
 * Role picker guarantees sessions are always single-role — no union needed.
 *
 * Per-role NavMatrix (visible tabs + optional overflow drawer rows):
 *   admin     → visible: Dashboard, Complaints, Pricing
 *               overflow: Cash, Compliments, Routes, Runs, Admin, Map
 *   sales     → visible: Orders, Visits, Complaints
 *               overflow: Pricing, Compliments, Routes (DESKTOP), Runs
 *   office    → visible: Dispatch, Cash, Complaints
 *               overflow: Pricing, Compliments, Routes (DESKTOP), Runs, Dashboard
 *   warehouse → visible: Dispatch, Complaints, Routes
 *               overflow: Compliments, Runs, Dashboard
 *   driver    → visible: My Route, Complaints, Kudos
 *               overflow: undefined   (3 tabs, NO More slot)
 */

import { useState, useEffect } from 'react'
import {
  ShoppingBag, MapPin, AlertCircle, ThumbsUp, Tags, Map, Calendar,
  ClipboardList, Banknote, LayoutDashboard, Navigation, Heart,
  Settings, Globe,
} from 'lucide-react'
import { useLanguage }    from '@/lib/LanguageContext'
import BottomNav, { type NavMatrix, type NavItem } from '@/components/BottomNav'
import MoreDrawer         from '@/components/MoreDrawer'
import DesktopSidebar     from '@/components/DesktopSidebar'

export type Role = 'warehouse' | 'office' | 'sales' | 'admin' | 'driver' | ''

function getClientRole(): Role {
  if (typeof document === 'undefined') return ''
  return (document.cookie.match(/(?:^|;\s*)mfs_role=([^;]+)/)?.[1] ?? '') as Role
}

// ─── Pure matrix builder (exported for unit tests) ────────────────────────────

type Translator = (key: string) => string

/**
 * Pure data builder — returns the NavMatrix for a given role. Takes a
 * translator function so tests can pass identity and assert by key,
 * while the runtime passes useLanguage's `t` for localised labels.
 *
 * Driver's 'Kudos' and 'My Route', and sales' 'Orders' labels are
 * intentionally hardcoded literals (NOT translated). All other labels
 * go through `t(...)`. This matches the existing driver convention
 * and the spec for the new mobile chrome.
 */
export function buildMatrix(role: Role, t: Translator): NavMatrix {
  switch (role) {
    case 'sales':
      return {
        visible: [
          { href: '/orders',      label: 'Orders',            icon: <ShoppingBag    size={24} strokeWidth={2} /> },
          { href: '/visits',      label: t('navVisits'),      icon: <MapPin         size={24} strokeWidth={2} /> },
          { href: '/complaints',  label: t('navComplaints'),  icon: <AlertCircle    size={24} strokeWidth={2} /> },
        ],
        overflow: [
          { href: '/pricing',     label: t('navPricing'),     icon: <Tags           size={24} strokeWidth={2} /> },
          { href: '/compliments', label: t('navCompliments'), icon: <ThumbsUp       size={24} strokeWidth={2} /> },
          { href: '/routes',      label: t('navRoutes'),      icon: <Map            size={24} strokeWidth={2} />, desktopOnly: true },
          { href: '/runs',        label: t('navRuns'),        icon: <Calendar       size={24} strokeWidth={2} /> },
        ],
      }

    case 'office':
      return {
        visible: [
          { href: '/dispatch',    label: t('navDispatch'),    icon: <ClipboardList  size={24} strokeWidth={2} /> },
          { href: '/cash',        label: t('navCash'),        icon: <Banknote       size={24} strokeWidth={2} /> },
          { href: '/complaints',  label: t('navComplaints'),  icon: <AlertCircle    size={24} strokeWidth={2} /> },
        ],
        overflow: [
          { href: '/pricing',     label: t('navPricing'),     icon: <Tags           size={24} strokeWidth={2} /> },
          { href: '/compliments', label: t('navCompliments'), icon: <ThumbsUp       size={24} strokeWidth={2} /> },
          { href: '/routes',      label: t('navRoutes'),      icon: <Map            size={24} strokeWidth={2} />, desktopOnly: true },
          { href: '/runs',        label: t('navRuns'),        icon: <Calendar       size={24} strokeWidth={2} /> },
          { href: '/dashboard/admin', label: t('navDashboard'), icon: <LayoutDashboard size={24} strokeWidth={2} /> },
        ],
      }

    case 'warehouse':
      return {
        visible: [
          { href: '/dispatch',    label: t('navDispatch'),    icon: <ClipboardList  size={24} strokeWidth={2} /> },
          { href: '/complaints',  label: t('navComplaints'),  icon: <AlertCircle    size={24} strokeWidth={2} /> },
          { href: '/routes',      label: t('navRoutes'),      icon: <Map            size={24} strokeWidth={2} /> },
        ],
        overflow: [
          { href: '/compliments', label: t('navCompliments'), icon: <ThumbsUp       size={24} strokeWidth={2} /> },
          { href: '/runs',        label: t('navRuns'),        icon: <Calendar       size={24} strokeWidth={2} /> },
          { href: '/dashboard/admin', label: t('navDashboard'), icon: <LayoutDashboard size={24} strokeWidth={2} /> },
        ],
      }

    case 'driver':
      return {
        visible: [
          { href: '/driver',      label: 'My Route',          icon: <Navigation     size={24} strokeWidth={2} /> },
          { href: '/complaints',  label: t('navComplaints'),  icon: <AlertCircle    size={24} strokeWidth={2} /> },
          { href: '/compliments', label: 'Kudos',             icon: <Heart          size={24} strokeWidth={2} /> },
        ],
        overflow: undefined,
      }

    case 'admin':
      return {
        visible: [
          { href: '/dashboard/admin', label: t('navDashboard'), icon: <LayoutDashboard size={24} strokeWidth={2} /> },
          { href: '/complaints',  label: t('navComplaints'),  icon: <AlertCircle    size={24} strokeWidth={2} /> },
          { href: '/pricing',     label: t('navPricing'),     icon: <Tags           size={24} strokeWidth={2} /> },
        ],
        overflow: [
          { href: '/cash',        label: t('navCash'),        icon: <Banknote       size={24} strokeWidth={2} /> },
          { href: '/compliments', label: t('navCompliments'), icon: <ThumbsUp       size={24} strokeWidth={2} /> },
          { href: '/routes',      label: t('navRoutes'),      icon: <Map            size={24} strokeWidth={2} /> },
          { href: '/runs',        label: t('navRuns'),        icon: <Calendar       size={24} strokeWidth={2} /> },
          { href: '/admin',       label: t('navAdmin'),       icon: <Settings       size={24} strokeWidth={2} /> },
          { href: '/map',         label: t('navMap'),         icon: <Globe          size={24} strokeWidth={2} /> },
        ],
      }

    default:
      return { visible: [], overflow: undefined }
  }
}

// ─── Pure sidebar item builder (exported for unit tests) ──────────────────────

/**
 * Pure data builder — returns the flat NavItem list rendered by the
 * desktop chrome's left sidebar for a given role. NO overflow split,
 * NO "More" item — the sidebar shows every item in one column.
 *
 * Same label conventions as `buildMatrix`: driver's 'Kudos' and
 * 'My Route' and sales' 'Orders' are hardcoded literals; everything
 * else flows through `t(...)`.
 */
export function buildSidebarItems(role: Role, t: Translator): NavItem[] {
  switch (role) {
    case 'sales':
      return [
        { href: '/orders',      label: 'Orders',            icon: <ShoppingBag     size={24} strokeWidth={2} /> },
        { href: '/visits',      label: t('navVisits'),      icon: <MapPin          size={24} strokeWidth={2} /> },
        { href: '/complaints',  label: t('navComplaints'),  icon: <AlertCircle     size={24} strokeWidth={2} /> },
        { href: '/pricing',     label: t('navPricing'),     icon: <Tags            size={24} strokeWidth={2} /> },
        { href: '/compliments', label: t('navCompliments'), icon: <ThumbsUp        size={24} strokeWidth={2} /> },
        { href: '/routes',      label: t('navRoutes'),      icon: <Map             size={24} strokeWidth={2} /> },
        { href: '/runs',        label: t('navRuns'),        icon: <Calendar        size={24} strokeWidth={2} /> },
      ]

    case 'office':
      return [
        { href: '/dispatch',    label: t('navDispatch'),    icon: <ClipboardList   size={24} strokeWidth={2} /> },
        { href: '/cash',        label: t('navCash'),        icon: <Banknote        size={24} strokeWidth={2} /> },
        { href: '/complaints',  label: t('navComplaints'),  icon: <AlertCircle     size={24} strokeWidth={2} /> },
        { href: '/pricing',     label: t('navPricing'),     icon: <Tags            size={24} strokeWidth={2} /> },
        { href: '/compliments', label: t('navCompliments'), icon: <ThumbsUp        size={24} strokeWidth={2} /> },
        { href: '/routes',      label: t('navRoutes'),      icon: <Map             size={24} strokeWidth={2} /> },
        { href: '/runs',        label: t('navRuns'),        icon: <Calendar        size={24} strokeWidth={2} /> },
        { href: '/dashboard/admin', label: t('navDashboard'), icon: <LayoutDashboard size={24} strokeWidth={2} /> },
      ]

    case 'warehouse':
      return [
        { href: '/dispatch',    label: t('navDispatch'),    icon: <ClipboardList   size={24} strokeWidth={2} /> },
        { href: '/complaints',  label: t('navComplaints'),  icon: <AlertCircle     size={24} strokeWidth={2} /> },
        { href: '/routes',      label: t('navRoutes'),      icon: <Map             size={24} strokeWidth={2} /> },
        { href: '/compliments', label: t('navCompliments'), icon: <ThumbsUp        size={24} strokeWidth={2} /> },
        { href: '/runs',        label: t('navRuns'),        icon: <Calendar        size={24} strokeWidth={2} /> },
        { href: '/dashboard/admin', label: t('navDashboard'), icon: <LayoutDashboard size={24} strokeWidth={2} /> },
      ]

    case 'driver':
      return [
        { href: '/driver',      label: 'My Route',          icon: <Navigation      size={24} strokeWidth={2} /> },
        { href: '/complaints',  label: t('navComplaints'),  icon: <AlertCircle     size={24} strokeWidth={2} /> },
        { href: '/compliments', label: 'Kudos',             icon: <Heart           size={24} strokeWidth={2} /> },
      ]

    case 'admin':
      return [
        { href: '/dashboard/admin', label: t('navDashboard'), icon: <LayoutDashboard size={24} strokeWidth={2} /> },
        { href: '/complaints',  label: t('navComplaints'),  icon: <AlertCircle     size={24} strokeWidth={2} /> },
        { href: '/pricing',     label: t('navPricing'),     icon: <Tags            size={24} strokeWidth={2} /> },
        { href: '/cash',        label: t('navCash'),        icon: <Banknote        size={24} strokeWidth={2} /> },
        { href: '/compliments', label: t('navCompliments'), icon: <ThumbsUp        size={24} strokeWidth={2} /> },
        { href: '/routes',      label: t('navRoutes'),      icon: <Map             size={24} strokeWidth={2} /> },
        { href: '/runs',        label: t('navRuns'),        icon: <Calendar        size={24} strokeWidth={2} /> },
        { href: '/admin',       label: t('navAdmin'),       icon: <Settings        size={24} strokeWidth={2} /> },
        { href: '/map',         label: t('navMap'),         icon: <Globe           size={24} strokeWidth={2} /> },
      ]

    default:
      return []
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RoleNav() {
  const { t } = useLanguage()
  const [matrix, setMatrix] = useState<NavMatrix>({ visible: [], overflow: undefined })
  const [sidebarItems, setSidebarItems] = useState<NavItem[]>([])
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => {
    const role = getClientRole()
    const tr: Translator = (k: string) => t(k as Parameters<typeof t>[0])
    setMatrix(buildMatrix(role, tr))
    setSidebarItems(buildSidebarItems(role, tr))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Tag the body so global CSS can offset desktop content for the sidebar.
  // Idempotent across re-mounts (each RoleNav-bearing page re-sets it).
  useEffect(() => {
    document.body.setAttribute('data-mfs-chrome', 'true')
    return () => { document.body.removeAttribute('data-mfs-chrome') }
  }, [])

  // No role at all → render nothing on either side.
  if (matrix.visible.length === 0 && sidebarItems.length === 0) return null

  return (
    <>
      {/* Mobile chrome (Item 2) — <md only */}
      <div className="md:hidden">
        <BottomNav matrix={matrix} onOpenMore={() => setMoreOpen(true)} />
        {matrix.overflow && (
          <MoreDrawer
            open={moreOpen}
            onClose={() => setMoreOpen(false)}
            items={matrix.overflow}
          />
        )}
      </div>

      {/* Desktop chrome (Item 3) — md+ only */}
      <div className="hidden md:block">
        <DesktopSidebar items={sidebarItems} />
      </div>
    </>
  )
}
