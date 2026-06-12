# ADR-0002 — Hexagonal shape and naming

- **Status:** Accepted
- **Date:** 2026-06-06
- **Deciders:** Hakan Kilic, Architecture Review v1.1

## Context

The MFS-Operations project has had a Lego principle in `CLAUDE.md` from day one. The contract there (lines 3 to 24) says every external dependency sits behind an interface the app owns, and ends with a rip-out test: _"If I rip out the DB / auth / payment provider tomorrow and replace it, how many files change? The answer must be: one adapter + one config line."_ That contract tells the team what good looks like. It does not tell them how to build it. There are no layer names, no folder layout, no dependency rule the reader can check a pull request against. This ADR records the _how_ so that the contract becomes operational, not aspirational.

The architecture review of 2026-06-06 (v1.1) made the gap concrete. Inside the API layer, 88 route files under `app/api/**` import Supabase directly and call it as if Supabase were the database — there is no shared "database interface" sitting between the routes and the vendor (review lines 24 to 34). On top of that, two parallel access mechanisms live side by side: most routes use `lib/supabase.ts`, but about ten routes plus three email helpers bypass it and hit the Supabase REST endpoint by hand with `fetch` and the service-role key inline (review lines 36 to 69). Vendor types like `SupabaseClient`, `PostgrestResponse`, and `Anthropic.Tool` travel past what should have been adapter boundaries into business code. The team has no shared vocabulary for layer names, no folder layout to point at, no rule that says "vendor SDK imports live here and nowhere else." That is why the rip-out test fails today at roughly 100 files instead of one.

## Decision

The codebase adopts the hexagonal (ports-and-adapters) shape with the following named pieces.

**Layer names.** A `port` is an interface that the app owns, defined in terms of business operations. An `adapter` is a concrete implementation of a port that wraps a specific vendor SDK. A `service` is a piece of business logic that depends on one or more ports and never on a vendor. A `use-case` is a service that orchestrates other services — composition lives here, not inside the services themselves. A `domain type` is a plain TypeScript type owned by the app (e.g. `Order`, `Customer`, `Role`) that never carries vendor shape.

**Folder layout.** Ports live in `lib/ports/`. Adapters live in `lib/adapters/<vendor>/`, with one sub-folder per vendor (`lib/adapters/supabase/`, `lib/adapters/resend/`, `lib/adapters/anthropic/`, and so on). Services live in `lib/services/`. Use-cases live in `lib/usecases/`. Domain types live in `lib/domain/`. This shape is taken directly from the "Target shape" diagram in the architecture review (lines 134 to 171).

**The dependency rule.** Vendor SDK imports — specifically `@supabase/supabase-js`, `resend`, `@anthropic-ai/sdk`, `bcryptjs`, `web-push`, `jspdf`, `xlsx`, `leaflet`, `react-leaflet`, and `dexie` — are permitted inside `lib/adapters/**` and nowhere else. UI components, hooks, API route handlers, services, use-cases, and domain types do not import vendor SDKs. The rule is enforced first by code review, then by ESLint in unit F-04 (Phase 0), then tightened to cover every vendor on the list in F-27 (Phase 5).

**The services-don't-import-services rule.** When one service needs work from another, the composition happens in a `lib/usecases/` use-case that depends on both ports. Services do not import other services directly. This is the "Application core boundary" rule from the architecture review (lines 266 to 268). It exists because once services start calling each other, the dependency graph inside `lib/services/` turns into the same tangle that the migration is trying to undo at the route layer.

**The depth rule.** Port methods expose _business operations_, not 1:1 vendor calls. `OrdersRepository.listDueToday()` is a business operation; `OrdersRepository.from("orders").select("*").eq("due_date", today)` is a leaking vendor call wearing a method name. Every port method must hide at least one non-trivial decision — a join, a filter set, a rollback, a mapping, a guard. Shallow ports that mirror the vendor surface 1:1 are rejected in review. This is the "Port design" rule from the architecture review (lines 247 to 251).

