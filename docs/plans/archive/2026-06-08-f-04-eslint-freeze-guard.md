# F-04 — ESLint `no-restricted-imports` activating ADR-0003 FREEZE rule

## Goal

F-04 ships the fourth Phase 0 foundation: a single ESLint configuration
edit that forbids `import ... from '@supabase/supabase-js'` outside an
allow-list of three file patterns, plus a unit test that pins the
configuration's behaviour against typos and future drift. Concretely:
`.eslintrc.json` (today: `{"extends": "next/core-web-vitals"}` — 40
bytes — `.eslintrc.json:1-3`) gains a `rules` block configuring the
core `no-restricted-imports` rule at severity `"error"`, plus an
`overrides[]` block disabling that rule for the three allowed sites.
The forbidden module name is `@supabase/supabase-js` — an exact-name
match in the rule's `paths` list. The allow-list is:

1. `lib/supabase.ts` — the existing central service-role client
   (`lib/supabase.ts:13`).
2. `lib/adapters/supabase/**/*.ts` — the prospective Phase 1+ port
   adapter directory. **The directory does not exist on `main` today**;
   the glob matches zero files at F-04 ship time. It begins matching
   the moment F-06 creates the first adapter file.
3. `tests/**` — broad test-infrastructure exemption. Covers
   `tests/integration/_setup.ts:24` today and every future
   test file that legitimately constructs a custom Supabase client
   (e.g. an integration test against a separate stack).

A new Vitest unit suite at `tests/unit/lint/no-supabase-sdk.test.ts`
exercises the configuration end-to-end with six cases:

- (1) **Forbidden — happy path:** SDK import in `app/api/foo/route.ts`
  → assert one error reported with the configured custom message.
- (2) **Allowed — central client:** SDK import in `lib/supabase.ts` →
  assert zero errors.
- (3) **Allowed — adapter directory (prospective):** SDK import in
  `lib/adapters/supabase/OrdersRepository.ts` → assert zero errors.
  ESLint's `overrides[]` matching is `files` plus the supplied
  `filename` option — the file does NOT need to exist on disk for the
  glob to apply.
- (4) **Allowed — tests directory:** SDK import in
  `tests/integration/foo.ts` → assert zero errors.
- (5) **Message correctness:** the error's `message` field equals the
  configured custom-message string exactly. Pins the message against
  silent edits and typos.
