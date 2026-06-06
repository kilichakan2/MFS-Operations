# ADR-0003 — Strangler-fig migration and FREEZE rule

- **Status:** Accepted
- **Date:** 2026-06-06
- **Deciders:** Hakan Kilic, Architecture Review v1.1

## Context

The architecture review of 2026-06-06 (v1.1) gave the rip-out test an honest answer: replacing Supabase tomorrow would change about 100 files (review line 14). Not the "one adapter plus one config line" the `CLAUDE.md` contract demands. The shape this codebase needs is recorded in ADR-0002 (ports, adapters, services, use-cases, domain types). The question this ADR answers is *how* the codebase moves from where it is today to that shape, given the constraints — a live production system, a single engineer working with Claude, 88 API route files that reach Supabase directly, and zero room for downtime.

A big-bang rewrite is the worst option available. With 88 routes, two parallel access mechanisms, vendor types leaking past would-be adapters, and a live production deployment used daily, an attempt to refactor everything in one cycle would mean weeks of broken builds, regressions in domains no one is currently touching, and a code review surface large enough that nobody could meaningfully review it. The blast radius of one wrong adapter would be the entire app at once. There is no rollback path that is not "revert the whole rewrite."

The architecture review identified the right alternative explicitly: Martin Fowler's strangler-fig pattern, applied domain by domain (review lines 210 to 219). The new layer (ports, adapters, services) is built alongside the existing code. One bounded context at a time is rewritten to use the new layer. Old patterns and new patterns coexist while the migration is in flight. The same review found the right first domain: **Orders**. It is 5 route files, the team shipped it recently and the logic is fresh in head, there is already a `lib/orders/` subdirectory it lives in, and it is contained enough that the rip-out can be proven end-to-end without dragging the rest of the app along (review lines 322 to 328, F-05 to F-08 in Phase 1).

## Decision

The codebase migrates to the ADR-0002 shape one bounded context at a time using the strangler-fig pattern. The new layer (`lib/ports/`, `lib/adapters/supabase/`, `lib/services/`, `lib/usecases/`, `lib/domain/`) is built alongside existing code; nothing in routes that have not yet been migrated changes. This follows the "Migration strategy" section of the architecture review (lines 210 to 219).

**Orders is migrated first.** F-05 defines the Orders, Customers, and Products ports plus the matching domain types (interface comment before the type, depth rule applied, design-it-twice on every port shape). F-06 implements the Supabase adapters for those ports and ships the contract test suite. F-07 implements `OrdersService` containing the business logic currently inline in `app/api/orders/route.ts:103-183` (verify customer, verify products, create with rollback). F-08 rewrites all 5 orders routes to be thin handlers (target ≤ 20 lines each) that call `OrdersService`. The full unit sequence is documented in the architecture review at Phase 1 (lines 322 to 328).

**FREEZE rule.** Once F-04 (the ESLint guard that forbids `from "@supabase/supabase-js"` outside `lib/adapters/supabase/**` and `lib/supabase.ts`) ships in Phase 0, no new code may import the Supabase SDK outside the adapter folder. The lint guard freezes the existing surface area at its current 88-route footprint so the migration can drain it without anyone backfilling. New routes added during the migration period either go straight through the new layer or stop. F-04 lands as part of the Phase 0 work (architecture review line 310); F-27 in Phase 5 (line 360) tightens the same rule to cover every vendor SDK on the list, at which point the rip-out test becomes a CI-enforced guarantee rather than a review discipline.

**Contract tests on every port.** One shared test suite per port lives in `lib/ports/__contracts__/`. Both the real Supabase adapter and an in-memory fake (e.g. `FakeInMemoryOrdersRepository`) must pass the same suite. A pull request that adds a new adapter without a green contract suite is blocked. This is the "Tests at the seam" rule from the architecture review (lines 271 to 274), reinforced in F-06 (line 325). The point of the rule is operational: fakes used by service unit tests stay honest by being held to the same shape contract as the production adapter, so a service that passes its tests against the fake will behave the same against the real adapter when wired end-to-end.

