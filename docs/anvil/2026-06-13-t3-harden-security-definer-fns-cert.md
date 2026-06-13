# ANVIL Clearance Certificate

Date: 2026-06-13
App: MFS-Operations
Branch: t3-harden-security-definer-fns
PR: #32
Phase: Verify → Lock (LOCAL only; production NOT touched — Ship runs at FORGE conductor)

> **🗣 In plain English:** This certifies that the security-hardening change (locking down who can run four sensitive database functions, and pinning their settings) was tested against a copy of the database on this machine and behaves exactly as designed, with every real app behaviour still working. It is cleared to ship. Applying it to the live system is the conductor's job, not this run's.

---

## Change under test

One migration, no app code:
`supabase/migrations/20260613020000_harden_security_definer_fns.sql`

- **Pass A** — pin `search_path = public` on 4 mutable functions; normalize `generate_order_reference()` from SECURITY DEFINER → SECURITY INVOKER (prod-drift reconciliation).
- **Pass B** — revoke EXECUTE (incl. PUBLIC) on the 4 SECURITY DEFINER functions, retaining only the grants the app/RLS actually need.
- **Pass C** — in-migration fail-closed post-check (RAISEs if end-state is wrong).

Governing: ADR-0004 (service-role bypasses; retained grants keep the app unaffected).
**Non-destructive** (grants + search_path only; no DROP / data change) → **PITR NOT required.**

---

## Test Results — V1–V9 (LOCAL, measured)

| #   | Check                                                        | Method                                                                        | Expected                                                   | Measured                                                                                                                       | Status                          |
| --- | ------------------------------------------------------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| V1  | `function_search_path_mutable`                               | dynamic `pg_proc.proconfig` query over the 7 fns                              | 4 → **0** unpinned                                         | **0** unpinned (all 7 pinned `search_path=public`)                                                                             | ✅                              |
| V2  | `anon_security_definer_function_executable`                  | `has_function_privilege('anon', oid,'EXECUTE')` over the 4 DEFINER fns        | 4 → **0**                                                  | **0**                                                                                                                          | ✅                              |
| V3  | `authenticated_security_definer_function_executable`         | same, for `authenticated`                                                     | 4 → **1** (is_admin only)                                  | **1** — `is_admin` ONLY                                                                                                        | ✅ (residual = 1 **BY DESIGN**) |
| V4  | in-migration post-check on `db:reset`                        | apply log                                                                     | both NOTICEs, no EXCEPTION                                 | `T3 pre-guard passed…` + `T3 post-check passed…`, no EXCEPTION                                                                 | ✅                              |
| V5  | pricing replace works (service-role path)                    | integration suite + direct `rpc('replace_agreement_lines',…)` as service_role | 2xx, lines replaced                                        | suite 115/115; direct call returned, **1 line @ 9.99** materialised                                                            | ✅                              |
| V6  | `haccp_search` reachable (service-role)                      | direct `haccp_search(text)` as service_role                                   | runs without permission error                              | executed cleanly (full-text query ran; 0 rows — local seed has **0** `haccp_sop_content` rows, data gap not fn failure)        | ✅                              |
| V7  | orders INSERT — **positive** reference + audit-row assertion | service_role INSERT order (+line), inspect `order_audit_log`                  | non-null reference AND audit rows written by both triggers | reference `MFS-2026-0067`; **2 audit rows**: `created` ×1 (orders_audit_trigger) + `line_added` ×1 (order_lines_audit_trigger) | ✅                              |
| V8  | `price_agreements` UPDATE bumps `updated_at`                 | cross-txn: stale baseline `2000-01-01` (trigger bypassed) → real UPDATE       | `updated_at` advances                                      | after-update `2026-06-13 21:47:20+00` > baseline AND current                                                                   | ✅                              |
| V9  | `is_admin` reachable by authenticated, not anon              | `has_function_privilege(...)`                                                 | authenticated=true, anon=false                             | **authenticated = `t`**, **anon = `f`**                                                                                        | ✅                              |

**V-local-first:** all V1–V9 green on LOCAL. Production equivalents run at Ship by the conductor.

### End-state contract (measured, row-for-row)

| function                              | mode        | search_path=public | service_role      | authenticated  | anon    |
| ------------------------------------- | ----------- | ------------------ | ----------------- | -------------- | ------- |
| `replace_agreement_lines(uuid,jsonb)` | DEFINER     | yes                | ✅                | ❌             | ❌      |
| `is_admin()`                          | DEFINER     | yes                | ✅                | ✅ (by design) | ❌      |
| `orders_audit_trigger()`              | DEFINER     | yes                | ❌                | ❌             | ❌      |
| `order_lines_audit_trigger()`         | DEFINER     | yes                | ❌                | ❌             | ❌      |
| `generate_order_reference()`          | **INVOKER** | yes                | (broad, harmless) | (broad)        | (broad) |
| `haccp_search(text)`                  | INVOKER     | yes                | (broad)           | (broad)        | (broad) |
| `set_updated_at()`                    | INVOKER     | yes                | (broad)           | (broad)        | (broad) |

Matches the approved target end-state exactly. The three INVOKER functions intentionally keep broad EXECUTE — they are not SECURITY DEFINER, so their grants are not a privilege-escalation surface and were never in scope to revoke.

