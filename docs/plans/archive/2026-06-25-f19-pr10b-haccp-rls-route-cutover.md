# F-19 Cluster G / F-RLS-04h PR10b — HACCP RLS route cutover

**Date:** 2026-06-25
**Feature:** F-19 (HACCP hexagonal migration) · Cluster G · F-RLS-04h
**This PR:** PR10b — the FINAL F-19 step. Flip every authenticated HACCP route off the
service-role (master-key) singleton onto its per-caller `…ForCaller(userId)` factory, so
HACCP DB traffic runs as the Postgres `authenticated` role and the RLS policies PR10a
installed actually fire.

🗣 In plain English: PR10a (already shipped) installed locks on every HACCP table and built
the per-user keycards but plugged nobody into them — the app still used the master key that
opens every lock. PR10b throws the switch: each HACCP screen now opens the DB with the
logged-in person's own keycard, so the locks finally do their job. No new locks, no new
keycards — only changing which key each door reaches for.

---

## Objective

For 32 of the 33 route files under `app/api/haccp/`:
1. Swap the wiring import from the service-role singleton (`haccpXService`) to the per-caller
   factory (`haccpXServiceForCaller` / `submitHaccpDailyCheckForCaller`).
2. Source the caller identity from the **tamper-proof middleware header** `x-mfs-user-id`
   (set at `middleware.ts:151` from the HMAC-signed `mfs_session`), NOT from the forgeable
   `mfs_user_id` cookie.
3. Where a route gates on role, source the role from the `x-mfs-user-role` header
   (`middleware.ts:153`), NOT from the `mfs_role` cookie. Preserve the EXACT existing guard
   check and its exact unhappy-path response (status + body) byte-identically.
4. Use that SAME header `userId` for record-author stamping (every `buildX({ userId })`,
   `signOff(id, userId)`, etc.).
5. `await` the factory (all `…ForCaller` are `async`).

The 33rd route (`app/api/haccp/visitor/route.ts`) STAYS on the service-role
`haccpPeopleService` singleton — it is a public kiosk (no logged-in user). Do NOT change its
wiring.

🗣 In plain English: every honest user sees zero difference — the header and the old cookie
carry the same user id after login. What changes is (a) the app now trusts the un-forgeable
header instead of a cookie a clever person could edit, and (b) the database connection runs
as a restricted role the new locks apply to. Same data in, same data out; just a locked door
instead of a propped-open one.

---

## Domain terms (plain-English bridge)

- **Service-role / master-key singleton** (`haccpXService`) — a shared DB client that bypasses
  RLS. 🗣 The master key that opens every lock; what every HACCP screen uses today.
- **`…ForCaller(userId)` factory** (`lib/wiring/haccp.ts`) — mints a short-lived DB token for
  one user, builds an `authenticated`-role client, binds the adapter. 🗣 Cuts a personal
  keycard for this one request, then throws it away.
- **`authenticated` Postgres role** — the non-bypass DB role the RLS policies are written
  against. 🗣 The restricted badge the locks actually check; the master key ignores them.
- **`x-mfs-user-id` header** (middleware, `:151`) — request header derived from the
  HMAC-signed session cookie. 🗣 A wristband the door staff stamped — can't be faked. The
  `x-mfs-user-id` *cookie* (httpOnly:false) by contrast is a sticker the visitor can re-write.
- **`current_user_is_active()`** (PR10a SQL helper) — the RLS predicate: the GUC
  `app.current_user_id` must map to a real `users` row with `active = true`. 🗣 The lock only
  opens for a real, switched-on staff member.
- **RLS (row-level security)** — per-row DB access rules. 🗣 The locks on the filing cabinet
  drawers, enforced by the database itself, not the app.

---

## Compliance / architecture flags

- **CLAUDE.md "build it like Lego" / ADR-0002:** inner layers unchanged. Routes (`app/`) reach
  services via `lib/wiring/` factories only. No vendor SDK import added to any route. PASS.
- **No new `package.json` entry**, no new port, no new adapter, no new migration (PR10a shipped
  the policies + the factories). PASS.
- **Security upgrade (side effect):** moving role + userId off the forgeable `mfs_user_id` /
  `mfs_role` cookies onto the signed headers closes a real "forge cookie → impersonate /
  become admin" hole on these 32 routes. This is an intended, locked improvement (DECISION 1
  + DECISION 2 in Frame).

## ADR conflicts

