# F-RLS-final — RLS posture seal: regression guard + posture ADR + empty-GUC pin

- **Date:** 2026-06-27
- **Unit:** F-RLS-final (Day 16 sealing security unit, last of the RLS line F-RLS-04a–i)
- **Author:** forge-planner
- **Gate-1 spec status:** Hakan-approved (locked). Frame OVERTURNED the brief — the
  big service-role cutover is ~90% done; the real deliverable is a regression GUARD
  + posture doc + safety pin, exactly the F-27 shape.
- **Type:** config / test / docs ONLY. ZERO runtime code, NO migration, NO behaviour
  change, NO new dependency.

🗣 In plain English: the dangerous work (switching the database to enforce who-can-see-what
itself, instead of trusting the app) already shipped over the last nine units. This unit
installs the smoke detector so nobody can quietly undo it, writes down which doors are
*deliberately* left with a master key, and adds one test proving the lock fails shut when
nobody is logged in. We touch no live code.

---

## ⚠️ Frame-correction flags (read before implementing — recon brief diverged from the tree)

Two recon-brief claims did NOT survive verification against the actual code. Both are
load-bearing for the deliverables. **Neither is a code defect — both are spec-precision
corrections the implementer must honour.** Details in the Risk Assessment (R1, R2).

1. **"Only 3 user-facing routes still use a service-role singleton."** FALSE as stated.
   **9 routes still import the `supabaseService` service-role client DIRECTLY** (verified
   `grep -rn "import.*supabaseService" app/api/`):
   `app/api/labels`, `app/api/screen1/sync`, `app/api/routes/customers`,
   `app/api/routes/customers/[id]`, `app/api/routes/optimise`, `app/api/routes/users`,
   `app/api/routes/compute-road-times`, `app/api/notifications/unsubscribe`,
   `app/api/reference`. The brief's 3 named routes (`orders`, `screen3/sync`, `cash/upload`)
   do NOT import `supabaseService` directly — they reach service-role through a **wiring
   singleton** (e.g. `ordersService` vs the safe `ordersServiceForCaller`). So the allow-list
   has to cover BOTH families, and the guard's scan surface must be chosen deliberately
   (see "Guard mechanism" below). The allow-list is LARGER than the brief implied.
   🗣 The brief undercounted the doors with master keys. We must list every one of them, or
   the guard goes red on day one (false-red) or, worse, we leave one off the list and the
   guard never protects it.

2. **"Empty GUC fails CLOSED with NO 22P02 cast error."** TRUE for only 2 of the relevant
   policies. The baseline RLS policies split into two shapes:
   - `customers_select` / `products_select` — TEXT *presence* check
     (`current_setting(...) IS NOT NULL AND <> ''`), NO cast → empty GUC returns an EMPTY
     result set (clean deny, no error). ✅ matches the brief.
   - `visits_select` / `users_select` / `complaints_select` / `discrepancies_select` /
     `audit_log_select` — predicate `… OR is_admin()`, and `is_admin()` (baseline.sql L181-187)
     does a **bare** `current_setting('app.current_user_id', true)::uuid` with NO `nullif`.
     `''::uuid` raises **22P02**. So an empty GUC on these tables THROWS 22P02 — which still
     **denies** (the query errors out, no rows leak) but does NOT "return empty, no error."
   The pin test must therefore assert the ACTUAL per-table behaviour, not a single uniform
   claim. Both outcomes are fail-CLOSED (no data leaks either way) — that is the property the
   pin really proves. The `nullif`-wrapped path the brief cited
   (`20260618130000_…::uuid` via `public.current_user_is_valid()`) is the directory-read
   ADDENDUM, not the baseline policies.
   🗣 "Fails shut" is true everywhere — but on most tables it slams shut by throwing an error,
   not by politely returning nothing. The pin must tell the truth about which tables do which,
   or it's a lie that future readers will trust.

---

## 🔶 GATE-2 AMENDMENT (Hakan-approved 2026-06-27) — COMPLETE TWO-VECTOR SEAL (overrides Rule B)

**This block OVERRIDES the plan wherever it treats the wiring-singleton vector as a documented
limitation (Deliverable 1 "Rule B", R3, R-guard-scope, the ADR "Rule-B limitation", the
follow-on F-RLS-wiring-guard).** Hakan chose the COMPLETE two-vector seal: a guard that watches
ONLY the direct-import door is not a real seal. Rule B is now **ENFORCED by the scan**, not
documented-and-deferred.

**Rule B (NOW ENFORCED) — wiring-singleton imports in routes.** The guard test additionally
flags any `app/api/**/route.ts` that imports, from `@/lib/wiring/**`, a symbol that is **NOT a
`…ForCaller` factory**, unless that route is on the wiring-singleton allow-list.

- **Detection rule (chosen for robustness, no brittle hand-list):** `…ForCaller`-suffixed
  imports from `lib/wiring` are the SAFE per-user path and are always allowed. ANY other symbol
  imported from `lib/wiring` (a pre-wired singleton — `ordersService`, `visitsService`,
  `cashService`, the kds/picking use-cases, etc.) is presumed to carry the service-role master
  key and MUST be justified on the allow-list. This errs toward requiring a written reason — the
  correct bias for a security seal. (Do NOT hand-maintain a list of singleton export *names* —
  the `ForCaller`-suffix convention + the route allow-list is the source of truth, which can't
  drift.)
