# Mode B — Architecture Review (MFS-Operations) — 2026-06-06

**Lens:** Lego/adapter principle (vendor coupling), per the CLAUDE.md contract at `/Users/hakankilic/MFS-Operations/CLAUDE.md` lines 3–24.

**Revisions:**
- **v1.1 (2026-06-06)** — folded in APOSD + hexagonal lens. Added cross-cutting design rules section (depth rule, design-it-twice, contract tests, inbound validation, idempotency, typed errors, twin-hexagon for client). Added **Phase 0a (Foundations)** ahead of Phase 0 with ADR seed, typed-error contract, observability scaffolding. Added **Phase 0.5 (Parallel safety track)** running alongside Phase 1+ to fix the service-role/RLS hole. Annotated F-05..F-08 with new requirements. Original F-NN numbering preserved.

## 🩺 Verdict (plain English)

The good news: **your screens don't talk to Supabase directly.** Every page goes UI → API → database, which is exactly what the Lego principle asks for at the outermost layer. That's a real win — most codebases at this stage have Supabase imports scattered through React components.

The bad news: **the moment you cross into the API layer, the Lego principle falls apart completely.** Inside `/app/api/...` there are **88 route files** that import Supabase directly and call it as if Supabase *is* the database — there is no "database interface" sitting between them. On top of that, you actually have **two different ways** of talking to Supabase living side by side: most routes use the shared client at `lib/supabase.ts`, but about ten routes (the screen2, detail/, and map/data routes) bypass that and call Supabase's REST endpoint by hand with `fetch` and the service-role key inline. The email helpers do the same. So even your one centralised seam isn't really centralised.

If you tried the rip-out test today — "replace Supabase tomorrow" — the honest answer is: **about 100 files would change.** Not "one adapter + one config line." That's the gap.

**The good news inside the bad news:** because the UI is already clean, you don't need a rewrite. You need a *strangler-fig migration* that introduces a repository/adapter layer between your API routes and Supabase, file by file, route by route. Same code, refactored, no big-bang. Sequenced below as FORGE-sized work units.

A second issue worth flagging: the **service-role key (the master key that bypasses all database access rules)** is used in every API route. This is normal for trusted server code, but it means the database's own per-user access rules (RLS) are effectively dormant — every route is doing its own role check via cookies. That's a coupling smell *and* a safety smell. The Lego refactor is the right moment to fix it.

---

## 🚨 Critical findings (loopholes & headline coupling)

### C1 — 88 route handlers import the database vendor directly

**Files:** every file under `/Users/hakankilic/MFS-Operations/app/api/` that calls `supabaseService` — 88 of 105 route files. Representative offenders:
- `app/api/orders/route.ts` lines 21, 50–67, 105–134, 153–183 — business logic (verify customer exists, verify products exist, insert order, rollback) interleaved with raw `.from('orders').select(...)` calls.
- `app/api/dashboard/route.ts` line 15 — 12 parallel raw vendor queries in one handler.
- `app/api/reference/route.ts` lines 14, 22–32 — vendor calls directly inside the handler.
- `app/api/auth/login/route.ts` lines 13, 112–116, 166–172 — auth logic and vendor queries mixed.

**Why it matters:** the API layer is supposed to own *business logic* and call a *data interface*. Right now it owns business logic and **is** the data interface. Per APOSD this is "exposing implementation details through the interface" — the rest of the system pays the complexity cost of Supabase being there.

**Rip-out test result:** ~100 files. Required answer: 1.

### C2 — Two parallel Supabase access mechanisms (the centralised client is a lie)

Most routes do this:

```ts
import { supabaseService } from '@/lib/supabase'   // lib/supabase.ts:15
```

But **ten routes and three email helpers** ignore that and do this instead:

```ts
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ''
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
// ... raw fetch(`${SUPA_URL}/rest/v1/users?...`, { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } })
```

