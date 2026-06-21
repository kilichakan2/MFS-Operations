# F-RLS-04f — Complaints/Compliments RLS cutover (execution plan)

**Date:** 2026-06-21
**Author:** forge-planner (FORGE Phase 2 — Order)
**Spec status:** locked at Gate 1 (Hakan-approved — shared-board model)
**Mirror of:** F-RLS-04e (Cash-context RLS cutover — plan archived at
`docs/plans/archive/2026-06-21-f-rls-04e-cash-rls-cutover.md`, migration
`20260621120000`). Earlier siblings: F-RLS-04a (Orders), 04b (Users), 04c
(Routes), 04d (Pricing).

```
DOMAIN (Complaints + Compliments core — lib/services/{Complaints,Compliments}Service)
  ├─ ComplaintsRepository  (port) → [Supabase] (adapter, unchanged)
  │     service-role singleton  → STAYS as rollback parachute
  │     authenticated per-caller → NEW: complaintsServiceForCaller(userId) — RLS fires
  └─ ComplimentsRepository (port) → [Supabase] (adapter, unchanged)
        service-role singleton  → STAYS as rollback parachute
        authenticated per-caller → NEW: complimentsServiceForCaller(userId) — RLS fires
🗣 Same plugs, two power sources: the master key stays dark as a fallback; real
   table traffic routes through the keycard so the DB checks the badge.
```

