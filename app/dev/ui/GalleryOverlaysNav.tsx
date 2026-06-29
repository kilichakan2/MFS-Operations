'use client'

import { useState, type ReactNode } from 'react'
import {
  Modal,
  Banner,
  Spinner,
  EmptyState,
  Popover,
  DropdownMenu,
  AppHeader,
  BottomNav,
  MoreDrawer,
  DesktopSidebar,
  NavItem,
  Button,
  SyncDot,
} from '@/components/ui'

// ── Small inline demo icons (caller-supplied ReactNode; no icon library) ──────
const HomeIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" />
  </svg>
)
const BoxIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" /><path d="m3 8 9 5 9-5M12 13v8" />
  </svg>
)
const UsersIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M16 21v-2a4 4 0 0 0-8 0v2" /><circle cx="12" cy="7" r="4" />
  </svg>
)
const InfoIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
  </svg>
)
const SearchIcon = (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
  </svg>
)
const GlobeIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20" />
  </svg>
)
const LogoutIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
  </svg>
)

// Inline placeholder logo (the real brand SVG is hung by callers via the slot).
const DemoLogo = (
  <span className="inline-flex items-center gap-2">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="text-action-primary">
      <path d="m12 2 2.9 6.3L22 9.3l-5 4.7 1.2 6.9L12 17.6 5.8 20.9 7 14 2 9.3l7.1-1z" />
    </svg>
    <span className="text-inverse font-semibold text-body-sm">MFS</span>
  </span>
)

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-6">
      <div className="mb-3 font-text text-[10.5px] font-semibold uppercase tracking-[0.13em] text-subtle">
        {title}
      </div>
      {children}
    </div>
  )
}

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Home', icon: HomeIcon },
  { href: '/orders', label: 'Orders', icon: BoxIcon },
  { href: '/users', label: 'Users', icon: UsersIcon },
]

const OVERFLOW_ITEMS = [
  { href: '/products', label: 'Products', icon: BoxIcon },
  { href: '/insights', label: 'Insights', icon: InfoIcon },
  { href: '/admin', label: 'Admin', icon: UsersIcon, desktopOnly: true },
]

/** All Wave-3 overlay + nav components in every state. Rendered inside each panel. */
export function GalleryOverlaysNav() {
  const [centerOpen, setCenterOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)

  return (
    <div>
      <div className="mb-4 mt-2 font-text text-[12px] font-semibold uppercase tracking-[0.2em] text-action-primary">
        Wave 3 · Overlays + Nav
      </div>

      <Group title="Modal · center + sheet variants">
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => setCenterOpen(true)}>Open centred modal</Button>
          <Button variant="secondary" onClick={() => setSheetOpen(true)}>
            Open bottom sheet
          </Button>
        </div>
        <Modal
          open={centerOpen}
          onOpenChange={setCenterOpen}
          title="Confirm action"
          description="This is a centred desktop-style dialog."
        >
          <p className="text-body-sm text-muted">
            Body content goes here. Press ESC, the backdrop, or the close button.
          </p>
        </Modal>
        <Modal open={sheetOpen} onOpenChange={setSheetOpen} variant="sheet" title="Bottom sheet">
          <p className="text-body-sm text-muted">
            The same engine, mounted as a mobile bottom-sheet.
          </p>
        </Modal>
      </Group>

      <Group title="Banner · per tone">
        <div className="flex flex-col gap-3">
          <Banner tone="neutral" icon={InfoIcon}>A neutral note.</Banner>
          <Banner tone="info" icon={InfoIcon} title="Heads up">Informational message.</Banner>
          <Banner tone="success" icon={InfoIcon}>Saved successfully.</Banner>
          <Banner tone="warning" icon={InfoIcon}>This needs a visit soon.</Banner>
          <Banner tone="danger" icon={InfoIcon} onDismiss={() => {}}>
            Something went wrong — dismissable.
          </Banner>
        </div>
      </Group>

      <Group title="Spinner · all sizes">
        <div className="flex items-center gap-6 text-action-primary">
          <Spinner size="sm" />
          <Spinner size="md" />
          <Spinner size="lg" />
        </div>
      </Group>

      <Group title="EmptyState">
        <EmptyState
          icon={SearchIcon}
          title="No results"
          message="Try a different search or date range."
          action={<Button variant="secondary">Reset filters</Button>}
        />
      </Group>

      <Group title="Popover">
        <Popover trigger={<Button variant="ghost">Open popover</Button>} aria-label="Demo panel">
          <div className="px-3 py-2 text-body-sm text-body">A small floating panel.</div>
        </Popover>
      </Group>

      <Group title="DropdownMenu">
        <DropdownMenu
          aria-label="Account menu"
          trigger={<Button variant="ghost">Open menu</Button>}
          items={[
            { id: 'lang', label: 'Language', icon: GlobeIcon, onSelect: () => {} },
            { id: 'profile', label: 'Profile (disabled)', icon: UsersIcon, disabled: true },
            { id: 'sep', separator: true },
            { id: 'logout', label: 'Log out', icon: LogoutIcon, tone: 'danger', onSelect: () => {} },
          ]}
        />
      </Group>

      <Group title="NavItem · three orientations">
        <div className="flex flex-col gap-4">
          <div className="flex gap-4">
            <NavItem href={'/dashboard' as never} icon={HomeIcon} label="Home" active orientation="vertical" />
            <NavItem href={'/orders' as never} icon={BoxIcon} label="Orders" orientation="vertical" />
          </div>
          <div className="bg-surface-inverse rounded-lg w-56 py-2">
            <NavItem href={'/dashboard' as never} icon={HomeIcon} label="Home" active orientation="rail" onInverse />
            <NavItem href={'/orders' as never} icon={BoxIcon} label="Orders" orientation="rail" onInverse />
          </div>
          <div className="w-72">
            <NavItem href={'/admin' as never} icon={UsersIcon} label="Admin" orientation="list" />
          </div>
        </div>
      </Group>

      <Group title="BottomNav · static (More opens the drawer)">
        <div className="relative h-20">
          <BottomNav
            items={NAV_ITEMS}
            activeHref="/orders"
            onOpenMore={() => setMoreOpen(true)}
          />
        </div>
        <MoreDrawer open={moreOpen} onClose={() => setMoreOpen(false)} items={OVERFLOW_ITEMS} />
      </Group>

      <Group title="DesktopSidebar · toggle expand">
        <div className="relative h-72">
          <DesktopSidebar
            items={NAV_ITEMS}
            activeHref="/orders"
            expanded={expanded}
            onToggle={() => setExpanded((e) => !e)}
            logo={DemoLogo}
          />
        </div>
      </Group>

      <Group title="AppHeader · slot-driven">
        <AppHeader
          logo={DemoLogo}
          title="Orders"
          sync={<SyncDot state="syncing" />}
          actions={<Button size="sm" variant="ghost">New</Button>}
          menu={
            <DropdownMenu
              aria-label="Account menu"
              trigger={<Button size="sm" variant="ghost">Menu</Button>}
              items={[
                { id: 'lang', label: 'Language', icon: GlobeIcon, onSelect: () => {} },
                { id: 'logout', label: 'Log out', icon: LogoutIcon, tone: 'danger', onSelect: () => {} },
              ]}
            />
          }
        />
      </Group>
    </div>
  )
}
