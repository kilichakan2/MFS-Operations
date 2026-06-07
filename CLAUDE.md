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

## Local test infrastructure

Prereq: Supabase CLI (`brew install supabase/tap/supabase`) and Docker Desktop running. Daily commands:

- `npm run db:up` — start local Supabase (Postgres + Auth + Storage + Studio)
- `npm run db:reset` — re-run migrations + seed on the local DB
- `npm run db:down` — stop local Supabase
- `npm run test:e2e:api` — Playwright API smoke (auto-boots dev server)
- `npm run test:e2e:ui` — Playwright UI smoke (auto-boots dev server + chromium)

Playwright's `webServer` block sources `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from `.env.test.local` and passes them explicitly to the spawned dev server — never `.env.local`'s prod values. Smokes also assert the URL points at localhost as a belt-and-braces guard.
