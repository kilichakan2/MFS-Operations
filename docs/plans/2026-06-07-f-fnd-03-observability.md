# F-FND-03 — Observability scaffolding (Caller context + correlation IDs + structured log)

## Goal
F-FND-03 ships the third Phase 0a foundation: a small `lib/observability/` module that establishes a `Caller` context (`{ userId, role, correlationId }`) per request, threads it across async boundaries via `AsyncLocalStorage`, and exposes a minimal structured (JSON-line) logger that picks the context up automatically. The HOF `withRequestContext` reads `x-request-id` from the incoming request (or generates a short random ID), derives the caller from the existing middleware-injected `x-mfs-*` headers, and runs the wrapped handler inside the context. The single 1-line edit in `lib/errors/withErrors.ts` swaps the `console.error` stub for the new logger — F-FND-02's 🔵 advisory ("`console.error` is the bridge — F-FND-03 replaces it") is satisfied. **Zero route migrations** — F-08 (Orders) is the first PR to actually wrap routes with `withRequestContext`. F-FND-03 is the scaffolding plus the one-line wire-up plus the tests that prove it.

## Source spec
- Architecture review v1.2: `docs/architecture-review-2026-06-06.md` Phase 0a unit **F-FND-03** (line 304) and the cross-cutting subsection **"Observability across the seam"** (lines 282–285) which states the correlation-ID threading philosophy: *"Every adapter call instrumented with a correlation ID established at the driving-adapter layer (HTTP middleware reads `x-request-id` or generates one), threaded into the `Caller` context, passed into every port call, attached to every log line and Sentry event."*
- ADR-0002 (`docs/adr/0002-hexagonal-shape-and-naming.md`): the depth rule (line 25), the dependency rule (line 21 — `@sentry/*` is not on the controlled list, but the same biology applies: vendor SDKs sit behind adapter boundaries), and the application-core placement of cross-cutting concerns (line 17).
- ADR-0002 References section explicitly cites APOSD principles: *information hiding* (section 4), *deep modules* (section 3), *pull complexity downward* (principle #10), *define errors out of existence* (principle #11), *design it twice* (principle #12). Reference at `~/.claude/skills/saas-consultant/references/aposd-principles.md`.
- F-FND-02 plan (`docs/plans/2026-06-06-f-fnd-02-typed-errors.md`) section 6 risk #8 — the explicit handoff: *"`console.error` is the bridge — F-FND-03 replaces it."* That is the precise 1-line edit shipped here.
- Locked-decisions session (the conductor) — Gate 1 spec frozen; no clarifications taken in planner.

## Compliance
**NO** runtime compliance impact. Zero route migrations; zero `app/api/**/route.ts` edits; zero changes to auth, payments, HACCP, RLS policies, financial logic, document control, food-safety legislation. The module respects hexagonal cross-cutting placement — `lib/observability/` is application-core scaffolding (peer of `lib/errors/`), not an adapter, because logging is a domain-neutral cross-cutting concern. ADR-0002 depth rule observed: `withRequestContext` is one identifier hiding the entire correlation-ID-derivation + caller-extraction + ALS-binding chain. ADR-0002 dependency rule observed: zero new runtime dependencies — `node:async_hooks` and `node:crypto` are Node built-ins and ship with the runtime the project already targets. APOSD lenses applied by name in section 2.

## Branch + base
- Base: `main` HEAD `631209d` (the v1.2 roadmap commit — `docs(roadmap): add Phase 0b (test infra) + tech debt cleanup track (v1.2)`). Verified via `git rev-parse origin/main`.
- Branch: `forge/f-fnd-03-observability`.
- PR opened to `main`, **not merged** — Hakan ships via `/ship` after gates pass, as with F-FND-01 and F-FND-02.

---

## 1. Repo recon findings

Captured before writing the plan; the plan reflects what's actually on `main` HEAD `631209d`.

1. **Sentry state — NOT PRESENT.** `package.json` has no `@sentry/nextjs`, `@sentry/node`, `@sentry/react`, or `@sentry/browser`. Repo root has no `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, or `instrumentation.ts`. Per locked spec: **no Sentry work in this PR.** The logger is designed with a pluggable sink so Sentry integration is a future one-file change, but the module ships with a single `console.*` sink.
2. **`Role` type — NOT PRESENT as a named TypeScript type.** `grep -rn "type Role\|enum Role" lib/ app/ types/` returns zero hits. Roles live as **inline string literals** across the codebase:
   - `middleware.ts:32` — `ROLE_PERMISSIONS: Record<string, string[]>` with keys `warehouse | office | sales | admin | driver | butcher`.
   - `middleware.ts:42` — `ROLE_HOME: Record<string, string>` same six keys.
   - `app/api/auth/login/route.ts:68` — `ROLE_ROUTES: Record<string, string>` (subset, omits butcher).
   - `app/api/auth/login/route.ts:175` — `secondary_roles` typed as `string[] | null` from Supabase.
   - `app/api/screen3/today/route.ts:42` — `role = req.headers.get('x-mfs-user-role') ?? 'sales'` — raw string.
   - **Decision (within plan scope):** define a minimal `Role` type **inside `lib/observability/Caller.ts`** as a union of the six known literals (`'warehouse' | 'office' | 'sales' | 'admin' | 'driver' | 'butcher'`), re-exported from the barrel. This is the smallest scope-respecting move — the type is used only by `Caller` for now; later units (F-03 `requireRole`, F-13 `AuthSession` port) will canonicalise it in `lib/domain/Role.ts` and `lib/observability/Caller.ts` will re-import from there. **Flagged at Gate 2 as the only minor scope addition the spec implies (the spec says "Role type imported from wherever the project defines it" — it isn't defined anywhere, so we define it minimally here).**
3. **Auth / caller derivation — middleware injects request headers, every route reads them.** `middleware.ts:141–145` writes `x-mfs-user-id`, `x-mfs-user-name`, `x-mfs-user-role`, `x-mfs-secondary-roles` from the parsed `mfs_session` cookie onto the forwarded `requestHeaders`. The source of truth is the **`mfs_session` cookie** (HTTP-only JSON: `{ userId, name, role, secondaryRoles[] }`). Routes read via `req.headers.get('x-mfs-user-id')` etc. — counted **104 such header reads across `app/api/`**. The plan reuses this exact mechanism: `withRequestContext` reads the same `x-mfs-user-id` and `x-mfs-user-role` headers and builds a `Caller` from them. **No cookie parsing in the HOF** — middleware already did that work; duplicating it here would be temporal decomposition (APOSD §4 leakage). Public-path requests (login, KDS kiosk, cron, service worker, etc. — listed in `middleware.ts:29`) reach routes without these headers; the HOF treats missing headers as `userId: null, role: null` (unauthenticated caller, correlation ID still flows).
4. **Existing correlation-ID work — NONE.** `grep -rn "x-request-id\|correlationId\|requestId\|traceId" lib/ app/ middleware.ts` returns zero hits. There is no upstream ID set anywhere. The HOF therefore both reads the header (if some future reverse-proxy or load-balancer adds one) AND generates one when absent. Header name normalised to `x-request-id` (de-facto industry convention; matches Vercel and most CDNs). Generated IDs are short — 16 hex chars (8 random bytes via `crypto.randomBytes`) — long enough to avoid collisions in normal log volume, short enough to be greppable.
5. **AsyncLocalStorage usage — NONE.** `grep -rn "AsyncLocalStorage\|async_hooks" lib/ app/ middleware.ts` returns zero hits. F-FND-03 is the first use. Standard Node API; no new dependency.
6. **Node version + runtime config.** `package.json` has **no `engines` field** (devbox is on Node 24.12.0 per `node --version`; Vercel's default for Next.js 15 is Node 20+). `next.config.ts` has no global `runtime` override. Individual route handlers do not declare `export const runtime = 'edge'` anywhere (`grep -rn "runtime" app/api/` returns zero edge declarations). **AsyncLocalStorage is safe on all current execution paths** — Next.js Node runtime supports it natively from Node 13.10 onward and the project sits well above that. Plan documents the Edge-runtime limitation in the module's interface comment per the locked spec; Edge support is explicitly deferred to a future unit. (For belt-and-braces, the `withRequestContext` interface comment also instructs route authors not to mark routes `export const runtime = 'edge'` while the HOF is in use; a future ESLint rule could enforce this.)
7. **Logger conventions today.** `grep -rn "console\." lib/ app/api/` returns **340 hits** (rough — includes string matches inside comments). Most are `console.log` debug breadcrumbs (e.g. `app/api/auth/login/route.ts:59, 124, 141, 153, 171, 263`) and `console.error` failure logs. None of them are structured. F-FND-03 does **not migrate any of these** — it only provides the replacement and wires the one stub in `withErrors.ts`. The 340-hit baseline is documented here so the next units (and any future "drain the swamp" PR) know the starting line.
8. **`lib/errors/withErrors.ts` current state — the 1-line edit precisely identified.** File read end-to-end. The single relevant line is **line 58**:
   ```ts
   console.error('[withErrors] unknown error', err)
   ```
   The 1-line edit replaces this with the new logger call (using the existing `Caller` context, which `withRequestContext` will have established for the request). The exact form is shown in section 3 below. The wrapper's header doc comment (lines 27–29) already declares F-FND-03 will perform this replacement — that comment becomes truthful when this PR lands.
9. **Existing `lib/errors/` shape (F-FND-02 baseline).** Confirms the pattern this plan mirrors:
   ```
   lib/errors/{AppError,NotFoundError,ConflictError,ValidationError,ServiceError,withErrors,index}.ts
   tests/unit/errors/{AppError,NotFoundError,ConflictError,ValidationError,ServiceError}.test.ts
   tests/integration/withErrors.test.ts
   ```
   F-FND-03 mirrors this exactly: source files under `lib/observability/`, unit tests under `tests/unit/observability/`, one integration test under `tests/integration/`. Same conventions, same naming, same testing style.
10. **Plan filename convention.** Mirrors `docs/plans/2026-06-06-f-fnd-02-typed-errors.md` (heading structure: Goal → Source spec → Compliance → Branch + base → numbered sections → Risks → Out of scope). Filename uses today's date (the spec specifies `2026-06-07-f-fnd-03-observability.md`).
11. **Commit convention.** F-FND-01 → `docs(adr):`, F-FND-02 → `feat(errors):`. F-FND-03 → `feat(observability): Caller context + correlation IDs + structured log (F-FND-03)`.
12. **Co-author trailer.** Matches F-FND-02 exactly: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
13. **TypeScript config.** `tsconfig.json` is `target: ES2017`, `lib: [dom, dom.iterable, esnext]`, `strict: true`, `moduleResolution: bundler`, path alias `@/* → ./*`. The `lib: esnext` line means `crypto` and `async_hooks` type declarations are available via `@types/node` (already in `devDependencies` at `^20`). No new types packages needed.
14. **Test infra.** `vitest.config.ts` (unit, `tests/unit/**/*.test.ts`, `globals: true`, `environment: 'node'`) and `vitest.integration.config.ts` (integration, single-fork serial) both already present and known good. F-FND-02 has 5 unit + 1 integration spec under the same layout — F-FND-03 reuses verbatim.
15. **Integration env loader.** `tests/integration/_loadEnv.ts` uses `dotenv` and silently no-ops if `.env.test.local` is absent — F-FND-02's integration test runs fine without env. F-FND-03's integration test (`withRequestContext + withErrors`) is the same shape: no DB, no live HTTP, only `NextRequest` + `Response` plumbing. No env needed.

---

## 2. Design-It-Twice analysis

The locked spec requires two genuinely different sketches for the **logger form factor**, with the dependency-justification rule (ADR-0002 line 21) explicitly weighed. The spec also asks for a brief note on **caller derivation** (cookie vs JWT). Both follow.

### 2a. Logger form factor

#### Option A — Thin custom logger

```ts
// lib/observability/log.ts
import { getCaller } from './context'

interface LogFields { [k: string]: unknown }

function emit(level: 'info' | 'warn' | 'error', msg: string, fields?: LogFields) {
  const caller = getCaller()
  const line = {
    level,
    msg,
    ts: new Date().toISOString(),
    ...(caller && {
      correlationId: caller.correlationId,
      userId:        caller.userId,
      role:          caller.role,
    }),
    ...fields,
  }
  const out = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  out(JSON.stringify(line))
}

export const log = {
  info:  (msg: string, fields?: LogFields) => emit('info',  msg, fields),
  warn:  (msg: string, fields?: LogFields) => emit('warn',  msg, fields),
  error: (msg: string, fields?: LogFields) => emit('error', msg, fields),
}
```

- ≈40 lines of TS. Zero new dependencies. Writes single-line JSON to stdout/stderr (Vercel ingests stdout natively, no extra plumbing).
- Reads the `Caller` from `AsyncLocalStorage` automatically — call sites never pass it in. Pulls complexity downward (APOSD #10): the logger eats the context lookup so route/service code stays simple.
- Pluggable sink for the future: trivial to add a `setSink(fn)` if/when Sentry lands. **Designed to be extended in one place**, not pulled apart.
- Deep module: interface is three names (`log.info/warn/error`), implementation hides JSON formatting + ALS lookup + sink dispatch.

#### Option B — `pino` (or `winston`)

- Established library, fast, big ecosystem of transports.
- Adds a runtime dependency (`pino` is ~1.5MB installed including `sonic-boom`; `pino-pretty` for dev is more). The serverless cold-start cost is real but small.
- Brings its own conventions for child loggers, levels, redaction, transports — the team has to learn them.
- Surface area is broad — most of it unused. Reading code becomes "what does `log.child({ requestId }).info(...)` do in pino?" instead of "what does our 40-line `log.ts` do?".

### Decision: **Option A — thin custom logger.**

Justification (APOSD + ADR-0002):

- **Dependency-justification rule (ADR-0002).** The architecture review's stance is unambiguous: vendor SDKs cost long-term, the bias is toward not adding them. Pino brings real value at high log volumes and in complex multi-process pipelines — this project is at neither point. The custom logger is ≈40 lines we own and can change in one file; pino is ≈40 lines we own *plus* a vendor surface to learn and version-pin.
- **Deep modules (APOSD §3).** Both options score similar depth at the *call site*. But the custom logger's *total* surface (interface + implementation that the team must read) is shorter than the README of pino. Less to learn for a smaller team.
- **Pull complexity downward (APOSD #10).** Both options support this; the custom one is the one we control. If a Sentry sink is added in a later PR, a five-line edit to `log.ts` does it. Adding the same to pino means picking + configuring a pino transport.
- **Design it twice (APOSD #12).** This *is* the second sketch. The bias to thin-custom is the right call **for this project** — small team, modest log volume, Vercel-native stdout. The bias would flip in a larger system with central log aggregation and many services.

The thin custom logger ships. If volume or operational sophistication grows, swapping in pino is a one-file edit later — the call sites use `log.info` etc., not the logger's internals. The seam exists in case the decision needs reversing.

### 2b. Caller derivation

Two options:

- **Cookie-read** (read `mfs_session` from `req.cookies` and parse JSON).
- **Read middleware-injected headers** (`x-mfs-user-id`, `x-mfs-user-role`, `x-mfs-secondary-roles`).

`middleware.ts:104–145` already parses the cookie, validates it, redirects on failure, and sets the headers on the forwarded request. **Re-parsing the cookie in `withRequestContext` would duplicate that work and split the auth-derivation rule across two files** — APOSD §4 information leakage. The HOF reads the headers. If the headers are absent (public path, unauthenticated kiosk request), the caller is `{ userId: null, role: null, correlationId: <generated> }` — observability still works on the unauthenticated path, which is the right answer (errors during login should still be traceable).

JWT-decoding is not on the table — there are no JWTs in this project. The session cookie is plain JSON. F-FND-03 simply trusts what middleware already validated.

---

## 3. File-by-file changes

### New files (10)

| Path | Purpose |
|---|---|
| `lib/observability/Caller.ts` | `Role` union (minimal local definition until F-13 promotes it). `Caller` interface — `{ userId: string \| null; role: Role \| null; correlationId: string }`. `makeCaller()` factory — pure data; no side effects. |
| `lib/observability/context.ts` | `AsyncLocalStorage<Caller>` singleton. `getCaller(): Caller \| undefined` accessor. `runWithCaller<T>(caller, fn): T` runner (thin wrapper around `als.run` — keeps the ALS instance private to the module). |
| `lib/observability/withRequestContext.ts` | HOF. Reads `x-request-id` or generates a short hex ID. Reads `x-mfs-user-id` / `x-mfs-user-role` headers (middleware-injected) — null if absent. Builds `Caller`. Runs `runWithCaller(caller, () => handler(req, ...))` so the handler and everything it awaits inside see the context. Echoes `x-request-id` back on the response (mutates outgoing `Response.headers` post-await). |
| `lib/observability/log.ts` | Thin custom logger per section 2a. Three methods (`info`, `warn`, `error`). Emits one JSON line per call to `console.log`/`warn`/`error`. Merges `Caller` fields from `getCaller()` if present. Sink-pluggable in a later PR (out of scope here). |
| `lib/observability/index.ts` | Barrel: `Caller`, `Role`, `makeCaller`, `getCaller`, `runWithCaller`, `withRequestContext`, `log`. |
| `tests/unit/observability/Caller.test.ts` | Unit spec — factory shape + nullability semantics. |
| `tests/unit/observability/context.test.ts` | Unit spec — `getCaller()` empty by default; `runWithCaller` binds and isolates per async chain; cross-async-boundary propagation (the load-bearing case). |
| `tests/unit/observability/withRequestContext.test.ts` | Unit spec — header read; ID generation when header absent; caller construction from `x-mfs-*` headers; null caller when middleware headers absent; echoed `x-request-id` on outgoing response. |
| `tests/unit/observability/log.test.ts` | Unit spec — JSON shape; Caller fields merged when context present; bare fields when context absent; level → console method routing. |
| `tests/integration/observability.test.ts` | Integration spec — `withRequestContext(withErrors(handler))` end-to-end. A handler that throws `ServiceError` produces a JSON-line `log.error(...)` carrying the `correlationId`, AND the outgoing response carries the same `correlationId` in `x-request-id`. Closes the F-FND-02 → F-FND-03 loop. |

### Modified files (1)

| Path | Edit |
|---|---|
| `lib/errors/withErrors.ts` | Replace **line 58** (`console.error('[withErrors] unknown error', err)`) with `log.error('[withErrors] unknown error', { error: serialiseError(err) })`. Add `import { log } from '@/lib/observability'` at the import block. Helper `serialiseError(err: unknown)` returns `{ name, message, stack }` for Error instances, raw value otherwise — small private helper at the bottom of the file. The header doc comment lines 27–29 (the "F-FND-03 will replace this" advisory) is updated to past tense or removed since the replacement now exists. |

### `lib/observability/Caller.ts` — skeleton

```ts
/**
 * lib/observability/Caller.ts
 *
 * The `Caller` is the small bundle of identity + correlation data that
 * threads through a single request, from the HTTP boundary into every
 * service/adapter call and onto every log line. It is intentionally
 * minimal — three fields, all immutable, all serialisable.
 *
 * Why `Role` is defined here (and not imported):
 *   The project doesn't yet have a canonical `Role` type — roles live
 *   as string literals in `middleware.ts` (ROLE_PERMISSIONS keys) and
 *   in route handlers (`req.headers.get('x-mfs-user-role')`). A minimal
 *   union is defined here so `Caller` is well-typed today. Unit F-13
 *   (Users + Auth) will canonicalise `Role` in `lib/domain/Role.ts`;
 *   this file will then re-import from there.
 *
 * APOSD lenses applied:
 *   - Information hiding (§4): the correlation-ID propagation rule is
 *     ONE decision encapsulated here + in context.ts + in
 *     withRequestContext.ts. Routes never deal with it.
 *   - Deep module (§3): `Caller` is one short type that the entire
 *     observability surface depends on. Small interface, large effect.
 */

export type Role =
  | 'warehouse'
  | 'office'
  | 'sales'
  | 'admin'
  | 'driver'
  | 'butcher'

export interface Caller {
  readonly userId:        string | null
  readonly role:          Role   | null
  readonly correlationId: string
}

export function makeCaller(input: {
  userId?:        string | null
  role?:          Role   | null
  correlationId:  string
}): Caller {
  return {
    userId:        input.userId        ?? null,
    role:          input.role          ?? null,
    correlationId: input.correlationId,
  }
}
```

### `lib/observability/context.ts` — skeleton

```ts
/**
 * lib/observability/context.ts
 *
 * AsyncLocalStorage-backed context store for the active `Caller`.
 *
 * RUNTIME REQUIREMENT: Node runtime ONLY. AsyncLocalStorage is not
 * available on the Edge runtime. Routes wrapped by withRequestContext
 * MUST NOT declare `export const runtime = 'edge'`. Edge support is
 * deferred to a future unit (the design would need a header-threaded
 * fallback or a Promise-chain runner).
 *
 * The ALS instance is module-private. Callers access state via the two
 * exported functions only — `runWithCaller` to set it, `getCaller` to
 * read it. This keeps the depth: callers never see the storage type.
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import type { Caller } from './Caller'

const als = new AsyncLocalStorage<Caller>()

export function getCaller(): Caller | undefined {
  return als.getStore()
}

export function runWithCaller<T>(caller: Caller, fn: () => T | Promise<T>): T | Promise<T> {
  return als.run(caller, fn)
}
```

### `lib/observability/withRequestContext.ts` — skeleton

```ts
/**
 * lib/observability/withRequestContext.ts
 *
 * Higher-Order-Function for Next.js App Router route handlers. Reads
 * (or generates) the correlation ID, builds the `Caller`, and runs
 * the wrapped handler inside the ALS context so every nested await
 * sees `getCaller()` non-undefined.
 *
 * Composition with withErrors:
 *   export const POST = withRequestContext(withErrors(async (req) => {
 *     return NextResponse.json({ ... })
 *   }))
 *   withRequestContext is the OUTER wrapper — the Caller must be
 *   established before withErrors logs anything via the new logger.
 *
 * Caller derivation: reads the `x-mfs-user-id` and `x-mfs-user-role`
 * headers set by middleware.ts. If absent (public paths, kiosk
 * requests, cron), the caller has null userId+role and the correlation
 * ID still flows. This is deliberate — observability should not require
 * authentication.
 *
 * Correlation ID:
 *   - reads `x-request-id` (case-insensitive) if present
 *   - else generates `crypto.randomBytes(8).toString('hex')` (16 chars)
 *   - echoes the chosen ID back on the response as `x-request-id`
 *
 * Runtime: Node only. See context.ts header.
 */

import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { makeCaller, type Role } from './Caller'
import { runWithCaller } from './context'

type RouteHandler<Args extends unknown[] = []> = (
  req: NextRequest,
  ...rest: Args
) => Promise<Response>

const KNOWN_ROLES: readonly Role[] = [
  'warehouse', 'office', 'sales', 'admin', 'driver', 'butcher',
]

function isKnownRole(v: string | null): v is Role {
  return v !== null && (KNOWN_ROLES as readonly string[]).includes(v)
}

function deriveCorrelationId(req: NextRequest): string {
  const hdr = req.headers.get('x-request-id')?.trim()
  if (hdr && hdr.length > 0 && hdr.length <= 128) return hdr
  return randomBytes(8).toString('hex')
}

export function withRequestContext<Args extends unknown[]>(
  handler: RouteHandler<Args>
): RouteHandler<Args> {
  return async (req: NextRequest, ...rest: Args): Promise<Response> => {
    const correlationId = deriveCorrelationId(req)
    const userId        = req.headers.get('x-mfs-user-id') || null
    const roleHdr       = req.headers.get('x-mfs-user-role')
    const role          = isKnownRole(roleHdr) ? roleHdr : null

    const caller = makeCaller({ userId, role, correlationId })

    const res = await runWithCaller(caller, () => handler(req, ...rest))
    // Echo correlation ID on outgoing response (idempotent: only set if absent).
    if (!res.headers.has('x-request-id')) {
      res.headers.set('x-request-id', correlationId)
    }
    return res
  }
}
```

### `lib/observability/log.ts` — skeleton

```ts
/**
 * lib/observability/log.ts
 *
 * Minimal structured logger. One JSON line per call to stdout/stderr.
 * Picks up `Caller` (userId, role, correlationId) from AsyncLocalStorage
 * if present — call sites never pass it in.
 *
 * Design rationale (see plan section 2a): thin custom logger preferred
 * over pino/winston per ADR-0002 dependency-justification rule. Pluggable
 * sink for a future Sentry integration is intentionally NOT shipped in
 * this PR — adding it later is a five-line edit when the need is real.
 *
 * Output shape (one line, JSON):
 *   {"level":"error","msg":"...","ts":"2026-06-07T...","correlationId":"...","userId":"...","role":"...","error":{...}}
 *
 * Levels: info | warn | error. Routed to console.log / console.warn /
 * console.error respectively (Vercel ingests all three from stdout/stderr).
 */

import { getCaller } from './context'

export interface LogFields { [k: string]: unknown }

type Level = 'info' | 'warn' | 'error'

const sinkFor: Record<Level, (line: string) => void> = {
  info:  (line) => { console.log(line)   },
  warn:  (line) => { console.warn(line)  },
  error: (line) => { console.error(line) },
}

function emit(level: Level, msg: string, fields?: LogFields): void {
  const caller = getCaller()
  const line: Record<string, unknown> = {
    level,
    msg,
    ts: new Date().toISOString(),
  }
  if (caller) {
    line.correlationId = caller.correlationId
    if (caller.userId !== null) line.userId = caller.userId
    if (caller.role   !== null) line.role   = caller.role
  }
  if (fields) Object.assign(line, fields)

  try {
    sinkFor[level](JSON.stringify(line))
  } catch {
    // Never let the logger throw. Fall back to a primitive console call.
    sinkFor[level](`${level}: ${msg}`)
  }
}

export const log = {
  info:  (msg: string, fields?: LogFields) => emit('info',  msg, fields),
  warn:  (msg: string, fields?: LogFields) => emit('warn',  msg, fields),
  error: (msg: string, fields?: LogFields) => emit('error', msg, fields),
}
```

### `lib/observability/index.ts` — barrel

```ts
export { type Caller, type Role, makeCaller } from './Caller'
export { getCaller, runWithCaller }           from './context'
export { withRequestContext }                 from './withRequestContext'
export { log, type LogFields }                from './log'
```

### `lib/errors/withErrors.ts` — the 1-line edit (in context)

Current `lib/errors/withErrors.ts:58`:

```ts
console.error('[withErrors] unknown error', err)
```

Becomes:

```ts
log.error('[withErrors] unknown error', { error: serialiseError(err) })
```

Plus, at the imports (lines 39–40):

```ts
import { NextRequest, NextResponse } from 'next/server'
import { AppError }                  from './AppError'
import { log }                       from '@/lib/observability'   // ← NEW
```

Plus, a small private helper at the bottom of the file:

```ts
function serialiseError(err: unknown): unknown {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack }
  }
  return err
}
```

And the header doc comment lines 27–29 (the "F-FND-03 will replace it" advisory) updates from:

```ts
* Logger: `console.error` is a stub. F-FND-03 (observability) replaces
* it with structured logging + correlation IDs. Do not "optimise" this
* to a no-op — the log line is the only diagnostic until F-FND-03.
```

…to:

```ts
* Logger: unknown errors are emitted via the structured logger from
* `lib/observability` — the log line carries the active `Caller`
* (userId, role, correlationId) automatically when withRequestContext
* has wrapped the route. Without withRequestContext, the line is
* still emitted but without correlationId.
```

### Test files — case list (not bodies)

**`tests/unit/observability/Caller.test.ts`**
- `makeCaller({ correlationId: 'x' })` returns `{ userId: null, role: null, correlationId: 'x' }`
- `makeCaller({ userId: 'u1', role: 'admin', correlationId: 'x' })` returns shape verbatim
- explicit `null` for userId/role survives the factory
- the returned object is frozen-equivalent (TS readonly enforced at compile time; runtime: shape stable)
- known roles compile (`'warehouse' | 'office' | 'sales' | 'admin' | 'driver' | 'butcher'`); unknown role is a TS error (compile-time assertion inside spec via `// @ts-expect-error`)