🗣 **In plain English (what this whole job is):** Today every complaints and
compliments screen talks to the database with a master key that ignores all the
door locks. We switch the table reads/writes to use each logged-in person's own
badge, so the database itself enforces "you must be a real signed-in staff
member." Decision LOCKED: **shared board** — any valid staff member sees and acts
on every complaint/compliment (exactly today's behaviour). Unlike cash there is
**no file storage and no special RPC** to keep on the master key, so this is the
*simpler* single-port version of the cash cutover.

---

## 1. Goal

Flip the complaints + compliments table reads/writes from the service-role
(master-key, RLS-bypassing) Supabase client to the per-request **authenticated**
(logged-in-user) client, so Row-Level Security enforces access at the database
for `complaints` / `complaint_notes` / `compliments`. A byte-identical-intent
mirror of F-RLS-04e adapted to the complaints/compliments domain. Zero behaviour
change at the wire level.

🗣 **In plain English:** Copy exactly what we did for the Cash screens, applied to
the Complaints and Compliments screens — but simpler (no file uploads, no special
DB functions to leave behind). Users notice nothing — same responses, same
errors, same role gates. The only change is *where* the access check happens (now
also at the database, not only in our code).

**Locked decisions (from Gate 1 — do NOT re-open):**

1. **Shared-board model, NOT owner-restricted.** Any valid logged-in staff member
   can SELECT/INSERT/UPDATE/DELETE every complaint and compliment. The RLS
   predicate is the valid-user check `public.current_user_is_valid()`, NOT an
   ownership filter. This preserves today's behaviour exactly.
2. **The 3 EXISTING dormant ownership policies on `complaints` are REPLACED.** The
   baseline ships `complaints_insert` / `complaints_select` / `complaints_update`
   that filter by `user_id = current_setting('app.current_user_id')` (owner-only,
   plus `is_admin()` on select/update). Under the shared-board decision these are
   wrong — they would hide other people's complaints from a non-admin caller. The
   migration **DROPs all 3** and ships the permissive valid-user set instead.
3. **Raw `audit_log` writes STAY master-key.** screen2/{sync,resolve,note} each do
   an independent raw `fetch` to `audit_log` using their own `the service-role key env var`
   constant — NOT through the service. They are untouched; F-TD-31 stays deferred.
4. **The compliment staff-email helper STAYS master-key.** `lib/compliment-email.ts`
   does an independent raw service-role fetch to `users`; untouched, F-TD-32 stays
   deferred.

🗣 **In plain English:** The database door checks "are you a real signed-in staff
member, yes/no" and lets that person touch any complaint/compliment — the shared
board you have today. Three stale "owner-only" rules in the baseline get removed
(they would break the shared board). The audit-trail writes and the
who-to-email lookup keep the master key and are not touched here.

---

## 2. Domain terms (plain-English glossary for this plan)

- **RLS (Row-Level Security)** — per-row door locks inside Postgres. 🗣 The
  database decides which rows you may see/change based on who you are, instead of
  trusting the app to ask nicely.
- **Service-role client** — the master-key Supabase connection that bypasses RLS.
  🗣 A key that opens every door regardless of locks. Kept as the rollback fallback.
- **Authenticated (per-caller) client** — a Supabase connection carrying one
  user's minted token, reaching Postgres as the `authenticated` role. 🗣 The
  user's own badge; the database checks it against the door rules.
- **GUC `app.current_user_id`** — a per-request Postgres setting holding the
  caller's user id, set by the `db_pre_request` hook (ADR-0007) from the JWT. 🗣
  The name on the badge, readable by the door-lock rule. (See §4 RISK 2.)
- **`current_user_is_valid()`** — a SECURITY DEFINER STABLE helper (shipped in
  `20260618130000`) returning true when the GUC maps to a real `public.users`
  row. 🗣 A trusted bouncer the door rules call: "is this badge a real employee,
  yes/no" — answered without re-triggering the locks (avoids the recursion bug).
- **Ports `ComplaintsRepository` / `ComplimentsRepository`** — the two database
  interfaces the domain owns. 🗣 The table sockets; unchanged here.
- **Adapters `lib/adapters/supabase/{Complaints,Compliments}Repository.ts`** — the
  Supabase implementations. 🗣 The plugs; unchanged, just fed a different power source.
- **`complaintsServiceForCaller(userId)` / `complimentsServiceForCaller(userId)`** —
  NEW wiring factories building a service whose single table port is bound to one
  caller's badge. 🗣 "Give me a complaints/compliments service that reads/writes as
  *this* person."

---

## 3. Confirmed facts (verified in this planning pass — act on these, do not re-verify)

| Fact | Source verified | Consequence |
|------|-----------------|-------------|
| `complaints` has **RLS ENABLED + 3 EXISTING owner-restrictive policies** (`complaints_insert`/`_select`/`_update`, GUC-direct, owner-OR-admin) | `baseline.sql` L2428 (ENABLE), L2431/2434/2437 (the 3 policies) | Migration MUST **DROP all 3** then CREATE the permissive valid-user set, or the shared board breaks for non-admins. **Must-fix.** |
| `complaint_notes` has **RLS ENABLED, ZERO policies** | `enable_rls_42_tables.sql` L116 enables it; grep of all migrations finds NO `CREATE POLICY` for it | Add the full 4-policy permissive set or notes blank under the badge. **Must-fix.** |
| `compliments` has **RLS ENABLED, ZERO policies** | `enable_rls_42_tables.sql` L117 enables it; grep finds NO `CREATE POLICY` for it | Add the full 4-policy permissive set or the compliments wall blanks. **Must-fix.** |
| `GRANT ALL ... TO authenticated` already exists on all three tables | `baseline.sql` L2563 (complaint_notes), L2568 (complaints), L2573 (compliments) | **NO new table GRANT needed.** |
| `current_user_is_valid()` helper exists, SECURITY DEFINER STABLE, EXECUTE granted to `authenticated` | `20260618130000_users_directory_read_for_authenticated.sql` L72-93 | Reuse directly; no new helper, no new grant. |
| **Embedded `customers` already has an authenticated SELECT policy** `customers_select` = any non-empty `app.current_user_id` GUC | `baseline.sql` L2449 | The complaint reads' `customers(name)` / `customers(id,name)` embed resolves under the badge. **No new policy needed** for the customers embed. (RISK 1 — resolved.) |
| **Embedded `users` already has an authenticated SELECT policy** `users_directory_select` = `current_user_is_valid()` (any valid user reads any user row) | `20260618130000` L98-101 | Every `users!..._fkey(...)` embed AND `compliments.listActiveRecipients` direct `users` read resolves under the badge. **No new policy needed.** Hash columns sealed at the column-privilege layer (same migration L111-113). (RISK 1 — resolved.) |
| Complaints/compliments adapters use **NO `.rpc()` calls** — pure PostgREST `.from(...).select/insert/update` | full read of both adapter files | **No SECURITY DEFINER RPC to keep on service-role.** Unlike cash, there is also **no Storage port** — single table port only. |
| Both services take a SINGLE-PORT deps object: `createComplaintsService({ complaints })`, `createComplimentsService({ compliments })` | `ComplaintsService.ts` L39/L75, `ComplimentsService.ts` L24/L47, `services/index.ts` L39-47 | The factory is the *simple* single-port shape — NOT cash's two-port split. |
| Adapter factories `createSupabaseComplaintsRepository(client)` / `createSupabaseComplimentsRepository(client)` already take a `SupabaseClient` arg + are exported | `ComplaintsRepository.ts` L173 / L404 (singleton); `ComplimentsRepository.ts` L90 / L151 (singleton); `index.ts` L55-60 | Just call them with the authenticated client. No adapter change. |
| `authenticatedClientForCaller`, `dbTokenMinter`, both adapter factories all exported | `lib/adapters/supabase/index.ts` L55-65, `lib/wiring/dbToken.ts` | All seams for the `*ForCaller` factories already exist; pure assembly. No new deps. |
| All 8 routes source the caller via `req.headers.get('x-mfs-user-id')` and 401 if missing; **no `x-mfs-user-role` gate** in any of them (all roles allowed) | all 8 route files read this pass | Pass `userId` straight to the `*ForCaller` factory AFTER the 401 gate. No role-gate interaction. |
| Raw `audit_log` writes in screen2/{sync,resolve,note} use their OWN `SUPA_KEY` (`the service-role key env var`) via raw `fetch` — independent of the service | `sync` L19-35/L92, `resolve` L19-20/L86-100, `note` L21-28/L90-100 | The route flip does NOT disturb the audit writes. F-TD-31 stays deferred. |
| `lib/compliment-email.ts` does an independent raw service-role read of `users` | spec + import in `compliments/route.ts` L11 | Untouched by the flip. F-TD-32 stays deferred. |
| Latest migration is `20260621120000` (cash) | `ls supabase/migrations/` | New migration timestamp must be after it. |
| Migration filename rule: `^\d{14}_[a-z0-9_]+\.sql$` | `filename-convention.test.ts` | Use `20260621130000_complaints_authenticated_rls_policies.sql` (14 digits, after cash). |

🗣 **In plain English:** Everything the badge-switch needs already exists — the
bouncer function, the customer/staff name doors, the table grants, and all the
wiring parts. The two things that need care are exactly the RLS policies: the
`complaints` table has three *wrong* (owner-only) door rules that must be torn out
and replaced with shared-board rules, and `complaint_notes` + `compliments` have
**no door rules yet** so they must ship.

---

## 4. CRITICAL MUST-VERIFY — RISK 1 & RISK 2 (RESOLVED with evidence)

### RISK 1 — JOIN/embed reads under the authenticated role — **RESOLVED, no migration addition needed**

Under RLS a PostgREST embed reads the joined table under the SAME authenticated
role, governed by the joined table's OWN RLS policy. If an embedded table has no
authenticated SELECT policy the sub-object returns null/empty and the screen
silently degrades. Every embed/direct-read in scope was traced:

**ComplaintsRepository embeds (read `lib/adapters/supabase/ComplaintsRepository.ts`):**
- `listAllWithNotes` (`ALL_COMPLAINT_COLS` L57-61) embeds `customers(name)`,
  `logged_by:users!complaints_user_id_fkey(id,name)`,
  `resolver:users!complaints_resolved_by_fkey(name)`; `ALL_NOTE_COLS` (L64-65)
  embeds `author:users!complaint_notes_user_id_fkey(name)`.
- `listOpen` (`OPEN_COLS` L68-69) embeds `customers(name)`, `users!complaints_user_id_fkey(name)`.
- `findDetailById` (`DETAIL_COLS` L72-84) embeds `customers(id,name)`,
  `users!complaints_user_id_fkey(name)`, `resolvedBy:users!complaints_resolved_by_fkey(name)`.
- `findEmailContext` (`EMAIL_CTX_COLS` L87) embeds `customers(name)`.
- `resolveCustomerName` (L179-187) directly reads `customers`.
- ⇒ **Embedded tables: `customers` and `users` only.**

**ComplimentsRepository (read `lib/adapters/supabase/ComplimentsRepository.ts`):**
- `listRecent` (`COMPLIMENT_COLS` L39-43) embeds
  `poster:users!compliments_posted_by_fkey(id,name)`,
  `recipient:users!compliments_recipient_id_fkey(id,name)`.
- `createCompliment` re-reads the same `COMPLIMENT_COLS` after insert.
- `listActiveRecipients` (L133-147) directly reads `users` (`id,name,role` where `active`).
- ⇒ **Embedded/read tables: `users` only.**

**Verification result — DID I find authenticated SELECT policies on the embedded
tables? YES, both already exist:**

| Embedded table | Authenticated SELECT policy | Source | Predicate |
|----------------|-----------------------------|--------|-----------|
| `customers` | **`customers_select`** | `baseline.sql` L2449 | non-empty `app.current_user_id` GUC (any logged-in caller) |
| `users` | **`users_directory_select`** | `20260618130000` L98-101 | `public.current_user_is_valid()` (any valid user reads any user row) |

Both predicates admit any valid logged-in caller, so under the badge every
`customers(...)` and `users!...(...)` embed resolves to real names exactly as it
does today under the master key. **No SELECT policy needs to be added to the
migration for the embeds.** Hash columns (`pin_hash`/`password_hash`) on `users`
remain sealed at the column-privilege layer (`20260618130000` L111-113) — the
embeds only ask for `id,name,role`, so nothing is exposed and nothing breaks.

🗣 **In plain English (the highest risk, and it is clear):** When a complaint row
shows the customer's name and the staff member's name, the database fetches those
from the customers and users tables *as the badge-holder*. I checked: both of
those tables already have a door rule that lets any logged-in staff member read
them (the customers door has been there since the start; the users door shipped
with the Routes cutover). So the names will keep showing — nothing goes blank. The
integration test still asserts non-blank names as a belt-and-braces check.

### RISK 2 — how `app.current_user_id` gets populated under the authenticated client — **RESOLVED**

`current_user_is_valid()` reads `current_setting('app.current_user_id')`
(`20260618130000` L81). The authenticated client sends an app-minted JWT bearer
token. The bridge that copies the JWT identity into that GUC is the
**`db_pre_request` hook** shipped in `20260614210221_db_pre_request_guc_bridge.sql`
(ADR-0007):

- PostgREST runs `public.db_pre_request()` (SECURITY DEFINER) before EVERY request
  (wired via `ALTER ROLE authenticator SET pgrst.db_pre_request = 'public.db_pre_request'`,
  L79).
- It reads the verified JWT claims (`current_setting('request.jwt.claims', true)`),
  takes `user_id` (falling back to `sub`), and runs
  `set_config('app.current_user_id', <uid>, true)` (L59-72). The 3rd arg `true`
  (is_local) scopes the GUC to the current transaction → **identity can never
  bleed across pooled connections.**
- The hook **never throws** (wrapped in `EXCEPTION WHEN OTHERS`); any missing/bad
  claim leaves the GUC empty → fail-closed deny (L64-67).

So for an authenticated complaints/compliments request: minted token →
`Authorization: Bearer <token>` → PostgREST verifies it and exposes the claims →
`db_pre_request` copies the user id into `app.current_user_id` →
`current_user_is_valid()` returns true → the new permissive policies admit the
caller. **This is the identical, already-in-prod mechanism cash uses** — the
predicate will fire for complaints exactly as it does for cash.

🗣 **In plain English:** There is a tiny program (`db_pre_request`) that runs on
every request, reads the name off the badge (the JWT), and writes it onto a
per-request sticky note (`app.current_user_id`) that the door rules read. It is
the same mechanism already proven in production for cash, orders, users, routes
and pricing. Nothing new is needed for complaints — it just works the same way.

---

## 5. Compliance / ADR flags

- **ADR-0004 (RLS vs service-role security model):** this plan IS the ADR-0004
  trajectory — moving prod complaints/compliments traffic onto RLS. No conflict;
  advances it.
- **ADR-0007 (app-minted token + GUC bridge for RLS):** the `*ForCaller`
  factories use exactly the ADR-0007 mechanism (`dbTokenMinter` → token →
  `authenticatedClientForCaller` → `db_pre_request` → GUC `app.current_user_id`).
  No conflict.
- **ADR-0002 (hexagonal shape):** all vendor/auth wiring stays inside
  `lib/wiring/complaints.ts` and `lib/wiring/compliments.ts`; the vendor
  `SupabaseClient` is constructed and consumed only there; routes receive a ready
  service built from ports. No conflict.
- **No new ADR required** — this is the 6th cutover of an established pattern.

🗣 **In plain English:** Two written architecture decisions (the security model
and the badge/token mechanism) *predicted* this exact change; we follow them. No
new decision record needed.

---

## 6. Per-route flip / stay verdict table (all 8 routes)

Every route has a clean `userId = req.headers.get('x-mfs-user-id')` gate that
401s when missing, and **no `x-mfs-user-role` gate** (all roles may use these
endpoints). Build the per-caller service **once per handler, AFTER the 401 gate**,
with a local const that **shadows** the singleton import, then add the inline
rollback comment. None of the routes touch Storage or an RPC, so **all 8 flip** —
no "stay" exceptions (the contrast with cash, where the upload route stayed).

| # | Route file + method | Service call(s) | DB tables (RLS) | Verdict |
|---|---------------------|-----------------|-----------------|---------|
| 1 | `app/api/screen2/sync/route.ts` — **POST** | `validateCreate` (pure), `createComplaint` | `complaints` insert (+ `customers` read for name) | **FLIP** → `complaintsServiceForCaller(userId)`. Raw `audit_log` write below it is untouched (its own `SUPA_KEY`). |
| 2 | `app/api/screen2/resolve/route.ts` — **POST** | `validateResolve` (pure), `resolveOpen`, `findEmailContext` | `complaints` update + read | **FLIP**. Raw `audit_log` write untouched. |
| 3 | `app/api/screen2/note/route.ts` — **POST** | `validateNote` (pure), `findEmailContext`, `createNote` | `complaints` read + `complaint_notes` insert | **FLIP**. Raw `audit_log` write untouched. |
| 4 | `app/api/screen2/open/route.ts` — **GET** | `listOpen` | `complaints` read (+ `customers`/`users` embeds) | **FLIP** |
| 5 | `app/api/screen2/all/route.ts` — **GET** | `listAllWithNotes` | `complaints` + `complaint_notes` read (+ embeds) | **FLIP** |
| 6 | `app/api/detail/complaint/route.ts` — **GET** | `findDetailById` | `complaints` read (+ embeds) | **FLIP** |
| 7 | `app/api/compliments/route.ts` — **GET** | `listRecent` | `compliments` read (+ `users` embeds) | **FLIP** |
| 7 | `app/api/compliments/route.ts` — **POST** | `validateCreate` (pure), `createCompliment` | `compliments` insert (+ `users` embeds on return) | **FLIP** (build the per-caller service once at the top of POST, after the 401 gate) |
| 8 | `app/api/compliments/users/route.ts` — **GET** | `listActiveRecipients` | `users` read | **FLIP** |

> **8 route FILES, 9 handlers** (compliments has GET + POST). All 8 import the
> matching `*ForCaller` factory. complaints routes (1-6) import
> `complaintsServiceForCaller`; compliments routes (7-8) import
> `complimentsServiceForCaller`.

🗣 **In plain English:** Every one of the eight screens switches to the badge —
there is no file or special-function path to leave behind, so unlike cash there is
no "stays on the master key" route here. The audit-trail writes sitting inside
three of them keep the master key and are not touched.

---

## 7. Exact files to change

### 7.1 NEW — `supabase/migrations/20260621130000_complaints_authenticated_rls_policies.sql`
DROP the 3 dormant ownership policies on `complaints`, then CREATE the full
12-policy permissive valid-user set (4 commands × 3 tables) for `complaints`,
`complaint_notes`, `compliments`, using `current_user_is_valid()`. **No GRANT**
(baseline already grants all three to `authenticated`). See §8 for the SQL.

🗣 The door definitions: rip out three wrong owner-only rules, install shared-board
rules on all three tables. The one piece that must hit prod **before** the code merge.

### 7.2 EDIT — `lib/wiring/complaints.ts`
Add `complaintsServiceForCaller(callerUserId)`. Keep the `complaintsService`
service-role singleton exactly as-is (rollback parachute). Single-port — NO
two-port split (contrast cash). Mirror `cashServiceForCaller` (`lib/wiring/cash.ts`
L72-81) minus the storage port.

Replace the imports + append the factory:
```ts
import {
  createComplaintsService,
  type ComplaintsService,
} from "@/lib/services";
import {
  supabaseComplaintsRepository,        // keep — service-role parachute singleton
  createSupabaseComplaintsRepository,  // NEW — per-caller table repo
  authenticatedClientForCaller,        // NEW
} from "@/lib/adapters/supabase";
import { dbTokenMinter } from "@/lib/wiring/dbToken";

export const complaintsService: ComplaintsService = createComplaintsService({
  complaints: supabaseComplaintsRepository,
});

/** Build a ComplaintsService whose table reads/writes run as ONE caller
 *  (Postgres `authenticated` role, so the complaint RLS policies fire).
 *  Per-request — NEVER memoize (a memoized client would leak one caller's
 *  identity to another). Mirrors cashServiceForCaller (single-port: complaints
 *  have no Storage and no RPC). Consumed by the 6 complaint routes since
 *  F-RLS-04f. The `complaintsService` singleton above STAYS as the rollback
 *  parachute. */
export async function complaintsServiceForCaller(
  callerUserId: string,
): Promise<ComplaintsService> {
  const token  = await dbTokenMinter.mint({ userId: callerUserId });
  const client = authenticatedClientForCaller({ token });
  return createComplaintsService({
    complaints: createSupabaseComplaintsRepository(client), // per-caller (RLS fires)
  });
}
```
ALSO update the file's top doc comment: the line that defers
`complaintsServiceForCaller` to F-RLS-04f now refers to the present change —
rewrite it the way `cash.ts` documents its factory (service-role parachute +
per-caller RLS rationale + never-memoize), dropping the cash-only storage note.

🗣 Parts list, not logic. We add a second way to build the complaints service —
table operations wear the caller's badge. The old all-master-key singleton stays
as the fallback.

### 7.3 EDIT — `lib/wiring/compliments.ts`
Identical shape to 7.2 for compliments: add
`complimentsServiceForCaller(callerUserId)` returning
`createComplimentsService({ compliments: createSupabaseComplimentsRepository(client) })`,
keep the `complimentsService` singleton, import
`createSupabaseComplimentsRepository` + `authenticatedClientForCaller` +
`dbTokenMinter`, and update the deferral note in the top doc comment.

🗣 Same change again, for the compliments wiring file.

### 7.4 EDIT — the 6 complaint route files (flip to per-caller)
Pattern (mirror `app/api/cash/month/route.ts` L28-37, L74-83): import
`complaintsServiceForCaller`, and inside each handler, AFTER the 401 gate has
guaranteed a non-null `userId`, shadow the singleton:
```ts
import { complaintsServiceForCaller } from '@/lib/wiring/complaints'
// ...inside the handler, after `if (!userId) return ...401`:
// F-RLS-04f: run as authenticated caller (RLS fires). Rollback = swap complaintsServiceForCaller(userId) → complaintsService.
const complaintsService = await complaintsServiceForCaller(userId)
```
The local `const complaintsService` shadows the module import, so every existing
`complaintsService.xxx(...)` call below it runs as the authenticated caller with
ZERO other line edits. **Build it ONCE per handler** (after the gate) and reuse.
Files: `screen2/sync`, `screen2/resolve`, `screen2/note`, `screen2/open`,
`screen2/all`, `detail/complaint`.

> **`sync`/`resolve`/`note` note:** in these three, place the
> `const complaintsService = await complaintsServiceForCaller(userId)` line right
> after the `if (!userId)` 401 (sync L41, resolve L26, note L34) and BEFORE the
> first `complaintsService.*` call. The raw `audit_log` `fetch`/`supaPost` calls
> further down use `SUPA_KEY` directly and are NOT affected — leave them exactly
> as-is (do NOT route them through the service).

🗣 Each complaint screen gets one new line after its login check; everything below
keeps working but now wears the badge. The audit-trail writes are left alone.

### 7.5 EDIT — the 2 compliments route files (flip to per-caller)
Same pattern with `complimentsServiceForCaller` + the local
`const complimentsService = await complimentsServiceForCaller(userId)`:
- `app/api/compliments/route.ts` — **both** GET (after L20 401) and POST (after
  L36 401). Build a per-caller service once at the top of each handler.
- `app/api/compliments/users/route.ts` — GET (after L17 401).

Inline comment: `// F-RLS-04f: run as authenticated caller (RLS fires). Rollback = swap complimentsServiceForCaller(userId) → complimentsService.`

🗣 Same one-line change for the two compliments screens.

### 7.6 NEW — `supabase/tests/013-rls-complaints.test.sql`
pgTAP, mirror of `012-rls-cash.test.sql`, for `complaints` + `complaint_notes` +
`compliments`. See §10.

### 7.7 NEW — `tests/unit/wiring/complaintsServiceForCaller.test.ts` + `tests/unit/wiring/complimentsServiceForCaller.test.ts`
Unit tests mirroring `tests/unit/wiring/cashServiceForCaller.test.ts` (the
**single-port** version — assert the one table port is bound to the per-caller
client; there is no storage port to assert). See §10.

### 7.8 EDIT — `tests/integration/complaints.test.ts` (+ compliments coverage)
Extend (do not rewrite) to assert the routes still work under the authenticated
cutover, the FK embeds (`customers`/`users` names) return data, and the
shared-board behaviour holds (a non-admin caller sees another user's complaint).
There is currently **no `tests/integration/compliments.test.ts`** — add compliments
cases to the existing `complaints.test.ts` (or a new `compliments.test.ts` if the
harness prefers one file per route group; either is acceptable). See §10.

### 7.9 NEW — `supabase/migrations/rollback/2026-06-21-f-rls-04f-complaints-rls-cutover-rollback.sql`
DROP the 12 new policies. Note: this does NOT restore the 3 original
`complaints_*` ownership policies — see §11 for the rollback nuance. Match the 04e
rollback house style (inline `-- ROLLBACK` block in the migration AND the
standalone rollback file). See §11.

---

## 8. Migration SQL (`20260621130000_complaints_authenticated_rls_policies.sql`)

```sql
-- 20260621130000_complaints_authenticated_rls_policies.sql
--
-- F-RLS-04f — Complaints/Compliments RLS cutover. Mirror of
-- 20260621120000 (cash), adapted to complaints + complaint_notes + compliments.
--
-- SHARED-BOARD model (Gate 1 LOCKED): any valid logged-in staff member may
-- SELECT/INSERT/UPDATE/DELETE every complaint/note/compliment — preserves
-- today's behaviour. NOT owner-restricted.
--
-- WHAT THIS DOES:
--   1) DROPs the 3 EXISTING dormant OWNERSHIP policies on `complaints`
--      (complaints_insert / complaints_select / complaints_update, baseline
--      L2431/2434/2437). They filter by user_id = app.current_user_id (owner-OR-
--      admin) which would HIDE other users' complaints from a non-admin under the
--      badge — wrong for the shared board. (There is NO baseline complaints_delete.)
--   2) CREATEs the FULL permissive valid-user set: 4 commands × 3 tables = 12
--      policies, using public.current_user_is_valid().
--
-- WHY THE FULL SET: complaint_notes (enable_rls_42 L116) and compliments (L117)
--   are RLS-ENABLED with ZERO policies → DENY EVERYTHING for the authenticated
--   role. Once the routes run as `authenticated`, every read returns nothing
--   unless SELECT policies ship → the boards blank. SELECT is the headline
--   must-fix. INSERT/UPDATE/DELETE ship too so create/resolve/note/post all work
--   under the badge. (complaints UPDATE is required — resolveOpen PATCHes a row
--   in place.)
--
-- ROLE MODEL — VALID-USER ONLY, no role filter (Pattern B, mirrors 04c/04d/04e):
--   any caller whose GUC maps to a real public.users row is allowed. No app-layer
--   role gate exists on these 8 routes today (all roles use them), so RLS is
--   never stricter than the route gating — the shared board is exactly preserved.
--
-- PREDICATE: public.current_user_is_valid() (SECURITY DEFINER STABLE helper,
--   shipped 20260618130000) — recursion-proof valid-user check. EXECUTE already
--   granted to `authenticated`; no new grant, no new helper.
--
-- GRANTS: baseline.sql L2563/L2568/L2573 already GRANT ALL on all three tables
--   TO authenticated → NO GRANT added here.
--
-- EMBEDS UNAFFECTED: the complaint/compliment reads embed `customers` and `users`;
--   both already have authenticated SELECT policies (customers_select baseline
--   L2449; users_directory_select 20260618130000) → FK names resolve under the
--   badge. This migration touches neither (F-RLS-04f §4 RISK 1).
--
-- NOT TOUCHED: audit_log policies (the screen2 routes' raw audit writes stay
--   master-key — F-TD-31). This migration is complaints/notes/compliments only.
--
-- MASTER-KEY ROLE still BYPASSES RLS (no FORCE) → the parachute singletons and
--   the raw audit/email service-role paths are unaffected.
--
-- NON-DESTRUCTIVE: DROP POLICY + CREATE POLICY only — no DROP TABLE/TRUNCATE/
--   ALTER TYPE/DROP COLUMN/DROP NOT NULL, no data touched → NO PITR gate fires.
--
-- One policy per command per table → no over-grant possible (Postgres OR's
--   permissive policies; here each command has exactly one).
--
-- Apply via Supabase MCP apply_migration ONLY. Local: npm run db:reset. Prod
-- application deferred to the ship gate: apply to PROD FIRST, then merge
-- (the 04a/04b/04c/04d/04e/F-TD-22 ordering).

-- ── 0) Remove the stale ownership policies on complaints (shared board) ──
DROP POLICY IF EXISTS complaints_insert        ON complaints;   -- baseline owner-only
DROP POLICY IF EXISTS complaints_select        ON complaints;   -- baseline owner-OR-admin
DROP POLICY IF EXISTS complaints_update        ON complaints;   -- baseline owner-OR-admin

-- ── idempotent drops of the NEW policy names ────────────────
DROP POLICY IF EXISTS complaints_select_v2     ON complaints;
DROP POLICY IF EXISTS complaints_insert_v2     ON complaints;
DROP POLICY IF EXISTS complaints_update_v2     ON complaints;
DROP POLICY IF EXISTS complaints_delete_v2     ON complaints;
DROP POLICY IF EXISTS complaint_notes_select   ON complaint_notes;
DROP POLICY IF EXISTS complaint_notes_insert   ON complaint_notes;
DROP POLICY IF EXISTS complaint_notes_update   ON complaint_notes;
DROP POLICY IF EXISTS complaint_notes_delete   ON complaint_notes;
DROP POLICY IF EXISTS compliments_select       ON compliments;
DROP POLICY IF EXISTS compliments_insert       ON compliments;
DROP POLICY IF EXISTS compliments_update       ON compliments;
DROP POLICY IF EXISTS compliments_delete       ON compliments;

-- ── complaints (shared board; UPDATE needed — resolveOpen PATCHes in place) ──
-- NOTE the _v2 suffix: the baseline used the bare names complaints_{select,insert,
-- update} for the OWNERSHIP rules we just dropped. New names avoid any ambiguity
-- with the baseline identifiers in logs/dumps and make the rollback unambiguous.
CREATE POLICY complaints_select_v2 ON complaints
  FOR SELECT USING ( public.current_user_is_valid() );
CREATE POLICY complaints_insert_v2 ON complaints
  FOR INSERT WITH CHECK ( public.current_user_is_valid() );
CREATE POLICY complaints_update_v2 ON complaints
  FOR UPDATE USING ( public.current_user_is_valid() )
             WITH CHECK ( public.current_user_is_valid() );
CREATE POLICY complaints_delete_v2 ON complaints
  FOR DELETE USING ( public.current_user_is_valid() );

-- ── complaint_notes (0 policies today; createNote INSERTs) ──
CREATE POLICY complaint_notes_select ON complaint_notes
  FOR SELECT USING ( public.current_user_is_valid() );
CREATE POLICY complaint_notes_insert ON complaint_notes
  FOR INSERT WITH CHECK ( public.current_user_is_valid() );
CREATE POLICY complaint_notes_update ON complaint_notes
  FOR UPDATE USING ( public.current_user_is_valid() )
             WITH CHECK ( public.current_user_is_valid() );
CREATE POLICY complaint_notes_delete ON complaint_notes
  FOR DELETE USING ( public.current_user_is_valid() );

-- ── compliments (0 policies today; createCompliment INSERTs) ──
CREATE POLICY compliments_select ON compliments
  FOR SELECT USING ( public.current_user_is_valid() );
CREATE POLICY compliments_insert ON compliments
  FOR INSERT WITH CHECK ( public.current_user_is_valid() );
CREATE POLICY compliments_update ON compliments
  FOR UPDATE USING ( public.current_user_is_valid() )
             WITH CHECK ( public.current_user_is_valid() );
CREATE POLICY compliments_delete ON compliments
  FOR DELETE USING ( public.current_user_is_valid() );

-- ROLLBACK (manual): DROP the 12 _v2/notes/compliments policies (see §11 / the
-- standalone rollback .sql). The 3 dropped baseline ownership policies are NOT
-- auto-restored — see §11 rollback nuance.
```

> **Policy-name decision (lock during Render):** the baseline ownership policies
> are `complaints_select` / `complaints_insert` / `complaints_update` (bare). To
> avoid any name clash and make the rollback unambiguous, the NEW complaints
> policies use the `_v2` suffix. `complaint_notes_*` and `compliments_*` had no
> prior policies so they keep the plain names (matching the cash house style).
> If Render prefers re-using the bare `complaints_*` names, that also works
> (the DROP-then-CREATE in this file is atomic within the migration) — but `_v2`
> is the recommended default for log/dump clarity.

🗣 **In plain English:** Twelve door rules, four per table (see/create/edit/delete),
each saying only "must be a real signed-in staff member." First we tear out three
old owner-only rules on the complaints table that would break the shared board.
The "edit" rule on complaints matters because resolving a complaint changes a row
in place — forgetting it would make "resolve" quietly fail; we test that explicitly.

---

## 9. Step ordering (TDD-first where it pays)

1. **Write the migration** (`20260621130000_…`) — §8. `npm run db:reset` to apply
   locally. 🗣 Ship the doors first (and remove the wrong ones) so nothing blanks
   while developing.
2. **Write the pgTAP test** `013-rls-complaints.test.sql` (§10). Run red→green
   against the new migration. 🗣 Prove the doors lock and open correctly — including
   the shared-board read (a second user sees the first user's complaint).
3. **Write the two wiring unit tests** (RED), then add the two `*ForCaller`
   factories to `lib/wiring/{complaints,compliments}.ts` (§7.2/7.3) → GREEN.
   Assert: minted per-caller, never memoized, the single table port bound to the
   per-caller client, the service-role singleton still exported. 🗣 Prove the
   badge-wearing services are built per-caller, before wiring them into routes.
4. **Re-point the 8 route files** one at a time, running
   `tests/integration/complaints.test.ts` after each:
   complaints: `screen2/sync` → `screen2/resolve` → `screen2/note` →
   `screen2/open` → `screen2/all` → `detail/complaint`;
   compliments: `compliments` (GET+POST) → `compliments/users`.
   After each, confirm the raw `audit_log` writes (sync/resolve/note) are untouched.
5. **Update the two wiring doc comments** (§7.2/7.3) to reflect the now-built
   factories.
6. **Extend the integration test** (§7.8) — cutover + shared-board + FK-embed-name
   assertions (+ compliments coverage).
7. **Write the rollback .sql** (§7.9 / §11).
8. **Full local gate:** `npm run db:reset` → pgTAP green (`013`), unit green,
   `npm run test:integration` green, then the E2E complaints + compliments specs
   on the preview at ship.

🗣 **In plain English:** Build (and fix) the database doors first and prove them;
then build the two badge-services and prove them; then switch each screen over one
at a time, re-running the complaints tests after each so a break is obvious
immediately, checking the audit writes still fire.

---

## 10. Test matrix (ANVIL ladder — mirror 04e)

```
ANVIL · F-RLS-04f complaints/compliments RLS cutover
  Unit         ○ complaintsServiceForCaller + complimentsServiceForCaller
                 (mint / build / never-memoize / single-port / parachute)
  Integration  ○ 8 routes under authenticated · shared board · FK names non-blank
  DB / RLS     ○ pgTAP 013-rls-complaints (CRUD + shared-board + fail-closed +
                 service bypass, all 3 tables)
  E2E          ○ 08-complaints-board.spec.ts + 09-compliments.spec.ts (preview)
  🗣 every rung green before the cert prints
```

**pgTAP `013-rls-complaints.test.sql`** (mirror `012`):
- Fixtures via the bypass path (no RLS): **two** valid users (user-A, user-B — to
  prove the SHARED BOARD: B can read A's complaint), one customer; one seed
  `complaints` row (status `open`, owned by user-A), one seed `complaint_notes`
  row, one seed `compliments` row. (Respect `complaints_resolution_check`: an
  `open` seed must have NULL resolution_note/resolved_by/resolved_at; a
  `resolved` insert must set all three.)
- `SET LOCAL ROLE authenticated`; set `app.current_user_id` to **user-B**.
- **SHARED-BOARD assertion (the headline divergence from cash):** `isnt_empty`
  SELECT on `complaints` returns user-A's row while the GUC is user-B — proves the
  permissive valid-user policy, NOT owner-only. (A pgTAP that only tested the
  owner reading their own row would pass even under the WRONG baseline policy, so
  this cross-user read is the critical assertion.)
- VALID USER (user-B): `isnt_empty` SELECT each of the 3 tables;
  `lives_ok` INSERT on each; `lives_ok` UPDATE on `complaints` (the resolveOpen
  in-place PATCH — assert explicitly); `lives_ok` DELETE on the inserted rows.
- EMPTY GUC fail-closed: `is_empty` SELECT `complaints` (clean zero-rows deny —
  the helper short-circuits) and `throws_ok ... '42501'` INSERT on at least one
  table.
- SERVICE-ROLE bypass: `RESET ROLE`; empty GUC; `isnt_empty` proves master-key
  reads regardless (parachute + raw audit/email paths' posture).
🗣 Proves the board is SHARED (B sees A's complaint), that strangers are denied,
that resolving works, and that the master key still opens everything.

**Unit `complaintsServiceForCaller.test.ts` + `complimentsServiceForCaller.test.ts`**
(mirror `cashServiceForCaller.test.ts`, single-port):
- Mock `dbTokenMinter`, `authenticatedClientForCaller`, the matching adapter
  factory, and the matching `createXService`.
- Assert: one mint with `{ userId }`, one client build from that token, the table
  repo bound to that client, the service built with `{ complaints }` (resp.
  `{ compliments }`) = the per-caller repo. (No storage port — the single-port
  difference from cash; do NOT copy cash's `attachments` assertion.)
- Assert NEVER memoizes: two calls → two mints/clients/repos, distinct tokens.
- Assert the service-role singleton is still exported (parachute).
🗣 Proves each request gets its OWN badge and no identity leaks between users.

**Integration (extend `tests/integration/complaints.test.ts` + compliments):**
- A non-admin caller can list all complaints, open complaints, a complaint detail,
  the compliments wall, and the recipients dropdown under the authenticated
  cutover (no blank screens — proves SELECT policies + embeds end-to-end).
- **Shared board:** a complaint logged by user-A is visible to user-B via
  `screen2/all` / `screen2/open` (proves the shared-board policy through the wire).
- A caller can create a complaint (`screen2/sync`), resolve one (`screen2/resolve`),
  add a note (`screen2/note`), and post a compliment (`compliments` POST) —
  INSERT/UPDATE under the badge.
- FK-embed names (`customers(name)`, logger/resolver/author/poster/recipient
  `users(name)`) resolve non-blank for a non-admin caller (proves
  `customers_select` + `users_directory_select` cover the embeds — RISK 1).
- The raw `audit_log` writes still succeed (service-role) after the flip.
🗣 End-to-end proof: real users see the shared board, can log/resolve/note/compliment,
the names still show, and the audit trail still records.

**E2E (`@critical` preview smoke at ship):** the existing
`tests/e2e/08-complaints-board.spec.ts` + `tests/e2e/09-compliments.spec.ts` run
green against the PR's Supabase preview branch (full CRUD click-through).
🗣 A real click-through on a real preview proves the whole flow before prod.

---

## 11. Rollback approach (2-layer)

Two independent levers (mirror 04e):

1. **Code lever (no SQL deploy):** revert each flipped handler's local
   `const complaintsService = await complaintsServiceForCaller(userId)` (resp.
   compliments) back to the imported singleton — one line per handler, documented
   inline as `// F-RLS-04f: ... Rollback = swap …ServiceForCaller(userId) → …Service.`
   🗣 Flip the screens back to the master key — they work immediately, RLS becomes
   irrelevant.
2. **DB lever:** the rollback `.sql` drops the 12 new policies (no grant to
   revert). Because the *code* is what made traffic run as `authenticated`, the
   policies are harmless-but-inert once the code lever is pulled.
   🗣 The doors can be removed too, but pulling the code lever alone already
   restores service.

```sql
-- rollback: 2026-06-21-f-rls-04f-complaints-rls-cutover-rollback.sql
DROP POLICY IF EXISTS complaints_select_v2     ON complaints;
DROP POLICY IF EXISTS complaints_insert_v2     ON complaints;
DROP POLICY IF EXISTS complaints_update_v2     ON complaints;
DROP POLICY IF EXISTS complaints_delete_v2     ON complaints;
DROP POLICY IF EXISTS complaint_notes_select   ON complaint_notes;
DROP POLICY IF EXISTS complaint_notes_insert   ON complaint_notes;
DROP POLICY IF EXISTS complaint_notes_update   ON complaint_notes;
DROP POLICY IF EXISTS complaint_notes_delete   ON complaint_notes;
DROP POLICY IF EXISTS compliments_select       ON compliments;
DROP POLICY IF EXISTS compliments_insert       ON compliments;
DROP POLICY IF EXISTS compliments_update       ON compliments;
DROP POLICY IF EXISTS compliments_delete       ON compliments;
```

**Rollback nuance (call out at Lock):** the migration DROPs the 3 baseline
ownership policies on `complaints`. The DB rollback above does NOT recreate them.
This is **correct and safe** because:
- Those policies were **dormant** — they only fire for the `authenticated` role,
  and until F-RLS-04f no complaints traffic ran as `authenticated` (the routes
  used the master key, which bypasses RLS). So they protected nothing in practice.
- The **code lever** is the real rollback: reverting the routes to the master-key
  singleton makes RLS irrelevant for complaints regardless of which policies exist.
- If a belt-and-braces "restore baseline exactly" is wanted, the rollback `.sql`
  MAY additionally re-CREATE the 3 original owner-only policies (copy their text
  verbatim from `baseline.sql` L2431/2434/2437). **Recommended: leave them dropped**
  — re-adding owner-only policies while the code is on the master key has zero
  effect and only muddies the schema. Lock this choice during Render.

**No data rollback / no PITR:** the migration is DROP POLICY + CREATE POLICY only
— additive/idempotent, no data touched. State "no PITR required" at Lock.

**Ship ordering (mirror 04a–04e):** apply the migration to **PROD FIRST** via
Supabase MCP `apply_migration`, confirm complaints/compliments still read on prod
under service-role (policies are inert until the code flips), THEN merge the code
PR. Doors before badges.

🗣 **In plain English:** Put the doors in the production database BEFORE the code
that starts using badges ships. The three old owner-only rules we remove were
asleep (nothing ran as the authenticated role until now), so removing them changes
nothing today and we don't bother putting them back on rollback — pulling the code
lever alone restores service. And because we only add/remove door rules (no data
moved), there is no backup gate.

---

## 12. Risk Assessment (MANDATORY — Gate 2 input)

### 12.1 Concurrency / race conditions
- **R-CONC-1 — per-request client identity leak via memoization.** Severity:
  **High** if mishandled. If a `*ForCaller` factory memoized the client/service,
  caller A's badge could serve caller B. **Mitigation:** each factory mints a
  fresh token + builds a fresh client every call (never memoize); the unit tests
  assert two calls → two distinct tokens. The `db_pre_request` GUC is
  transaction-local (`is_local=true`), a second structural guard. **Must-fix:**
  YES (test-enforced; the pattern is proven in orders/users/routes/pricing/cash).
  🗣 The danger is reusing one person's badge for the next; we forbid caching and
  prove it with a test.

### 12.2 Security
- **R-SEC-1 — RLS-enabled-zero-policy blank (the headline, for notes + compliments).**
  Severity: **Critical.** `complaint_notes` and `compliments` are RLS-enabled with
  zero policies; flipping their routes to authenticated with no SELECT policy =
  every read returns nothing → the notes thread and the compliments wall go blank.
  **Mitigation:** the migration ships the full SELECT+INSERT+UPDATE+DELETE set for
  both; pgTAP `013` proves it; ship ordering applies the migration to prod FIRST.
  **Must-fix:** YES.
  🗣 Turn on locks without doors and everyone is locked out. The doors ship in the
  same change and go to prod first.
- **R-SEC-2 — stale owner-only policies break the shared board.** Severity:
  **Critical.** The baseline `complaints_{select,insert,update}` filter by
  `user_id = app.current_user_id` (owner-OR-admin on select/update, owner-only on
  insert). Under the badge a non-admin caller would see/edit ONLY their own
  complaints — silently breaking the shared board (the locked product decision).
  **Mitigation:** the migration DROPs all 3 and replaces them with permissive
  valid-user policies; the pgTAP **cross-user read** assertion (user-B sees
  user-A's complaint) proves the shared board. **Must-fix:** YES.
  🗣 Three old "you only see your own" rules would quietly turn the shared board
  into a private list. We remove them and test that a second user sees the first
  user's complaint.
- **R-SEC-3 — embedded customers/users reads go dark under the badge.** Severity:
  **High** if the embed policies were missing; **None** as verified. The reads
  embed `customers` and `users`; both already have authenticated SELECT policies
  (`customers_select` baseline L2449; `users_directory_select` 20260618130000). So
  names resolve under the badge. **Mitigation:** verified existing (RISK 1 §4); the
  integration test asserts non-blank FK names as belt-and-braces. **Must-fix:** NO
  (already satisfied — no migration addition).
  🗣 Customer and staff names come from other tables; I confirmed those tables
  already let any logged-in user read them, so nothing goes blank.
- **R-SEC-4 — predicate too loose (any valid user touches all complaints at DB
  level).** Severity: **None / by design.** The valid-user predicate IS the locked
  shared-board decision; it matches today's effective behaviour (service-role saw
  all; no app role gate on these routes). **Must-fix:** NO.
  🗣 The DB door checks "real employee," which is exactly the shared board you asked
  for.
- **R-SEC-5 — credential/hash exposure via the users FK-embed.** Severity: **None
  (already mitigated).** The embeds read `users(id,name)` / `users(id,name,role)`
  only; `20260618130000` sealed `pin_hash`/`password_hash` from `authenticated` at
  the column-privilege layer. **Must-fix:** NO.
  🗣 Staff names show; password hashes were already walled off.

### 12.3 Data migration
- **R-DATA-1 — destructive migration / PITR.** Severity: **None.** DROP POLICY +
  CREATE POLICY only — no DROP TABLE/TRUNCATE/ALTER TYPE/DROP COLUMN. No data
  touched → no PITR gate. **Must-fix:** NO. (State "no PITR required" at Lock.)
  🗣 We only add/remove door rules; no data is moved or deleted, so no backup gate.

### 12.4 Business-logic flaws
- **R-BIZ-1 — missing UPDATE policy on `complaints`.** Severity: **High.**
  `resolveOpen` PATCHes a row in place (status→resolved). Omitting the complaints
  UPDATE policy would silently break "resolve" under the badge. **Mitigation:** §8
  ships `complaints_update_v2` (USING + WITH CHECK); pgTAP `013` asserts `lives_ok`
  UPDATE on complaints explicitly. **Must-fix:** YES.
  🗣 Resolving a complaint edits a row in place and needs an "edit" door; forgetting
  it makes resolve quietly fail. We ship and test it.
- **R-BIZ-2 — screen2/sync 23505 duplicate path under the badge.** Severity:
  **Low.** `createComplaint` maps a `23505` unique-violation to `duplicate:true`
  (200, not an error) for the till's offline-retry queue. Under the badge the
  INSERT still reaches the unique constraint (the INSERT policy passes for a valid
  user, then the constraint fires) so the 23505→duplicate mapping is unchanged.
  **Mitigation:** the integration/pgTAP INSERT tests use a valid user; the
  duplicate path is exercised by the existing adapter unit tests (unchanged code).
  **Must-fix:** NO (flagged so Render doesn't assume RLS pre-empts the constraint).
  🗣 The "already-sent, treat as success" retry behaviour is unaffected — the badge
  passes the door, then the duplicate check fires exactly as today.
- **R-BIZ-3 — audit_log / compliment-email accidentally routed through the badge.**
  Severity: **Medium** if mishandled; **None** as planned. The raw `audit_log`
  writes (sync/resolve/note) and `lib/compliment-email.ts` use their own
  service-role key and must NOT be touched. **Mitigation:** §7.4 explicitly leaves
  the raw `fetch`/`supaPost` calls as-is; they are not service methods so the
  shadowing const cannot capture them. **Must-fix:** NO (avoided by design — flagged
  so Render doesn't "tidy" them into the service).
  🗣 The audit-trail writes and the who-to-email lookup keep the master key and are
  left exactly alone; the route flip can't accidentally grab them.

### 12.5 Launch blockers
- **R-LAUNCH-1 — migration not applied to prod before code merge.** Severity:
  **Critical.** If code ships first, real users get badges before doors exist →
  R-SEC-1/R-SEC-2 in prod (blank boards / private lists). **Mitigation:** ship
  ordering (§11) — apply migration to prod FIRST, verify, then merge. **Must-fix:**
  YES (process gate at ship).
  🗣 Doors before badges, in production. Wrong order = outage.
- **R-LAUNCH-2 — migration filename collision / short-form ban.** Severity: Low.
  **Mitigation:** `20260621130000_complaints_authenticated_rls_policies.sql` is
  after the latest (`20260621120000`) and matches the 14-digit rule. **Must-fix:** NO.
  🗣 The filename uses the full 14-digit timestamp, after cash, so it won't collide
  or break preview branches.

### Risk headline
**Five must-fix items**, all standard for this 6th-cutover pattern and all closed
by the plan as written:
- **R-SEC-1** — ship the full policy set for notes + compliments (blank-board trap);
- **R-SEC-2** — DROP the stale owner-only complaints policies + replace with
  shared-board policies (the F-RLS-04f-specific divergence — the private-list trap
  cash didn't have);
- **R-BIZ-1** — complaints UPDATE policy (resolveOpen in-place PATCH);
- **R-CONC-1** — never-memoize the per-caller factories (test-enforced);
- **R-LAUNCH-1** — prod-migration-first ship order.

None is an *open* blocker — the plan resolves each. They are must-fix
*requirements the plan already satisfies*. **No open Gate-2 blocker.**

---

## 13. Acceptance criteria

1. Migration `20260621130000_complaints_authenticated_rls_policies.sql` exists,
   DROPs the 3 baseline owner-only `complaints` policies, ships 12 permissive
   valid-user policies (4 per table × 3 tables) using `current_user_is_valid()`,
   no GRANT, no destructive statement, does not touch `audit_log` policies.
2. `lib/wiring/complaints.ts` exports `complaintsServiceForCaller(userId)`
   (single table port, never memoized) AND still exports the `complaintsService`
   service-role singleton. Same for `lib/wiring/compliments.ts` /
   `complimentsServiceForCaller`.
3. All 8 route files (9 handlers) build a per-caller service after the 401 gate
   and run their table I/O as `authenticated`, with the inline rollback comment.
   The raw `audit_log` writes (sync/resolve/note) and `lib/compliment-email.ts`
   are untouched and still service-role.
4. pgTAP `013-rls-complaints.test.sql` green: CRUD (incl. the complaints UPDATE),
   the cross-user **shared-board** read, fail-closed for empty/absent GUC, and
   service-role bypass — all three tables.
5. `complaintsServiceForCaller.test.ts` + `complimentsServiceForCaller.test.ts`
   green: mint / build / never-memoize / single-port / parachute.
6. `tests/integration/complaints.test.ts` (+ compliments coverage) green incl. the
   new cutover / shared-board / FK-embed-name / audit-still-works assertions.
7. E2E `08-complaints-board.spec.ts` + `09-compliments.spec.ts` green on preview
   under an authenticated user.
8. No `@supabase/*` import added outside `lib/adapters/supabase/`; no adapter
   import outside `lib/wiring/` (ESLint `no-adapter-imports` pinned test passes).
9. Wire responses byte-identical to pre-cutover for every handler (the 23505→
   `duplicate:true` mapping, the 404/401/400 shapes, the category-prettify edge
   transforms all unchanged).

---

## 14. Hexagonal verdict (Gate 2 input — computed)

- **Ports used:** `ComplaintsRepository` AND `ComplimentsRepository`
  (`lib/ports`) — **both unchanged**. No new port (single table port each; no
  Storage/RPC split needed — confirmed zero storage + zero RPC).
- **Adapters:** `lib/adapters/supabase/ComplaintsRepository.ts` via
  `createSupabaseComplaintsRepository(client)` and
  `lib/adapters/supabase/ComplimentsRepository.ts` via
  `createSupabaseComplimentsRepository(client)` — **both unchanged** (factories
  already exist + take a client arg; the cutover just hands them an authenticated
  client instead of the service-role one).
- **New dependencies:** **NONE.** No `package.json` change. All seams
  (`dbTokenMinter`, `authenticatedClientForCaller`, the two adapter factories, the
  two `createXService` factories) already exist and are exported.
- **Single-use vendor wrapping:** N/A — no new vendor library; Supabase already
  wrapped behind the two ports.
- **Vendor isolation:** the `SupabaseClient` is constructed and consumed entirely
  inside `lib/wiring/complaints.ts` / `lib/wiring/compliments.ts`; routes receive
  a ready service built from ports. No vendor type leaks past the boundary.
- **Rip-out test:** "replace the DB vendor for Complaints/Compliments tomorrow" =
  one new adapter file per port + edits to the two wiring files only. Routes,
  services, domain untouched. **PASS.**

🗣 **In plain English:** We add no new vendor, library, socket, or plug. We feed
the two existing table-plugs a different power source (the badge instead of the
master key), and all the wiring lives in the two allowed wiring files. Swap
databases tomorrow and it is still one adapter file per port + the two wiring
files. Clean hexagonal — PASS.