Files doing this:
- `app/api/screen2/note/route.ts:16-17`
- `app/api/screen2/resolve/route.ts:15-16`
- `app/api/screen2/all/route.ts:15-16`
- `app/api/screen2/sync/route.ts:10-11`
- `app/api/screen2/open/route.ts:11-12`
- `app/api/admin/geocode-all/route.ts:16-17`
- `app/api/map/data/route.ts:10-11`
- `app/api/detail/visit/route.ts:5-6`
- `app/api/detail/complaint/route.ts:5-6`
- `app/api/detail/discrepancy/route.ts:5-6`
- `lib/complaint-email.ts:14-15`
- `lib/compliment-email.ts:12-13`
- `lib/pricing-email.ts:14-15`

And one more, `lib/road-times.ts:36–39`, which re-instantiates its **own** Supabase SDK client instead of using `supabaseService`.

**Why it matters:** the comment at `lib/supabase.ts:9` says "Centralised here so the key rotation or URL change needs only one edit." That comment is **factually false** — you have 14 places that hardcode `process.env.NEXT_PUBLIC_SUPABASE_URL` and the service key, and one place that re-runs `createClient`. Rotating the URL or key today touches 15 files, not one. Worse, the two mechanisms diverge in subtle ways (PostgREST shape vs SDK shape, error handling, retry behaviour).

### C3 — Service-role key is the only auth path; database RLS is effectively dormant

Every API route uses the service-role client (`supabaseService` at `lib/supabase.ts:15`). The service-role key bypasses Postgres Row-Level Security entirely — the database trusts whatever the app says. That's not a vendor *leak* in the literal sense (the key isn't exposed to browsers — middleware and the cookie pattern keep that line intact), but it is a **coupling decision**: the app has chosen "RLS-off, app-enforces-roles" as its security model, and every route hand-rolls its own role check, e.g. `app/api/orders/route.ts:30-31, 38-39`. There is no shared "who is the caller, what may they do?" function. That's both a coupling problem and a quiet security problem — one missed role check and a role can reach data they shouldn't.

**Note:** Running Supabase `get_advisors` (security + performance) would confirm RLS state on every table — recommended as a quick-win below.

### C4 — Anthropic SDK directly in an admin route handler

`app/api/admin/import/route.ts:16-17`:

```ts
import Anthropic from '@anthropic-ai/sdk'
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
```

The tool-definition objects (`CUSTOMER_TOOL`, `PRODUCT_TOOL`) use `Anthropic.Tool` as their type — that's a vendor shape **leaking into module-level constants** in your business code. Swapping LLM provider tomorrow rewrites this whole route. Same coupling pattern, different vendor.

### C5 — Resend SDK directly in three email helpers

`lib/complaint-email.ts:72-75`, `lib/compliment-email.ts:53-57`, `lib/pricing-email.ts:65-71` each do:

```ts
const { Resend } = await import('resend')
const resend     = new Resend(RESEND_KEY)
const result     = await resend.emails.send({ from, to, subject, html })
```

Three independent reimplementations of "send an email," each duplicating the Supabase user-list fetch above it. Information leakage in the APOSD sense — every email helper has to know *both* how Resend sends mail *and* how Supabase stores users.

### C6 — Web Push, jsPDF, XLSX, Leaflet — vendor SDKs used directly in feature code

- `lib/webpush.ts` imports `web-push` directly (less critical — it is at least a single module, and is essentially already an adapter, just not behind a stable interface).
- `app/pricing/page.tsx` imports `jspdf` directly into a page component. Page generates PDFs in the browser using a vendor library — change PDF library = rewrite the page.
- `app/api/haccp/audit/export/route.ts` imports `xlsx` directly.
- `components/MapView.tsx`, `components/RouteMap.tsx` import `leaflet` / `react-leaflet` directly into UI components.

These are less urgent than DB and auth, but the same pattern. The Lego principle says: a `PdfRenderer`, a `SpreadsheetExporter`, a `MapProvider` interface — each one owned by the app, each one with a single adapter.

