# ADR-0008 — RLS-final: service-role allow-list and posture seal

- **Status:** Accepted
- **Date:** 2026-06-27
- **Deciders:** Hakan Kilic, FORGE F-RLS-final

> The single EXECUTABLE source of truth for the allowed service-role routes is the
> two in-file allow-lists (`RULE_A_ALLOWLIST` + `RULE_B_ALLOWLIST`) in
> `tests/unit/lint/no-service-role-in-user-routes.test.ts`. The prose register
> below is the human-readable copy — **keep it in sync when you edit the test.**

## Context

F-RLS-04a–i cut the user-facing API routes onto per-request, RLS-enforcing
`…ForCaller(userId)` factories — the badge-checked door. Postgres now decides,
per row, who may read or write, based on the `app.current_user_id` GUC the
request carries. (See ADR-0004 for the model and ADR-0007 for the token/GUC
bridge that delivers the identity.)

What remained after that cutover was NOT the big migration the original plan
imagined — it was already ~90% done. What remained was a small, deliberate set of
routes that still reach the database **master key**: the service-role Supabase
client, which **bypasses RLS entirely**. Each of those is a legitimate exception
(admin surfaces, cron jobs, pre-auth credential reads, a public kiosk, storage
without authenticated policies, cross-rep analytics). The risk is not that they
exist — it is that a NEW route could quietly join them, re-opening the
"trust-the-application" hole ADR-0004 set out to close, with nothing to catch it.

ADR-0004 §Decision named this unit exactly:

> **F-RLS-final — Retire service-role from all user-facing paths.** The
> service-role client remains only inside admin-tagged routes, behind
> `requireServiceRole()`. The F-04 / F-27 lint rule is tightened in the same pull
> request to forbid service-role imports outside `lib/admin/`.

This ADR records what was actually realised, the master-key register, and one
honest amendment to ADR-0004's framing.

### Amendment to ADR-0004 (the `lib/admin/` framing)

ADR-0004 imagined the boundary as a folder (`lib/admin/`) and the guard as an
ESLint `no-restricted-imports` tightening. **There is no `lib/admin/` folder.**
The legitimate master-key users are spread across `app/api/**` — admin, cron,
pre-auth, public-kiosk routes, and routes that reach service-role through a
pre-wired wiring singleton. So an `imports-outside-lib/admin/` ban would have had
nothing coherent to scope to.

The realised guard is therefore an **allow-list-driven unit test that scans
`app/api/**`** (`tests/unit/lint/no-service-role-in-user-routes.test.ts`), NOT a
folder-scoped import ban. `.eslintrc.json` is unchanged — `next build` ignores
ESLint anyway, so a config ban would not gate the build, whereas this test gates
inside the hard unit suite. ADR-0004's "imports outside `lib/admin/`" wording is
hereby read as satisfied by this allow-listed scan. The empty-string GUC
fail-closed property ADR-0007 documents is pinned by
`supabase/tests/017-empty-guc-fails-closed.test.sql`.

## Decision

**Both doors into the master-key vault are watched.** The guard test enforces TWO
rules; a route is an offender on either rule unless it is on that rule's
allow-list:

- **Rule A — direct import.** A route importing `supabaseService` /
  `getSupabaseService` directly from the Supabase client adapter.
- **Rule B — wiring singleton.** A route importing, from `@/lib/wiring/**`, a
  symbol whose name does NOT end in `…ForCaller`. The `…ForCaller` factories are
  the safe per-user (RLS-enforcing) path and are always allowed; any other wiring
  symbol is a pre-wired singleton, presumed to carry the service-role master key
  two hops away inside the wiring, and must be justified here. The detection rule
  is the `…ForCaller`-suffix convention, NOT a hand-maintained list of singleton
  export names (which would drift) — this errs toward requiring a written reason,
  the correct bias for a security seal.

Both allow-lists were regenerated from a live grep at implementation time
(`grep -rn "import.*supabaseService" app/api/` for Rule A;
`grep -rn "from '@/lib/wiring" app/api/`, keeping only non-`ForCaller` symbol
importers, for Rule B).

### Master-key register — Rule A (direct service-role import)

These routes import `supabaseService` / `getSupabaseService` directly. They are
the `RULE_A_ALLOWLIST` set in the guard test.

