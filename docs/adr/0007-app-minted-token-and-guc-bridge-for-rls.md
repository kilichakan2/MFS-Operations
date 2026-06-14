# 0007 — App-minted token + GUC bridge for per-request RLS identity

## Status

Proposed (raised by grill on 2026-06-14 during FORGE Frame for F-RLS-03 — awaiting planner/human acceptance). Clarifies and supersedes the **mechanism** described in ADR-0004 (RLS vs service-role security model); ADR-0004's target posture (RLS-on, service-role demoted to admin-only behind `requireServiceRole()`) is unchanged.

## Context

ADR-0004 (Accepted, 2026-06-06) defines F-RLS-03 as introducing *"a per-request **authenticated** client built from the anon key plus the user's **JWT**"* — the client Postgres evaluates RLS policies against. That description assumes the application uses **Supabase Auth**, so that every logged-in user carries a Supabase-issued JWT the database can verify and read claims from.

The codebase does not match that assumption:

- **No Supabase Auth.** Login (`app/api/auth/login/route.ts`) issues a *custom* HMAC-signed cookie (`mfs_session`) via `lib/adapters/web-crypto/SessionTokens.ts`. The app never calls Supabase Auth and no Supabase access-token/JWT is ever issued or stored. Middleware verifies the custom cookie and injects `x-mfs-user-*` headers.
- **Policies are GUC-based, not JWT-based.** Every existing RLS policy (orders, order_lines, customers, products, users, visits, complaints, discrepancies, audit_log) keys off the Postgres session variable `current_setting('app.current_user_id')` — **not** `auth.uid()` / `auth.jwt()`. There is no policy anywhere referencing the Supabase identity functions.
- **The GUC is currently never set.** `app.current_user_id` is populated nowhere at runtime (see deferred-wiring comments in `lib/services/OrdersService.ts` and `lib/adapters/supabase/OrdersRepository.ts`). All 83 user-facing routes reach the database through the `service_role` key, which bypasses RLS entirely, so the policies are dormant.

Therefore F-RLS-03 cannot be built as ADR-0004 literally describes: there is no Supabase JWT to thread, and rewriting the entire existing policy corpus to `auth.uid()` would be a large, high-blast-radius change that contradicts ADR-0004's own "no table policies change in this unit; switch one table at a time" sequencing.

Two viable directions were considered (FORGE Gate 1, 2026-06-14):

1. **App-minted token + GUC bridge** (keep existing GUC policies unchanged).
2. **Rewrite every existing policy to read JWT claims** (`app.current_user_id` → `auth.uid()`).

## Decision

Adopt **direction 1 — app-minted token + GUC bridge.**

- **Per request**, the app mints a short-lived token signed (HS256, Web Crypto HMAC — the same primitive already used for `mfs_session`, so **no new dependency**) with the Supabase project **JWT secret**, carrying `{ role: 'authenticated', user_id }`.
- The per-request **authenticated client** is the Supabase anon-key client with that token as its `Authorization: Bearer`. It runs as the Postgres `authenticated` role, so RLS is evaluated (unlike `service_role`, which bypasses it). The client factory lives inside `lib/adapters/supabase/` — a Supabase client is a vendor type and must not cross the adapter boundary.
- A **`db-pre-request` hook** (a Postgres function configured via `pgrst.db_pre_request` on the `authenticator` role) reads the token's `user_id` claim and writes it to `app.current_user_id` via `set_config(..., is_local := true)`, so the **existing GUC policies fire unchanged**. The hook is defensive: it never throws, and with no/invalid claim it leaves the GUC empty (fail-closed = deny).
- The token secret (`SUPABASE_JWT_SECRET`) is **server-side only** (never `NEXT_PUBLIC_`); tokens are minted server-side, short-lived, and never sent to the browser.
- F-RLS-03 is **introduce-only**: it ships the client + minter + bridge + `requireServiceRole()` escape hatch and proves the mechanism with a preview integration test. It flips **zero** production routes. The bridge is inert for current `service_role` traffic. Per-table cutover (starting with Orders, PITR-gated) happens in F-RLS-04a onward.

Direction 2 was rejected: it rewrites the entire existing policy corpus in one move, enlarges the blast radius, and breaks ADR-0004's one-table-at-a-time sequencing.

## Consequences

**Easier.** The substantial investment in GUC-based policies (baseline + 20260601 + the T2/T3 hardening) is preserved verbatim — no policy is rewritten to land per-request identity. The change is hexagonally clean (no new dependency; vendor client stays inside its adapter; services stay vendor-free). Shipping the bridge is non-destructive and observably inert until the first route is cut over, so F-RLS-03 carries no PITR gate and has a trivial rollback (unset the pre-request hook).

**Harder.** A new server-side secret (`SUPABASE_JWT_SECRET`) must be provisioned in every environment (Vercel Prod + Preview, local `.env.test.local`) before Render. The `db-pre-request` hook is global PostgREST config: every API request runs it once it's set, so it must be written to never error (a throwing hook would fail-closed *all* authenticated-role traffic). Identity now travels as a minted token rather than a Supabase-Auth session, so token lifetime, claim shape, and clock-skew handling become owned concerns. The app diverges from the "stock Supabase Auth + `auth.uid()`" idiom most Supabase documentation assumes — a future reader must consult this ADR to understand why.

## References

- ADR-0004 — RLS vs service-role security model (the posture this ADR keeps; the JWT *mechanism* it corrects).
- ADR-0002 — Hexagonal shape and naming (`AuthenticatedDbAdapter`, `requireServiceRole()`).
- ADR-0003 — Strangler-fig migration and FREEZE rule (the F-RLS-04 per-domain sequencing this unit precedes).
- `supabase/migrations/20260101000000_baseline.sql` — existing GUC-based policies (`app.current_user_id`).
- `supabase/migrations/20260601_001_fix_session_var_and_audit_security.sql` — orders/order_lines GUC policies + `is_admin()`.
- `lib/adapters/web-crypto/SessionTokens.ts` — the HMAC primitive reused to mint the Supabase token.
- `middleware.ts` — custom `mfs_session` verification + `x-mfs-user-*` header injection (the identity source threaded to the minter).
