'use client'

import { useLanguage } from '@/lib/LanguageContext'

/**
 * components/RoleNav.tsx
 *
 * Reads the non-httpOnly `mfs_role` cookie client-side and renders
 * the correct bottom navigation tabs for the authenticated user's role.
 *
 * Permissions matrix (from 00_MFS_App_Overview.md):
 *   warehouse → Screen 1 only          → no nav bar (single screen)
 *   office    → Screens 1 + 2          → Dispatch | Complaints
 *   sales     → Screens 2 + 3          → Complaints | Visits
 *   admin     → Screens 4 + 5          → Dashboard | Admin
 *
 * The mfs_role cookie is set at login alongside the httpOnly mfs_session.
 * It contains only the role string — not sensitive. Middleware enforces
 * actual access control server-side; this component only controls what
 * tabs are visible, not what routes are accessible.
 */

import { useMemo, type ReactNode } from 'react'
import BottomNav, { Icons } from '@/components/BottomNav'

type Role = 'warehouse' | 'office' | 'sales' | 'admin' | ''

/** Read mfs_role from document.cookie without a network request */
function getClientRole(): Role {
  if (typeof document === 'undefined') return ''
  const match = document.cookie.match(/(?:^|;\s*)mfs_role=([^;]+)/)
  return (match?.[1] ?? '') as Role
}


export default function RoleNav() {
  const { t } = useLanguage()

  const NAV_ITEMS: Record<Role, { href: string; label: string; icon: ReactNode }[]> = {
  warehouse: [
    // Single screen — BottomNav hides itself when items.length <= 1
    { href: '/screen1', label: t('navDispatch'),   icon: Icons.dispatch },
  ],
  office: [
    { href: '/screen1', label: t('navDispatch'),   icon: Icons.dispatch  },
    { href: '/screen2', label: t('navComplaints'), icon: Icons.complaint },
  ],
  sales: [
    { href: '/screen2', label: t('navComplaints'), icon: Icons.complaint },
    { href: '/screen3', label: t('navVisits'),     icon: Icons.visit     },
  ],
  admin: [
    { href: '/screen4', label: t('navDashboard'),  icon: Icons.dashboard },
    { href: '/screen5', label: t('navAdmin'),      icon: Icons.admin     },
    { href: '/screen6', label: t('navMap'),        icon: Icons.map       },
  ],
  '': [],
}

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const items = useMemo(() => {
    const role = getClientRole()
    return NAV_ITEMS[role] ?? []
  }, [])  // NAV_ITEMS rebuilt each render from t(); role read from cookie, stable

  return <BottomNav items={items} />
}
