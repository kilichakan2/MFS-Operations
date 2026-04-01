'use client'

/**
 * components/RoleNav.tsx
 *
 * Reads the non-httpOnly `mfs_role` cookie and renders the correct
 * bottom navigation for the authenticated user's role.
 *
 * Nav matrix:
 *   admin     → Dashboard | Map | Routes | Admin
 *   sales     → Complaints | Visits | Routes
 *   office    → Dispatch | Complaints | Routes
 *   warehouse → Dispatch | Routes
 *   driver    → My Route (/driver) | Complaints (/screen2)
 *
 * The mfs_role cookie is set at login alongside the httpOnly mfs_session.
 * Middleware enforces real access control server-side; this only controls
 * which tabs are visible.
 */

import { useState, useEffect, type ReactNode } from 'react'
import { useLanguage }             from '@/lib/LanguageContext'
import BottomNav, { Icons }        from '@/components/BottomNav'

type Role = 'warehouse' | 'office' | 'sales' | 'admin' | 'driver' | ''

function getClientRole(): Role {
  if (typeof document === 'undefined') return ''
  const match = document.cookie.match(/(?:^|;\s*)mfs_role=([^;]+)/)
  return (match?.[1] ?? '') as Role
}

export default function RoleNav() {
  const { t } = useLanguage()

  const [items, setItems] = useState<NavItem[]>([])

  useEffect(() => {
    // Runs after mount on client — document.cookie is available.
    // useEffect (not useMemo) guarantees cookie is readable after hydration.
    const role = getClientRole()
    switch (role) {
      case 'admin':
        setItems([
          { href: '/screen4',    label: t('navDashboard'),  icon: Icons.dashboard },
          { href: '/routes',     label: t('navRoutes'),     icon: Icons.routes    },
          { href: '/complaints', label: t('navComplaints'), icon: Icons.complaint },
          { href: '/cash',       label: t('navCash'),       icon: Icons.cash      },
          { href: '/screen5',    label: t('navAdmin'),      icon: Icons.admin     },
        ]); break
      case 'sales':
        setItems([
          { href: '/complaints', label: t('navComplaints'), icon: Icons.complaint },
          { href: '/visits',     label: t('navVisits'),     icon: Icons.visit     },
          { href: '/routes',     label: t('navRoutes'),     icon: Icons.routes,   badge: 'Desktop' },
          { href: '/runs',       label: t('navRuns'),       icon: Icons.runs     },
        ]); break
      case 'office':
        setItems([
          { href: '/screen1',    label: t('navDispatch'),   icon: Icons.dispatch  },
          { href: '/complaints', label: t('navComplaints'), icon: Icons.complaint },
          { href: '/cash',       label: t('navCash'),       icon: Icons.cash      },
          { href: '/routes',     label: t('navRoutes'),     icon: Icons.routes,   badge: 'Desktop' },
          { href: '/runs',       label: t('navRuns'),       icon: Icons.runs     },
        ]); break
      case 'warehouse':
        setItems([
          { href: '/screen1', label: t('navDispatch'),   icon: Icons.dispatch  },
          { href: '/routes',  label: t('navRoutes'),     icon: Icons.routes,   badge: 'Desktop' },
          { href: '/runs',    label: t('navRuns'),       icon: Icons.runs     },
        ]); break
      case 'driver':
        setItems([
          { href: '/driver',      label: 'My Route',    icon: Icons.routes    },
          { href: '/complaints',  label: 'Complaints',  icon: Icons.complaint },
        ]); break
      default:
        setItems([]); break
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return <BottomNav items={items} />
}