| Route | Category | Reason | Follow-on ticket |
|---|---|---|---|
| `app/api/reference/route.ts` | system read | Reference-data bootstrap read; consumed pre-/cross-user. | F-RLS-04-reference |
| `app/api/labels/route.ts` | system | Label print path; service-role read of cross-entity data. | F-RLS-04-labels |
| `app/api/screen1/sync/route.ts` | sync/create | Screen-1 sync create-path (cross-cutting writes). | F-RLS-04g / F-TD-31 |
| `app/api/routes/customers/route.ts` | admin/routes | Route-planning admin surface (path-gated to admin by `middleware.ts`). | F-RLS-04-routes |
| `app/api/routes/customers/[id]/route.ts` | admin/routes | As above. | F-RLS-04-routes |
| `app/api/routes/optimise/route.ts` | admin/routes | Route optimiser (admin). | F-RLS-04-routes |
| `app/api/routes/users/route.ts` | admin/routes | Route assignment user list (admin). | F-RLS-04-routes |
| `app/api/routes/compute-road-times/route.ts` | admin/routes | Road-time compute (admin). | F-RLS-04-routes |
| `app/api/notifications/unsubscribe/route.ts` | system | Push-subscription delete (no logged-in RLS context guaranteed). | F-RLS-04-notifications |

### Master-key register — Rule B (wiring-singleton import)

These routes import at least one non-`…ForCaller` wiring symbol. They are the
`RULE_B_ALLOWLIST` set in the guard test. (Routes that import ONLY `…ForCaller`
factories are the safe path and are not listed.)