- **Allow-list now has TWO enforced sections**, BOTH regenerated from grep at implementation time:
  - **Direct-import (Rule A):** seed from `grep -rn "import.*supabaseService" app/api/` (the 9).
  - **Wiring-singleton (Rule B):** seed from `grep -rn "from '@/lib/wiring" app/api/`, then for
    each hit keep only routes importing a NON-`ForCaller` symbol. Expected core set:
    `orders` (POST-create), `screen3/sync`, `cash/upload` — PLUS any cron/email/system route that
    imports a wiring singleton (e.g. `cron/purge-idempotency-keys`, `cron/haccp-alarm`). Each
    entry carries its reason + follow-on ticket exactly like Rule A.
  - **If grep surfaces a wiring-singleton route NOT anticipated here, STOP and escalate to the
    conductor** (same discipline as Rule A) — do not silently auto-add.
- **False-green for Rule B:** a future dev adds `app/api/leak/route.ts` with
  `import { ordersService } from '@/lib/wiring/orders'` (the singleton, not `ordersServiceForCaller`)
  → the wiring-import scan sees a non-`ForCaller` symbol, the route isn't allow-listed → RED. ✅
- **False-red guard:** every CURRENTLY non-`ForCaller` wiring importer is seeded into the
  allow-list from the live grep, so the current tree is GREEN. A red-first fixture (a fake route
  string importing a non-`ForCaller` wiring symbol at a non-allow-listed path) proves it CAN
  go red.
- **R3 / F-RLS-wiring-guard:** the wiring vector is now COVERED in THIS unit, so R3 downgrades to
  "covered — both vectors enforced" and the F-RLS-wiring-guard follow-on is CLOSED (record this in
  the ADR instead of filing it). The only residual gap is a route reaching the key via THREE hops
  (importing a service that internally wires a singleton) — note that as the single remaining
  documented edge, low-priority.
- **ADR-0008 update:** the "Rule-B limitation" / "watches front doors but not back-office" framing
  is REMOVED; the ADR now states BOTH doors are watched, with the two-section allow-list, and
  records the three-hop residual as the only documented edge.
- **Acceptance criteria additions:** the guard's fixture-red case must cover a Rule-B offender
  (non-`ForCaller` wiring import) as well as a Rule-A offender; the live tree returns 0 offenders
  across BOTH rules.

🗣 In plain English: the alarm now watches both ways into the master-key vault — a route grabbing
the key itself (Rule A) AND a route being handed the key through the back-office wiring (Rule B).
Anything that isn't the badge-checked safe door (`…ForCaller`) has to be on the written register,
or the alarm trips. This makes it a real seal, not a half one.

---

## 🔶 GATE-2 AMENDMENT #2 (Hakan-approved 2026-06-27) — RULE C: the raw-env master-key door

**Render surfaced a THIRD master-key vector the plan missed; Hakan chose the COMPLETE
three-door seal.** Some routes do not import the master key at all — they read
`process.env.SUPABASE_SERVICE_ROLE_KEY` directly and paste it into hand-rolled raw-REST fetch
headers. Neither Rule A nor Rule B can see this. Verified live offenders (regenerate from grep
at build time — do NOT trust this list blindly):

- `app/api/screen2/note/route.ts` — raw env key, on NEITHER allow-list (live regression risk)
- `app/api/screen2/resolve/route.ts` — same
- `app/api/screen2/sync/route.ts` — same
- `app/api/screen3/sync/route.ts` — already Rule-B allow-listed (for `visitsService`), also reads raw key
- `app/api/routes/optimise/route.ts` — already Rule-A allow-listed (also imports `supabaseService`)

**Rule C (NOW ENFORCED) — raw-env master-key.** The guard test additionally flags any
`app/api/**/route.ts` that references `SUPABASE_SERVICE_ROLE_KEY` (anchored so a mention in a
COMMENT does NOT trip it — same import/comment discipline as Rules A/B) unless the route is on
the **Rule-C allow-list** (a THIRD section in the in-file allow-list constant).

- **Seed the Rule-C allow-list from `grep -rn "SUPABASE_SERVICE_ROLE_KEY" app/api/`** at build
  time. Each entry carries a reason + follow-on ticket — these raw-REST master-key uses are the
  audit-log / cross-cutting writers tracked under **F-TD-31**, so the follow-on for the screen2/
  screen3 writers is F-TD-31 (their cutover onto an owned port retires the raw key).
- **If grep surfaces a raw-env route NOT in the list above, STOP and escalate** — same discipline
  as Rules A/B.
- **False-green for Rule C:** a future dev adds `app/api/leak/route.ts` reading
  `process.env.SUPABASE_SERVICE_ROLE_KEY` → matched, not allow-listed → RED. ✅
- **False-red guard:** all 5 current raw-env routes seeded into the Rule-C allow-list → current
  tree GREEN. A red-first fixture (fake route string referencing the env key at a non-allow-listed
  path) proves it CAN go red; a comment-only fixture stays GREEN.

**Fold-in #2 (was 🟡 critic finding) — guard the official entry point in Rule A.** Broaden Rule A
to ALSO flag a route importing `requireServiceRole` (from
`lib/adapters/supabase/authenticatedClient.ts`), the ADR-0004-blessed master-key entry point.
No route imports it today (so NO false-red), but the guard must not be silent on the official
path — otherwise a future author uses the "blessed" door and dodges the alarm. Add it to the
Rule-A matcher; no allow-list entry needed yet (zero current users).

