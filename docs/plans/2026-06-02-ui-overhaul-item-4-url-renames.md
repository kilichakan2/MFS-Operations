# Item 4 — URL renames + 302 redirects

## Goal
Rename four `/screenN` paths to semantic URLs (`/dispatch`, `/dashboard/admin`, `/admin`, `/map`), add Next.js 302 redirects from old → new, and update all in-repo consumers (nav matrices, parallel role maps, internal links, path-checking middleware, unit + E2E tests) so the rename is backward-compatible from commit 1 and the ANVIL chrome-matrix still clears 66/66.

## Source spec
This plan is the contract. Spec = the `/order` prompt for Item 4 (FORGE Frame brief + Q1 expansion + reviewer additions). No separate spec document exists per Hakan's explicit instruction.

## Compliance
**NO.** Tooling-only PR. No auth, payments, RLS, HACCP, legislation, or financial logic touched. Path strings only — role/permission relationships stay byte-identical (verified in middleware.ts, PwaGuard.tsx, login API, haccpPeople test fixture).

## Branch + base
- Branch: `feat/ui-overhaul-04-url-renames` (cut by implementer; not yet cut)
- Base: current `main` HEAD `3cfee10` (PR #7 squash)

## Locked rename table (302, `permanent: false`)
| Old | New |
|---|---|
| `/screen1` | `/dispatch` |
| `/screen4` | `/dashboard/admin` |
| `/screen5` | `/admin` |
| `/screen5/:path*` | `/admin/:path*` |
| `/screen6` | `/map` |

Note: `/screen5/` is flat on disk today (single `page.tsx`, no sub-directories). After rename, `/admin/` is also flat. The wildcard rule is forward-compat only; the redirect E2E asserts the rule **fires** (302 + `Location:` pattern match), NOT that the destination resolves.

---

## Files to change

### Brief deliverable 1 — redirects config (NEW)
- `next.config.ts` — add `async redirects()` returning 5 rules, all `permanent: false`. Do NOT remove or modify `typescript.ignoreBuildErrors: true` (out of scope per reviewer addition #1, logged as Item 6 debt). Do NOT touch `eslint.ignoreDuringBuilds`, `experimental.typedRoutes`.

### Brief deliverable 2 — directory renames via `git mv`
- `app/screen1/` → `app/dispatch/` (single `page.tsx`)
- `app/screen4/` → `app/dashboard/admin/` (`git mv` will auto-create the `app/dashboard/` parent)
- `app/screen5/` → `app/admin/` (single `page.tsx`, flat)
- `app/screen6/` → `app/map/` (single `page.tsx`)

### Brief deliverable 3 — RoleNav matrices
- `components/RoleNav.tsx` lines 74, 83, 90, 97, 114, 123, 124 (in `buildMatrix`) and 159, 166, 171, 176, 188, 195, 196 (in `buildSidebarItems`) — update all 14 `href` literals per the locked rename table. Translation keys (`navDispatch`, `navDashboard`, `navAdmin`, `navMap`) and icons stay untouched.

### Brief deliverable 4 — internal Link / router.push refs
- `app/screen4/page.tsx:580` `<KpiCard ... href="/screen1" />` — after the directory rename this becomes `app/dashboard/admin/page.tsx`; update href to `/dispatch`.
- (No other in-page `Link`/`router.push` refs to `/screen[1456]` exist in the repo per grep — verified.)

### Brief deliverable 5 — middleware path checks
- `middleware.ts:9-13` — update header docstring comment to reference new paths.
- `middleware.ts:33` `warehouse` — `/screen1` → `/dispatch`.
- `middleware.ts:34` `office` — `/screen1` → `/dispatch`.
- `middleware.ts:36` `admin` array — `/screen4` → `/dashboard/admin`, `/screen5` → `/admin`, `/screen6` → `/map`, `/screen1` → `/dispatch`.
- `middleware.ts:43-46` `ROLE_HOME` map — warehouse `/screen1` → `/dispatch`; office `/screen1` → `/dispatch`; admin `/screen4` → `/dashboard/admin`.
- `middleware.ts:132` comment — leave wording alone (comment refers to `/screen1 (dispatch log)` historically; update to `/dispatch (dispatch log)` since the comment now mentions the new name).
- Do NOT touch line 54 (`/api/screen1/sync` in `SHARED_API_PATHS`) — API path, excluded per spec.
- Do NOT change role/permission logic — only path strings.

### Q1 expansion A — PwaGuard
- `components/PwaGuard.tsx:21-23` `ROLE_HOME` — admin `/screen4` → `/dashboard/admin`; warehouse `/screen1` → `/dispatch`; office `/screen1` → `/dispatch`.
- `components/PwaGuard.tsx:30-32` `ROLE_ALLOWED_PREFIXES` — admin array swaps `/screen4`/`/screen5`/`/screen6`/`/screen1` for new paths; warehouse `/screen1` → `/dispatch`; office `/screen1` → `/dispatch`.

### Q1 expansion B — login API parallel role map
- `app/api/auth/login/route.ts:68-74` `ROLE_ROUTES` — warehouse `/screen1` → `/dispatch`; office `/screen1` → `/dispatch`; admin `/screen4` → `/dashboard/admin`.
- `app/api/auth/login/route.ts:196` fallback `?? '/screen4'` → `?? '/dashboard/admin'`.

### Q1 expansion C — login page fallback literal
- `app/login/page.tsx:80` `const dest = from ?? data.redirect ?? '/screen1'` → `?? '/dispatch'`.

### Q1 expansion D — haccpPeople test fixture (drift guard)
- `tests/unit/haccpPeople.test.ts:80` `admin` array — swap `/screen4`/`/screen5`/`/screen6`/`/screen1` for new paths to mirror PwaGuard after rename.
- `tests/unit/haccpPeople.test.ts:81` `warehouse` array — `/screen1` → `/dispatch`.
- `tests/unit/haccpPeople.test.ts:86-87` `ROLE_HOME` — admin `/screen4` → `/dashboard/admin`; warehouse `/screen1` → `/dispatch`.
- `tests/unit/haccpPeople.test.ts:95, 99, 101, 105, 107, 112` — the `'/screen4'` literals inside the `it()` bodies become `'/dashboard/admin'` (and the `it()` description strings update accordingly).

### Q1 expansion E — E2E auth + route-manager paths
- `tests/e2e/_auth.ts:104` docstring `(/screen4 by ROLE_HOME)` → `(/dashboard/admin by ROLE_HOME)`.
- `tests/e2e/_auth.ts:130` comment `Admin's role-home is /screen4` → `Admin's role-home is /dashboard/admin`. The actual `waitForURL` regex at line 131 already permits `dashboard`; no functional change.
- `tests/e2e/route-manager.spec.ts:35` comment `(/screen4)` → `(/dashboard/admin)`.
- `tests/e2e/route-manager.spec.ts:36` `await page.waitForURL('**/screen4', ...)` → `'**/dashboard/admin'`.

### Q1 expansion F — already covered
Covered by brief deliverable 4 above (the `KpiCard` in `app/screen4/page.tsx`).

### Unit test update (existing)
- `tests/unit/nav/desktop-sidebar-items.test.ts:35, 42, 48, 53, 67, 74, 75` — update the 7 asserted `href` literals to match the renamed paths. Index positions and lengths stay the same.

### E2E test update (existing — chrome-matrix)
- `tests/e2e/chrome-matrix.spec.ts:42` office array — `/screen1` → `/dispatch`, `/screen4` → `/dashboard/admin`.
- `tests/e2e/chrome-matrix.spec.ts:43` warehouse array — `/screen1` → `/dispatch`, `/screen4` → `/dashboard/admin`.
- `tests/e2e/chrome-matrix.spec.ts:45` admin array — `/screen4` → `/dashboard/admin`, `/screen5` → `/admin`, `/screen6` → `/map`.
- Do NOT touch the C1-C10 assertion functions (`clearanceDesktop`, `clearanceMobile`). Only `ROLE_ROUTES` const changes.

### E2E test addition (NEW)
- `tests/e2e/redirects.spec.ts` — 6 scenarios, no login required (redirects fire at the middleware/Next layer before auth). Each test issues an unauthenticated GET that does NOT follow redirects, then asserts `status === 307` (Next.js redirects() return 307/308 for `permanent:false`/`true` respectively; the brief says "302" but Next.js emits 307 by default for non-permanent redirects — see Risks for resolution) and `Location` header matches the expected new path.

  Scenarios:
  1. `GET /screen1` → 307 with `Location: /dispatch`
  2. `GET /screen4` → 307 with `Location: /dashboard/admin`
  3. `GET /screen5` → 307 with `Location: /admin`
  4. `GET /screen5/users` → 307 with `Location: /admin/users` (rule-fires assertion, destination 404 is acceptable)
  5. `GET /screen5/customers` → 307 with `Location: /admin/customers` (rule-fires assertion)
  6. `GET /screen6` → 307 with `Location: /map`

---

## Step-by-step commit sequence

Strict order per reviewer addition #2: redirects FIRST (so any intermediate build is backward-compatible from commit 1), then directory renames (one per commit; `git mv` preserves history), then consumers. No mega-commits.

- [x] **C1 — redirects config (backward-compat anchor).**
  - Edit `next.config.ts` to add `async redirects()` with all 5 rules, `permanent: false`.
  - Commit: `feat(routing): add 302 redirects for screen1/4/5/6 → semantic URLs`
  - Result: build still passes; old URLs now redirect even though directories still named `screenN`. (Next.js redirect rules match on URL pattern, not file system.) Verify: `npm run build && npm start` then `curl -I http://localhost:3000/screen1` returns 307 with `Location: /dispatch`.

- [x] **C2 — `git mv app/screen1 app/dispatch`.**
  - Commit: `refactor(routing): rename app/screen1 → app/dispatch`
  - After this commit `/dispatch` resolves directly AND `/screen1` 307s to `/dispatch`.

- [x] **C3 — `git mv app/screen4 app/dashboard/admin`.**
  - `git mv` will auto-create the `app/dashboard/` parent. If git refuses, `mkdir app/dashboard` then `git mv app/screen4 app/dashboard/admin`.
  - Commit: `refactor(routing): rename app/screen4 → app/dashboard/admin`

- [x] **C4 — `git mv app/screen5 app/admin`.**
  - Commit: `refactor(routing): rename app/screen5 → app/admin`

- [x] **C5 — `git mv app/screen6 app/map`.**
  - Commit: `refactor(routing): rename app/screen6 → app/map`

- [x] **C6 — middleware path checks.**
  - Update `middleware.ts` per file list above. Docstring + ROLE_PERMISSIONS + ROLE_HOME + line 132 comment.
  - Commit: `refactor(auth): point middleware path checks at renamed URLs`

- [x] **C7 — PwaGuard parallel map.**
  - Update `components/PwaGuard.tsx` ROLE_HOME and ROLE_ALLOWED_PREFIXES.
  - Commit: `refactor(pwa): update PwaGuard ROLE_HOME/ALLOWED to renamed URLs`

- [x] **C8 — Login API + login page fallback literals.**
  - Update `app/api/auth/login/route.ts` ROLE_ROUTES + line 196 fallback.
  - Update `app/login/page.tsx:80` fallback literal.
  - Commit: `refactor(auth): post-login redirect targets use renamed URLs`

- [x] **C9 — RoleNav matrices.**
  - Update `components/RoleNav.tsx` (14 href literals across `buildMatrix` + `buildSidebarItems`).
  - Commit: `refactor(nav): point RoleNav matrices at renamed URLs`

- [x] **C10 — Cross-page internal Link.**
  - Update `app/dashboard/admin/page.tsx:580` `<KpiCard href="/dispatch" />` (file was `app/screen4/page.tsx` pre-rename).
  - Commit: `refactor(dashboard): KpiCard discrepancies card links to /dispatch`

- [x] **C11 — Unit tests update.**
  - Update `tests/unit/nav/desktop-sidebar-items.test.ts` (7 hrefs).
  - Update `tests/unit/haccpPeople.test.ts` (ROLE_ALLOWED_PREFIXES + ROLE_HOME fixture + inline `'/screen4'` literals + `it()` descriptions).
  - Commit: `test(unit): update nav + haccpPeople fixtures for renamed URLs`

- [x] **C12 — E2E test path updates (existing).**
  - Update `tests/e2e/chrome-matrix.spec.ts` ROLE_ROUTES (lines 42, 43, 45) only — assertions untouched.
  - Update `tests/e2e/_auth.ts` lines 104 + 130 (comments only).
  - Update `tests/e2e/route-manager.spec.ts` lines 35 + 36 (`waitForURL`).
  - Commit: `test(e2e): point existing specs at renamed URLs`

- [x] **C13 — Redirects E2E spec (NEW).**
  - Add `tests/e2e/redirects.spec.ts` with the 6 scenarios above.
  - Commit: `test(e2e): add redirect spec covering 6 screen→semantic URL scenarios`

Total: 13 commits.

---

## Test sequence

Run in order; each gate must pass before next.

1. **Type check baseline.** `npx tsc --noEmit` — must remain at 119/119 (unchanged from `main` HEAD `3cfee10`). The `ignoreBuildErrors:true` masks typed-route violations in the build, but tsc itself does not — running tsc directly is the canary.

2. **Unit tests.** `npx vitest run` — all green including:
   - `tests/unit/nav/desktop-sidebar-items.test.ts` (5 specs, updated hrefs)
   - `tests/unit/haccpPeople.test.ts` (PwaGuard fixture mirrored to renamed URLs)

3. **Build.** `npm run build` — clean, no errors. Confirms `redirects()` config compiles, no orphan imports from the renames.

4. **Boot dev server.** `npm start` in background; poll `http://localhost:3000` until ready (use Monitor with an until-loop on `curl -fsS -o /dev/null http://localhost:3000`).

5. **Chrome matrix E2E.** `npx playwright test tests/e2e/chrome-matrix.spec.ts` — must clear **66/66** with C10 active. ROLE_ROUTES updated; C1-C10 assertions byte-identical to baseline.

6. **Redirects E2E.** `npx playwright test tests/e2e/redirects.spec.ts` — all 6 scenarios pass.

---

## Acceptance criteria
- [ ] `npx tsc --noEmit` reports 119 errors maximum (baseline preserved — neither added nor removed)
- [ ] `npx vitest run` — all unit tests green
- [ ] `npm run build` — clean exit code 0
- [ ] `npx playwright test tests/e2e/chrome-matrix.spec.ts` — 66/66 scenarios pass with C10 active
- [ ] `npx playwright test tests/e2e/redirects.spec.ts` — all 6 scenarios pass
- [ ] Manual: navigating to `/screen1`, `/screen4`, `/screen5`, `/screen5/users`, `/screen5/customers`, `/screen6` in the browser results in URL bar updating to the new path
- [ ] `grep -rn "/screen[1456]" app/ components/ middleware.ts tests/ next.config.ts --include="*.ts" --include="*.tsx"` returns only:
  - `next.config.ts` (the redirect rules themselves, which MUST mention old paths)
  - `tests/e2e/redirects.spec.ts` (the test asserts old paths exist as redirect sources)
  - Zero other hits
- [ ] In-spirit exclusions remain untouched: `lib/syncEngine.ts:22`, `app/api/screen[123]/*` API routes, `RecentActivity.tsx` `screen` enum prop, `screen:` enum-tag values in audit code, console.log prefixes, the `/api/screen1/sync` reference in `middleware.ts:54` SHARED_API_PATHS

---

## Out of scope (DO NOT touch)
- `next.config.ts` `typescript.ignoreBuildErrors: true` — stays. Architectural debt logged as Item 6 (per reviewer addition #1).
- `next.config.ts` `eslint.ignoreDuringBuilds`, `experimental.typedRoutes` — stays untouched.
- C1-C10 chrome clearance assertion functions inside `chrome-matrix.spec.ts` — only ROLE_ROUTES const changes.
- Role/permission relationships in middleware, PwaGuard, login API, haccpPeople — path strings only, no logic changes.
- `globals.css`, design tokens, any chrome component (`AppHeader`, `DesktopSidebar`, `BottomNav`).
- Content of renamed pages — no copy, layout, or feature changes.
- `/api/screen[123]/*` API path namespace — sync endpoints, not page routes.
- `audit_log` `screen` column values (`'screen1'`, `'screen2'`, `'screen3'` enum tags).
- `lib/syncEngine.ts:22` `screen1:` map key (map key, not URL).
- `components/RecentActivity.tsx` `screen="screen1"` prop (enum, not URL).
- Comments / console.log string prefixes elsewhere in the codebase.
- New dependencies, jsdom, @testing-library/webkit, anything novel.
- Lifting `AppHeader` to a shared layout — out of scope, logged as Item 6.

---

## Rollback approach
302 (`permanent: false`) means browsers do NOT cache the redirect permanently. To roll back:
1. `git revert <merge-sha>` to reverse all 13 commits in one shot, OR delete the branch before merge.
2. Redeploy.
3. Browsers re-fetch normally within seconds; no stale cache to clear, no DNS or CDN bust required.
The 302/permanent:false choice is deliberate for this reason. The spec contains a locked decision to flip these to `permanent: true` (301) in ~1 week once telemetry confirms no stragglers — that flip is a separate ticket, not part of Item 4.

---

## Risks and open questions

1. **Next.js emits 307, not 302, for `permanent: false`.** The brief says "302" but the Next.js `redirects()` API maps `permanent: false` → 307 (Temporary Redirect, preserves method) and `permanent: true` → 308. Real-world browser behaviour is functionally equivalent to 302 for our use case (no cache-permanence, no method change since all hits are GET). The redirect E2E spec asserts `307`, not `302`, to match Next.js's actual output. If Hakan wants literal 302, the implementer must use custom `headers()` instead of `redirects()` — flag at Gate 3 if discovered.

2. **Typed-routes risk.** `experimental.typedRoutes: true` is enabled; `typescript.ignoreBuildErrors: true` masks any typed-route violations in `npm run build`. Mitigation: run `npx tsc --noEmit` as the canary (step 1 of test sequence). If tsc grows beyond 119 errors, the in-spirit scope missed a literal — find it before merging. Acceptance criterion enforces this.

3. **Wildcard rule forward-compat.** `/screen5/:path*` → `/admin/:path*` has no sub-paths on disk today (both `app/screen5/` and the renamed `app/admin/` are flat). Tests assert the redirect rule fires; destination 404s are acceptable and expected.

4. **Double-hop risk if login API isn't updated.** Without Q1 expansion #B (commit C8), a successful warehouse/office login would 200 with `redirect: '/screen1'`, browser hard-navigates there, middleware 307s to `/dispatch` — a wasteful but functional double-hop. Mitigated by updating `ROLE_ROUTES` in `app/api/auth/login/route.ts`.

5. **PwaGuard drift if not updated.** PwaGuard runs client-side in PWA standalone mode and uses its own `ROLE_ALLOWED_PREFIXES`. If not kept in sync with middleware, iOS PWA users could see their last-visited URL fail validation (`/dispatch` not in allowed → forced to `ROLE_HOME` which would still be `/screen1` → middleware bounces). Mitigated by C7.

6. **`app/dashboard/` partially populated.** Only `app/dashboard/admin/` exists; bare `app/dashboard/` has no `page.tsx`, so `GET /dashboard` 404s. This is acceptable for Item 4 — the brief is "rename, don't add". A future ticket may add `app/dashboard/page.tsx` as a role-aware redirector.

7. **302/permanent:false deliberate choice.** Flips to 301/`permanent: true` in ~1 week per the locked spec decision. Out of scope for this PR.

8. **`git mv app/screen4 app/dashboard/admin` parent auto-create.** Modern git (≥ 2.0) auto-creates intermediate directories. If the implementer's git is older or refuses, fallback: `mkdir app/dashboard && git mv app/screen4 app/dashboard/admin`. Either path is fine.

9. **Chrome matrix re-runs require live creds.** `chrome-matrix.spec.ts` reads `E2E_USER_*` and `E2E_PIN_*` / `E2E_PASSWORD_ADMIN` from `.env.e2e.local`. If those creds are missing or stale, the spec emits `MISSING_CREDS:<var>` failing tests (by design — never silently skips). Implementer must confirm `.env.e2e.local` is populated before running step 5.
