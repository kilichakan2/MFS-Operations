# 16-Day Production Roadmap — 2026-06-12 → 2026-06-27

**Goal (Hakan, 2026-06-12):** complete EVERYTHING remaining on the hexagonal
migration roadmap — nothing skipped — and have every module of the app
production-ready by the end. This includes Phases 2–5, the full RLS security
track, all open tech debt, both infra follow-ups, and both tracked product
features.

**Starting point:** Phase 1 closed (F-09 re-gate PASS, HEAD `5d97abb`),
15 of ~38 roadmap PRs shipped. Required pace: ~2.5–3 PRs/day, every day,
weekends included. There is NO slack day — slippage surfaces immediately.

### RESCOPE — 2026-06-13 (Hakan-approved)

The 3 CRITICAL SECURITY INSERTIONS (T1/T2/T3) were inserted scope, not slots in
the day plan. They consumed real days: T1 rode Day 1 (Thu 12 Jun); **T2 + T3
consumed all of Fri 13 Jun**. So the original "Day 2" content (F-TD-01, F-TD-09)
never started, and **every content block from Day 2 onward shifts +1 calendar
day**. New end date: **Sat 28 Jun** (was Fri 27 Jun). Scope unchanged — nothing
dropped (the "nothing skipped" goal holds). The named fallback (defer Day-16
nice-to-haves F-INFRA-03 + F-TD-12 to BACKLOG) is held IN RESERVE — triggered
only if a later block slips again (checkpoint: end of Day-12 block, 24 Jun).

Content-block → new calendar date:

- Day 2 (F-TD-01, F-TD-09) → **Sat 14 Jun** ◀ next
- Day 3 → Sun 15 Jun · Day 4 → Mon 16 Jun · Days 5–6 → Tue 17–Wed 18 Jun
- Day 7 → Thu 19 Jun · Day 8 → Fri 20 Jun · Day 9 → Sat 21 Jun
- Day 10 → Sun 22 Jun · Day 11 → Mon 23 Jun · Day 12 → Tue 24 Jun
- Days 13–14 (HACCP crunch) → Wed 25–Thu 26 Jun · Day 15 → Fri 27 Jun
- Day 16 (seal + close) → **Sat 28 Jun**

The "Day N" headers below are CONTENT labels; read dates from this rescope map.

**Delivery loop per unit:** FORGE (4 gates) → ANVIL cert → squash-merge →
archive plan. Domain units copy the F-13-onward composition-root template
(`lib/wiring/<domain>.ts`); the ESLint adapter-import guard is already live.

**RLS slices:** each domain's RLS migration (F-RLS-04 series) rides in the
same day as its domain unit, per the roadmap's "Orders RLS lands with
Phase 1, Users RLS with F-13" rule.

---

## Schedule

### Day 1 — Thu 12 Jun ✅ DONE

- ✅ **F-RLS-01** — RLS audit + threat model → `docs/rls-audit-2026-06-12.md` (advisors + per-table map; surfaced 3 criticals: unsigned session cookie = priv-esc, 42 RLS-off tables exposed via PostgREST, anon-callable `replace_agreement_lines`)
- ✅ **F-RLS-02** — per-table expand-contract RLS plan → `docs/rls-expand-contract-plan-2026-06-12.md` (6-step sequence, policy templates, slice schedule, rollback per step)
- ✅ **F-TD-13** — `annualReview.test.ts` midnight flake fix (commit `32fbec7`; 182/182 green)
- ✅ **F-TD-08** — `kds.test.ts` pin_hash clobber fix (commit `32fbec7`; verified no residue)

### ⚠️ CRITICAL SECURITY INSERTIONS — pulled forward from the F-RLS-01 audit (Hakan, 2026-06-12)

The Day-1 audit (`docs/rls-audit-2026-06-12.md`) surfaced 3 criticals NOT in the
original roadmap. Hakan's decision (2026-06-12): **do all three now, before
resuming the Day-2 order**, each through the **full FORGE loop + ANVIL cert +
ship gate** (no frame-light — these touch production auth and the production DB).
Run in severity order:

