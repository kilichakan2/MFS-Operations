# F-03 — `requireRole(req, allowedRoles)` helper + UnauthorizedError + ForbiddenError

## Goal

F-03 ships the third Phase 0 foundation: a single procedural helper —
`requireRole(req: NextRequest, allowedRoles: Role[]): Caller` — that wraps the
current ad-hoc role-check pattern used in 80+ routes today (e.g.
`app/api/orders/route.ts:30-31, 37-39` — read `req.cookies.get('mfs_role')`
or `req.headers.get('x-mfs-user-role')`, hand-roll an `includes()`, hand-roll
a `NextResponse.json({ error: 'Unauthorised' }, { status: 401 })`) behind a
single typed call. The helper reads the four `x-mfs-*` request headers
middleware.ts already sets at lines 142-145 (`x-mfs-user-id`,
`x-mfs-user-name` — unread here, `x-mfs-user-role`,
`x-mfs-secondary-roles`), filters role strings through the existing
`isKnownRole` predicate (currently private in
`lib/observability/withRequestContext.ts:55-57`), enforces the multi-role
permission check verbatim from `middleware.ts:128, 152-154` (union of
primary + secondaries-minus-admin, intersection with `allowedRoles`),
and either returns a fully-typed `Caller` (the F-FND-03 shape, three
fields, unchanged) or throws one of two new typed-error classes:
`UnauthorizedError` (HTTP 401, code `UNAUTHORIZED`) when no valid
identity is present, or `ForbiddenError` (HTTP 403, code `FORBIDDEN`)
when identity is present but no role in the union matches the
allow-list. Both new errors flow through the existing `withErrors` HOF
(`lib/errors/withErrors.ts:53-58`) automatically — no wiring change.

As a hygiene move bundled with this unit, the `KNOWN_ROLES` constant +
`isKnownRole` type-predicate currently defined privately at
`lib/observability/withRequestContext.ts:51-57` are moved to
`lib/observability/Caller.ts` and re-exported, so the `Role` union and
the runtime predicate that filters strings into it live in the same
file. `withRequestContext.ts` then imports them from `./Caller`.
Behaviour is byte-for-byte identical; the existing 7-case
`tests/unit/observability/withRequestContext.test.ts` suite continues
to pass unchanged.

A new vitest unit suite at `tests/unit/auth/session.test.ts` covers
the helper in 8 cases (a–h, mirroring the locked Gate 1 spec) with the
same `makeRequest()` 2-line `NextRequest` helper that the
`withRequestContext` test already uses (`tests/unit/observability/withRequestContext.test.ts:25-27`).
No DB, no Supabase, no HTTP — pure logic.

**What this unit explicitly does NOT do.** No route migrations. Zero
of the 80+/104 existing role-check sites under `app/api/**` are
touched. No `AuthPort` interface — F-13 (Users domain) owns auth-port
extraction per ADR-0002. No new ADR — Gate 1 confirmed F-03 conforms
to ADRs 0002/0003/0004/0005 without new architectural decisions. No
new package.json dependencies. No edit to `Caller`'s 3-field shape —
secondary roles are used internally for the permission check only and
are deliberately NOT exposed on the returned `Caller` (Gate 1 Q5
decision). No edit to `lib/supabase.ts`. No edit to the `withErrors`
HOF — typed errors flow through it as-is.

---

## Source spec

- **Locked Gate 1 spec — the conductor handoff above.** Frozen; no
  clarifications taken in the planner. Ambiguities flagged for Gate 2
  in the Risks section. The 8-case test matrix, the
  `requireRole(req, allowedRoles)` signature, the
  `UnauthorizedError` / `ForbiddenError` shape, the
  `KNOWN_ROLES`/`isKnownRole` move, and the Caller-secondaryRoles
  exclusion are all spec-locked.
- **Architecture review v1.2 addendum** —
  `docs/architecture-review-2026-06-06.md` Phase 0a unit **F-03**. F-03
  sits in Phase 0 (stop the bleeding); foundational, not domain.
- **ADR-0002 hexagonal shape** —
  `docs/adr/0002-hexagonal-shape-and-naming.md`. The dependency rule:
  business logic depends on abstractions, never on a concrete vendor.
  F-03 is a procedural foundation utility, not a port. ADR-0002 line 9
  cites the rip-out test from CLAUDE.md — F-03 does not affect that
  test (no vendor coupling introduced).
- **ADR-0003 strangler-fig** —
  `docs/adr/0003-strangler-fig-migration-and-freeze-rule.md`. F-03
  ships unused. The 80+/104 existing role-check sites under
  `app/api/**` continue to use the cookie-based pattern they use
  today. F-04 (next Phase 0 unit) lint-guards SDK leaks, NOT role
  checks. Adoption is staged into each domain's own PR.
- **ADR-0004 RLS posture** —
  `docs/adr/0004-rls-vs-service-role-security-model.md`. F-03 does NOT
  touch service-role vs anon-key. The helper reads
  middleware-set headers — same place existing checks read from. It
  does NOT verify JWTs or hit the DB.
- **ADR-0005 F-01 narrowing** —
  `docs/adr/0005-f01-narrowed-raw-fetch-deferred-to-port-extractions.md`.
  F-03 must NOT touch any of the 13 raw-fetch sites or the
  optimise/compute-road-times routes mapped to Phase 1+ units.
- **F-FND-02 typed-error contract** — `lib/errors/AppError.ts:44-89`
  (abstract base), `lib/errors/NotFoundError.ts` (the canonical
  4-line subclass template — match its shape verbatim),
  `lib/errors/index.ts` (the barrel re-export — add two new lines),
  `lib/errors/withErrors.ts:50-69` (the framework HOF that catches
  `AppError` subclasses and maps to HTTP). F-03 adds two new
  subclasses; `withErrors` handles them automatically with no edits.
- **F-FND-03 observability surface** — `lib/observability/Caller.ts`
  (the `Role` union + `Caller` interface + `makeCaller` factory),
  `lib/observability/withRequestContext.ts:51-57` (the current home of
  `KNOWN_ROLES`/`isKnownRole`), `lib/observability/log.ts`
  (the structured logger — NOT used by F-03, listed for recon
  completeness).
- **F-01 (narrowed) plan** —
  `docs/plans/2026-06-07-f-01-consolidate-road-times-client.md`. The
  structural template for F-\* plans; matched in depth and section
  shape (Goal → Source spec → Compliance → Branch + base →
  Repo recon → File-by-file changes → Implementation steps →
  Test matrix → Risks → Rollback → DoD → Out of scope → ADR / docs
  implications).
- **F-FND-02 plan** —
  `docs/plans/2026-06-06-f-fnd-02-typed-errors.md`. The reference for
  test-style + ANVIL-gate language and the AppError/withErrors
  contract.

---

## Compliance

**NO runtime compliance impact.** F-03 ships the helper unused. No
route is migrated; no auth path is changed; no payment, HACCP,
financial, food-safety-legislation, data-retention, or
document-control surface is touched. Cookie semantics are unchanged
(F-03 does not read cookies at all — only the four `x-mfs-*` headers
middleware already sets). The session-cookie parsing and the
`mfs_session` cookie name remain solely middleware.ts's concern.

**ADR-0002 rip-out test — F-03 does NOT regress the test.** F-03
introduces zero new vendor coupling. The helper reads headers (a
framework primitive, `NextRequest.headers.get(...)`), filters strings
through a pure predicate (`isKnownRole`), throws domain-typed errors
(`AppError` subclasses, no vendor surface), and returns a domain
type (`Caller`, no vendor surface). The "rip out the DB tomorrow"
exercise is unaffected — the helper does not touch any DB.

**ADR-0002 deep-modules / interface comments first.** `requireRole`
is a deep module under APOSD §3: one identifier, three-line signature
comment, hides ≈25 lines of header reading + isKnownRole filtering +
multi-role union + intersection + typed-error throws + Caller
construction. The complexity it hides is significant; the interface
is one identifier. Strong APOSD fit (matches the depth ratio
F-FND-02's `withErrors` achieves and F-FND-03's `withRequestContext`
achieves).

**ADR-0003 strangler-fig posture.** F-03 sits squarely inside Phase 0
(_stop the bleeding_). Phase 0 builds foundations; the 80+/104
existing role-check sites continue to use the cookie-based pattern
they use today. F-04's ESLint guard (next Phase 0 unit) does NOT
forbid `cookies.get('mfs_role')` — that's Phase 5 / F-13 territory.
F-03 is opt-in foundation only. **No FREEZE-rule violation** by not
migrating existing routes — the FREEZE rule applies to new code, and
the locked spec explicitly limits F-03 to additive work.

**ADR-0004 RLS posture.** No change. F-03 does not touch
`supabaseService`, does not touch any anon-key construction, does not
hit Postgres. The helper is HTTP-layer-only.

**ADR-0005 F-01 narrowing.** F-03 must NOT touch any of the 13
raw-fetch sites or the optimise/compute-road-times routes
enumerated in ADR-0005. Verified in §Out of scope — the
`git diff main app/api/...` greps in DoD enforce zero edits across
those paths.

