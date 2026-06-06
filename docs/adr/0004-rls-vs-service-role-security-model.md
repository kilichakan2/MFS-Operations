# ADR-0004 — RLS vs service-role security model

- **Status:** Accepted
- **Date:** 2026-06-06
- **Deciders:** Hakan Kilic, Architecture Review v1.1

## Context

The architecture review of 2026-06-06 (v1.1) found a single security model running through the entire MFS-Operations API: every route uses the Supabase **service-role key** to talk to the database. Critical Finding C3 (review lines 71 to 75) records the consequence. The service-role key bypasses Postgres Row-Level Security (RLS) entirely. The database trusts whatever the application says about who the caller is. Postgres has no opinion on whether a logged-in driver is allowed to read a manager's data — the only thing standing between a misrouted request and a data leak is a hand-rolled role check in the route handler. Across the 88 routes counted in Critical Finding C1, those role checks are duplicated 88 times. One missed check, one off-by-one allow-list, one route that forgot to call the helper, and a user reaches data they should not see. There is no database-level safety net.

A second piece of context matters. The comment at `lib/supabase.ts:9` claims the client is "Centralised here so the key rotation or URL change needs only one edit." That comment is factually false (Critical Finding C2, review lines 36 to 69). Fourteen files hardcode the URL and the service-role key inline, bypassing the centralised module entirely. The security model is therefore not only "service-role everywhere" but "service-role everywhere through fourteen different code paths." Cleaning that up is the prerequisite for any reasoned move to RLS, because RLS work only matters if every code path actually reaches the database through the per-request authenticated client.

The trade-off is explicit. Service-role-everywhere is *fast*: the application trusts itself, there is no JWT verification on the database side, and a developer adding a new route does not need to think about RLS policy. It is also *fragile*: the database trusts the application, so a single bug in application-level auth becomes a data leak with no fallback. RLS-on flips the model to defence in depth — the application enforces auth at the route edge, and the database enforces it again on every query. A missed application check becomes a denied query, not a leak. The cost of that defence is real and is described in the consequences below.

The architecture review's multi-tenancy and data isolation dimension (the SaaS killer — see `~/.claude/skills/saas-consultant/references/architecture-review.md`) scores this category as the highest-leverage security improvement in the migration. ADR-0004 records the chosen model.

## Decision

**Current state (the baseline this ADR migrates away from).** Every API route imports and uses `supabaseService` from `lib/supabase.ts:15`. Eighty-eight routes hand-roll their own role check before doing any work. Postgres RLS policies are dormant or partially configured on the tables holding user, customer, order, and operational data. The `lib/supabase.ts:9` comment claiming centralisation is incorrect — 14 files inline the URL and service-role key in their own `fetch` calls (Critical Finding C2). This ADR records the baseline so future readers understand both where the model started and the dishonest comment that made it look more controlled than it was.

**Target state.** RLS is enabled by default on every table holding user, tenant, or operational data. The default Supabase client for all user-facing API routes is a per-request **authenticated** client built from the anon key plus the user's JWT — that is, the client that Postgres will evaluate RLS policies against. The service-role client remains available, but only behind an explicit `requireServiceRole()` helper, and only inside admin-tagged routes (e.g. routes living under `lib/admin/` or an equivalent admin boundary). Code outside that boundary cannot reach the service-role client; the lint rule introduced in F-04 and tightened in F-27 (architecture review lines 310 and 360) enforces this once it is in place.

**Phase 0.5 sequencing — parallel safety track, not after the Lego refactor.** The RLS work runs alongside Phase 1 onward of the Lego migration described in ADR-0003, not sequentially after it. The architecture review records this at lines 312 to 320. The work units are:

- **F-RLS-01 — RLS audit and threat model.** Run Supabase `get_advisors` via MCP. For every table holding user, customer, or operational data, document current RLS state (on/off, policies present, who can reach the table), who the legitimate callers are, and what a missed application-level check would leak. Output is `docs/rls-audit-2026-06-06.md`. Docs-only pull request, starts in parallel with F-01 of Phase 0.
- **F-RLS-02 — Per-table expand-contract plan.** For each table, document the target policy, the migration order (enable RLS, add policy, switch reads, switch writes, remove the service-role fallback), and the rollback path. Docs-only pull request.
- **F-RLS-03 — Introduce the per-request authenticated Supabase client.** A new `AuthenticatedDbAdapter` (or equivalent) becomes the default that ports depend on. `supabaseService` stays available but is marked "admin paths only" in review. No table policies change in this unit; the goal is to put the new client in place so that subsequent units can switch one table at a time.
- **F-RLS-04 through F-RLS-n — Migrate tables to RLS one bounded context at a time.** Sequenced to align with the matching Lego phase from ADR-0003: Orders RLS lands alongside Phase 1 (F-05 to F-08), Users RLS lands alongside F-13, and so on through each domain. Each migration is its own pull request with its own rollback path.
- **F-RLS-final — Retire service-role from all user-facing paths.** The service-role client remains only inside admin-tagged routes, behind `requireServiceRole()`. The F-04 / F-27 lint rule is tightened in the same pull request to forbid service-role imports outside `lib/admin/`.