- ✅ **T1 — sign the `mfs_session` cookie.** SHIPPED 2026-06-12 (PR #30, squash
  `88af11d`). HMAC-SHA256 via port `lib/ports/SessionTokens.ts` + Web Crypto
  adapter `lib/adapters/web-crypto/` + wiring `lib/wiring/session.ts`; middleware
  verifies, fails closed, clears + redirects. `SESSION_SECRET` set in Vercel
  Production AND Preview (distinct values). Full FORGE + ANVIL cert
  (`docs/anvil/2026-06-12-t1-sign-session-cookie-cert.md`); preview smoke 8/8;
  prod smoke green incl. forged-admin-cookie bounce verified live. Residual
  logged as **F-TD-14** (32 `/api/haccp/*` routes on unsigned `mfs_role` —
  rides T4). Plan archived. One-time mass re-login occurred at deploy.
- ✅ **T2 — enable RLS on the 42 exposed tables (step-1-only fast pass).** SHIPPED
  2026-06-13 (PR #31, squash `90aa565`). One migration
  (`supabase/migrations/20260613000000_enable_rls_42_tables.sql`): drift-guard DO-block
  - 42× `ALTER TABLE … ENABLE ROW LEVEL SECURITY` (ENABLE never FORCE) + FORCE/enabled
    post-check, all in one transaction. Applied to prod via Supabase MCP
    `apply_migration`. Full FORGE + ANVIL cert
    (`docs/anvil/2026-06-13-t2-enable-rls-cert.md`); preview smoke 8/8; prod verified —
    advisor `rls_disabled_in_public` ERROR **42 → 0** (now 42× INFO `rls_enabled_no_policy`,
    benign deny-all), anon-key read of `cash_entries`/`haccp_health_records` → `[]` on live
    data, app smoke green. Non-destructive (PITR not required); rollback = DISABLE on the 42.
    Per-table policies still land per-domain in F-RLS-04a–i. Plan archived.
- ✅ **T3 — harden the SECURITY DEFINER functions.** SHIPPED 2026-06-13 (PR #32,
  squash `2a5021f`). One migration
  (`supabase/migrations/20260613020000_harden_security_definer_fns.sql`): pinned
  `search_path = public` on the 4 mutable functions, revoked anon/PUBLIC (+authenticated
  where safe) `EXECUTE` on the 4 SECURITY DEFINER functions — keeping `service_role` on
  `replace_agreement_lines` and `authenticated`+`service_role` on `is_admin` (RLS policies /
  F-RLS-03 need it; residual `authenticated_security_definer` = 1 is BY DESIGN), zero grants
  on the 2 audit triggers; and normalized `generate_order_reference` to `SECURITY INVOKER`
  (reconciling a prod-vs-migration-files drift — Hakan-approved). Fail-closed pre-guard +
  post-check. Applied to prod via Supabase MCP. Prod verified: advisor mutable 4→0,
  anon-definer 4→0, auth-definer 4→1 (is_admin), app smoke green. Preview smoke 8/8.
  Non-destructive (PITR not required); rollback = re-GRANT. 3 implementer ejects en route
  (signature-format bug, prod drift, migration-version collision → F-TD-15). Plan archived.
  **All three CRITICAL SECURITY INSERTIONS (T1/T2/T3) now shipped — resume the Day-2 order.**

After all three ship, resume the Day-2 order below.

### Day 2 content — rescoped to Sat 14 Jun (see RESCOPE banner)

- ✅ **F-TD-01** — SHIPPED 2026-06-14 (PR #33, squash `72cb80b`). Cleared all 60 `tsc --noEmit` errors + all 58 `next lint` problems to 0/0; added `typecheck` npm script. ~50 mechanical type fixes (dominant: 27 Supabase embedded-relation casts) + 55 cosmetic lint (jsx-key, unescaped entities, 1 aria) + ~10 documented real-bug fixes (dead duplicate `recalc`, `logNew` dedup → user-visible label flip to `'Yeni Kayıt'`, restored `saveTimer` ref, 2 HACCP exhaustive-deps with safe callback reorder, test no-overlap/always-truthy fixes). ZERO new suppressions (grep-verified). Guard SHIP (0 findings); ANVIL CLEARED (unit 1528/1528, integration 115/115, preview 8/8 @critical, prod smoke 3/3). Non-destructive (no migration/PITR). **Gate consequence: `main` now tsc 0 / lint 0 → ANVIL layers 3+4 run STRICT for every later unit.** En route: surfaced + fixed a global FORGE formatter-hook bug (`format.sh` was imposing prettier defaults on this no-prettier repo; now gated behind config-present). Cert `docs/anvil/2026-06-14-f-td-01-clear-tsc-lint-cert.md`; plan archived.
- ✅ **F-TD-09** — SHIPPED 2026-06-14 (PR #34, squash `29987df`). Daily Vercel cron (`/api/cron/purge-idempotency-keys`, `0 3 * * *`, Bearer `CRON_SECRET`) → `ordersService` → new port `purgeExpiredIdempotencyKeys(now)` → Supabase adapter `DELETE … WHERE expires_at <= now` (count via `.select`); Fake no-op. W1 TOCTOU: both `createOrder` reclaim deletes now conditional (`expires_at <= now` / `order_id = existing.order_id`) — one captured `now`. N1: raw `idempotencyKey` dropped from the race-winner error log. N3: 2 stale `Order.ts` comments repointed off deleted `lib/orders/validation.ts`. No new deps; rip-out PASS. Guard FIX-THEN-SHIP (0 🔴, 1 🟡 = missing integ tests → ANVIL wrote I2/I3/I4). ANVIL CLEARED: unit 1533/1533, integration 122/122 (was 115), preview 8/8 @critical, prod smoke 4/4 (login 200, kds/orders 200, forged-cookie 307, cron-unauth 401). Non-destructive (no migration/PITR). Cert `docs/anvil/2026-06-14-f-td-09-idempotency-key-hygiene-cert.md`; review `docs/reviews/2026-06-14-…-review.md`; plan archived. Follow-ups → BACKLOG F-TD-16 (🔵 W1 comment reword + CRON_SECRET-unset hardening on both cron routes).

### Day 3 — Sat 14 Jun

- **F-TD-04** ✅ SHIPPED (2026-06-14, PR #35 / `e0c5fcd`, prod-verified) — lazy `getSupabaseService()` + back-compat proxy, moved `lib/supabase.ts` → `lib/adapters/supabase/client.ts`, codemod 88 imports, deleted env-stub shim. unit 1536 (shim gone) · int 122 · preview 8/8 · prod smoke 5/5.
- **F-10** ✅ SHIPPED (2026-06-14, PR #36 / `684a94f`, prod-verified) — `PasswordHasher` port + sole-import bcrypt adapter + `lib/wiring/password.ts` singleton; 4 routes (login, kds-pin, admin/users, admin/users/[id]) re-pointed; lint extended to forbid bcryptjs outside its adapter. TOTAL compare (never throws). unit 1552 (+16) · int 122 · preview 8/8 · prod smoke 4/4 non-500. No migration. Behaviour-preserving (cost-10 hashes still verify through cost-12 adapter, proven at unit + integration).
- **F-12** ✅ SHIPPED (2026-06-14, PR #37 / `e4b9740`, prod-verified) — `LLMExtractor` port + sole-import Anthropic adapter (`lib/adapters/anthropic/`) + `lib/wiring/llm.ts` singleton + `Fake` adapter; `admin/import` route thinned onto the port. PURE RELOCATION — `claude-sonnet-4-6` + forced tool-use + both prompts/tool schemas moved byte-identical (verified); lint extended to forbid `@anthropic-ai/sdk` outside its adapter (mirrors F-10 bcryptjs). No new dep, non-destructive. unit 1581 (+29) · int 122 · preview 8/8 · prod smoke non-500. **Day-3 block COMPLETE (F-TD-04 ✓, F-10 ✓, F-12 ✓).**

### Day 4 — Sun 15 Jun ✅ COMPLETE

- **F-RLS-03** ✅ SHIPPED (2026-06-14, PR #38 / `e55dcc7`, prod-verified) — INTRODUCE-ONLY per-request authenticated DB client. App-minted HS256 token (web-crypto, **no new dep**) + `db-pre-request` GUC bridge migration (`20260614210221`) copying the `user_id` claim into `app.current_user_id` → existing GUC policies fire unchanged (ADR-0007 supersedes ADR-0004's JWT mechanism). New `DbTokenMinter` port + web-crypto adapter; `authenticatedClientForCaller()` + `requireServiceRole()` Supabase adapter; lint pins. **Zero prod routes flipped**; migration non-destructive + inert (no PITR). unit 1595 (+14) · int 126 (rls-bridge 4/4 RAN) · tsc/lint 0 · preview 8/8 @critical · prod smoke non-500 (`/api/auth/team` 200 = 7 real users through the hook, inert confirmed). Cert `docs/anvil/2026-06-14-f-rls-03-…-cert.md`; ADR-0007. **En route: surfaced F-INFRA-05** (Supabase→Vercel preview cred-sync broken; unblocked this PR via manual env bridge — MUST fix before F-RLS-04a).
- **F-INFRA-05** ✅ SHIPPED (2026-06-15, PR #41 / `472d3f5`; supersedes closed #39) — owned GitHub Action + Node orchestrator (`.github/workflows/preview-cred-sync.yml` + `scripts/preview-cred-sync*`, **zero new deps**) that syncs the 3 Preview-scoped branch DB creds the native Supabase↔Vercel integration doesn't inject; native keeps Production, this owns Preview only. Retires the F-RLS-03 manual env bridge. Proven live end-to-end on a fresh 14-digit preview branch (health poll → creds synced redacted → JWT warn-continue → redeploy `READY` as Preview). CI tooling only — no app code, no migration, no PITR. Cert `docs/anvil/2026-06-15-f-infra-05-…-cert.md`. **Residual → F-RLS-04a:** Mgmt API withholds `SUPABASE_JWT_SECRET` (asymmetric-key migration) → preview JWT must be sourced another way.
- **F-RLS-04a** ✅ **SHIPPED 2026-06-15 (PR #42 / `91c1091`)** — Orders-context RLS cutover. First unit to flip **real production Orders traffic** onto RLS via the per-request authenticated client. Front-door routes (`GET /api/orders`, `GET+PUT /api/orders/[id]`, `GET+POST /api/orders/[id]/picking-list`) now run as the `authenticated` role; create + KDS stay service-role (deferred). Additive migration `20260615173901` (orders_delete / order_lines_delete / orders_print_placed) applied to prod via `apply_migration` (non-destructive, no PITR; policies verified live). Clock-skew fix shipped (iat−30/exp+120). FORGE+ANVIL: unit 1661 · tsc/lint 0 · integration 138 (orders-rls 12/12) · **preview smoke 8/8 incl. authenticated Orders routes — JWT-secret-on-preview bet CONFIRMED** · prod deploy-health non-500. Guard found + the team accepted (low-sev, logged) a placed→completed skip-print looseness → **F-RLS-04a-print-guard**. Cert `docs/anvil/2026-06-15-f-rls-04a-orders-rls-cutover-cert.md`. Follow-ups: F-RLS-04a-create, F-RLS-04a-kds, F-RLS-04a-print-guard. Spec record below:
  - **Spec locked at FORGE Frame 2026-06-15 (grill):**
  - **Scope = front-door Orders routes only:** flip reads+writes of `/api/orders`, `/api/orders/[id]`, `/api/orders/[id]/picking-list` onto the authenticated DB client (expand-contract **steps 3–4**). Existing GUC policies on `orders`/`order_lines`/`order_audit_log` are reused and RLS is already on (T2) → **no migration expected**. Keep the service-role path as the parachute; **steps 5–6 (remove fallback) deferred** until KDS is also cut over.
  - **`order_idempotency_keys` stays service-role** (plumbing, not user data; RLS-on-deny-all already shut anon; no policy written).
  - **Audit `user_id` auto-fixed** for the front-door routes — the shipped GUC bridge sets `app.current_user_id` from the token; `order_audit_log` insert policy + trigger already exist.
  - ✅ **Clock-skew fix (was F-RLS-03 Guard 🟡):** `DbTokenMinter` → `iat = now − 30s`, `exp = now + 120s` (server-only token, safe). Must land before flipping any route.
  - ✅ **`SUPABASE_JWT_SECRET` on preview RESOLVED:** set statically one-time (= parent project's secret) in Vercel **Preview + Production** (done 2026-06-15). Preview branches inherit the parent secret → no per-branch sync needed (sidesteps F-INFRA-05's API limit). Proven for real in ANVIL's preview smoke (fail-**closed** if the inheritance assumption is wrong → safe).
  - **PITR:** no destructive DDL expected, but **confirm PITR enabled as a safety net at ANVIL Lock** (`/pitr-confirmed`) since it flips live Orders. Rollback = revert the one wiring line (RLS stays on, app back to service-role = safe resting state).
  - 🚫 **KDS carved OUT → F-RLS-04a-kds** (below): KDS routes use a side-door identity (public kiosk; `butcher_id` in the request body, not the front-door session) that the session-minted authenticated client can't feed without separate work. They stay service-role this slice.
- **F-RLS-04a-kds** (NEW follow-up, carved from F-RLS-04a at Frame 2026-06-15; logged in BACKLOG) — cut the KDS routes (`/api/kds/orders` read + `/api/kds/lines/[lineId]/done` write) onto RLS. Needs a different identity bridge (validate `butcher_id` → set `app.current_user_id` / mint a token for the KDS path). Also closes the **KDS audit-attribution gap** (KDS line-done currently records a NULL user under service-role — the busiest Orders mutation). Schedule after F-RLS-04a proves out. ⚠️ Until done, Orders steps 5–6 (remove the service-role fallback) cannot fully complete.
- **F-TD-07** ✅ DONE (2026-06-15) — prod hygiene audit for `ANVIL-TEST-*` rows. Read-only audit of prod (`uqgecljspgtevoylwkep`): exact `ANVIL-TEST-%` prefix + widened `anvil/e2e/fixture/test/sentinel` sweep across `users`/`customers`/`products` + orders referencing them. **0 fixture rows** (live-data sanity counts: 11 users / 107 customers / 285 products / 8 orders — all real, incl. `MFS-2026-0008`). No delete decision needed; risk now structurally prevented by F-TD-03's local-DB runner + identity probe. Record `docs/anvil/2026-06-15-f-td-07-anvil-test-row-audit.md`. **→ Day 4 COMPLETE.**

### Days 5–6 — Mon 16 – Tue 17 Jun

- **F-13** Users + Auth (3 PRs; login route is the most critical surface). Absorbs: **ARCH-FU-01** (Role → `lib/domain/`), **ARCH-FU-03** (callerUserId decision), **ARCH-FU-04** (round-trip-read test pattern + retrofit), **F-TD-05** (cross-service import pin), expansion of the F-08 UsersRepository seed. Planner MUST copy the composition-root template.
  - **PR1 ✅ SHIPPED 2026-06-15 (PR #43, squash `7d482c6`)** — Users-domain foundation, PURE hexagonal extraction, ZERO behaviour change, NO route edited, NO migration. Role→`lib/domain/Role.ts` (ARCH-FU-01, UserSummary.role tightened to the union); expanded `UsersRepository` port (9 methods, each mapped 1:1 to a committed PR2/PR3 route) + Supabase(service-role)+Fake adapters + shared contract; `UsersService` (composes UsersRepository + PasswordHasher); `lib/wiring/users.ts` (service-role singleton, F-RLS-04b per-caller seam commented); ARCH-FU-03 dead `callerUserId` removed from `editOrder`; ARCH-FU-04 round-trip pattern + OrdersService retrofit; F-TD-05 cross-service ESLint ban + load-from-disk pin. **Credential-hash design (the load-bearing call):** two return types — `UserSummary` (no hash field, the only thing list/profile reads return) vs `UserCredential` (carries `passwordHash`/`pinHash`, returned ONLY by `findCredentialByName`/`listCredentialsByRoles`, consumed only by login PR3 + kds-pin PR2) → a hash leak on a normal read is a COMPILE error, backed by a proven-falsifiable runtime leak test on both adapters. No new deps; rip-out PASS. FORGE+ANVIL: unit 1712 · tsc/lint 0 · integration 163 (UsersRepo contract 22 + users_auth_check fires 3, vs real Postgres) · E2E @critical 8/8 · prod smoke 6/6 non-500. Cert `docs/anvil/2026-06-15-f-13-pr1-users-domain-foundation-cert.md`; review persisted; plan archived. **Introduce-only — no prod route calls the new engine yet.**
  - **PR2 ✅ SHIPPED 2026-06-15 (PR #44, squash `96c8a33`)** — re-pointed the 6 non-login routes (`auth/type`, `auth/team`, `auth/kds-pin`, `auth/haccp-team`, `admin/users` GET+POST, `admin/users/[id]` PATCH+DELETE) through `usersService`. PURE re-pointing, behaviour byte-identical, ZERO port/service/wiring churn (PR1 built the full surface), NO migration, NO new dep. The 6 routes dropped their direct `@supabase/*`/adapter imports → Users rip-out cost falls from "6 routes + adapter + wiring" to "adapter + wiring". **Central constraint:** read routes map the service's camelCase domain objects back to the DB's snake_case JSON the UI reads (R-MF-2, pinned). **Latent bug preserved deliberately:** PATCH on a missing id returns 500 (not 404) to stay byte-identical → logged **F-TD-20** (R-MF-1). kds-pin reads `pinHash`, keeps null-skip + activeOnly + role filter (R-MF-3, existing `kds.test.ts` green unchanged). FORGE+ANVIL: unit 1712 · tsc/lint 0 · integration 163 (+3 new pins in `admin-users.test.ts`) · pgTAP 66/66 · **first real F-13 preview smoke 8/8 @critical** (incl. KDS PIN flow) · **prod smoke 6/6 non-500** (3 sessionless reads 200 = re-point works live; admin 307 fail-closed). Cert `docs/anvil/2026-06-15-f-13-pr2-repoint-user-routes-cert.md`; review `docs/reviews/2026-06-15-f-13-pr2-repoint-user-routes-review.md`; plan archived. **First PR that actually changes live behaviour — proven healthy on prod.**
  - **PR3 ✅ SHIPPED 2026-06-16 (PR #45, squash `903de69`)** — re-pointed `auth/login` alone through `usersService` (the highest-risk surface, isolated on purpose). Credential read → `findCredentialByName`, last-login stamp → `recordLogin`; dropped the route's direct `@supabase/*` import (rip-out improved to "adapter + wiring"). Behaviour byte-identical on every reachable path; NO migration, NO new dep. **R1 (pinned):** unknown-user path flipped from a `PGRST116` branch to a `null` return — the `if (!user)` branch still calls `recordFailure(name)` so unknown-name attempts keep counting toward lockout (integration: unknown name 5× → 6th=429). **R2 (pinned):** inner try/catch keeps a DB-read failure at `500 'Database error'`, not the outer `Server error`. **Guard found 🟡 W1:** the route's old `.single()` → adapter's `.maybeSingle()` differs ONLY when two+ rows share a name (case-insensitive `.ilike`, no `users.name` uniqueness) — old=401+recordFailure, new=500 no-recordFailure. Operator-error edge, accepted; spawns committed follow-up **F-TD-22** (name-uniqueness guard, Hakan-requested). **Latent (deferred):** inactive-account disclosed before credential check → **F-TD-21**. FORGE+ANVIL: unit 1721 · tsc/lint 0 · integration 173 (auth-login 10/10 incl. R1 lockout) · pgTAP 66/66 · **preview smoke 8/8 @critical** (real password + PIN login through the re-pointed route) · **prod smoke 5/5 non-500**. Cert `docs/anvil/2026-06-16-f-13-pr3-repoint-login-cert.md`; review `docs/reviews/2026-06-16-f-13-pr3-repoint-login-review.md`; plan archived. **F-13 COMPLETE — all 3 PRs shipped; login now runs through the Users engine. Next: F-RLS-04b (Users-context RLS) + F-TD-22.**
- **F-RLS-04b** — Users-context RLS migration

### Day 7 — Wed 18 Jun

- **F-11** — `Mailer` port + Resend adapter, 3 email helpers re-pointed (unblocked by F-13)
- **F-PROD-02** — KDS line-done undo (**30-min product session with Hakan first** to lock undo/cascade/audit rules, then build)

### Day 8 — Thu 19 Jun

- **F-14** — Delivery Routes domain (compressed to 2 PRs: ports+adapter+service, then route rewrites)
- **F-24** — `MapProvider` port + Leaflet adapter (rides with Routes — same screens)
- **F-RLS-04c** — Routes-context RLS

### Day 9 — Fri 20 Jun

- **F-15** — Pricing domain (2 PRs; absorbs `pricing-email.ts` raw-fetch per ADR-0005)
- **F-22** — `PdfRenderer` port + jsPDF adapter (rides with Pricing)
- **F-RLS-04d** — Pricing-context RLS

### Day 10 — Sat 21 Jun

- **F-16** — Cash domain (2 PRs; absorbs `detail/discrepancy` raw-fetch)
- **F-RLS-04e** — Cash-context RLS

### Day 11 — Sun 22 Jun

- **F-17** — Compliments + Complaints (2 PRs; absorbs 5 `screen2` + `detail/complaint` raw-fetch sites + complaint/compliment email helpers)
- **F-RLS-04f** — Complaints-context RLS

### Day 12 — Mon 23 Jun

- **F-18** — Visits / Screen 3 (2 PRs; absorbs `detail/visit` raw-fetch)
- **F-RLS-04g** — Visits-context RLS

### Days 13–14 — Tue 24 – Wed 25 Jun ⚠️ the crunch

- **F-19** — HACCP, largest domain (~30 routes; sub-domain split: audit, allergen, cold-storage, calibration, training, cleaning, recall — 5–8 PRs across both days)
- **F-23** — `SpreadsheetWriter` port + XLSX adapter (rides with HACCP export)
- **F-PROD-01** — Allergen Assessment version-history UI (rides with the allergen sub-domain)
- **F-RLS-04h** — HACCP-context RLS

### Day 15 — Thu 26 Jun

- **F-20** — Admin (3 PRs; absorbs `admin/geocode-all` + `map/data` raw-fetch)
- **F-21** — Dashboard split into `DashboardService` over the now-existing repositories (1 PR)
- **F-25** — `PushSender` port + web-push adapter
- **F-26** — `LocalCache` port + Dexie adapter
- **F-RLS-04i** — Admin-context RLS

### Day 16 — Fri 27 Jun — seal + close

- **F-27** — ESLint rule extended to ALL vendor SDKs outside `lib/adapters/**` (+ no-eslint-disable check per F-TD-11 Guard note) — the Lego principle gets teeth
- **F-RLS-final** — retire service-role from all user-facing paths; `requireServiceRole()` for admin routes; lint rule
- **F-TD-12** — retire legacy `lib/orders/types.ts` wire shapes from the 5 UI pages
- **F-INFRA-03** — preview smoke in GitHub Actions CI
- **F-INFRA-04** — re-enable Vercel Deployment Protection + automation bypass; drop `--unprotected`
- **Closing audit** — rip-out test re-run for EVERY domain (F-09-style, all-domains edition) + full regression (unit / integration / @critical)

---

## Standing constraints (carried from Phase 1)

- Prod migrations via Supabase MCP `apply_migration`, never `supabase db push`.
- No-reformat rule in every implementer prompt: no reformatting beyond changed lines; declare unavoidable reformatting.
- Preview smokes: `--unprotected` mandatory until F-INFRA-04 lands (day 16).
- Vercel first-build ERROR racing preview-branch provisioning is expected; automatic redeploy succeeds (3-for-3 pattern).
- Prod smoke surface: `GET /api/kds/orders` + login page only (middleware 307s everything else without a cookie).
- Baselines at sprint start: 1511 unit tests, tsc 60 (→0 after Day 2), lint 58 (→0 after Day 2).

## Where Hakan is needed

- Daily: the four FORGE gates per unit (spec / plan / test matrix / ship).
- Day 4: F-TD-07 ✅ done (audit clean, no delete needed). Day 4 complete.
- Day 7: F-PROD-02 product session (~30 min — undo rules).
- Day 16: final go/no-go on the closing audit.

## Risks (named up front)

1. **F-19 HACCP is the wildcard** (5–8 PRs estimated). If days 1–12 slip, HACCP eats the buffer that doesn't exist. Checkpoint: if Day 12 ends behind schedule, re-scope Day 16's nice-to-haves (F-INFRA-03, F-TD-12) before touching security items.
2. **No slack days; weekends are working days.** The pace (~2.5–3 PRs/day) matches our best Phase-1 days, sustained for 16 straight.
3. **RLS slices touch production data access.** Each F-RLS-04 migration ships expand-contract with a rollback path; any RLS regression halts the lane, not the sprint.
4. Days 14–15 are deliberately overloaded with small wrapper PRs (F-23/F-25/F-26) — these are the first candidates to shift into Day 16 if domains run long.

## Progress tracking

Mark each unit done here as it merges (same convention as BACKLOG.md).
This file is the sprint index; BACKLOG.md remains the deferred-items index.
