# Code-critic Guard review — F-RLS-04i Admin-context RLS

**PR:** #87 · **Branch:** feat/f-rls-04i-admin-context-rls · **Date:** 2026-06-27
**Verdict:** **CLEAR — no blockers. Hand to ANVIL.**

## What was run
| Check | Result |
|---|---|
| `npx tsc --noEmit` | PASS (exit 0) |
| Full unit suite (vitest) | PASS — 183 files, **2711 tests**, 0 failures |
| Affected-area subset (11 files) | PASS — 173/173 |
| `no-adapter-imports` lint pin (vitest) | PASS (no route/service imports an adapter) |
| `npm run lint` (ESLint) | BLOCKED by sandbox → ANVIL must run live (rule independently pinned by the green vitest above) |
| pgTAP `016` | Not executed (needs Docker/local Supabase) → judged statically; ANVIL must run live |

## Three must-fix risks — each CLOSED
- **R-VIS (cross-rep visibility) — CLOSED.** Analytics routes (`at-risk`/`commitments`/`prospects` ~:31) + `map/data` (:32) read via `visitsServiceForCaller`/`mapDataServiceForCaller` as the authenticated admin; cross-rep breadth via pre-existing `is_admin()` in the visits RLS policy. Proof: pgTAP 016 #17 (admin sees another rep's visit) / #18 (non-admin does not) — `supabase/tests/016-rls-admin-context.test.sql:201-214`; route tests assert factory minted with header id.
- **R-AUDIT (import audit-write under RLS) — CLOSED.** (a) audit `user_id: userId = caller.userId!` → passes `WITH CHECK (user_id=GUC)` (`import/confirm:182-188`, `import/manual:106-112`); (b) best-effort `.catch` preserved — audit rejection does NOT change the 201 (`import-confirm.route.test.ts:210-221`); (c) geocode fire-and-forget `.catch(()=>{})` (`import/confirm:136`, test :261); (d) R-GEOCODE-WRITE: `geocodeNewCustomers(customersService,...)` closes over the per-caller service (`import/confirm:40-43,136`), pinned by test wiring `customersSetCoords` onto the ForCaller mock. DB anti-spoof: pgTAP 016 #13/#14 (self-author OK / author-as-other → 42501).
- **R-SEC (forged-header / privilege escalation) — CLOSED.** Identity+role read ONLY from `x-mfs-user-*` headers via `requireRole` (`lib/auth/session.ts:78-100`); cookies never consulted. Forged-cookie attack test (admin cookie + non-admin header → 403) in `admin-context-route-guards.route.test.ts:93-101,186-194` + map-data/customers/products/import-confirm tests. Ghost-admin (secondary-role admin filtered → 403) at `:196-206`; filter at `session.ts:96`.

## Depth verdicts (4 new wiring factories) — all DEEP
- `customersServiceForCaller`, `productsServiceForCaller`, `auditLogForCaller`, `mapDataServiceForCaller` — each: mint short-lived token → build authenticated client → bind adapter(s) → return service. Genuine hidden behaviour, not forwarding.
- `mapDataServiceForCaller` mints ONCE, feeds both customers+visits from one client (`lib/wiring/mapData.ts:46-55`) — no double-mint / identity split; pinned by `adminContextForCaller.test.ts:178-205`.
- **Rip-out test: PASS** — swap DB vendor = one new adapter folder + one wiring file; routes/services/domain untouched; no adapter import in any route.

## Lower-severity findings
- 🔵 `app/api/admin/customers/[id]/route.ts:138` + `products/[id]/route.ts:62` — generic catch returns `{error: String(err)}` on 500 (raw-error leak). **Pre-existing known debt, explicitly out of scope.** New guard branches correctly placed ABOVE it (customers/[id]:130-136, products/[id]:54-60) so guard failures → 401/403, never the leaked 500. Not blocking.
- 🟢 Test quality strong — full 401(absent)/403(non-admin)/200(admin) triplet per route + asserts ForCaller NOT called on rejected request (guard short-circuits before DB). Byte-identical shapes preserved (7-key customer, 5-key product, `{rows}`, `{inserted,skipped}`). geocode-all test proves the old `?secret=geocode2024` bypass now → 403 (tightening).
- 🟢 No gratuitous reformatting / no shape drift. No package.json, no migration. Service-role singletons retained as rollback parachutes (pinned).

## `caller.userId!` non-null assertion — SAFE
`requireRole` throws `UnauthorizedError` before returning when userId null (`session.ts:84-86`); every `!` site is after requireRole returned. Mirror of F-RLS-04b users-route pattern.

## Loop-back
None. No 🔴. Hand to ANVIL. ANVIL must run live: full `npm run lint`, pgTAP 016 vs local Supabase, integration + preview smokes, and (multi-route auth/RLS cutover) a focused admin-screen browser walk confirming dashboards populate cross-rep against real preview data.