**KNOWN_ROLES / isKnownRole move — interface-preserving refactor.**
The move from `withRequestContext.ts:51-57` to `Caller.ts` is the
only edit to F-FND-03's surface in this PR. Net diff:
~3 lines added to `Caller.ts` (the const + the predicate), ~3
removed from `withRequestContext.ts`, plus one import line. Pays
down a known F-FND-03 advisory ("KNOWN_ROLES vs Role union — single
source"). No behavioural change to `withRequestContext`; the
existing 7-case `tests/unit/observability/withRequestContext.test.ts`
suite continues to pass unchanged because the test imports
`withRequestContext` from `@/lib/observability/withRequestContext`
and exercises it behaviourally, not by importing the private
helpers.

---

## Branch + base

- **Base:** `main` HEAD `c257101` —
  `refactor(road-times): consolidate onto supabaseService (F-01 narrowed) (#19)`.
  Verified via `git rev-parse main` returns
  `c2571016546b82d259415de06905b9ddf59afa12`. All F-FND-01 / F-FND-02 /
  F-FND-03 / F-INFRA-01 / F-01 foundations are on main.
- **Branch:** `f-03-require-role-helper` (matches the conductor
  brief verbatim; not `forge/...` because the brief names the branch
  directly, mirroring F-01's branch convention).
- **PR target:** `main`. **Not auto-merged.** Hakan ships via the same
  squash-merge flow as #15–#19 once ANVIL gates pass.
- **PR title:** `feat(auth): requireRole helper + UnauthorizedError + ForbiddenError (F-03)`.
- **Commit shape: Option 1 (2 commits) ADOPTED.** Rationale in
  Implementation Steps §3. Matches F-01's two-commit pattern (refactor
  - test).

---

## 1. Repo recon findings

Captured before planning. Every claim grounded in the actual files on
`main` HEAD `c257101`.

1. **`lib/auth/` does NOT exist yet.** `ls lib/auth` returns "No such
   file or directory". F-03 creates the directory. Greenfield —
   no migration / absorption concern.
2. **`tests/unit/auth/` does NOT exist yet.** `ls tests/unit/auth`
   returns "No such file or directory". F-03 creates it. Other
   `tests/unit/<module>/` directories already exist
   (`tests/unit/errors/`, `tests/unit/observability/`,
   `tests/unit/design-system/`, `tests/unit/nav/`, `tests/unit/orders/`,
   `tests/unit/dashboard-admin/`) — pattern is well-established.
3. **`lib/observability/Caller.ts` (56 lines) defines:**
   - The `Role` type union (lines 26-32): six string literals
     `'warehouse' | 'office' | 'sales' | 'admin' | 'driver' | 'butcher'`.
   - The `Caller` interface (lines 34-38): three readonly fields
     `userId: string | null`, `role: Role | null`,
     `correlationId: string`.
   - The `makeCaller` factory (lines 45-55): pure, no side effects,
     defaults `userId`/`role` to `null`.
   - Header doc comment (lines 1-24) explicitly anticipates the F-13
     migration: _"When the Users + Auth migration lands (F-13), this
     canonical type moves to a domain module (lib/domain/Role.ts) and
     this file will re-import."_ Adding `KNOWN_ROLES`/`isKnownRole`
     here in F-03 fits that direction — they move with the union when
     F-13 lands.
4. **`lib/observability/withRequestContext.ts` (84 lines) defines:**
   - `KNOWN_ROLES: readonly Role[]` at line 51-53 (private,
     module-scoped).
   - `isKnownRole(v: string | null): v is Role` at line 55-57
     (private; type-predicate; the lone external behaviour is
     `(KNOWN_ROLES as readonly string[]).includes(v)`).
   - `deriveCorrelationId(req: NextRequest): string` at line 59-63
     (private; reads `x-request-id` header trimmed, length 1..128
     accepted; falls back to `randomBytes(8).toString('hex')`).
   - `withRequestContext` HOF at line 65-83 (exported).
   - The four header reads (lines 70-71): `x-mfs-user-id` →
     `userId`, `x-mfs-user-role` → `roleHdr`, then `isKnownRole(roleHdr)
? roleHdr : null`.
   - **withRequestContext does NOT currently read
     `x-mfs-secondary-roles`.** This is the load-bearing recon point:
     F-03 introduces the first consumer of that header outside
     middleware.ts itself.
5. **`middleware.ts` (168 lines) sets four `x-mfs-*` headers at
   lines 141-145:**
   ```ts
   const requestHeaders = new Headers(req.headers);
   requestHeaders.set("x-mfs-user-id", session.userId);
   requestHeaders.set("x-mfs-user-name", session.name);
   requestHeaders.set("x-mfs-user-role", session.role);
   requestHeaders.set(
     "x-mfs-secondary-roles",
     (session.secondaryRoles ?? []).join(","),
   );
   ```
   The role-permissions check at lines 127-128 + 152-154:
   ```ts
   const { role } = session
   const allRoles = [role, ...(session.secondaryRoles ?? []).filter(r => r !== 'admin')]
   ...
   const permitted = allRoles.flatMap(r => ROLE_PERMISSIONS[r] ?? [])
   const isPermitted = permitted.some((p) => pathname.startsWith(p))
   ```
   **F-03 mirrors this exact behaviour at the API-route layer.**
   The `.filter(r => r !== 'admin')` on the secondary list is the
   "ghost admin" rule: a user whose `secondaryRoles` contains `admin`
   is NOT silently elevated by middleware. F-03 preserves the same
   filter verbatim. **The primary `admin` (i.e. `session.role === 'admin'`)
   is NOT filtered out** — only the secondary-admin literal is
   stripped. This nuance is what test case (g) protects.
6. **Existing role-check sites in `app/api/**`— 104 grep hits.**`grep -rn "x-mfs-user-role\|cookies.get..'mfs_role'" app/api | wc -l`returns 104. The conductor brief estimates "80+"; actual is 104.
Sample at`app/api/orders/route.ts:30-39`:
   ```ts
   const ROLES_READ   = ['admin', 'sales', 'office', 'warehouse', 'butcher']
   const ROLES_CREATE = ['admin', 'sales', 'office']
   ...
   export async function GET(req: NextRequest) {
     try {
       const role = req.cookies.get('mfs_role')?.value
       if (!role || !ROLES_READ.includes(role)) {
         return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
       }
   ```
   **Note: this site uses 401 for "wrong role" — which is technically
   wrong (should be 403).** F-03 fixes that at the helper level
   (Forbidden = 403); the eventual per-domain adopter PR carrying
   migration to `requireRole` will silently correct the 80 sites that
   share this bug. **F-03 itself does NOT migrate any of them.**
7. **`lib/errors/` (7 files) — F-FND-02 typed-error contract,
   already on main.**
   - `AppError.ts` (89 lines): abstract base. `abstract readonly
httpStatus: number`, `abstract readonly code: string`,
     `readonly context?: Record<string, unknown>`. Constructor
     `(message, options?: { cause?, context? })`. ES2017 caveat
     handled inline. `toJSON()` strips `cause`/`stack` in production.
   - `NotFoundError.ts` (18 lines): the canonical template — 4-line
     class body (`readonly httpStatus = 404`, `readonly code = 'NOT_FOUND'`)
     plus an 8-line header doc comment ("When to use it" / "When NOT to use it").
   - `ConflictError.ts`, `ServiceError.ts` follow the same shape.
   - `ValidationError.ts` is the exception — it carries an extra
     `fields` map; F-03's new errors do NOT need this complexity.
   - `index.ts` (13 lines): barrel re-export. Add two new lines.
   - `withErrors.ts` (84 lines): the HOF. `catch (err) { if (err instanceof AppError) return NextResponse.json(err.toJSON(), { status: err.httpStatus }) }`.
     **F-03's new errors flow through unchanged — no withErrors edit
     needed.**
8. **`tests/unit/errors/NotFoundError.test.ts` (53 lines) — the style
   template.** Six cases:
   - "is an instance of AppError"
   - "httpStatus is 404 and code is NOT_FOUND"
   - "name is 'NotFoundError'"
   - "toJSON() emits the documented body in dev mode"
   - "toJSON() strips cause and stack in production"
   - "surfaces context in the JSON body"
     F-03's new `UnauthorizedError.test.ts` and `ForbiddenError.test.ts`
     are NOT in scope (the locked spec specifies only the 8-case
     `session.test.ts`); the typed errors are exercised through the
     helper test, and their structural correctness is covered by their
     identical-shape relationship to `NotFoundError` which already has a
     passing test. (**See §Risks #5 — flagged for Gate 2: the conductor
     may want minimal mirror unit tests for the two error classes to
     match the F-FND-02 style. Recommend: defer.**)
9. **`tests/unit/observability/withRequestContext.test.ts` (141 lines)
   — confirms the NextRequest mock pattern.** Lines 25-27:
   ```ts
   function makeRequest(headers: Record<string, string> = {}): NextRequest {
     return new NextRequest("http://localhost/test", { headers });
   }
   ```
   **This is the pattern F-03's test adopts verbatim.** It's
   in-file, 2 lines, no shared helper module exists today. Not worth
   extracting a shared `tests/helpers/makeRequest.ts` in F-03 (single
   additional caller does not justify a new helper module — APOSD
   §3 depth-over-shallow-helpers; flagged in Risks #6 in case the
   conductor disagrees).
10. **`tests/unit/observability/Caller.test.ts` (65 lines) — the
    style template for `Caller` related unit tests.** Uses
    `import { makeCaller, type Caller, type Role } from '@/lib/observability/Caller'`.
    F-03's session test will import `type Role` from
    `@/lib/observability/Caller` for `allowedRoles` typing.
11. **Plan filename convention.** The conductor brief names
    `docs/plans/2026-06-08-f-03-require-role-helper.md` verbatim.
    Date is 2026-06-08 (today). Matches the same-day-as-implementation
    pattern of F-FND-03 / F-INFRA-01 / F-01.
12. **Commit-message convention.** Recent history on `main`:
    `refactor(road-times):` (F-01), `feat(testing):` (F-INFRA-01),
    `feat(observability):` (F-FND-03), `feat(errors):` (F-FND-02),
    `docs(adr):` (F-FND-01). F-03 is a feature add — the conductor
    brief names `feat(auth):` for the PR title and individual
    commits. Plan adopts that scheme verbatim. **No commit message
    skips hooks (`--no-verify`) — there are no commit hooks
    configured; standard `git commit -m '...'` with HEREDOC
    body.**
13. **Co-author trailer.** Matches F-FND-02 / F-FND-03 / F-INFRA-01 /
    F-01 exactly: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
    on every commit.
14. **No DB migrations.** F-03 does not modify schema, does not add
    migration files, does not touch `supabase/migrations/`. The
    standing PITR / migration-safety hook does not fire at Gate 4.
15. **TypeScript / lint baseline.** Per the established F-FND-03 / F-01
    pattern, `npx tsc --noEmit` and `npm run lint` are run as
    **calibrated** gates: zero NEW violations attributable to F-03
    files (`lib/auth/session.ts`, `lib/auth/index.ts`,
    `lib/errors/UnauthorizedError.ts`, `lib/errors/ForbiddenError.ts`,
    `lib/errors/index.ts` modified, `lib/observability/Caller.ts`
    modified, `lib/observability/withRequestContext.ts` modified,
    `tests/unit/auth/session.test.ts`). The ~60 pre-existing `tsc`
    errors and the pre-existing ESLint nits remain F-TD-01's
    responsibility, not this PR's.
16. **No package.json deps changed.** `git diff main package.json`
    must be empty when this PR lands. `@supabase/supabase-js`,
    `next`, `vitest` etc. are all already at the required versions.
    If a dep is added inadvertently, ANVIL Gate 4 fails.
17. **No new ADR.** Gate 1 explicitly confirmed F-03 conforms to
    ADRs 0002/0003/0004/0005 without new architectural decisions.
    No file added under `docs/adr/`.
18. **Caller barrel re-export of `KNOWN_ROLES` / `isKnownRole`.**
    `lib/observability/index.ts` currently re-exports
    `{ Caller, Role, makeCaller }` from `./Caller`. After the move,
    `KNOWN_ROLES` and `isKnownRole` MAY also be re-exported via this
    barrel — but doing so widens the observability module's public
    surface area unnecessarily (F-03 is the only outside-this-module
    consumer of `isKnownRole`, and F-03 imports it directly from
    `@/lib/observability/Caller`, not the barrel). **Decision: do
    NOT widen the `lib/observability/index.ts` barrel.** Both new
    symbols are exported from `Caller.ts` directly; F-03 and the
    moved `withRequestContext.ts` use the direct
    `from './Caller'` / `from '@/lib/observability/Caller'` import
    paths. Keeps the barrel minimal.
19. **`lib/auth/index.ts` barrel — DECISION: YES, ship one.**
    The `lib/errors/index.ts` and `lib/observability/index.ts`
    barrels are the established pattern. F-03 ships exactly one
    public symbol from `lib/auth/` today (`requireRole`), but the
    locked spec is explicit that adopter PRs will be migrating
    routes to `import { requireRole } from '@/lib/auth'` — barrel
    imports are easier on adopters and match the lift of the other
    two `lib/<module>/index.ts` modules. The barrel adds 1 line and
    zero behaviour. **The argument against** is "one symbol does not
    justify a barrel" — but the next adopter PR's import would have
    to change anyway when other symbols ship (e.g. a future
    `getCaller` re-export from auth, or a future
    `requirePermission` helper). Shipping the barrel now stabilises
    the import path. **Adopted.** See file table in §2.

---

## 2. File-by-file changes

### New files (7)

| Path                                          | Purpose                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lib/auth/session.ts`                         | Exports `requireRole(req: NextRequest, allowedRoles: Role[]): Caller`. Reads 4 headers (`x-mfs-user-id`, `x-mfs-user-role`, `x-mfs-secondary-roles`, `x-request-id`), filters role strings via `isKnownRole`, computes the union per middleware.ts:128 verbatim, intersects with `allowedRoles`, throws `UnauthorizedError`/`ForbiddenError` or returns the constructed `Caller`.                            |
| `lib/auth/index.ts`                           | Barrel: `export { requireRole } from './session'`. Matches the `lib/errors/index.ts` and `lib/observability/index.ts` pattern. Single export today; structurally stable when adopter PRs land.                                                                                                                                                                                                               |
| `lib/errors/UnauthorizedError.ts`             | 4-line subclass of `AppError`. `readonly httpStatus = 401`. `readonly code = 'UNAUTHORIZED'`. Matches `NotFoundError.ts` shape verbatim plus an 8-line header doc comment ("When to use it" / "When NOT to use it").                                                                                                                                                                                         |
| `lib/errors/ForbiddenError.ts`                | 4-line subclass of `AppError`. `readonly httpStatus = 403`. `readonly code = 'FORBIDDEN'`. Same shape + doc.                                                                                                                                                                                                                                                                                                 |
| `tests/unit/auth/session.test.ts`             | Vitest unit suite — 8 cases (a–h) per the locked spec. Inline 2-line `makeRequest()` helper mirroring `tests/unit/observability/withRequestContext.test.ts:25-27`. No DB; no Supabase; no I/O.                                                                                                                                                                                                               |
| `tests/unit/errors/UnauthorizedError.test.ts` | **Gate 2 decision — ADOPTED.** Vitest unit suite mirroring `tests/unit/errors/NotFoundError.test.ts` verbatim in shape. Asserts: constructor with message, `httpStatus === 401`, `code === 'UNAUTHORIZED'`, `name === 'UnauthorizedError'`, `toJSON()` shape, prod-mode redaction (inherited from `AppError`). ~50 lines. Matches the standalone-test convention every other error subclass already follows. |
| `tests/unit/errors/ForbiddenError.test.ts`    | **Gate 2 decision — ADOPTED.** Same shape as `UnauthorizedError.test.ts`, asserting `httpStatus === 403`, `code === 'FORBIDDEN'`, `name === 'ForbiddenError'`. ~50 lines.                                                                                                                                                                                                                                    |

### Modified files (3)

| Path                                      | Edit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/observability/Caller.ts`             | Add the `KNOWN_ROLES` constant + `isKnownRole` predicate as new exports, copied byte-for-byte from `withRequestContext.ts:51-57`. Insert AFTER the `Role` union (after line 32) and BEFORE the `Caller` interface (which becomes lines 38+). Total: ~6 added lines (the const + the predicate + one separator + a 2-line doc comment explaining "type-predicate that filters string inputs into the `Role` union — moved here in F-03 to keep the union and its runtime filter together"). **No edit to `Caller`, `makeCaller`, `Role`, or the header doc comment.** The deliberate F-13 forward-looking note at lines 9-16 (the `lib/domain/Role.ts` migration target) already covers `KNOWN_ROLES`/`isKnownRole` by extension — they move with the union. |
| `lib/observability/withRequestContext.ts` | Remove `KNOWN_ROLES` const (lines 51-53) and `isKnownRole` function (lines 55-57). Add `isKnownRole` to the existing `import { makeCaller, type Role } from './Caller'` line at the top — becomes `import { makeCaller, type Role, isKnownRole } from './Caller'`. **Net diff: -7 lines (the const + the predicate + their separator blank lines), +1 import token.** Behaviour: identical. The 7-case `tests/unit/observability/withRequestContext.test.ts` suite continues to pass unchanged.                                                                                                                                                                                                                                                             |
| `lib/errors/index.ts`                     | Add two re-exports: `export { UnauthorizedError } from './UnauthorizedError'` and `export { ForbiddenError } from './ForbiddenError'`. Insert in alphabetical order after the existing `NotFoundError` line. Net diff: +2 lines.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

### `lib/auth/session.ts` — target shape

```ts
/**
 * lib/auth/session.ts
 *
 * Procedural role-check helper for Next.js App Router route handlers.
 *
 * What this hides:
 *   - Reading the four x-mfs-* request headers middleware.ts sets at
 *     :142-145 (x-mfs-user-id, x-mfs-user-role, x-mfs-secondary-roles).
 *   - Filtering unknown role strings via the shared `isKnownRole`
 *     type-predicate.
 *   - Enforcing the multi-role permission check verbatim from
 *     middleware.ts:128, 152-154 — union of primary + secondaries
 *     (with the secondary-admin literal filtered out), intersection
 *     with the route's `allowedRoles`.
 *   - Throwing typed AppError subclasses (UnauthorizedError 401,
 *     ForbiddenError 403) so the framework HOF translates them to
 *     HTTP responses automatically.
 *   - Constructing the F-FND-03 `Caller` shape from the request
 *     headers, so the caller is bound for any downstream
 *     `withRequestContext`-aware log line on the same request.
 *
 * When to use it: every route handler that needs role-based
 * authorisation. Wrap the call as the FIRST step inside the handler:
 *
 *   export const POST = withRequestContext(withErrors(async (req) => {
 *     const caller = requireRole(req, ['admin', 'office'])
 *     // ... business logic ...
 *     return NextResponse.json({ ok: true })
 *   }))
 *
 * The helper does NOT verify JWTs, does NOT touch the DB, and does
 * NOT replace `withRequestContext`'s caller binding (the two
 * mechanisms coexist — withRequestContext binds the caller into ALS;
 * requireRole returns a freshly-constructed Caller for the
 * handler's local use).
 *
 * Secondary-roles posture (preserved verbatim from middleware.ts:128):
 *   - The PRIMARY role is checked as-is.
 *   - The SECONDARY role list has `'admin'` filtered out before union.
 *     A secondary-admin is a "ghost" elevation that middleware
 *     explicitly ignores; this helper preserves that safety rule.
 *   - The primary `'admin'` is NOT filtered out — only the secondary
 *     `'admin'` literal is stripped.
 *
 * Throws:
 *   - UnauthorizedError (401, code 'UNAUTHORIZED') if no identity is
 *     present (missing/empty x-mfs-user-id, OR missing/unknown
 *     x-mfs-user-role).
 *   - ForbiddenError (403, code 'FORBIDDEN') if identity is present
 *     but no role in [primary, ...filteredSecondaries] is in
 *     allowedRoles.
 *
 * Returns (success): the existing F-FND-03 `Caller` shape — three
 * fields: { userId, role, correlationId }. Secondary roles are used
 * internally for the permission check ONLY and are deliberately NOT
 * exposed on the returned Caller (Gate 1 Q5 decision: keep the Caller
 * surface stable; secondaryRoles are a header-layer concern, not a
 * domain-identity concern).
 *
 * F-03 ships this helper unused. Adopter PRs migrate the 80+/104
 * existing role-check sites incrementally inside their owning
 * domain's PR.
 */
import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import {
  makeCaller,
  isKnownRole,
  type Caller,
  type Role,
} from "@/lib/observability/Caller";
import { UnauthorizedError, ForbiddenError } from "@/lib/errors";

export function requireRole(
  req: NextRequest,
  allowedRoles: readonly Role[],
): Caller {
  // 1) Identity headers (set by middleware.ts:142-145).
  const userId = req.headers.get("x-mfs-user-id")?.trim() || null;
  const roleHdr = req.headers.get("x-mfs-user-role");
  const role = isKnownRole(roleHdr) ? roleHdr : null;

  // 2) No identity? 401 UNAUTHORIZED.
  if (userId === null || role === null) {
    throw new UnauthorizedError("Authentication required.");
  }

  // 3) Build the role union, mirroring middleware.ts:128.
  //    Primary role: kept as-is.
  //    Secondary roles: each filtered through isKnownRole, then the
  //    'admin' literal stripped (the "ghost admin" safety rule).
  const secondariesRaw = (req.headers.get("x-mfs-secondary-roles") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const secondaries: Role[] = secondariesRaw
    .filter(isKnownRole)
    .filter((r): r is Role => r !== "admin");
  const union: readonly Role[] = [role, ...secondaries];

  // 4) Intersect with allowedRoles. 403 FORBIDDEN if no overlap.
  const allowed = union.some((r) => allowedRoles.includes(r));
  if (!allowed) {
    throw new ForbiddenError("Role does not permit this action.");
  }

  // 5) Construct + return the Caller.
  //    correlationId: same logic as withRequestContext.ts:59-63 —
  //    reuse `x-request-id` if present and 1..128 chars, otherwise
  //    generate a fresh 16-char hex id. If `withRequestContext` has
  //    already run on this request, the header has been left intact
  //    and we read the same id it bound to ALS; if it hasn't run,
  //    the freshly-generated id is still valid for this Caller.
  const cidHdr = req.headers.get("x-request-id")?.trim();
  const correlationId =
    cidHdr && cidHdr.length > 0 && cidHdr.length <= 128
      ? cidHdr
      : randomBytes(8).toString("hex");

  return makeCaller({ userId, role, correlationId });
}
```

### `lib/auth/index.ts` — target shape

```ts
/**
 * lib/auth/index.ts
 *
 * Barrel re-export for the auth module. Import surface for callers:
 *   `import { requireRole } from '@/lib/auth'`
 *
 * Today (F-03) the module exports a single helper. Future adopter
 * PRs may add more (e.g. a `requirePermission` helper for
 * field-level checks), at which point the barrel grows by one line
 * per export.
 */
export { requireRole } from "./session";
```

### `lib/errors/UnauthorizedError.ts` — target shape

```ts
/**
 * lib/errors/UnauthorizedError.ts
 *
 * Thrown when no valid identity is present on a request — missing or
 * malformed authentication credentials. Maps to HTTP 401.
 *
 * When to use it: `requireRole(...)` throws this when the
 * x-mfs-user-id header is missing/empty or x-mfs-user-role is
 * missing/unknown. Any helper that decides "the caller has no
 * identity we can check against" throws this.
 *
 * When NOT to use it: the caller IS identified but is forbidden from
 * the action (use `ForbiddenError` — that's a 403, semantically
 * "I know who you are but you're not allowed").
 */
import { AppError } from "./AppError";

export class UnauthorizedError extends AppError {
  readonly httpStatus = 401;
  readonly code = "UNAUTHORIZED";
}
```

### `lib/errors/ForbiddenError.ts` — target shape

```ts
/**
 * lib/errors/ForbiddenError.ts
 *
 * Thrown when a request is authenticated but lacks the role / permission
 * required for the requested action. Maps to HTTP 403.
 *
 * When to use it: `requireRole(...)` throws this when the resolved
 * primary + secondaries union has no overlap with the route's
 * allowedRoles. Any helper that decides "I know who you are but you're
 * not allowed" throws this.
 *
 * When NOT to use it: the caller has no identity at all (use
 * `UnauthorizedError` — that's a 401). The HTTP spec is clear: 401
 * for "not authenticated", 403 for "authenticated but not allowed".
 */
import { AppError } from "./AppError";

export class ForbiddenError extends AppError {
  readonly httpStatus = 403;
  readonly code = "FORBIDDEN";
}
```

### `lib/errors/index.ts` — diff

**Before:**

```ts
export { AppError, type ErrorBody } from "./AppError";
export { NotFoundError } from "./NotFoundError";
export { ConflictError } from "./ConflictError";
export { ValidationError, type ValidationErrorBody } from "./ValidationError";
export { ServiceError } from "./ServiceError";
export { withErrors, type RouteHandler } from "./withErrors";
```

**After:**

```ts
export { AppError, type ErrorBody } from "./AppError";
export { NotFoundError } from "./NotFoundError";
export { ConflictError } from "./ConflictError";
export { UnauthorizedError } from "./UnauthorizedError";
export { ForbiddenError } from "./ForbiddenError";
export { ValidationError, type ValidationErrorBody } from "./ValidationError";
export { ServiceError } from "./ServiceError";
export { withErrors, type RouteHandler } from "./withErrors";
```

Insertion in HTTP-status-ascending order (400 ValidationError, 401
UnauthorizedError, 403 ForbiddenError, 404 NotFoundError, 409
ConflictError, 500 ServiceError) is NOT used — the existing barrel
groups by family (the 4xx semantic group), not by status. F-03
respects that grouping: Unauthorized + Forbidden land adjacent and
between NotFound and Validation. **Style match: same column-aligned
formatting as the existing lines (use spaces, not tabs).**

### `lib/observability/Caller.ts` — diff intent

**Add after line 32 (the `Role` union closing), before the `Caller`
interface:**

```ts
/**
 * Runtime allow-list mirror of the `Role` union. Used by `isKnownRole`
 * to filter unsafe `string | null` inputs (e.g. request headers) into
 * the `Role` union.
 *
 * Single source of truth: if a role is added to the union above, it
 * MUST be added here too (and vice versa) — see `tests/unit/observability/Caller.test.ts`
 * which asserts both surfaces enumerate the six known literals.
 *
 * Moved to this file in F-03 from `withRequestContext.ts` to keep the
 * union and its runtime filter together (see header doc above re.
 * the F-13 forward path).
 */
export const KNOWN_ROLES: readonly Role[] = [
  "warehouse",
  "office",
  "sales",
  "admin",
  "driver",
  "butcher",
];

/**
 * Type-predicate: returns `true` iff `v` is a known `Role` literal.
 * Use it at any boundary where untrusted strings (request headers,
 * URL params, cookies) need narrowing into the `Role` union.
 */
export function isKnownRole(v: string | null | undefined): v is Role {
  return (
    v !== null &&
    v !== undefined &&
    (KNOWN_ROLES as readonly string[]).includes(v)
  );
}
```

Note: the original `isKnownRole` signature in
`withRequestContext.ts:55` was `(v: string | null) => v is Role`.
The plan widens to `string | null | undefined` so the helper can
also accept the result of `.headers.get('x-mfs-secondary-roles')?.split(',').map(s => s.trim())[i]`
pipelines without forcing a `?? ''` workaround. The wider signature
is a strict superset — `withRequestContext.ts`'s existing
`isKnownRole(roleHdr)` call still type-checks (roleHdr is
`string | null`). **No behavioural change** to withRequestContext.

### `lib/observability/withRequestContext.ts` — diff intent

**Before (lines 41-57):**

```ts
import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { makeCaller, type Role } from "./Caller";
import { runWithCaller } from "./context";

export type RouteHandler<Args extends unknown[] = []> = (
  req: NextRequest,
  ...rest: Args
) => Promise<Response>;

const KNOWN_ROLES: readonly Role[] = [
  "warehouse",
  "office",
  "sales",
  "admin",
  "driver",
  "butcher",
];

function isKnownRole(v: string | null): v is Role {
  return v !== null && (KNOWN_ROLES as readonly string[]).includes(v);
}
```

**After (lines 41-49):**

```ts
import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { makeCaller, isKnownRole, type Role } from "./Caller";
import { runWithCaller } from "./context";

export type RouteHandler<Args extends unknown[] = []> = (
  req: NextRequest,
  ...rest: Args
) => Promise<Response>;
```

Net: -7 lines (const + predicate body + 2 separator/blank lines), +1
token in the import. `type Role` is RETAINED in the destructured
import because it's still used in `RouteHandler`'s generic
constraint scope — wait, actually no, it isn't used in this file
after the move. **Verify at implementation time:** if `Role` becomes
unused after the move, drop it from the destructured import to keep
the TS strict baseline clean.

### `tests/unit/auth/session.test.ts` — skeleton

```ts
/**
 * tests/unit/auth/session.test.ts
 *
 * F-03 — proves `requireRole(req, allowedRoles)` behaviour with the
 * eight locked cases from the Gate 1 spec. Pure logic, no DB.
 *
 * Each case constructs a NextRequest with the headers under test and
 * either expects a typed-error throw or asserts the returned Caller
 * shape.
 *
 * Style mirrors tests/unit/observability/withRequestContext.test.ts
 * (the 2-line in-file `makeRequest` helper).
 */
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { UnauthorizedError, ForbiddenError } from "@/lib/errors";
import type { Role } from "@/lib/observability/Caller";

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/test", { headers });
}

describe("requireRole", () => {
  // ── (a) ───────────────────────────────────────────────────────
  it("throws UnauthorizedError (401) when x-mfs-user-id header is absent", () => {
    const req = makeRequest({ "x-mfs-user-role": "admin" });
    expect(() => requireRole(req, ["admin"])).toThrow(UnauthorizedError);
    try {
      requireRole(req, ["admin"]);
    } catch (err) {
      expect(err).toBeInstanceOf(UnauthorizedError);
      expect((err as UnauthorizedError).httpStatus).toBe(401);
      expect((err as UnauthorizedError).code).toBe("UNAUTHORIZED");
    }
  });

  // ── (b) ───────────────────────────────────────────────────────
  it("throws UnauthorizedError (401) when x-mfs-user-role header is absent", () => {
    const req = makeRequest({ "x-mfs-user-id": "u-1" });
    expect(() => requireRole(req, ["admin"])).toThrow(UnauthorizedError);
  });

  // ── (c) ───────────────────────────────────────────────────────
  it("throws UnauthorizedError (401) when x-mfs-user-role is an unknown role string", () => {
    const req = makeRequest({
      "x-mfs-user-id": "u-1",
      "x-mfs-user-role": "ghost",
    });
    expect(() => requireRole(req, ["admin"])).toThrow(UnauthorizedError);
  });

  // ── (d) ───────────────────────────────────────────────────────
  it("throws ForbiddenError (403) when primary role is not in allowedRoles and no secondary matches", () => {
    const req = makeRequest({
      "x-mfs-user-id": "u-1",
      "x-mfs-user-role": "driver",
      "x-mfs-secondary-roles": "",
    });
    expect(() => requireRole(req, ["admin", "office"])).toThrow(ForbiddenError);
    try {
      requireRole(req, ["admin", "office"]);
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenError);
      expect((err as ForbiddenError).httpStatus).toBe(403);
      expect((err as ForbiddenError).code).toBe("FORBIDDEN");
    }
  });

  // ── (e) ───────────────────────────────────────────────────────
  it("returns a Caller when primary role is in allowedRoles", () => {
    const req = makeRequest({
      "x-mfs-user-id": "u-42",
      "x-mfs-user-role": "admin",
    });
    const caller = requireRole(req, ["admin", "office"]);
    expect(caller.userId).toBe("u-42");
    expect(caller.role).toBe("admin");
    expect(typeof caller.correlationId).toBe("string");
    expect(caller.correlationId.length).toBeGreaterThan(0);
    // Structural assertion: exactly the three documented keys, no more.
    expect(Object.keys(caller).sort()).toEqual([
      "correlationId",
      "role",
      "userId",
    ]);
  });

  // ── (f) ───────────────────────────────────────────────────────
  it("returns a Caller when primary is not allowed but a secondary role IS in allowedRoles (multi-role grant)", () => {
    const req = makeRequest({
      "x-mfs-user-id": "u-2",
      "x-mfs-user-role": "sales",
      "x-mfs-secondary-roles": "office,warehouse",
    });
    const caller = requireRole(req, ["office"]);
    expect(caller.role).toBe("sales"); // primary is kept on the returned Caller
    expect(caller.userId).toBe("u-2");
  });

  // ── (g) ───────────────────────────────────────────────────────
  it("throws ForbiddenError (403) when primary is office and secondary contains admin and allowedRoles is admin only (secondary-admin filter)", () => {
    // This is the load-bearing "ghost admin" safety rule mirrored
    // from middleware.ts:128. A user whose secondaryRoles contains
    // 'admin' must NOT be silently elevated. requireRole filters
    // 'admin' OUT of the secondary list before the union, so the
    // only role left to match is the primary 'office' — which is
    // not in ['admin'], hence 403.
    const req = makeRequest({
      "x-mfs-user-id": "u-3",
      "x-mfs-user-role": "office",
      "x-mfs-secondary-roles": "admin",
    });
    expect(() => requireRole(req, ["admin"])).toThrow(ForbiddenError);
  });

  // ── (h) ───────────────────────────────────────────────────────
  it("returned Caller is structurally typed correctly (userId: string, role: Role union)", () => {
    const req = makeRequest({
      "x-mfs-user-id": "u-9",
      "x-mfs-user-role": "butcher",
    });
    const caller = requireRole(req, ["butcher"]);
    // Compile-time + runtime assertions on the documented shape.
    const userIdTyped: string = caller.userId as string; // F-FND-03 Caller.userId is string | null; on success it is string.
    expect(typeof userIdTyped).toBe("string");
    const roleTyped: Role = caller.role as Role; // On success it is non-null.
    expect([
      "warehouse",
      "office",
      "sales",
      "admin",
      "driver",
      "butcher",
    ]).toContain(roleTyped);
  });
});
```

**Why eight cases is enough.** Together they exercise every branch of
`requireRole`:

- (a) identity check fails on missing userId.
- (b) identity check fails on missing role header.
- (c) identity check fails on unknown role string (`isKnownRole`
  returns false).
- (d) intersection-check fails with no secondary matches.
- (e) intersection-check passes via primary.
- (f) intersection-check passes via secondary (the multi-role union
  is exercised).
- (g) secondary-admin filter is enforced (the load-bearing safety
  rule).
- (h) returned Caller shape is correct on success.

There is no additional code path. A ninth case (success with the
correlationId reused from a present `x-request-id` header) is
covered by the `correlationId.length > 0` check in case (e) and is
exercised by withRequestContext.test.ts's existing reuse-x-request-id
test; not worth duplicating here.

---

## 3. Implementation steps (ordered, atomic)

**Commit shape decision: Option 1 (2 commits) ADOPTED.**

Rationale (matches F-01's two-commit pattern, surfaces all the right
review signals):

- **Commit 1** carries the entire feature surface — the helper, both
  typed errors, the barrel, and the KNOWN_ROLES move. One reviewable
  unit; the diff tells one story ("F-03's feature surface lands").
- **Commit 2** carries the test suite. The reviewer reads the
  feature, then reads the proof.
- Option 2 (3 commits — typed errors / KNOWN_ROLES move / feature
  separately) does not actually buy isolation: the typed errors are
  unused without `requireRole`, and the KNOWN_ROLES move is a
  refactor with zero behaviour change — neither stands alone as a
  meaningful incremental ship. Three commits adds review surface
  with no review value. **Stick with two.**

### Step list

1. **Cut the branch.** `git checkout -b f-03-require-role-helper`
   off `main` HEAD `c257101`. Confirm `git rev-parse main`
   returns `c2571016546b82d259415de06905b9ddf59afa12`.
2. **Confirm clean-tree baseline.**
   - `npm test` — unit suites must exit 0 (33+ suites — F-FND-02 +
     F-FND-03 + F-INFRA-01 + F-01 baseline).
   - `npm run test:integration` after `npm run db:up` — must exit 0
     (6 integration suites baseline).
   - If either fails, STOP and report — F-03 does not fix orthogonal
     rot.
3. **Create the four new source files** under `lib/`. Order:
   a. `lib/errors/UnauthorizedError.ts` (4 lines + doc header).
   b. `lib/errors/ForbiddenError.ts` (4 lines + doc header).
   c. `lib/auth/session.ts` (the helper — full skeleton from §2).
   d. `lib/auth/index.ts` (the barrel — 1 line + doc header).
4. **Modify the three existing source files.** Order:
   a. `lib/observability/Caller.ts` — insert the `KNOWN_ROLES` const
   - `isKnownRole` predicate after the `Role` union (line 32).
     b. `lib/observability/withRequestContext.ts` — delete the now-dup
     const + predicate (old lines 51-57). Update the import line
     to bring in `isKnownRole` from `./Caller`. **Verify `type Role`
     is still used in the file after the edit; if not, drop it from
     the import.**
     c. `lib/errors/index.ts` — add `UnauthorizedError` and
     `ForbiddenError` re-exports.
5. **Commit 1.** `git add` the 7 files (4 new + 3 modified). One
   commit:
   ```
   feat(auth): requireRole helper + UnauthorizedError + ForbiddenError + KNOWN_ROLES move (F-03)
   ```
   Body (HEREDOC): two-paragraph summary — paragraph 1 names the new
   helper + the two new error classes + the barrel + the KNOWN_ROLES
   move; paragraph 2 explicitly states "ships unused — zero route
   migrations, the 80+/104 existing role-check sites are untouched".
   Trailer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
6. **Verify commit 1 compiles and lints clean on the new files.**
   - `npx tsc --noEmit 2>&1 | grep -E "lib/auth/|lib/errors/UnauthorizedError|lib/errors/ForbiddenError|lib/observability/Caller\.ts|lib/observability/withRequestContext\.ts|lib/errors/index\.ts"` — expect empty.
   - `npm run lint 2>&1 | grep -E "lib/auth/|lib/errors/(Unauthorized|Forbidden)Error|lib/observability/(Caller|withRequestContext)\.ts|lib/errors/index\.ts"` — expect empty.
   - `npm test` — must exit 0. The existing
     `tests/unit/observability/withRequestContext.test.ts` suite is
     the critical regression gate here: the KNOWN_ROLES move must
     leave its 7 cases passing unchanged. The existing
     `tests/unit/observability/Caller.test.ts` suite also runs and
     passes (the new exports are additive — no test breakage).
   - **NO new test file yet** — the next commit adds it. This
     verifies the move is genuinely interface-preserving.
7. **Create the test file** `tests/unit/auth/session.test.ts` per
   the skeleton in §2. Cases a–h.
8. **Commit 2.** `git add` the one new file. One commit:
   ```
   test(unit): cover requireRole 8 cases (F-03)
   ```
   Body (HEREDOC): lists the 8 cases (a–h) and what each proves;
   notes the in-file `makeRequest` helper mirrors
   `tests/unit/observability/withRequestContext.test.ts:25-27`; notes
   no DB, no Supabase, no I/O. Trailer: same co-author line.
9. **Run the new test file in isolation.**
   `npm test -- session.test` (or
   `npx vitest run tests/unit/auth/session.test.ts`). Must exit 0
   with all 8 cases passing.
10. **Run the full unit suite.** `npm test` must exit 0 — the new
    suite runs alongside the existing 33+. The existing
    withRequestContext + Caller suites are the critical regression
    gates.
11. **Run the full integration suite.** `npm run test:integration`
    must exit 0 — no integration suite is added or modified, but
    the build graph compiles the new modules. (Local Supabase must
    be up: `npm run db:up` if not already.)
12. **Run lint + tsc on the touched files.**
    `npm run lint 2>&1 | grep -E "(lib/auth/|lib/errors/(Unauthorized|Forbidden)Error|lib/observability/(Caller|withRequestContext)\.ts|lib/errors/index\.ts|tests/unit/auth/)"` — expect empty.
    `npx tsc --noEmit 2>&1 | grep -E "(lib/auth/|lib/errors/(Unauthorized|Forbidden)Error|lib/observability/(Caller|withRequestContext)\.ts|lib/errors/index\.ts|tests/unit/auth/)"` — expect empty.
    Pre-existing rot elsewhere is calibrated baseline (F-TD-01).
13. **Run `npm run build`** as a smoke check. `next build` must exit 0. F-03 doesn't touch app code so this is fast; failure would
    indicate something orthogonal broke and should STOP the PR.
14. **Verify no package.json drift.**
    `git diff main package.json` — expect empty. If anything
    appears, STOP and revert.
15. **Verify no app/api drift.**
    `git diff main app/api/ middleware.ts` — expect empty. F-03 is
    additive; zero route migrations. If anything appears, STOP and
    revert.
16. **Push the branch.**
    `git push -u origin f-03-require-role-helper`.
17. **Open PR to `main`** via `gh pr create`.
    Title: `feat(auth): requireRole helper + UnauthorizedError + ForbiddenError (F-03)`.
    Body uses the standard HEREDOC pattern, summarises the two
    commits, pastes the ANVIL test-matrix results from steps 9–13,
    references ADRs 0002/0003/0004/0005 by file path, and states
    explicitly: _"Two commits — one feature (lib/auth/session.ts +
    UnauthorizedError + ForbiddenError + barrel + KNOWN_ROLES move),
    one test (8 cases for requireRole). No migrations. No new deps.
    No app-route changes. The 80+/104 existing role-check sites are
    untouched."_

