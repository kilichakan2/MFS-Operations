# Code-critic review — F-PROD-02 KDS line-done undo

- **Date:** 2026-06-17
- **Unit:** F-PROD-02 — KDS line-done undo with confirmation
- **Branch / PR:** `feat/f-prod-02-kds-line-undo` / PR #49
- **Reviewer:** code-critic subagent (FORGE Guard phase)
- **Plan:** `docs/plans/2026-06-17-f-prod-02-kds-line-undo.md`

## VERDICT: SHIP-WITH-NITS — no 🔴 blockers

Implementation is faithful to the plan, hexagonally clean, and the dangerous SQL (atomic
cascade, TOCTOU guards, trigger hardening) is correct. The weakness is **test coverage at the
pgTAP + integration layers** — the diff adds essentially zero behavioural tests there despite
plan §12 requiring them. That is a Render/ANVIL concern, not a code defect → no loop-back.
**Hard gate for ANVIL: the cert must NOT print until 🟢-1/🟢-2/🟢-3 are added AND pgTAP +
integration are demonstrated green.**

## Test / lint / suite results (what the critic actually ran)

| Layer | Result | Notes |
|---|---|---|
| Unit (`npm test`) | ✅ 1777/1777 pass | matches implementer report |
| Typecheck (`tsc --noEmit`) | ✅ clean | |
| Lint (`next lint`) | ✅ clean | incl. `no-adapter-imports` boundary pin — hexagonal boundary confirmed |
| pgTAP (`supabase test db`) | ⚠️ NOT RUN — sandbox denied | reported "76" NOT independently verified |
| Integration (`npm run test:integration`) | ⚠️ NOT RUN — sandbox denied (boots dev server) | reported "188" NOT independently verified |

Critic explicitly does **not** claim pgTAP/integration green — did not see them run. ANVIL must
run them for real; do not certify on reported counts alone.

## Findings

### 🟢 Test-coverage gaps (action items → ANVIL)

- **🟢-1 — No pgTAP coverage for the trigger fix or `kds_undo_line` RPC.**
  `supabase/tests/004-audit-triggers.test.sql` not extended. Missing the three plan-§12 proofs:
  (a) reverse `done_at` transition (NOT NULL→NULL) logs `line_undone` (forward still `line_done`,
  unrelated edit still `line_edited`); (b) CHECK-constraint proof — no `state='completed'` +
  `completed_at IS NULL` ever observable across the cascade; (c) concurrency — two concurrent
  `kds_undo_line` calls on one line → exactly one writes, one no-op. Only SQL test added is a
  static enum-membership count (`001-schema-integrity.test.sql:51-56`, 8→9) which proves the label
  exists, nothing about behaviour. This is the most security/correctness-sensitive change (rewrites
  a SECURITY DEFINER trigger + adds a privileged RPC) and has no behavioural DB test.
  **Fix:** ANVIL adds the three proofs to `004-audit-triggers.test.sql` + a new `0NN-kds-undo.test.sql`.

- **🟢-2 — No integration tests added.** `tests/integration/kds.test.ts` unchanged (still 10 cases).
  Missing plan-§12 route-level cases: full undo via route (200 `{ok:true}`, line cleared); cascade
  via route (200 `{ok:true,reopened:true}`, order→printed + `completed_at` null); second-undo
  idempotency (`{already_pending:true}`); identity 404/403; **audit assertion** (exactly ONE
  `line_undone` row, `user_id IS NULL`, before/after payload); **no-false-flash** assertion
  (`line_undone ∉` flash actions ⇒ `/api/kds/orders` returns no flash). *Mitigant:* the 6
  `markLineUndone` contract cases DO run against the real Supabase adapter
  (`tests/integration/adapters/supabase/OrdersRepository.test.ts`) — so the RPC is exercised
  end-to-end for happy/idempotent/cascade, but NOT audit-row, NOT no-flash, NOT route 404/403, NOT
  concurrency. **Fix:** ANVIL adds route-level cases, especially the single-`line_undone`-row +
  NULL-user audit assertion and the no-false-flash B2 regression guard.

- **🟢-3 — Contract block has no concurrency case (R-C1).** `OrdersRepository.contract.ts:668-786`
  has all 6 specified cases, behavioural with real read-back (good), but no concurrent-undo case —
  the plan's HIGH-severity race. Idempotency case #4 proves a *sequential* second undo is a no-op,
  not the concurrent one. **Fix:** ANVIL covers concurrency at the pgTAP layer (🟢-1c).

