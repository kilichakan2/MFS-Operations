/**
 * tests/e2e/_auth.ts
 *
 * Shared auth helper for the order-pipeline E2E specs.
 *
 * Real UI flow (discovered by ANVIL E2E Layer 4):
 *   1. /login renders the mode selector ('Team' or 'Admin')
 *   2. Click "Team login"  →  goes straight to a USER picker (not a
 *      role picker). Each user button is rendered with their initial,
 *      name, and role label in one combined accessible name, e.g.
 *      "A ANVIL-TEST-sales Sales", "M Mehmet Sales", "E Emre Office".
 *   3. Click a user button  →  PIN keypad appears
 *   4. Tap each digit on the on-screen keypad
 *   5. Correct PIN  →  redirected to role's home page
 *
 * The earlier helper assumed step 2 was a role picker. It's not —
 * users are listed directly with their role as a label, so we click
 * the user button by name (matching the E2E_USER_<role> env var) in
 * one step and skip the role-click entirely.
 *
 * Butcher login is intentionally NOT covered here — butchers use the
 * KDS PIN modal at /kds, not the team-login flow. See
 * kds-butcher-flow.spec.ts for that path.
 */

import type { Page } from '@playwright/test'

const PIN_BY_ROLE: Record<string, string> = {
  admin:     process.env.E2E_PIN_ADMIN     ?? '',
  sales:     process.env.E2E_PIN_SALES     ?? '',
  office:    process.env.E2E_PIN_OFFICE    ?? '',
  warehouse: process.env.E2E_PIN_WAREHOUSE ?? '',
  butcher:   process.env.E2E_PIN_BUTCHER   ?? '',
  driver:    process.env.E2E_PIN_DRIVER    ?? '',
}

const ROLE_USERS: Record<string, string | undefined> = {
  admin:     process.env.E2E_USER_ADMIN,
  sales:     process.env.E2E_USER_SALES,
  office:    process.env.E2E_USER_OFFICE,
  warehouse: process.env.E2E_USER_WAREHOUSE,
  butcher:   process.env.E2E_USER_BUTCHER,
  driver:    process.env.E2E_USER_DRIVER,
}

export async function loginAs(page: Page, role: keyof typeof PIN_BY_ROLE): Promise<void> {
  const pin  = PIN_BY_ROLE[role]
  const user = ROLE_USERS[role]

  if (!pin) {
    throw new Error(
      `Missing E2E_PIN_${role.toUpperCase()} env var. ` +
      `Set in .env.e2e.local (gitignored) with a PIN for the ${role} test user.`,
    )
  }
  if (!user && role !== 'admin') {
    throw new Error(
      `Missing E2E_USER_${role.toUpperCase()} env var. ` +
      `The login page lists users directly — we need to know which one.`,
    )
  }

  await page.goto('/login')

  if (role === 'admin') {
    // Admin path — single password field, not PIN
    await page.getByRole('button', { name: /admin/i }).click()
    await page.getByLabel(/password|pin/i).fill(pin)
    await page.getByRole('button', { name: /sign in|login|enter/i }).click()
  } else {
    // Team path — click "Team login" → user picker
    await page.getByRole('button', { name: /team/i }).click()
    // Each user button's accessible name includes the user name as
    // a substring, e.g. "A ANVIL-TEST-sales Sales". Match on the user
    // name; regex-escape it to be safe with special chars.
    const escaped = user!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    await page.getByRole('button', { name: new RegExp(escaped, 'i') }).click()
    // PIN keypad — each digit button has accessible name "Digit N"
    // (not just the digit itself). Verified by Playwright snapshot.
    for (const digit of pin) {
      await page.getByRole('button', { name: `Digit ${digit}`, exact: true }).click()
    }
  }

  // Wait for any of the expected post-login routes — login completes
  // when middleware redirects us away from /login.
  await page.waitForURL(/\/(screen\d|orders|haccp|complaints|visits|pricing|driver|kds|home|dispatch|dashboard|admin|map|$)/, {
    timeout: 10_000,
  })
}

/**
 * Admin login uses the password flow, not PIN.
 *
 * Admins authenticate via password_hash per the users_auth_check DB
 * constraint (admin → password_hash NOT NULL, non-admin → pin_hash
 * NOT NULL). The /login page has a mode selector that routes admin
 * to a username+password form (app/login/page.tsx AdminLogin).
 *
 * Flow:
 *   1. /login → click "Admin login" button → AdminLogin screen
 *   2. Fill username + password inputs
 *   3. Click "Sign in"
 *   4. Wait for redirect to admin home (/dashboard/admin by ROLE_HOME)
 *
 * Caller must provide both user and password — derive from
 * E2E_USER_ADMIN and E2E_PASSWORD_ADMIN env vars at the call site
 * so a MISSING_CREDS failure surfaces with the env name in the
 * error message (rather than a silent null deref here).
 */
export async function loginAsAdmin(page: Page, user: string, password: string): Promise<void> {
  if (!user || !password) {
    throw new Error(
      'loginAsAdmin requires non-empty user + password. ' +
      'Set E2E_USER_ADMIN and E2E_PASSWORD_ADMIN in .env.e2e.local.',
    )
  }

  await page.goto('/login')

  // Mode selector — pick admin path
  await page.getByRole('button', { name: /admin login/i }).click()

  // AdminLogin form — two text inputs (username, password) + Sign in
  // Use autocomplete attributes for stable selectors per app/login/page.tsx.
  await page.locator('input[autocomplete="username"]').fill(user)
  await page.locator('input[autocomplete="current-password"]').fill(password)
  await page.getByRole('button', { name: /sign in/i }).click()

  // Admin's role-home is /dashboard/admin (per middleware ROLE_HOME map)
  await page.waitForURL(/\/(screen\d|orders|dashboard|home|$)/, {
    timeout: 10_000,
  })
}

/**
 * Helper to sign out, useful between tests in the same file.
 */
export async function logout(page: Page): Promise<void> {
  // Clear all cookies — simpler than driving the UI
  await page.context().clearCookies()
}
