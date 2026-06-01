# ANVIL — Run Prompts

Copy-paste-ready prompts for executing each ANVIL test layer on your Mac via Claude Code. Run in order. Paste results back to me when each layer completes.

---

## Prerequisites (one-time, do once before any layer)

```bash
# 1. Pull the ANVIL branch (will be created in the next step)
git fetch origin
git checkout anvil/order-pipeline

# 2. Install missing dependencies
npm install
npm install -D dotenv

# 3. Initialise Supabase local environment
supabase init  # if not already initialised
supabase start

# 4. Apply the order-pipeline migration to local Supabase
# (Supabase CLI auto-runs everything in supabase/migrations/)
supabase db reset

# 5. Verify Playwright browsers are installed
npx playwright install chromium
```

Once `supabase start` completes, copy the **service_role key** it prints and create `.env.test.local`:

```
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=<service_role key from supabase start output>
INTEGRATION_BASE_URL=http://localhost:3000
```

And `.env.e2e.local` with real PINs from your live DB (NOT committed):

```
BASE_URL=http://localhost:3000
E2E_PIN_SALES=<real PIN for Mehmet or Omer>
E2E_PIN_OFFICE=<real PIN for Emre>
E2E_PIN_BUTCHER=<real PIN for Adeel>
E2E_PIN_ADMIN=0505
E2E_USER_SALES=Mehmet
E2E_USER_OFFICE=Emre
E2E_USER_BUTCHER=Adeel
```

Then start the dev server in a dedicated terminal:

```bash
npm run dev
```

Leave it running. All test layers below assume both Supabase local and `npm run dev` are up.

---

## Layer 1 — Unit tests (already passing on the branch)

Already green when committed. Confirm:

```bash
npm run test 2>&1 | tail -5
```

Expected: `1128 passed`. If different, paste the failure back to me.

---

## Layer 2 — pgTAP database tests

```bash
supabase test db
```

Expected: 6 test files, ~66 assertions total, all passing.

**If you get a "supabase command not found" error**, install the CLI:

```bash
brew install supabase/tap/supabase
```

**If you get a "permission denied" error on `set_session_role`**, your local Supabase doesn't have the `authenticated` role configured. Run:

```bash
psql postgresql://postgres:postgres@localhost:54322/postgres -c "CREATE ROLE authenticated;" 2>/dev/null || true
psql postgresql://postgres:postgres@localhost:54322/postgres -c "GRANT authenticated TO postgres;"
supabase test db
```

**Paste back:** the full output, or at minimum the summary line (e.g. `# All 66 tests passed.`) plus any failed-test detail.

---

## Layer 3 — Integration tests (Vitest, against running dev server)

In one terminal: `npm run dev` (left running from prerequisites).
In another terminal:

```bash
npm run test:integration 2>&1 | tail -40
```

Expected: 3 test files, ~25 tests, all passing.

**Common issues:**

- `ECONNREFUSED 127.0.0.1:3000` → dev server isn't running. Start it with `npm run dev`.
- `Supabase: connection refused` → Supabase local isn't running. Run `supabase start`.
- `SUPABASE_SERVICE_ROLE_KEY must be set` → `.env.test.local` is missing or in the wrong directory. Confirm it's in the repo root.
- `Integration tests must NOT run against the production project` → the safety guard fired. Confirm `NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321` in `.env.test.local`.

**Paste back:** the full output including the pass/fail summary and any error stacks.

---

## Layer 4 — Playwright E2E tests

These run against your local dev server. Keep `npm run dev` running.

```bash
npx playwright test --reporter=list 2>&1 | tail -60
```

This will run all three E2E spec files in order:
1. `order-place.spec.ts` — sales rep places an order
2. `picking-list-print.spec.ts` — office prints, state locks
3. `kds-butcher-flow.spec.ts` — butcher PIN + tap Done

Expected: ~8 tests, all passing. Each spec depends on the order created by the previous spec, so they must run sequentially (Playwright does this by default per file).

**Common issues:**

- `Timeout waiting for selector` on the customer picker → no customers in your local DB. Seed at least one: `psql postgresql://postgres:postgres@localhost:54322/postgres -c "INSERT INTO customers (name, active) VALUES ('Test Customer', true);"`
- `Timeout on PIN modal` in the KDS test → no butcher with the PIN you supplied. Verify Adeel's PIN hash matches what you put in `E2E_PIN_BUTCHER`.
- Tests rely on having at least one product. If you've cleaned your local DB, seed: `psql ... -c "INSERT INTO products (name, code, active) VALUES ('Test Product', 'TEST-001', true);"`

**Paste back:** the summary line (e.g. `3 passed (12s)`) and any failed-test stack traces.

---

## After all four layers pass

Paste back:
1. Confirmation that all four layers passed
2. The total time spent
3. Anything surprising or that needed manual fixing along the way

I'll then write the **ANVIL clearance certificate** at `docs/anvil/2026-05-30-order-pipeline-cert.md` and we go to Gate 2 (the ship decision).

---

## If something fails

Don't try to fix it on your end. Paste the failure back to me — I'll diagnose, write a fix, and you re-run. ANVIL allows max 2 iterate loops. If we hit 2 loops without all-green, we stop and triage.

The most likely failures are:
- pgTAP RLS tests — Supabase local often has subtly different role config than production. Easy to patch.
- E2E selector mismatches — my locators are best-guesses without seeing the real UI render. Likely 1-2 will need adjusting.
- Integration test cleanup leaks — the `TEST_PREFIX='ANVIL-TEST-'` guard makes them safe, but if a test crashes mid-way the next run may need a manual `supabase db reset`.

Speak when ready.
