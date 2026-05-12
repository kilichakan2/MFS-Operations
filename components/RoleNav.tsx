'use client'

/**
 * components/RoleNav.tsx
 *
 * Reads mfs_role (primary) and mfs_secondary_roles (comma-separated secondary)
 * cookies and renders the union nav for all active roles.
 * For multi-role users (e.g. driver + sales), nav items from both roles
 * are merged and deduped by href (first occurrence wins).
 */

import { useState, useEffect } from 'react'
import { useLanguage }          from '@/lib/LanguageContext'
import BottomNav, { Icons, type NavItem }     from '@/components/BottomNav'

type Role = 'warehouse' | 'office' | 'sales' | 'admin' | 'driver' | ''

function getClientRoles(): Role[] {
  if (typeof document === 'undefined') return []
  const primary   = (document.cookie.match(/(?:^|;\s*)mfs_role=([^;]+)/)?.[1] ?? '') as Role
  const secondary = (document.cookie.match(/(?:^|;\s*)mfs_secondary_roles=([^;]*)/)?.[1] ?? '')
  const extras    = secondary ? secondary.split(',').filter(Boolean) as Role[] : []
  return [primary, ...extras].filter(Boolean) as Role[]
}

function navItemsForRole(role: Role, t: (k: Parameters<ReturnType<typeof useLanguage>["t"]>[0]) => string): NavItem[] {
  switch (role) {
    case 'admin':
      return [
        { href: '/screen4',     label: t('navDashboard'),  icon: Icons.dashboard  },
        { href: '/routes',      label: t('navRoutes'),      icon: Icons.routes     },
        { href: '/complaints',  label: t('navComplaints'),  icon: Icons.complaint  },
        { href: '/pricing',     label: t('navPricing'),     icon: Icons.pricing    },
        { href: '/compliments', label: t('navCompliments'), icon: Icons.compliment },
        { href: '/cash',        label: t('navCash'),        icon: Icons.cash       },
        { href: '/screen5',     label: t('navAdmin'),       icon: Icons.admin      },
      ]
    case 'sales':
      return [
        { href: '/complaints',  label: t('navComplaints'),  icon: Icons.complaint  },
        { href: '/visits',      label: t('navVisits'),      icon: Icons.visit      },
        { href: '/pricing',     label: t('navPricing'),     icon: Icons.pricing    },
        { href: '/compliments', label: t('navCompliments'), icon: Icons.compliment },
        { href: '/routes',      label: t('navRoutes'),      icon: Icons.routes,    badge: 'Desktop' },
        { href: '/runs',        label: t('navRuns'),        icon: Icons.runs       },
      ]
    case 'office':
      return [
        { href: '/screen1',     label: t('navDispatch'),    icon: Icons.dispatch   },
        { href: '/complaints',  label: t('navComplaints'),  icon: Icons.complaint  },
        { href: '/pricing',     label: t('navPricing'),     icon: Icons.pricing    },
        { href: '/compliments', label: t('navCompliments'), icon: Icons.compliment },
        { href: '/cash',        label: t('navCash'),        icon: Icons.cash       },
        { href: '/routes',      label: t('navRoutes'),      icon: Icons.routes,    badge: 'Desktop' },
        { href: '/runs',        label: t('navRuns'),        icon: Icons.runs       },
      ]
    case 'warehouse':
      return [
        { href: '/screen1',     label: t('navDispatch'),    icon: Icons.dispatch   },
        { href: '/complaints',  label: t('navComplaints'),  icon: Icons.complaint  },
        { href: '/compliments', label: t('navCompliments'), icon: Icons.compliment },
        { href: '/routes',      label: t('navRoutes'),      icon: Icons.routes,    badge: 'Desktop' },
        { href: '/runs',        label: t('navRuns'),        icon: Icons.runs       },
      ]
    case 'driver':
      return [
        { href: '/driver',      label: 'My Route',    icon: Icons.routes     },
        { href: '/complaints',  label: 'Complaints',  icon: Icons.complaint  },
        { href: '/compliments', label: 'Kudos',       icon: Icons.compliment },
      ]
    default:
      return []
  }
}

export default function RoleNav() {
  const { t } = useLanguage()
  const [items, setItems] = useState<NavItem[]>([])

  useEffect(() => {
    const roles = getClientRoles()

    // Admin short-circuits — already has everything
    if (roles.includes('admin' as Role)) {
      setItems(navItemsForRole('admin', t))
      return
    }

    // Build union of all role nav items, deduped by href (first occurrence wins)
    const seen   = new Set<string>()
    const merged: NavItem[] = []
    for (const role of roles) {
      for (const item of navItemsForRole(role, t)) {
        if (!seen.has(item.href)) {
          seen.add(item.href)
          merged.push(item)
        }
      }
    }
    setItems(merged)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return <BottomNav items={items} />
}