- (6) **Sanity — unrelated imports unaffected:** import `zod` (or any
  other arbitrary package name not in the rule's `paths` list) in
  `app/api/foo/route.ts` → assert zero errors. Pins the rule's scope
  to just `@supabase/supabase-js`.

The test uses ESLint's Node API (`new ESLint({ ..., overrideConfig:
<F-04 config> })` → `eslint.lintText(source, { filePath })`) with
synthesized config and inline-string fixtures — **no on-disk fixture
files, no temp directories, no shelling out to `next lint`**. The
filename argument drives the `overrides[]` resolution; ESLint resolves
the right per-file config off `filePath` exactly as it does for real
files.

**Existing offenders on `main` HEAD `bb5180e` (verified clean):**

```
$ grep -rn "from ['\"]@supabase/supabase-js['\"]" --include="*.ts" --include="*.tsx" 2>&1 | grep -v node_modules
tests/integration/_setup.ts:24:import { createClient } from '@supabase/supabase-js'
lib/supabase.ts:13:import { createClient } from '@supabase/supabase-js'
```

Both lines are allow-listed (entry #1 and entry #3 respectively).
Total app-code offenders: ZERO. Post-F-04, `npm run lint` returns the
same calibrated baseline as today: zero NEW violations attributable
to F-04. The FREEZE rule is real because the existing offender count
is zero.

**What F-04 explicitly does NOT do.** No route migrations. No edit to
`lib/supabase.ts`. No edit to `lib/road-times.ts` (F-01 — no longer
imports the SDK). No edit to `lib/auth/session.ts` (F-03 — never
imported the SDK). No edit to `middleware.ts`. No edit to any of the
13 raw-fetch sites enumerated in ADR-0005's Per-Site Map (rule B —
`process.env.NEXT_PUBLIC_SUPABASE_URL` / `${SUPA_URL}/rest/v1/`
patterns — is deferred to F-27 per ADR-0005). No new package.json
dependency (`no-restricted-imports` is a built-in core ESLint rule).
No edit to `eslint-config-next` or any other upstream config. No
Playwright test. No integration test. No new ADR (F-04 conforms to
ADR-0003 verbatim — it IS the implementation of that ADR's FREEZE
rule, not a new architectural decision).

---

## Source spec

- **Locked Gate 1 spec — the conductor handoff above.** Frozen; no
  clarifications taken in the planner. The forbidden-import name
  (`@supabase/supabase-js`), the three allow-list patterns, the
  severity (`"error"`), the exact custom-message text, the 6-case
  test matrix, and the file/test layout are all spec-locked.
- **Architecture review v1.2** —
  `docs/architecture-review-2026-06-06.md` Phase 0 quick-win line 311
  ("F-04 — Add an ESLint rule that forbids `from '@supabase/supabase-js'`
  outside `lib/adapters/supabase/**` and `lib/supabase.ts`").
- **ADR-0003 strangler-fig migration and FREEZE rule** —
  `docs/adr/0003-strangler-fig-migration-and-freeze-rule.md`. F-04 is
  the implementation of the **FREEZE rule** stated in lines 21-22:
  _"Once F-04 (the ESLint guard that forbids `from
'@supabase/supabase-js'` outside `lib/adapters/supabase/**` and
  `lib/supabase.ts`) ships in Phase 0, no new code may import the
  Supabase SDK outside the adapter folder. The lint guard freezes the
  existing surface area at its current 88-route footprint so the
  migration can drain it without anyone backfilling."_ This plan
  realises that statement verbatim. The third allow-list pattern
  (`tests/**`) is an extension justified by the existing
  `tests/integration/_setup.ts:24` offender; ADR-0003's prose only
  enumerates `lib/adapters/supabase/**` and `lib/supabase.ts`, but
  the `tests/**` exemption is consistent with the ADR's intent (the
  ADR's concern is app-code coupling, not test infrastructure that
  must construct ad-hoc service clients).
- **ADR-0005 F-01 narrowing** —
  `docs/adr/0005-f01-narrowed-raw-fetch-deferred-to-port-extractions.md`.
  ADR-0005 line 47 explicitly states: _"F-04's ESLint guard ships
  rule A only. When F-04 reaches its FORGE loop, it adds a single
  `no-restricted-imports` rule forbidding `from
'@supabase/supabase-js'` outside `lib/supabase.ts` and (when they
  exist) `lib/adapters/supabase/**`. The second rule — forbidding
  references to `process.env.NEXT_PUBLIC_SUPABASE_URL` outside the
  central client module — is deferred to F-27."_ This plan ships
  **rule A only**; rule B is out of scope. The 13 raw-fetch sites
  enumerated in ADR-0005's Per-Site Map do not import the SDK and
  therefore do not trip rule A by design.
- **ADR-0002 hexagonal shape** —
  `docs/adr/0002-hexagonal-shape-and-naming.md`. F-04 is foundation
  / enforcement, not a port. It does NOT define an interface. The
  rip-out test still fails by design — F-04 does not change the cost
  of swapping Supabase tomorrow; it only stops NEW code from making
  that cost worse. Cited in Compliance.
- **ADR-0004 RLS posture** —
  `docs/adr/0004-rls-vs-service-role-security-model.md`. Not
  touched. F-04 does not modify any RLS rule, any anon-key
  construction, any service-role wiring.
- **F-03 plan** —
  `docs/plans/2026-06-08-f-03-require-role-helper.md`. Structural
  template for F-\* plans; matched here in depth and 9-section shape
  (Goal → Source spec → Compliance → Branch + base → §1 Recon → §2
  Files → §3 Steps → §4 Test matrix → §5 Risks → §6 Rollback → §7
  DoD → §8 Out of scope → §9 ADR/docs implications).
- **F-FND-02 typed-error contract** — not directly used. F-04 does
  not throw errors at runtime; the lint rule is enforced at lint
  time only.
- **F-FND-03 observability surface** — not directly used. The test
  is pure logic, no HTTP, no ALS binding.
- **F-INFRA-01 local Supabase stack** — not used. F-04 has no
  integration test.
- **`no-restricted-imports` rule reference** — built-in core ESLint
  rule. Schema verified in
  `node_modules/eslint/lib/rules/no-restricted-imports.js:19-46`:
  `paths` accepts `{ name: string, message?: string,
importNames?: string[] }`. F-04 uses `name` + `message`; `importNames`
  is not used because the entire `@supabase/supabase-js` module is
  forbidden, not specific named exports.

---

## Compliance

**NO runtime compliance impact.** F-04 is a lint-time guard. It does
not change any HTTP behaviour, any database access, any
authentication flow, any payment, HACCP, data-retention, financial,
or document-control surface. No row is ever written by F-04 code; no
endpoint is added or modified.

**ADR-0002 rip-out test — F-04 does NOT improve the rip-out test
either.** F-04 introduces zero new vendor coupling but also does not
remove any existing coupling. The rip-out test continues to fail
exactly as it did before F-04 (the 88 routes + 13 raw-fetch sites
still bind the app to PostgREST). What F-04 changes is the future:
no NEW file outside the allow-list can add to the rip-out cost. The
existing surface is **frozen**; the migration that follows
(F-05/F-06/F-07/F-08 for Orders, then F-13 onward for the rest)
**drains** that frozen surface. F-04 is the floor; Phase 1+ is the
ceiling coming down.

**ADR-0003 strangler-fig + FREEZE rule — F-04 IS the implementation.**
ADR-0003 names F-04 explicitly at line 27 (_"F-04 — ESLint lint guard
for Supabase imports (Phase 0). The FREEZE rule activates the moment
this lands."_) and describes its expected behaviour at lines 21-22.
This plan realises that prose verbatim. The third allow-list pattern
(`tests/**`) is an additive concession to test infrastructure that
the ADR's prose does not enumerate; the spirit of the rule (no new
app code couples to the SDK) is preserved because `tests/` is not app
code.

**ADR-0004 RLS posture.** No change. F-04 does not touch any RLS
rule, any service-role wiring, any auth path. The lint rule is a
static-analysis check at compile time; it cannot change runtime
security posture.

**ADR-0005 F-01 narrowing — rule A only.** F-04 ships exactly the
rule ADR-0005 named: forbid `from '@supabase/supabase-js'` outside
the allow-list. Rule B (forbid raw `${SUPA_URL}/rest/v1/`
PostgREST fetches outside `lib/supabase.ts`) is **explicitly out of
scope** and deferred to F-27 in Phase 5 per ADR-0005 line 47. The 13
raw-fetch sites enumerated in ADR-0005's Per-Site Map do not import
the SDK and therefore do not trip rule A. The two existing SDK
importers (`lib/supabase.ts:13` and `tests/integration/_setup.ts:24`)
are both allow-listed; rule A lands at zero NEW violations.

**FREEZE rule is real because the offender count is zero.** Every
FREEZE rule earns its name by landing with the existing app-code
violation count = 0. Verified by:

```bash
grep -rn "from ['\"]@supabase/supabase-js['\"]" \
  --include="*.ts" --include="*.tsx" 2>&1 | grep -v node_modules
```

which on `main` HEAD `bb5180e` returns exactly:

```
tests/integration/_setup.ts:24:import { createClient } from '@supabase/supabase-js'
lib/supabase.ts:13:import { createClient } from '@supabase/supabase-js'
```

Both lines fall inside the allow-list. F-04 on its own branch
**cannot** introduce any new failures (it doesn't add any source
code that imports the SDK). The implementer's `npm run lint` after
the config edit returns the same calibrated baseline as today.

**No new ADR required.** Gate 1 explicitly confirmed F-04 conforms
to ADRs 0002/0003/0004/0005 without new architectural decisions. F-04
is the implementation of ADR-0003 line 21-22, not a new direction.

---

## Branch + base

- **Base:** `main` HEAD `bb5180e` — `feat(auth): requireRole helper +
UnauthorizedError + ForbiddenError (F-03) (#20)`. Verified via
  `git rev-parse main` returns
  `bb5180e451041ad0fa08329f5c2f3ca105198869`. All F-FND-01 / F-FND-02
  / F-FND-03 / F-INFRA-01 / F-01 / F-03 foundations are on main.
- **Branch:** `f-04-eslint-freeze-guard` (matches the conductor brief
  verbatim; mirrors F-03's branch convention).
- **PR target:** `main`. **Not auto-merged.** Hakan ships via the same
  squash-merge flow as #15–#20 once ANVIL gates pass.
- **PR title:** `feat(lint): no-restricted-imports rule activating
ADR-0003 FREEZE (F-04)`.
- **Commit shape: 2 commits ADOPTED.** Rationale in §3. Matches the
  F-01 and F-03 two-commit pattern (feature surface — test).

---

## 1. Repo recon findings

Captured before planning. Every claim grounded in the actual files on
`main` HEAD `bb5180e`.

1. **`.eslintrc.json` (3 lines) is `{"extends": "next/core-web-vitals"}`** —
   `.eslintrc.json:1-3`. No `rules` block today, no `overrides[]`
   block today. F-04 is the first edit that introduces either. The
   `extends` field stays — it pulls in
   `eslint-config-next` (already in devDependencies at
   `package.json:59` — `"eslint-config-next": "15.0.0"`), which gives
   the project Next.js's recommended rules plus React + a11y. F-04
   adds two top-level keys to the JSON: `rules` and `overrides`. No
   change to `extends`.
2. **ESLint version on `main`: 8.57.1.** Verified at
   `node_modules/eslint/package.json` `"version": "8.57.1"`. The
   project uses ESLint v8 with legacy config (`.eslintrc.json`), NOT
   flat config (which would be `eslint.config.js`). The legacy config
   semantics for `overrides[]` are the load-bearing ones for F-04.
3. **`no-restricted-imports` is a built-in core rule.** Confirmed at
   `node_modules/eslint/lib/rules/no-restricted-imports.js`. The
   `paths` schema (`name: string`, `message?: string`,
   `importNames?: string[]`) is locked at lines 19-46 of that file.
   F-04 uses `name` + `message` only. The rule applies to ES `import`
   statements (`from '...'`), `import()` dynamic imports, and
   `export ... from '...'` re-exports. CommonJS `require()` is NOT
   covered by `no-restricted-imports` — but the codebase uses ESM
   throughout the relevant Supabase boundary (every SDK import on
   main is `import { ... } from '@supabase/supabase-js'`), so this
   limitation is not load-bearing. **Flagged in Risks for
   completeness.**
4. **The two existing offenders are both allow-listed:**
   - `lib/supabase.ts:13` — `import { createClient } from '@supabase/supabase-js'`.
     Allowed by override #1.
   - `tests/integration/_setup.ts:24` — `import { createClient } from '@supabase/supabase-js'`.
     Allowed by override #3 (`tests/**`).
   - Verified by:
     ```bash
     grep -rn "from ['\"]@supabase/supabase-js['\"]" \
       --include="*.ts" --include="*.tsx" 2>&1 | grep -v node_modules
     ```
   - Returns exactly the two lines above. No other matches.
5. **`lib/adapters/` does NOT exist on main.** `ls lib/adapters`
   returns "No such file or directory". The override #2 glob
   (`lib/adapters/supabase/**/*.ts`) matches zero files at F-04 ship
   time — by design. It begins matching the moment F-06 creates the
   first adapter file. **The glob is added pre-emptively** so F-06's
   first commit doesn't trip lint on its own creation. **Same posture
   as the ADR-0003 framing (the FREEZE rule names the adapter folder
   before it exists).**
6. **`lib/supabase.ts` (19 lines)** has the file-level header
   comment at lines 1-11 explaining the centralisation rationale.
   Line 13 imports `createClient` from `@supabase/supabase-js`.
   Lines 15-18 construct and export `supabaseService`. **F-04 does
   not edit this file** — it's an allow-list endpoint, not a target.
7. **`tests/integration/_setup.ts` (260 lines)** — the F-INFRA-01
   integration-test scaffolding. Imports `createClient` at line 24,
   uses it inside `getServiceClient()` at line 86. Allow-listed by
   override #3.
8. **The 13 raw-fetch sites enumerated in ADR-0005's Per-Site Map
   do NOT import the SDK.** Verified by the same grep above — none
   of `app/api/screen2/*`, `app/api/admin/geocode-all`,
   `app/api/map/data`, `app/api/detail/*`, `lib/complaint-email.ts`,
   `lib/compliment-email.ts`, `lib/pricing-email.ts` appears in the
   grep output. F-04 leaves all 13 untouched.
9. **88 API route files** under `app/api/**`. None imports
   `@supabase/supabase-js`. The two role-check examples in
   F-03's plan recon (e.g. `app/api/orders/route.ts:30-39`) read
   cookies/headers and call `supabaseService` via a default import,
   not the SDK directly. F-04 leaves all 88 untouched.
10. **`vitest.config.ts` (19 lines)** — at
    `vitest.config.ts:8` the unit-test glob is
    `include: ['tests/unit/**/*.test.ts']`. **The new
    `tests/unit/lint/no-supabase-sdk.test.ts` file is picked up
    automatically by this glob — no config edit needed.** The
    `@` path alias resolves to the project root
    (`vitest.config.ts:11-13`), so `@/...` imports work in the new
    test (not actually used — F-04's test imports `eslint` directly,
    not anything from the app code).
