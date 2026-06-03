/**
 * tests/e2e/chrome-matrix.spec.ts
 *
 * ANVIL: comprehensive chrome verification across the
 * role × route × viewport matrix.
 *
 * Two prior PRs (#4 Item 3, #5 hotfix) shipped chrome bugs
 * because Playwright coverage was a single route (/orders).
 * This spec runs the full chrome integrity check on every
 * chrome-bearing route, for every role, at both desktop
 * (1440×900) and mobile (375×812).
 *
 * Total: 33 role × route combos × 2 viewports = 66 scenarios.
 *
 * Clearance criteria — all must pass per scenario:
 *
 *   Desktop (1440×900):
 *     C1: visible <header> bounding box has x === 0 AND width >= 1440
 *     C2: DesktopSidebar bounding box: x === 0, y === 64, width === 64,
 *         height >= viewport.height - 64
 *     C3: first page-content child of body has left >= 64 (no overlap)
 *     C4: body.paddingLeft === "64px"
 *     C5: body has data-mfs-chrome="true"
 *
 *   Mobile (375×812):
 *     C6: mobile <header> bounding box: x === 0, width === 375
 *     C7: BottomNav at bottom (y + height === 812 ± 1)
 *     C8: DesktopSidebar not in DOM (or display:none)
 *     C9: body.paddingLeft === "0px"
 *
 * Missing role creds → emit failing test (MISSING_CREDS:<var>),
 * never silently skip.
 */

import { test, expect, Page } from '@playwright/test'
import { loginAs, loginAsAdmin } from './_auth'

type Role = 'sales' | 'office' | 'warehouse' | 'driver' | 'admin'

const ROLE_ROUTES: Record<Role, string[]> = {
  sales:     ['/orders', '/visits', '/complaints', '/pricing', '/compliments', '/routes', '/runs'],
  office:    ['/dispatch', '/cash', '/complaints', '/pricing', '/compliments', '/routes', '/runs', '/dashboard/admin'],
  warehouse: ['/dispatch', '/complaints', '/routes', '/compliments', '/runs', '/dashboard/admin'],
  driver:    ['/driver', '/complaints', '/compliments'],
  admin:     ['/dashboard/admin', '/complaints', '/pricing', '/cash', '/compliments', '/routes', '/runs', '/admin', '/map', '/admin/visits', '/admin/at-risk', '/admin/commitments', '/admin/prospects', '/admin/discrepancies'],
}

function credsFor(role: Role): { user: string | undefined; secret: string | undefined; secretEnv: string } {
  const user = process.env[`E2E_USER_${role.toUpperCase()}`]
  // Admin uses password (per users_auth_check DB constraint); all others use PIN.
  if (role === 'admin') {
    return {
      user,
      secret:    process.env.E2E_PASSWORD_ADMIN,
      secretEnv: 'E2E_PASSWORD_ADMIN',
    }
  }
  return {
    user,
    secret:    process.env[`E2E_PIN_${role.toUpperCase()}`],
    secretEnv: `E2E_PIN_${role.toUpperCase()}`,
  }
}

async function assertCredsOrFail(role: Role): Promise<void> {
  const { user, secret, secretEnv } = credsFor(role)
  if (!user || !secret) {
    throw new Error(
      `MISSING_CREDS: E2E_USER_${role.toUpperCase()} and/or ${secretEnv} ` +
      `not set in .env.e2e.local. Add them so this role can be ANVIL-cleared.`,
    )
  }
}

/**
 * Dispatch login by role — admin uses password flow, all others use PIN.
 * Caller must call assertCredsOrFail(role) first so a missing-env
 * surfaces as MISSING_CREDS rather than a silent helper-internal throw.
 */
async function loginFor(page: Page, role: Role): Promise<void> {
  if (role === 'admin') {
    await loginAsAdmin(page, process.env.E2E_USER_ADMIN!, process.env.E2E_PASSWORD_ADMIN!)
  } else {
    await loginAs(page, role)
  }
}

