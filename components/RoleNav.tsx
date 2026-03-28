'use client'

/**
 * components/RoleNav.tsx
 *
 * Reads the non-httpOnly `mfs_role` cookie and renders the correct
 * bottom navigation for the authenticated user's role.
 *
 * Nav matrix:
 *   admin     → Dashboard | Routes | Admin | Map
 *   sales     → Complaints | Visits | Routes
 *   office    → Dispatch | Complaints | Routes
 *   warehouse → Dispatch | Routes
 *   driver    → (no nav — driver only sees /driver)
 *
 * The mfs_role cookie is set at login alongside the httpOnly mfs_session.
 * Middleware enforces real access control server-side; this only controls
 * which tabs are visible.
 */

import { useMemo, type ReactNode } from 'react'
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

  const items = useMemo(() => {
    const role = getClientRole()
    switch (role) {
      case 'admin':
        return [
          { href: '/screen4', label: t('navDashboard'),  icon: Icons.dashboard },
          { href: '/routes',  label: t('navRoutes'),     icon: Icons.routes    },
          { href: '/screen5', label: t('navAdmin'),      icon: Icons.admin     },
          { href: '/screen6', label: t('navMap'),        icon: Icons.map       },
        ]
      case 'sales':
        return [
          { href: '/screen2', label: t('navComplaints'), icon: Icons.complaint },
          { href: '/screen3', label: t('navVisits'),     icon: Icons.visit     },
          { href: '/routes',  label: t('navRoutes'),     icon: Icons.routes    },
        ]
      case 'office':
        return [
          { href: '/screen1', label: t('navDispatch'),   icon: Icons.dispatch  },
          { href: '/screen2', label: t('navComplaints'), icon: Icons.complaint },
          { href: '/routes',  label: t('navRoutes'),     icon: Icons.routes    },
        ]
      case 'warehouse':
        return [
          { href: '/screen1', label: t('navDispatch'),   icon: Icons.dispatch  },
          { href: '/routes',  label: t('navRoutes'),     icon: Icons.routes    },
        ]
      case 'driver':
      default:
        return []  // drivers see no nav — /driver page has its own logout
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])  // stable: role from cookie, t() stable within session

  return <BottomNav items={items} />
}