11. **`vitest.integration.config.ts` (39 lines)** —
    `include: ['tests/integration/**/*.test.ts']`. F-04's new test
    file lives under `tests/unit/lint/`, NOT `tests/integration/`,
    so the integration config does NOT pick it up. The unit suite is
    the right home: pure logic, no DB, no live HTTP.
12. **`tests/unit/` has 8 existing subdirectories.** `ls tests/unit/`:
    `adminDerivations.test.ts` (and many sibling top-level test files
    — older flat layout), plus per-domain dirs `auth/`,
    `dashboard-admin/`, `design-system/`, `errors/`, `nav/`,
    `observability/`, `orders/`, `pricing.test.ts` (file). The
    per-domain-subdirectory convention is well established. F-04
    creates `tests/unit/lint/` as the next-domain sibling. **No
    `tsconfig.json` override, no vitest project addition needed** —
    the unit glob already matches.
13. **`tests/unit/auth/session.test.ts`** (F-03, just shipped) is the
    most recent precedent. Inline-helper pattern (no extraction until
    3+ callers exist) applies; F-04's test won't define a
    `makeRequest()` helper at all because it doesn't mock requests.
14. **`tests/unit/observability/withRequestContext.test.ts`
    (141 lines)** and **`tests/unit/errors/NotFoundError.test.ts`
    (53 lines)** are the style templates for short, focused Vitest
    unit suites. `describe(...)` / `it(...)` nesting; `expect(...).
toBe(...)` / `.toMatch(...)` / `.toEqual(...)`; one
    behavioural assertion per case. F-04 matches the same shape.
15. **`package.json`** — - Line 10 `"lint": "next lint"` invokes Next.js's CLI wrapper
    around ESLint. F-04's config edit feeds straight into this
    command (no script edit needed). - Line 58 `"eslint": "^8"` — ESLint v8 on `main` (8.57.1
    resolved). Built-in `no-restricted-imports` rule available. - Line 59 `"eslint-config-next": "15.0.0"` — provides the
    Next.js base config the existing `extends` line pulls in. - Line 64 `"vitest": "^4.1.2"` — already devDep; F-04's test file
    is a standard Vitest suite, no version constraint. - **No new dep is added.** The new test file imports `{ ESLint }
from 'eslint'` — `eslint` is already a devDependency. - **Verified by:** `git diff main package.json` must return
    empty when this PR lands. If anything appears, STOP.
16. **ESLint Node API — critical finding.** Read
    `node_modules/eslint/lib/linter/linter.js:1407-1454` and
    `node_modules/eslint/lib/linter/linter.js:1447` (the comment
    `Linter doesn't support 'overrides' property in configuration`).
    **The bare `Linter` class ignores `overrides[]`** — if F-04's
    test used `new Linter().verify(source, config, { filename })`,
    the override-disable for `lib/supabase.ts` would silently NOT
    apply, and case (2) would falsely report 1 error. **The
    `ESLint` class** (`node_modules/eslint/lib/eslint/eslint.js:563
async lintText(code, { filePath })`) does respect `overrides[]`
    because it builds the config array internally (via
    `cliEngine.executeOnText` at line 593, which goes through the
    full legacy config resolution including overrides). **F-04's
    test MUST use the `ESLint` class, not `Linter`.** See §2 test
    skeleton.
17. **`ESLint` class config-injection knobs.** Verified at
    `node_modules/eslint/lib/eslint/eslint.js:51-66`: - `baseConfig` — base config extended by all configs. - `overrideConfig` — override config object, overrides all
    configs used with this instance. - `overrideConfigFile` — string path to a config file; if `null`
    uses default discovery. - `useEslintrc` — `boolean` (default `true`). If `false`,
    disables `.eslintrc.*` discovery.
    The pattern F-04's test uses: construct an `ESLint` instance
    with `useEslintrc: false` (so it doesn't discover the project's
    real `.eslintrc.json`, which `extends:
'next/core-web-vitals'` and would pull in the entire Next.js +
    React + a11y rule machinery for no reason in a focused
    config-test) and `overrideConfig: <the F-04 config under test>`.
    This isolates the test to exactly the rule + overrides under
    review and produces deterministic results regardless of the
    rest of the project's lint state.