**Fold-in #3 (was 🟡) — documented assumption.** All three matchers are single-line (mirroring
`no-disable-arch-rules.test.ts`); a formatter-split multi-line import/reference could evade them.
No live case exists. Record this as an explicit assumption comment in the test header + one line
in ADR-0008's residual section (alongside the 3-hop edge). Not enforced this unit.

**Fold-in #4 (was 🟢, cosmetic) — tighten the 017 comment.** The pgTAP 017 comment over-credits
`is_admin()` for the `users`/`visits` 22P02 throw; the policy's own `user_id = ''::uuid`
left-operand cast is an equal co-cause. The ASSERTIONS are correct — only the comment needs
tightening. Do it while in the file.

**ADR-0008 updates:** add Rule C + its allow-list section to the register; the documented
residual is now (a) the 3-hop path and (b) the multi-line-split evasion — both low-priority.
With Rule C, the ADR states ALL THREE doors are watched.

**Acceptance additions:** the fixture-red case covers a Rule-C offender too; the live tree returns
0 offenders across all THREE rules; full unit suite + tsc + lint still 0/green; pgTAP 017 still green.

🗣 In plain English: the third door is the one where a route copies the master key's password by
hand instead of asking for the key. The alarm now watches that door too, plus the one "official"
way to request the key — so every path to the master key is either the badge-checked safe door or
is on the written register. That's a genuinely complete seal.

---

## Goal

Seal the RLS-vs-service-role security posture so it cannot silently regress, and document
the legitimate master-key exceptions. Three deliverables, all non-runtime:

1. A **regression guard** (unit test) that goes RED if a NEW `app/api/**` route starts using
   a service-role (RLS-bypassing) Supabase client without being on an explicit allow-list.