### 🔵 Architecture / context (non-blocking)

- **🔵-1 Depth verdicts:** `markLineUndone` (port) DEEP ✅; Supabase adapter + `kds_undo_line` RPC
  DEEP ✅ (no vendor leak); Fake adapter DEEP ✅ (same idempotency/cascade semantics → contract
  meaningful); `kdsLineUndone` usecase DEEP ✅; undo route DEEP ✅. `OrdersService.undoLineDone`
  = borderline PASS-THROUGH, graded 🔵 not 🔴: service pre-exists, plan §6.3 declared it a typed
  pass-through, and collapsing it would break the F-07 layering every sibling KDS action + the
  ESLint boundary rely on (deletion test degrades a consistent contract rather than cleanly moving
  complexity). Acceptable stepping-stone.
- **🔵-2 Stale JSDoc mechanism.** `OrdersRepository.ts:453-457` describes the TOCTOU guards as
  PostgREST builder calls (`.not('done_at','is',null)`, `.eq('state','completed')`), but they're
  actually SQL `WHERE` clauses inside `kds_undo_line` (migration B:117-118, 129-130). Semantics
  right; named mechanism is the rejected design's. A future reader grepping the adapter for
  `.not('done_at'...)` won't find it. Harmless doc nit.
- **🔵-3 Dead `p_when` param.** `kds_undo_line` accepts `p_when` (migration B:91), adapter passes it
  (adapter:928), function never uses it (undo clears timestamps). JSDoc (port:488-491) pre-justifies
  it ("symmetry/determinism"). Documented, unused surface.
- **🔵-4 `v_reopened := true` set unconditionally in the completed branch.** Migration B:126-131 sets
  it whenever `state='completed'` was read at top, even if the guarded UPDATE hit zero rows (raced
  re-complete). Only drives the `{reopened:true}` response copy, never a second write (verified) →
  cosmetic over-report in an extreme race; DB state never corrupted. Plan R-C1 accepts "guard
  misses → benign".
- **🔵-5 S1 NULL-user audit (accepted by spec).** `line_undone` row has `user_id = NULL`, same as
  every current KDS action; deferred to BACKLOG F-RLS-04a-kds. NOT a blocker — context only.

## Priority checklist verification (critic)

1. Atomic cascade / R-C2 — ✅ correct (one plpgsql function = one txn; CHECK never sees intermediate). Gap: untested pgTAP (🟢-1).
2. Concurrency / R-C1 — ✅ guards present & correct (line `done_at IS NOT NULL`, order `state='completed'`); Fake enforces same idempotency. Gap: no concurrent test (🟢-3); cosmetic 🔵-4.
3. Trigger fix / B2 — ✅ correct & hardened: body is canonical `20260601000000` (SECURITY DEFINER + `search_path=public` + NULL-safe GUC) + one ELSIF; CREATE OR REPLACE preserves `20260613020000` REVOKEs; `line_undone` NOT in flash list (`OrdersRepository.ts:982`). Gap: untested pgTAP (🟢-1).
4. RPC security — ✅ SECURITY DEFINER, search_path pinned, REVOKE PUBLIC/anon/authenticated + EXECUTE granted only to the service-role role (B:141-144), no dynamic SQL.
5. Migration safety — ✅ two-file split correct (enum File A `20260617130000`, use File B `20260617130001`), full 14-digit, File B sorts after A, both additive.
6. Hexagonal / rip-out — ✅ PASS (lint-confirmed boundary; only the plain shape crosses the port; route via wiring singleton; no `package.json` change).
7. Route + use-case parity — ✅ exact line-done mirror (404/403, `withRequestContext`/`withErrors`, `parseOrThrow`).
8. UI correctness — ✅ optimistic undo + rollback (pre-setState snapshot), poll-reconciliation mirror prevents flicker (`page.tsx:237-244`), `willReopen` client-side gates reopen copy, done lines re-enabled while mark-done preserved.
9. Test quality — unit/contract/service/usecase/schema all behavioural through public interfaces with real read-back (good); gap is missing DB/integration layers (🟢-1/2/3).

## Loop-back mapping

No 🔴 → code does NOT loop back. The three 🟢 are test-coverage gaps owned by ANVIL. **Advance to
ANVIL with a hard gate:** no cert until 🟢-1/🟢-2/🟢-3 added AND pgTAP + integration shown green on
the real DB (critic could not run them — do not certify on reported counts alone).
