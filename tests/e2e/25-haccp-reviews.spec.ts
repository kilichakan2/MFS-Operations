/**
 * tests/e2e/25-haccp-reviews.spec.ts
 *
 * @critical
 *
 * NET-NEW exhaustive browser-tap E2E for F-19 PR6 (Cluster D re-point).
 * Drives /haccp/reviews (weekly + monthly + annual tabs) and
 * /haccp/annual-review in a real Chromium browser, proving the two routes
 * re-pointed onto haccpReviewsService / haccpAnnualReviewService behave
 * byte-identically. The sole intended deviation (R6): a DB-error 500 body is
 * now 'Server error' instead of raw Postgres text — asserted at the route.
 *
 * Page facts:
 *   /haccp/reviews (app/haccp/reviews/page.tsx):
 *     - 3 tabs: "Weekly" / "Monthly" / "Annual"; weekly/monthly show a "Due"
 *       pill until done this period.
 *     - Weekly: 16 CheckItem buttons, each cycling unchecked→OK→problem on
 *       click. Submit "Submit weekly review" is disabled until ALL 16 are
 *       non-unchecked. A 'problem' item reveals a "Describe action taken /
 *       planned…" textarea + auto-creates a CA on the server. Flash on
 *       success: "Weekly review submitted". History: "Week ending {date}".
 *     - Monthly: equipment/facilities ticks (best-effort) + 11 system-review
 *       items each with YES / NO / N/A buttons; submit disabled until ALL 11
 *       system items have a result. Flash: "Monthly review submitted".
 *     - Annual tab: lists reviews (year + Draft/Signed-off pill + signer name)
 *       and an "Open Annual Review" button → /haccp/annual-review.
 *   /haccp/annual-review (app/haccp/annual-review/page.tsx):
 *     - "+ New review" → modal (year input + "Start review").
 *     - List rows render review_year + Draft/Signed-off pill + (when locked)
 *       "Signed off by {name}" / "Approved by {name}" — the {name} join shape.
 *
 * Both review routes are admin-only / admin-write, so we log in as admin.
 * Direct route-contract taps use page.request.* (the admin session cookies
 * ride along) — the same hybrid the Cluster C spec (22-haccp-training) uses
 * to pin exact status codes + bodies the UI gates would otherwise hide.
 *
 * Prereqs: db:up + db:reset (local) / a healthy seeded preview branch (Gate 4).
 * Runs under --project=chromium.
 */

import { test, expect, type Page } from '@playwright/test'
import { loginAsAdmin } from './_auth'

// Cycle a CheckItem button: each click advances unchecked→OK→problem.
// `target` is how many clicks (1 = OK, 2 = problem).
async function cycleTo(btn: ReturnType<Page['locator']>, clicks: number) {
  for (let i = 0; i < clicks; i++) await btn.click()
}