None. ADR-0002 (hexagonal shape) is satisfied — this PR strengthens the rip-out boundary by
removing direct cookie reads and routing all DB access through the wiring factories. No ADR
contradicts the cutover.

---

## SURPRISE / correction to the Frame brief (READ THIS)

The Frame brief predicted the reporting / lookup / handbook / assessment / reviews routes would
be **sub-case (b)** — "no current identity extraction, ADD a fresh 401 guard". **Verification of
all 32 route files proves this is FALSE.** Every single one of the 32 routes **already extracts
the `mfs_role` cookie and guards on it** (`if (!role || !['warehouse','butcher','admin']…)` or
`role !== 'admin'`). **There are ZERO sub-case (b) routes.** All 32 are **sub-case (a)**.

Consequence for the implementer:
- You NEVER add the generic visits-shape `{ error: 'Unauthenticated' }, 401` guard, because every
  route already has its own (differently-worded) guard. **Preserve each route's existing guard
  body verbatim** — do not standardise the wording.
- Two routes (`customers`, `users`) extract **role only**, never `userId`. They are reads. You
  must **add a `userId` read** (`const userId = req.headers.get('x-mfs-user-id')`) for the mint,
  but keep their existing role-only guard exactly as-is. If you want a missing-userId safety net,
  fold it into the existing guard's condition (it already 401s on a missing role; a logged-in user
  always has both header values, so a missing userId can only mean a malformed request — return
  the route's OWN existing 401 body, not a new one). Simplest correct edit: keep the role guard,
  then `const svc = await haccpLookupsServiceForCaller(userId!)` — but prefer an explicit guard
  (see step 3) to avoid a non-null assertion.

🗣 In plain English: the brief guessed half these doors had no lock and needed one added. Reading
them shows every door already has a lock — they just check a forgeable cookie. So the job is
simpler and more uniform than feared: swap what each existing lock reads (cookie → wristband),
never invent a new lock.

---

## Per-route table (all verified by opening each file)

Legend: **G** = guard source today · **resp** = exact unhappy-path response to PRESERVE.
All 32 are sub-case **(a)** (existing guard present). Cookie reads to replace:
`req.cookies.get('mfs_role')?.value` → `req.headers.get('x-mfs-user-role')`;
`req.cookies.get('mfs_user_id')?.value` → `req.headers.get('x-mfs-user-id')`.

### Group 1 — daily-checks (7 routes) · factory `haccpDailyChecksServiceForCaller` (GET + POST reads/writes) + `submitHaccpDailyCheckForCaller` (POST CA fan-out)

| Route file | Handlers | Guard today (preserve verbatim) |
|---|---|---|
| `calibration/route.ts` | GET, POST | GET: role in `['warehouse','butcher','admin']` else `{error:'Unauthorised'},401`. POST: same + `userId` present, else `{error:'Unauthorised'},401`. |
| `cleaning/route.ts` | GET, POST | identical to calibration. |
| `cold-storage/route.ts` | GET, POST | identical to calibration. |
| `delivery/route.ts` | GET, POST | identical to calibration. |
| `mince-prep/route.ts` | GET, POST | identical to calibration. |
| `process-room/route.ts` | GET, POST | identical to calibration. |
| `product-return/route.ts` | GET, POST | identical to calibration. |

