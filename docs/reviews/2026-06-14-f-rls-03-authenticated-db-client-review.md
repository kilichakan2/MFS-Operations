# Code-critic review — F-RLS-03 authenticated DB client (PR #38)

- **Date:** 2026-06-14
- **Branch:** `feat/f-rls-03-authenticated-db-client`
- **Phase:** FORGE Guard
- **Verdict:** **SHIP** — no blockers. All 6 must-verify security properties PASS. Hand to ANVIL.

## Must-verify items — all PASS

1. **`set_config(..., true)` (is_local) — PASS** · `supabase/migrations/20260614210221_db_pre_request_guc_bridge.sql:72`. Identity is transaction-scoped, wiped per request → no pooled-connection identity bleed.
2. **Hook never throws — PASS** · migration `:54-67`. Claim parse wrapped in `BEGIN … EXCEPTION WHEN OTHERS THEN v_uid := NULL; END`; final `set_config` on `COALESCE(v_uid,'')` outside any raising path. Missing/invalid claim → empty GUC → deny (fail-closed).
3. **Genuine introduce-only / inert — PASS.** No route/`app`/`components`/`middleware`/`services`/`usecases` touched; `client.ts` byte-untouched; no table is `FORCE RLS` (service_role still bypasses, carries no `user_id` claim) → existing service_role routes cannot start failing.
4. **JWT correctness — PASS** · `lib/adapters/web-crypto/DbTokenMinter.ts:72-97`. Real 3-segment HS256 compact JWT; header `{alg:HS256,typ:JWT}`; payload `role:authenticated`, `sub`, `user_id`, `iat`, `exp=now+60s`. Secret read server-side only + lazily (`lib/wiring/dbToken.ts:19`).
5. **No new dependency — PASS.** `package.json`/lockfile diff empty vs main. Reuses `crypto.subtle` + present `@supabase/supabase-js`.
6. **No vendor leak — PASS.** Port `DbTokenMinter` vendor-free; `SupabaseClient` only inside its adapter; lint pins (cases 16-18) fence `createClient` + the new adapter from `app/**`/`lib/services/**`; only `lib/wiring/` imports the adapter.

## Depth verdicts
- **`DbTokenMinter` port + web-crypto adapter — DEEP.** Tiny interface hides claim assembly, JWT shape, base64url, HMAC, fail-closed secret check. Real seam (swap to jose/RS256 = one adapter + one wiring line).
- **`authenticatedClientForCaller()` — DEEP enough.** Encapsulates the load-bearing "anon key + Bearer + no session persistence = authenticated role" recipe.
- **`requireServiceRole()` — borderline thin wrapper, intentional** (named, greppable escape hatch per ADR-0004). 🔵 note only, not a defect.

## Findings
- 🟢 Integration test `rls-bridge.test.ts` is an honest skip (`CAN_RUN` guard), not a false green; deny case is a genuine RLS denial (anon has table GRANT at baseline, so zero-rows = policy not grant); isolation case (4.3b) exercises the `is_local` no-bleed property.
- 🟢 Test quality: behaviour-through-public-interface; minter test independently recomputes the signature + asserts wrong-secret failure + fail-closed throw; client test asserts anon-key-not-service-key.
- **🟡 SHOULD-FIX (follow-up, non-blocking) — 60s TTL, no clock-skew leeway** · `DbTokenMinter.ts:34,79`. `exp=now+60s`, `iat=now`, no negative leeway. Inert in F-RLS-03 (nothing uses the token); becomes an intermittent-401 risk at F-RLS-04a cutover if app/DB clocks drift. Fix at cutover: backdate `iat` ~5s or lengthen TTL. **Logged to BACKLOG against F-RLS-04a.**
- 🔵 `db_pre_request()` is `SECURITY DEFINER` (migration `:45`) — correct + necessary; `SET search_path = public` pinned (`:46`) closes the search-path hijack. Reviewed, no action.
- 🔵 `authenticatedClientForCaller` uses `!` non-null assertions on env (`:41-42`) — consistent with existing `client.ts` style; pre-existing pattern, not introduced-as-defect.
- 🟢 Hook prefers `user_id` claim, falls back to `sub` (migration `:60-63`) — harmless redundancy + robustness.

## Suite results
| Check | Result |
|---|---|
| Unit `DbTokenMinter.test.ts` | 6/6 PASS |
| Unit `authenticatedClient.test.ts` | 5/5 PASS |
| Lint pin `no-adapter-imports.test.ts` (incl. 3 new) | 18/18 PASS |
| `tsc --noEmit` | PASS (0) |
| `eslint` on 4 new source files | PASS (0) |
| Integration `rls-bridge.test.ts` | Honest skip (needs `SUPABASE_JWT_SECRET` + migrated preview DB); runs in CI preview |