2. A **posture ADR** enumerating every legitimate service-role user with its reason +
   follow-on ticket (extend ADR-0004's lineage; see "Where the allow-list lives").
3. An **empty-GUC pin** (pgTAP `017-*`) proving the GUC bridge's empty-string default fails
   CLOSED on the RLS tables — pinning existing safety, adding NO migration.

🗣 Install the smoke detector, write the master-key register, and add one test proving the
lock fails shut. Nothing the user can click changes.

---

## Domain terms (plain-English bridge)

- **Service-role client (`supabaseService` / `getSupabaseService` / `requireServiceRole()`)** —
  the database master key. 🗣 A skeleton key that opens every lock and ignores the "who are
  you?" rules. Powerful and necessary in a few system spots; a liability if it spreads.
- **RLS (Row-Level Security)** — Postgres deciding per-row who may read/write, based on the
  `app.current_user_id` it was told. 🗣 The lock on each filing-drawer that checks your badge,
  instead of trusting the clerk to hand you only your own folder.
- **`…ForCaller(userId)` factory** — wiring that builds a client running as the logged-in user
  so RLS fires. 🗣 The badge-checked entrance. The SAFE door — opposite of the master key.
- **GUC (`app.current_user_id`)** — the session variable Postgres reads to know who's asking.
  🗣 The name on the visitor badge. Empty badge = the locks must refuse you.
- **`db_pre_request` bridge** — the hook that copies the verified login into the GUC, and sets
  it to EMPTY STRING when there's no valid login. 🗣 The front-desk that stamps your badge from
  your ID, or leaves it blank if you have none.
- **22P02** — Postgres error "invalid input syntax for type uuid." 🗣 The lock jamming shut
  rather than opening, because the badge was blank. A safe failure (no access) but a noisy one.
- **pgTAP** — SQL unit-testing framework; tests live in `supabase/tests/NNN-*.test.sql`. 🗣 Unit
  tests that run *inside* the database, asserting the locks behave.
- **`no-restricted-imports` (ESLint)** — a config rule banning named imports. 🗣 A bouncer with
  a banned-names list at the import door.
- **Allow-list as single source of truth** — one written list of the deliberate exceptions; the
  guard reads it, nothing else. 🗣 One master-key register; if a key isn't on it, the alarm trips.

---

## Compliance / security flags

- This is a SECURITY-posture unit. Per memory `feedback_forge_anvil_for_production_work`, it
  touches the auth/RLS model, so it runs the FULL FORGE loop + ANVIL — but right-sized
  (UNIT + pgTAP only) because the SHIPPED bundle is byte-identical (next build ignores ESLint;
  `tests/**` and `supabase/tests/**` never ship). See ANVIL matrix.
- HACCP: untouched. No food-safety surface in scope.
- Multi-tenancy / data-isolation (ADR-0004 "SaaS killer" dimension): this unit HARDENS it by
  pinning the posture; it does not change any isolation behaviour.

---

## ADR conflicts

- **No conflict.** ADR-0004 (`docs/adr/0004-rls-vs-service-role-security-model.md`) §Decision
  defines F-RLS-final EXACTLY as: "Retire service-role from all user-facing paths. The
  service-role client remains only inside admin-tagged routes, behind `requireServiceRole()`.
  The F-04 / F-27 lint rule is tightened in the same pull request to forbid service-role
  imports outside `lib/admin/`."
- **One DEVIATION to record in the new ADR (not a conflict — an honest amendment).** ADR-0004
  imagined the boundary as a folder (`lib/admin/`) and the guard as an ESLint
  `no-restricted-imports` tightening. The codebase has NO `lib/admin/` folder; legitimate
  master-key users are spread across `app/api/**` (admin, cron, pre-auth, public-kiosk, and
  wiring singletons). So the realised guard is an **allow-list-driven unit test that scans
  `app/api/**`**, not a folder-scoped import ban. The new ADR must state this amendment
  explicitly so ADR-0004's "imports outside `lib/admin/`" wording is not read as unmet.
  🗣 The original plan assumed all the master keys would live in one room called `lib/admin`.
  They don't — they're scattered for good reasons. So the register lists them by name instead
  of by room. We write that down so nobody thinks we skipped the job.
- ADR-0002 (hexagonal), ADR-0003 (Supabase freeze), ADR-0007 (GUC bridge): consistent, no
  conflict. The pin test asserts ADR-0007's documented fail-closed property.

---

## Where the allow-list lives (single source of truth — decide once)

**Decision: the allow-list is a typed constant INSIDE the guard test file**
(`tests/unit/lint/no-service-role-in-user-routes.test.ts`), mirroring F-27's `ALLOWLIST`
`Set` in `vendor-fence-complete.test.ts`. Each entry carries a one-line reason + follow-on
ticket as a trailing comment. The ADR re-states the SAME list in prose for human readers, and
the guard includes a test asserting the test's allow-list and the ADR are not silently out of
step is OUT OF SCOPE (over-engineering) — instead the ADR header says "the executable source
of truth is the allow-list in `no-service-role-in-user-routes.test.ts`; keep this prose in
sync when you edit it."

🗣 One register, in the test file (because that's the copy the alarm actually reads). The ADR
is the human-readable photocopy with a note saying "the test file is the real one."

Rationale for test-file-over-eslintrc:
- An ESLint `no-restricted-imports` ban on `supabaseService` would need per-file overrides for
  every allow-listed route — 9+ glob entries — which is exactly the brittle, scattered shape we
  are trying to avoid, and `next build` ignores ESLint anyway (so it wouldn't gate the build).
- A single unit test with one in-file allow-list is grep-able, gates inside the hard unit
  suite, and gives a precise RED message naming the offending route. Same pattern already
  proven by `no-adapter-imports.test.ts` (folder-tree import scan) and
  `vendor-fence-complete.test.ts` (in-file allow-list).

---

## Files to ADD

1. **`tests/unit/lint/no-service-role-in-user-routes.test.ts`** — the regression guard.
2. **`supabase/tests/017-empty-guc-fails-closed.test.sql`** — the empty-GUC pin (next number
   after `016-rls-admin-context.test.sql`).
3. **`docs/adr/0008-rls-final-service-role-allowlist-and-posture-seal.md`** — the posture ADR
   (next ADR number after 0007; sibling to ADR-0004, cross-linked).

## Files to EDIT

- **NONE planned.** Default is ZERO route edits (per spec). Do NOT touch `.eslintrc.json`
  (the test-file guard is chosen over the ESLint route). Do NOT recreate `requireServiceRole()`
  (already exists, `lib/adapters/supabase/authenticatedClient.ts:54`). Do NOT "make-explicit"
  the legit routes by swapping their `supabaseService` import for `requireServiceRole()` — that
  is a behaviour-neutral refactor but it is OUT OF SCOPE this unit (spec: "Default to ZERO route
  edits"; logged as follow-on F-RLS-final-explicit below).
- The pgTAP runner picks up `017-*` by glob; verify no manifest needs editing (Step 2.0).

🗣 Three new files, zero edits to anything that runs in production. The safest possible shape
for a security unit on Day 16.

---

## Deliverable 1 — the regression guard (the smoke detector)

### Guard mechanism (chosen, with the false-green analysis)

A vitest test that walks `app/api/**`, reads every `route.ts`, and flags any file that
**imports the service-role client** unless the file's route-path is on the allow-list.

**Scan surface — TWO detection rules (this is the part the recon undercount forces):**

- **Rule A — direct import.** Flag any `app/api/**/route.ts` containing an import of
  `supabaseService` or `getSupabaseService` from `@/lib/adapters/supabase/client` (match the
  import STATEMENT, anchored on `import`, so the names appearing in a comment do NOT trip it —
  exactly the comment-vs-directive discipline `no-disable-arch-rules.test.ts` uses).
  Covers the 9 direct-import routes.
- **Rule B (documented limitation, NOT enforced by scan).** Routes that reach service-role via
  a wiring SINGLETON (e.g. `ordersService`, not `ordersServiceForCaller`) are NOT detectable by
  a route-level import scan — the route imports a wiring symbol, and the master key is two hops
  away inside `lib/wiring/*.ts`. Enforcing those at the route layer would require parsing the
  wiring graph (brittle, over-scoped for this unit). **Decision:** Rule B routes
  (`orders`, `screen3/sync`, and any other singleton-via-wiring service-role user) are
  documented in the ADR allow-list as KNOWN, and the guard's RED message tells a future author
  "if you added a new service-role wiring singleton AND a route that calls it, add it to the
  allow-list and consider a wiring-layer guard (follow-on F-RLS-wiring-guard)." This is an
  HONEST scoping boundary, surfaced as R3 (medium, not must-fix).
  🗣 The smoke detector reliably catches the obvious master keys (a route that grabs the key
  itself). It cannot see a key passed to a route through a back office (the wiring layer); we
  write that gap down rather than pretend it's covered.

**Allow-list contents (route paths that legitimately import the service-role client directly).**
Verify each path still imports `supabaseService` at implementation time (`grep -rn
"import.*supabaseService" app/api/`); seed from this verified set:

| Route (allow-list key) | Category | Reason | Follow-on ticket |
|---|---|---|---|
| `app/api/reference/route.ts` | system read | Reference-data bootstrap read; consumed pre-/cross-user. | F-RLS-04-reference (deferred read cutover) |
| `app/api/labels/route.ts` | system | Label print path; service-role read of cross-entity data. | F-RLS-04-labels |
| `app/api/screen1/sync/route.ts` | sync/create | Screen-1 sync create-path (cross-cutting writes). | F-RLS-04g follow-on / F-TD-31 |
| `app/api/routes/customers/route.ts` | admin/routes | Route-planning admin surface (path-gated to admin by `middleware.ts`). | F-RLS-04-routes |
| `app/api/routes/customers/[id]/route.ts` | admin/routes | As above. | F-RLS-04-routes |
| `app/api/routes/optimise/route.ts` | admin/routes | Route optimiser (admin). | F-RLS-04-routes |
| `app/api/routes/users/route.ts` | admin/routes | Route assignment user list (admin). | F-RLS-04-routes |
| `app/api/routes/compute-road-times/route.ts` | admin/routes | Road-time compute (admin). | F-RLS-04-routes |
| `app/api/notifications/unsubscribe/route.ts` | system | Push-subscription delete (no logged-in RLS context guaranteed). | F-RLS-04-notifications |

PLUS the Rule-B (wiring-singleton) and non-direct categories documented in the ADR only:

| User | Category | Reason | Follow-on |
|---|---|---|---|
| `app/api/orders` POST-create | wiring singleton | Idempotency atomicity; `order_idempotency_keys` is RLS-deny-all. | F-RLS-04a-create |
| `app/api/screen3/sync` POST-create | wiring singleton | Create-path deferred; audit_log + customer lookup cross-cutting. | F-RLS-04g / F-TD-31 |
| `app/api/cash/upload` POST | storage | `cash-attachments` bucket has no authenticated storage policies. | F-RLS-04-cash-storage |
| `app/api/cron/purge-idempotency-keys` | cron/system | CRON_SECRET-gated; no user context. | n/a (system) |
| `app/api/cron/haccp-alarm` | cron/system | CRON_SECRET-gated; no user context. | F-PROD-03 (vercel.json) |
| `app/api/auth/login` | pre-auth | Must read ANY user's credential before a session exists. | n/a (by design) |
| `app/api/auth/kds-pin` | pre-auth | As above (PIN credential read). | n/a (by design) |
| `app/api/haccp/visitor` | public kiosk | No logged-in user (public sign-in pad). | n/a (by design) |
| email use-cases (pricing activation, complaint/compliment notify) | server fire-and-forget | No request user context. | n/a (by design) |
| raw-REST audit_log writers (screen2 sync/resolve/note, screen3 sync) | audit cross-cut | Tracked debt. | F-TD-31 |

> ⚠️ Implementer: the FIRST table (the 9 direct-import routes) is what the allow-list `Set`
> actually contains. The SECOND table is ADR-prose context. If a grep at implementation time
> shows a route in the first table no longer imports `supabaseService` (because a later unit
> cut it over), REMOVE it from the allow-list AND add a test asserting it's gone (tightening,
> not loosening). Conversely if grep finds a NEW direct-import route not listed, STOP — that is
> the exact regression the guard exists to catch; do not auto-add it, escalate to the conductor.

### False-green / false-red analysis (the guard must be provably honest)

- **Can't false-GREEN (the core property).** Mental test: a future dev adds
  `app/api/secret-leak/route.ts` with `import { supabaseService } from
  '@/lib/adapters/supabase/client'`. The walk picks up the new `route.ts`; its path is NOT in
  the allow-list `Set`; the test pushes it to `offenders`; `expect(offenders).toEqual([])`
  → RED. ✅ Mechanically forced, because the allow-list is a fixed literal — a new route can't
  be on it without a human editing the list.
- **Can't false-RED on the current tree.** At implementation time the allow-list is seeded from
  the exact `grep` output, so every currently-importing route is listed → `offenders` empty →
  GREEN. A red-first TDD slice (below) proves the mechanism by temporarily adding a fixture
  offender.
- **Comment immunity.** `app/api/notifications/subscribe/route.ts` mentions `supabaseService`
  in a COMMENT only (verified — line 12 is doc prose, no import). The regex anchors on the
  `import` keyword (not the bare token), so the comment does NOT trip the guard — mirroring
  `no-disable-arch-rules.test.ts`'s directive-anchoring. Add an explicit test case for this
  (a comment-only fixture string → 0 offenders).
- **Self-exclusion.** The walk scans `app/api/**` only — it never scans `tests/**` or itself,
  so the allow-list literal containing the route names cannot trip the guard.

### TDD slices (Deliverable 1)

- **D1-red:** write the test with the allow-list seeded but add a temporary FIXTURE assertion:
  a hand-built source string containing `import { supabaseService } from
  '@/lib/adapters/supabase/client'` at a non-allow-listed fake path → assert it is detected as
  an offender. Run → confirm the detection logic flags it (RED proves the matcher works).
- **D1-green:** point the walk at the real `app/api/**`; with the verified allow-list, the live
  scan returns 0 offenders → GREEN. Keep BOTH: the fixture case (proves it CAN go red) and the
  live-tree case (proves the current tree is clean). This is the F-27 two-pronged shape.
- Add the comment-immunity case and a positive case (an allow-listed route importing
  `supabaseService` → NOT an offender).

🗣 First we prove the alarm rings when a thief walks in (fixture). Then we prove it stays quiet
for the staff who are supposed to be there (live tree). An alarm that only ever stays quiet is
useless; an alarm that always rings is ignored. We prove it does both correctly.

---

## Deliverable 2 — the posture ADR (the master-key register)

**File:** `docs/adr/0008-rls-final-service-role-allowlist-and-posture-seal.md`

Structure (mirror existing ADR format — Status/Date/Deciders, Context, Decision, Consequences,
References):

- **Status:** Accepted. **Date:** 2026-06-27. **Deciders:** Hakan Kilic, FORGE F-RLS-final.
- **Context:** F-RLS-04a–i cut the user-facing routes onto `…ForCaller` per-request RLS. What
  remains is a small, deliberate set of master-key users. ADR-0004 §Decision named this unit;
  this ADR records the realised guard + the register, and the deviation from ADR-0004's
  `lib/admin/`-folder framing (see "ADR conflicts" above).
- **Decision:**
  1. The single executable source of truth for the allowed direct service-role routes is the
     `ALLOWLIST` in `tests/unit/lint/no-service-role-in-user-routes.test.ts`.
  2. Reproduce BOTH tables from "Deliverable 1" here in prose (route + category + reason +
     follow-on), so a human auditor sees the full master-key register including the
     wiring-singleton (Rule B) and pre-auth/cron/public categories the scan can't see.
  3. The empty-GUC fail-closed property is pinned by `supabase/tests/017-*` (cross-reference).
  4. Record the ADR-0004 amendment: guard realised as an allow-listed `app/api/**` unit test,
     not a `lib/admin/` import ban, because no `lib/admin/` folder exists.
  5. Record the Rule-B limitation (wiring-singleton service-role not scanned at route layer)
     and its follow-on (F-RLS-wiring-guard).
- **Consequences:** new service-role-on-a-route is now a RED unit test (was invisible). The
  register makes every master key auditable in one place. The cost: the prose table must be
  kept in sync by hand when the allow-list `Set` changes (acceptable; the test is authoritative).
- **References:** ADR-0004, ADR-0002, ADR-0003, ADR-0007;
  `tests/unit/lint/no-service-role-in-user-routes.test.ts`;
  `supabase/tests/017-empty-guc-fails-closed.test.sql`;
  `lib/adapters/supabase/authenticatedClient.ts:54` (`requireServiceRole`).

🗣 The register is a one-page list of every door with a master key, why it has one, and the
ticket to eventually take the key back. Plus an honest note that the smoke detector watches the
front doors but not the back-office hand-offs (a separate ticket).

### TDD slice (Deliverable 2)

Docs have no executable test. Acceptance = (a) ADR file exists with all sections, (b) every
allow-list `Set` entry from D1 appears in the ADR prose table, (c) cross-links resolve.

---

## Deliverable 3 — the empty-GUC pin (the fail-shut proof)

**File:** `supabase/tests/017-empty-guc-fails-closed.test.sql`

**What it pins (the TRUE, per-table behaviour — see Frame-correction flag #2).** With the GUC
set to empty string (`''`, exactly what `db_pre_request` sets when there is no valid login),
under `SET LOCAL ROLE authenticated`:

- **Presence-check tables — fail closed by EMPTY result, NO error:**
  - `customers_select`: empty GUC → `is_empty(SELECT … FROM customers …)`.
  - `products_select`: empty GUC → `is_empty(SELECT … FROM products …)`.
- **Cast/`is_admin()` tables — fail closed by THROWING 22P02 (still a deny):**
  - `users_select`: empty GUC → `throws_ok(SELECT … FROM users …, '22P02')`.
  - `visits_select`: empty GUC → `throws_ok(SELECT … FROM visits …, '22P02')`.
  - (Optionally `complaints_select` / `discrepancies_select` for breadth — same shape.)
  - `is_admin()` itself: empty GUC → `throws_ok(SELECT public.is_admin(), '22P02')` (this is
    the ROOT cause of the throws above — pinning it documents WHY).

> The pin's headline assertion is the SECURITY INVARIANT: **on an empty GUC, NO table returns a
> foreign row.** Both "empty result" and "22P02 throw" satisfy that. The test asserts the
> specific mechanism per table so a future change (e.g. someone wraps `is_admin()` in `nullif`,
> flipping a throw into an empty result) is caught and forces a conscious update — not a silent
> drift toward a leak.

**Harness (mirror `016-rls-admin-context.test.sql` exactly):**

- `BEGIN; … ROLLBACK;` transaction wrapper.
- Re-assert `GRANT SELECT … TO authenticated` on the tables touched (self-containment, as 016
  does).
- `SELECT plan(N);` with N = number of assertions chosen (e.g. 6–8).
- `\ir _helpers.sql`.
- Create minimal fixtures via the bypass path BEFORE switching role (one customer, one product,
  one user, one visit — so there IS a row that the empty-GUC query must FAIL to see).
- `SET LOCAL ROLE authenticated;`.
- `SELECT set_config('app.current_user_id', '', true);` — the empty-string GUC (the exact
  `db_pre_request` fail-closed value).
- Then the `is_empty(...)` / `throws_ok(..., '22P02')` assertions above.
- A SANITY positive: set the GUC to a real admin user id and assert the SAME query DOES return
  the row — proving the empty-GUC denial is the GUC's doing, not a broken fixture.
- `SELECT * FROM finish(); ROLLBACK;`.

**NOT a migration.** This file lives in `supabase/tests/`, runs under pgTAP, ships nothing,
changes no schema. NO PITR gate.

### Step 2.0 — confirm pgTAP discovery

Verify how the pgTAP runner enumerates `supabase/tests/*.test.sql` (glob vs manifest). Inspect
the test runner config / npm script. If it's a glob, `017-*` is auto-discovered (no edit). If a
manifest lists files explicitly, add `017-empty-guc-fails-closed.test.sql` to it. (016 is the
reference for the expected location.)

### TDD slices (Deliverable 3)

- **D3-red:** write ONE assertion first against a table — e.g.
  `throws_ok(SELECT … FROM visits …, '22P02')` — but initially with the GUC set to a VALID user
  (so it does NOT throw) → the assertion FAILS (red proves the assertion is real and wired).
- **D3-green:** set the GUC to `''` → the visits query throws 22P02 → `throws_ok` passes. Then
  add the `customers`/`products` `is_empty` cases and the positive sanity case. Run the full
  017 plan green.

🗣 We first prove the test genuinely checks the lock (it fails when we hand it a valid badge and
expect a refusal). Then we hand it a blank badge and confirm every drawer refuses — some by
staying empty, some by jamming. Either way, no foreign folder comes out.

---

## Acceptance criteria

1. `tests/unit/lint/no-service-role-in-user-routes.test.ts` exists and is GREEN on the current
   tree; its allow-list is the single executable source of truth; a fixture offender case proves
   it CAN go RED; the comment-only case stays GREEN.
2. `npm run lint` and `tsc` clean (the new test file type-checks; no new ESLint findings).
3. `supabase/tests/017-empty-guc-fails-closed.test.sql` exists and is GREEN under `db:reset` +
   pgTAP; asserts per-table fail-closed (empty-result for customers/products; 22P02 throw for
   users/visits/`is_admin()`) plus the positive sanity row.
4. `docs/adr/0008-*.md` exists with all sections; its prose register lists every allow-list
   entry + the wiring-singleton/pre-auth/cron/public categories; cross-links resolve; the
   ADR-0004 amendment + Rule-B limitation are recorded.
5. ZERO files under `app/**`, `lib/**`, `components/**` changed. NO migration added. NO
   `package.json` change. The shipped bundle is byte-identical (provable: `next build` ignores
   ESLint; `tests/**` + `supabase/tests/**` don't ship).
6. Full unit suite GREEN (new count = current + the new lint test's cases); existing pgTAP suite
   still GREEN alongside 017.

🗣 Done means: the alarm works and is quiet on a clean house; the register is written; the
fail-shut test passes honestly; and not one line of production code moved.

---

## ANVIL matrix (right-sized — UNIT + pgTAP only)

| Layer | Run? | Why |
|---|---|---|
| Unit (lint guard + full existing unit suite) | ✅ | The guard IS a unit test; it must gate inside the hard unit suite (next build ignores ESLint). |
| pgTAP (new `017` + existing suite via `db:reset`) | ✅ | The empty-GUC pin runs here; existing RLS pgTAP must stay green beside it. |
| Integration (vitest LIVE) | ❌ | No route/runtime behaviour changes — nothing for an integration test to exercise. |
| E2E / browser sweep | ❌ | No UI change, no route behaviour change, byte-identical bundle. Per memory `anvil-full-browser-taps`: an every-button sweep is for UI/RLS-cutover units; this is config/test/docs only. |
| Preview smoke | ❌ | Nothing in the shipped bundle changed; no preview surface to assert. |
| Post-deploy prod smoke | ✅ (non-5xx only) | Belt-and-braces: confirm the merge didn't disturb prod (all routes non-5xx). Use absolute `/usr/bin/curl` (memory: sandbox PATH gotcha). |
| PITR gate | ❌ | NO migration, no schema/data change → no PITR gate fires. |

🗣 Two test rungs matter here: the unit alarm and the in-database fail-shut proof. No clicking
through screens — nothing a user sees changed — beyond a quick "did prod survive the merge"
ping.

---

## Risk Assessment (mandatory)

### Concurrency / race conditions
- **No material risks.** No runtime code, no shared state, no new query paths. The pin test runs
  in a `BEGIN…ROLLBACK` transaction (016 pattern) so it cannot bleed state.

### Security
- **R1 — empty-GUC pin asserts the WRONG mechanism and gives false confidence.**
  **Severity: HIGH. MUST-FIX (design correctness).** The recon brief's "no 22P02" claim is true
  for only 2 of the relevant policies; `is_admin()`'s bare `::uuid` cast THROWS 22P02 on empty
  GUC for users/visits/complaints/discrepancies/audit_log. If the implementer writes the pin to
  assert "empty result, no error" uniformly, it FAILS on those tables (or, if forced green by
  only testing customers/products, it advertises a property that doesn't hold and a future
  reader trusts it). **Mitigation:** assert the per-table behaviour exactly as specified in
  Deliverable 3 (empty-result for presence tables; `throws_ok(…, '22P02')` for cast tables),
  with the security invariant ("no foreign row on empty GUC") as the framing. This is must-fix
  because the deliverable's whole value is an HONEST safety pin — an inaccurate one is worse than
  none. **Resolved in-plan** by Deliverable 3's explicit assertions; the implementer must follow
  them, not the brief's one-liner.
  🗣 The lock fails shut everywhere — but on most drawers it jams (throws an error) rather than
  quietly returning nothing. If the test claims "quietly returns nothing" for all of them, it's
  lying, and a future engineer who reads it might "fix" the jam and accidentally open a leak.
- **R-guard-scope (covered by R3 below).** The guard cannot see wiring-singleton service-role
  use — a route added with `someService` (singleton, RLS-bypass) instead of `someServiceForCaller`
  is NOT flagged. Mitigated by documenting in the ADR + follow-on ticket; the direct-import path
  (the common, obvious mistake) IS caught.

### Data migration
- **No risks.** NO migration. The pgTAP file is a test, not a migration; no schema or data
  touched; no PITR gate.

### Business-logic flaws
- **R2 — stale / incomplete allow-list (false-red or under-protection).**
  **Severity: MEDIUM. Must-fix at implementation = "regenerate the list from grep, do not copy
  the brief's 3."** If the implementer seeds the allow-list from the brief's 3 routes, the guard
  goes RED immediately on the other 6 direct-import routes (false-red, blocks the unit). If they
  blindly trust the plan's 9-route table without re-grepping, a route cut over by a parallel unit
  could leave a stale entry (harmless but untidy) or a newly-added one could be missed.
  **Mitigation:** Step in Deliverable 1 mandates `grep -rn "import.*supabaseService" app/api/`
  at implementation time and seeding the `Set` from THAT output; any NEW unexpected route =
  escalate, don't auto-add. **Resolved in-plan.**
  🗣 The register must be copied from the live building, not from last week's notes — or the
  alarm screams at staff who belong there, or stays silent for a door we forgot.

### Launch / ship blockers
- **R3 — Rule-B (wiring-singleton) coverage gap mistaken for full coverage.**
  **Severity: MEDIUM. NOT must-fix (honest, documented limitation).** The guard protects the
  direct-import surface, not the wiring-singleton surface. If anyone reads "F-RLS-final sealed
  it" as "no new service-role route is possible," they're wrong for the wiring path.
  **Mitigation:** the ADR states the limitation explicitly and files follow-on
  F-RLS-wiring-guard; the guard's RED message also names the gap. Acceptable to ship because the
  common-case mistake (route grabs the key directly) IS caught and the rare case is documented.
- **R4 — ESLint `next/core-web-vitals` parsing of the new test (false-red at lint).**
  **Severity: LOW.** The new test file scans the tree with `node:fs` like the existing lint
  tests; it imports nothing exotic. Mitigation: model the file on
  `no-disable-arch-rules.test.ts` (pure `fs` walk) — proven to pass lint/tsc. No new dep.
- **No other launch blockers.** Byte-identical shipped bundle; merge-lock/migration-filename ops
  rules (memory) apply at ship, not plan: merge while ON the feature branch so
  `anvil-migration-lock.sh` matches the cert's bare `Branch:` line; land the new test files WITH
  the code before the squash-merge.

### Must-fix summary (Gate-2 blockers until resolved in the plan)
- **R1 (HIGH)** — empty-GUC pin must assert per-table behaviour (presence→empty,
  cast/`is_admin()`→22P02 throw), framed by the "no foreign row on empty GUC" invariant.
  **Resolved in-plan** (Deliverable 3). The implementer must follow Deliverable 3, NOT the
  brief's one-line "no 22P02" claim.
- **R2 (MEDIUM)** — allow-list must be regenerated from `grep` at implementation time, seeded
  from the 9 verified direct-import routes (NOT the brief's 3). **Resolved in-plan**
  (Deliverable 1).

Both must-fixes are RESOLVED by following this plan as written — there is no unresolved
blocker that loops back to Order. They are flagged so the conductor confirms the implementer
honours the corrections rather than the original brief.

---

## Hexagonal verdict (populates Gate 2)

- **Port:** none added, none used. This unit touches NO `lib/ports/**`.
- **Adapter:** none added, none changed. It references (does NOT modify)
  `lib/adapters/supabase/authenticatedClient.ts` only as documentation context.
- **New dependencies:** NONE. No `package.json` change.
- **Rip-out test:** **PASS (n/a).** No external dependency is added, wrapped, or re-wired; the
  rip-out cost is unchanged. The unit's entire purpose is to PROTECT the existing rip-out
  posture (one master-key register + a tripwire), which strengthens, never weakens, the
  hexagonal seam.
- **Vendor-fence:** untouched. No vendor SDK imported anywhere in scope (the test files use
  `node:fs` and SQL only).

🗣 No new plugs, no new sockets, no new vendors. The Lego shape is unchanged — this unit just
bolts a tamper-alarm onto a socket that already exists. Rip-out test: PASS.

**VERDICT: Gate-2 PASS on hexagonal grounds.** No must-fix hexagonal blocker. The two must-fix
RISKS (R1, R2) are spec-precision corrections already resolved within this plan — they require
the implementer to follow the plan's deliverables, not loop back to Order.