### Verification commands the implementer should be able to copy-paste

```bash
git checkout -b f-03-require-role-helper
git rev-parse main                                                    # expect c257101...
npm test                                                              # baseline green
npm run db:up                                                         # local stack up
npm run test:integration                                              # baseline green

# After commit 1 (feature surface):
npx tsc --noEmit 2>&1 | grep -E "(lib/auth/|lib/errors/(Unauthorized|Forbidden)Error|lib/observability/(Caller|withRequestContext)\.ts|lib/errors/index\.ts)"  # expect empty
npm run lint 2>&1 | grep -E "(lib/auth/|lib/errors/(Unauthorized|Forbidden)Error|lib/observability/(Caller|withRequestContext)\.ts|lib/errors/index\.ts)"     # expect empty
npm test                                                              # expect 33+ suites green (Caller + withRequestContext regression-safe)

# After commit 2 (test file):
npx vitest run tests/unit/auth/session.test.ts                        # expect 8 cases passing
npm test                                                              # expect 34+ suites green
npm run test:integration                                              # expect 6 suites green (no integration touched)
npx tsc --noEmit 2>&1 | grep -E "(lib/auth/|lib/errors/(Unauthorized|Forbidden)Error|lib/observability/(Caller|withRequestContext)\.ts|lib/errors/index\.ts|tests/unit/auth/)"   # expect empty
npm run lint 2>&1 | grep -E "(lib/auth/|lib/errors/(Unauthorized|Forbidden)Error|lib/observability/(Caller|withRequestContext)\.ts|lib/errors/index\.ts|tests/unit/auth/)"      # expect empty
npm run build                                                         # exit 0
git diff main package.json                                            # expect empty
git diff main app/api/ middleware.ts                                  # expect empty

git push -u origin f-03-require-role-helper
gh pr create --title "feat(auth): requireRole helper + UnauthorizedError + ForbiddenError (F-03)" --body "..."
```