**`tests/unit/observability/context.test.ts`**
- `getCaller()` returns `undefined` when no context is active
- `runWithCaller(caller, () => getCaller())` returns the bound caller synchronously
- **Cross-async-boundary propagation (load-bearing case):** `runWithCaller(caller, async () => { await Promise.resolve(); return getCaller() })` resolves to the bound caller — proves ALS survives async/await boundaries (this is the entire reason for using ALS)
- nested `runWithCaller` re-binds the inner caller for the inner scope; outer caller restored after inner returns
- two parallel `runWithCaller` calls (Promise.all) keep their callers independent — no leakage between async chains

**`tests/unit/observability/withRequestContext.test.ts`**
- generates a 16-char hex correlation ID when no `x-request-id` header is present
- reuses the incoming `x-request-id` header when present
- rejects an empty or oversize header (`length > 128`) and generates instead
- derives `userId` from `x-mfs-user-id`; `null` when header absent
- derives `role` from `x-mfs-user-role`; `null` when header absent or value unknown
- the wrapped handler observes the caller via `getCaller()` (proves ALS binding works through the HOF)
- the outgoing response carries `x-request-id` matching the chosen correlation ID
- if the inner handler sets its own `x-request-id`, the HOF does not overwrite it (idempotency)
- preserves the route handler's TS signature (compile-time)

