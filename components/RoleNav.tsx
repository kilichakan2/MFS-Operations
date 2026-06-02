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
          { href: '/screen1',     label: t('navDispatch'),    icon: <ClipboardList  size={24} strokeWidth={2} /> },
          { href: '/cash',        label: t('navCash'),        icon: <Banknote       size={24} strokeWidth={2} /> },
          { href: '/complaints',  label: t('navComplaints'),  icon: <AlertCircle    size={24} strokeWidth={2} /> },
        ],
        overflow: [
          { href: '/pricing',     label: t('navPricing'),     icon: <Tags           size={24} strokeWidth={2} /> },
          { href: '/compliments', label: t('navCompliments'), icon: <ThumbsUp       size={24} strokeWidth={2} /> },
          { href: '/routes',      label: t('navRoutes'),      icon: <Map            size={24} strokeWidth={2} />, desktopOnly: true },
          { href: '/runs',        label: t('navRuns'),        icon: <Calendar       size={24} strokeWidth={2} /> },
          { href: '/screen4',     label: t('navDashboard'),   icon: <LayoutDashboard size={24} strokeWidth={2} /> },
        ],
      }

    case 'warehouse':
      return {
        visible: [
          { href: '/screen1',     label: t('navDispatch'),    icon: <ClipboardList  size={24} strokeWidth={2} /> },
          { href: '/complaints',  label: t('navComplaints'),  icon: <AlertCircle    size={24} strokeWidth={2} /> },
          { href: '/routes',      label: t('navRoutes'),      icon: <Map            size={24} strokeWidth={2} /> },
        ],
        overflow: [
          { href: '/compliments', label: t('navCompliments'), icon: <ThumbsUp       size={24} strokeWidth={2} /> },
          { href: '/runs',        label: t('navRuns'),        icon: <Calendar       size={24} strokeWidth={2} /> },
          { href: '/screen4',     label: t('navDashboard'),   icon: <LayoutDashboard size={24} strokeWidth={2} /> },
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
          { href: '/screen4',     label: t('navDashboard'),   icon: <LayoutDashboard size={24} strokeWidth={2} /> },
          { href: '/complaints',  label: t('navComplaints'),  icon: <AlertCircle    size={24} strokeWidth={2} /> },
          { href: '/pricing',     label: t('navPricing'),     icon: <Tags           size={24} strokeWidth={2} /> },
        ],
        overflow: [
          { href: '/cash',        label: t('navCash'),        icon: <Banknote       size={24} strokeWidth={2} /> },
          { href: '/compliments', label: t('navCompliments'), icon: <ThumbsUp       size={24} strokeWidth={2} /> },
          { href: '/routes',      label: t('navRoutes'),      icon: <Map            size={24} strokeWidth={2} /> },
          { href: '/runs',        label: t('navRuns'),        icon: <Calendar       size={24} strokeWidth={2} /> },
          { href: '/screen5',     label: t('navAdmin'),       icon: <Settings       size={24} strokeWidth={2} /> },
          { href: '/screen6',     label: t('navMap'),         icon: <Globe          size={24} strokeWidth={2} /> },
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
        { href: '/screen1',     label: t('navDispatch'),    icon: <ClipboardList   size={24} strokeWidth={2} /> },
        { href: '/cash',        label: t('navCash'),        icon: <Banknote        size={24} strokeWidth={2} /> },
        { href: '/complaints',  label: t('navComplaints'),  icon: <AlertCircle     size={24} strokeWidth={2} /> },
        { href: '/pricing',     label: t('navPricing'),     icon: <Tags            size={24} strokeWidth={2} /> },
        { href: '/compliments', label: t('navCompliments'), icon: <ThumbsUp        size={24} strokeWidth={2} /> },
        { href: '/routes',      label: t('navRoutes'),      icon: <Map             size={24} strokeWidth={2} /> },
        { href: '/runs',        label: t('navRuns'),        icon: <Calendar        size={24} strokeWidth={2} /> },
        { href: '/screen4',     label: t('navDashboard'),   icon: <LayoutDashboard size={24} strokeWidth={2} /> },
      ]

    case 'warehouse':
      return [
        { href: '/screen1',     label: t('navDispatch'),    icon: <ClipboardList   size={24} strokeWidth={2} /> },
        { href: '/complaints',  label: t('navComplaints'),  icon: <AlertCircle     size={24} strokeWidth={2} /> },
        { href: '/routes',      label: t('navRoutes'),      icon: <Map             size={24} strokeWidth={2} /> },
        { href: '/compliments', label: t('navCompliments'), icon: <ThumbsUp        size={24} strokeWidth={2} /> },
        { href: '/runs',        label: t('navRuns'),        icon: <Calendar        size={24} strokeWidth={2} /> },
        { href: '/screen4',     label: t('navDashboard'),   icon: <LayoutDashboard size={24} strokeWidth={2} /> },
      ]

    case 'driver':
      return [
        { href: '/driver',      label: 'My Route',          icon: <Navigation      size={24} strokeWidth={2} /> },
        { href: '/complaints',  label: t('navComplaints'),  icon: <AlertCircle     size={24} strokeWidth={2} /> },
        { href: '/compliments', label: 'Kudos',             icon: <Heart           size={24} strokeWidth={2} /> },
      ]

    case 'admin':
      return [
        { href: '/screen4',     label: t('navDashboard'),   icon: <LayoutDashboard size={24} strokeWidth={2} /> },
        { href: '/complaints',  label: t('navComplaints'),  icon: <AlertCircle     size={24} strokeWidth={2} /> },
        { href: '/pricing',     label: t('navPricing'),     icon: <Tags            size={24} strokeWidth={2} /> },
        { href: '/cash',        label: t('navCash'),        icon: <Banknote        size={24} strokeWidth={2} /> },
        { href: '/compliments', label: t('navCompliments'), icon: <ThumbsUp        size={24} strokeWidth={2} /> },
        { href: '/routes',      label: t('navRoutes'),      icon: <Map             size={24} strokeWidth={2} /> },
        { href: '/runs',        label: t('navRuns'),        icon: <Calendar        size={24} strokeWidth={2} /> },
        { href: '/screen5',     label: t('navAdmin'),       icon: <Settings        size={24} strokeWidth={2} /> },
        { href: '/screen6',     label: t('navMap'),         icon: <Globe           size={24} strokeWidth={2} /> },
      ]

    default:
      return []
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RoleNav() {
  const { t } = useLanguage()
  const [matrix, setMatrix] = useState<NavMatrix>({ visible: [], overflow: undefined })
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => {
    const role = getClientRole()
    setMatrix(buildMatrix(role, (k: string) => t(k as Parameters<typeof t>[0])))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (matrix.visible.length === 0) return null

  return (
    <>
      <BottomNav matrix={matrix} onOpenMore={() => setMoreOpen(true)} />
      {matrix.overflow && (
        <MoreDrawer
          open={moreOpen}
          onClose={() => setMoreOpen(false)}
          items={matrix.overflow}
        />
      )}
    </>
  )
}
