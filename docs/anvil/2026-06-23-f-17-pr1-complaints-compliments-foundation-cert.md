# ANVIL Clearance Certificate

Date: 2026-06-23
App: MFS-Operations
Branch: f-17-pr1-complaints-compliments-foundation
PR: #62
Commit certified: 23d64a7

## Scope — what this certificate actually covers

F-17 PR1 is a PURE HEXAGONAL DOMAIN FOUNDATION EXTRACTION for the Complaints +
Compliments features. INTRODUCE-ONLY: it adds domain types + ports + service
factories + Supabase & Fake adapters + master-key wiring + unit tests. NOTHING in
the running app consumes the new code yet — the `app/api/**` diff is EMPTY.

| Change / path                                                                | Risk tier | Layers required          | Layers run                          |
| ---------------------------------------------------------------------------- | --------- | ------------------------ | ----------------------------------- |
| `lib/domain/Complaint.ts`, `lib/domain/Compliment.ts` (+ `index.ts`)         | Low       | Unit + Typecheck         | Unit ✓ · tsc ✓                       |
| `lib/ports/Complaints/ComplimentsRepository.ts` (+ `index.ts`)               | Low       | Unit + Typecheck         | Unit ✓ · tsc ✓                       |
| `lib/services/Complaints/ComplimentsService.ts` (factories, validation)      | Low       | Unit                     | Unit ✓ (45 service tests)           |
| `lib/adapters/{supabase,fake}/Complaints/ComplimentsRepository.ts`           | Low       | Unit (via fake) + Lint   | Unit ✓ · Lint ✓                      |
| `lib/wiring/complaints.ts`, `lib/wiring/compliments.ts` (master-key only)    | Low       | Unit (wiring identity)   | Unit ✓ (4 wiring tests)             |

**Not run under the efficiency dial:** Integration, DB/RLS (pgTAP), Edge Functions,
and E2E (Playwright) are deliberately NOT run — see "Test Results" for the one-line
N/A reason on each. This is the introduce-only tier: nothing consumes the new code,
so there is no wired behaviour to assert at those layers (Guard agreed; this is the
Gate-3 approved collapsed matrix).
**Baseline characterisation pass?** No — diff-driven. Full coverage of the changed
surface, which at this stage is unit-testable code only (types, ports, factories,
adapters via the fake, wiring identity).

🗣 In plain English: this PR ships the "spare parts" for the complaints + compliments
features — the contracts, the business-logic objects, and two interchangeable storage
backings — but plugs none of them into the live app yet. So the only honest things to
test are: do the parts compile, lint clean, and behave correctly in isolation? They do.
The live database round-trip and browser proof land in PR2, when the routes actually
start calling this code.

## Test Results

| Layer                 | Status              | Notes                                                                                                          |
| --------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------- |
| Unit (Vitest)         | ✅ 2033/2033 passed | Full suite, 118 test files. Includes the 49 NEW F-17 tests: 45 service (`ComplaintsService.test.ts` + `ComplimentsService.test.ts`) + 4 wiring (`complaintsService.test.ts` + `complimentsService.test.ts`). |
| Lint (ESLint)         | ✅ clean            | `npm run lint` → "No ESLint warnings or errors". Confirms the no-adapter-imports rule (ADR-0002 / F-TD-11) holds for the new files. |
| Typecheck (tsc)       | ✅ clean            | `npm run typecheck` (`tsc --noEmit`) → exit 0. Vendor types do not leak past the adapter boundary (compile-time proof). |
| Integration (Vitest)  | n/a — not required  | Deferred to PR2 by plan: nothing consumes the new adapters yet, so there is no wired output to assert. (Guard agreed.) |
| Database (pgTAP/RLS)  | n/a — not required  | No migration, no schema change, no RLS change in this PR.                                                      |
| Edge Functions (Deno) | n/a — not required  | No edge function touched.                                                                                      |
| E2E (Playwright)      | n/a — not required  | `app/api/**` diff is EMPTY → zero behaviour change to smoke. The real DB round-trip + W1 duplicate-path proof land in PR2. |

## Guardrail confirmation checklist (Guard verified; re-confirmed against commit 23d64a7)

- [x] `app/api/**` diff EMPTY — `git diff origin/main...HEAD -- 'app/api/**'` returned nothing.
- [x] No migration — `git diff origin/main...HEAD -- 'supabase/migrations/**'` returned nothing.
- [x] No email-helper / resend / mail file edits — no such path in the diff.
- [x] Master-key wiring ONLY — `lib/wiring/complaints.ts` + `compliments.ts` compose the service-role singletons; no `*ForCaller` authenticated export (per-caller RLS deferred to F-RLS-04f).
- [x] Factories-only services — `lib/services/**` export `create*Service(deps)` factories, no pre-wired singletons.
- [x] `@supabase/*` confined to `lib/adapters/supabase/` — zero `@supabase/*` imports in `lib/domain`, `lib/ports`, `lib/services`, `lib/usecases`, `lib/wiring`. Only the two new supabase adapters import the SDK.
- [x] Zero new `package.json` entries — `git diff origin/main...HEAD -- package.json package-lock.json` returned nothing.

🗣 In plain English: every house rule that keeps the app swappable and safe is intact — the
vendor stays locked in its drawer, the business logic only knows the contract, and nothing in
the live app has been re-pointed to use any of this yet. Confirmed against the exact commit
being certified.

## Migration / PITR

None. There is NO migration in this PR → no destructive-migration PITR check needed,
and no PITR gate fires.

## Rollback

Trivial. This is additive, introduce-only code with ZERO consumers in the running app —
no route calls it, no data, no schema to undo. Rollback = revert the PR (or `git revert`
the 8 commits). Nothing in the running app depends on it.

A SQL rollback file is NOT needed (no migration).

🗣 In plain English: backing this out is the safest kind of undo — you delete spare parts
nobody is using. Nothing in production reads or writes through this code, so reverting can't
break a live screen or strand any data.

## Carried-forward items for PR2 (not blockers for PR1)

- **W1 (carried from code-critic):** the duplicate-replay path must return HTTP 200 with
  `duplicate:true`, NOT a 500. This must be asserted against the REAL database in PR2 (the
  integration layer that does not exist yet for this domain). Cannot be proven in PR1 — no
  route consumes the code.
  🗣 If the same complaint is submitted twice, the app should quietly say "already got it,"
  not error out. Provable only once a route is wired and hits a real DB — PR2.
- **G1 (carried from Guard):** the `receivedVia` route-edge transform (mapping the wire
  shape `received_via` to the domain `receivedVia`, and the `category.replace(/_/g, ' ')`
  display transform) stays in the route and lands in PR2.
  🗣 The little "translate the form field names into the app's internal names" step belongs
  at the route door, which this PR doesn't touch yet.

## Verdict

✅ CLEARED FOR PRODUCTION
