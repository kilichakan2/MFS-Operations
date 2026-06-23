# ANVIL Failure Record — NOT CLEARED

Date: 2026-06-23
App: MFS-Operations (HACCP module — Cluster B assessments & registers)
Branch: feat/f19-pr3-cluster-b-assessments-registers
PR: #70
Head commit at run: cbf8b4f
Status: ❌ NOT CLEARED — stopped after 2 iterate loops per the ANVIL termination contract.

## One-sentence root-cause hypothesis

The 4 brand-new Cluster B E2E spec files (18–21) are broken at the test layer —
three assert the screen title via `getByRole('heading', …)` when the title is
rendered as a `<p>` (paragraph), and the fourth (allergens "Update") needs a
pre-existing allergen assessment row that nothing seeds and that the page offers
no UI path to create — NONE of which is a bug in the F-19 PR3 source diff, which
every other layer proves correct.

## Scope — what was under test

PURE byte-identical hexagonal refactor: one new `HaccpAssessments` hexagon, 5 HACCP
routes re-pointed onto it. NO migration, NO schema change, NO new dependency, NO UI
change. The 5 page components (allergens, food-defence, food-fraud, product-specs)
are NOT in the diff — they are pre-existing and unchanged.

🗣 In plain English: the change just re-wires which internal "engine" the 5 HACCP
API routes call — the screens and the database are untouched. So a screen that has
"no create-first button" or a title that's a paragraph not a heading is pre-existing
behaviour, not something this PR introduced.

## Per-layer results

| Layer                       | Status        | Notes                                                                 |
| --------------------------- | ------------- | --------------------------------------------------------------------- |
| Unit (Vitest)               | ✅ 2202/2202  | Full regression incl. 87 new Cluster B tests (service, adapter, wiring) |
| Integration (Vitest)        | ✅ 389/389    | Cluster B file 6/6 — all 5 route groups + every persistence trap pinned |
| Database (pgTAP)            | ✅ 161/161    | `_helpers.sql` "No plan" line is the known harness artifact, not a failure |
| Production build (next build)| ✅ clean     | Compiled successfully; all 5 Cluster B routes built                    |
| E2E (preview, @critical)    | 🔴 4 failed / 35 passed | Cluster B specs 18–21 fail; all other criticals (incl. Cluster A HACCP) pass |
| Populated UI smoke          | 🔴 flagged    | Cluster B admin screens load correctly as admin but specs can't drive them |
| Breadth crawl               | n/a           | Not a separate rung in this project's harness                         |

## Persistence traps — all PINNED at the integration layer (green)

- allergen / food-defence / food-fraud → append-only INSERT ✓
- monthly-reviews → UPSERT-overwrite-same-month ✓
- product-specs → in-place UPDATE + `active:false` soft-delete ✓
- R3 — a row with NULL user-ref is still RETURNED (non-inner join) ✓
- PATCH-omits-allergens does NOT null the allergens column ✓

🗣 In plain English: the behaviour that actually matters — what gets written to the
database and read back — is fully proven by the integration tests against a real DB.
The failing layer is only the browser-click test scripts, not the routes.

## The E2E blockers (per spec)

All 4 are TEST-side, not source-side. The route code is byte-identical and proven
green by the integration layer; the screens render and the admin login works.

- **21 product-specs** — page loads as admin, "+ Add spec" + "No product specs on file"
  empty state present. Fails at `getByRole('heading', { name: /product specifications/i })`
  — the title "Product Specifications" is a `<p>`, not a heading element.
- **19 food-defence** — page loads as admin, "+ New version" + "No plan on file" present.
  Fails at `getByRole('heading', { name: /food defence plan/i })` — title is a `<p>`.
- **20 food-fraud** — page loads as admin, "+ New version" + "No assessment on file"
  present. Fails at `getByRole('heading', { name: /food fraud assessment/i })` — title is a `<p>`.
- **18 allergens** — title IS a real `<h1>` (heading assertion passes). Fails on the next
  step: clicks "Update", which `app/haccp/allergens/page.tsx:292` renders only when
  `isAdmin && assessment` — but no allergen assessment is seeded and the page has NO
  create-first-assessment path (`openEdit` is only ever called with an existing row).
  The second test in the file (monthly-review run) is gated only on `isAdmin` and would pass.

## What was tried in each loop

- **Loop 1 — auth-helper fix (broken test).** First run: all 4 Cluster B specs threw
  `Missing E2E_PIN_ADMIN`. Root cause: the specs called `loginAs(page,'admin')` (the PIN
  keypad flow), but admins authenticate by username+password per the `users_auth_check`
  DB constraint (admin → password_hash NOT NULL). Switched all 4 specs to the purpose-built
  `loginAsAdmin(page, E2E_USER_ADMIN, E2E_PASSWORD_ADMIN)` helper (creds already present in
  `.env.e2e.local`). Re-ran: login now succeeds (pages render in admin context), but several
  Cluster A HACCP specs that had passed now flapped → suspected preview-branch data/load state.
- **Loop 2 — preview branch reset (environment).** `reset_branch` on the Supabase preview
  branch (id 3d4ce699-…, ref zzzroqcanwuiwkauljyw) to re-apply migrations + current seed.
  Branch returned ACTIVE_HEALTHY / FUNCTIONS_DEPLOYED. Re-ran: the Cluster A HACCP + KDS
  flakiness cleared (35 critical passing, up from 30/34), confirming those were environment.
  But all 4 Cluster B specs still fail — now clearly on the role-selector mismatch (19/20/21)
  and the seed/no-create-path gap (18), neither of which a reset can fix.

## Migration

None. No migration, no schema change → no rollback script required, no PITR gate.
Rollback of the code change itself = standard Vercel deploy rollback (revert PR #70).

## Why this is NOT a source-code eject (important for the conductor)

The F-19 PR3 diff is proven correct by unit + integration (all 5 route groups, every
persistence trap) + pgTAP + a clean production build + 35 green critical E2E specs incl.
every Cluster A HACCP screen on the real preview. The 4 failures are entirely inside the
NEW test artifacts (specs 18–21) added in this same PR:
- 3 are wrong-ARIA-role selectors (`heading` vs `paragraph`) — a one-line fix per spec.
- 1 (allergens-Update) needs a seeded allergen-assessment fixture; the page has no UI
  create-first path, so the spec also needs reshaping (e.g. drive the monthly-review path,
  or seed an assessment row in `supabase/seed.sql`).

These are TEST fixes (FORGE Render / `/rerender`), not plan or spec defects. Per the
termination contract I stopped at loop 2 rather than apply a third round of test edits.