**Vendor types never cross the port boundary.** Inside an adapter, the implementation may use vendor types freely (`SupabaseClient`, `PostgrestResponse`, `Anthropic.Tool`, `Stripe.Customer`). Across the port boundary, only domain types travel. The adapter is the place where mapping happens — vendor row in, domain type out — and the mapping always lives inside the adapter file.

## Consequences

**Easier.** A new engineer reading any service file can describe what it does without knowing which vendor backs the data. Swapping a vendor becomes a localised exercise: write one new adapter file that satisfies the existing port, change one wiring or config line. Testing services becomes trivial — fake adapters held in memory, no database needed for the unit test pass. The team gains a shared vocabulary (`port`, `adapter`, `service`, `use-case`, `domain type`) that makes pull request reviews faster because reviewers and authors are pointing at the same things with the same names.

**Harder.** Every new feature now requires defining a port before writing the adapter that satisfies it. There is real upfront design cost that did not exist when routes called Supabase directly. Shallow ports — the ones that just rename `select()` to `list()` — will be constantly tempting, especially under deadline pressure, and must be rejected in review. The rule "services do not import services" will feel pedantic in early stages and only pays off once two or three services exist that need to compose; teams that abandon the rule under pressure end up rebuilding the tangle they came here to escape.

**Security and operational.** No immediate shift on the day this ADR lands — the model is recorded, not enforced. Enforcement arrives via F-04 (the first ESLint guard, Phase 0) and is completed in F-27 (Phase 5, the moment the rip-out test becomes a CI gate rather than a review discipline). The companion ADR-0004 covers the parallel security work (RLS vs service-role) that runs on its own track alongside this shape change.

## Amendment — composition roots (`lib/wiring/`), 2026-06-12

The F-09 gate audit (`docs/anvil/2026-06-11-f-09-rip-out-audit.md`) found that the original shape left wiring unspecified, and the F-07 "factory + pre-wired singleton" template scattered vendor wiring across every service and use-case file — four wiring sites for Orders against the rip-out test's mandated one. F-TD-11 (PR #29) adds the missing piece:

**The wiring rule.** A `composition root` is the one business-layer file, per domain, where concrete adapters are connected to service and use-case factories. Composition roots live in `lib/wiring/<domain>.ts` (`lib/wiring/orders.ts`). They are the ONLY files outside `lib/adapters/**` permitted to import from `lib/adapters/**`. Services and use-cases export factories only — never pre-wired singletons; routes import the ready-made singletons from the composition root. Enforced by an ESLint `no-restricted-imports` override on `lib/services/**` + `lib/usecases/**`, itself pinned by `tests/unit/lint/no-adapter-imports.test.ts` (which loads the real `.eslintrc.json`, so weakening the rule fails the unit suite).

This is what makes the rip-out test's required answer — one adapter folder + one wiring line — structurally true rather than aspirational: the "one config line" of the CLAUDE.md contract now has a named home.

## References

- `CLAUDE.md` lines 3 to 24 — the Lego principle contract this ADR formalises.
- `docs/architecture-review-2026-06-06.md` "Target shape" (lines 134 to 171), "Cross-cutting design rules" (lines 242 to 290), "Migration strategy" (lines 210 to 219).
- ADR-0003 — Strangler-fig migration and FREEZE rule (the _how_ this shape is rolled in, domain by domain).
- ADR-0004 — RLS vs service-role security model (the parallel safety track).
- John Ousterhout, _A Philosophy of Software Design_ (2nd ed., 2021). Principles cited by name and applied here: _deep modules_ (section 3 — ports are deep, interface complexity is small relative to functionality hidden), _information hiding_ (section 4 — each adapter owns one decision about which vendor to use), _pull complexity downward_ (principle 10 — the adapter eats the mapping so the service stays simple), _define errors out of existence_ (principle 11 and section 5 — port shapes like `getById(): Order | null` push the team toward designs where the error case is normal control flow), and _design it twice_ (principle 12 — every new port has two sketched options before the type is committed). Reference at `~/.claude/skills/saas-consultant/references/aposd-principles.md`.
