'use client'

/**
 * components/RoleNav.tsx
 *
 * Reads only the mfs_role cookie and renders that single role's nav.
 * Role picker guarantees sessions are always single-role — no union needed.
 *
 * Nav matrix:
 *   admin     → Dashboard | Routes | Complaints | Pricing | Compliments | Cash | Admin
 *   sales     → Complaints | Visits | Pricing | Compliments | Routes | Runs
 *   office    → Dispatch | Complaints | Pricing | Compliments | Cash | Routes | Runs
 *   warehouse → Dispatch | Complaints | Compliments | Routes | Runs
 *   driver    → My Route | Complaints | Kudos
 */

import { useState, useEffect } from 'react'
import { useLanguage }          from '@/lib/LanguageContext'
import BottomNav, { Icons, type NavItem } from '@/components/BottomNav'

type Role = 'warehouse' | 'office' | 'sales' | 'admin' | 'driver' | ''

function getClientRole(): Role {
  if (typeof document === 'undefined') return ''
  return (document.cookie.match(/(?:^|;\s*)mfs_role=([^;]+)/)?.[1] ?? '') as Role
}

export default function RoleNav() {
  const { t } = useLanguage()
  const [items, setItems] = useState<NavItem[]>([])

  useEffect(() => {
    const role = getClientRole()
    switch (role) {
      case 'admin':
        setItems([
          { href: '/screen4',     label: t('navDashboard'),  icon: Icons.dashboard  },
          { href: '/routes',      label: t('navRoutes'),      icon: Icons.routes     },
          { href: '/complaints',  label: t('navComplaints'),  icon: Icons.complaint  },
          { href: '/pricing',     label: t('navPricing'),     icon: Icons.pricing    },
          { href: '/compliments', label: t('navCompliments'), icon: Icons.compliment },
          { href: '/cash',        label: t('navCash'),        icon: Icons.cash       },
          { href: '/screen5',     label: t('navAdmin'),       icon: Icons.admin      },
        ]); break
      case 'sales':
        setItems([
          { href: '/complaints',  label: t('navComplaints'),  icon: Icons.complaint  },
          { href: '/visits',      label: t('navVisits'),      icon: Icons.visit      },
          { href: '/pricing',     label: t('navPricing'),     icon: Icons.pricing    },
          { href: '/compliments', label: t('navCompliments'), icon: Icons.compliment },
          { href: '/routes',      label: t('navRoutes'),      icon: Icons.routes,    badge: 'Desktop' },
          { href: '/runs',        label: t('navRuns'),        icon: Icons.runs       },
        ]); break
      case 'office':
        setItems([
          { href: '/screen1',     label: t('navDispatch'),    icon: Icons.dispatch   },
          { href: '/complaints',  label: t('navComplaints'),  icon: Icons.complaint  },
          { href: '/pricing',     label: t('navPricing'),     icon: Icons.pricing    },
          { href: '/compliments', label: t('navCompliments'), icon: Icons.compliment },
          { href: '/cash',        label: t('navCash'),        icon: Icons.cash       },
          { href: '/routes',      label: t('navRoutes'),      icon: Icons.routes,    badge: 'Desktop' },
          { href: '/runs',        label: t('navRuns'),        icon: Icons.runs       },
        ]); break
      case 'warehouse':
        setItems([
          { href: '/screen1',     label: t('navDispatch'),    icon: Icons.dispatch   },
          { href: '/complaints',  label: t('navComplaints'),  icon: Icons.complaint  },
          { href: '/compliments', label: t('navCompliments'), icon: Icons.compliment },
          { href: '/routes',      label: t('navRoutes'),      icon: Icons.routes,    badge: 'Desktop' },
          { href: '/runs',        label: t('navRuns'),        icon: Icons.runs       },
        ]); break
      case 'driver':
        setItems([
          { href: '/driver',      label: 'My Route',    icon: Icons.routes     },
          { href: '/complaints',  label: 'Complaints',  icon: Icons.complaint  },
          { href: '/compliments', label: 'Kudos',       icon: Icons.compliment },
        ]); break
      default:
        setItems([]); break
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return <BottomNav items={items} />
}