// ── Desktop clearance (C1-C5) ────────────────────────────────────────────────

async function clearanceDesktop(page: Page, viewportHeight: number): Promise<void> {
  // C1: visible <header> bounding box has x === 0 AND width >= 1440
  const headerBox = await page.evaluate(() => {
    const headers = Array.from(document.querySelectorAll('header'))
    const visible = headers.find(h => h.getBoundingClientRect().width > 0)
    const r = visible?.getBoundingClientRect()
    return r ? { x: r.x, width: r.width } : null
  })
  expect(headerBox, 'C1: visible <header> must exist').not.toBeNull()
  expect(headerBox!.x, 'C1: header.x must be 0 (no top-left cream cut-out)').toBe(0)
  expect(headerBox!.width, 'C1: header.width must >= 1440 (spans viewport)').toBeGreaterThanOrEqual(1440)

  // C2: DesktopSidebar bounding box
  // DesktopSidebar renders as <aside aria-label="Primary navigation">.
  // Narrow the selector to avoid matching <nav aria-label="Main navigation">.
  const sidebarBox = await page.evaluate(() => {
    const aside = document.querySelector('aside[aria-label*="primary navigation" i]') as HTMLElement | null
    const r = aside?.getBoundingClientRect()
    return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null
  })
  expect(sidebarBox, 'C2: DesktopSidebar <aside> must be visible').not.toBeNull()
  expect(sidebarBox!.x, 'C2: sidebar.x must be 0').toBe(0)
  expect(sidebarBox!.y, 'C2: sidebar.y must be 64 (below 64px top bar)').toBe(64)
  expect(sidebarBox!.width, 'C2: sidebar.width must be 64 (collapsed default)').toBe(64)
  expect(sidebarBox!.height, `C2: sidebar.height must >= ${viewportHeight - 64}`).toBeGreaterThanOrEqual(viewportHeight - 64)

  // C3: first page-content child of body has left >= 64
  const contentLeft = await page.evaluate(() => {
    const body = document.body
    // Find first non-chrome content child: skip <header>, <aside>, <nav>, scripts/styles.
    const candidates = Array.from(body.children).filter(el => {
      const tag = el.tagName.toLowerCase()
      if (['header', 'aside', 'nav', 'script', 'style', 'noscript'].includes(tag)) return false
      const rect = el.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    })
    if (candidates.length === 0) return null
    return candidates[0].getBoundingClientRect().left
  })
  expect(contentLeft, 'C3: first page content child must exist').not.toBeNull()
  expect(contentLeft!, 'C3: content.left must >= 64 (no sidebar overlap)').toBeGreaterThanOrEqual(64)

  // C4: body.paddingLeft === "64px"
  const padding = await page.evaluate(() => getComputedStyle(document.body).paddingLeft)
  expect(padding, 'C4: body padding-left must be 64px').toBe('64px')

  // C5: body has data-mfs-chrome="true"
  const attr = await page.evaluate(() => document.body.getAttribute('data-mfs-chrome'))
  expect(attr, 'C5: body must have data-mfs-chrome="true"').toBe('true')

  // C10: top-left corner pixel must be navy (chrome paints there)
  // Catches ancestor overflow:hidden clipping the AppHeader's left
  // overflow even when bounding-box checks (C1) pass. Walks the
  // ancestor chain from elementFromPoint(10, 10) collecting the first
  // non-transparent backgroundColor — the visually-rendered colour
  // at that pixel.
  const topLeftBg = await page.evaluate(() => {
    const el = document.elementFromPoint(10, 10)
    if (!el) return null
    let cur: Element | null = el
    while (cur) {
      const bg = getComputedStyle(cur).backgroundColor
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
        return bg
      }
      cur = cur.parentElement
    }
    return null
  })
  expect(topLeftBg, 'C10: top-left corner element must have a bg color').not.toBeNull()
  // mfs-navy = #16205B = rgb(22, 32, 91)
  expect(topLeftBg, 'C10: top-left corner must be navy (#16205B / rgb(22,32,91))').toBe('rgb(22, 32, 91)')
}