**Accepted risk window.** Between today and F-RLS-final shipping, the production database remains "trust the application." This ADR acknowledges that explicitly and lists the mitigations that hold during the window: the `requireRole()` helper from F-03 standardises the application-level role check so that new code does not invent its own; the F-04 lint guard freezes the service-role surface area after Phase 0 lands so that no new route is added on the old pattern; and the RLS audit document from F-RLS-01 is visible to the whole team so that everyone knows which tables are still application-trust-only.

**Interleave with Lego phases.** The coupling between RLS work and Lego work is deliberate. Each F-RLS-NN runs as the matching Lego domain's ports and adapters land — so when Orders ports go in (F-05/F-06), Orders RLS goes on (F-RLS-04). The reason: shipping a domain with one half of the seam done and the other half not creates a window where the Lego refactor looks finished but the security model is still trust-the-app. Coupling the work prevents that.

## Consequences

**Easier.** Once F-RLS-final lands, a missed role check in application code stops being a data leak. The database refuses the query at the policy boundary instead of returning the wrong tenant's rows. New engineers stop hand-rolling auth: the pattern becomes "thread the user JWT through to the adapter, let RLS do the rest." The security model becomes legible — a reviewer can read a route handler and trust that RLS will catch what the route missed, rather than reading every line looking for an absent `requireRole` call.

**Harder.** Per-request authenticated Supabase clients add latency on every query (the JWT must be verified, and Postgres must evaluate the policy). The route must thread the user JWT through to the adapter, which means the `Caller` context from F-FND-03 (observability scaffolding) becomes load-bearing — it is what carries the JWT down through services and ports. Every RLS policy is a SQL artefact that lives in a migration with its own forward and rollback path. Admin paths require a deliberate, explicit escape hatch (`requireServiceRole()`) which is more verbose than today's "everything is service-role" default. The expand-contract sequencing for each table is six steps long (enable RLS, add policy, switch reads, switch writes, remove service-role fallback, retire helper) and skipping any of them risks breaking production.

**Security and operational.** This is the largest single security improvement in the entire migration. The accepted risk window is real and is called out explicitly so it cannot be forgotten — between this PR landing and F-RLS-final shipping, the production database trusts the application. F-RLS-01 (the audit) is therefore the highest-priority parallel work; until the audit document exists, the team is reasoning about the risk window without per-table evidence. Operationally, the model after F-RLS-final makes admin auditing easier: the only places service-role is used are the admin-tagged routes, and they are explicit at the call site.

## References

- `docs/architecture-review-2026-06-06.md`:
  - Verdict, last paragraph on service-role and dormant RLS (line 18).
  - Critical Finding C3, "Service-role key is the only auth path; database RLS is effectively dormant" (lines 71 to 75).
  - Critical Finding C2, "Two parallel Supabase access mechanisms (the centralised client is a lie)" (lines 36 to 69) — the lying-comment context this ADR also records.
  - Phase 0.5 — Parallel safety track, F-RLS-01 through F-RLS-final (lines 312 to 320).
- `lib/supabase.ts:9` — the comment claiming centralisation; this ADR records that the comment is factually false at the time of writing and that F-RLS-final retires the underlying pattern.
- `lib/supabase.ts:15` — the service-role client this ADR migrates away from for user-facing routes.
- `CLAUDE.md` — the Lego principle contract; this ADR's authenticated-client work runs in parallel with the shape change in ADR-0002 and the migration plan in ADR-0003.
- ADR-0002 — Hexagonal shape and naming (the `AuthenticatedDbAdapter` and `requireServiceRole()` helper are concrete examples of the shape this ADR depends on).
- ADR-0003 — Strangler-fig migration and FREEZE rule (the matching Lego phases each F-RLS-NN interleaves with).
- `~/.claude/skills/saas-consultant/references/architecture-review.md` — review dimension B, "Multi-tenancy and data isolation — *the SaaS killer*," which scores RLS-on as a core SaaS readiness criterion.