---

## 4. Test matrix (pre-ANVIL — what each layer will see)

Same calibrated-vs-strict discipline as F-FND-02/03 and F-01. ANVIL
Gate 3 will read this section verbatim.

| #   | Layer                  | Command                                                               | Pass criterion                                                                                                                                                                                                                                                                    | Calibrated / Strict              |
| --- | ---------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| 1   | Vitest unit (new)      | `npx vitest run tests/unit/auth/session.test.ts`                      | Exit 0. 8 cases passing.                                                                                                                                                                                                                                                          | Strict (this is the deliverable) |
| 2   | Vitest unit (baseline) | `npm test`                                                            | Exit 0. The KNOWN_ROLES move is interface-preserving — `tests/unit/observability/withRequestContext.test.ts` (7 cases) and `tests/unit/observability/Caller.test.ts` (6 cases) continue to pass without edits. All 33+ pre-existing suites green. New auth suite (8 cases) green. | Strict (baseline must hold)      |
| 3   | Vitest integration     | `npm run test:integration`                                            | Exit 0. No integration suite is added or modified, but the build graph compiles the new modules. Existing 6 suites continue to pass.                                                                                                                                              | Strict (baseline must hold)      |
| 4   | ESLint                 | `npm run lint`                                                        | **Calibrated.** Bar: zero NEW violations attributable to F-03 files. Verify via the grep above. Pre-existing nits elsewhere are F-TD-01.                                                                                                                                          | Calibrated                       |
| 5   | TypeScript check       | `npx tsc --noEmit`                                                    | **Calibrated.** Bar: zero NEW errors in F-03 files. Verify via the grep above. ~60 pre-existing errors are F-TD-01.                                                                                                                                                               | Calibrated                       |
| 6   | Next.js build          | `npm run build`                                                       | Exit 0. Sanity check — no app-route changes, definitionally green unless something orthogonal broke.                                                                                                                                                                              | Strict                           |
| 7   | Playwright E2E         | n/a — no UI surface, no new HTTP surface                              | **No E2E for F-03.** The helper ships unused; no route migrations means no HTTP behaviour changes. Existing Playwright suites need not be re-run as gating.                                                                                                                       | Skipped                          |
| 8   | Migration safety       | n/a — no migrations                                                   | **No migrations, no PITR check at Gate 4.** The standing Supabase migration-lock hook does not fire.                                                                                                                                                                              | Skipped                          |
| 9   | Drift checks           | `git diff main package.json` + `git diff main app/api/ middleware.ts` | Both empty. F-03 is purely additive in `lib/` + `tests/`; touches zero routes and zero deps.                                                                                                                                                                                      | Strict                           |

