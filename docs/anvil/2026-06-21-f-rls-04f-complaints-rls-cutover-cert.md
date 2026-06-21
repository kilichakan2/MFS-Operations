# ANVIL Clearance Certificate — CLEARED FOR PRODUCTION

Date: 2026-06-21
App: MFS-Operations
Branch: f-rls-04f-complaints-rls-cutover
PR: #64 (base `main`) — https://github.com/kilichakan2/MFS-Operations/pull/64

> LOCKED at the FORGE Lock gate (2026-06-21): full ladder green, E2E ran on the real
> preview deploy, migration is non-destructive (DROP/CREATE POLICY only) → no PITR required.
> Ship sequence (prod migration → merge → prod smoke) is Hakan's Gate-4 decision.

## Scope — what this certificate actually covers

6th cutover of an established RLS pattern (faithful mirror of F-RLS-04e cash). Moves the
complaints + compliments domain onto a per-request **AUTHENTICATED** Supabase client so
Postgres Row-Level Security (RLS) enforces access. Product decision: **shared-board model**
— any valid logged-in staff member can see/act on every complaint and compliment.

🗣 In plain English: the database itself now decides who can read/write each complaint,
compliment and note, instead of the app trusting a master key. The shared-board rule means
all staff see the whole board, which is the intended behaviour.

| Change / path                                                      | Risk tier | Layers required               | Layers run                          |
| ------------------------------------------------------------------ | --------- | ----------------------------- | ----------------------------------- |
| `supabase/migrations/20260621130000_complaints_authenticated_rls_policies.sql` | Critical (RLS + migration) | pgTAP + Integration + E2E | pgTAP ✓ · Integration ✓ · E2E ✓ |
| `lib/wiring/complaints.ts`, `lib/wiring/compliments.ts` (per-caller factories) | High | Unit + Integration            | Unit ✓ · Integration ✓             |
| 8 routes flipped onto the per-caller service (`app/api/screen2/*`, `app/api/detail/complaint`, `app/api/compliments/*`) | High (auth/RLS surface) | Integration + E2E | Integration ✓ · E2E ✓ |

**Not run under the efficiency dial:** None — full ladder run. This is the high-risk tier
(RLS + migration), so the full E2E suite ran on the Vercel preview (the deliberate
high-risk double-run), not just the `@critical` smoke. (The E2E config here IS the
`@critical` preview suite — 15 specs — so the full suite and the critical smoke coincide.)
**Baseline characterisation pass?** No — diff-driven, the PR's changed surface is fully covered.

## Test Results

| Layer                 | Status            | Notes                                                                                                  |
| --------------------- | ----------------- | ------------------------------------------------------------------------------------------------------ |
| Unit (Vitest)         | ✅ 2046/2046 passed | 122 files. Includes 6 new wiring tests (3 complaints + 3 compliments): fresh-mint-per-call, single-port bind, singleton rollback parachute. |
| Integration (Vitest)  | ✅ 22/22 passed    | Local Docker Supabase (db:reset applied the new migration). Incl. F-RLS-04f shared-board cross-user read over real HTTP, FK-embed names non-blank, audit_log service-role write survives the flip. |
| Database (pgTAP)      | ✅ 13/13 files ok (144 subtests) | `013-rls-complaints.test.sql` = **plan(14), all ok** — full CRUD under valid user, cross-user shared-board read, fail-closed for no/invalid user, service-role bypass; across complaints + complaint_notes + compliments. Suite-level `Result: FAIL` is the KNOWN pre-existing harness artifact from `_helpers.sql` (shared include, 0 subtests, "No plan found") — NOT a test failure; all 13 real files print `ok`. |
| Edge Functions (Deno) | n/a — not required | No `supabase/functions/` change in this diff.                                                          |
| E2E (Playwright)      | ✅ 14/14 passed (1 skipped) | Ran on the **Vercel preview** for commit `bf7a2429` against the **Supabase preview branch** (ACTIVE_HEALTHY). `08-complaints-board.spec.ts` (log → board prettified category → note → resolve via UI) + `09-compliments.spec.ts` (recipient dropdown → post → appears in feed) both green. previewProbe confirmed all 4 DB-identity checks (reading a seed-born preview DB, not prod). The 1 skip is `04-kds-line-undo.spec.ts:140` (conditional reopen-warning case) — unrelated to this change. |

