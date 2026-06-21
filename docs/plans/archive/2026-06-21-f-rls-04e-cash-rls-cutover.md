# F-RLS-04e — Cash-context RLS cutover (execution plan)

**Date:** 2026-06-21
**Author:** forge-planner (FORGE Phase 2 — Order)
**Spec status:** locked at Gate 1
**Mirror of:** F-RLS-04d (Pricing-context RLS cutover — PR #58, squash `03e035f`, ship `1c5c6c2`, migration `20260619120000`). Earlier siblings: F-RLS-04a (Orders), F-RLS-04b (Users), F-RLS-04c (Routes).

```
DOMAIN (Cash core logic — lib/services/CashService, lib/domain/Cash)
  ├─ CashRepository    (port) → [Supabase] (adapter, unchanged)
  │     service-role singleton  → STAYS as rollback parachute + Storage paths
  │     authenticated per-caller → NEW: cashServiceForCaller(userId) — RLS fires
  └─ AttachmentStorage (port) → [Supabase Storage] (adapter, unchanged) — STAYS service-role
🗣 Same plugs, two power sources: the master key stays dark as a fallback and keeps running the file-upload paths; real table traffic routes through the keycard so the DB checks the badge.
```

🗣 **In plain English (what this whole job is):** Today every cash screen talks to
the database with a master key that ignores all the door locks. We switch the
table reads/writes to use each logged-in person's own badge, so the database
itself enforces "you must be a real signed-in user." Two catches: (1) the three
cash tables have the locks turned ON but **no doors defined yet** — switch to
badges with no doors and every cash screen goes blank, so the door definitions
(RLS policies) must ship in the same change and hit prod first. (2) The
file-attachment paths (upload, delete-with-file, signed download links) use a
*separate* lock system (Storage) that has no badge-doors at all — so those stay
on the master key, exactly like pricing's `replace` route stayed on the master
key in F-RLS-04d.

---

## 1. Goal

Flip the cash table reads/writes from the service-role (master-key,
RLS-bypassing) Supabase client to the per-request **authenticated**
(logged-in-user) client, so Row-Level Security enforces access at the database
for `cash_months` / `cash_entries` / `cheque_records`. This is a **security
cutover** — a byte-identical mirror of F-RLS-04d adapted to cash. Zero behaviour
change at the wire level.

🗣 **In plain English:** Copy exactly what we did for the Pricing screens, applied
to the Cash screens. Users notice nothing — same responses, same errors, same
role gates. The only change is *where* the access check happens (now also at the
database, not only in our code).

**Locked decisions (from Gate 1 — do NOT re-open):**

1. **App-layer enforcement STAYS app-layer.** The office "current-month-only"
   rule lives in `CashService.validateEntry` and **is NOT pushed into RLS**. The
   DB door only checks WHO (a valid office/admin user); the app keeps checking
   WHICH month. Confirmed: `validateEntry` is untouched by this plan.
2. **F-TD-28 is OUT OF SCOPE.** `validateEntry` uses local-server `new Date()`
   not London time — that is a separate backlog item. Do NOT fix it here, do NOT
   let it expand scope. The `now: new Date()` call sites stay exactly as today.
3. **Policy predicate:** Pattern B — **valid office/admin user**, reusing the
   existing `current_user_is_valid()` SQL helper (see §6 E2 for the exact
   predicate decision).

🗣 **In plain English:** The database door checks "are you a real signed-in
office/admin user, yes/no." The finer rules ("office can only touch the current
month") stay in our application code, untouched. And the known timezone bug in
that code is explicitly left alone here.

---

## 2. Domain terms (plain-English glossary for this plan)

- **RLS (Row-Level Security)** — per-row door locks inside Postgres. 🗣 The
  database decides which rows you may see/change based on who you are, instead of
  trusting the app to ask nicely.
- **Service-role client** — the master-key Supabase connection that bypasses RLS.
  🗣 A key that opens every door regardless of locks. We keep it as an emergency
  fallback **and** for the file-storage paths.
- **Authenticated (per-caller) client** — a Supabase connection carrying one
  user's minted token, reaching Postgres as the `authenticated` role. 🗣 The
  user's own badge; the database checks it against the door rules.
- **GUC `app.current_user_id`** — a per-request Postgres setting holding the
  caller's user id, set by the token bridge (ADR-0007). 🗣 The name on the badge,
  readable by the door-lock rule.
- **`current_user_is_valid()`** — a SECURITY DEFINER STABLE helper (shipped in
  `20260618130000`) returning true when the GUC maps to a real `public.users`
  row. 🗣 A trusted bouncer the door rules call: "is this badge a real employee,
  yes/no" — answered without re-triggering the locks (avoids the recursion bug).
- **Port `CashRepository`** — the cash database interface the domain owns. 🗣 The
  table socket shape; unchanged here.
- **Port `AttachmentStorage`** — the file-storage interface the domain owns. 🗣
  The file-cabinet socket; unchanged here, and stays on the master key.
- **Adapter `lib/adapters/supabase/CashRepository.ts`** — the Supabase table
  implementation. 🗣 The one plug; unchanged, just fed a different power source.
- **`cashServiceForCaller(userId)`** — NEW wiring factory building a CashService
  whose **table** port is bound to one caller's badge, while its **storage** port
  stays the service-role singleton. 🗣 "Give me a cash service that reads/writes
  tables as *this* person, but still files attachments with the master key."

---

## 3. Confirmed facts (verified in this planning pass — act on these, do not re-verify)

| Fact | Source verified | Consequence |
|------|-----------------|-------------|
| `cash_months`, `cash_entries`, `cheque_records` have **RLS ENABLED, ZERO policies** | `20260613000000_enable_rls_42_tables.sql` L97-99 enables RLS on all three; grep of all migrations shows the ONLY other reference is `baseline.sql` (table defs + grants) — **no `CREATE POLICY` exists for any of the three** | Migration MUST ship the full policy set or cash blanks. **Must-fix.** Clean additive enable. |
| `GRANT ALL ON cash_entries / cash_months / cheque_records TO authenticated` already exists | `baseline.sql` L2548, L2553, L2558 | **NO new table GRANT needed** (same as pricing). |
| `current_user_is_valid()` helper exists, SECURITY DEFINER STABLE, EXECUTE granted to `authenticated` | `20260618130000_users_directory_read_for_authenticated.sql` | Reuse directly; no new helper, no new grant. |
| Cash adapter uses **NO `.rpc()` calls** — pure PostgREST `.from(...).select/insert/update/delete` on the three tables + Storage | full read of `lib/adapters/supabase/CashRepository.ts` | **No SECURITY DEFINER RPC** to keep on service-role for table ops. The only service-role-must-stay surface is **Storage** (see §6 E1). |
| Cash reads FK-embed `users` (`created_by`, `edited_by`, `logged_by`, `banked_by`, `driver`) and `customers` | `CashRepository.ts` `ENTRY_COLS_*` / `CHEQUE_COLS_*` | Name resolution depends on `users_directory_select` (shipped `20260618130000`) and `customers_select` (shipped in `baseline.sql` L2449, GUC-based). **Both already exist — no new policy needed for FK-embeds.** |
| `customers_select` policy = any non-empty `app.current_user_id` GUC | `baseline.sql` L2449 | The cash `customer:customers(id,name)` embed resolves under authenticated. No change. |
| `createSupabaseCashRepository(client)`, `createSupabaseAttachmentStorage(client)`, `authenticatedClientForCaller`, `dbTokenMinter` all exist + are exported | `lib/adapters/supabase/index.ts` L47-55, `lib/wiring/dbToken.ts` | All seams for `cashServiceForCaller` already exist; pure assembly. No new deps. |
| Cash routes source the caller via `req.headers.get('x-mfs-user-id')` and role via `x-mfs-user-role` | all 8 route files | Same `userId` source as pricing; pass straight to `cashServiceForCaller(userId)`. |
| `cash-attachments` Storage bucket has **NO storage.objects policies** in any migration | grep `cash-attachments` / `storage.objects` across `supabase/migrations/` returns nothing | Storage ops as the `authenticated` role would be **fail-closed denied**. The upload / delete-with-file / signed-URL paths MUST stay service-role (§6 E1). |
| Latest migration is `20260619120000` (pricing) | `ls supabase/migrations/` | New migration timestamp must be after it: `20260621120000_cash_authenticated_rls_policies.sql`. |
| Migration filename rule: `^\d{14}_[a-z0-9_]+\.sql$` | `filename-convention.test.ts` | `20260621120000_cash_authenticated_rls_policies.sql` complies (14 digits). |

🗣 **In plain English:** The cash tables already have locks ON and badge-access
granted, the bouncer function and the rep/customer name doors already exist, and
all the wiring parts are already built. The two things that need care: the cash
tables have **no door rules yet** (must ship them), and the **file-attachment
storage** has no badge-doors at all (so those paths keep the master key).

---

## 4. Compliance / ADR flags

- **ADR-0004 (RLS vs service-role security model):** this plan IS the ADR-0004
  trajectory — moving prod cash traffic onto RLS. No conflict; advances it.
- **ADR-0007 (app-minted token + GUC bridge for RLS):** `cashServiceForCaller`
  uses exactly the ADR-0007 mechanism (`dbTokenMinter` → token →
  `authenticatedClientForCaller` → GUC `app.current_user_id`). No conflict.
- **ADR-0002 (hexagonal shape):** all vendor/auth wiring stays inside
  `lib/wiring/cash.ts`; the vendor `SupabaseClient` is constructed and consumed
  only there; routes receive a ready `CashService` built from ports. No conflict.
- **No new ADR required** — this is the 4th cutover of an established pattern.

🗣 **In plain English:** Two of our written architecture decisions (the security
model and the badge/token mechanism) *predicted* this exact change. We follow
them, not fight them. No new decision record needed.

---

## 5. Exact files to change

### 5.1 NEW — `supabase/migrations/20260621120000_cash_authenticated_rls_policies.sql`
The full **12-policy** set (4 commands × 3 tables) for `cash_months`,
`cash_entries`, `cheque_records`, using `current_user_is_valid()`. **No GRANT**
(baseline already grants all three to `authenticated`). See §7 for the SQL.

🗣 The door definitions. Without this file, switching to badges blanks every cash
screen. This is the one piece that must hit prod **before** the code merge.

### 5.2 EDIT — `lib/wiring/cash.ts`
Add `cashServiceForCaller(userId)`. Keep the `cashService` service-role singleton
exactly as-is (rollback parachute + the engine the routes use for Storage paths
that stay service-role). Mirror `pricingServiceForCaller`, with the cash twist:
the **table** port is bound to the per-caller client, the **storage** port stays
the service-role singleton.

Add to the existing imports (the adapter `index.ts` already exports these):
```ts
import {
  supabaseCashRepository,            // keep — service-role singleton uses it
  supabaseAttachmentStorage,         // keep — storage stays service-role
  createSupabaseCashRepository,      // NEW — per-caller table repo
  authenticatedClientForCaller,      // NEW
} from "@/lib/adapters/supabase";
import { dbTokenMinter } from "@/lib/wiring/dbToken";
```
Append (mirroring `pricingServiceForCaller`, adapted for the two-port service):
```ts
/** Build a CashService whose TABLE reads/writes run as ONE caller (Postgres
 *  `authenticated` role, so the cash RLS policies fire) while ATTACHMENT
 *  STORAGE stays on the service-role singleton (the cash-attachments bucket has
 *  no authenticated storage.objects policies — F-RLS-04e E1). Per-request —
 *  NEVER memoize (a memoized client would leak one caller's identity to
 *  another). Mirrors pricingServiceForCaller. */
export async function cashServiceForCaller(
  callerUserId: string,
): Promise<CashService> {
  const token  = await dbTokenMinter.mint({ userId: callerUserId });
  const client = authenticatedClientForCaller({ token });
  return createCashService({
    cash:        createSupabaseCashRepository(client),   // per-caller (RLS fires)
    attachments: supabaseAttachmentStorage,              // service-role (Storage)
  });
}
```
ALSO update the file's top doc comment: the line that defers
`cashServiceForCaller` to F-RLS-04e now refers to the present change — rewrite it
the way `pricing.ts` documents the factory (service-role parachute + per-caller
RLS rationale + never-memoize + the storage-stays-service-role note).

🗣 This is the parts list, not logic. We add a second way to build the cash
service — table operations wear the caller's badge, file operations keep the
master key. The old all-master-key singleton stays as the fallback.

### 5.3 EDIT — the route files that touch **tables only** (flip to per-caller)
Pattern (mirror pricing): import `cashServiceForCaller`, and inside each handler,
AFTER the auth/401/403 gate has guaranteed a non-null `userId`, shadow the
singleton with a per-caller instance:
```ts
import { cashServiceForCaller } from '@/lib/wiring/cash'
// ...inside handler, after the auth gates:
// Rollback = swap `cashServiceForCaller(userId)` → `cashService`.
const cashService = await cashServiceForCaller(userId)
```
The local `const cashService` shadows the module import, so every existing
`cashService.xxx(...)` call below it runs as the authenticated caller with ZERO
other line edits. **Build the per-caller service ONCE per handler** (after the
gate) and reuse it — never call `cashServiceForCaller` twice in one request.

See §6 for the per-route flip/stay verdicts and the per-handler inventory.

### 5.4 NEW — `supabase/tests/012-rls-cash.test.sql`
pgTAP, mirror of `011-rls-pricing.test.sql`, for all three cash tables. See §9.

### 5.5 NEW — `tests/unit/wiring/cashServiceForCaller.test.ts`
Unit test mirroring `pricingServiceForCaller.test.ts`, **plus** the cash-specific
assertion that the storage port is the service-role singleton (not a per-caller
storage). See §9.

### 5.6 EDIT — `tests/integration/cash.test.ts`
Extend (do not rewrite) to assert cash routes still work under the authenticated
cutover, role gates still app-enforced, FK-embed names (rep/driver/customer)
resolve non-blank under a non-admin caller. See §9.

### 5.7 NEW — `supabase/migrations/rollback/2026-06-21-f-rls-04e-cash-rls-cutover-rollback.sql`
DROP the 12 policies (no grant to revert). Match the 04d rollback house style
(both an inline `-- ROLLBACK` comment block in the migration AND the standalone
rollback file). See §10.

---

## 6. Per-route flip / stay verdicts + decisions to lock during Render

### E1 — Storage paths STAY service-role (LOCKED recommendation, the cash-specific divergence)

Three operations touch **Supabase Storage** (`cash-attachments` bucket), governed
by `storage.objects` RLS — which has **zero policies for that bucket**. Under the
`authenticated` role those ops would be **denied** (fail-closed). They must stay
on the service-role client:

- **`uploadAttachment`** (`POST /api/cash/upload`) — writes a file object.
- **`attachments.remove`** inside `deleteEntry` (`DELETE /api/cash/entry/[id]`) —
  removes a file object before deleting the row.
- **`signedUrlFor` / `createSignedUrl`** inside `listEntriesForMonth`
  (`GET /api/cash/month`) — mints signed download URLs for attachments.

The `cashServiceForCaller` factory handles two of these structurally: it binds
the **table** port to the per-caller client but keeps the **storage** port as the
service-role `supabaseAttachmentStorage` singleton. So:

| Surface | Mechanism after cutover |
|---------|-------------------------|
| Cash **table** reads/writes (all 3 tables) | per-caller authenticated client (RLS fires) |
| Attachment **upload / remove** | service-role singleton (via the storage port inside the per-caller service) |
| Signed-URL minting on the month list | service-role singleton (storage port) |

**Per-route verdict:**

| # | Route + methods | Service calls | DB tables (RLS) | Storage? | Verdict |
|---|-----------------|---------------|-----------------|----------|---------|
| 1 | `app/api/cash/month/route.ts` — **GET** | `findMonth`, `probeMonth`, `listEntriesForMonth`, `monthSummary` | `cash_months`, `cash_entries` (+ FK-embed users/customers) | signed-URL mint (storage port, stays service-role inside the per-caller svc) | **FLIP** to `cashServiceForCaller` — table reads run as authenticated; the signed-URL mint inside `listEntriesForMonth` uses the storage port which is still service-role. ✓ |
| 2 | `app/api/cash/month/route.ts` — **POST** | `probeMonth`, `createMonth` | `cash_months` insert | none | **FLIP** |
| 3 | `app/api/cash/month/[id]/route.ts` — **PATCH** | `setMonthLocked` | `cash_months` update | none | **FLIP** |
| 4 | `app/api/cash/entry/route.ts` — **POST** | `findMonthById`, `validateEntry`, `createEntry` | `cash_months` read + `cash_entries` insert | none | **FLIP** (validateEntry is pure, runs in-process regardless) |
| 5 | `app/api/cash/entry/[id]/route.ts` — **PATCH** | `updateEntry` | `cash_entries` update | none | **FLIP** |
| 6 | `app/api/cash/entry/[id]/route.ts` — **DELETE** | `deleteEntry` (= `findEntryAttachmentPath` + `attachments.remove` + `cash.deleteEntry`) | `cash_entries` read + delete | `attachments.remove` (storage port stays service-role) | **FLIP** — table read/delete run authenticated; the file remove uses the storage port (service-role) inside the per-caller svc. ✓ |
| 7 | `app/api/cash/cheques/route.ts` — **GET** | `listCheques` | `cheque_records` (+ FK-embed) | none | **FLIP** |
| 8 | `app/api/cash/cheques/route.ts` — **POST** | `validateCheque`, `createCheque` | `cheque_records` insert | none | **FLIP** |
| 9 | `app/api/cash/cheques/[id]/route.ts` — **PATCH** | `bankCheque` or `updateCheque` | `cheque_records` update | none | **FLIP** |
| 10 | `app/api/cash/cheques/[id]/route.ts` — **DELETE** | `deleteCheque` | `cheque_records` delete | none | **FLIP** |
| 11 | `app/api/cash/export/route.ts` — **GET** | `readCashBookData`, `readChequeRegisterData`, `buildCashBookCsv`, `buildChequeRegisterCsv` | `cash_months`, `cash_entries`, `cheque_records` reads | none | **FLIP** (CSV builders are pure) |
| 12 | `app/api/cash/upload/route.ts` — **POST** | `validateAndBuildUploadPath` (pure), `uploadAttachment` | none | **upload (storage only)** | **FLIP the wiring but it is storage-only.** Building `cashServiceForCaller` is harmless (its storage port is still service-role, so `uploadAttachment` runs service-role exactly as today). For clarity and to avoid minting a pointless token on a pure-storage route, **MAY stay on `cashService`** — see decision below. |

> **8 route FILES, 12 handlers.** All 8 files import `cashServiceForCaller`
> except possibly `upload` (decision D-UPLOAD below).

**Decision D-UPLOAD (lock during Render):** `POST /api/cash/upload` touches **no
RLS tables** — only Storage (which stays service-role regardless). Two equivalent
options, both byte-identical on the wire:
- **(a) Stay on `cashService`** (recommended): the route does no table I/O, so
  there is nothing for RLS to enforce; building a per-caller service would mint a
  token for nothing. Cleaner and cheaper. **Recommended verdict: STAY.**
- **(b) Flip to `cashServiceForCaller`** for uniformity: harmless because the
  storage port inside it is service-role, but wasteful (mints an unused token).

**Recommendation: upload STAYS on `cashService`** (storage-only, no RLS surface).
The plan's headline count is therefore **7 route files flipped (11 handlers),
1 file (upload) stays service-role** — directly analogous to pricing's `replace`
route staying service-role, except here the reason is *Storage has no
authenticated policies* rather than *a revoked SECURITY DEFINER RPC*.

🗣 **In plain English:** Every cash screen that reads or writes the cash **tables**
switches to the badge. The bits that touch **files** (upload a receipt, delete a
receipt, generate a download link) keep the master key, because the file cabinet
has no badge-locks installed. The pure file-upload screen has no table work at
all, so it just keeps the master key entirely — same shape as the one pricing
route we left on the master key last time.

### E2 — Predicate style: `current_user_is_valid()` (LOCKED, per spec — Pattern B)

The spec mandates **Pattern B (valid office/admin)** reusing
`current_user_is_valid()`. That helper returns true for ANY GUC mapping to a real
`public.users` row — it does **not** itself filter by role. The "office vs admin"
distinction (e.g. admin-only month creation, office-or-admin cheque logging) is
enforced in the **route layer** today (`x-mfs-user-role` checks) and STAYS there,
exactly as the spec's locked decision requires ("DB enforces WHO can touch cash;
app keeps enforcing WHICH month / WHICH role").

So "Pattern B (valid office/admin)" at the RLS layer = **valid-user predicate**
(`current_user_is_valid()`), with the office/admin role split remaining in the
app. This is identical to how pricing (04d) used the same helper while keeping
"sales own only" in the app. RLS is never stricter than the route's own gating.

🗣 **In plain English:** The database door checks "real employee, yes/no" using
the same trusted-bouncer function pricing used. The "admin can do X, office can do
Y" rules stay in our code where they already live — we are deliberately NOT
teaching those finer rules to the database.

---

## 7. Migration SQL sketch (`20260621120000_cash_authenticated_rls_policies.sql`)

```sql
-- 20260621120000_cash_authenticated_rls_policies.sql
--
-- F-RLS-04e — Cash-context RLS cutover. Byte-identical-intent mirror of
-- 20260619120000 (pricing), adapted to cash_months + cash_entries + cheque_records.
--
-- ADDITIVE migration: adds the FULL policy set (12 policies, 4 commands × 3
-- tables) so the per-request AUTHENTICATED Supabase client can read AND write
-- through the Postgres `authenticated` role once the cash API routes are flipped
-- onto cashServiceForCaller.
--
-- WHY THE FULL SET: 20260613000000_enable_rls_42_tables.sql ran
--   ALTER TABLE cash_months/cash_entries/cheque_records ENABLE ROW LEVEL SECURITY
--   but added NO policies. RLS-enabled + zero-policies = DENY EVERYTHING for
--   non-service-role. Once the cash routes run as `authenticated`, every read
--   returns nothing unless SELECT policies ship → cash screens blank. SELECT is
--   the headline must-fix. INSERT/UPDATE/DELETE ship too so create/edit/delete/
--   lock/bank all work under the badge.
--
-- ROLE MODEL — VALID-USER ONLY, no `role IN (...)` filter (Pattern B, mirrors
--   04c/04d): any caller whose GUC maps to a real public.users row is allowed.
--   The office "current-month only" rule and the admin/office route gates stay
--   in the route + CashService.validateEntry layer exactly as today — RLS is
--   never stricter than the service's own gating. F-TD-28 (local-vs-London time
--   in validateEntry) is OUT OF SCOPE.
--
-- PREDICATE: public.current_user_is_valid() (SECURITY DEFINER STABLE helper,
--   shipped in 20260618130000) — recursion-proof valid-user check. EXECUTE
--   already granted to `authenticated`; no new grant, no new helper.
--
-- GRANTS: baseline.sql L2548/L2553/L2558 already GRANT ALL on all three tables
--   TO authenticated → NO GRANT added here.
--
-- STORAGE NOT TOUCHED: the cash-attachments bucket (storage.objects) has no
--   authenticated policies; the upload / attachment-remove / signed-URL paths
--   stay on the service-role client (wiring keeps the AttachmentStorage port on
--   the service-role singleton — F-RLS-04e E1). This migration is table-RLS only.
--
-- SERVICE-ROLE still BYPASSES RLS (no FORCE) → any service-role path (incl. the
--   parachute singleton and the storage port) is unaffected.
--
-- NON-DESTRUCTIVE: CREATE POLICY only — no DROP TABLE/TRUNCATE/ALTER TYPE/
--   DROP COLUMN/DROP NOT NULL → NO PITR gate fires.
--
-- One policy per command per table → no over-grant possible (Postgres OR's
--   permissive policies; here each command has exactly one).
--
-- Apply via Supabase MCP apply_migration ONLY. Local: npm run db:reset. Prod
-- application deferred to the ship gate: apply to PROD FIRST, then merge
-- (the 04a/04b/04c/04d/F-TD-22 ordering).

DROP POLICY IF EXISTS cash_months_select    ON cash_months;
DROP POLICY IF EXISTS cash_months_insert    ON cash_months;
DROP POLICY IF EXISTS cash_months_update    ON cash_months;
DROP POLICY IF EXISTS cash_months_delete    ON cash_months;
DROP POLICY IF EXISTS cash_entries_select   ON cash_entries;
DROP POLICY IF EXISTS cash_entries_insert   ON cash_entries;
DROP POLICY IF EXISTS cash_entries_update   ON cash_entries;
DROP POLICY IF EXISTS cash_entries_delete   ON cash_entries;
DROP POLICY IF EXISTS cheque_records_select ON cheque_records;
DROP POLICY IF EXISTS cheque_records_insert ON cheque_records;
DROP POLICY IF EXISTS cheque_records_update ON cheque_records;
DROP POLICY IF EXISTS cheque_records_delete ON cheque_records;

-- ── cash_months ─────────────────────────────────────────────
CREATE POLICY cash_months_select ON cash_months
  FOR SELECT USING ( public.current_user_is_valid() );
CREATE POLICY cash_months_insert ON cash_months
  FOR INSERT WITH CHECK ( public.current_user_is_valid() );
CREATE POLICY cash_months_update ON cash_months
  FOR UPDATE USING ( public.current_user_is_valid() )
             WITH CHECK ( public.current_user_is_valid() );
CREATE POLICY cash_months_delete ON cash_months
  FOR DELETE USING ( public.current_user_is_valid() );

-- ── cash_entries (UPDATE needed — updateEntry PATCHes a row in place) ──
CREATE POLICY cash_entries_select ON cash_entries
  FOR SELECT USING ( public.current_user_is_valid() );
CREATE POLICY cash_entries_insert ON cash_entries
  FOR INSERT WITH CHECK ( public.current_user_is_valid() );
CREATE POLICY cash_entries_update ON cash_entries
  FOR UPDATE USING ( public.current_user_is_valid() )
             WITH CHECK ( public.current_user_is_valid() );
CREATE POLICY cash_entries_delete ON cash_entries
  FOR DELETE USING ( public.current_user_is_valid() );

-- ── cheque_records (UPDATE needed — bankCheque + updateCheque PATCH in place) ──
CREATE POLICY cheque_records_select ON cheque_records
  FOR SELECT USING ( public.current_user_is_valid() );
CREATE POLICY cheque_records_insert ON cheque_records
  FOR INSERT WITH CHECK ( public.current_user_is_valid() );
CREATE POLICY cheque_records_update ON cheque_records
  FOR UPDATE USING ( public.current_user_is_valid() )
             WITH CHECK ( public.current_user_is_valid() );
CREATE POLICY cheque_records_delete ON cheque_records
  FOR DELETE USING ( public.current_user_is_valid() );

-- ROLLBACK (manual): DROP the 12 policies above (see §10 / rollback .sql).
```

> **Full 4-policy set on ALL THREE tables — verified against the adapter:**
> - `cash_months`: SELECT (findMonth/probe/cashbook), INSERT (createMonth),
>   UPDATE (`setMonthLocked` PATCHes in place), DELETE (none today, but ship for
>   symmetry + future-proofing — harmless valid-user predicate).
> - `cash_entries`: SELECT, INSERT (createEntry), **UPDATE (updateEntry PATCHes
>   in place — same divergence as pricing lines)**, DELETE (deleteEntry).
> - `cheque_records`: SELECT, INSERT (createCheque), **UPDATE (bankCheque AND
>   updateCheque both PATCH in place)**, DELETE (deleteCheque).
>
> **Missing the UPDATE policy on `cash_entries` would silently break entry
> edits; missing it on `cheque_records` would silently break banking AND cheque
> edits.** Both are explicitly asserted in pgTAP (§9).

🗣 **In plain English:** Twelve door rules, four per table: see / create / edit /
delete. Each says only "must be a real signed-in user." The "edit" rule matters
especially on entries and cheques — locking a month, banking a cheque, and
editing either all change a row in place, and forgetting the edit-rule would make
those quietly fail. We test that explicitly.

---

## 8. Step ordering (TDD-first where it pays)

1. **Write the migration** (`20260621120000_…`) — §7. `npm run db:reset` to apply
   locally. 🗣 Ship the doors first so nothing else blanks while developing.
2. **Write the pgTAP test** `012-rls-cash.test.sql` (§9). Run red→green against
   the new migration. 🗣 Prove the doors lock and open correctly before any app
   code trusts them.
3. **Write the wiring unit test** `cashServiceForCaller.test.ts` (RED), then add
   `cashServiceForCaller` to `lib/wiring/cash.ts` (§5.2) → GREEN. Assert: minted
   per-caller, never memoized, table port per-caller, **storage port = the
   service-role singleton**, the `cashService` singleton still exported. 🗣 Prove
   the badge-wearing service is built per-caller and that file ops keep the master
   key, before wiring it into routes.
4. **Re-point the 7 table-touching route files** (§5.3) one at a time, running
   `tests/integration/cash.test.ts` after each:
   - `app/api/cash/month/route.ts` (GET, POST)
   - `app/api/cash/month/[id]/route.ts` (PATCH)
   - `app/api/cash/entry/route.ts` (POST)
   - `app/api/cash/entry/[id]/route.ts` (PATCH, DELETE) — DELETE's
     `attachments.remove` runs through the storage port (service-role) inside the
     per-caller service; the table read/delete run authenticated. No special
     handling — the wiring does it.
   - `app/api/cash/cheques/route.ts` (GET, POST)
   - `app/api/cash/cheques/[id]/route.ts` (PATCH, DELETE)
   - `app/api/cash/export/route.ts` (GET)
   - **`app/api/cash/upload/route.ts` STAYS on `cashService`** (D-UPLOAD: storage
     only, no RLS surface) — do not edit unless Render flips to option (b).
5. **Update the `lib/wiring/cash.ts` doc comment** (§5.2) to reflect the now-built
   factory and the storage-stays-service-role rationale.
6. **Extend the integration test** (§5.6) — cutover + role-gate + FK-embed-name
   assertions.
7. **Write the rollback .sql** (§10).
8. **Full local gate:** `npm run db:reset` → pgTAP green (`012`), unit green,
   `npm run test:integration` green, then the E2E cash flow (§9) on the preview at
   ship.

🗣 **In plain English:** Build the database doors first and prove them; then build
the badge-service (with file ops kept on the master key) and prove it; then switch
each table-touching screen over one at a time, re-running the cash tests after
each so a break is obvious immediately. The upload screen is left alone.

---

## 9. Test matrix (mirror 04d's ANVIL ladder)

```
ANVIL · F-RLS-04e cash RLS cutover
  Unit         ○ cashServiceForCaller (mint/build/never-memoize/storage=service-role/parachute)
  Integration  ○ cash routes under authenticated · role gates app-enforced · FK names non-blank
  DB / RLS     ○ pgTAP 012-rls-cash (CRUD + fail-closed + service bypass, all 3 tables)
  E2E          ○ open month → add entry → upload receipt → log cheque → bank → export (preview)
  🗣 every rung green before the cert prints
```

**pgTAP `012-rls-cash.test.sql`** (mirror `011`, ~16 assertions):
- Fixtures via service-role (bypasses RLS): 1 valid user (office), 1 customer,
  1 driver user, 1 seed `cash_months` + 1 seed `cash_entries` + 1 seed
  `cheque_records` so read/update/delete tests have targets.
- `SET LOCAL ROLE authenticated`; set `app.current_user_id` to the valid user.
- VALID USER: `isnt_empty` SELECT each table; `lives_ok` INSERT/**UPDATE**/DELETE
  on each. Assert the entry UPDATE and the cheque UPDATE explicitly (the
  in-place-PATCH divergences).
- EMPTY GUC fail-closed: `is_empty` SELECT (clean zero-rows deny — the helper
  short-circuits, same as pricing) and `throws_ok ... '42501'` INSERT on at least
  one table.
- SERVICE-ROLE bypass: `RESET ROLE`; empty GUC; `isnt_empty` proves service-role
  reads regardless (covers the parachute + the Storage-port service-role paths'
  table-free posture).
🗣 Proves the database doors deny strangers, admit real users (including in-place
edits and banking), and that the master key still opens everything (our parachute
and the file-storage paths' role).

**Unit `cashServiceForCaller.test.ts`** (mirror `pricingServiceForCaller.test.ts`
+ the cash storage assertion):
- Mock `dbTokenMinter`, `authenticatedClientForCaller`,
  `createSupabaseCashRepository`, `createCashService`, and the
  `supabaseAttachmentStorage` singleton.
- Assert: one mint with `{ userId }`, one client build from that token, the
  **table** repo bound to that client, the service built with `cash` = the
  per-caller repo AND `attachments` = the **service-role `supabaseAttachmentStorage`
  singleton** (NOT a per-caller storage).
- Assert NEVER memoizes: two calls → two mints/clients/repos, distinct tokens.
- Assert the `cashService` service-role singleton is still exported (parachute).
🗣 Proves each request gets its OWN badge for table work, file ops keep the master
key, and no identity leaks between users.

**Integration (extend `tests/integration/cash.test.ts`):**
- An office (non-admin) caller can open a month, list entries, list cheques under
  the authenticated cutover (no blank screens — proves SELECT policies end-to-end).
- An office caller can create an entry in the current month and log a cheque
  (proves INSERT under the badge + the app-layer office gate still passes).
- The role gates still bite: office POST `/api/cash/month` → 403 (admin-only),
  office PATCH `/api/cash/entry/[id]` → 403 (admin-only) — proves the role split
  stayed in the app, not RLS.
- FK-embed names (`created_by_user`, `driver`, `customer`) resolve non-blank for a
  non-admin caller (proves `users_directory_select` + `customers_select` cover the
  cash embeds under authenticated).
- Upload still works (storage path stays service-role).
🗣 End-to-end proof: real users see their screens, can add entries/cheques, the
admin-only rules still bite, the names still show, and receipts still upload.

**E2E (`@critical` preview smoke at ship):** open a month → add an entry → upload a
receipt → log a cheque → bank it → export CSV, all as an authenticated user
against the PR's Supabase preview branch.
🗣 A real click-through on a real preview proves the whole flow before prod.

---

## 10. Rollback approach

Two independent, instant levers (mirror 04d):

1. **Code lever (no SQL deploy):** revert each flipped route's local
   `const cashService = await cashServiceForCaller(userId)` back to the imported
   singleton (one line per handler). Documented inline as
   `// Rollback = swap cashServiceForCaller(userId) → cashService.` 🗣 Flip the
   screens back to the master key — they work immediately, RLS becomes irrelevant.
2. **DB lever:** the rollback `.sql` drops the 12 policies (no grant to revert).
   Because the *code* is what made traffic run as `authenticated`, the policies
   are harmless-but-inert once the code lever is pulled; dropping them is only
   needed to return the tables to bare RLS-enabled-no-policy. 🗣 The doors can be
   removed too, but pulling the code lever alone already restores service.

```sql
-- rollback: 2026-06-21-f-rls-04e-cash-rls-cutover-rollback.sql
DROP POLICY IF EXISTS cash_months_select    ON cash_months;
DROP POLICY IF EXISTS cash_months_insert    ON cash_months;
DROP POLICY IF EXISTS cash_months_update    ON cash_months;
DROP POLICY IF EXISTS cash_months_delete    ON cash_months;
DROP POLICY IF EXISTS cash_entries_select   ON cash_entries;
DROP POLICY IF EXISTS cash_entries_insert   ON cash_entries;
DROP POLICY IF EXISTS cash_entries_update   ON cash_entries;
DROP POLICY IF EXISTS cash_entries_delete   ON cash_entries;
DROP POLICY IF EXISTS cheque_records_select ON cheque_records;
DROP POLICY IF EXISTS cheque_records_insert ON cheque_records;
DROP POLICY IF EXISTS cheque_records_update ON cheque_records;
DROP POLICY IF EXISTS cheque_records_delete ON cheque_records;
```

**No data rollback / no PITR:** the migration is `CREATE POLICY` only — additive,
no data touched. State this at Lock so the conductor can confirm **no PITR
required**.

**Ship ordering (mirror 04a/04b/04c/04d):** apply the migration to **PROD FIRST**
via Supabase MCP `apply_migration`, confirm cash still reads on prod under
service-role (policies are inert until code flips), THEN merge the code PR. This
guarantees the doors exist before any prod traffic wears a badge.

🗣 **In plain English:** Put the doors in the production database BEFORE the code
that starts using badges ships. Doors-first means there is never a moment where a
real user has a badge but the door has no rule — which is the blank-screen
failure. And because we only add door rules (no data moved/deleted), there is no
backup gate and nothing to roll back data-wise.

---

## 11. Risk Assessment (MANDATORY — Gate 2 input)

### 11.1 Concurrency / race conditions
- **R-CONC-1 — per-request client identity leak via memoization.** Severity:
  **High** if mishandled. If `cashServiceForCaller` memoized the client/service,
  caller A's badge could serve caller B's request. **Mitigation:** the factory
  mints a fresh token + builds a fresh client every call (never memoize); the unit
  test asserts two calls → two distinct tokens. **Must-fix:** YES (test-enforced;
  the pattern is proven in orders/users/routes/pricing, so the risk is procedural).
  🗣 The danger is reusing one person's badge for the next person; we forbid caching
  and prove it with a test.
- **R-CONC-2 — `bankCheque` idempotency unchanged.** Severity: **None.** The
  `.eq('banked', false)` guard that makes banking bank-once is in the adapter and
  is untouched; running it as `authenticated` does not change the atomicity.
  **Must-fix:** NO.
  🗣 The "only bank once" guard is unaffected; we are changing who the call runs
  as, not how it runs.

### 11.2 Security
- **R-SEC-1 — RLS-enabled-zero-policy blank (the headline).** Severity:
  **Critical.** Flipping cash table reads to authenticated with no SELECT policy =
  every read returns nothing → total cash outage for real users. **Mitigation:**
  the migration ships the full SELECT+INSERT+UPDATE+DELETE set for **all three**
  tables; pgTAP `012` proves it; ship ordering applies the migration to prod
  FIRST. **Must-fix:** YES.
  🗣 Turn on locks without doors and everyone is locked out. The doors ship in the
  same change and go to prod first.
- **R-SEC-2 — Storage paths denied under authenticated.** Severity: **High** if
  the storage port were flipped; **None** as planned. The `cash-attachments`
  bucket has no authenticated `storage.objects` policies, so upload / remove /
  signed-URL would fail-closed under the badge. **Mitigation:** decision E1 — the
  `AttachmentStorage` port stays the service-role singleton inside
  `cashServiceForCaller`, and the upload route stays on `cashService` entirely.
  pgTAP doesn't cover Storage (it's not table RLS); the integration test asserts
  upload still works and the E2E uploads a receipt. **Must-fix:** YES (the wiring
  MUST keep storage on service-role — the structural guard against a silent
  attachment outage).
  🗣 The file cabinet has no badge-locks, so file operations keep the master key.
  Forgetting this would silently break receipt uploads, deletes, and download
  links. The wiring is built to prevent it, and the tests prove uploads still work.
- **R-SEC-3 — predicate too loose (any valid user touches all cash at DB level).**
  Severity: **Low / accepted.** The valid-user-only predicate (Pattern B) is the
  LOCKED decision; the office/admin role split and the office current-month rule
  stay in the app. This is byte-identical to today's effective behaviour
  (service-role saw all; app gated). **Mitigation:** none needed — by design.
  **Must-fix:** NO.
  🗣 The DB door checks "real employee," not "admin vs office" — same as today and
  a deliberate choice; the finer rules stay in our code.
- **R-SEC-4 — credential/hash exposure via the users FK-embed.** Severity: **None
  (already mitigated).** The cash embeds read `users(name)` / `users(id,name)`
  only, and 04c's column-privilege lockdown already seals `pin_hash`/`password_hash`
  from `authenticated`. **Must-fix:** NO.
  🗣 The rep/driver names show, but password hashes were already walled off.

### 11.3 Data migration
- **R-DATA-1 — destructive migration / PITR.** Severity: **None.** The migration
  is CREATE POLICY only — no DROP/TRUNCATE/ALTER TYPE/DROP COLUMN. No data touched
  → no PITR gate. **Must-fix:** NO. (State "no PITR required" at Lock.)
  🗣 We only add door rules; no data is moved or deleted, so no backup gate fires.

### 11.4 Business-logic flaws
- **R-BIZ-1 — missing UPDATE policy on `cash_entries` / `cheque_records`.**
  Severity: **High.** Both tables have in-place PATCH operations
  (`updateEntry`; `bankCheque` + `updateCheque`). Omitting their UPDATE policies
  would silently break entry edits, cheque banking, and cheque edits under the
  badge. **Mitigation:** §7 ships the FULL 4-policy set on all three tables; pgTAP
  `012` explicitly asserts `lives_ok` UPDATE on entries and on cheques. **Must-fix:**
  YES.
  🗣 Locking a month, banking a cheque, and editing an entry/cheque all change a
  row in place — each needs an "edit" door. Forgetting them makes those actions
  quietly fail; we ship and test them.
- **R-BIZ-2 — office current-month rule accidentally moved to RLS.** Severity:
  **Medium** if mishandled; **None** as planned. The spec LOCKS the rule in
  `validateEntry` (app layer). **Mitigation:** the migration predicate is
  valid-user-only (no month logic); `validateEntry` is untouched; the integration
  test keeps asserting the office current-month behaviour. **Must-fix:** NO
  (avoided by design — but the plan flags it so Render doesn't drift).
  🗣 The "office can only touch the current month" rule stays in our code, not the
  database — exactly as decided.
- **R-BIZ-3 — F-TD-28 scope creep.** Severity: **Low.** The local-vs-London time
  bug in `validateEntry` is tempting to "fix while we're here." **Mitigation:**
  explicitly OUT OF SCOPE per spec; `now: new Date()` call sites stay as-is.
  **Must-fix:** NO.
  🗣 We do not touch the known timezone bug here; that is a separate job.

### 11.5 Launch blockers
- **R-LAUNCH-1 — migration not applied to prod before code merge.** Severity:
  **Critical.** If code ships first, real users get badges before doors exist →
  R-SEC-1 in prod. **Mitigation:** ship ordering (§10) — apply migration to prod
  FIRST, verify, then merge. **Must-fix:** YES (process gate at ship).
  🗣 Doors before badges, in production. Wrong order = outage.
- **R-LAUNCH-2 — migration filename collision / short-form ban.** Severity: Low.
  **Mitigation:** `20260621120000_cash_authenticated_rls_policies.sql` is after the
  latest (`20260619120000`) and matches the 14-digit rule. **Must-fix:** NO.
  🗣 The filename uses the full 14-digit timestamp, so it won't collide or break
  preview branches.

### Risk headline
**Five must-fix items**, all standard for this 4th-cutover pattern and all closed
by the plan as written:
- **R-SEC-1** — ship the full 12-policy set (headline blank-screen trap);
- **R-SEC-2** — keep Storage on service-role (the cash-specific divergence — the
  silent-attachment-outage trap pricing didn't have);
- **R-BIZ-1** — UPDATE policies on entries + cheques (in-place PATCH);
- **R-CONC-1** — never-memoize the per-caller factory (test-enforced);
- **R-LAUNCH-1** — prod-migration-first ship order.

None is an *open* blocker — the plan resolves each. They are must-fix
*requirements the plan already satisfies*. **No open Gate-2 blocker.**

---

## 12. Acceptance criteria

1. Migration `20260621120000_cash_authenticated_rls_policies.sql` exists, ships 12
   policies (4 per table × 3 tables) using `current_user_is_valid()`, no GRANT, no
   destructive statement.
2. `lib/wiring/cash.ts` exports `cashServiceForCaller(userId)` — per-caller table
   repo, **service-role storage port**, never memoized — AND still exports the
   `cashService` service-role singleton.
3. The 7 table-touching cash route files (11 handlers) build a per-caller service
   after the auth gate and run their table I/O as `authenticated`; `cash/upload`
   stays on `cashService` (storage-only); attachment remove + signed-URL mint run
   via the service-role storage port inside the per-caller service.
4. pgTAP `012-rls-cash.test.sql` green: CRUD (incl. the entry + cheque UPDATEs) for
   a valid user, fail-closed for empty/absent GUC, service-role bypass — all three
   tables.
5. `cashServiceForCaller.test.ts` green: mint/build/never-memoize/storage=service-role/
   parachute.
6. `tests/integration/cash.test.ts` green incl. new cutover / role-gate /
   FK-embed-name / upload-still-works assertions.
7. E2E cash flow green on preview under an authenticated user (open month → add
   entry → upload → log cheque → bank → export).
8. No `@supabase/*` import added outside `lib/adapters/supabase/`; no adapter
   import outside `lib/wiring/` (ESLint `no-adapter-imports` pinned test passes).
9. Wire responses byte-identical to pre-cutover for every handler. `validateEntry`
   (incl. its `new Date()` F-TD-28 behaviour) and the office current-month rule
   unchanged.

---

## 13. Hexagonal verdict (Gate 2 input — computed)

- **Ports used:** `CashRepository` AND `AttachmentStorage` (`lib/ports`) — **both
  unchanged**. No new port.
- **Adapters:** `lib/adapters/supabase/CashRepository.ts` via
  `createSupabaseCashRepository(client)` and
  `lib/adapters/supabase/AttachmentStorage.ts` (`supabaseAttachmentStorage`
  singleton) — **both unchanged** (already exist; the cutover just hands the
  CashRepository an authenticated client instead of the service-role one, and
  keeps AttachmentStorage on service-role).
- **New dependencies:** **NONE.** No `package.json` change. All seams
  (`dbTokenMinter`, `authenticatedClientForCaller`, `createSupabaseCashRepository`,
  `createCashService`, `supabaseAttachmentStorage`) already exist and are exported.
- **Single-use vendor wrapping:** N/A — no new vendor library; Supabase already
  wrapped behind the two ports.
- **Vendor isolation:** the `SupabaseClient` is constructed and consumed entirely
  inside `lib/wiring/cash.ts`; routes receive a ready `CashService` built from
  ports. No vendor type leaks past the adapter/wiring boundary.
- **Rip-out test:** "replace the DB vendor for Cash tomorrow" = one new adapter
  folder (CashRepository + AttachmentStorage) + edits to `lib/wiring/cash.ts` only.
  Routes, services, domain untouched. **PASS.**

🗣 **In plain English:** We add no new vendor, library, socket, or plug. We feed
the existing cash table-plug a different power source (the badge instead of the
master key) and leave the file-storage plug on the master key — all wiring lives
in the one allowed wiring file. Swap databases tomorrow and it is still one
adapter folder + one wiring file. Clean hexagonal — PASS.