---

## 📋 Risk register

| ID | Area | Severity | Risk | Evidence | Rip-out cost |
|---|---|---|---|---|---|
| C1 | Database / Lego | **Critical** | 88 route handlers depend directly on Supabase SDK; no data interface | 88 files under `/app/api/**/route.ts` import `supabaseService` | ~100 files |
| C2 | Database / Lego | **Critical** | Two parallel Supabase access paths; "centralised client" doesn't actually centralise | 14 files inline `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | 15 files |
| C3 | Auth / Security | **High** | Service-role key everywhere; RLS dormant; each route re-implements role check | All 88 routes; e.g. `app/api/orders/route.ts:30-39` | All routes carry their own auth logic |
| C4 | LLM / Lego | **High** | Anthropic SDK type leaked into business code | `app/api/admin/import/route.ts:16-17` and `Anthropic.Tool` usage | 1 route + every place tool result types travel |
| C5 | Email / Lego | **High** | Resend SDK + Supabase user-fetch duplicated across 3 helpers | `lib/complaint-email.ts:54-75`, `lib/compliment-email.ts:30-57`, `lib/pricing-email.ts:48-71` | 3 helpers + 4 call sites |
| H1 | PDF / Lego | Medium | `jspdf` imported into a UI page | `app/pricing/page.tsx` | 1 page (UI layer pollution) |
| H2 | Spreadsheet / Lego | Medium | `xlsx` imported into a route | `app/api/haccp/audit/export/route.ts` | 1 route |
| H3 | Map / Lego | Medium | `leaflet`, `react-leaflet` imported into UI components | `components/MapView.tsx`, `components/RouteMap.tsx` | 2 components |
| H4 | Auth / Lego | Medium | `bcryptjs` directly imported in 4 routes; no `PasswordHasher` interface | `app/api/auth/login/route.ts:12`, `app/api/auth/kds-pin/route.ts`, `app/api/admin/users/route.ts`, `app/api/admin/users/[id]/route.ts` | 4 routes |
| H5 | Push / Lego | Medium | `web-push` SDK used directly; only one site but no interface | `lib/webpush.ts:13` | 1 file (low risk; already isolated) |
| M1 | Local DB / Lego | Low | `dexie` used directly in 4 UI/hook files; this is a deliberate offline cache so lower priority, but should still sit behind an interface | `lib/localDb.ts`, `hooks/useReferenceData.ts`, `hooks/useSyncStatus.ts`, `components/AppHeader.tsx`, `components/RecentActivity.tsx` | 5 files |
| L1 | Centralisation | Low | `lib/road-times.ts` re-instantiates Supabase client instead of using `supabaseService` | `lib/road-times.ts:36-39` | 1 file (easy fix) |

**Counts:** Critical 2 · High 4 · Medium 5 · Low 1.

---

## 🏗️ Architecture improvements — the rearchitect plan

### Target shape

Three layers, top down, as your CLAUDE.md mandates:

```
┌──────────────────────────────────────────────────────────┐
│  UI / presentation                                       │
│  app/**/page.tsx, components/**, hooks/** (today)        │
│  Knows only domain types + the API surface (HTTP/fetch)  │
└──────────────────────────────────────────────────────────┘
                          │
                          ▼  (already clean — keep it that way)
┌──────────────────────────────────────────────────────────┐
│  API / service layer                                     │
│  app/api/**/route.ts (thin)                              │
│  + lib/services/* (NEW — owns business logic)            │
│  Talks ONLY to ports (interfaces). Knows zero vendors.   │
└──────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│  Ports (interfaces) — lib/ports/*                        │
│  OrdersRepository, CustomersRepository, UsersRepository, │
│  Mailer, LLMExtractor, PdfRenderer, SpreadsheetWriter,   │
│  PasswordHasher, PushSender, AuthSession                 │
└──────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│  Adapters — lib/adapters/*                               │
│  supabase/OrdersRepository.ts                            │
│  resend/Mailer.ts                                        │
│  anthropic/LLMExtractor.ts                               │
│  jspdf/PdfRenderer.ts ... etc.                           │
│  ONE file per (port × vendor). Vendor SDK imported here  │
│  and nowhere else. Vendor types stay inside.             │
└──────────────────────────────────────────────────────────┘
```