| Route | Category | Reason | Follow-on ticket |
|---|---|---|---|
| `app/api/auth/login/route.ts` | pre-auth | Must read ANY user's credential before a session exists. | n/a (by design) |
| `app/api/auth/kds-pin/route.ts` | pre-auth | PIN credential read before a session exists. | n/a (by design) |
| `app/api/auth/haccp-admin/route.ts` | pre-auth | Session-token mint/verify before a user context exists. | n/a (by design) |
| `app/api/auth/type/route.ts` | pre-auth | User lookup before session (login-type probe). | n/a (by design) |
| `app/api/auth/team/route.ts` | pre-auth | Team list read (auth bootstrap). | n/a (by design) |
| `app/api/auth/haccp-team/route.ts` | pre-auth | HACCP team read (auth bootstrap). | n/a (by design) |
| `app/api/haccp/visitor/route.ts` | public kiosk | Visitor sign-in pad; no logged-in user. | n/a (by design) |
| `app/api/kds/orders/route.ts` | wiring singleton | KDS queue read (kds usecase; cross-rep kitchen view). | F-RLS-04-kds |
| `app/api/kds/lines/[lineId]/done/route.ts` | wiring singleton | KDS line done (kds usecase). | F-RLS-04-kds |
| `app/api/kds/lines/[lineId]/undo/route.ts` | wiring singleton | KDS line undone (kds usecase). | F-RLS-04-kds |
| `app/api/orders/route.ts` | wiring singleton | Orders POST-create; idempotency atomicity (`order_idempotency_keys` is RLS-deny-all). | F-RLS-04a-create |
| `app/api/screen3/today/route.ts` | wiring singleton | Screen-3 read (today aggregate, cross-rep). | F-RLS-04g / F-TD-31 |
| `app/api/screen3/sync/route.ts` | wiring singleton | Screen-3 sync create-path; audit_log + customer lookup cross-cutting. | F-RLS-04g / F-TD-31 |
| `app/api/cash/upload/route.ts` | storage | `cash-attachments` bucket has no authenticated storage policies. | F-RLS-04-cash-storage |
| `app/api/dashboard/route.ts` | wiring singleton | Admin dashboard aggregation (cross-rep analytics). | F-RLS-04-dashboard |
| `app/api/detail/discrepancy/route.ts` | wiring singleton | Discrepancy detail read (admin drill-down). | F-RLS-04-discrepancies |
| `app/api/admin/import/route.ts` | wiring singleton | Wires the LLM-extractor singleton (non-DB port). | F-RLS-04-import |
| `app/api/admin/customers/[id]/route.ts` | wiring singleton | Geocoder singleton (non-DB port) in customer edit. | F-RLS-04-geocoder |
| `app/api/admin/import/confirm/route.ts` | wiring singleton | Geocoder singleton (non-DB port) in confirm import. | F-RLS-04-geocoder |
| `app/api/admin/geocode-all/route.ts` | wiring singleton | Geocoder singleton (non-DB port) in geocode-all. | F-RLS-04-geocoder |
| `app/api/admin/runs/route.ts` | wiring singleton | Routes service (admin run-plan read). | F-RLS-04-routes |
| `app/api/admin/runs/[id]/route.ts` | wiring singleton | Routes service (admin run-plan read by id). | F-RLS-04-routes |
| `app/api/routes/route.ts` | wiring singleton | Routes service (route list read). | F-RLS-04-routes |
| `app/api/routes/today/route.ts` | wiring singleton | Routes service (today's route read). | F-RLS-04-routes |
| `app/api/routes/[id]/route.ts` | wiring singleton | Routes service (route by id). | F-RLS-04-routes |
| `app/api/pricing/[id]/route.ts` | wiring singleton | Pricing activation email (fire-and-forget; no request user). | F-RLS-04-pricing-email |
| `app/api/pricing/[id]/lines/replace/route.ts` | wiring singleton | Pricing service (bulk line replace). | F-RLS-04-pricing |
| `app/api/notifications/vapid-key/route.ts` | wiring singleton | `pushSender` (web-push port, non-DB) vapid-key read. | F-RLS-04-push |
| `app/api/notifications/subscribe/route.ts` | wiring singleton | `pushSubscriptions` repo upsert (no guaranteed RLS context). | F-RLS-04-notifications |
| `app/api/cron/purge-idempotency-keys/route.ts` | cron/system | CRON_SECRET-gated; no user context. | n/a (system) |
| `app/api/cron/haccp-alarm/route.ts` | cron/system | CRON_SECRET-gated; no user context. | F-PROD-03 (vercel.json) |

> **Honest note on Rule B breadth.** The Rule-B detection is convention-based: it
> flags EVERY non-`…ForCaller` wiring import, regardless of whether that specific
> singleton actually touches the service-role client. Some entries above (e.g.
> `geocoder`, `pushSender`) wire non-DB ports and do not themselves hold the
> master key — they are listed because the suffix convention is the discriminator,
> and a written reason for any non-badge-checked wiring import is the deliberate,
> security-correct bias. Tightening individual entries onto `…ForCaller` (or
> proving they are master-key-free) is the per-route follow-on work above.

### Both doors are watched (closes F-RLS-wiring-guard)

The wiring-singleton vector (Rule B) is enforced by THIS guard, not merely
documented. The follow-on ticket **F-RLS-wiring-guard is therefore CLOSED** —
there is no separate "watch the back office later" work item; both doors are
covered now.

The single remaining documented edge is a **three-hop** path: a route that
imports a *service* (not a wiring singleton) which itself internally wires a
service-role singleton. The route-level scan cannot see a master key three hops
away. This is low-priority and recorded here as the one residual edge; if it ever
becomes load-bearing, the mitigation is a wiring-graph-aware check, not a
route-level scan.

### What this unit did NOT do

- No route was edited. The legitimate routes were NOT "made explicit" by swapping
  their `supabaseService` import for `requireServiceRole()` — that behaviour-neutral
  refactor is deferred (follow-on **F-RLS-final-explicit**).
- `requireServiceRole()` already exists
  (`lib/adapters/supabase/authenticatedClient.ts`) and was not recreated.
- `.eslintrc.json` was not touched; no migration was added; no dependency changed.
  The shipped bundle is byte-identical (`tests/**` and `supabase/tests/**` never
  ship; `next build` ignores ESLint).

## Consequences

**Easier.** A NEW service-role route — on either door — is now a RED unit test
with a precise message naming the offending route and pointing the author at the
safe `…ForCaller` path or at this register. It was previously invisible. Every
master key in the system is auditable in one place (this register + the two
allow-lists). The empty-GUC fail-closed property is pinned, so a future change
that would flip a deny into a leak (e.g. wrapping `is_admin()` in `nullif`) breaks
a test instead of shipping silently.

**Harder.** The prose register above must be kept in sync by hand when the
allow-lists in the test change (the test is authoritative; this is the copy). The
allow-lists are larger than a "handful" — Rule B in particular lists 31 routes —
which honestly reflects how much of the system still reaches a singleton; the
per-route follow-on tickets above are the path to shrinking it. The three-hop edge
remains uncaught (documented above).

## References

- ADR-0004 — RLS vs service-role security model (the posture this ADR seals; the
  `lib/admin/`-folder framing this ADR amends).
- ADR-0002 — Hexagonal shape and naming (`requireServiceRole()`, `…ForCaller`
  factories, the `lib/wiring/` composition root).
- ADR-0003 — Strangler-fig migration and FREEZE rule (the F-RLS-04 per-domain
  sequencing whose tail this unit seals).
- ADR-0007 — App-minted token and GUC bridge for RLS (the empty-string GUC
  fail-closed value this unit pins).
- `tests/unit/lint/no-service-role-in-user-routes.test.ts` — the executable
  source of truth for both allow-lists (the guard).
- `supabase/tests/017-empty-guc-fails-closed.test.sql` — the empty-GUC
  fail-closed pin.
- `lib/adapters/supabase/authenticatedClient.ts` — `requireServiceRole()` (the
  named master-key escape hatch) and `authenticatedClientForCaller()` (the safe
  per-request client).