**`tests/unit/observability/log.test.ts`**
- `log.info('hi')` writes one JSON line to `console.log` (spied via `vi.spyOn`)
- the line parses as JSON and contains `level: 'info'`, `msg: 'hi'`, `ts: <ISO 8601>`
- with no active context, no `correlationId`/`userId`/`role` keys are present
- with an active context (test wraps the call in `runWithCaller(caller, () => log.info(...))`), all three keys appear with the bound values
- `log.warn` → `console.warn`; `log.error` → `console.error`
- extra `fields` argument is merged into the JSON line; collisions with reserved keys are preserved (caller-provided fields win — tested explicitly so consumers know the rule)
- the logger never throws — if `JSON.stringify` is monkey-patched to throw (test mocks it), a primitive fallback line is emitted

**`tests/integration/observability.test.ts`** — the F-FND-02 ↔ F-FND-03 loop
- A handler wrapped as `withRequestContext(withErrors(handler))`:
  - handler throws `new ServiceError('boom')` → response is HTTP 500 with `{ code: 'SERVICE_ERROR', message: 'boom' }` (preserves F-FND-02 contract)
  - response carries `x-request-id` header
  - **AND `console.error` was called with a JSON-line string that, when parsed, contains the `correlationId` matching the response's `x-request-id`** (this is the entire point of the unit — the correlation ID flows from request to response AND from request to log line)