**Layer 7 note for ANVIL.** No E2E. The helper has no HTTP surface
until adopter PRs migrate routes. The next unit's E2E (whichever
domain adopts first) will gate the integration of `requireRole` with
a real route. F-03 stops at the unit boundary.

**Layer 8 note for ANVIL.** No DB migrations. F-03 does not modify
any schema; does not add a migration file; does not need a PITR
check.

**Why no integration test in F-03.** The helper is pure logic over
request headers. There is no DB, no Supabase, no live HTTP — three
things integration tests exist to exercise. Adding an integration
test that constructs a NextRequest and calls `requireRole` would
duplicate the unit suite without buying additional confidence. The
first integration test that exercises `requireRole` will be inside
the first adopter PR (a domain-level route migration), where the
helper is wired into a real route and a real fetch can be issued
against the local stack. F-03 is the contract; adopter PRs prove
the contract end-to-end. Same depth-over-ceremony argument F-01 made
for not adding a road-times unit test on top of the integration
test.

---

## 5. Risks and open questions

1. **`KNOWN_ROLES` / `isKnownRole` move — risk of breaking the
   existing `withRequestContext` suite.** The move is intended to be
   byte-for-byte equivalent: the const and the predicate move from
   one module to another with no semantic edit. **Mitigation:**
   step 6 runs `npm test` against the existing
   `tests/unit/observability/withRequestContext.test.ts` (7 cases)
   AND `tests/unit/observability/Caller.test.ts` (6 cases) AFTER
   commit 1 but BEFORE the new test file is added — this is the
   load-bearing regression gate. If either suite breaks, STOP and
   diagnose before adding the new tests. The widened
   `isKnownRole(v: string | null | undefined)` signature is a strict
   superset of the original `(v: string | null)` — the existing
   call site in `withRequestContext.ts:72`
   (`const role = isKnownRole(roleHdr) ? roleHdr : null` where
   `roleHdr` is `string | null`) still type-checks. **No behavioural
   change.**
