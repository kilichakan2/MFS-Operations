# ANVIL Clearance Certificate — ✅ CLEARED

Date: 2026-06-26
App: MFS-Operations
Branch: feat/f20-pr1-geocoder-customers
PR: #80
Commit: 07dfcc8

> **CLEARED at Lock by the FORGE conductor (2026-06-26).** All four approved rungs
> green, no blockers, no eject candidates, no destructive migration (PITR N/A). The
> W1 behaviour regression found at Guard was fixed (commit 07dfcc8) and is pinned by
> the +2 unit throw-path tests. Cleared to Ship pending Hakan's Gate-4 nod.
> 🗣 In plain English: the engine room ran every test asked for, they all passed, the
> one issue found was fixed and locked down with a test — green light to ship.

## Scope — what this certificate actually covers

| Change / path | Risk tier | Layers required | Layers run |
| --- | --- | --- | --- |
| `app/api/admin/customers/route.ts` (GET re-point) | Medium | Unit + Integration | Unit + live adapter contract + browser tap |
| `app/api/admin/customers/[id]/route.ts` (PATCH re-point + W1 throw-path) | Medium | Unit + Integration | Unit (incl. +2 W1 tests) + live adapter contract + browser tap |
| `app/api/admin/geocode-all/route.ts` (guard swap `?secret`→`requireRole admin`) | Medium-High (R1 operational) | Unit + E2E proof of new recipe | Unit + live browser tap (200, no `?secret`) |
| NEW `Geocoder` port + postcodes.io adapter + Fake + contract | Medium (crosses a seam) | Unit + domain-only fake + contract | Unit (adapter mocked-fetch + Fake-on-contract) |
| EXTENDED `CustomersRepository` port + Supabase/Fake adapters + contract | Medium | Unit + Integration-LIVE | Unit + **live contract on real Supabase (9/9)** |

**Not run under the efficiency dial:** Full E2E suite was run on the preview as the
`@critical` set (73/73). No pgTAP / Deno layers — **n/a, this PR changes no SQL,
no RLS policy, no edge function.** No additional admin-screen sweep was run — the
conductor right-sized rung 4 to the two TOUCHED surfaces only (deliberate, approved).
**Baseline characterisation pass?** No — diff-driven.

🗣 In plain English: this cert covers exactly the three rewired admin routes and the
two new sockets, tested at the depth the conductor approved — not a blanket
"everything was tested." No database layers were touched, so no database tests apply.

## Architecture rung (the change crosses a seam)

- NEW `Geocoder` port has a **domain-only Fake** (`lib/adapters/fake/Geocoder.ts`)
  run against the shared contract (`lib/ports/__contracts__/Geocoder.contract.ts`) —
  green, no vendor import in the domain test.
- The postcodes.io vendor `fetch` appears in exactly one file
  (`lib/adapters/postcodes/Geocoder.ts`); the `no-adapter-imports` lint pin is green
  (no `app/**` adapter import remains).
- Rip-out test (both sockets) holds: swap postcodes.io or Supabase = one new adapter
  + one wiring line.
- 🗣 In plain English: the new "where is this postcode" socket can run on a stand-in,
  proving the real postcodes.io plug is swappable, not welded in.

## Test Results

| Layer | Status | Notes |
| --- | --- | --- |
| Unit (Vitest) | ✅ 2428/2428 passed | +49 vs main baseline 2379; includes the +2 W1 throw-path tests (`admin-customers.route.test.ts`: GeocoderError→save-null-coords+200+_warning; non-GeocoderError→500). `tsc --noEmit` clean. |
| Integration (Vitest, LIVE) | ✅ 9/9 passed | **Deferred CustomersRepository contract on the REAL Supabase adapter** (local stack) — all 5 admin methods proven: `listAllCustomers` (name asc), `listUngeocoded` (postcode-not-null + coords-null), `setActive` (flip + null-on-miss), `setPostcodeAndCoords` (persist + return), `setCoords` (void stamp). `.env.test.local` localhost invariant held. **This was the only surface Guard could not verify — now proven.** |
| Database (pgTAP) | n/a — not required | No schema / RLS / policy change in this PR. |
| Edge Functions (Deno) | n/a — not required | No edge function touched. |
| Local full-stack rung | ✅ Supabase CLI adapter | `db:up` → `db:reset` (clean) → integration run → `db:down`. |
| E2E (Playwright @critical) | ✅ 73/73 passed | On the deployed Vercel preview (`mfs-operations-375hz1ffe…`, commit 07dfcc8). First run hit the known **F-TD-37** shared-preview HACCP flake on `17-haccp-mince-prep` (a screen this PR does NOT touch) — Playwright marked it flaky (72+1). Recovered exactly as predicted: Supabase MCP `reset_branch` (branch `8e6e0451…`) + single re-run → clean **73/73, 0 flaky**. |
| Targeted browser taps | ✅ 2/2 passed | (a) admin Customers tab renders the populated list (ANVIL-TEST rows visible) + a postcode edit (`S3 8DG`) round-trips through the re-pointed ports → byte-identical 7-key shape, `_geocoded:true`, `_approximate:false`, populated lat/lng. (b) **geocode-all NEW recipe** — logged-in admin, NO `?secret` → **200 + byte-identical summary shape** (`message`/`geocoded`/`approximate`/`failed`/`failed_list`). Preview DB-identity probe (4 checks) passed first. New spec: `tests/e2e/28-f20-pr1-admin-customers-taps.spec.ts`. |
| Populated UI smoke | ✅ populated | Customers tab rendered ≥1 row (ANVIL-TEST) + interaction (postcode edit) confirmed — not mount-only. |

