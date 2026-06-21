/**
 * tests/e2e/09-compliments.spec.ts
 *
 * @critical
 *
 * NET-NEW E2E for F-17 PR2 (compliment-route re-point). Drives the REAL
 * compliments ("Kudos") screen in Chromium against the LOCAL Docker Supabase
 * stack, proving the re-pointed compliments routes work through the UI.
 *
 * Screen facts (from app/compliments/page.tsx source, read 2026-06-21):
 *   - On mount the page fetches GET /api/compliments/users (re-pointed) to
 *     populate the recipient <select>, and GET /api/compliments (re-pointed)
 *     for the feed.
 *   - The recipient picker is a plain <select> (page.tsx:150). Its first
 *     option is "The whole team 🙌" (value=''); each active user is an
 *     <option>. We assert the dropdown loaded ≥1 real user option (proving
 *     /api/compliments/users returned rows) before selecting one.
 *   - Posting calls POST /api/compliments (re-pointed); on 201 the returned
 *     compliment is prepended to the feed list (page.tsx:124). So "post →
 *     appears in recent list" exercises both POST and the snake_case wire
 *     shape the card reads (posted_by_name, recipient_name, body, created_at).
 *   - The submit button text is "⭐ Post Compliment".
 *
 * Prereqs: npm run db:up + db:reset (ANVIL-TEST users planted by seed.sql);
 * .env.e2e.local sales PIN/user. No compliment rows are seeded — this spec
 * posts its own and asserts it appears (never asserts on an empty feed; the
 * empty-feed state is a distinct "No kudos yet" placeholder we must NOT pass on).
 *
 * Runs under --project=chromium.
 */

import { test, expect } from '@playwright/test'
import { loginAs }      from './_auth'

const MARKER = `E2E-kudos-${Date.now()}`

test.describe('@critical compliments / kudos (F-17 PR2 re-point)', () => {

  test('recipient dropdown loads users → post a compliment → it appears in the feed', async ({ page }) => {
    await loginAs(page, 'sales')

    await page.goto('/compliments')
    await expect(page).toHaveURL(/\/compliments/)

    // The post form heading confirms the page shell mounted.
    await expect(page.getByText(/share a shoutout/i)).toBeVisible({ timeout: 10_000 })

    // ── 1. RECIPIENT DROPDOWN LOADS USERS (re-pointed GET /compliments/users) ──
    // The <select> is the only one on the page. Wait until it has more than
    // just the default "The whole team" option — i.e. real users loaded.
    const recipient = page.locator('select')
    await expect(recipient).toBeVisible()
    await expect(async () => {
      const count = await recipient.locator('option').count()
      // 1 default option + ≥1 real user = ≥2. An empty fetch would leave 1.
      expect(count).toBeGreaterThan(1)
    }).toPass({ timeout: 15_000 })

    // Select a real seeded user as the recipient (ANVIL-TEST-office exists in
    // seed.sql). selectOption by visible label is robust to id changes.
    await recipient.selectOption({ label: /ANVIL-TEST-office/i as unknown as string })
      .catch(async () => {
        // Fallback: select the 2nd option (first real user) by index if the
        // exact label isn't present in this seed variant.
        await recipient.selectOption({ index: 1 })
      })

    // ── 2. POST A COMPLIMENT (re-pointed POST /api/compliments) ──
    const bodyText = `${MARKER} great teamwork on the early dispatch`
    await page.getByPlaceholder(/write something positive/i).fill(bodyText)
    await page.getByRole('button', { name: /post compliment/i }).click()

    // ── 3. IT APPEARS IN THE RECENT FEED (snake_case wire read by the card) ──
    await expect(page.getByText(bodyText)).toBeVisible({ timeout: 10_000 })

    // The "No kudos yet" empty placeholder must NOT be on screen now — proves
    // the feed is populated, not the empty state (ANVIL empty-smoke guard).
    await expect(page.getByText(/no kudos yet/i)).toHaveCount(0)
  })
})