2. **`correlationId` derivation: requireRole vs withRequestContext.**
   Two paths, weighed at Gate 1 and chosen here:
   - **(a) requireRole returns `correlationId: ''` and lets
     withRequestContext fill it later.** Rejected: produces an
     invalid Caller in any flow where withRequestContext has not
     wrapped the handler (legacy routes, adopter PRs that adopt
     `requireRole` before adopting `withRequestContext`). The
     Caller's `correlationId` is documented as a non-null string at
     `lib/observability/Caller.ts:37`; returning `''` would weaken
     that contract.
   - **(b) requireRole derives the correlationId with the same logic
     as withRequestContext.ts:59-63 — reuse `x-request-id` if
     present and 1..128 chars, else generate fresh hex.** **Chosen.**
     Rationale: identical logic in both helpers is fine because the
     logic is deterministic on the request — if `x-request-id` is
     present, both helpers read the same value, and the Caller
     constructed by requireRole equals (in correlationId) the Caller
     bound by withRequestContext. If `x-request-id` is absent,
     requireRole generates one fresh; if withRequestContext has
     already run, it has set the same header on `req` already — wait,
     no, withRequestContext sets the header on the **outgoing
     response**, not the incoming request, so an absent
     `x-request-id` on the inbound request means requireRole
     generates its own id that is independent of the one
     withRequestContext generates. **This is fine and intended.**
     The test does not assert correlationId equality across calls;
     it asserts the field is a non-empty string. The implementer's
     copy of the deriveCorrelationId logic is six lines (the same
     four-line block from withRequestContext.ts inlined). If a
     future PR extracts that to a shared helper
     (`lib/observability/correlation.ts`?), it can do so as a
     refactor — but doing it in F-03 would expand the scope of the
     observability changes the locked spec deliberately limited to
     the KNOWN_ROLES move. **Flagged for Gate 2: the conductor may
     prefer extracting `deriveCorrelationId` to a shared helper
     now. Recommend: NO; defer to the unit that first needs both
     helpers to agree on the id (which they already do when
     withRequestContext wraps the handler).**