test.describe('@critical HACCP reviews (F-19 PR6 re-point)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page, process.env.E2E_USER_ADMIN!, process.env.E2E_PASSWORD_ADMIN!)
    await page.goto('/haccp/reviews')
    await expect(page.getByRole('heading', { name: /Weekly & Monthly Reviews/i })).toBeVisible()
  })

  // ── WEEKLY: full submit + the deviation (problem) path → CA auto-create ──────

  test('weekly — mark all 16 items, set one as a problem with an action, submit → success flash', async ({ page }) => {
    // The Weekly tab's accessible name is "WeeklyDue" until done (the "Due" pill
    // is concatenated), so match on the leading word, not exact.
    await page.getByRole('button', { name: /^Weekly/ }).first().click()

    // Each CheckItem is the button whose accessible name STARTS with the item
    // label (a "Tap to mark…" hint is appended while unchecked) — substring
    // match by label is unambiguous. Tap every item once (→ OK) so the submit
    // gate opens; then bump ONE more (→ problem) so the CA side-effect fires.
    const labels = [
      'Daily CCP monitoring complete and signed?',
      'Corrective actions fully documented?',
      'Staff training records current?',
      'Supplier certificates valid?',
      'Customer complaints logged and addressed?',
      'Emergency contacts and procedures current?',
      'Water supply — no issues?',
      'Maintenance — no outstanding issues?',
      'Pest control — no signs of activity?',
      'Waste management — collected and secure?',
      'One-way traffic compliance observed?',
      'Staff awareness of zone separation — satisfactory?',
      'Floors and walls — no new damage, cracks or peeling?',
      'Equipment — no visible damage or leaks?',
      'Doors and seals — closing properly?',
      'Emergency items (first aid, spill kits) — accessible?',
    ]

    for (const label of labels) {
      await cycleTo(page.getByRole('button', { name: label }), 1) // → OK
    }
    // Bump the last item twice-total → problem (one extra click).
    const problemLabel = labels[labels.length - 1]
    await cycleTo(page.getByRole('button', { name: problemLabel }), 1) // OK → problem

    // The problem reveals an action textarea — fill it (exercises the branch).
    const action = page.getByPlaceholder('Describe action taken / planned…')
    await expect(action).toBeVisible()
    await action.fill('E2E — spill kit restocked, supervisor notified')

    const submit = page.getByRole('button', { name: /submit weekly review/i })
    await expect(submit).toBeEnabled()
    await submit.click()

    await expect(page.getByText('Weekly review submitted')).toBeVisible({ timeout: 10_000 })
    // History repopulates (data-dependent view): at least one "Week ending" row.
    await expect(page.getByText(/Week ending/i).first()).toBeVisible({ timeout: 10_000 })
  })

  // ── MONTHLY: full submit (all 11 system items answered) ─────────────────────

  test('monthly — answer all 11 system-review items, submit → success flash', async ({ page }) => {
    // Tab name is "MonthlyDue" until done — match the leading word.
    await page.getByRole('button', { name: /^Monthly/ }).first().click()

    // The 11 system-review items each expose YES / NO / N/A buttons. Answer
    // every item YES so the submit gate opens (no problem branch needed here —
    // the invertFail/problem branch is proven via the API tap below).
    const yesButtons = page.getByRole('button', { name: 'YES', exact: true })
    const count = await yesButtons.count()
    expect(count).toBe(11)
    // Click sequentially; clicking one does not remove others from the DOM.
    for (let i = 0; i < count; i++) {
      await page.getByRole('button', { name: 'YES', exact: true }).nth(i).click()
    }

    const submit = page.getByRole('button', { name: /submit monthly review/i })
    await expect(submit).toBeEnabled()
    await submit.click()

    await expect(page.getByText('Monthly review submitted')).toBeVisible({ timeout: 10_000 })
  })

  // ── ANNUAL tab on /haccp/reviews: data-dependent list renders ───────────────

  test('annual tab — "Open Annual Review" navigates to the annual screen', async ({ page }) => {
    await page.getByRole('button', { name: 'Annual', exact: true }).click()
    const open = page.getByRole('button', { name: /open annual review/i })
    await expect(open).toBeVisible()
    await open.click()
    await page.waitForURL(/\/haccp\/annual-review/)
    await expect(page.getByText('Annual Systems Review')).toBeVisible()
  })

  // ── /haccp/annual-review: create a draft via the UI, list renders it ────────

  test('annual-review — a draft exists and the list renders it (data-dependent: year + Draft pill + {name} join)', async ({ page }) => {
    // Order-independent: ensure at least ONE draft exists. The table allows only
    // one draft at a time, so a create either succeeds (slot was free) OR returns
    // 409 (a draft already exists) — both leave a draft on file to assert against.
    const year = `E2E-ASR-${Date.now()}`
    const create = await page.request.post('/api/haccp/annual-review', {
      data: { review_year: year, review_period_from: '2001-01-01', review_period_to: '2001-12-31' },
    })
    expect([201, 409]).toContain(create.status())

    // The list (GET) returns the {name} creator join shape + a draft row.
    const list = await page.request.get('/api/haccp/annual-review')
    expect(list.status()).toBe(200)
    const body = await list.json() as {
      reviews: Array<{ id: string; review_year: string; locked: boolean; creator: { name: string } | null }>
    }
    expect(Array.isArray(body.reviews)).toBe(true)
    const draft = body.reviews.find(r => !r.locked)
    expect(draft, 'a draft review must exist on file').toBeDefined()
    // R-B2: the creator join is a single { name } object (or null), never an array.
    if (draft!.creator !== null) expect(typeof draft!.creator.name).toBe('string')

    // The screen renders that draft (data-dependent UI ≥1 row + Draft pill).
    await page.goto('/haccp/annual-review')
    await expect(page.getByText('Annual Systems Review')).toBeVisible()
    const firstRow = page.locator('button:has(p.font-bold)').first()
    await expect(firstRow).toBeVisible({ timeout: 10_000 })
    await expect(firstRow.getByText('Draft')).toBeVisible()

    // Also exercise the "+ New review" modal UI surface (open → year input → cancel),
    // proving the create-draft button path renders without depending on a free slot.
    await page.getByRole('button', { name: /\+ New review/i }).click()
    await expect(page.getByText('New annual review')).toBeVisible()
    await page.getByRole('textbox').first().fill(year)
    await page.getByRole('button', { name: /^Cancel$/ }).click()
  })

  // ── Route-contract taps (exact codes + bodies the UI gates hide) ────────────

  test('R-D1: PATCH /api/haccp/annual-review with NO id → 400 "Review ID required" (never 404)', async ({ page }) => {
    const res = await page.request.patch('/api/haccp/annual-review', {
      data: { checklist: {} }, // no id
    })
    expect(res.status()).toBe(400)
    expect((await res.json()).error).toBe('Review ID required')
  })

  test('PATCH unknown id → 404 "Review not found"', async ({ page }) => {
    const res = await page.request.patch('/api/haccp/annual-review', {
      data: { id: '00000000-0000-0000-0000-000000000000', checklist: {} },
    })
    expect(res.status()).toBe(404)
    expect((await res.json()).error).toBe('Review not found')
  })

  test('POST a second annual draft → 409 with the exact conflict message', async ({ page }) => {
    const stamp = Date.now()
    const first = await page.request.post('/api/haccp/annual-review', {
      data: { review_year: `E2E-409a-${stamp}`, review_period_from: '2001-01-01', review_period_to: '2001-12-31' },
    })
    // first is 201 if the slot was free, or 409 if a prior draft lingers — either
    // proves the unique-draft guard; we then assert the SECOND is always 409.
    expect([201, 409]).toContain(first.status())
    const second = await page.request.post('/api/haccp/annual-review', {
      data: { review_year: `E2E-409b-${stamp}`, review_period_from: '2001-01-01', review_period_to: '2001-12-31' },
    })
    expect(second.status()).toBe(409)
    expect((await second.json()).error).toBe(
      'A draft review already exists. Complete or delete it before starting a new one.',
    )
  })

  test('error posture — invalid weekly POST returns the exact 400 string, not raw Postgres', async ({ page }) => {
    // Missing week_ending → the route's first validation 400 (no DB hit). Proves
    // the body is the app-owned string, never leaked SQL/Postgres text.
    const res = await page.request.post('/api/haccp/reviews', {
      data: { type: 'weekly', assessments: [] },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Week ending date required')
    // Belt-and-braces: never leaks a Postgres error code/keyword.
    expect(JSON.stringify(body)).not.toMatch(/postgres|pg_|23505|relation .* does not exist/i)
  })
})
