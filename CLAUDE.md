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
- `app/` (Next.js App Router) and `components/` — presentation. Never imports adapters directly; goes via services or use-cases.

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

## Local test infrastructure

Prereq: Supabase CLI (`brew install supabase/tap/supabase`) and Docker Desktop running. Daily commands:

- `npm run db:up` — start local Supabase (Postgres + Auth + Storage + Studio)
- `npm run db:reset` — re-run migrations + seed on the local DB
- `npm run db:down` — stop local Supabase
- `npm run test:integration` — vitest integration suite (auto-boots a dev server on port 3100 wired to local Supabase from `.env.test.local`; prerequisites: `npm run db:up` once, and `npm run db:reset` if you want a fresh seed)
- `npm run test:e2e:api` — Playwright API smoke (auto-boots dev server)
- `npm run test:e2e:ui` — Playwright UI smoke (auto-boots dev server + chromium)

Playwright's `webServer` block sources `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from `.env.test.local` and passes them explicitly to the spawned dev server — never `.env.local`'s prod values. Smokes also assert the URL points at localhost as a belt-and-braces guard. The vitest integration runner shares the same `.env.test.local` invariant **plus** a server-side DB identity probe: a sentinel row planted in the local DB must be readable through the booted server before any test traffic flows, otherwise the run aborts.
