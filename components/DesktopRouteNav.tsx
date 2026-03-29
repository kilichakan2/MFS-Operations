'use client'

/**
 * DesktopRouteNav.tsx
 *
 * In-flow (non-fixed) bottom nav for the /routes page on desktop.
 * Sits as the Bottom Bread in the h-screen flex-col sandwich — it 
 * takes its natural height at the bottom without overlapping content.
 *
 * Mobile uses the fixed <RoleNav /> instead (see routes/page.tsx).
 * This component is hidden on mobile via the parent's lg:block wrapper.
 */

import Link            from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect }     from 'react'
import { Icons }       from '@/components/BottomNav'
import type { NavItem } from '@/components/BottomNav'
import { useLanguage } from '@/lib/LanguageContext'

type Role = 'warehouse' | 'office' | 'sales' | 'admin' | 'driver' | ''

function getClientRole(): Role {
  if (typeof document === 'undefined') return ''
  const match = document.cookie.match(/(?:^|;\s*)mfs_role=([^;]+)/)
  return (match?.[1] ?? '') as Role
}

export default function DesktopRouteNav() {
  const pathname = usePathname()
  const { t }   = useLanguage()

  const [items, setItems] = useState<NavItem[]>([])

  useEffect(() => {
    // Runs after mount on client — document.cookie is available.
    // useEffect (not useMemo) guarantees cookie is readable after hydration.
    const role = getClientRole()
    switch (role) {
      case 'admin':
        setItems([
          { href: '/screen4',    label: t('navDashboard'),  icon: Icons.dashboard },
          { href: '/screen6',    label: t('navMap'),        icon: Icons.map       },
          { href: '/complaints', label: t('navComplaints'), icon: Icons.complaint },
          { href: '/routes',     label: t('navRoutes'),     icon: Icons.routes,   badge: 'Desktop' },
          { href: '/runs',       label: t('navRuns'),       icon: Icons.runs     },
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
          { href: '/routes',     label: t('navRoutes'),     icon: Icons.routes,   badge: 'Desktop' },
          { href: '/runs',       label: t('navRuns'),       icon: Icons.runs     },
        ]); break
      case 'warehouse':
        setItems([
          { href: '/screen1', label: t('navDispatch'),   icon: Icons.dispatch  },
          { href: '/routes',  label: t('navRoutes'),     icon: Icons.routes,   badge: 'Desktop' },
          { href: '/runs',    label: t('navRuns'),       icon: Icons.runs     },
        ]); break
      
        
          
          
        
      default:
        setItems([]); break
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (items.length === 0) return null

  return (
    <nav
      className="hidden lg:flex border-t border-[#EDEAE1] bg-white flex-shrink-0"
      aria-label="Main navigation"
    >
      {items.map((item) => {
        const active = pathname === item.href
        return (
          <Link
            key={item.href}
            href={item.href}
            className={[
              'flex-1 flex flex-col items-center justify-center py-1.5 gap-px min-h-[48px]',
              'text-[9px] font-bold tracking-wide uppercase',
              active ? 'text-[#EB6619]' : 'text-gray-500',
            ].join(' ')}
            aria-current={active ? 'page' : undefined}
            style={{ touchAction: 'manipulation' }}
          >
            <span className={['w-5 h-5 flex-shrink-0 pointer-events-none', active ? 'text-[#EB6619]' : 'text-gray-500'].join(' ')}>
              {item.icon}
            </span>
            {item.label}
            {item.badge && (
              <span className="text-[8px] text-gray-400 font-medium normal-case tracking-normal -mt-px">
                {item.badge}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
