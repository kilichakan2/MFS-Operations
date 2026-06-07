# F-FND-02 — Typed error contract + framework handler

## Goal
F-FND-02 ships the foundation the entire Lego migration leans on for error semantics. It creates `lib/errors/` (a typed error contract — `AppError` base + `NotFoundError` / `ConflictError` / `ValidationError` / `ServiceError` subclasses), a framework-level integration (a Higher-Order-Function `withErrors` wrapper) that translates any thrown `AppError` into the correct `Response` (status + JSON), and the vitest unit + integration tests that prove it. **No route migrations** — F-08 (Orders) is the first PR that *uses* this contract. F-FND-02 is the contract itself, locked and tested.

## Source spec
- Architecture review v1.1: `docs/architecture-review-2026-06-06.md` Phase 0a unit **F-FND-02** (line 302) and the "Errors (everywhere)" cross-cutting rules (lines 259–263).
- ADR-0002 (`docs/adr/0002-hexagonal-shape-and-naming.md`) — the depth rule and the principle that ports/services don't import vendor types; `lib/errors/` is part of the application core, not an adapter.
- Lego principle contract: `CLAUDE.md` lines 3–24.
- APOSD principles reference: `~/.claude/skills/saas-consultant/references/aposd-principles.md` — sections 5 (*define errors out of existence*, principle #11) and section 2 (*pull complexity downward*, principle #10), both cited by name in the design rationale below.
- Locked-decisions session (the conductor) — Gate 1 spec frozen; no clarifications taken in planner.

## Compliance
**NO** runtime compliance impact in this PR. Zero route migrations — the contract ships, no route changes throw it yet. Depth rule observed: the `AppError` surface is one short shape (constructor + `toJSON()` + `httpStatus` + `code`) hiding the entire vendor-neutral error semantics behind it, not a 1:1 wrapper over native `Error`. APOSD lens applied — *define errors out of existence* (principle #11) is cited as the reason error classes carry HTTP status as a static property rather than forcing every route to map class → status (the mapping is defined once, in the class itself, and disappears as a concern from caller code) and *pull complexity downward* (principle #10) is cited as the reason the HOF wrapper eats the redaction logic so route authors never decide whether to leak a stack trace. No auth, payments, HACCP, RLS policies, or financial logic touched. No new runtime deps.

## Branch + base
- Base: `main` HEAD `4d1df22` (the F-FND-01 merge commit).
- Branch: `forge/f-fnd-02-typed-errors`.
- PR opened to `main`, **not merged** — Hakan ships via `/ship` after gates pass.

---

## 1. Repo recon findings

Captured before writing the plan; the plan reflects what's actually in the tree on HEAD `4d1df22`.

1. **TypeScript config (`tsconfig.json`).** `strict: true`. `target: "ES2017"`. `module: "esnext"`, `moduleResolution: "bundler"`. Path alias `@/* → ./*`. `esModuleInterop: true`, `isolatedModules: true`. No `verbatimModuleSyntax`. The plan's code skeleton uses `import { … } from '@/lib/errors'` aliasing.
   - **ES2017 caveat:** `target: "ES2017"` predates the native `Error.cause` field (ES2022) and the `{ cause }` constructor option. The plan's `AppError` therefore assigns `this.cause` itself rather than relying on `super(message, { cause })`. This is the simplest path that works under the project's existing config; explicit and forward-compatible. (Bumping `target` is out of scope — it's a wider repo-touching change.)
2. **Vitest state.** **Already present and configured.** Found:
   - `vitest@^4.1.2` and `@vitest/coverage-v8@^4.1.2` in `devDependencies`.
   - `vitest.config.ts` at repo root (unit suite — `tests/unit/**/*.test.ts`, globals on, `node` env, `@/*` alias resolved via path).
   - `vitest.integration.config.ts` at repo root (integration suite — `tests/integration/**/*.test.ts`, single-fork serial execution, dotenv loader).
   - 28+ existing unit test files under `tests/unit/`, e.g. `dates.test.ts`, `rateLimiter.test.ts`, `adminFilters.test.ts`.
   - `npm test` → `vitest run` (unit); `npm run test:integration` → `vitest run --config vitest.integration.config.ts` (integration).
   - Test style is well-established: header doc comment, `import { describe, it, expect } from 'vitest'`, `@/lib/...` imports, `describe('moduleName', …)` outermost block.
   - **Plan reuses existing configs verbatim.** No vitest setup work needed. New unit tests land in `tests/unit/errors/*.test.ts`; the integration test lands in `tests/integration/withErrors.test.ts`. **Flagged to the conductor: this is the easy path — Vitest works as-is.**
3. **ESLint config (`.eslintrc.json`).** Single-line: `{ "extends": "next/core-web-vitals" }`. No custom rules; no `no-throw-literal` / `prefer-promise-reject-errors` configured beyond what `next/core-web-vitals` extends. The error classes will throw class instances (not strings), so even if a strict literal-throw rule were active, the plan is safe.
4. **Existing route handler pattern.** Captured from three representative routes:
   - `app/api/orders/route.ts` — `export async function GET(req: NextRequest)` and `export async function POST(req: NextRequest)`. Body wrapped in `try { … } catch (err) { … return NextResponse.json({ error: … }, { status: … }) }`. Returns `NextResponse.json(...)`.
   - `app/api/auth/login/route.ts` — same shape.
   - `app/api/dashboard/route.ts` — same shape.
   - **Common signature:** `(req: NextRequest) => Promise<NextResponse>`. The plan's `withErrors` HOF accepts this signature exactly so F-08 onward can wrap routes one at a time with a single line and no signature change.
5. **Existing `lib/` structure.** Files-and-folders mix: top-level `lib/supabase.ts`, `lib/dates.ts`, `lib/road-times.ts`, `lib/syncEngine.ts` etc., with folders for `lib/orders/`, `lib/printing/`, `lib/utils/`, `lib/allergen/`, `lib/annualReview/`. **No existing error infrastructure** — `grep -rn 'class.*Error.*extends' lib` returns nothing; no `lib/errors.ts` or `lib/utils/error.ts`. Greenfield for `lib/errors/`. No migration / absorption concern.
6. **Plan filename convention.** Mirrors `docs/plans/2026-06-06-f-fnd-01-adr-seed.md` — heading structure (Goal → Source spec → Compliance → Branch + base → numbered sections → Risks → Out of scope).
7. **Commit convention.** F-FND-01 merged as `docs(adr): seed hexagonal/strangler-fig/RLS ADRs (F-FND-01) (#15)`. F-FND-02's commit format: `feat(errors): typed error contract + framework handler (F-FND-02)`.
8. **Co-author trailer.** F-FND-01 used exactly `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`. F-FND-02 matches.
9. **`middleware.ts` exists and is load-bearing.** It owns auth + role routing for every request (PUBLIC_PATHS, ROLE_PERMISSIONS, session cookie parsing, header injection). **This is a non-trivial finding for the Design-It-Twice analysis below** — middleware as the error handler would either compose with this existing logic (risky) or replace none of it (the middleware sees auth, not domain exceptions thrown deep inside a route's `await`). See section 2.

---

## 2. Design-It-Twice analysis — error handler form factor

Two genuinely different options sketched, the better one chosen with eyes open. APOSD lenses used by name.

### Option A — HOF wrapper (`withErrors`)

```ts
// lib/errors/withErrors.ts
export const POST = withErrors(async (req: NextRequest) => {
  const body = await req.json()
  const order = await OrdersService.create(body, actor)  // may throw AppError
  return NextResponse.json({ order }, { status: 201 })
})
```

- Route file imports `withErrors` and wraps its handler. Errors bubble up from services through the route into the wrapper, which translates them.
- Works in Node and Edge runtimes (it's just a function).
- Migrates route-by-route in F-08 onward with one-line diffs — perfect fit for strangler-fig (ADR-0003).
- Composes naturally with the existing per-route auth checks (the wrapper sits outside them, or inside; route author decides per route).
- The HOF *itself* is a deep module — one named function with the signature `<H extends RouteHandler>(handler: H) => H`. The complexity it hides (status mapping, JSON shape, prod-mode redaction, unknown-error fallback, logging) is significant. Interface complexity is one identifier. **High depth — strong APOSD fit.**

### Option B — `middleware.ts` global handler

- Next.js root middleware catches errors before/after the route runs.
- **Problem 1 (mechanical):** Next.js App Router middleware runs *before* the route handler resolves; it cannot reliably catch exceptions thrown inside a route handler's awaited Promise. Middleware operates on `NextRequest` → `NextResponse | undefined`, not on the outcome of the downstream handler. Catching post-route errors requires wrapping `fetch(req)` inside middleware in a try/catch, which Next.js does not officially support.
- **Problem 2 (composition):** `middleware.ts` already owns auth + role routing for every request. Adding error translation here would conflate two unrelated concerns — auth/redirect logic and domain-error translation — in one file. This violates APOSD information hiding (one module, two unrelated decisions).
- **Problem 3 (runtime):** Middleware runs in the Edge runtime by default. Anything the error handler logs (e.g. via a future Sentry integration in F-FND-03) would need Edge-compatible adapters, which constrains future moves.
- **Problem 4 (per-route ergonomics):** A global middleware cannot opt-in per route. Every route is wrapped whether it wants to be or not, with no compositional escape hatch.

### Option C — Both (middleware safety net + HOF ergonomic)

- Two integration points to maintain. Doubles the surface area without doubling the value. The middleware safety net is theoretical — see Problem 1 above (middleware can't actually catch post-route exceptions).

### Decision: **Option A — HOF wrapper.**

Justification (APOSD lenses):
- **Deep modules.** `withErrors` is one identifier hiding ≈40 lines of mapping + redaction + logging. The other options either fail mechanically (B) or add a second integration point without commensurate gain (C).
- **Interface comments first.** The wrapper's contract is short and writeable upfront: "Wraps a route handler. If the handler throws an `AppError`, translates to the matching HTTP status + JSON body. If it throws anything else, returns a safe 500 and logs the original. In production, stack traces and `cause` chains are stripped from the response body." Three sentences. Middleware's contract is harder to write because it must explain why it doesn't actually catch post-route errors.
- **Pull complexity downward.** The wrapper eats the redaction logic so route authors never face the prod-vs-dev decision. This is the principle by name. Middleware would push the same decision back up into every route (since middleware can't catch the throws anyway).
- **Strangler-fig fit.** F-08 onward wraps routes one at a time with a one-line diff. The HOF migrates incrementally, matching ADR-0003. Middleware would change error handling for all 88 routes the day it ships — strictly worse for a migration that explicitly prefers small steps.

---

## 3. File-by-file changes

### New files (8)

| Path | Purpose |
|---|---|
| `lib/errors/AppError.ts` | Base class. `name`, `message`, `cause?`, `context?`, `httpStatus`, `code`, `toJSON()`. |
| `lib/errors/NotFoundError.ts` | `extends AppError`. `httpStatus = 404`, `code = 'NOT_FOUND'`. |
| `lib/errors/ConflictError.ts` | `extends AppError`. `httpStatus = 409`, `code = 'CONFLICT'`. |
| `lib/errors/ValidationError.ts` | `extends AppError`. `httpStatus = 400`, `code = 'VALIDATION_ERROR'`. Carries `fields: Record<string, string[]>`. |
| `lib/errors/ServiceError.ts` | `extends AppError`. `httpStatus = 500`, `code = 'SERVICE_ERROR'`. Catch-all; carries `cause`. |
| `lib/errors/withErrors.ts` | Framework-level HOF. Wraps a route handler. Translates `AppError` → JSON Response. Unknown errors → 500 with safe body, original logged. |
| `lib/errors/index.ts` | Barrel re-export of all five classes + `withErrors` + `ErrorBody` type. |
| `tests/unit/errors/AppError.test.ts` | Unit spec for `AppError` (base). |
| `tests/unit/errors/NotFoundError.test.ts` | Unit spec for `NotFoundError`. |
| `tests/unit/errors/ConflictError.test.ts` | Unit spec for `ConflictError`. |
| `tests/unit/errors/ValidationError.test.ts` | Unit spec for `ValidationError` (with field-level details). |
| `tests/unit/errors/ServiceError.test.ts` | Unit spec for `ServiceError` (with `cause` propagation). |
| `tests/integration/withErrors.test.ts` | Integration spec for the HOF — invokes wrapped handlers and asserts Response shape. |

(The 8 above are file rows; the table lists each test file as its own row, so the total reads slightly higher — for clarity: 7 new source files in `lib/errors/`, 5 new unit test files in `tests/unit/errors/`, 1 new integration test file in `tests/integration/`.)

### Modified files (0)

None. F-FND-02 is purely additive. No package.json edits — vitest is already installed.

### `lib/errors/AppError.ts` — code skeleton

```ts
/**
 * lib/errors/AppError.ts
 *
 * Base typed-error class for the application core.
 *
 * Subclasses encode the HTTP status code as a static class property,
 * so callers never have to decide "what status does this map to?" —
 * that's the class's job. The HOF handler reads `httpStatus` + `code`
 * directly from the instance.
 *
 * Production safety: toJSON() strips `cause` and stack traces when
 * NODE_ENV === 'production'. Dev mode keeps them for debugging.
 *
 * Design references:
 *   APOSD principle #11 (define errors out of existence) — class
 *     carries status, so callers don't repeat the mapping.
 *   APOSD principle #10 (pull complexity downward) — redaction logic
 *     lives once here, not in every route.
 *
 * ES2017 caveat: target predates the Error.cause constructor option.
 * We assign `this.cause` ourselves rather than `super(message, { cause })`.
 */
export interface ErrorBody {
  code:     string
  message:  string
  context?: Record<string, unknown>
  cause?:   unknown   // dev mode only
  stack?:   string    // dev mode only
}

export abstract class AppError extends Error {
  abstract readonly httpStatus: number
  abstract readonly code:       string
  readonly context?: Record<string, unknown>

  constructor(
    message: string,
    options?: { cause?: unknown; context?: Record<string, unknown> }
  ) {
    super(message)
    this.name = this.constructor.name
    if (options?.cause !== undefined) {
      // ES2017 target: assign explicitly. Newer runtimes that support
      // the { cause } option will see the field populated identically.
      (this as { cause?: unknown }).cause = options.cause
    }
    if (options?.context !== undefined) {
      (this as { context?: Record<string, unknown> }).context = options.context
    }
  }

  toJSON(): ErrorBody {
    const body: ErrorBody = {
      code:    this.code,
      message: this.message,
    }
    if (this.context !== undefined) body.context = this.context

    // Production safety: never leak cause/stack to client.
    if (process.env.NODE_ENV !== 'production') {
      if ((this as { cause?: unknown }).cause !== undefined) {
        body.cause = serialiseCause((this as { cause?: unknown }).cause)
      }
      if (this.stack !== undefined) body.stack = this.stack
    }
    return body
  }
}

function serialiseCause(cause: unknown): unknown {
  if (cause instanceof Error) {
    return { name: cause.name, message: cause.message, stack: cause.stack }
  }
  return cause
}
```

### `lib/errors/NotFoundError.ts` — skeleton

```ts
import { AppError } from './AppError'

export class NotFoundError extends AppError {
  readonly httpStatus = 404
  readonly code       = 'NOT_FOUND'
}
```

### `lib/errors/ConflictError.ts` — skeleton

```ts
import { AppError } from './AppError'

export class ConflictError extends AppError {
  readonly httpStatus = 409
  readonly code       = 'CONFLICT'
}
```

### `lib/errors/ValidationError.ts` — skeleton

```ts
import { AppError, type ErrorBody } from './AppError'

export interface ValidationErrorBody extends ErrorBody {
  fields: Record<string, string[]>
}

export class ValidationError extends AppError {
  readonly httpStatus = 400
  readonly code       = 'VALIDATION_ERROR'
  readonly fields:    Record<string, string[]>

  constructor(
    message: string,
    fields: Record<string, string[]>,
    options?: { cause?: unknown; context?: Record<string, unknown> }
  ) {
    super(message, options)
    this.fields = fields
  }

  toJSON(): ValidationErrorBody {
    return { ...super.toJSON(), fields: this.fields }
  }
}
```

### `lib/errors/ServiceError.ts` — skeleton

```ts
import { AppError } from './AppError'

export class ServiceError extends AppError {
  readonly httpStatus = 500
  readonly code       = 'SERVICE_ERROR'
}
```

### `lib/errors/withErrors.ts` — skeleton

```ts
/**
 * lib/errors/withErrors.ts
 *
 * Higher-Order-Function wrapper for Next.js App Router route handlers.
 *
 * Wraps a route handler. Translates any thrown AppError into the matching
 * HTTP status + JSON body. Unknown errors (plain Error, non-AppError
 * throws) become 500 with a safe message; the original is logged so
 * debugging remains possible.
 *
 * Production safety: toJSON() on AppError already strips cause/stack.
 * For unknown errors, the wrapper returns only a generic message
 * ('Internal Server Error') and never the underlying err.message.
 *
 * Usage:
 *   export const POST = withErrors(async (req: NextRequest) => {
 *     const order = await OrdersService.create(...)   // may throw
 *     return NextResponse.json({ order }, { status: 201 })
 *   })
 *
 * F-FND-02 ships the wrapper. F-08 (Orders) is the first PR to apply it.
 */
import { NextRequest, NextResponse } from 'next/server'
import { AppError } from './AppError'

type RouteHandler<Args extends unknown[] = []> = (
  req: NextRequest,
  ...rest: Args
) => Promise<Response>

export function withErrors<Args extends unknown[]>(
  handler: RouteHandler<Args>
): RouteHandler<Args> {
  return async (req: NextRequest, ...rest: Args): Promise<Response> => {
    try {
      return await handler(req, ...rest)
    } catch (err) {
      if (err instanceof AppError) {
        return NextResponse.json(err.toJSON(), { status: err.httpStatus })
      }
      // Unknown error — log original, return safe 500.
      console.error('[withErrors] unknown error', err)
      const safeBody = {
        code:    'INTERNAL_ERROR',
        message: 'Internal Server Error',
      }
      return NextResponse.json(safeBody, { status: 500 })
    }
  }
}
```

### `lib/errors/index.ts` — barrel

```ts
export { AppError, type ErrorBody } from './AppError'
export { NotFoundError }            from './NotFoundError'
export { ConflictError }            from './ConflictError'
export { ValidationError, type ValidationErrorBody } from './ValidationError'
export { ServiceError }             from './ServiceError'
export { withErrors }               from './withErrors'
```

### Test files — case list (not bodies)

**`tests/unit/errors/AppError.test.ts`** — exercises the abstract base via a tiny in-file `TestError extends AppError` (the base is `abstract`):
- constructs with message only
- constructs with `{ cause }` and `{ context }`
- `name` equals the subclass constructor name
- `toJSON()` returns `{ code, message }` minimum
- `toJSON()` includes `context` when present
- `toJSON()` includes `cause` and `stack` when `NODE_ENV !== 'production'`
- `toJSON()` strips `cause` and `stack` when `NODE_ENV === 'production'` (test sets `process.env.NODE_ENV = 'production'` for the case and restores in `afterEach`)
- `cause` propagation: an `Error` passed as `cause` is readable as `instance.cause` (matches Error.cause semantics)

**`tests/unit/errors/NotFoundError.test.ts`**
- `httpStatus === 404`, `code === 'NOT_FOUND'`
- `name === 'NotFoundError'`
- `toJSON()` shape matches the documented body (code + message)
- production-mode redaction (cause stripped)
- accepts `context` and surfaces it in `toJSON()`

**`tests/unit/errors/ConflictError.test.ts`** — same five cases as NotFoundError, asserting 409 / `CONFLICT`.

**`tests/unit/errors/ValidationError.test.ts`**
- `httpStatus === 400`, `code === 'VALIDATION_ERROR'`
- `name === 'ValidationError'`
- `toJSON()` body includes `fields` map
- `fields` map preserves shape across construction → toJSON
- `toJSON()` keeps `fields` even in production mode (fields are not sensitive — they're the *point* of the error and the client needs them)
- production-mode strips `cause` and `stack` but keeps `fields`

**`tests/unit/errors/ServiceError.test.ts`**
- `httpStatus === 500`, `code === 'SERVICE_ERROR'`
- `name === 'ServiceError'`
- `cause` propagation — `new ServiceError('x', { cause: originalErr })` → `instance.cause === originalErr`
- `toJSON()` includes serialised cause in dev mode
- `toJSON()` strips cause in production mode (non-negotiable per the locked spec)

**`tests/integration/withErrors.test.ts`** — exercises the wrapper end-to-end with `NextRequest` / `Response` instances (no live HTTP, no DB):
- `NotFoundError` thrown → status 404, body `{ code: 'NOT_FOUND', message: ... }`
- `ConflictError` thrown → status 409
- `ValidationError` thrown → status 400, body includes `fields` map
- `ServiceError` thrown → status 500, body `{ code: 'SERVICE_ERROR', message: ... }`
- Plain `Error` (non-`AppError`) thrown → status 500, body `{ code: 'INTERNAL_ERROR', message: 'Internal Server Error' }`; original error logged (asserted via `vi.spyOn(console, 'error')`)
- Throwing a non-Error literal (`throw 'bad string'`) → still 500 with safe body
- Production mode (`process.env.NODE_ENV = 'production'`) — `cause` and `stack` absent from response body even when present on the thrown error
- Handler returns successfully → wrapper passes the `Response` through unchanged (no extra wrapping)
- Wrapper preserves the route handler's TypeScript signature (compile-time assertion via a tiny type-level check)
- **Integration suite caveat:** the existing `vitest.integration.config.ts` is set up for Supabase-touching tests with `_loadEnv.ts`. The withErrors integration test does NOT need a database — it only exercises `Request` → `Response` flow. The test file lives under `tests/integration/` because it touches the framework boundary (HOF wrapping a `NextRequest`-typed handler), not because it needs DB fixtures. **No env file needed.** If the existing `_loadEnv.ts` setup file fails when `.env.test.local` is absent, the integration test asserts gracefully (the loader is wrapped in dotenv's silent mode). Implementer to verify in step 9; if it blocks, plan B is to move the integration test under `tests/unit/errors/withErrors.test.ts` (the underlying assertions don't need integration-suite serialisation). Flagged for Gate 2.

---

## 4. Implementation steps (ordered)

1. **Cut the branch.** `git checkout -b forge/f-fnd-02-typed-errors` off `main` HEAD `4d1df22`.
2. **Confirm vitest works on a clean tree.** `npm test` → must exit 0 against the 28 existing unit suites. If it does not (pre-existing breakage), STOP and report to conductor — this PR does not fix orthogonal test rot.
3. **Create `lib/errors/AppError.ts`** per section 3 skeleton. Interface comment FIRST (APOSD §6) — the doc comment in the skeleton above is the design tool; it lands before the class body.
4. **Create the four subclass files** — `NotFoundError.ts`, `ConflictError.ts`, `ValidationError.ts`, `ServiceError.ts`. Order: simple subclasses first (NotFound, Conflict, Service), then `ValidationError` (the one with extra `fields` shape).
5. **Create `lib/errors/withErrors.ts`** per section 3 skeleton.
6. **Create `lib/errors/index.ts`** — barrel exports.
7. **Create the five unit test files** under `tests/unit/errors/`. One spec per error class. Test file headers mirror the project style (header comment, `import { describe, it, expect } from 'vitest'`).
8. **Create `tests/integration/withErrors.test.ts`** with the case list in section 3.
9. **Run `npm test`** locally — must exit 0. All five new unit suites pass alongside the existing 28.
10. **Run `npm run test:integration`** locally — must exit 0. If the existing `_loadEnv.ts` setup throws on a missing `.env.test.local`, fall back to plan B (move the integration test to `tests/unit/errors/withErrors.test.ts` and re-run `npm test`). Document the chosen path in the commit body.
11. **Run `npm run lint`** locally — `next lint` must exit 0. Fix any rule violations (none expected; the code is conventional).
12. **Run `npx tsc --noEmit`** locally — must exit 0. The whole project compiles clean with the new module added.
13. **Run `npm run build`** locally — Next.js build smoke. Must exit 0. Confirms the new module doesn't break the App Router build graph (it should not — it's pure TypeScript).
14. **Single commit** with conventional message: `feat(errors): typed error contract + framework handler (F-FND-02)`. Body lists: 7 new source files in `lib/errors/`, 5 new unit specs, 1 integration spec (or unit if step 10 fell back), zero modified files, ANVIL gate results (test pass count, tsc clean, lint clean, build clean), and the Design-It-Twice outcome (HOF chosen; middleware rejected — see section 2).
15. **Push the branch.** `git push -u origin forge/f-fnd-02-typed-errors`.
16. **Open PR to `main`** via `gh pr create`. Title: `feat(errors): typed error contract + framework handler (F-FND-02)`. Body references unit `F-FND-02` and links `docs/architecture-review-2026-06-06.md` Phase 0a + ADR-0002.

---

## 5. ANVIL strategy

Pre-ship gates, all run locally (no CI configured — same situation as F-FND-01). Pasted output goes into the PR body so the reviewer has evidence.

1. **`npm test`** — must exit 0. Expected: 28 existing suites pass + 5 new error-class suites pass = 33 unit suites. Coverage of the locked spec is total: every error class is tested for construction, name, status, code, toJSON shape, prod-mode redaction, cause propagation.
2. **`npm run test:integration`** — must exit 0 with the new `withErrors.test.ts` included. If `_loadEnv.ts` blocks on missing env (step 10's plan B), the integration test runs under `npm test` instead and this gate is recorded as N/A in the commit body. (Flagged at Gate 2.)
3. **`npm run lint`** — `next lint` exits 0.
4. **`npx tsc --noEmit`** — exits 0 on the full project tree (strict mode on, ES2017 target).
5. **`npm run build`** — `next build` exits 0. Confirms the new module participates cleanly in the production build graph.

No E2E gate (Playwright) for this PR — no UI surface changes.

---

## 6. Risks and open questions

1. **ES2017 target + `Error.cause`.** The project's `tsconfig.json` targets ES2017, which predates the `Error.cause` constructor option (ES2022). The plan assigns `this.cause` explicitly rather than using `super(message, { cause })`. This works under TypeScript with `strict` on (the field is typed via the assignment expression), but it means the `cause` field is technically not in the TypeScript Error type until ES2022 lib. **Mitigation:** test `cause` propagation explicitly (it works at runtime regardless of target — `Error.cause` is on the prototype chain in Node 18+, which this project uses). If TS complains, the cast `(this as { cause?: unknown }).cause = options.cause` in the skeleton documents the workaround. Flagged for Gate 2 review.
2. **Integration suite env loader.** `tests/integration/_loadEnv.ts` is auto-applied by `vitest.integration.config.ts` and reads `.env.test.local` (which is gitignored and absent on a clean clone). If the loader hard-fails on a missing file, step 10's plan B kicks in. **Decision needed at Gate 2:** is plan B (move integration test to `tests/unit/`) acceptable, or should F-FND-02 also touch `_loadEnv.ts` to make it tolerate missing env? The latter expands scope; the former is purely additive. Recommend plan B; surface the decision.
3. **`withErrors` as the ONLY error-handler form factor.** Decision documented in section 2. If the conductor disagrees and prefers middleware (or both), the plan needs revision before implementation. **Surface at Gate 2.**
4. **No lint rule yet forbidding `try/catch` around domain errors.** The locked spec explicitly says this is a separate work unit. Routes shipping F-08 onward will be reviewed by eye until the lint rule lands; new routes that still wrap `withErrors`'d handlers in their own try/catch defeat the contract. The PR body for F-FND-02 should call this out for downstream PRs.
5. **`AppError` is abstract — vitest can't instantiate it directly.** The base-class test file (`AppError.test.ts`) declares a tiny `class TestError extends AppError { httpStatus = 599; code = 'TEST' }` inside the spec to exercise the base behaviour. This is a standard pattern and matches the existing style in the project's vitest suites (mirror-the-logic-in-the-test, see `rateLimiter.test.ts`).
6. **Static `code` collision risk.** Each subclass picks a unique `code` (`NOT_FOUND`, `CONFLICT`, `VALIDATION_ERROR`, `SERVICE_ERROR`). Future error classes (added in later work units) must not collide. The plan documents the four codes; the test files assert exact strings so accidental renames are caught.
7. **`process.env.NODE_ENV` read at call time, not module load.** `toJSON()` reads `process.env.NODE_ENV` every call. This is deliberate — vitest tests can mutate `process.env.NODE_ENV` and re-call `toJSON()` to assert prod-mode behaviour without module-cache games. Performance impact is negligible (one env lookup per error response). Flagged so the reviewer doesn't "optimise" it to a module-load constant.
8. **Logger choice.** The wrapper uses `console.error` for unknown-error logging. F-FND-03 will replace this with structured logging via the observability scaffolding (Caller context + correlation IDs). Until then, `console.error` is the bridge — explicitly called out in the wrapper's doc comment so reviewers don't mistake it for an oversight.

---

## 7. Out of scope (DO NOT touch in this PR)

- **Route migrations.** Zero routes change in F-FND-02. F-08 (Orders) is the first PR to wrap routes in `withErrors`. The locked spec is explicit.
- **F-FND-03** — observability scaffolding (`lib/observability/`, `Caller` context, correlation IDs). The withErrors handler uses `console.error` as a stub; F-FND-03 replaces it.
- **F-01..F-04** — Phase 0 refactors (consolidate inline Supabase clients, road-times.ts, requireRole helper, ESLint Supabase boundary guard).
- **Lint rule forbidding `try/catch` around domain errors** in route files. Separate, later work unit. Today it's a review discipline only.
- **Integration with existing routes' string-shaped error payloads.** The old routes will continue returning `{ error: 'string' }` until F-08 onward migrates them.
- **CI workflow** — `.github/workflows/` still empty. Local-only ANVIL gates this round, as with F-FND-01.
- **Bumping `tsconfig.json target` to ES2022** to get native `Error.cause` constructor support. Out of scope; risk #1 documents the ES2017 workaround.
- **Editing any existing `lib/` file.** F-FND-02 is purely additive; no migration of existing modules.