Per-route mint rule for Group 1:
- **GET** uses only `haccpDailyChecksService` reads → `const svc = await haccpDailyChecksServiceForCaller(userId)`. GET today reads role only (no userId); ADD `const userId = req.headers.get('x-mfs-user-id')` and feed the mint. The existing role guard stays; a logged-in user always carries both, but guard userId too (see step 3 pattern) so the mint never gets a null.
- **POST** uses `haccpDailyChecksService` writes AND `submitHaccpDailyCheck.fileCorrectiveActions` → mint **BOTH**: `const dc = await haccpDailyChecksServiceForCaller(userId)` and `const submit = await submitHaccpDailyCheckForCaller(userId)`. **TWO mints per POST — ACCEPTED** (Frame DECISION; matches PR10a's separate factories; no combined factory exists). Replace `haccpDailyChecksService.` → `dc.` and `submitHaccpDailyCheck.` → `submit.` throughout the handler body. `userId` for `buildX({ userId })` is the SAME header value.

### Group 2 — corrective-actions (2 routes) · factory `haccpCorrectiveActionsServiceForCaller`

| Route file | Handlers | Guard today (preserve verbatim) |
|---|---|---|
| `corrective-actions/route.ts` | GET | `role !== 'admin'` → `{error:'Unauthorised — admin only'},401`. Role only, no userId today → ADD `userId` for the mint. |
| `corrective-actions/[id]/route.ts` | PATCH | `role !== 'admin' \|\| !userId` → `{error:'Unauthorised — admin only'},401`; then `!id` → `{error:'ID required'},400`. NOTE dynamic param: `{ params }: { params: Promise<{ id: string }> }`, `const { id } = await params`. `signOff(id, userId)` uses the header userId. |

### Group 3 — assessments (5 routes) · factory `haccpAssessmentsServiceForCaller`

| Route file | Handlers | Guard today (preserve verbatim) |
|---|---|---|
| `allergen-assessment/route.ts` | GET, POST | GET: role in `['warehouse','butcher','admin']` else `{error:'Unauthorised'},401`. POST: `role !== 'admin' \|\| !userId` → `{error:'Admin only'},403`. |
| `allergen-assessment/monthly-reviews/route.ts` | GET, POST | GET same as above. POST: `{error:'Admin only'},403`. |
| `food-defence/route.ts` | GET, POST | GET role-set 401; POST `{error:'Admin only'},403`. |
| `food-fraud/route.ts` | GET, POST | GET role-set 401; POST `{error:'Admin only'},403`. |
| `product-specs/route.ts` | GET, POST, PATCH | GET role-set 401; POST `{error:'Admin only'},403`; PATCH `{error:'Admin only'},403` then `!id`→`{error:'ID required'},400`. **3 handlers.** |

GET handlers read role only → ADD `userId` for the mint. POST/PATCH already read both.

### Group 4 — training (1) · factory `haccpTrainingServiceForCaller`

| Route file | Handlers | Guard today |
|---|---|---|
| `training/route.ts` | GET, POST | GET: `role !== 'admin'` → `{error:'Unauthorised — admin only'},401`. POST: `role !== 'admin' \|\| !userId` → `{error:'Unauthorised — admin only'},401`. GET reads role only → ADD userId. |

### Group 5 — people (1) · factory `haccpPeopleServiceForCaller`

| Route file | Handlers | Guard today |
|---|---|---|
| `people/route.ts` | GET, POST | GET: role-set 401 `{error:'Unauthorised'}`. POST: role-set + userId 401 `{error:'Unauthorised'}`. **Keep the R2/R4 visitor-record divergences at the route edge unchanged.** GET reads role only → ADD userId. **Do NOT touch the `haccpPeopleService` singleton import shared with `visitor/route.ts` — `visitor` keeps it; `people` switches to the factory.** |

### Group 6 — reviews (1) · factory `haccpReviewsServiceForCaller`

| Route file | Handlers | Guard today |
|---|---|---|
| `reviews/route.ts` | GET, POST | GET: `role !== 'admin'` (written `!role \|\| !['admin'].includes(role)`) → `{error:'Unauthorised — admin only'},401`. POST: `!role \|\| !userId \|\| role !== 'admin'` → same 401. GET reads role only → ADD userId. |

### Group 7 — annual-review (1) · factory `haccpAnnualReviewServiceForCaller`

| Route file | Handlers | Guard today |
|---|---|---|
| `annual-review/route.ts` | GET, POST, PATCH | GET: role-set 401 `{error:'Unauthorised'}`. POST: `role!=='admin'\|\|!userId`→`{error:'Admin only'},403`. PATCH: `{error:'Admin only'},403`, then `!id`→`{error:'Review ID required'},400`, then findCurrent 404 / locked 409, plus a `ConflictError`→409 catch. **Preserve every status branch verbatim. 3 handlers.** GET reads role only → ADD userId. |

### Group 8 — reporting (6 routes) · factory `haccpReportingServiceForCaller`

| Route file | Handlers | Guard today (preserve verbatim) |
|---|---|---|
| `annual-review/data/route.ts` | GET | role-set 401 `{error:'Unauthorised'}`. Role only → ADD userId. |
| `today-status/route.ts` | GET | role-set 401 `{error:'Unauthorised'}`. Role only → ADD userId. |
| `overview/route.ts` | GET | `role !== 'admin'` → `{error:'Unauthorised — admin only'},401`; then missing from/to → `{error:'from and to date parameters required'},400`. Role only → ADD userId. |
| `audit/route.ts` | GET | `role !== 'admin'` → `{error:'Unauthorised — admin only'},401`; then `!section`→`{error:'section param required'},400`; unknown-section→`result,400`. Role only → ADD userId. |
| `audit/heatmap/route.ts` | GET | `role !== 'admin'` → `{error:'Unauthorised'},401`. Role only → ADD userId. |
| `audit/export/route.ts` | GET | `role !== 'admin'` → **`new NextResponse('Unauthorised', { status: 401 })`** (PLAIN-TEXT body, NOT JSON — preserve exactly). Returns binary XLSX on success. Role only → ADD userId. |

### Group 9 — handbook (3 routes) · factory `haccpHandbookServiceForCaller`

| Route file | Handlers | Guard today |
|---|---|---|
| `documents/route.ts` | GET | role-set 401 `{error:'Unauthorised'}`. Role only → ADD userId. |
| `handbook/route.ts` | GET | role-set 401 `{error:'Unauthorised'}`. Role only → ADD userId. |
| `search/route.ts` | GET | role-set 401 `{error:'Unauthorised'}`. Role only → ADD userId. |

### Group 10 — suppliers (2 routes) · factory `haccpSuppliersServiceForCaller`

| Route file | Handlers | Guard today |
|---|---|---|
| `admin/suppliers/route.ts` | GET, POST, PATCH | Uses helper `isAdmin(req)` = `req.cookies.get('mfs_role')?.value === 'admin'`. Each handler: `if (!isAdmin(req)) return {error:'Admin only'},403`. **Rewrite `isAdmin` to read the header** `req.headers.get('x-mfs-user-role') === 'admin'`. Add a per-handler `const userId = req.headers.get('x-mfs-user-id')` for the mint. **3 handlers, NO userId read today.** |
| `recall/route.ts` | GET, POST, PATCH | GET: role-set 401 `{error:'Unauthorised'}`. POST: `role!=='admin'\|\|!userId`→`{error:'Admin only'},403` then payload-shape 400. PATCH: `role!=='admin'`→`{error:'Admin only'},403` then `!id`→`{error:'Supplier ID required'},400`. GET + PATCH read role only → ADD userId. **3 handlers.** |

### Group 11 — lookups (2 routes) · factory `haccpLookupsServiceForCaller`

| Route file | Handlers | Guard today |
|---|---|---|
| `customers/route.ts` | GET | role-set 401 `{error:'Unauthorised'}`. **Role only, NO userId** → ADD userId for the mint. |
| `users/route.ts` | GET | role-set 401 `{error:'Unauthorised'}`. **Role only, NO userId** → ADD userId for the mint. |

### NOT in this PR — stays service-role

| Route file | Why |
|---|---|
| `visitor/route.ts` | Public kiosk, `PUBLIC_PATHS`, no logged-in user, no `x-mfs-user-id` header exists for it. Keeps `haccpPeopleService` singleton + the fixed `VISITOR_KIOSK_USER_ID`. Optional: add a one-line comment "PR10b: intentionally stays service-role — public kiosk, no caller." Do not change behaviour. |
| `supplier-code/route.ts` | **NOT in the 32-route list. Per the Frame brief there are exactly 32 flips; `supplier-code` is NOT enumerated.** It is read-only, gates on a WIDER role set (`['warehouse','butcher','admin','driver']`) and is reached by the `driver` role too. **Leave it on the `haccpSuppliersService` singleton — do NOT flip it in PR10b.** (If Frame intended it included, that is a scope question to raise BEFORE editing — see Open question O1.) |

**Route count reconciliation:** 33 files total. 32 flip (Groups 1–11 above sum to
7+2+5+1+1+1+1+6+3+2+2 = 31)… ⚠️ see Open question O1: the brief says 32 flips but the
enumerated factory groups sum to **31** route files (because `supplier-code` is excluded and
`visitor` stays). Plus `visitor` (stays) + `supplier-code` (stays) = 33. **The brief's "32"
appears to double-count or include `supplier-code`. RESOLVE O1 before implementation.**

---

## Open questions for the conductor (must resolve before Render)

- **O1 (scope count):** The brief states "32 routes FLIP". Opening every file, the enumerated
  factory groups cover **31** route files; `supplier-code/route.ts` is the only other
  authenticated HACCP route and was NOT listed under any factory group, while `visitor` stays.
  Either (a) `supplier-code` is the 32nd flip (then it flips to `haccpSuppliersServiceForCaller`,
  adding a `userId` read and switching its `['warehouse','butcher','admin','driver']` guard to
  the header — note `driver` is a valid logged-in role so the header will carry it), or (b) the
  count "32" is an off-by-one and 31 flip. **The plan is written for 31 flips + `supplier-code`
  held back**, but flag this so Hakan confirms. Resolving O1 changes nothing structurally — it
  only decides whether one more file is edited with the identical pattern.

🗣 In plain English: I counted the doors twice and got 31 to re-key, not 32. The one door I'm
unsure about (`supplier-code`) is also used by drivers, so re-keying it is fine — I just want a
yes before touching it. Everything else is unambiguous.

---

## Step-by-step edits (apply per route, mechanical)

For EACH of the 31 (or 32, pending O1) flip routes:

**Step 1 — swap the import.** Change the named import from `@/lib/wiring/haccp`:
- `haccpDailyChecksService, submitHaccpDailyCheck` → `haccpDailyChecksServiceForCaller, submitHaccpDailyCheckForCaller` (Group 1).
- `haccpXService` → `haccpXServiceForCaller` for every other group (X = correctiveActions, assessments, training, people, reviews, annualReview, reporting, handbook, suppliers, lookups).
- Ensure `NextResponse` is already imported (all 32 already import `{ NextRequest, NextResponse }` — verified; `audit/export` uses `new NextResponse(...)`, also already imported).

**Step 2 — source identity from headers in every handler.** In each handler, replace:
- `const role = req.cookies.get('mfs_role')?.value` → `const role = req.headers.get('x-mfs-user-role')`
- `const userId = req.cookies.get('mfs_user_id')?.value` → `const userId = req.headers.get('x-mfs-user-id')`
- For handlers that read role only today, ADD `const userId = req.headers.get('x-mfs-user-id')` immediately after the role line.
- For `admin/suppliers`: rewrite the `isAdmin` helper to `req.headers.get('x-mfs-user-role') === 'admin'` and add a `userId` header read inside each handler.

**Step 3 — guard, then mint.** Keep each route's EXISTING guard check + EXACT response body/status
unchanged (only the *source* of `role`/`userId` changed). For read-only handlers that gained a
`userId` read, guard it so the mint never receives null. Two acceptable shapes — match the
route's existing style:
- If the existing guard already includes `!userId` (POST/PATCH handlers), it already covers this.
- If the handler guarded role only, extend that same guard's condition to also require `userId`,
  returning the route's OWN existing 401/403 body (NOT a new generic message). Example for a
  role-set GET: `if (!role || !userId || !['warehouse','butcher','admin'].includes(role)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })`.
  This preserves the byte-identical body and removes the need for a non-null assertion at the mint.

Then mint AFTER the guard:
- Single-port group: `const svc = await haccpXServiceForCaller(userId)` and replace
  `haccpXService.` → `svc.` throughout the handler.
- Group 1 POST: `const dc = await haccpDailyChecksServiceForCaller(userId)` +
  `const submit = await submitHaccpDailyCheckForCaller(userId)`; replace
  `haccpDailyChecksService.` → `dc.` and `submitHaccpDailyCheck.` → `submit.`.
- Group 1 GET: `const svc = await haccpDailyChecksServiceForCaller(userId)`; replace
  `haccpDailyChecksService.` → `svc.`.

**Step 4 — record stamping uses the SAME header userId.** Every `buildX({ userId })`,
`signOff(id, userId)`, `saveRecallConfig(..., userId, ...)`, etc. now receives the header value.
No code shape change — `userId` already names the right variable.

**Step 5 — leave `visitor/route.ts` and (pending O1) `supplier-code/route.ts` untouched** apart
from an optional clarifying comment.

**Step 6 — update the wiring header comment** in `lib/wiring/haccp.ts` (the block at lines
17–39 and 178–187) from "INERT / no caller until PR10b" to reflect PR10b wired them. This is a
doc-comment edit only; the singletons (parachutes) stay exported. (Optional but keeps the file
honest — code-critic reads these comments.)

🗣 In plain English: every route gets the same five-line surgery — change one import, read the
wristband instead of the sticker, keep the existing bouncer check word-for-word, then open the
DB with the personal keycard. Nothing inside the services or the database changes.

---

## Files to change (exhaustive)

App routes (flip): the 31 files in Groups 1–11 above (full paths listed per group), plus
`supplier-code/route.ts` IF O1 resolves to "include". Wiring doc-comment:
`lib/wiring/haccp.ts` (comments only). Tests: see matrix below. **No migration. No
`package.json` change. No `lib/services/**`, `lib/usecases/**`, `lib/ports/**`,
`lib/domain/**`, or `lib/adapters/**` change.**

---

## Test matrix (ANVIL runs these — listed, not written)

### Unit (`tests/unit/`)
- **Existing, must stay green:** `tests/unit/wiring/haccpServiceForCaller.test.ts`,
  `tests/unit/wiring/haccpService.test.ts`, `tests/unit/wiring/haccpAssessments.test.ts`.
  These pin the factories + singletons and are UNAFFECTED by route edits — confirm green, no
  edit expected (the singletons remain exported as parachutes; the "keeps parachutes" test
  still passes).
- **NEW — route-level guard + factory-invocation tests.** Mirror
  `tests/unit/api/admin-users.route.test.ts` (direct handler invocation, mock the wiring
  factory, assert: (1) missing `x-mfs-user-id`/`x-mfs-user-role` → the route's exact existing
  401/403 body+status and the `…ForCaller` mock is NOT called; (2) a non-permitted role →
  the route's exact guard response, mock not called; (3) a permitted caller → handler reaches
  the mocked service (200/201) and `xForCaller` was awaited with the header userId). Cover at
  minimum ONE route per factory group (11–12 routes) — the daily-checks POST test must assert
  BOTH `haccpDailyChecksServiceForCaller` AND `submitHaccpDailyCheckForCaller` were called with
  the header userId, and that POST stamps `userId` from the header. Include `audit/export` to
  pin its PLAIN-TEXT 401 body. Mock `@/lib/wiring/haccp` exactly as admin-users mocks
  `@/lib/wiring/users`.

### Integration (`tests/integration/`, local Supabase via booted dev server)
- **Extend existing HACCP integration suites:** `haccp.test.ts`, `haccpAssessments.test.ts`,
  `haccpDocsLookupsRoutes.test.ts`, `haccpReportingRoutes.test.ts`, `haccpReviewsRoutes.test.ts`,
  `haccpPeopleTraining.test.ts`. After the cutover the integration runner (which boots the dev
  server WITH middleware → sets `x-mfs-user-id`) must still pass: an authenticated ACTIVE user
  can GET reads and POST writes end-to-end on a representative route per factory, and the written
  row LANDS (read-back assertion). These now run through the `authenticated` DB role + live RLS —
  proving the policy lets a real active user through the full route → service → adapter → DB path.
- **Add at least one negative integration assertion** if the harness can plant an INACTIVE user:
  a request whose session maps to `active = false` should get an empty read / write rejection
  (the RLS deny). If the integration harness cannot mint an inactive session easily, defer that
  proof to pgTAP (below), which already covers it deterministically.

### pgTAP / RLS (`supabase/tests/015-rls-haccp.test.sql`)
- The existing file ALREADY proves, at the DB layer with `SET LOCAL ROLE authenticated`: active
  user CAN SELECT/INSERT/UPDATE/DELETE; empty/absent GUC fail-closed (0 rows / clean 42501);
  non-existent UUID denied; inactive user denied; master-key bypasses. That is the complete
  policy proof and remains valid post-cutover (the policies didn't change).
- **ADD (PR10b strengthening):** assertions framed as "the path a route now exercises" — i.e.
  with the GUC set to an active user, an INSERT then SELECT round-trips the row (proving a route's
  write+read-back works as `authenticated`), and with the GUC cleared the same INSERT raises
  42501 (proving an absent identity is refused). If the sampled-5-tables already cover this shape,
  add one explicit "round-trip as active user" + one "blocked with no GUC" pair on
  `haccp_deliveries` (the daily-check write target) and bump `plan(...)` accordingly.

### E2E — exhaustive HACCP browser-tap @critical (prod-build preview)
- Run the FULL `@critical` HACCP browser-tap suite (every HACCP screen + button) against the
  PR's deployed Vercel preview wired to its Supabase preview branch — `npm run test:e2e:preview --
  <preview-url>`. This is the real proof the tablet still works end-to-end under RLS as a logged-in
  user. Cover: every daily-check form submit, corrective-actions sign-off, assessments CRUD,
  reviews submit, annual-review draft/sign-off, suppliers CRUD, reporting/audit/export download,
  handbook/search reads, lookups (customers/users selectors), people health records, AND the
  public visitor kiosk (must still work on service-role). Plus the HACCP admin kiosk login.

---

## Risk Assessment (mandatory)

### Concurrency / race conditions
- **R-CONC-1 (per-caller client must never memoize) — severity LOW, must-fix: NO (already
  satisfied).** The `…ForCaller` factories mint a fresh token + client per call (pinned by the
  "NEVER memoizes" test in `haccpServiceForCaller.test.ts`). PR10b only adds callers; it does
  not touch the factories. Mitigation: the new route unit tests assert each handler `await`s a
  fresh `xForCaller(userId)` — no module-level caching of the service in a route. 🗣 Each
  request cuts its own keycard; two users can't share one and leak identity.
- **R-CONC-2 (two mints per daily-check POST) — severity LOW, must-fix: NO.** Group 1 POST mints
  twice (daily-checks + submit). Both bind the SAME `userId`; no shared mutable state; ordering
  irrelevant. Accepted by Frame. Cost is one extra short-lived token per POST. 🗣 Two keycards
  cut for one request — harmless, just slightly more work; both open the same locks.

### Security
- **R-SEC-1 (cookie→header trust upgrade) — severity is a POSITIVE, must-fix: NO.** Moving role +
  userId off the forgeable `mfs_user_id`/`mfs_role` cookies onto the HMAC-signed headers closes a
  real impersonation/privilege-escalation hole. Mitigation already in design. Verify the new unit
  tests assert role gating reads the HEADER (a request with an admin *cookie* but non-admin
  *header* must be refused). 🗣 The bouncer now checks the un-forgeable wristband, not the sticker
  a guest could re-write — a strict improvement.
- **R-SEC-2 (audit/export 401 shape) — severity LOW, must-fix: NO.** `audit/export` returns a
  PLAIN-TEXT 401, not JSON. If standardised by mistake, an automated audit-export client could
  break. Mitigation: the per-route table + a dedicated unit assertion preserve it byte-identically.

### Data migration
- **None.** No migration in PR10b. PR10a shipped the policies + helper. The policies are additive
  and service-role bypasses them, so the parachute path is unaffected. 🗣 No database surgery —
  the locks were already installed last time; we're only handing out the keycards now.

### Business-logic flaws
- **R-BL-1 (guard-response drift) — severity MEDIUM, must-fix: YES if it occurs.** The 32 routes
  have NON-uniform guard bodies/statuses (`'Unauthorised'` 401 vs `'Admin only'` 403 vs
  `'Unauthorised — admin only'` 401 vs plain-text). Standardising any of them is a behaviour
  change a client could depend on. Mitigation: the per-route table above records every exact
  response; the implementer preserves each verbatim; Guard/code-critic diff-checks each guard
  body is unchanged except the cookie→header source. 🗣 Every door's "no entry" message must stay
  word-for-word what it says today — only the ID it checks changes.
- **R-BL-2 (read-only GET gains a userId requirement) — severity LOW, must-fix: NO.** GET handlers
  that read role only today gain a `userId` need for the mint. A logged-in user ALWAYS carries
  both headers (middleware sets them together), so honest traffic is unaffected. Guard userId into
  the EXISTING 401 body so a malformed request can't NPE the mint. 🗣 A logged-in person always
  has both a wristband id and a role; requiring the id too can only reject genuinely malformed
  requests, which already failed.

### Launch blockers
- **R-LB-1 (admin kiosk user must be active) — severity HIGH, must-fix: YES (pre-ship verify).**
  `app/api/auth/haccp-admin/route.ts` hardcodes `ADMIN_USER_ID = e5320cb8-…` (Hakan). Under RLS,
  every admin-kiosk HACCP action now runs as that user via `authenticated` — if that `users` row
  is not `active = true`, the ENTIRE admin kiosk breaks (empty reads / 42501 writes). Mitigation:
  before merge, verify `SELECT active FROM users WHERE id = 'e5320cb8-8977-4f86-80d7-6bbc595ce183'`
  = true in PROD (expected true — he is the owner). Same applies to any kiosk-login warehouse/
  butcher user. 🗣 The boss's keycard must be switched on, or the whole admin tablet locks itself
  out the moment we flip the switch. Check it first.
- **R-LB-2 (F-TD-37 shared-preview HACCP flake) — severity MEDIUM, must-fix: NO (known recovery).**
  The exhaustive @critical HACCP E2E suite has submit-once-per-period specs that are NOT idempotent
  on a shared preview branch (a period already submitted on a prior run blocks the assert). This
  WILL bite here. Recovery: Supabase MCP `reset_branch` on the PR's preview branch, then re-run the
  FULL @critical suite ONCE. Budget this into the ANVIL E2E run. 🗣 The tablet test trips over its
  own earlier run on a shared sandbox — wipe the sandbox once and re-run; expected, not a real bug.
- **R-LB-3 (visitor kiosk must NOT flip) — severity HIGH, must-fix: YES.** If `visitor/route.ts`
  is accidentally switched to a `…ForCaller`, it breaks (no `x-mfs-user-id` for an anonymous
  kiosk). Mitigation: explicitly excluded; E2E covers the public kiosk submit. 🗣 The walk-up
  visitor screen has no logged-in user — it must keep the master key, or it stops accepting
  visitors.

### Rollback
- **One-line-per-route revert, no DB change.** Revert each route's import back to the service-role
  singleton (`haccpXServiceForCaller` → `haccpXService`, `submitHaccpDailyCheckForCaller` →
  `submitHaccpDailyCheck`) and the header reads back to cookie reads. The singletons remain
  exported in `lib/wiring/haccp.ts` precisely as parachutes. No migration to roll back (policies
  are additive; service-role bypasses them). 🗣 If anything misbehaves, flip each door's key back
  to the master key — the master key was never removed, and the locks ignore it.

### Must-fix summary (Gate 2 blockers until resolved in the plan/PR)
- **R-LB-1** — pre-ship PROD verify the admin-kiosk user (`e5320cb8…`) and any kiosk login users
  are `active = true`. (Resolvable by a single read; expected pass.)
- **R-LB-3** — `visitor/route.ts` MUST stay on the service-role singleton (and `supplier-code`
  per O1).
- **R-BL-1** — every guard's response body+status preserved byte-identically; standardisation is
  a blocker.
- **O1 (scope)** — confirm 31 vs 32 flips before Render (decides whether `supplier-code` is edited).

These are mitigated-by-design or a single read/confirmation; none requires re-architecture.

---

## Acceptance criteria

1. All 31 (or 32) flip routes import the `…ForCaller` factory; ZERO of them import a HACCP
   service-role singleton (except `visitor`, and `supplier-code` pending O1).
2. ZERO of the flipped routes read `mfs_role` or `mfs_user_id` cookies; all read `x-mfs-user-role`
   / `x-mfs-user-id` headers.
3. Every guard's response status + body is byte-identical to before (per the per-route table).
4. Each `…ForCaller` is `await`ed; record stamping uses the header userId.
5. `visitor/route.ts` unchanged in behaviour (service-role retained).
6. New + existing unit tests green (guard-401/403, factory invoked with header userId, parachutes
   survive). Integration suites green through the `authenticated` role. pgTAP `015` green with the
   added round-trip/deny assertions. Full @critical HACCP E2E green on the prod-build preview
   (after the one F-TD-37 reset if it bites).
7. Pre-ship: admin-kiosk user verified `active = true` in PROD.
8. No migration, no `package.json` change, no inner-layer change.

---

## Hexagonal check (Gate 2 verdict)

- **Port(s) used:** existing HACCP ports — `HaccpDailyChecksRepository`,
  `HaccpCorrectiveActionsRepository`, `HaccpAssessmentsRepository`, `HaccpTrainingRepository`,
  `HaccpPeopleRepository`, `HaccpReviewsRepository`, `HaccpAnnualReviewRepository`,
  `HaccpReportingRepository`, `HaccpHandbookRepository`, `HaccpSuppliersRepository`,
  `HaccpLookupsRepository`, plus `SpreadsheetExporter` (xlsx) and the `DbTokenMinter`. **No new
  port. No new adapter.** Each port still has its single Supabase adapter (+ Fake for tests).
- **Adapter(s):** `lib/adapters/supabase/Haccp*Repository` (already built; per-caller factory
  variants shipped in PR10a). `lib/adapters/xlsx` for the exporter. No new adapter.
- **New dependencies:** **NONE.** No `package.json` entry added → no justification or wrapper
  needed.
- **Rip-out test:** swapping the HACCP DB vendor = one new adapter per port + the wiring lines in
  `lib/wiring/haccp.ts`. Routes depend on the wiring factories only; no vendor SDK in any route.
  PR10b strengthens this (removes residual cookie coupling). **Rip-out test: PASS.**

🗣 In plain English: this is pure re-plugging inside the existing Lego — no new socket, no new
brick, no new outside library. Swap the database tomorrow and only the adapter + the one wiring
file change; the 32 routes don't care. Clean PASS.
