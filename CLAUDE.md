# MFS-Operations — Project Guidance

## Architecture principle — build it like Lego

Every external dependency — database, auth, payments, file storage, email, search, any third-party service — sits behind an interface the app owns. The app talks to the interface, never to the vendor directly.

Three layers, strict top-to-bottom. Each layer only knows the one below it through a contract:

- **UI / presentation** — renders and captures input. Knows nothing about where data lives or which vendor stores it.
- **API / service layer** — the only thing the UI is allowed to call. Owns business logic and orchestration.
- **Adapters (data/integration layer)** — concrete implementations of the interfaces. This is the only place a vendor SDK is ever imported.

### Rules

- The UI never imports or calls a database/vendor SDK directly. UI → API → data. Always.
- Business logic depends on abstractions (interfaces/contracts), never on a concrete vendor. Dependencies point inward.
- Swapping a vendor = write one new adapter that satisfies the existing interface, change one wiring/config line. Nothing in the UI or business logic changes.
- Define the contract before the implementation. Contracts are stable; implementations are interchangeable.
- Vendor-specific types never leak past the adapter boundary — map them to your own domain models so the rest of the app never sees a vendor's shape.
- Each module is encapsulated: clear inputs, clear outputs, no reaching into another module's internals.

### Acceptance test

For every external dependency: **"If I rip out [the DB / auth / payment provider] tomorrow and replace it, how many files change?"** The answer must be: one adapter + one config line. More than that = the coupling is wrong, fix it before moving on.

### Folder layout

The three layers above live in these paths. Every file belongs to exactly one:

- `lib/domain/` — domain types the app owns (`Order`, `Customer`, `Product`, `Role`). Pure TypeScript, no framework imports, no vendor imports.
- `lib/ports/` — the interfaces (**ports**) the app owns, defined in terms of business operations. Pure TypeScript, no framework imports, no vendor imports.
- `lib/services/` — business logic that depends on ports. Never on vendors directly. Services do not import other services (use a `lib/usecases/` use-case to compose).
- `lib/usecases/` — orchestration that composes multiple services or ports for a single business operation.
- `lib/adapters/<vendor>/` — concrete implementations (**adapters**) of the ports. The only place a vendor SDK is ever imported. One sub-folder per vendor (`lib/adapters/supabase/`, `lib/adapters/resend/`, etc.).
- `lib/wiring/` — composition roots, one file per domain (`lib/wiring/orders.ts`). The ONLY business-layer location allowed to import from `lib/adapters/**`: it connects concrete adapters to service/use-case factories and exports the ready-to-use singletons. Services and use-cases export factories only — never pre-wired singletons (ESLint-enforced since F-TD-11; pinned by `tests/unit/lint/no-adapter-imports.test.ts`). This is what keeps the rip-out test at "one adapter + one wiring line".
- `app/` (Next.js App Router) and `components/` — presentation. Never imports adapters directly; goes via services or use-cases (importing their singletons from `lib/wiring/`).

When skills say "which port?" they mean the interface in `lib/ports/`. When they say "which adapter?" they mean the implementation in `lib/adapters/<vendor>/`. See ADR-0002 (`docs/adr/0002-hexagonal-shape-and-naming.md` line 19) for the full naming + dependency rule.

### Dependency justification

Every new entry in `package.json` needs a one-line written reason — in the PR description, the plan, or a `// reason:` comment next to the import. Silent vendor additions are a code-critic blocker.

Single-use vendor libraries (imported in exactly one file) must sit behind an owned wrapper at `lib/adapters/<vendor>/`. The rest of the app depends on the wrapper, not the library.

### Blockers (code-critic will reject)

- Anything in `lib/domain/**` or `lib/ports/**` importing from `lib/adapters/**` (the dependency rule points inward)
- Anything in `app/**` or `components/**` importing from `lib/adapters/**` directly (must go via `lib/services/` or `lib/usecases/`)
- A vendor package (e.g. `@supabase/*`, `stripe`, `@vercel/*`) imported outside `lib/adapters/<vendor>/` (F-04 enforces this for `@supabase/supabase-js` at lint time; F-27 extends to all vendors)
- A new `package.json` entry with no written justification
- A single-use vendor library not wrapped
- A rip-out test answer that costs more than one adapter + one config line

## Non-negotiable architecture

This project is hexagonal (ports & adapters). The authoritative rules live in
"## Architecture principle — build it like Lego" above and in ADR-0002
(`docs/adr/0002-hexagonal-shape-and-naming.md`). They are non-negotiable and
enforced on every FORGE unit:

- UI → API/service → adapter. Inner layers never import outward: `lib/domain/**`
  and `lib/ports/**` never import `lib/adapters/**`; `app/**` and `components/**`
  never import `lib/adapters/**` directly (go via `lib/services/` or `lib/usecases/`).
- Vendor SDKs are imported ONLY in `lib/adapters/<vendor>/`. Vendor-specific types
  never leak past the adapter boundary — map them to `lib/domain/` models.
- Every external dependency sits behind a port the app owns; concrete adapters are
  wired to factories only in `lib/wiring/`. Rip-out test: replacing a vendor =
  one new adapter + one wiring line, nothing else changes.
- Every new `package.json` entry needs a written one-line justification; single-use
  vendor libraries must sit behind an owned `lib/adapters/<vendor>/` wrapper.

Scope: pre-existing breaches are known debt; only new or touched code in the
current diff is held to this standard (the FORGE pipeline reviews diffs, not the
whole tree). See the "### Blockers (code-critic will reject)" list above for the
exact rejection criteria.

## Local test infrastructure

Prereq: Supabase CLI (`brew install supabase/tap/supabase`) and Docker Desktop running. Daily commands:

- `npm run db:up` — start local Supabase (Postgres + Auth + Storage + Studio)
- `npm run db:reset` — re-run migrations + seed on the local DB
- `npm run db:down` — stop local Supabase
- `npm run test:integration` — vitest integration suite (auto-boots a dev server on port 3100 wired to local Supabase from `.env.test.local`; prerequisites: `npm run db:up` once, and `npm run db:reset` if you want a fresh seed)
- `npm run test:e2e:api` — Playwright API smoke (auto-boots dev server)
- `npm run test:e2e:ui` — Playwright UI smoke (auto-boots dev server + chromium)
- `npm run test:e2e:preview -- <preview-url>` — Gate-4 preview smoke: the three `@critical` specs against a PR's deployed Vercel preview wired to its Supabase preview branch (remote-only, fail-closed; see `docs/runbooks/preview-smoke.md`)
- `npm run db:branches` — list Supabase preview branches (ship-checklist "no orphaned branches" check)

Playwright's `webServer` block sources `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from `.env.test.local` and passes them explicitly to the spawned dev server — never `.env.local`'s prod values. Smokes also assert the URL points at localhost as a belt-and-braces guard. The vitest integration runner shares the same `.env.test.local` invariant **plus** a server-side DB identity probe: a sentinel row planted in the local DB must be readable through the booted server before any test traffic flows, otherwise the run aborts. Remote preview smokes never run against production: the Playwright config refuses non-preview hostnames and a globalSetup DB identity probe (seed sentinel `a417e57e-…0001` via `/api/reference`) must pass before any spec executes. When `BASE_URL` is unset, all local flows are unchanged.