**Data-dependent UI proof:** POPULATED, not mount-only. Both complaints/compliments specs
create a record then read it back rendered on the board/feed (not an empty smoke).

**Architecture rung:** N/A as a domain-fake gate — this PR does not add/alter a port or
adapter; it re-wires existing factories to a per-caller authenticated client. No vendor SDK
imported in any domain test. The hexagonal boundary is untouched (wiring-layer only change).

## Warnings (non-blocking)

- 🟡 None affecting this change. (1 Playwright skip is a pre-existing conditional case in an
  unrelated KDS spec, not flakiness.)
- 🔵 Coverage note: pgTAP `_helpers.sql` emits a cosmetic suite-level `Result: FAIL`
  (0-subtest shared include). Pre-existing, documented in the matrix; report per-file.

## Preview target tested

- Vercel preview: `https://mfs-operations-o132qsjt4-hakan-kilics-projects-2c54f03f.vercel.app`
  (deployment `dpl_DtsEByrEx6r1zu3G8ZNnmd6npSHz`, commit `bf7a2429`, state READY).
  Stable branch alias: `mfs-operations-git-f-rls-52871c-hakan-kilics-projects-2c54f03f.vercel.app`.
- Supabase preview branch: PR #64 `f-rls-04f-complaints-rls-cutover`
  (`project_ref idijvjjaxfkmdtfdkeme`, status FUNCTIONS_DEPLOYED, ACTIVE_HEALTHY) — migration
  auto-resynced via the 14-digit filename.
- Deployment Protection: OFF (ran `--unprotected`; tracked as BACKLOG F-INFRA-04).

## Migration

**Additive / non-destructive** — DROP POLICY IF EXISTS + CREATE POLICY only (12 permissive
`current_user_is_valid()` policies created; 3 stale dormant owner-only baseline policies
dropped). No DROP TABLE/COLUMN, no TRUNCATE, no ALTER TYPE, no DROP NOT NULL, no data touched.
**→ No PITR required.**

Rollback script: `supabase/migrations/rollback/2026-06-21-f-rls-04f-complaints-rls-cutover-rollback.sql`
(drops the 12 added policies; real rollback lever is the CODE revert to the master-key
singleton — the DB lever is optional belt-and-braces. The 3 dropped baseline policies are
deliberately NOT recreated — they were dormant.)
PITR confirmed: N/A (non-destructive migration).

## Merge Sequence (conductor / Hakan owns this)

1. Apply the migration to PRODUCTION FIRST:
   `supabase db push --project-ref uqgecljspgtevoylwkep`
   (or apply `20260621130000_complaints_authenticated_rls_policies.sql` via the Supabase MCP).
2. Merge PR #64 → Vercel auto-deploys the code SECOND.
3. Smoke test against live prod: the `@critical` complaints + compliments paths
   (`08-complaints-board`, `09-compliments`) on https://www.mfsops.com.
4. If smoke fails → `vercel rollback` (code) + run the rollback script if the policies need
   reverting. No data rollback path needed (non-destructive).

## Verdict

✅ CLEARED FOR PRODUCTION — SHIPPED 2026-06-21 (PR #64, squash `65b8963`)

All required layers ran and passed. No 🔴 blockers, no real-code bugs found, no FORGE
eject needed. 0 iteration loops used.

## Ship outcome (2026-06-21)

- Migration applied to PROD FIRST via Supabase MCP `apply_migration` — 12 policies verified
  live (4 × complaints/complaint_notes/compliments, all `current_user_is_valid()`, UPDATE with
  both USING+WITH CHECK), the 3 stale owner-only baseline `complaints` policies confirmed gone.
- PR #64 squash-merged (`65b8963`); prod deploy `dpl_E2rfFoCkEYwNE1otGoJyW96L6iDg` READY on
  www.mfsops.com. Post-deploy prod smoke 6/6 non-5xx (all 307 auth-redirect).
- **Manual prod write-smoke by Hakan — PASS (both paths, all steps, DB-confirmed read-only):**
  complaint `307c00b9-4b49-4bc6-bfd7-a3c15c60a8d3` (A LA TURKA/MAIZEME LIMITED, raise→note→
  resolve, status=resolved / note_count=1) + compliment `c3b3c6fb-c8ed-4800-806a-707609996bcf`
  ("TEST AGAIN", team-wide, posted_by=Hakan). All four write paths fired under the per-caller
  authenticated client → F-RLS-04f 100% validated in production.