3. **The 401-vs-403 split is opinionated.** RFC 7235 §3.1 says 401
   _MUST_ include a `WWW-Authenticate` header. F-03's
   `UnauthorizedError` returns JSON via `withErrors` with no
   `WWW-Authenticate` header. **Mitigation:** the existing 80+/104
   sites also return 401 without that header today
   (`app/api/orders/route.ts:39` is representative); F-03 does not
   regress strictness, it standardises the existing (slightly
   non-conformant) behaviour. If a future PR adds the
   `WWW-Authenticate` header (e.g. when the app gains a real auth
   challenge flow), it edits `UnauthorizedError.toJSON()` or
   `withErrors` to inject the header on 401 responses. Not in F-03's
   scope.
4. **`x-mfs-secondary-roles` header — first consumer outside
   middleware.ts.** F-03 is the first non-middleware code that
   reads this header. Risk: if middleware ever stops setting the
   header (e.g. for unauthenticated public paths — verified in
   middleware.ts:88-101: PUBLIC_PATHS bypass the header-set block
   at lines 141-145 entirely), `requireRole` reads `null`,
   `.split(',')` returns `['']`, the `filter(s => s.length > 0)`
   strips that, and the secondaries array is empty. **Verified
   safe by the test suite:** case (d) supplies
   `'x-mfs-secondary-roles': ''` and the secondaries-array
   intermediate value is empty; case (a) omits the header entirely
   and the same path is exercised. The two cases protect against the
   header-absent and header-empty edge cases respectively. **No
   action; documented for the reviewer.**
5. **Unit tests for `UnauthorizedError` and `ForbiddenError` individually — ADOPTED at Gate 2.** The locked spec originally specified only the 8 cases in `session.test.ts`. Gate 2 added two standalone test files (`tests/unit/errors/UnauthorizedError.test.ts` + `tests/unit/errors/ForbiddenError.test.ts`) for convention discipline — every existing error subclass (`NotFoundError`, `ConflictError`, `ValidationError`, `ServiceError`) has its own standalone test file (51-73 lines each), and breaking that pattern would set a bad precedent. The new files mirror `NotFoundError.test.ts` verbatim — `httpStatus`, `code`, `name`, `toJSON()` shape, prod-mode redaction inherited from `AppError`. Both files fold into commit 2 (no new commit added); commit 2's diff grows by ~100 lines. Risk mitigation: if a future PR independently modifies `UnauthorizedError` or `ForbiddenError` and breaks them in a way `session.test.ts` doesn't catch, the standalone tests catch it.
6. **Inline `makeRequest()` helper vs shared test util.** Both
   `tests/unit/observability/withRequestContext.test.ts:25-27` and
   the new `tests/unit/auth/session.test.ts` define the same 2-line
   helper. A future test (third caller) would justify extracting a
   shared `tests/helpers/makeRequest.ts`. F-03 does NOT do the
   extraction — APOSD §3 (depth over shallow modules); a 2-line
   helper duplicated across two test files is not the kind of
   complexity a shared module pays back. **Flagged for Gate 2:**
   if the conductor prefers the extraction now (defensive against
   a third copy landing in an adopter PR), the change is a 4th
   commit (a new file + two import edits) and adds ~12 lines net.
   **Recommend: no.**
7. **`AppError`'s constructor signature is preserved.** The new
   error subclasses pass `('Authentication required.')` /
   `('Role does not permit this action.')` as message strings. They
   do NOT pass `{ cause, context }` options — F-03 has no upstream
   cause to forward (the helper is the origin of the throw, not a
   wrapper around another throw). Adopter PRs MAY pass context (e.g.
   `new ForbiddenError('...', { context: { allowedRoles, observedRole: caller.role } })`)
   if they want to log structured details — supported by
   `AppError`'s constructor today. **No F-03 action; documented for
   the adopters' future use.**