### What each interface looks like (sketch — define before implementing)

```ts
// lib/ports/OrdersRepository.ts
export interface OrdersRepository {
  list(filter: OrderFilter): Promise<Order[]>
  getById(id: string): Promise<Order | null>
  create(input: CreateOrderInput, actorUserId: string): Promise<OrderRef>
  updateState(id: string, next: OrderState, actorUserId: string): Promise<void>
}

// lib/ports/Mailer.ts
export interface Mailer {
  send(msg: { to: string[]; subject: string; html: string; from?: string }): Promise<void>
}

// lib/ports/LLMExtractor.ts
export interface LLMExtractor {
  extractCustomers(rawText: string): Promise<ExtractionResult<Customer>>
  extractProducts(rawText: string): Promise<ExtractionResult<Product>>
}

// lib/ports/PasswordHasher.ts
export interface PasswordHasher {
  hash(plain: string): Promise<string>
  verify(plain: string, hash: string): Promise<boolean>
}

// lib/ports/AuthSession.ts
export interface AuthSession {
  current(req: Request): Promise<{ userId: string; role: Role; secondaryRoles: Role[] } | null>
  require(req: Request, allowed: Role[]): Promise<Session>  // throws on fail — kills hand-rolled checks
}
```

The **domain types** (`Order`, `Customer`, `Product`, `Role`, etc.) belong to the app, not the vendor. No `SupabaseClient`, no `PostgrestResponse`, no `Anthropic.Tool` ever crosses the port boundary.

### Migration strategy — strangler fig, never big-bang