**Dependent units.** The migration is composed of the following named work units. Each is its own pull request, mergeable independently, ANVIL-gated on its own.

- **F-04** — ESLint lint guard for Supabase imports (Phase 0). The FREEZE rule activates the moment this lands.
- **F-05** — Orders/Customers/Products ports and domain types (Phase 1).
- **F-06** — Supabase adapters for the Phase 1 ports, plus the shared contract test suite.
- **F-07** — `OrdersService` with the business logic from `app/api/orders/route.ts:103-183`, throwing typed errors from `lib/errors/` (which the companion unit F-FND-02 ships).
- **F-08** — Thin rewrites of the 5 Orders route files, with inbound zod validation and idempotency keys on create operations.
- **F-09** — ANVIL gate: Orders rip-out test passes (audit, report-only, not a code change).
- **Phase 3 domains** — F-13 Users + Auth, F-14 Routes, F-15 Pricing, F-16 Cash, F-17 Compliments + Complaints, F-18 Visits / Screen 3, F-19 HACCP (the largest, ~30 routes, split into sub-domains), F-20 Admin, F-21 Dashboard (blocked on most of Phase 3 because its handler queries 12 different domains). Sequence and sizes documented in the architecture review at lines 336 to 348.
- **F-27** — Phase 5 lint tightening. The Lego principle gains CI teeth here (architecture review line 360).

## Consequences

**Easier.** Every pull request stays small, reviewable, and mergeable on its own merits. Each domain has its own ANVIL gate keyed off its own rip-out test, so a regression in Orders cannot land hidden inside a Customers refactor. Rollback is per-domain, not catastrophic — reverting one domain's adapter does not unwind the rest. The team gets a steady cadence of "this domain is now Lego-clean" wins rather than waiting eight to twelve weeks for a single big release.

**Harder.** The migration lives in flight for roughly eight to twelve weeks (architecture review estimate, ~36 PRs total). During that window, two patterns — old route-direct-to-Supabase and new route-via-service — coexist in the codebase. A new contributor reading the orders code sees the new shape; reading the cash code sees the old shape; reading the dashboard code sees both at once. New engineers may copy the old pattern by accident, especially when working in a domain that has not been migrated yet. The mitigation is the F-04 lint guard, which from the moment it lands prevents any *new* file outside the adapter folder from importing the Supabase SDK.

**Security and operational.** The parallel safety track (ADR-0004 and Phase 0.5 in the architecture review) runs alongside this migration rather than sequentially after it, so the RLS work is not blocked by the Lego work. The observability scaffolding from F-FND-03 lands before any domain migration so that correlation IDs thread through both old and new patterns from day one — there is never a moment where the migration introduces a routing layer that the logs cannot trace. Inbound zod validation and idempotency keys (architecture review lines 254 to 256) become the per-route requirements once a domain is migrated.

## References

- `docs/architecture-review-2026-06-06.md`:
  - "Migration strategy — strangler fig, never big-bang" (lines 210 to 219).
  - Phase 0 quick wins, including F-04 lint guard (lines 306 to 310).
  - Phase 1 Orders sequencing, F-05 to F-08 (lines 322 to 328).
  - Phase 3 remaining domains, F-13 to F-21 (lines 336 to 348).
  - Phase 5 lint tightening, F-27 (line 360).
  - "Tests at the seam" cross-cutting rule (lines 271 to 274).
- ADR-0002 — Hexagonal shape and naming (the *what* this ADR is the *how* of).
- ADR-0004 — RLS vs service-role security model (the parallel safety track that runs alongside).
- Martin Fowler, *StranglerFigApplication* essay (the named pattern this ADR uses).
- John Ousterhout, *A Philosophy of Software Design*. Principles cited by name and applied here: *complexity is incremental* (principle 1 — the strangler-fig is this principle applied at architectural scale, because every increment is a small, reviewable PR rather than one large rewrite), and *strategic versus tactical* (section 8 — the whole rationale for choosing the slower domain-by-domain path over a fast rewrite is the strategic argument). Reference at `~/.claude/skills/saas-consultant/references/aposd-principles.md`.
