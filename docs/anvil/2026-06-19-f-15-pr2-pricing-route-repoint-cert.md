# ANVIL Clearance Certificate — CLEARED FOR PRODUCTION

Date: 2026-06-19
App: MFS-Operations
Branch: f-15-pr2-pricing-route-repoint
PR: #56 — https://github.com/kilichakan2/MFS-Operations/pull/56

> Status: **CLEARED FOR PRODUCTION** (conductor Lock gate, 2026-06-19). Verify ladder
> green on every required layer; the single 🟡 is a pre-existing, change-unrelated KDS
> seed-state flake (passed on the clean run). No destructive migration → PITR N/A.
> Merge remains Hakan's action at FORGE Gate 4 (/ship).

## Scope — what this certificate actually covers

PR #56 re-points the 5 pricing API routes through `pricingService` + a new activation-email
use-case, absorbs the `pricing-email.ts` raw recipient fetch via the Users port, and (B1 fix)
widens `listAgreements` to carry position-sorted lines. **No migration. Service-role only (no
RLS/policy change). No new dependency.**

🗣 In plain English: the pricing screens' back-end endpoints now go through the owned pricing
"service" layer instead of talking to the database vendor directly, and the "send the activation
email" step is a small dedicated orchestrator. The database schema and permissions are untouched.

| Change / path | Risk tier | Layers required | Layers run |
| --- | --- | --- | --- |
| `app/api/pricing/route.ts` + `[id]` + `[id]/lines` + `[id]/lines/replace` + `lines/[lineId]` (5 routes re-pointed) | Medium | Unit + Integration + preview @critical smoke | ✅ all |
| `lib/usecases/pricingActivationEmail.ts` (new activation-email use-case) | Medium | Unit + Integration | ✅ unit + integration |
| `lib/pricing-email.ts` (raw recipient fetch absorbed via Users port) | Medium | Unit | ✅ unit |
| `lib/ports/PricingRepository.ts` + Supabase/Fake adapters + contract (B1: list carries position-sorted lines) | Medium (crosses the PricingRepository seam) | Architecture rung: contract + Fake + Supabase adapter on real Postgres | ✅ contract 29/29 incl. list-with-lines on real DB |
| `lib/api/pricing/dto.ts` (new wire DTO mapper) | Low–Med | Unit | ✅ unit (dto.test.ts) |
| `lib/wiring/pricing.ts` (wiring) | Low | covered by integration | ✅ |

**Not run under the efficiency dial:** pgTAP / RLS — n/a (no migration, no policy change; the
5 routes are service-role and unchanged in their auth model). Edge functions — n/a (none touched).
Full preview E2E re-run — not required: this is a Medium-risk re-point (not auth/payments/migration/RLS),
so the `@critical` preview smoke is the correct preview depth.

**Baseline characterisation pass?** No — diff-driven matrix on a fully-tested codebase.

**Architecture rung:** ✅ The B1 change crosses the `PricingRepository` port. No vendor SDK
(`@supabase/*`, `resend`, `@vercel/*`) is imported in `lib/services/`, `lib/ports/`, or
`lib/usecases/` — verified. The recipient fetch goes through the Users port; the vendor stays in
the adapter. The list-with-lines case runs against the Fake (in-memory) and the real Supabase
adapter. Seam holds.

## Test Results

| Layer | Status | Notes |
| --- | --- | --- |
| Unit (Vitest) | ✅ 1910/1910 passed | full suite, 108 files, on branch tip `fe51e16` |
| Integration (Vitest, local Supabase) | ✅ 20/20 passed | `tests/integration/pricing.test.ts` — all 5 routes incl. GET `[id]` returns sorted lines, activate-with-email-disabled, ownership 403s |
| Pricing Supabase-adapter contract | ✅ 29/29 (reported by Assess; incl. list-with-lines on real Postgres) | the B1 correctness guarantee — real Postgres, not a mock |
| Database (pgTAP / RLS) | n/a — not required | no migration, no policy change |
| Edge Functions (Deno) | n/a — not required | none touched |
| E2E @critical (Playwright, chromium) on PREVIEW | ✅ 12/12 passed (1 conditional skip) — first clean run | regression gate; DB-identity probe 4/4; see flake note |
| Pricing probe (best-effort) on PREVIEW | ✅ `/pricing` HTTP 200, 7 agreement cards rendered, 0 page errors | logged-in sales user via the @critical login helper; throwaway probe, not committed |