8. **Naming: `UnauthorizedError` vs `UnauthenticatedError`.** The
   pedantically-correct HTTP semantic name for 401 is
   "Unauthenticated" — RFC 7235 calls 401 "Unauthorized" but the
   semantic meaning is "no credentials presented or invalid
   credentials", which is authentication, not authorisation. The
   locked spec calls it `UnauthorizedError`. **Decision:** stick with
   `UnauthorizedError` — matches the HTTP status name verbatim,
   aligns with `ForbiddenError`'s naming, and matches Sentry / DataDog
   / generic ecosystem convention. Confusion risk is low because the
   class doc comment is explicit ("Thrown when no valid identity is
   present"). **No action; locked spec is correct.**
9. **`Role` import in `withRequestContext.ts` after the move.** After
   the KNOWN_ROLES move, `withRequestContext.ts` no longer references
   `Role` directly inside the file body — `Role` is only used as the
   parameter type of `isKnownRole` (which now lives in `Caller.ts`).
   The implementer must verify whether `Role` can be dropped from the
   destructured import: `import { makeCaller, isKnownRole } from './Caller'`.
   If `tsc --noEmit` flags an unused import, drop it; if it doesn't
   (TypeScript allows unused destructured type imports), still drop
   it for tidiness. **Implementer to decide at step 4b.**
10. **`lib/observability/index.ts` barrel — re-export decision.**
    The barrel currently re-exports `{ Caller, Role, makeCaller }`
    from `./Caller`. After F-03's move, `Caller.ts` ALSO exports
    `KNOWN_ROLES` and `isKnownRole`. **Decision: do NOT widen the
    `lib/observability/index.ts` barrel.** F-03's session helper
    imports directly from `@/lib/observability/Caller` (not the
    barrel), so the barrel does not need the new symbols. Future
    callers can either import from the file directly or, if usage
    grows, the barrel widens then. **APOSD §3: keep public surface
    minimal until needed.** Flagged in recon #18 for completeness.

---

## 6. Rollback

Straightforward. F-03 squash-merges into `main` as a single commit
(matching #15–#19). To roll back:

```bash
git revert <merge-commit-sha>
git push origin main
```

**No data implications.** F-03 makes no schema changes, no data
migrations, no row inserts/updates/deletes. The unit tests don't
touch any DB. A revert reinstates the previous state byte-for-byte:
`KNOWN_ROLES`/`isKnownRole` move back to
`withRequestContext.ts`, the four new files vanish, the two new
barrel lines vanish. No customer-facing impact.

**If the revert needs to happen mid-day** (e.g. an adopter PR lands
fast and discovers a subtle defect in the helper): the revert is a
30-second operation and brings every file back to its pre-PR state.
If an adopter PR has already imported `requireRole`, that PR's
imports break — but the locked spec requires F-03 to ship unused, so
no `main`-level breakage is possible from the revert alone.

---

## 7. Definition of done

The implementer can tick this list off before the PR is considered
Gate 3 / Gate 4 ready:

- [ ] Branch `f-03-require-role-helper` cut from `main` HEAD `c257101`.
- [ ] **Commit 1**:
      `feat(auth): requireRole helper + UnauthorizedError + ForbiddenError + KNOWN_ROLES move (F-03)`
      with co-author trailer. Includes:
  - [ ] `lib/auth/session.ts` (new)
  - [ ] `lib/auth/index.ts` (new — single re-export of `requireRole`)
  - [ ] `lib/errors/UnauthorizedError.ts` (new — 4-line class + doc)
  - [ ] `lib/errors/ForbiddenError.ts` (new — 4-line class + doc)
  - [ ] `lib/errors/index.ts` (modified — +2 re-export lines)
  - [ ] `lib/observability/Caller.ts` (modified — +`KNOWN_ROLES` const + `isKnownRole` predicate)
  - [ ] `lib/observability/withRequestContext.ts` (modified — -7 lines, +1 import token; `Role` import dropped if unused)
- [ ] **Commit 2**:
      `test(unit): cover requireRole 8 cases + UnauthorizedError + ForbiddenError (F-03)`
      with co-author trailer. Includes:
  - [ ] `tests/unit/auth/session.test.ts` (new — 8 cases a–h)
  - [ ] `tests/unit/errors/UnauthorizedError.test.ts` (new — Gate 2 ADOPTED; mirrors `NotFoundError.test.ts` shape)
  - [ ] `tests/unit/errors/ForbiddenError.test.ts` (new — Gate 2 ADOPTED; mirrors `NotFoundError.test.ts` shape)
- [ ] `npx vitest run tests/unit/auth/session.test.ts` passes (8 cases).
- [ ] `npx vitest run tests/unit/errors/UnauthorizedError.test.ts tests/unit/errors/ForbiddenError.test.ts` passes (both new error suites).
- [ ] `npm test` exits 0 (existing suites + new suite).
- [ ] `npm run test:integration` exits 0 (6 baseline suites green; no integration suite added).
- [ ] `npm run lint 2>&1 | grep -E "(lib/auth/|lib/errors/(Unauthorized|Forbidden)Error|lib/observability/(Caller|withRequestContext)\.ts|lib/errors/index\.ts|tests/unit/auth/)"` returns empty.
- [ ] `npx tsc --noEmit 2>&1 | grep -E "(lib/auth/|lib/errors/(Unauthorized|Forbidden)Error|lib/observability/(Caller|withRequestContext)\.ts|lib/errors/index\.ts|tests/unit/auth/)"` returns empty.
- [ ] `npm run build` exits 0.
- [ ] `git diff main package.json` is empty (no new deps).
- [ ] `git diff main app/api/ middleware.ts` is empty (no route or middleware edits).
- [ ] `git diff main supabase/` is empty (no migration).
- [ ] PR opened to `main` with title `feat(auth): requireRole helper + UnauthorizedError + ForbiddenError (F-03)`.
- [ ] PR body cites the locked Gate 1 spec, ADRs 0002/0003/0004/0005 by file path, and the F-FND-02 / F-FND-03 surfaces F-03 leans on.
- [ ] PR body explicitly states: no migrations, no new deps, no route migrations, the 80+/104 existing role-check sites are untouched.
- [ ] ANVIL Gate 3 results pasted into PR body (the test matrix table from §4 with actual command output).

---

## 8. Out of scope (DO NOT touch in this PR)

- **Route migrations.** Zero of the 80+/104 existing role-check
  sites change. Specifically NOT touched:
  - `app/api/orders/route.ts` (and the 11 sibling
    `app/api/orders/**/route.ts` files).
  - `app/api/auth/**/route.ts` — login / logout / haccp-team /
    kds-pin / etc.
  - `app/api/admin/**/route.ts`, `app/api/dashboard/**/route.ts`,
    `app/api/map/**/route.ts`.
  - `app/api/haccp/**/route.ts`.
  - `app/api/routes/**/route.ts`, `app/api/cash/**/route.ts`,
    `app/api/pricing/**/route.ts`, etc.
  - **Verify in DoD:** `git diff main app/api/` returns empty.
- **`middleware.ts`** — no edit. The session-cookie parsing, the
  PUBLIC_PATHS list, the ROLE_PERMISSIONS map, the header-set
  block, the role-permissions check at lines 152-154 all remain
  as they are.
- **`AuthPort` interface or any port extraction.** F-13 (Users
  domain) owns this. F-03 is procedural, not port.
- **Editing `Caller`'s 3-field shape.** No new field on the
  returned `Caller`. Secondary roles are used internally for the
  permission check ONLY (Gate 1 Q5 decision).
- **Editing `lib/errors/withErrors.ts`.** Typed errors flow through
  the existing handler at `withErrors.ts:53-58` automatically. No
  edit needed.
- **Editing `lib/observability/index.ts`.** The new
  `KNOWN_ROLES` and `isKnownRole` symbols are exported from
  `Caller.ts` directly; the observability barrel is NOT widened.
  Direct-from-`Caller.ts` imports are used by both `requireRole`
  and the modified `withRequestContext.ts`. See recon #18 + risk
  #10.
- **The F-01 narrowed surface** — `lib/road-times.ts`,
  `app/api/routes/optimise/route.ts`,
  `app/api/routes/compute-road-times/route.ts`. None touched.
- **The 13 raw-fetch sites in ADR-0005's Per-Site Map.** Verify in
  DoD: `git diff main app/api/screen2 app/api/detail app/api/admin/geocode-all app/api/map lib/complaint-email.ts lib/compliment-email.ts lib/pricing-email.ts` returns empty.
- **`lib/supabase.ts`.** No edit. The "Centralised here" comment
  remains a lie until Phase 5 / F-27.
- **Migrating any `console.*` calls.** F-03 emits no logs of its
  own. The helper throws typed errors; `withErrors` logs unknown
  errors via the structured logger (already on main per F-FND-03);
  there is nothing F-03 itself needs to log. **No `log.warn` / `log.info`
  / `log.error` calls in F-03 code.**
- **The widening of the `isKnownRole` signature to
  `string | null | undefined`** has been pre-emptively justified in
  §2 — but if the conductor or Gate 2 prefers the original
  `string | null` signature, the change is a one-token revert. The
  default plan keeps the wider signature because two of the eight
  test cases (a, b) pass `undefined`-valued lookups indirectly
  (`req.headers.get(...)` returns `string | null` only — never
  `undefined`), so the widening is defensive rather than
  load-bearing. Either signature works. **Flagged for Gate 2.**
- **F-04** — ESLint guard activating the FREEZE rule. Separate
  Phase 0 unit; F-04 lint-guards SDK leaks, NOT role checks.
- **F-RLS-01** — RLS audit (parallel docs-only track).
- **F-TD-01** — pre-existing ~60 `tsc` errors + ESLint nits.
- **F-13** — Users domain + AuthPort extraction. The future home of
  the canonical `Role` union (`lib/domain/Role.ts`) per
  `lib/observability/Caller.ts:9-16`. F-03 leaves the Caller.ts
  header doc comment unedited; that comment continues to describe
  the F-13 forward path verbatim. The KNOWN_ROLES move only
  consolidates the runtime filter into the same module as the
  union; it does not pre-empt F-13's port-extraction work.
- **CI / GitHub Actions.** Still no CI configured project-wide.
  ANVIL runs locally for this PR per the same discipline as
  F-FND-01/02/03 + F-INFRA-01 + F-01.
- **Bumping `tsconfig.json` `target`** to ES2022. Out of scope; the
  ES2017 caveat documented in `lib/errors/AppError.ts:29-34` and
  F-FND-02's plan still applies and is acceptable for F-03.

---

## 9. ADR / docs implications

**No new ADR required.** Gate 1 explicitly confirmed F-03 conforms to
ADRs 0002/0003/0004/0005 without new architectural decisions. The
KNOWN_ROLES move is an interface-preserving refactor inside an
already-decided architecture, not a new direction.

**No CLAUDE.md edit.** F-03 introduces no new developer workflow that
CLAUDE.md should mention. The Lego principle (CLAUDE.md lines 3-24)
and the local-test-infrastructure section (lines 27-37) both remain
accurate.

**No runbook edit.** `docs/runbooks/local-dev.md` (F-INFRA-01)
already covers the daily workflow the implementer needs. No new
local commands.

**Future ADR notes (NOT for F-03).** Two future ADRs are foreshadowed
by F-03's existence but explicitly NOT written here:

- **F-13 ADR — "AuthPort interface + adapter for session resolution"**
  will own the port-extraction. At that point, `lib/auth/session.ts`
  may become a thin shim over `AuthPort` or may be absorbed into the
  port adapter, depending on how F-13 designs the boundary. F-03's
  helper is intentionally a procedural seam, not a port.
- **Phase 5 / F-27 ADR — "Centralised Supabase client is now truly
  centralised; FREEZE rule activated"** will land when the last
  raw-fetch site has been migrated. F-03 is not part of that
  sequence.

Both are recorded in `docs/architecture-review-2026-06-06.md` and do
not need duplication here.