> **🗣 In plain English:** Every function ended up with exactly the access level we wanted. The sensitive four are locked down (only the app's service account can run pricing edits; the two audit triggers can be run by nobody directly but still fire automatically; the admin-check is reachable by logged-in users but not the anonymous public). The three harmless ones were left open on purpose — opening them isn't a security hole.

---

## V3 residual — deliberate, not an incomplete migration

`authenticated_security_definer_function_executable` ends at **1**, and that 1 is **`is_admin()` ONLY, by design**. RLS policies on 13 tables (F-RLS-03) call `is_admin()` as the `authenticated` role; revoking it would break row-level security across the app. This residual is documented in the migration header (lines 16–19) and ADR-0004. It is the intended end-state, not an omission.

---

## V7 audit-row evidence (the trigger functions still fire with zero caller grants)

Inserting an order and a line as service_role, with `orders_audit_trigger`/`order_lines_audit_trigger` holding **zero** caller EXECUTE grants:

```
order reference : MFS-2026-0067   (generate_order_reference DEFAULT, now INVOKER)
order_audit_log rows for this order:
  created    | 1     <- orders_audit_trigger fired
  line_added | 1     <- order_lines_audit_trigger fired
  total = 2, both_triggers_fired = true
```

Proves trigger functions execute with the table owner's rights at fire-time regardless of caller EXECUTE grants — revoking direct EXECUTE did not disable them. (All V5–V8 probe rows were run in rolled-back transactions / cleaned up; 0 test rows left behind — sentinel cleanup verified 0 rows remaining.)

## V9 evidence (paste)

```
has_function_privilege('authenticated','public.is_admin()','EXECUTE') = t
has_function_privilege('anon',         'public.is_admin()','EXECUTE') = f
```

---

## Warnings (non-blocking)

- 🔵 **V6 local seed gap:** `haccp_sop_content` has 0 rows locally, so `haccp_search` can only return 0 rows. The function executes correctly (permission boundary + full-text query both confirmed); result-population coverage relies on the integration/e2e HACCP route tests against seeded data. Not a blocker for a grants/search_path change.
- 🟡 **V8 method note:** the first V8 probe read FALSE due to same-transaction `now()` clock-freeze (a test artifact, not a code bug); re-run across a transaction boundary with a forced stale baseline confirmed the `set_updated_at` trigger bumps `updated_at`. Resolved within loop 1 — no code change.

## Iterate log

- **Loop 1 (test-harness fixes only, no code touched):** corrected `replace_agreement_lines` JSON line shape (needed `agreement_id`/`price`/`unit`/`position`); fixed V8 to compare across a transaction boundary; identified V6 zero-rows as a seed gap. All were TEST issues, not code bugs. No FORGE eject required.
- Real-code bugs found: **none.**

---

## Migration

Type: **Additive / non-destructive** (grants + search_path + one DEFINER→INVOKER normalization).
Rollback script: `docs/anvil/2026-06-13-t3-harden-security-definer-fns-rollback.sql`
Rollback note: reversing only re-GRANTs the revoked EXECUTEs (Pass B). The `search_path` pins and the `generate_order_reference` INVOKER normalization are non-breaking and are **left in place** on rollback (reverting them only re-opens advisor findings).
PITR confirmed: **N/A — non-destructive, PITR not required.**
Destructive-migration flag: **none.**

---

## Merge Sequence (conductor executes at Ship)

1. Apply migration to production FIRST: `supabase db push --project-ref <prod-ref>` — expect both NOTICEs, no EXCEPTION (in-migration post-check is fail-closed; a wrong end-state aborts the apply).
2. Merge PR #32 → Vercel auto-deploys (no app-code change, so deploy is a no-op behaviourally).
3. Re-confirm prod advisors: V1 4→0, V2 4→0, V3 4→1 (is_admin).
4. Smoke: pricing replace, an order INSERT (reference + audit row), HACCP search.

---

## Production ship record (2026-06-13)

Shipped via FORGE Ship. Migration applied to prod `uqgecljspgtevoylwkep` via Supabase MCP `apply_migration` (`{"success":true}`; both in-migration guards passed). PR #32 squash-merged to `main` (`2a5021f`); branch + Supabase preview branch auto-deleted.

Production verification (post-apply, live pg_proc/has_function_privilege probe):

| function                  | mode    | search_path | anon | authenticated | service_role |
| ------------------------- | ------- | ----------- | ---- | ------------- | ------------ |
| replace_agreement_lines   | DEFINER | pinned      | ✗    | ✗             | ✓ (app)      |
| is_admin                  | DEFINER | pinned      | ✗    | ✓ (by design) | ✓            |
| orders_audit_trigger      | DEFINER | pinned      | ✗    | ✗             | ✗            |
| order_lines_audit_trigger | DEFINER | pinned      | ✗    | ✗             | ✗            |
| generate_order_reference  | INVOKER | pinned      | —    | —             | —            |
| haccp_search              | INVOKER | pinned      | —    | —             | —            |
| set_updated_at            | INVOKER | pinned      | —    | —             | —            |

Matches the target contract row-for-row: search_path pinned ×7 (mutable 4→0); no anon EXECUTE on any of the 4 SECURITY DEFINER functions (anon-definer 4→0); `is_admin` retains authenticated (auth-definer = 1, by design); `replace_agreement_lines` retains service_role; `generate_order_reference` normalized to INVOKER. Prod app smoke: `/login` 200, `GET /api/kds/orders` 200, forged admin cookie → 307. Preview smoke 8/8.

Note: the merge was briefly blocked by the migration-lock hook because this cert's `Branch:` line had backticks — the hook strips whitespace but NOT backticks, so the value must be the bare branch name. Corrected before merge.

## Verdict

✅ CLEARED FOR PRODUCTION — shipped & verified live 2026-06-13.