Do NOT attempt to refactor all 88 routes at once. The proven pattern (Martin Fowler's strangler fig) is:

1. **Add the new layer alongside the old.** Create `lib/ports/`, `lib/adapters/supabase/`, and `lib/services/`. Nothing changes for existing routes.
2. **Wire one bounded slice first.** Pick the smallest contained domain — recommend **Orders** (5 routes, 1 lib subdir already exists at `lib/orders/`, recently shipped, fresh in your head). Build `OrdersRepository` interface, `SupabaseOrdersRepository` adapter, and an `OrdersService` (business logic — verify customer, verify products, rollback). Rewrite the 5 orders routes to be 10-line orchestrators that call the service.
3. **Run them side by side.** No vendor change in this PR — same Supabase, same tables. The point is to *prove the seam works* before touching anything else.
4. **Repeat domain by domain.** Customers, then Products, then Users/Auth, then Routes, then Pricing, then Cash, then Compliments/Complaints, then HACCP (biggest — do last and split into sub-domains).
5. **Delete `lib/supabase.ts` last.** When the only file still importing `@supabase/supabase-js` is `lib/adapters/supabase/*`, the migration is done. Run a final grep — if `from '@supabase/supabase-js'` appears outside `lib/adapters/supabase/`, the seam isn't sealed.

### Sequencing — which vendor to wrap first

1. **Supabase** (biggest payoff, biggest blast radius if rushed) — wrap incrementally, domain by domain.
2. **Auth / `bcryptjs`** (small, isolated, but currently couples 4 routes to a specific hashing library) — wrap once, replace in 4 places.
3. **`AuthSession` port** (this is the *quiet* win) — every route currently hand-rolls `req.cookies.get('mfs_role')?.value` and an allow-list check. Put that behind a single `requireRole(['admin', 'office'])` helper. Reduces 80+ duplicated checks and removes the temptation to forget one.
4. **Resend / Mailer** (3 helpers, 4 call sites — wrap together).
5. **Anthropic / LLMExtractor** (single route — easy win).
6. **jsPDF, XLSX, Leaflet, web-push** — wrap each one as its turn comes up, lowest priority because each touches one or two files.
7. **Dexie** (deliberately a vendor in the UI to support offline; lower priority, but eventually behind a `LocalCache` interface for the same swap reason).

---

## ⚡ Quick wins (≤ 1 day each, do these now)

1. **Consolidate the 14 inline Supabase clients.** Replace the `SUPA_URL/SUPA_KEY/fetch` pattern in the 10 routes and 3 email helpers with `import { supabaseService } from '@/lib/supabase'`. Make the comment at `lib/supabase.ts:9` honest. This is a pure refactor and is the prerequisite for any adapter work — you can't wrap "Supabase access" if there are two different ways to do it.
2. **Fix `lib/road-times.ts:36-39`** — use `supabaseService` instead of re-running `createClient()`. One-line change.
3. **Add a `requireRole(req, ['admin', 'office'])` helper** in `lib/auth/session.ts`. Don't refactor everything to use it — just *add it*, and require it for any new route. The 80 existing duplicated checks get migrated as you touch each route during the Lego refactor.
4. **Run `get_advisors` against the Supabase project** (security + performance lenses) — confirms whether RLS is on/off per table and surfaces missing indexes that may be hiding behind the service-role pattern.
5. **Document the contract in `CLAUDE.md`** with one paragraph: "Every new API route must import zero vendor SDKs. Use a service from `lib/services/` which depends on a port from `lib/ports/`." This stops the bleeding while migration is in flight.

---

## 🎯 Cross-cutting design rules (apply to every PR in the migration)

These are not single PRs — they're disciplines that travel with every adapter/service/route change. Reviewers reject PRs that violate them.

### Port design (every new port)

- **Depth rule.** Every port method must hide at least one non-trivial decision. If the method maps 1:1 to a vendor call (`OrdersRepository.from('orders').select(...)`), redesign before committing — that's a *shallow module* and doesn't earn its place. Ports expose **business operations** ("list orders due today", "create order with rollback if products missing"), not **database operations**.
- **Design it twice.** Before committing the shape of any port, sketch two genuinely different versions (row-returning vs aggregate-returning, throw-on-missing vs return-null, eager vs lazy). Pick the better one with eyes open. Five minutes of design-it-twice saves five weeks of port-shape regret.
- **Domain types only.** Vendor types (`SupabaseClient`, `PostgrestResponse`, `Anthropic.Tool`, `Stripe.Customer`) NEVER leak past the port boundary. Map to owned domain types inside the adapter.
- **Interface comment first.** Ousterhout's habit — write the doc comment before the type. If you can't describe the port in 3 short lines per method, it's doing too much.

### Inbound contract (every route rewrite)

- **Validate at the edge.** Every route's inbound JSON validated with `zod` before reaching the service. Service signature takes domain types, never a `Request` and never raw JSON.
- **Idempotency keys on writes.** Any create/update operation accepts an `Idempotency-Key` header. The port boundary enforces it — service treats retried requests as no-ops.
- **Routes are thin.** Target: ≤ 20 lines. If a route is longer, business logic has leaked back in.

### Errors (everywhere)

- **Typed errors, not strings.** Ports throw one of a small set (`NotFoundError`, `ConflictError`, `ValidationError`, `ServiceError`). Domain rules expressed as typed errors, not as `{ error: 'string' }` payloads.
- **Aggregate at the framework layer.** ONE error handler in middleware translates typed errors to HTTP responses. Routes never write try/catch around domain errors.
- **Define errors out of existence.** Where possible, redesign so the error simply can't happen — e.g. `getById` returns `Order | null` and the caller decides, rather than throwing and forcing every caller to catch.

### Application core boundary (when services compose)

- **Services don't import services directly.** When one service needs another's work, compose via a **use-case** (a service that orchestrates other services). Otherwise services tangle into each other and you've recreated the coupling problem one layer up.
- **One driving port, many driving adapters.** HTTP is one way to reach the service. Cron, push handlers, mobile webhooks, KDS terminals, Slack bots are others. Services accept a `Caller` context (user + role + correlation ID), not a `Request`.

### Tests at the seam

- **Contract tests on every port.** One shared test suite per port. EVERY adapter (the real Supabase one + an in-memory fake used in unit tests) must pass. A PR that adds an adapter without a contract test pass is blocked.
- **Services tested with fake adapters.** Unit tests for `OrdersService` use `FakeOrdersRepository` — fast, deterministic, no DB. The whole point of hexagonal is that this is *easy*.
- **Integration tests on real adapters.** A smaller set; runs against a real Supabase preview branch in CI.

### Twin-hexagon (client side mirrors server)

- The React side has its own hexagon. Hooks (`useOrders`, `useReferenceData`) are driving adapters. They call client-side services that depend on `LocalCachePort` (Dexie) and `ApiPort` (fetch). UI components depend on hooks only — never on `dexie` or `fetch` directly.
- Same rules apply: zero vendor imports outside `lib/adapters/client/*`.

### Observability across the seam

- Every adapter call instrumented with a correlation ID established at the driving-adapter layer (HTTP middleware reads `x-request-id` or generates one), threaded into the `Caller` context, passed into every port call, attached to every log line and Sentry event.
- No correlation-ID threading = "the route worked but the adapter failed" is undebuggable in production.

### Comments don't lie

- Any comment claiming an invariant ("centralised here," "always sorted," "tenant-isolated") must be enforced by a test or a lint rule. Unenforceable invariant claims get deleted.
- The lying comment at `lib/supabase.ts:9` is the canonical example.

---

## 🗺️ Remediation roadmap (FORGE-sized units)

Sequencing matters. Earlier units unblock later ones. Each unit is one coherent change, mergeable on its own, ANVIL-gated.

### Phase 0a — Foundations (must land before Phase 0)

The load-bearing structures every later phase depends on. Small, but skipping them turns the entire migration into theatre.

- **F-FND-01** Create `docs/adr/` and seed three Architecture Decision Records: (1) Hexagonal shape and naming — ports, adapters, services, use-cases, domain types; (2) Strangler-fig migration strategy and the FREEZE rule; (3) RLS-vs-service-role security model and the path to authenticated clients. Each ADR ≈ 1 page, dated, decided. (1 PR — docs only.)
- **F-FND-02** Create `lib/errors/` with the typed error contract: `NotFoundError`, `ConflictError`, `ValidationError`, `ServiceError`. Add Next.js middleware / error-boundary that translates each into the right HTTP status + JSON shape. No route migrations yet — just the foundation. (1 PR)
- **F-FND-03** Create `lib/observability/` with a `Caller` context type carrying `{ userId, role, correlationId }` and a `withRequestContext()` helper that establishes it per request. Wire Sentry tags and structured logs to read from the context. No route migrations yet. (1 PR)

### Phase 0 — stop the bleeding (quick wins, no architecture change yet)

- **F-01** Consolidate 14 inline Supabase clients onto `supabaseService`. (1 PR)
- **F-02** Fix `lib/road-times.ts` to use `supabaseService`. (1 PR — can be folded into F-01)
- **F-03** Introduce `lib/auth/session.ts` with `requireRole(req, roles[])`. No route migrations yet. (1 PR)
- **F-04** Add a lint/CI guard: forbid `from '@supabase/supabase-js'` outside `lib/adapters/supabase/**` and `lib/supabase.ts`. Today it will only block new offenders; later it will enforce the boundary. (1 PR, ESLint rule)

### Phase 0.5 — Parallel safety track (runs alongside Phase 1+, not after)

The service-role + dormant-RLS pattern is a Day-1 production hole, not a Day-30 one. Run this track in parallel with the Lego refactor — they don't conflict, and shipping without it means we've decoupled vendors but left the security model broken.

- **F-RLS-01** RLS audit + threat model. Run Supabase `get_advisors` (security + performance). For every table holding user/customer data, document: current RLS state, who reaches it, what a missed check would leak. Output: `docs/rls-audit-2026-06-06.md`. (1 PR — docs only.)
- **F-RLS-02** Per-table RLS expand-contract plan. For each table: target policy, migration order (enable RLS → add policy → switch reads → switch writes → remove service-role fallback), rollback. (1 PR — docs only.)
- **F-RLS-03** Introduce per-request authenticated Supabase client (anon key + user JWT). Keep `supabaseService` available, but mark it as "admin paths only" in code review. Add an `AuthenticatedDbAdapter` that ports use by default. (1 PR)
- **F-RLS-04..n** Migrate tables to RLS one bounded-context at a time, sequenced to align with the matching Lego phase (Orders RLS lands with Phase 1, Users RLS with F-13, etc.). Each migration is its own PR with rollback path.
- **F-RLS-final** Retire service-role from all user-facing paths. Service-role remains only in admin-tagged routes, behind an explicit `requireServiceRole()` helper. (1 PR — also tighten lint rule to forbid service-role outside `lib/admin/`.)

### Phase 1 — prove the seam (first domain end-to-end)

- **F-05** Define ports: `lib/ports/OrdersRepository.ts`, `lib/ports/CustomersRepository.ts`, `lib/ports/ProductsRepository.ts`. Define domain types (`Order`, `OrderLine`, `Customer`, `Product`). No implementations yet. **Apply the depth rule** — each method exposes a business operation, never a 1:1 vendor call. **Design-it-twice** — sketch two interface options per port, pick the better one. Write the interface comment BEFORE the type. (1 PR — types + interface comments only.)
- **F-06** Implement `lib/adapters/supabase/OrdersRepository.ts`, `CustomersRepository.ts`, `ProductsRepository.ts`. Single file per port. Vendor types stay inside; only domain types leave. **Also ship the contract test suite** in `lib/ports/__contracts__/`: one shared test suite per port that the Supabase adapter AND a `FakeInMemoryOrdersRepository` both pass. From this PR onward, any new adapter must pass the contract suite to merge. (1 PR)
- **F-07** Implement `lib/services/OrdersService.ts` containing the business logic currently in `app/api/orders/route.ts:103-183` (verify customer, verify products, create+rollback). Depends on ports only. **Throws typed errors from `lib/errors/` (F-FND-02)** — no string-shaped error returns. Unit-tested with `FakeInMemoryOrdersRepository`. (1 PR)
- **F-08** Rewrite all 5 orders routes (`/api/orders/route.ts`, `/api/orders/[id]/route.ts`, `/api/orders/[id]/picking-list/route.ts`, plus dispatch list endpoint, plus KDS done endpoint) to be ≤ 20-line handlers that call `OrdersService`. **Inbound zod validation at the route boundary** — no raw JSON reaches the service. **Idempotency keys on create operations** (Orders POST accepts `Idempotency-Key` header; service treats duplicate keys as no-ops). **Routes throw nothing — errors flow through the typed-error middleware from F-FND-02.** No try/catch in route handlers. (1 PR — **blocker: F-05, F-06, F-07, F-FND-02**)
- **F-09** **ANVIL gate**: rip-out test passes for Orders. (Audit — not a code PR; report-only.)

### Phase 2 — auth and email (small, contained)

- **F-10** `PasswordHasher` port + `BcryptPasswordHasher` adapter. Migrate the 4 routes that import `bcryptjs`. (1 PR)
- **F-11** `Mailer` port + `ResendMailer` adapter. Migrate the 3 email helpers to use `Mailer`. Keep the per-event helpers (`sendComplaintEmail`, `sendComplimentEmail`, `sendPricingEmail`) but have them depend on `Mailer` and `UsersRepository` (for recipients), not on `Resend` and `fetch`. (1 PR — **blocker: F-13 UsersRepository**)
- **F-12** `LLMExtractor` port + `AnthropicLLMExtractor` adapter. Migrate `app/api/admin/import/route.ts`. (1 PR)

### Phase 3 — remaining domains (repeat the F-05 → F-08 pattern)

Each of the following gets its own ports → adapter → service → route-rewrite cycle:

- **F-13** Users + Auth (login route is the most critical — touches sessions, role-picking, hashing). Blocks F-11. (3 PRs)
- **F-14** Routes (delivery routes — `/api/routes/**`, 8 route files). (3 PRs)
- **F-15** Pricing (5 route files, plus PDF and email helpers). (3 PRs)
- **F-16** Cash (7 route files). (2 PRs)
- **F-17** Compliments + Complaints (Screen 2 + the all/note/resolve/open variants). (2 PRs)
- **F-18** Visits / Screen 3 (4 route files). (2 PRs)
- **F-19** HACCP (largest — ~30 routes; split into sub-domains: audit, allergen, cold-storage, calibration, training, cleaning, recall, etc). (5–8 PRs)
- **F-20** Admin (customers/products/users/runs/prospects/visits/at-risk/commitments — 11 routes). (3 PRs)
- **F-21** Dashboard (1 huge route — `app/api/dashboard/route.ts`, 12 queries — must be split into `DashboardService` calling several repositories). (1 PR — only safe to do after the underlying repositories exist, i.e. **blocker: most of Phase 3**)

### Phase 4 — peripheral vendors

- **F-22** `PdfRenderer` port + `JsPdfPdfRenderer` adapter. Migrate `app/pricing/page.tsx` to call an API route that uses it server-side (or keep client-side but behind the port). (1 PR)
- **F-23** `SpreadsheetWriter` port + `XlsxSpreadsheetWriter` adapter. Migrate `app/api/haccp/audit/export/route.ts`. (1 PR)
- **F-24** `MapProvider` port + `LeafletMapProvider` adapter. Migrate `MapView.tsx`, `RouteMap.tsx`. (1 PR)
- **F-25** `PushSender` port + `WebPushPushSender` adapter. Replace `lib/webpush.ts` with the adapter. (1 PR)
- **F-26** `LocalCache` port + `DexieLocalCache` adapter. Migrate Dexie usage in `localDb.ts` and the hooks/components that touch Dexie directly. (1 PR — lower priority)

### Phase 5 — seal the boundary

- **F-27** Tighten the F-04 ESLint rule to also forbid `resend`, `@anthropic-ai/sdk`, `bcryptjs`, `web-push`, `jspdf`, `xlsx`, `leaflet`, `react-leaflet`, `dexie`, `@supabase/supabase-js` outside `lib/adapters/**`. From this point on, the rip-out test is enforced by CI, not by review discipline. (1 PR — the moment this lands, the Lego principle has teeth.)

**Estimated total (v1.1):** ~36 PRs over 8–12 weeks — original ~30 plus Phase 0a (3 foundation PRs) and Phase 0.5 (parallel RLS track, ~3–5 PRs). Most are small. The two biggest are HACCP (F-19) and Dashboard (F-21). Nothing here requires a stop-the-world rewrite.

---

## Handoff

**Recommended next step:** run `/forge` for the three **Foundation** units first — **F-FND-01** (ADR seed), **F-FND-02** (typed error contract), **F-FND-03** (observability scaffolding). They can run in parallel; they don't conflict and they unblock everything that follows. Then Phase 0 (`F-01..F-04`) to stop the bleeding. **F-RLS-01** (RLS audit) should start in parallel with F-01 — it's docs-only and informs the security model that the rest of the migration must respect. Phase 1 (Orders) starts only after Phase 0a + Phase 0 are merged and the lint guard is live.

**Severity tally:** Critical 2 · High 4 · Medium 5 · Low 1.

Review saved → docs/architecture-review-2026-06-06.md

To fix the top findings, run: /forge   (ANVIL gates the ship before merge)