### Preview environment
- Vercel preview: `https://mfs-operations-git-f-15-p-c7e80b-hakan-kilics-projects-2c54f03f.vercel.app`
  (deployment `dpl_Dnb5Lv9wUjTChxFAo7ezMzLbD3am`, commit `fe51e16`, state READY).
- Supabase preview branch (PR #56): `scpebnousmeggzqmcaih` — `FUNCTIONS_DEPLOYED` /
  `ACTIVE_HEALTHY`, `persistent: false` (auto-deletes on merge). NOT `MIGRATIONS_FAILED`.
- Deployment Protection OFF (F-INFRA-02) → smoke run with `--unprotected` (no bypass header).

### @critical specs covered (regression gate)
Order placement (01) ✓✓ · picking-list print (02) ✓✓✓ · KDS butcher flow (03) ✓✓✓ ·
KDS line undo (04) — see flake · Route Planner map (05) ✓ · Map View markers (06) ✓.
No `@critical` pricing spec exists (confirmed) — pricing's correctness rests on the
contract + integration layers above against real Postgres.

## Warnings (non-blocking)

- 🟡 **KDS line-undo flake (04-kds-line-undo.spec.ts:59 + :90) — pre-existing seed-state
  sensitivity, NOT a PR2 regression.** Both specs passed in the **first clean smoke run
  (12/12)**. They failed only on subsequent back-to-back re-runs against the **same persistent
  (non-reset) preview branch DB**: each run marks KDS lines done, and the third undo spec
  (`reopen-warning`) marks up to 8 lines done while only conditionally restoring — draining the
  board's "not-done" lines. The failure is `toBeVisible` finding no not-done line to start from;
  the latest board snapshot shows every order at `2/2 ✓ Completed`. PR #56 touches **only the
  pricing surface** — zero KDS/orders code in the diff. Verdict: harness/seed-state flake. The
  genuine fix is a fresh preview re-seed between runs (harness concern), not a code change. No
  third loop run — it would re-hit the same drained DB.
  - 🗣 In plain English: the kitchen-display "undo" tests need a line that hasn't been marked done
    yet. After I ran the whole suite several times against the same throwaway database without
    resetting it, every line was already done, so those two tests had nothing to start with. The
    very first clean run passed them; this change doesn't touch the kitchen display at all.
- 1 conditional `test.skip` (04:124 reopen-warning) — self-skips when the board has no
  single-card completion in the fade window; the reopen copy is proven at the unit/integration
  layer. Expected, pre-existing.

## Real-code bugs requiring a FORGE eject

**None.** No correctness, security, or architecture finding in the PR #56 diff. The only red
observed is the KDS-undo seed-state flake above, which is unrelated to this change.

## Migration

None. No `supabase/migrations/**` file in the diff; no `package.json`/lockfile change.

### Rollback (code-only — no `.sql` needed)
Because there is no schema change, rollback is purely the code: revert the merge commit of
PR #56 (`git revert -m 1 <merge-sha>`) or use Vercel's "rollback to previous deployment"
(production target `dpl_EFNKzENMFGh4JZ2SiG4PQ8Akf9F1` is the current rollback candidate). The
re-point is a behaviour-preserving wiring change against an unchanged schema, so reverting the
code fully restores prior behaviour with no data migration to undo.
PITR confirmed: N/A (no destructive migration).

## Merge Sequence

1. No migration to apply — skip `supabase db push`.
2. Merge PR #56 → Vercel auto-deploys to production.
3. Smoke test: 3 `@critical` order-pipeline paths against the production URL post-deploy.
4. If smoke fails → `vercel rollback` (code only; no PITR needed — no data change).

## Verdict

**CLEARED FOR PRODUCTION** (conductor Lock gate, 2026-06-19). Every required layer ran and
passed (unit 1910/1910, pricing integration 20/20, adapter contract 29/29 incl. list-with-lines
on real Postgres, preview @critical 12/12 first clean run, pricing probe `/pricing` 200). No
migration → no PITR. The single 🟡 is a pre-existing KDS seed-state flake unrelated to this
pricing-only diff. Merge is Hakan's action via FORGE Gate 4 (/ship).