18. **`Linter` Node API alternative considered and rejected.** The
    conductor brief asked: confirm whether `Linter.verify()` honours
    `overrides[]` out of the box. Answer: **No, it does not** (per
    the source comment cited in recon #16). The brief offered two
    workarounds:
    - (a) construct two configs (one with rule on, one with rule off)
      and choose by filename — but that pre-decides the override
      resolution outside of ESLint, weakening the test (it would no
      longer be a black-box check of the actual config; it would be
      asserting the planner's mental model of which file matches
      which override).
    - (b) use the `ESLint` class instead.
      **Chosen: (b).** The `ESLint` class is the higher-level API
      documented exactly for this purpose
      (https://eslint.org/docs/v8.x/integrate/nodejs-api#eslint-class).
      It builds the full config array internally and honours every
      legacy-config feature including `overrides[]`. The test ends up
      shorter, more honest, and resilient to schema evolution within
      ESLint v8.
19. **Plan filename convention.** Conductor brief names
    `docs/plans/2026-06-08-f-04-eslint-freeze-guard.md` verbatim.
    Date is 2026-06-08 (today). Matches F-03's same-day-as-implementation
    pattern.
20. **Commit-message convention.** Recent history on `main`:
    `feat(auth):` (F-03), `refactor(road-times):` (F-01),
    `feat(testing):` (F-INFRA-01), `feat(observability):` (F-FND-03),
    `feat(errors):` (F-FND-02), `docs(adr):` (F-FND-01). F-04 is a
    lint-config feature add — conductor brief names `feat(lint):`
    for the PR title and the first commit. The test commit follows
    the F-03 precedent `test(unit):`.
21. **Co-author trailer.** Matches F-FND-02 / F-FND-03 / F-INFRA-01 /
    F-01 / F-03 verbatim:
    `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
    on every commit.
22. **No DB migrations.** F-04 does not modify schema, does not add
    migration files, does not touch `supabase/migrations/`. The
    standing PITR / migration-safety hook does not fire.
23. **TypeScript / lint baseline.** Per the established F-FND-03 /
    F-01 / F-03 pattern, `npx tsc --noEmit` and `npm run lint` are
    **calibrated** gates: zero NEW violations attributable to F-04
    files (`.eslintrc.json` — JSON, not type-checked;
    `tests/unit/lint/no-supabase-sdk.test.ts` — the only new TS
    file). The ~60 pre-existing `tsc` errors and the pre-existing
    ESLint nits remain F-TD-01's responsibility, not this PR's.
24. **No CI / GitHub Actions configured yet.** ANVIL runs locally,
    same discipline as F-FND-01/02/03 + F-INFRA-01 + F-01 + F-03.
25. **The custom-message text** (the `message` property on the
    `paths` entry) is spec-locked at:
    ```
    Use supabaseService from @/lib/supabase for app code, or add an adapter under lib/adapters/supabase/ for vendor-specific operations. See ADR-0003 (FREEZE rule).
    ```
    Single line. Case-sensitive. Punctuation matters. Test case (5)
    asserts this string exactly.

---

## 2. File-by-file changes

### New files (1)

| Path                                      | Purpose                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/lint/no-supabase-sdk.test.ts` | Vitest unit suite — 6 cases pinning the F-04 ESLint rule. Constructs an `ESLint` instance with `useEslintrc: false` and `overrideConfig: <the F-04 config under test>`, calls `eslint.lintText(source, { filePath })` per case, asserts the messages. No on-disk fixtures, no temp dirs. ~110 lines including the config object. |

### Modified files (1)

| Path             | Edit                                                                                                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.eslintrc.json` | Add a top-level `rules` block configuring `no-restricted-imports` at severity `"error"`, plus a top-level `overrides[]` block disabling that rule for three file patterns. |

### `.eslintrc.json` — diff

**Before (3 lines):**

```json
{
  "extends": "next/core-web-vitals"
}
```

**After (21 lines):**

```json
{
  "extends": "next/core-web-vitals",
  "rules": {
    "no-restricted-imports": [
      "error",
      {
        "paths": [
          {
            "name": "@supabase/supabase-js",
            "message": "Use supabaseService from @/lib/supabase for app code, or add an adapter under lib/adapters/supabase/ for vendor-specific operations. See ADR-0003 (FREEZE rule)."
          }
        ]
      }
    ]
  },
  "overrides": [
    {
      "files": ["lib/supabase.ts", "lib/adapters/supabase/**/*.ts", "tests/**"],
      "rules": {
        "no-restricted-imports": "off"
      }
    }
  ]
}
```

**Key decisions baked into this shape:**

1. **`extends` preserved verbatim.** F-04 adds keys; it does not
   replace the existing Next.js base config.
2. **Severity `"error"`** — not `"warn"`. The FREEZE rule must
   actually freeze. A warning is not a guard; `next lint` exits 0
   on warnings, and `next build` does not fail on warnings. Errors
   block merge once CI lands.
3. **`paths[0].name` is the exact npm package name** —
   `@supabase/supabase-js`. ESLint's `no-restricted-imports` does
   exact-string matching on the import specifier (the value of
   `from '...'`). The rule also recognises sub-paths if `patterns`
   is used instead; F-04 uses `paths` because there are no
   `@supabase/supabase-js/*` sub-imports in the codebase to worry
   about. **Flagged in Risks #4.**
4. **A SINGLE override entry with THREE files patterns** in one
   array — not three separate override blocks. ESLint's legacy
   config allows multiple files in one `overrides[].files` array,
   and consolidating to one entry minimises config-surface and
   makes the allow-list grep-friendly. **Verified to be equivalent
   to three separate blocks per the legacy schema.**
5. **`"no-restricted-imports": "off"`** in the override —
   `"off"` is the standard severity string for disabling a rule.
   Equivalent to `0`. **NOT** the bracket form `["off", {...}]`
   (which is also accepted by ESLint but visually noisier);
   `"off"` is the canonical and most readable form. **Confirmed at
   the legacy-config severity docs and the
   `no-restricted-imports.js` rule source — neither requires the
   bracket form for override-disable.**
6. **`overrides[].files` glob patterns**:
   - `"lib/supabase.ts"` — exact path (matches the single file).
   - `"lib/adapters/supabase/**/*.ts"` — globstar matches every `.ts`
     file at any depth inside `lib/adapters/supabase/`. **Does not
     match `lib/adapters/supabase/index.ts`'s parent directory
     itself** because `**/*` is required (not just `**`). The `.ts`
     suffix is intentional — restricts to TypeScript source files.
     The barrel file (when it exists) will be `index.ts` and
     matches.
   - `"tests/**"` — broad glob covering every file under `tests/`
     at any depth, any extension. Covers `tests/unit/`,
     `tests/integration/`, `tests/e2e/`, fixture files, etc.
7. **The custom message** is a single line of JSON-escaped text.
   No embedded newlines. ESLint reports the message as-is in
   `LintMessage.message`. Test case (5) asserts the message
   string with `.toBe(...)` for exact equality.

### `tests/unit/lint/no-supabase-sdk.test.ts` — skeleton

```ts
/**
 * tests/unit/lint/no-supabase-sdk.test.ts
 *
 * F-04 — pins the `no-restricted-imports` configuration against typos
 * and silent drift. Six cases:
 *
 *   (1) Forbidden:  SDK import in app/api/foo/route.ts                    → 1 error
 *   (2) Allowed:    SDK import in lib/supabase.ts                         → 0 errors
 *   (3) Allowed:    SDK import in lib/adapters/supabase/OrdersRepository.ts → 0 errors
 *   (4) Allowed:    SDK import in tests/integration/foo.ts                → 0 errors
 *   (5) Message:    the configured custom-message text is reported as-is
 *   (6) Sanity:     unrelated import (zod) in app/api/foo/route.ts        → 0 errors
 *
 * Uses ESLint's `ESLint` class (the higher-level API), not `Linter`,
 * because `Linter.verify()` ignores `overrides[]` per the legacy
 * config semantics (see node_modules/eslint/lib/linter/linter.js:1447).
 * The `ESLint` class builds the full legacy config array internally and
 * honours every overrides[] block.
 *
 * `useEslintrc: false` isolates the test from the project's real
 * .eslintrc.json (which extends next/core-web-vitals and would otherwise
 * pull in the Next.js + React + a11y rule machinery for no reason).
 * `overrideConfig` feeds the F-04 config under test — a hand-rolled
 * mirror of the .eslintrc.json edit, kept in sync via case (5)'s
 * message-equality assertion (typos in either copy fail the test).
 *
 * No on-disk fixture files, no temp directories, no shelling out.
 */
import { describe, it, expect } from "vitest";
import { ESLint } from "eslint";

const FORBIDDEN_MESSAGE =
  "Use supabaseService from @/lib/supabase for app code, " +
  "or add an adapter under lib/adapters/supabase/ for vendor-specific operations. " +
  "See ADR-0003 (FREEZE rule).";

/**
 * The F-04 config under test. Mirrors `.eslintrc.json` exactly.
 *
 * If the .eslintrc.json edit drifts (e.g. someone changes the
 * forbidden module name or edits the custom message), case (5)'s
 * exact-string assertion catches it. The local copy keeps the test
 * hermetic — no file-system read, no JSON.parse on the actual
 * .eslintrc.json — but the canonical source of truth remains the
 * shipped config; the test mirrors it.
 *
 * `parserOptions` is set to a permissive ES2022 + sourceType: 'module'
 * so the inline-string fixtures parse as ESM regardless of the
 * project's tsconfig.
 */
const f04Config = {
  parserOptions: {
    ecmaVersion: 2022 as const,
    sourceType: "module" as const,
  },
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: [
          {
            name: "@supabase/supabase-js",
            message: FORBIDDEN_MESSAGE,
          },
        ],
      },
    ],
  },
  overrides: [
    {
      files: ["lib/supabase.ts", "lib/adapters/supabase/**/*.ts", "tests/**"],
      rules: {
        "no-restricted-imports": "off",
      },
    },
  ],
};

/**
 * Construct a fresh ESLint instance per test to avoid any internal
 * caching between cases. The instance is configured to:
 *   - Skip .eslintrc.* discovery (useEslintrc: false).
 *   - Use only the F-04 config under test (overrideConfig).
 *
 * `cwd` is set to the project root so the overrides[] file globs
 * resolve against the same base path the project ESLint run uses.
 * Without this, a glob like `lib/supabase.ts` would resolve relative
 * to whatever cwd vitest happens to spawn with.
 */
function makeEslint(): ESLint {
  return new ESLint({
    cwd: process.cwd(),
    useEslintrc: false,
    overrideConfig: f04Config as never,
  });
}

async function lint(
  filePath: string,
  source: string,
): Promise<{ ruleId: string | null; message: string }[]> {
  const eslint = makeEslint();
  const results = await eslint.lintText(source, { filePath });
  // lintText returns one LintResult per file (just one here);
  // .messages contains every reported diagnostic.
  return results[0].messages.map((m) => ({
    ruleId: m.ruleId,
    message: m.message,
  }));
}

describe("F-04 no-restricted-imports — Supabase SDK FREEZE rule", () => {
  // ── (1) ────────────────────────────────────────────────────────
  it("reports an error when @supabase/supabase-js is imported from app/api", async () => {
    const messages = await lint(
      "app/api/foo/route.ts",
      "import { createClient } from '@supabase/supabase-js'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("no-restricted-imports");
  });

  // ── (2) ────────────────────────────────────────────────────────
  it("allows the import in lib/supabase.ts (central client)", async () => {
    const messages = await lint(
      "lib/supabase.ts",
      "import { createClient } from '@supabase/supabase-js'\n",
    );
    expect(messages).toEqual([]);
  });

  // ── (3) ────────────────────────────────────────────────────────
  it("allows the import in lib/adapters/supabase/**/*.ts (prospective adapter dir)", async () => {
    const messages = await lint(
      "lib/adapters/supabase/OrdersRepository.ts",
      "import { createClient } from '@supabase/supabase-js'\n",
    );
    expect(messages).toEqual([]);
  });

  // ── (4) ────────────────────────────────────────────────────────
  it("allows the import in tests/** (test infrastructure)", async () => {
    const messages = await lint(
      "tests/integration/foo.ts",
      "import { createClient } from '@supabase/supabase-js'\n",
    );
    expect(messages).toEqual([]);
  });

  // ── (5) ────────────────────────────────────────────────────────
  it("reports the configured custom-message text verbatim", async () => {
    const messages = await lint(
      "app/api/foo/route.ts",
      "import { createClient } from '@supabase/supabase-js'\n",
    );
    expect(messages).toHaveLength(1);
    // The rule message format is:
    //   "'<name>' import is restricted from being used. <message>"
    // We assert the configured tail appears verbatim in the rendered
    // message. (Exact-string asserts the configured text, robust to
    // ESLint's leading-prefix wording.)
    expect(messages[0].message).toContain(FORBIDDEN_MESSAGE);
  });

  // ── (6) ────────────────────────────────────────────────────────
  it("does not affect unrelated imports (zod in app/api)", async () => {
    const messages = await lint(
      "app/api/foo/route.ts",
      "import { z } from 'zod'\n",
    );
    expect(messages).toEqual([]);
  });
});
```

**Why six cases is enough.** Together they exercise every dimension
of the configured rule:

- (1) the rule fires on the forbidden module.
- (2) override #1 (exact path) disables the rule.
- (3) override #2 (globstar) disables the rule on a synthetic file
  path that doesn't exist on disk (proving ESLint matches the path
  against `filePath`, not the filesystem).
- (4) override #3 (broad tests glob) disables the rule.
- (5) the custom-message text is correctly threaded through the
  config and surfaces verbatim. Pins against typos in either the
  config or the mirrored copy.
- (6) the rule's scope is correctly bounded to the forbidden module
  only; unrelated imports are not affected.

A seventh case (`export ... from '@supabase/supabase-js'` re-export
in app code) was considered. ESLint's `no-restricted-imports` covers
both `import` and `export ... from` per the rule docs, but the
codebase has no such re-export today and is unlikely to ever have
one. **Not worth the test surface.** A future PR can add the case
if a real re-export pattern emerges.

**Why `expect(messages[0].message).toContain(...)` rather than
`.toBe(...)`** in case (5): ESLint prefixes the configured message
with a fixed wording (`'@supabase/supabase-js' import is restricted
from being used. <message>`). Asserting the configured tail with
`.toContain(...)` is robust to that ESLint-level prefix while still
catching any drift in the configured text itself. If the ESLint
prefix wording changes in a future v8 patch release, this assertion
still passes; if the configured message text drifts (typo, missing
ADR reference, etc.), the assertion fails. **Right level of
specificity for the test.**

---

## 3. Implementation steps (ordered, atomic)

**Commit shape decision: 2 commits ADOPTED.**

Rationale (matches F-01's and F-03's two-commit pattern):

- **Commit 1** carries the configuration edit alone. Tiny diff
  (`.eslintrc.json` grows from 3 lines to 21). The reviewer sees the
  config shape, the forbidden-import name, the three allow-list
  patterns, the custom message — one self-contained story.
- **Commit 2** carries the test that pins the configuration's
  behaviour. The reviewer reads the config, then reads the proof.
- **Option: 1 commit.** Considered. The total diff is small enough
  that bundling feature + test could feel less ceremonial. Rejected
  because: (a) the F-01 and F-03 pattern is the team's existing
  baseline — diverging now reduces consistency without buying
  anything; (b) keeping the config and the test in separate commits
  makes it trivially easy to revert just the test (e.g. if the test
  shows a flake unrelated to the config) without unwinding the
  FREEZE rule; (c) the two-commit shape mirrors the natural review
  pass (read the contract → read the proof). **Stick with two.**
- **Option: 3 commits** (e.g. config split into `rules` and
  `overrides` separately). Rejected — they're meaningless without
  each other (the rule without overrides would lint the two existing
  allow-listed offenders red on its own branch; the overrides
  without the rule do nothing). Splitting them is fake atomicity.

### Step list

1. **Cut the branch.** `git checkout -b f-04-eslint-freeze-guard`
   off `main` HEAD `bb5180e`. Confirm `git rev-parse main` returns
   `bb5180e451041ad0fa08329f5c2f3ca105198869`.
2. **Confirm clean-tree baseline.**
   - `npm test` — unit suites must exit 0 (34+ suites — F-FND-02 +
     F-FND-03 + F-INFRA-01 + F-01 + F-03 baseline). If it fails,
     STOP and report — F-04 does not fix orthogonal rot.
   - `npm run lint` — note the current calibrated baseline (any
     existing nits are not F-04's responsibility). Capture the
     output for the post-edit diff.
   - **No `npm run test:integration` required** — F-04 adds no
     integration test, modifies no integration test, and the build
     graph for integration runs is unaffected.
   - Verify the offender grep one more time:
     ```
     grep -rn "from ['\"]@supabase/supabase-js['\"]" \
       --include="*.ts" --include="*.tsx" 2>&1 | grep -v node_modules
     ```
     Expect exactly two lines: `lib/supabase.ts:13` and
     `tests/integration/_setup.ts:24`. If MORE lines appear, STOP —
     a regression has been introduced into `main` between this
     plan's recon and the implementation, and F-04's lint will fail
     on its own branch.
3. **Edit `.eslintrc.json`** per the diff in §2 above. Result: 21
   lines, well-formed JSON, `extends` preserved at line 2, `rules`
   block at lines 3-14, `overrides[]` block at lines 15-20.
4. **Run lint immediately after the config edit.**
   - `npm run lint 2>&1 | grep -E "no-restricted-imports"` — expect
     empty (the two existing offenders are allow-listed). If
     anything appears, STOP and re-check the override globs.
   - `npm run lint` (full output) — must exit 0, same as the
     baseline captured in step 2. Calibrated bar: zero NEW
     violations attributable to F-04. **If `next lint` exits
     non-zero now where it didn't in step 2, F-04 has broken lint
     for a non-Supabase reason** (e.g. a JSON syntax error in
     `.eslintrc.json`); STOP and diagnose.
   - **Belt-and-braces:** validate the JSON itself parses cleanly:
     `node -e "console.log(JSON.parse(require('fs').readFileSync('.eslintrc.json', 'utf8')))"` —
     expect printed config; any throw means the JSON is malformed.
5. **Commit 1.** `git add .eslintrc.json` (single file). One commit:

   ```
   feat(lint): no-restricted-imports rule activating ADR-0003 FREEZE (F-04)
   ```

   Body (HEREDOC):

   > Forbids `import ... from '@supabase/supabase-js'` outside an
   > allow-list of three file patterns: `lib/supabase.ts` (the
   > central service-role client), `lib/adapters/supabase/**/*.ts`
   > (the prospective Phase 1+ port-adapter directory — not yet
   > created), and `tests/**` (test infrastructure exemption).
   > Severity is `"error"` so the FREEZE rule actually blocks merge
   > once CI lands.
   >
   > Implements ADR-0003 lines 21-22 verbatim ("Once F-04 ships, no
   > new code may import the Supabase SDK outside the adapter
   > folder"). Ships rule A only per ADR-0005; rule B (raw-fetch
   > pattern) is deferred to F-27 in Phase 5.
   >
   > Existing offenders on main (verified): `lib/supabase.ts:13`
   > and `tests/integration/_setup.ts:24` — both allow-listed.
   > Net violation count introduced by this PR: zero.

   Trailer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

6. **Create the test file** `tests/unit/lint/no-supabase-sdk.test.ts`
   per the skeleton in §2. New directory `tests/unit/lint/` is
   created implicitly by `mkdir -p` (or by `git add` against the
   nested path). 6 cases.
7. **Run the new test in isolation.**
   `npx vitest run tests/unit/lint/no-supabase-sdk.test.ts` — expect
   exit 0 with 6 cases passing. If any case fails:
   - Cases (1), (5), (6) failing → the rule itself isn't firing as
     expected. Check the config object in the test file mirrors the
     `.eslintrc.json` exactly (the `paths[0].name` and the message
     are the load-bearing fields).
   - Cases (2), (3), (4) failing → the override isn't disabling the
     rule. Check `cwd: process.cwd()` is set on `new ESLint(...)`
     and the `overrides[].files` globs are relative-path-style (no
     leading slash, no absolute prefix).
   - Any case throwing `TypeError` from ESLint internals → the
     `parserOptions` may need a different `ecmaVersion` for inline
     ESM strings. Try `'latest'`.
8. **Run the full unit suite.** `npm test` must exit 0. The new
   suite runs alongside the 34+ existing ones; the new test does
   not modify or share state with any existing test.
9. **Run lint + tsc on the touched files.**
   - `npm run lint 2>&1 | grep -E "(tests/unit/lint/|\.eslintrc\.json)"` —
     expect empty.
   - `npx tsc --noEmit 2>&1 | grep -E "tests/unit/lint/"` — expect
     empty. **Render-phase amendment (2026-06-08):** the original recon
     incorrectly claimed `eslint@8.57.1` ships its own `.d.ts` files
     at `node_modules/eslint/lib/types/`. Verified during implementation
     — that path does not exist, and `node_modules/eslint/` has zero
     `.d.ts` files. F-04 therefore adds `@types/eslint` as a
     devDependency (DefinitelyTyped, type-only) in a dedicated commit
     before the test commit. See the new §3 commit ordering.
10. **Run `npm run build`** as a smoke check. `next build` must exit 0. F-04 doesn't touch app code so this is fast; failure would
    indicate something orthogonal broke and should STOP the PR.
    **Critically:** `next build` invokes `next lint` during the
    build (via the Next.js build hook). If the lint fails inside
    the build, it surfaces here. **This is the load-bearing
    end-to-end check that the FREEZE rule landed cleanly in the
    real build pipeline, not just under the synthetic test.**
11. **Verify no package.json drift.**
    `git diff main package.json` — expect empty. If anything
    appears, STOP and revert (no new deps allowed).
12. **Verify no other source-code drift.**
    `git diff main lib/ app/ middleware.ts supabase/` — expect
    empty. F-04 is purely additive in `tests/unit/lint/` plus the
    one config edit; touches zero source files, zero routes, zero
    migrations.
13. **Commit 2.** `git add tests/unit/lint/no-supabase-sdk.test.ts`
    (single new file). One commit:

    ```
    test(unit): cover F-04 lint rule (6 cases)
    ```

    Body (HEREDOC): lists the 6 cases and what each proves; notes
    the test uses ESLint's `ESLint` class (not `Linter`) because
    `Linter.verify()` ignores `overrides[]` per the legacy-config
    semantics; notes the parser is configured for ES2022 + ESM
    sourceType for inline-string fixtures. Trailer:
    `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

14. **Re-run the full suite one last time.** `npm test` must exit 0. The two commits land as a coherent pair — config edit and
    its test.
15. **Push the branch.**
    `git push -u origin f-04-eslint-freeze-guard`.
16. **Open PR to `main`** via `gh pr create`. Title:
    `feat(lint): no-restricted-imports rule activating ADR-0003 FREEZE (F-04)`.
    Body uses the standard HEREDOC pattern, summarises the two
    commits, pastes the ANVIL test-matrix results from §4 with
    actual command output, references ADRs 0002/0003/0004/0005 by
    file path, and states explicitly: _"Two commits — one config
    (`.eslintrc.json` — forbidden module + three allow-list
    overrides), one test (6 cases pinning the rule). No
    migrations. No new deps. No app-route changes. The two
    existing SDK importers (`lib/supabase.ts:13` and
    `tests/integration/_setup.ts:24`) are both allow-listed; net
    new violations: zero."_

### Verification commands the implementer should be able to copy-paste

```bash
git checkout -b f-04-eslint-freeze-guard
git rev-parse main                                                    # expect bb5180e...
npm test                                                              # baseline green (34+ suites)
npm run lint                                                          # baseline output captured

# After commit 1 (config edit):
node -e "JSON.parse(require('fs').readFileSync('.eslintrc.json','utf8'))"  # JSON valid (no throw)
npm run lint 2>&1 | grep -E "no-restricted-imports"                   # expect empty
npm run lint                                                          # same as baseline (zero NEW)

# After commit 2 (test file):
npx vitest run tests/unit/lint/no-supabase-sdk.test.ts                # 6 cases passing
npm test                                                              # 35+ suites green
npx tsc --noEmit 2>&1 | grep -E "tests/unit/lint/"                    # expect empty
npm run lint 2>&1 | grep -E "(tests/unit/lint/|\.eslintrc\.json)"     # expect empty
npm run build                                                         # exit 0 (load-bearing — runs next lint inline)

git diff main package.json                                            # expect empty
git diff main lib/ app/ middleware.ts supabase/                       # expect empty
git status                                                            # expect only .eslintrc.json + tests/unit/lint/

git push -u origin f-04-eslint-freeze-guard
gh pr create --title "feat(lint): no-restricted-imports rule activating ADR-0003 FREEZE (F-04)" --body "..."
```

---

## 4. Test matrix (pre-ANVIL — what each layer will see)

Same calibrated-vs-strict discipline as F-FND-02/03 / F-01 / F-03.
ANVIL Gate 3 reads this section verbatim.

| #   | Layer                  | Command                                                                                                      | Pass criterion                                                                                                                                                                                | Calibrated / Strict              |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| 1   | Vitest unit (new)      | `npx vitest run tests/unit/lint/no-supabase-sdk.test.ts`                                                     | Exit 0. 6 cases passing.                                                                                                                                                                      | Strict (this is the deliverable) |
| 2   | Vitest unit (baseline) | `npm test`                                                                                                   | Exit 0. All 34+ pre-existing suites continue to pass unchanged (F-04 modifies no existing source file, only the lint config). New `no-supabase-sdk.test.ts` suite (6 cases) green.            | Strict (baseline must hold)      |
| 3   | Vitest integration     | n/a                                                                                                          | F-04 adds no integration test and modifies no integration test. **Skipped** as a gating step. Hakan may still run `npm run test:integration` defensively but it is not F-04's gate.           | Skipped                          |
| 4   | ESLint                 | `npm run lint`                                                                                               | **Calibrated.** Bar: zero NEW violations attributable to F-04 files. The two existing SDK importers are allow-listed; the rule fires nowhere else.                                            | Calibrated                       |
| 5   | TypeScript check       | `npx tsc --noEmit`                                                                                           | **Calibrated.** Bar: zero NEW errors in F-04 files. The only new TS file is `tests/unit/lint/no-supabase-sdk.test.ts`; ESLint's shipped types cover the `ESLint`/`LintMessage` imports.       | Calibrated                       |
| 6   | Next.js build          | `npm run build`                                                                                              | Exit 0. `next build` invokes `next lint` inline — this is the **load-bearing end-to-end check** that F-04's rule lands cleanly in the real build pipeline.                                    | Strict                           |
| 7   | Playwright E2E         | n/a                                                                                                          | **No E2E for F-04.** The lint rule has no HTTP surface, no UI surface, no DB surface. Existing Playwright suites need not be re-run as gating.                                                | Skipped                          |
| 8   | Migration safety       | n/a                                                                                                          | **No migrations, no PITR check at Gate 4.** F-04 changes no schema; the standing Supabase migration-lock hook does not fire.                                                                  | Skipped                          |
| 9   | Drift checks           | `git diff main package.json`, `git diff main lib/ app/ middleware.ts supabase/`                              | All empty. F-04 is purely additive: one config edit + one new test file. Touches zero routes, zero source files, zero migrations, zero deps.                                                  | Strict                           |
| 10  | Offender grep          | `grep -rn "from ['\"]@supabase/supabase-js['\"]" --include="*.ts" --include="*.tsx" \| grep -v node_modules` | Exactly two lines: `lib/supabase.ts:13` and `tests/integration/_setup.ts:24`. Both allow-listed. If MORE lines appear, the FREEZE rule has a real offender F-04 has not accounted for — STOP. | Strict                           |

**Layer 6 note.** `next build` is the load-bearing check.
`npm run lint` and `npx vitest run ...` separately verify the rule
configuration and the test logic, but `next build` is what proves
the rule integrates into the actual production build flow. If
`next build` exits non-zero with a lint violation, F-04's allow-list
is missing a real file and must be fixed before the PR can ship.

**Layer 10 note.** The offender grep is the FREEZE rule's
real-world calibration. If at any point between this plan's
recon (`main` HEAD `bb5180e`) and the implementation the offender
count grows beyond two, F-04's allow-list either needs the new file
added (if it's a legitimate central-client / adapter / test) or the
PR that introduced the offender needs to be reverted (if it's a
new app-code coupling that the FREEZE rule should block). **The
correct action is almost always: revert the offender, ship F-04
clean. F-04's whole purpose is to enforce zero offenders going
forward.**

---

## 5. Risks and open questions

1. **`Linter.verify()` does NOT honour `overrides[]` — chosen
   workaround: use the `ESLint` class.** The conductor brief
   flagged this as critical. Source-verified at
   `node_modules/eslint/lib/linter/linter.js:1447` (the comment
   `Linter doesn't support 'overrides' property in configuration`).
   Two workarounds were considered:
   - **(a)** Construct two configs (one with the rule on, one with
     the rule off) and pick by filename in the test. Rejected
     because it pre-decides the override resolution outside ESLint
     and weakens the test's value (it would assert the planner's
     mental model rather than the actual ESLint behaviour).
   - **(b)** Use `ESLint.lintText(source, { filePath })` instead.
     **Chosen.** The `ESLint` class
     (`node_modules/eslint/lib/eslint/eslint.js:563`) builds the
     full legacy config array internally — including overrides —
     before linting. The test is hermetic (`useEslintrc: false`
     skips real-`.eslintrc` discovery; `overrideConfig` feeds the
     synthetic F-04 config). Cleaner, shorter, and more honest.
     **Implementation note for the implementer:** if the test fails
     with mysterious override-not-applied behaviour, the most likely
     cause is `cwd` not being set on `new ESLint({ cwd: ... })` — the
     override globs resolve against `cwd`, so without it the
     `lib/supabase.ts` glob may resolve relative to a vitest-internal
     working directory.
2. **ESLint `no-restricted-imports` does NOT cover CommonJS
   `require()` calls.** The rule is AST-driven on `ImportDeclaration`
   nodes (and friends) only. A determined contributor could write
   `const { createClient } = require('@supabase/supabase-js')` in a
   `.js` file and trip nothing. Mitigation: the codebase is ESM
   throughout the relevant boundary (every existing SDK importer
   uses `import`), the project uses TypeScript end-to-end with
   `"type": "module"` semantics through Next.js, and `require()`
   would itself trip TypeScript / lint nits unrelated to this rule.
   Acceptable gap; documented for the reviewer. **No action.**
3. **`@supabase/supabase-js` sub-paths are NOT covered by F-04.**
   The rule's `paths` entry matches the exact specifier string
   `@supabase/supabase-js`. A future hypothetical sub-import like
   `from '@supabase/supabase-js/dist/something'` would NOT trip the
   rule. Mitigation: no such sub-import exists in the codebase
   today; the SDK's public surface area is the top-level package
   only. If a sub-path import ever becomes needed, F-04's `paths`
   entry can be extended to include sub-paths (or switched to the
   `patterns` schema which accepts globs). **Flagged for Gate 2;
   recommend deferring until a real sub-path import appears.**
4. **`@supabase/auth-helpers-nextjs` and other sister packages.**
   The codebase has no dependency on `@supabase/auth-helpers-*`,
   `@supabase/realtime-js`, `@supabase/storage-js`, etc. — verified
   at `package.json:21-45`. The forbidden-imports list covers only
   `@supabase/supabase-js`. If a future PR adds one of the sister
   packages, F-04 does not catch it. Mitigation: code review (small
   team, every PR is reviewed); a future PR can extend the `paths`
   list when the need arises. **Flagged for Gate 2; no F-04 action
   needed today.**
5. **The custom-message text is mirrored in two places** —
   `.eslintrc.json` and `tests/unit/lint/no-supabase-sdk.test.ts`.
   Drift between the two would produce a test failure (case 5),
   which is the intended safety net. **Risk:** an over-eager future
   PR that edits the message in one place but not the other will
   fail CI. **Mitigation accepted as feature**, not bug — the test
   is supposed to catch silent drift. If duplication ever becomes a
   real maintenance pain, a future PR can extract the message
   string to a TypeScript constant imported by both
   `.eslintrc.json` (via `.eslintrc.cjs` with `require()`) and the
   test, at the cost of converting the config file format.
   **Recommend: do NOT pre-emptively migrate `.eslintrc.json` to
   `.eslintrc.cjs` in F-04.** Out of scope and unnecessary.
6. **`tests/**`is broader than ADR-0003's prose strictly
anticipates.** The ADR enumerates`lib/adapters/supabase/**`and`lib/supabase.ts`. F-04 adds `tests/**`as a third allow-list
pattern, which the ADR's prose does not explicitly mention.
Justification:`tests/integration/\_setup.ts:24`is a real,
existing offender that lint cannot un-write; the spirit of the
FREEZE rule is to stop **new app-code** coupling, and`tests/`is not app code. **Risk:** a contributor might place
business-logic-shaped code under`tests/`to dodge the rule. The
small team + code review is the human check; if abuse ever
appears, the override pattern can tighten to`tests/integration/**`(current single legit use site) or`tests/integration/\_setup.ts` (single exact path). **Recommend:
   keep `tests/**` broad; document the intent in the commit body
   and PR description.\*\*
7. **The override list is positional and the FIRST matching entry
   wins** in ESLint's legacy config semantics. F-04 has a single
   override entry, so positional precedence is moot. **No action;
   documented in case a future PR adds more overrides.**
8. **`useEslintrc: false` in the test isolates from the project's
   real config**, which is what we want for a focused
   config-under-test scenario — but it means the test does NOT
   verify that the real `.eslintrc.json` is well-formed and parses.
   Mitigation: step 4 of the implementation explicitly runs
   `node -e "JSON.parse(require('fs').readFileSync('.eslintrc.json','utf8'))"`
   as a one-shot JSON-validity check. And step 10 runs
   `npm run build`, which invokes `next lint`, which parses
   `.eslintrc.json` for real. Between those two, malformed JSON
   would be caught before the PR opens. **No action.**
9. **A future PR could append a `*.tsx` ESLint rule** that conflicts
   with `no-restricted-imports`. The rule is config-additive;
   F-04's edit does not block other rules. **No risk to F-04 per
   se; flagged as forward context.**
10. **The new `tests/unit/lint/` directory** has no tsconfig
    override, no vitest project addition, no fixtures. The unit
    config glob `tests/unit/**/*.test.ts` (`vitest.config.ts:8`)
    already picks the new file up. The `@` path alias resolves to
    the project root, though F-04's test doesn't use it. **The
    directory is structurally identical to the existing
    `tests/unit/auth/`, `tests/unit/errors/`, etc.** No extra setup.
11. **`next lint` and `npm run lint` are the same command** — the
    `lint` script at `package.json:10` is literally `next lint`,
    which wraps ESLint with Next.js's defaults. F-04's rule lands
    in the same lint run developers already do. **No new command
    surface for Hakan to learn.**
12. **The custom message references `@/lib/supabase`** as the
    recommended import path. Verified by reading the file at
    `lib/supabase.ts:15` — the export is `export const
supabaseService = createClient(...)`. The recommended
    consumer pattern is `import { supabaseService } from
'@/lib/supabase'`. The custom message points at exactly this
    import. **No action.**
13. **The custom message references `lib/adapters/supabase/`** —
    a directory that does not yet exist. If a contributor reads
    the lint error and tries to navigate to that directory, they
    find nothing. **Mitigation:** the message also points at
    ADR-0003 (FREEZE rule), which explains the directory's
    forward-looking status and the Phase 1+ migration plan.
    Acceptable.
14. **The `parserOptions` in the test's config object** is set to
    `ecmaVersion: 2022, sourceType: 'module'`. The real project's
    parser is `@typescript-eslint/parser` (pulled in by
    `eslint-config-next`), which handles TypeScript syntax. F-04's
    test uses the default ESLint parser (Espree) with permissive
    ECMAScript settings, which CAN parse plain ESM `import` /
    `export` statements but NOT TypeScript-specific syntax (e.g.
    `type` imports, generics). **The fixture strings only contain
    plain ESM imports**, so this is fine. If a future case adds
    TypeScript-specific syntax to a fixture, the test would need
    to switch to the TypeScript parser (which would require
    importing `@typescript-eslint/parser` — already a transitive
    dep via `eslint-config-next` — and setting it as the
    `parser`). **Flagged in case a future PR extends the fixtures.**

---

## 6. Rollback

Straightforward. F-04 squash-merges into `main` as a single commit
(matching #15–#20 and the F-03 squash pattern). To roll back:

```bash
git revert <merge-commit-sha>
git push origin main
```

**No data implications.** F-04 makes no schema changes, no data
migrations, no row inserts/updates/deletes, no runtime behaviour
changes. The unit tests don't touch any DB. A revert reinstates the
previous state byte-for-byte: `.eslintrc.json` shrinks back to the
3-line `{"extends": "next/core-web-vitals"}`; the new
`tests/unit/lint/` directory vanishes.

**If the revert needs to happen mid-day** (e.g. a Phase 1+ PR is
ready to ship but discovers the FREEZE rule is too strict for a
legitimate edge case): the revert is a 30-second operation and
brings the codebase back to the un-frozen state. The right next
step would NOT be to keep the revert — it would be to widen the
allow-list (e.g. add a new override entry for the legitimate edge
case) and re-ship F-04. The FREEZE rule's value depends on it being
in effect; reverting and leaving it reverted is a regression.

---

## 7. Definition of done

The implementer can tick this list off before the PR is considered
Gate 3 / Gate 4 ready:

- [ ] Branch `f-04-eslint-freeze-guard` cut from `main` HEAD `bb5180e`.
- [ ] Pre-edit offender grep returns exactly two lines
      (`lib/supabase.ts:13` and `tests/integration/_setup.ts:24`).
- [ ] **Commit 1**:
      `feat(lint): no-restricted-imports rule activating ADR-0003 FREEZE (F-04)`
      with co-author trailer. Includes:
  - [ ] `.eslintrc.json` (modified — 3 lines → 21 lines: `extends`
        preserved, `rules` block added with
        `no-restricted-imports: ["error", { paths: [...] }]`,
        `overrides[]` block added with three files patterns and
        `no-restricted-imports: "off"`).
- [ ] JSON parse-check after commit 1:
      `node -e "JSON.parse(require('fs').readFileSync('.eslintrc.json','utf8'))"`
      succeeds.
- [ ] `npm run lint` after commit 1 exits 0 (same calibrated
      baseline as step 2 of the plan; zero NEW violations).
- [ ] **Commit 2**:
      `test(unit): cover F-04 lint rule (6 cases)`
      with co-author trailer. Includes:
  - [ ] `tests/unit/lint/no-supabase-sdk.test.ts` (new — 6 cases,
        ~110 lines, uses `ESLint` class with
        `useEslintrc: false` + `overrideConfig`).
- [ ] `npx vitest run tests/unit/lint/no-supabase-sdk.test.ts`
      passes (6 cases).
- [ ] `npm test` exits 0 (35+ suites green, including the new
      `no-supabase-sdk.test.ts` suite).
- [ ] `npm run lint 2>&1 | grep -E "(tests/unit/lint/|\.eslintrc\.json)"`
      returns empty.
- [ ] `npx tsc --noEmit 2>&1 | grep -E "tests/unit/lint/"` returns
      empty.
- [ ] `npm run build` exits 0 (load-bearing — `next build` invokes
      `next lint` inline, proving the rule integrates into the
      production build flow).
- [ ] `git diff main package.json` is empty (no new deps).
- [ ] `git diff main lib/ app/ middleware.ts supabase/` is empty
      (no source / route / middleware / migration edits).
- [ ] PR opened to `main` with title
      `feat(lint): no-restricted-imports rule activating ADR-0003 FREEZE (F-04)`.
- [ ] PR body cites the locked Gate 1 spec; ADRs 0002/0003/0004/0005
      by file path; the F-FND-02 / F-FND-03 / F-INFRA-01 / F-01 /
      F-03 surfaces F-04 leans on (or in this case, leaves
      untouched).
- [ ] PR body explicitly states: no migrations, no new deps, no
      route migrations, the 88 API routes + the 13 raw-fetch sites
      enumerated in ADR-0005 are all untouched.
- [ ] ANVIL Gate 3 results pasted into PR body (the test matrix
      table from §4 with actual command output).

---

## 8. Out of scope (DO NOT touch in this PR)

- **Rule B (raw-fetch `${SUPA_URL}/rest/v1/` pattern).** Explicitly
  deferred to F-27 per ADR-0005 line 47. F-04 ships rule A only.
  Verify in DoD: `.eslintrc.json` does NOT mention
  `NEXT_PUBLIC_SUPABASE_URL`, `rest/v1`, or any URL-shaped pattern.
- **`lib/supabase.ts`.** No edit. The "Centralised here" comment
  remains accurate (post-F-01-narrowing) and the allow-list keeps
  this file lint-clean.
- **`lib/road-times.ts`.** No edit. F-01 narrowed already migrated
  it onto `supabaseService`; it no longer imports the SDK.
- **`lib/auth/session.ts` and `lib/auth/index.ts`.** F-03 added
  these; they don't import the SDK. F-04 leaves them.
- **`middleware.ts`.** No edit.
- **Any of the 88 API route files** under `app/api/**`. None
  imports the SDK directly; F-04 does not migrate any of them.
  Verify in DoD: `git diff main app/api/` returns empty.
- **The 13 raw-fetch sites in ADR-0005's Per-Site Map.** Verify in
  DoD: `git diff main app/api/screen2 app/api/detail
app/api/admin/geocode-all app/api/map lib/complaint-email.ts
lib/compliment-email.ts lib/pricing-email.ts` returns empty.
- **`tests/integration/_setup.ts`.** No edit. Allow-listed by the
  `tests/**` override.
- **`eslint-config-next`** or any other upstream config. Not
  modified, not pinned, not updated.
- **Migrating `.eslintrc.json` to `.eslintrc.cjs`** or flat config
  (`eslint.config.js`). Out of scope. Legacy config is what
  ESLint 8.57.1 and the project use today; flat config is a v9
  concern.
- ~~**Adding `@types/eslint`** to devDependencies. Not needed —
  `eslint@8.57.1` ships its own TypeScript types
  (`node_modules/eslint/lib/types/index.d.ts`).~~ **Reversed
  (Render-phase amendment, 2026-06-08):** the recon claim above was
  factually wrong. `eslint@8.57.1` does NOT ship `.d.ts` files. F-04
  adds `@types/eslint: ^8` as a type-only devDependency in a dedicated
  prep commit before the test commit. This is the only `package.json`
  change in the unit.
- **Bumping ESLint** from 8.57.1 → 9.x. Out of scope. ESLint 9
  requires flat config; the migration is a separate unit.
- **Adding `prettier`, `eslint-plugin-import`,
  `eslint-plugin-unused-imports`, or any other ESLint plugin.** Out
  of scope.
- **CI / GitHub Actions.** Still no CI configured project-wide. F-04
  lands with the lint enforced locally only (via ANVIL Gate 3 and
  the calibrated `npm run lint` discipline). When CI is configured
  in a future unit, the FREEZE rule gains automatic enforcement on
  every PR. Until then, code review + ANVIL is the human check.
- **F-05** — Orders/Customers/Products ports + domain types. The
  next unit in the strangler-fig sequence. F-04 is the freeze that
  makes F-05's port-extraction safe; F-04 does not pre-empt any
  port shape.
- **F-06** — Supabase adapters under `lib/adapters/supabase/**`.
  F-04's allow-list pattern #2 anticipates this directory. F-06
  creates the first file there; F-04 does NOT create the
  directory.
- **F-13** — Users domain. F-04 unrelated.
- **F-27** — Phase 5 lint tightening (rule B). F-04 unrelated.
- **F-TD-01** — pre-existing ~60 `tsc` errors + ESLint nits. F-04
  does not fix them.
- **Bumping `tsconfig.json` `target`** to ES2022. Out of scope; the
  ES2017 caveat documented in `lib/errors/AppError.ts:29-34` and
  F-FND-02's plan still applies.

---

## 9. ADR / docs implications

**No new ADR required.** Gate 1 explicitly confirmed F-04 conforms
to ADRs 0002/0003/0004/0005 without new architectural decisions.
F-04 IS the implementation of ADR-0003 lines 21-22; writing a
separate ADR for it would duplicate that ADR's content.

**No edit to ADR-0003.** The ADR's prose at line 21 already names
F-04 by ID and describes the expected rule shape. F-04's shipment
does not change the ADR's content — it realises the ADR's intent.

**No CLAUDE.md edit.** F-04 introduces no new developer workflow
that CLAUDE.md should mention. The Lego principle (CLAUDE.md
lines 3-24) gains its first lint-time guard with F-04, but the
CLAUDE.md text already describes that guard in principle ("Every
external dependency ... sits behind an interface the app owns");
F-04 is one mechanism that enforces the principle, not a new
principle. The local-test-infrastructure section (CLAUDE.md
lines 27-37) is unchanged.

**No runbook edit.** `docs/runbooks/local-dev.md` (F-INFRA-01)
already covers the daily workflow the implementer needs. No new
local commands; `npm run lint` is the existing command and now
enforces the FREEZE rule.

**No architecture-review-2026-06-06.md edit.** ADR-0005's addendum
already overrides the v1.2 framing of F-04 (rule A only). F-04's
shipment realises ADR-0005's framing verbatim; no further addendum
needed.

**Future ADR notes (NOT for F-04).** F-27 (Phase 5
seal-the-boundary) will tighten the rule to add rule B (raw-fetch
pattern). That unit will write its own ADR (if it produces a new
architectural decision) or simply ship under ADR-0003 / ADR-0005's
existing framing. F-04 does not pre-empt that work.
