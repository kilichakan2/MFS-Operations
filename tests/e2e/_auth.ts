/**
 * tests/e2e/_auth.ts
 *
 * Shared auth helper for the order-pipeline E2E specs.
 *
 * The login flow is:
 *   1. /login renders the mode selector ('Team' or 'Admin')
 *   2. Team button → role picker (Sales/Office/Warehouse/Butcher/Driver)
 *   3. Role → user name list
 *   4. Pick user → PIN keypad
 *   5. Correct PIN → redirected to role's home page
 *
 * Test PINs are passed via env vars to avoid baking secrets into the
 * repo. Each spec file imports loginAs(page, role) and gets a
 * logged-in page back.
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
      `Set in .env.e2e.local (gitignored) with a real PIN for the ${role} test user.`,
    )
  }

  await page.goto('/login')

  if (role === 'admin') {
    // Admin path
    await page.getByRole('button', { name: /admin/i }).click()
    await page.getByLabel(/password|pin/i).fill(pin)
    await page.getByRole('button', { name: /sign in|login|enter/i }).click()
  } else {
    // Team path
    await page.getByRole('button', { name: /team/i }).click()
    // Role buttons live in the team grid
    await page.getByRole('button', { name: new RegExp(`^${role}$`, 'i') }).click()
    // User name list
    if (user) {
      await page.getByRole('button', { name: new RegExp(user, 'i') }).click()
    } else {
      // No specific user named — pick the first available
      await page.locator('button').filter({ hasText: /^[A-Z][a-z]+$/ }).first().click()
    }
    // PIN keypad
    for (const digit of pin) {
      await page.getByRole('button', { name: digit }).click()
    }
  }

  // Wait for any of the expected post-login routes
  await page.waitForURL(/\/(screen\d|orders|haccp|home|$)/, { timeout: 10_000 })
}

/**
 * Helper to sign out, useful between tests in the same file.
 */
export async function logout(page: Page): Promise<void> {
  // Clear all cookies — simpler than driving the UI
  await page.context().clearCookies()
}