## Warnings (non-blocking)

- 🟡 **F-TD-37** shared-preview HACCP E2E flake recurred on the first `@critical`
  run (`17-haccp-mince-prep`, unrelated to this PR). Recovered with one
  `reset_branch` + single re-run → 73/73 clean. Documented standing flake, not a
  regression of this change.
- During the run, one ITERATION on a **broken test (not code):** my new tap spec's
  Customers-tab locator used `getByRole('button')`; the tab renders `role="tab"`
  (app/admin/page.tsx:1320). Fixed the locator (Iteration 1) → green. No code change.

## Real-code bugs / eject candidates

**None.** No 🔴 found. The one W1-style risk (geocoder outage losing an admin's
postcode edit) was already fixed in commit 07dfcc8 and is now pinned by the +2 unit
throw-path tests. R1 (geocode-all guard swap operability) is proven callable the new
way by browser tap (b). No FORGE eject is required.

## Migration

None — this PR is **code-only**. No `supabase/migrations/*.sql` file, no schema
change, no RLS/policy change, no data migration (plan Risk R6 = NONE).
Rollback script: `docs/anvil/2026-06-26-f20-pr1-geocoder-customers-rollback.sql`
(documents that there is NO DB rollback — the parachute is a code revert / Vercel
promote-previous; the service-role singleton is retained as the in-code parachute).
PITR confirmed: **N/A — no destructive op, no data-loss vector.**

## Merge Sequence

No migration step. Standard code-only sequence:
1. (no `supabase db push` — nothing to migrate)
2. Merge PR #80 → Vercel auto-deploys
3. Post-deploy smoke: 3 `@critical` paths against prod (`www.mfsops.com`)
4. If smoke fails → Vercel promote-previous (dpl_A4HsAjMm9nRMJBq9MuPkJYd6UgdC / 135a3da)

Standing ops reminders for the conductor at Lock: merge while ON the feature branch
so `anvil-migration-lock.sh` matches the cert's BARE `Branch:` line; after merge,
confirm PR #80's Supabase preview branch (`8e6e0451…`) auto-deletes (`db:branches`
shows it GONE — "no orphaned branches").

## Manual smoke at merge

**Not required for the touched surfaces** — the two re-pointed customer routes +
the geocode-all guard swap are proven on the real preview env with real seeded data
(populated Customers list ✓, live postcode round-trip ✓, geocode-all 200 new recipe ✓),
and the full `@critical` set is green (73/73). **Gap named honestly:** rung 4 was
deliberately scoped to the two touched surfaces (conductor's right-sizing), NOT an
exhaustive admin-screen click sweep — the other admin tabs (users, products, export,
permissions, audit) were not browser-swept this PR (they are out of scope / unchanged).
A breadth crawl of every admin element was not run; the `@critical` depth set + the two
taps are the breadth proof for the changed surfaces only.
🗣 In plain English: you can merge without hand-clicking the three changed things — they
were proven on a real deployed copy. What was NOT re-clicked is the rest of the admin
panel, which this PR didn't touch.

## Verdict

✅ CLEARED FOR PRODUCTION — all four approved rungs GREEN, no blockers, no eject
candidates, no destructive op (PITR N/A). Locked by the conductor 2026-06-26.
Hakan approved Ship at Gate 4.