- A handler that throws a plain `Error('whoops')`:
  - response is the same safe 500 from F-FND-02
  - the logged JSON line carries `error: { name: 'Error', message: 'whoops', stack: '...' }` and the correlation ID
- A request with an upstream `x-request-id: trace-abc-123`:
  - the response carries `x-request-id: trace-abc-123` (echoed, not regenerated)
  - the log line carries `correlationId: 'trace-abc-123'`
- An "authenticated" request (`x-mfs-user-id: u-1`, `x-mfs-user-role: admin`):
  - the log line carries `userId: 'u-1'`, `role: 'admin'`
- An unauthenticated request (no `x-mfs-*` headers):
  - the log line omits `userId` and `role` (cleanly — no `null` strings in JSON)
  - the correlation ID still flows

---

## 4. Implementation steps (ordered)

1. **Cut the branch.** `git checkout -b forge/f-fnd-03-observability` off `main` HEAD `631209d`.
2. **Confirm tests pass on a clean tree.** `npm test` exits 0; `npm run test:integration` exits 0 (F-FND-02's 33 unit + 1 integration suite — known baseline). If either fails, STOP and report — F-FND-03 does not fix orthogonal rot.
3. **Create `lib/observability/Caller.ts`** per section 3 skeleton. Doc comment first (APOSD §6). Includes the local `Role` union — the only minor scope addition the spec implies, flagged in recon finding 2.
4. **Create `lib/observability/context.ts`** per skeleton. ALS module-private; only `getCaller` + `runWithCaller` exported.
5. **Create `lib/observability/withRequestContext.ts`** per skeleton. Header doc states Node-runtime-only; future Edge support deferred.
6. **Create `lib/observability/log.ts`** per skeleton. Thin JSON-line logger; pluggable sink shape deliberately omitted (out of scope per locked spec — added the day a Sentry sink is needed).
7. **Create `lib/observability/index.ts`** — barrel exports.
8. **Edit `lib/errors/withErrors.ts`** — the 1-line swap on line 58, the new import, the `serialiseError` helper, the doc-comment update. Single tight edit; no other behaviour change.
9. **Create the four unit test files** under `tests/unit/observability/` — `Caller.test.ts`, `context.test.ts`, `withRequestContext.test.ts`, `log.test.ts` — with the case lists from section 3. Test file headers mirror project style.
10. **Create `tests/integration/observability.test.ts`** — the end-to-end loop test.
11. **Run `npm test`** locally — must exit 0. Expected: 33 existing F-FND-02 unit suites + 4 new observability unit suites = 37 unit suites.
12. **Run `npm run test:integration`** locally — must exit 0. Expected: existing F-FND-02 integration suite + new observability integration suite = 2 integration suites (plus the existing kds/orders-crud/picking-list suites if they currently pass).
13. **Run `npm run lint`** locally — `next lint` must exit 0. F-FND-03 code is conventional; no new violations expected.
14. **Run `npx tsc --noEmit`** locally — calibrated criterion (see section 5). Strict requirement: **zero new violations originating in F-FND-03 files** (greppable via `tsc` output line prefixes containing `lib/observability/` or `lib/errors/withErrors.ts`). The pre-existing ~60 errors elsewhere are not this PR's problem (F-TD-01 owns them).
15. **Run `npm run build`** locally — calibrated criterion (see section 5). Strict requirement: build doesn't introduce new failures attributable to F-FND-03 files. `next.config.ts` has `typescript.ignoreBuildErrors: true` and `eslint.ignoreDuringBuilds: true` so the build will compile through pre-existing rot.
16. **Single commit** with conventional message: `feat(observability): Caller context + correlation IDs + structured log (F-FND-03)`. Body lists: 5 new source files in `lib/observability/`, 1 modified file (`lib/errors/withErrors.ts` — line 58 + import + helper + doc update), 4 new unit specs, 1 new integration spec, ANVIL gate results (test pass counts, tsc/lint/build evidence per calibrated criteria), and the Design-It-Twice outcome (thin custom logger chosen; pino rejected — see section 2a).
17. **Push the branch.** `git push -u origin forge/f-fnd-03-observability`.
18. **Open PR to `main`** via `gh pr create`. Title: `feat(observability): Caller context + correlation IDs + structured log (F-FND-03)`. Body references unit `F-FND-03`, links `docs/architecture-review-2026-06-06.md` Phase 0a + "Observability across the seam" subsection, and notes the closed loop with F-FND-02 (the `console.error` stub is gone).

---

## 5. ANVIL strategy

Pre-ship gates, all run locally (no CI configured — same situation as F-FND-01 and F-FND-02). Pasted output goes into the PR body so the reviewer has evidence.

1. **`npm test`** — must exit 0. Expected: **37 unit suites pass** (33 existing F-FND-02 + 4 new observability). Coverage of the locked spec is total: every public surface (Caller, getCaller/runWithCaller, withRequestContext, log) has its own spec; cross-async-boundary propagation is asserted explicitly.

2. **`npm run test:integration`** — must exit 0 with the new `tests/integration/observability.test.ts` included. The end-to-end loop test is the single most important assertion in this PR: a correlation ID generated at the HOF flows both to the response headers AND to a log line emitted by `withErrors`. If this passes, the unit is functionally complete.

3. **`npm run lint`** — calibrated. The bar is **zero new violations in F-FND-03 files**. Verification: `npm run lint 2>&1 | grep -E "(lib/observability|lib/errors/withErrors\.ts)"` returns empty. Pre-existing nits elsewhere are F-TD-01 territory.

4. **`npx tsc --noEmit`** — calibrated. The bar is **zero new violations in F-FND-03 files**. Verification: `npx tsc --noEmit 2>&1 | grep -E "^(lib/observability|lib/errors/withErrors\.ts)" | wc -l` returns `0`. The pre-existing ~60 errors elsewhere are not this PR's responsibility.

5. **`npm run build`** — `next build` exits 0 (the project ignores TS+ESLint at build time per `next.config.ts`, so this is a smoke check that the route graph still works and Next compiles the new module). Confirms the new module participates cleanly in the production build graph.

No Playwright E2E gate for this PR — no UI surface changes.

The same grep methodology F-FND-02 used (per its plan section 5) is applied here to draw the calibrated/strict line.

---

## 6. Risks and open questions

1. **Minor scope addition: defining `Role` locally.** Recon finding 2 confirms no `Role` type exists in the project. The locked spec says "*Role type imported from wherever the project defines it (you discover during recon)*" — the discovery is "nowhere". Defining a minimal six-literal union in `lib/observability/Caller.ts` is the smallest scope-respecting move and is well within the spirit of the unit (observability needs to type the role field). **Flagged at Gate 2.** Alternative: ship `role` as `string | null` instead. The plan prefers the union (catches typos, documents the set in one place, makes future migration to `lib/domain/Role.ts` mechanical).
2. **AsyncLocalStorage on Edge runtime.** Not supported. Plan adds explicit guidance in the `context.ts` and `withRequestContext.ts` header comments; no runtime check is enforced because no current route uses Edge. A future `export const runtime = 'edge'` on a wrapped route would silently lose context — `getCaller()` would always return `undefined`, log lines would carry no correlation ID, but no exception. The risk is bounded (manifests as missing fields, not a crash) and documented. A lint rule banning Edge runtime in wrapped routes is **out of scope** for this PR; a candidate for a future tighten-the-screws unit alongside F-04/F-27.
3. **No Sentry integration.** Spec says skip if not configured; recon confirms not configured. The logger is shaped to accept a pluggable sink (the `sinkFor` map and the `emit` shape make it a five-line edit later), but the sink itself is intentionally not shipped. **Surface at Gate 2 if conductor wants the sink-pluggable interface exposed in this PR** (i.e. an exported `setSink(fn)` even though no sink is wired) — the plan currently keeps it private to honour YAGNI.
4. **`x-request-id` echoed but inner handler may pre-set it.** The HOF respects an inner-handler-set `x-request-id` (idempotent — only sets if absent). This is the safe choice — if a service is forwarding a request to a downstream service and wants to preserve its own ID convention, it can. Risk: an inner handler that mistakenly sets a stale ID overrides the active one, breaking the log/response correlation. Mitigation: documented in the HOF header comment; no current route does this; if it ever happens, the integration test would catch it the day a route actually pre-sets the header.
5. **`console.*` baseline of 340 hits is not migrated.** F-FND-03 only replaces the one `console.error` in `withErrors.ts` per the locked spec. The other 340 hits are untouched until later units choose to migrate (F-08 onward will naturally move route-level logging onto `log.*` as routes are rewritten). The PR body explicitly notes this so reviewers don't expect a sweeping cleanup.
6. **Test ergonomics for ALS.** Vitest's default isolation already separates test contexts. The `context.test.ts` spec uses `runWithCaller` to bind explicitly per test case; no `beforeEach` global binding is needed. The "parallel async chains stay isolated" test uses `Promise.all` with two `runWithCaller` calls — this is the canonical ALS sanity assertion and works in vitest's node environment.
7. **F-FND-02 integration test reads `console.error` to verify the unknown-error path.** That test (`tests/integration/withErrors.test.ts`) uses `vi.spyOn(console, 'error')` and asserts the spy was called. After F-FND-03's edit, the call is still `console.error(...)` — it's the JSON line from `log.error()` — so the spy still fires, but the **argument shape changes** from `('[withErrors] unknown error', err)` (two args) to `('<json line>',)` (one arg). The existing assertion needs adjustment. **Plan handles this in step 8** of section 4: the implementer updates the F-FND-02 integration test's spy assertion to match the new shape (the assertion should change from "spy was called" to "spy was called with a JSON line whose `msg` field is `'[withErrors] unknown error'`"). This is a 2-line test edit, not a scope expansion — it's a direct consequence of the 1-line `withErrors` edit and must ship in the same PR for the existing test to still pass.
8. **Pluggable-sink decision is deferred but the seam exists.** If the conductor wants the seam *exposed* in this PR (e.g. an exported `setSink` so a downstream PR can wire Sentry without re-editing `log.ts`), say so at Gate 2 and the plan grows by ~10 lines. Default is to keep the sink private until there's a real consumer (YAGNI).
9. **Cookie not re-parsed in HOF; relies on middleware injection.** A route that the matcher doesn't cover (e.g. a future route added without confirming `middleware.ts` config matcher catches it) would see no `x-mfs-*` headers and produce a null caller. Risk is low — the matcher `'/((?!_next/static|_next/image|favicon.ico).*)'` catches everything. Documented in the `withRequestContext.ts` header comment.

---

## 7. Out of scope (DO NOT touch in this PR)

- **Route migrations.** Zero routes change in F-FND-03. F-08 (Orders) is the first PR to wrap routes in `withRequestContext`. The locked spec is explicit.
- **F-01..F-04** — Phase 0 refactors (consolidate inline Supabase clients, road-times.ts, `requireRole` helper, ESLint Supabase boundary guard).
- **F-INFRA-01** — Supabase CLI local stack + Playwright API/UI scaffolding. Lands separately before Phase 1.
- **F-TD-01** — tech-debt cleanup (~60 pre-existing tsc errors + ESLint nits). Owned by its own side-track unit; F-FND-03 uses the same calibrated-pass-criteria F-FND-02 established.
- **Wiring observability into any route** (F-08 onward).
- **Setting up Sentry from scratch.** Spec says skip; the logger ships with no Sentry call sites.
- **Edge runtime support** for `withRequestContext` / `log`. Node-only by design; documented in module headers.
- **Cosmetic `AppError.test.ts` improvement** still pending from F-FND-02 — separate work.
- **Migrating any of the 340 `console.*` calls** outside the one in `withErrors.ts`. Future units (or a dedicated cleanup PR) handle the rest.
- **CI workflow** — `.github/workflows/` still empty. Local-only ANVIL gates this round, as with F-FND-01 and F-FND-02.
- **Exporting a `setSink` API on the logger.** Pluggable-sink seam is internal; exposing it is deferred to the unit that adds the first non-`console` sink.
- **Bumping `tsconfig.json` target** to ES2022. Out of scope; the project uses Node built-ins directly so no `Error.cause` constructor option is needed here.
- **Defining a canonical `lib/domain/Role.ts`.** F-13 (Users + Auth) owns this. Until then, the minimal local union in `lib/observability/Caller.ts` is the placeholder.