// ── Mobile clearance (C6-C9) ─────────────────────────────────────────────────

async function clearanceMobile(page: Page, viewportHeight: number): Promise<void> {
  // C6: mobile <header> bounding box: x === 0, width === 375
  const headerBox = await page.evaluate(() => {
    const headers = Array.from(document.querySelectorAll('header'))
    const visible = headers.find(h => h.getBoundingClientRect().width > 0)
    const r = visible?.getBoundingClientRect()
    return r ? { x: r.x, width: r.width } : null
  })
  expect(headerBox, 'C6: visible <header> must exist').not.toBeNull()
  expect(headerBox!.x, 'C6: mobile header.x must be 0').toBe(0)
  expect(headerBox!.width, 'C6: mobile header.width must be 375').toBe(375)

  // C7: BottomNav at bottom — boundingBox.y + height === viewportHeight ± 1
  // BottomNav renders as <nav aria-label="Main navigation"> per RoleNav.tsx.
  const bottomNavBottom = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label*="main navigation" i]') as HTMLElement | null
    if (!nav) return null
    const r = nav.getBoundingClientRect()
    return r.y + r.height
  })
  expect(bottomNavBottom, 'C7: BottomNav must exist on mobile').not.toBeNull()
  expect(bottomNavBottom!, `C7: BottomNav bottom edge must be at viewport bottom (~${viewportHeight})`).toBeGreaterThanOrEqual(viewportHeight - 1)
  expect(bottomNavBottom!, `C7: BottomNav bottom edge must be at viewport bottom (~${viewportHeight})`).toBeLessThanOrEqual(viewportHeight + 1)

  // C8: DesktopSidebar not in DOM OR display:none
  // Narrowed selector — DesktopSidebar is <aside aria-label="Primary navigation">.
  // Without narrowing, this would match the mobile <nav aria-label="Main navigation">
  // BottomNav as if it were the sidebar.
  const sidebarVisible = await page.evaluate(() => {
    const aside = document.querySelector('aside[aria-label*="primary navigation" i]') as HTMLElement | null
    if (!aside) return false
    const style = getComputedStyle(aside)
    return style.display !== 'none' && aside.getBoundingClientRect().width > 0
  })
  expect(sidebarVisible, 'C8: DesktopSidebar must NOT be visible on mobile').toBe(false)

  // C9: body.paddingLeft === "0px"
  const padding = await page.evaluate(() => getComputedStyle(document.body).paddingLeft)
  expect(padding, 'C9: body padding-left must be 0px on mobile').toBe('0px')
}

// ── Spec generation — one test per (role × route × viewport) ─────────────────

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile:  { width: 375,  height: 812 },
}

for (const roleKey of Object.keys(ROLE_ROUTES) as Role[]) {
  const routes = ROLE_ROUTES[roleKey]

  test.describe(`chrome — ${roleKey} role @desktop`, () => {
    test.use({ viewport: VIEWPORTS.desktop })

    for (const route of routes) {
      test(`${route} — desktop chrome integrity (C1-C5)`, async ({ page }) => {
        await assertCredsOrFail(roleKey)
        await loginFor(page, roleKey)
        await page.goto(route, { waitUntil: 'networkidle' })
        // Small settle to let any post-mount data-attribute effects fire.
        await page.waitForTimeout(200)
        await clearanceDesktop(page, VIEWPORTS.desktop.height)
      })
    }
  })

  test.describe(`chrome — ${roleKey} role @mobile`, () => {
    test.use({ viewport: VIEWPORTS.mobile })

    for (const route of routes) {
      test(`${route} — mobile chrome integrity (C6-C9)`, async ({ page }) => {
        await assertCredsOrFail(roleKey)
        await loginFor(page, roleKey)
        await page.goto(route, { waitUntil: 'networkidle' })
        await page.waitForTimeout(200)
        await clearanceMobile(page, VIEWPORTS.mobile.height)
      })
    }
  })
}
