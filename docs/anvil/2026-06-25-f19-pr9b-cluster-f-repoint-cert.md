# ANVIL Clearance Certificate

Date: 2026-06-25
App: MFS-Operations
Branch: feat/f19-pr9b-cluster-f-repoint
PR: #77

## Scope — what this certificate actually covers

A thin **route-only re-point**: 8 HACCP docs/lookups routes moved off direct
`supabaseService.from(...)` onto 3 pre-built service singletons
(`haccpHandbookService`, `haccpSuppliersService`, `haccpLookupsService`). Happy path
is byte-identical. NO migration, NO `lib/` change, NO package.json change. The 8 routes:
`app/api/haccp/{handbook,search,documents,users,customers,supplier-code,recall,admin/suppliers}/route.ts`.

| Change / path | Risk tier | Layers required | Layers run |
| --- | --- | --- | --- |
| `recall` + `admin/suppliers` routes (the 2 MUTATING surfaces: GET/POST/PATCH) | High (food-safety / SALSA audit data) | Unit + Integration + E2E (exhaustive every-button taps) | ✅ all |
| 6 read-only GET routes (handbook · search · documents · users · customers · supplier-code) | Medium | Unit + Integration + E2E smoke | ✅ all |
| pgTAP / RLS | n/a (no SQL/RLS touched) | Regression check only | ✅ ran — clean |

🗣 In plain English: this PR just changes WHO the 8 routes phone to fetch/write data
(the new in-house service desks instead of dialing the database directly) — the words
they exchange are identical. The two routes that can WRITE auditor-facing food-safety
records (recall contacts + supplier register) got the full belt-and-braces treatment;
the 6 read-only ones got a lighter check.

**Not run under the efficiency dial:** None deliberately skipped — full ladder run.
The architecture rung (domain-only fake-adapter test) is **not applicable**: this PR
crosses no seam — all ports/services/adapters/wiring were built and frozen in PR9a;
PR9b only re-points routes at the existing wiring singletons.
**Baseline characterisation pass?** No — diff-driven, full coverage of the changed surface.

## Test Results

| Layer | Status | Notes |
| --- | --- | --- |
| Unit (Vitest) | ✅ 2346/2346 passed | full suite, no infra |
| Integration (Vitest) | ✅ 464/464 passed | local Supabase; incl. NEW `haccpDocsLookupsRoutes.test.ts` 24/24 (both mutating surfaces + 6 GETs, role gates, key-order + bare-array shape) |
| Database (pgTAP) | ✅ 161/161 passed | 14 RLS/schema suites all `ok` — regression only (no SQL touched). Runner exit=1 is a known harness artifact on the no-plan `_helpers.sql` include, NOT a test failure |
| Edge Functions (Deno) | n/a — not required | no `supabase/functions/` change in this PR |
| Local full-stack rung | ✅ Supabase CLI adapter | local containers up (`supabase status` running); integration + pgTAP ran against the local stack |
| E2E (Playwright) | ✅ 73/73 @critical, 0 flaky | on the Vercel preview (real target). Incl. 6 NEW specs in `27-haccp-recall-suppliers.spec.ts` exercising every interactive element on both mutating screens |
| Populated UI smoke | ✅ populated (read-mode) + flagged (write-form data) | recall + admin screens mounted and rendered through the GETs; the recall-config and supplier-register WRITE forms were exercised structurally — see "Manual smoke" for the seed-empty note |
| Breadth crawl | n/a — covered by 73 @critical depth specs across all HACCP screens | no separate route-manifest crawl rung in this project; depth specs visit every HACCP screen |

### E2E detail — the two MUTATING surfaces (exhaustive, NON-DESTRUCTIVE)

`tests/e2e/27-haccp-recall-suppliers.spec.ts` (NET-NEW, written by ANVIL this run):
- **recall** (`/api/haccp/recall` GET+POST+PATCH → `app/haccp/recall/page.tsx`):
  GET load asserted clean; config **Edit** form opened → **Cancel** (Save-all = POST asserted present, never clicked); supplier inline **Edit** opened → **Cancel** (Save-contact = PATCH asserted present, never clicked).
- **admin/suppliers** (`/api/haccp/admin/suppliers` GET+POST+PATCH → `app/haccp/admin/page.tsx`):
  GET load + tab switch (CA ↔ Suppliers); CA card expand + "Recently signed off" toggle (local state); **Add-supplier** drawer opened → **×** close (Add = POST asserted present, never clicked); supplier **Edit** drawer opened → **×** close (Save-changes = PATCH + Activate/Deactivate = PATCH all asserted present, never clicked).
- A per-test **write guard** listener fails the test if any POST/PATCH/DELETE ever hits the two endpoints. Zero writes fired across all 6 specs → the shared preview branch was never mutated.

🗣 In plain English: I opened every form and dialog on both writeable screens and
always hit Cancel/Close — never Submit — and put a tripwire on the wires so the test
would scream if it ever actually saved anything. Nothing was saved.

## Warnings (non-blocking)

- 🟡 **F-TD-37 shared-preview-branch flake (hit + recovered).** The first full `@critical`
  run was clean 67/67. A second run (while authoring the new specs) false-reddened HACCP
  write specs 13/16/25 + flaked 04 on accumulated "submit-once-per-period" data — the known
  F-TD-37 pattern, NOT a code regression. Recovery per protocol: `reset_branch` on the PR's
  Supabase preview branch (id `7e518808-6d35-4f32-9e45-1ead1d8958d8`) → waited for
  `FUNCTIONS_DEPLOYED` + `ACTIVE_HEALTHY` → re-ran the FULL suite ONCE → **73/73 clean, 0 flaky.**
- 🔵 **Seed-empty on the preview branch (data-dependent gap, NOT a failure).** The reset preview
  branch carries no `recall_config` row and 0 suppliers. The new specs handle this by design:
  recall-config Edit is a documented no-op when `!config` (the page early-returns), and the
  supplier register shows its empty-state copy. Both screens were proven to mount, fetch, and
  open/close their forms WITHOUT seeded rows. The populated write-row path (e.g. a seeded
  supplier inline-edit) was therefore exercised structurally but not against real rows — named
  here so the cert is not read as "tested against populated write data."

## Migration

None.
Rollback script: docs/anvil/2026-06-25-f19-pr9b-cluster-f-repoint-rollback.sql (code-only rollback note — no SQL)
PITR confirmed: N/A — no migration, no destructive operation, nothing written by deploy.

## Merge Sequence

1. No `supabase db push` — there is no migration.
2. Merge PR #77 → Vercel auto-deploys.
3. Post-deploy smoke: 3 `@critical` HACCP paths against the production URL (www.mfsops.com).

## Manual smoke at merge

**Still advised — one narrow gap named:** the depth specs + clean breadth across all HACCP
screens mean a full hand-click is NOT needed for correctness. The single unproven slice is the
**populated write-row path on the recall/supplier forms** (the preview branch had 0 seeded
suppliers and no recall config, so inline-edit-of-a-real-row was exercised structurally, not
against live rows). If desired, a 30-second post-merge check on prod (which DOES have real
suppliers + recall config) opening one supplier's Edit and Cancelling closes that gap. No write
is required to close it.

🗣 In plain English: everything that matters was proven on the real preview, with one honest
caveat — the preview's database was empty of suppliers, so "edit an existing supplier and cancel"
was tested as far as an empty list allows. Production has real suppliers, so one quick open-and-cancel
there (no saving) fully closes it.

## Verdict

✅ CLEARED FOR PRODUCTION (draft — conductor owns the Lock gate + ship)
