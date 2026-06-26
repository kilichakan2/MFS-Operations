/**
 * tests/e2e/28-f20-pr1-admin-customers-taps.spec.ts
 *
 * F-20 PR1 — ANVIL targeted browser taps (NOT a full admin sweep).
 *
 * Two touched surfaces, proven end-to-end as a logged-in ADMIN on the deployed
 * preview (real Vercel build + real Supabase preview branch):
 *
 *   (a) admin customers screen — the "Customers" tab at /admin renders the list,
 *       and an inline postcode edit round-trips (PATCH /api/admin/customers/[id]
 *       through the re-pointed customersService + geocoder ports).
 *
 *   (b) the geocode-all NEW recipe — GET /api/admin/geocode-all as the logged-in
 *       admin (NO ?secret query param) returns 200 with the byte-identical summary
 *       shape. This proves the R1 guard swap works end-to-end: middleware stamps
 *       x-mfs-user-* on /api/admin/geocode-all (SHARED_API_PATHS) → requireRole
 *       admin passes → 200. The operator's new browser-based recipe works.
 *
 * Tagged @critical so it runs in the preview smoke set. Auth: the password-based
 * loginAsAdmin helper (admins use password, not PIN). The page.request cookie
 * rides the authenticated session, so the API call carries the admin identity.
 */
import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './_auth'

const ADMIN_USER = process.env.E2E_USER_ADMIN ?? ''
const ADMIN_PWD  = process.env.E2E_PASSWORD_ADMIN ?? ''

test.describe('@critical F-20 PR1 admin customers + geocode-all (touched surfaces)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page, ADMIN_USER, ADMIN_PWD)
  })

  test('@critical admin customers tab renders the list and a postcode edit round-trips', async ({ page }) => {
    await page.goto('/admin')

    // Open the Customers tab. It renders as role="tab" (app/admin/page.tsx
    // line 1320: <button role="tab" …>), not a plain button.
    await page.getByRole('tab', { name: 'Customers', exact: true }).click()

    // The list renders ≥1 customer row (data-dependent: assert it is populated,
    // not an empty frame). The seeded preview DB has ANVIL-TEST customers.
    const rows = page.getByText(/ANVIL-TEST/i)
    await expect(rows.first()).toBeVisible({ timeout: 10_000 })

    // Round-trip a postcode edit via the API the screen drives (PATCH
    // /api/admin/customers/[id]) — find a seeded customer, set a known-good
    // postcode, assert the re-pointed route returns the byte-identical shape.
    const list = await page.request.get('/api/admin/customers')
    expect(list.ok()).toBe(true)
    const customers = await list.json() as Array<{ id: string; name: string }>
    expect(Array.isArray(customers)).toBe(true)
    expect(customers.length).toBeGreaterThan(0)

    const target = customers.find(c => /ANVIL-TEST/i.test(c.name)) ?? customers[0]
    const patch = await page.request.patch(`/api/admin/customers/${target.id}`, {
      data: { postcode: 'S3 8DG' },
    })
    expect(patch.ok()).toBe(true)
    const body = await patch.json()

    // Byte-identical shape: the 7 presentation keys + the underscore flags.
    expect(body.id).toBe(target.id)
    expect(body.postcode).toBe('S3 8DG')
    expect(body).toHaveProperty('lat')
    expect(body).toHaveProperty('lng')
    expect(body).toHaveProperty('active')
    expect(body).toHaveProperty('created_at')
    expect(typeof body._geocoded).toBe('boolean')
    expect(typeof body._approximate).toBe('boolean')
    // S3 8DG is a real Sheffield postcode → should geocode exactly (not approx),
    // so coords are populated and no _warning. (If postcodes.io is down the route
    // still returns 200 with _warning — that path is unit-covered; here we expect
    // the happy path on a live exact postcode.)
    expect(body._geocoded).toBe(true)
    expect(body._approximate).toBe(false)
    expect(body.lat).not.toBeNull()
    expect(body.lng).not.toBeNull()
  })

  test('@critical geocode-all NEW recipe — logged-in admin (no ?secret) returns 200 + summary shape', async ({ page }) => {
    // The new operator recipe: hit the route as a logged-in admin in the browser.
    // The session cookie rides on page.request; middleware stamps the identity
    // headers, requireRole(['admin']) passes. NO ?secret query param.
    const res = await page.request.get('/api/admin/geocode-all')
    expect(res.status()).toBe(200)
    const body = await res.json()

    // Byte-identical summary shape — either the 'Nothing to geocode.' early shape
    // or the full 'Geocoding complete.' shape. Both carry message + the counters.
    expect(body).toHaveProperty('message')
    expect(typeof body.message).toBe('string')
    expect(body).toHaveProperty('geocoded')
    expect(body).toHaveProperty('approximate')
    expect(body).toHaveProperty('failed')
    expect(body).toHaveProperty('failed_list')
    expect(Array.isArray(body.failed_list)).toBe(true)
    // When there is work to do the full shape also carries total_input.
    if (body.message === 'Geocoding complete.') {
      expect(body).toHaveProperty('total_input')
      expect(typeof body.total_input).toBe('number')
    }
  })
})
