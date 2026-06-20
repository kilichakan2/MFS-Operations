# F-16 PR2 — Cash route re-point (9 routes off raw Supabase → `cashService`)

**Date:** 2026-06-20
**Unit:** F-16 PR2 (follows F-16 PR1 — Cash domain/ports/service/adapters shipped, PR #59, commit `9a406cb`)
**Author:** forge-planner (FORGE Order phase)
**Status:** plan locked — implementer-ready, with TWO conductor decisions flagged (D1, D2) + ONE stop-and-report (the discrepancy route mapping mismatch, R-WIRE-9)

---

## Mini-map

```
DOMAIN (cash core)
  ├─ CashRepository    (port) → [Supabase]  (adapter, PR1)
  └─ AttachmentStorage (port) → [Supabase]  (adapter, PR1)
  cashService singleton (service-role, DARK) → 9 routes re-point (PR2)
🗣 PR1 built two sockets; PR2 unplugs 9 routes from the bare database and plugs them into those sockets — wire output must stay byte-for-byte identical
```

**🗣 In plain English:** PR1 built the Cash machinery (a database socket and a file-storage socket) but left it switched off with no caller. PR2 is the wiring job: it disconnects 9 API endpoints from the raw database and reconnects them through that machinery. The screens must see exactly the same JSON/CSV bytes they see today — this is plumbing, not a feature.

---

## 1. Goal

Re-point 9 routes off direct `@supabase/*` usage onto the already-shipped `cashService` singleton (`lib/wiring/cash.ts`), with **byte-identical wire behaviour** — every HTTP status, JSON body shape (snake_case keys + key order), CSV byte stream, and `Content-Disposition`/`Content-Type` header unchanged.

The 8 cash routes + 1 absorption:
- `app/api/cash/month/route.ts` (GET, POST)
- `app/api/cash/month/[id]/route.ts` (PATCH)
- `app/api/cash/entry/route.ts` (POST)
- `app/api/cash/entry/[id]/route.ts` (PATCH, DELETE)
- `app/api/cash/cheques/route.ts` (GET, POST)
- `app/api/cash/cheques/[id]/route.ts` (PATCH bank/edit, DELETE)
- `app/api/cash/export/route.ts` (GET cash/cheques CSV)
- `app/api/cash/upload/route.ts` (POST)
- `app/api/detail/discrepancy/route.ts` (GET) — **STOP item: this route does NOT touch the Cash domain (it reads `discrepancies`); `cashService` has no method for it. See R-WIRE-9 / §11.**

**🗣 In plain English:** Move 9 endpoints from talking to the database directly to talking through the Cash service box, with no observable change. One of the nine (the discrepancy lookup) turns out not to be a cash endpoint at all — it reads a different table the Cash box doesn't know about — so it needs a conductor decision before the implementer touches it.

### Hard constraints (from the locked spec — non-negotiable)
- **No migration. No `.sql`.** Schema untouched.
- **No new dependency.** `package.json` untouched.
- **No new port method, no service change.** Every route maps onto an EXISTING `CashService` method (the foundation is frozen — do NOT modify `lib/domain/Cash.ts`, the ports, the service, or the adapters). *Exception flagged:* the discrepancy route has no Cash method — see R-WIRE-9.
- **No auth/RLS change.** PR2 stays on the **service-role** singleton `cashService`. `lib/wiring/cash.ts` explicitly forbids adding a `cashServiceForCaller` here (lines 34-35) — **do not add one** (that is F-RLS-04e).
- **F-TD-28 DEFERRED** (conductor ruling): the entry current-month check stays on local-server `new Date()` — pass `now: new Date()` into `validateEntry`. Do NOT switch to `londonToday()`. Byte-identical wins over the London-time fix here.
- **Byte-identical wire output**, incl. JSON **key order** (`NextResponse.json` serialises in insertion order) and **raw-row passthrough** where routes currently spread DB rows.

**🗣 In plain English:** Plumbing only — no database structure changes, no new libraries, no new lockdown rules, no touching the frozen Cash machinery, and the timezone bug stays as-is on purpose. The JSON keys must even come out in the same order.

---

## 2. Domain terms (plain-English glossary for this plan)

- **Service** (`cashService`, `lib/wiring/cash.ts`) — the business box the routes call instead of the database. 🗣 The labelled box the route trusts; swap the database vendor and only the box's wiring changes.
- **Port** (`CashRepository`, `AttachmentStorage`) — the sockets the app owns. 🗣 The shapes the database and file-store must fit; vendors adapt to us.
- **DTO mapping** (NEW `lib/api/cash/dto.ts`) — pure functions turning camelCase domain objects back into the EXACT snake_case wire shape today's routes emit. 🗣 A translator that re-labels `openingBalance` → `opening_balance` so screens still read it; the wire-compat tripwire.
- **Raw-row passthrough** — several current routes return the DB row verbatim (`{ month: monthRow }`, spread `...e`). 🗣 Today some endpoints hand the screen the database's own row untouched; the domain object is a *cleaned-up, lossy* version, so the translator must REBUILD the missing/raw keys, not just rename.
- **`.single()` → `.maybeSingle()`** — old routes used `.single()` (errors on zero rows but the route ignored the error → `data` null); adapter uses `.maybeSingle()` (null, no error). 🗣 Both end up with "nothing found = null", so the 404 branches still fire — but every not-found path must be re-verified.

---

## 3. Files read / context established

- All 9 route files (current behaviour captured per-route in §7).
- `lib/services/CashService.ts`, `lib/ports/CashRepository.ts`, `lib/ports/AttachmentStorage.ts`, `lib/domain/Cash.ts` — the frozen PR1 foundation; method surface + domain field names.
- `lib/adapters/supabase/CashRepository.ts` — **critical**: confirms the service's `createMonth`/`createEntry`/`updateCheque`/`setMonthLocked` return *mapped camelCase domain objects* (via `toMonth`/`toEntry`/`toCheque`), NOT the raw rows the routes echo today. This is the dominant byte-identity risk.
- `lib/wiring/cash.ts` — exports `cashService` (service-role singleton, DARK).
- **F-15 PR2 plan + DTO** (`docs/plans/archive/2026-06-19-f-15-pr2-pricing-route-repoint-email-absorption.md`, `lib/api/pricing/dto.ts`) — the template: pure key-for-key + key-ORDER DTO translators in `lib/api/<domain>/dto.ts`, mirroring `lib/api/orders/dto.ts`.
- **F-15 PR2 review** (`docs/reviews/2026-06-19-f-15-pr2-pricing-route-repoint-review.md`) — the cautionary tale: PR2 was BLOCKED because the domain shape was *lossier* than what the route actually emitted (list lines dropped). **Direct lesson for cash:** the GET/POST cash routes emit RAW rows; the domain types omit columns (`created_by`, raw join objects). Mapping must reproduce the *route's literal output*, not the *domain shape*.
- F-16 PR1 Guard review (`docs/reviews/2026-06-22-f-16-pr1-cash-domain-foundation-review.md`) — the three carry-forward warnings (§5).
- `lib/errors/index.ts` — `ConflictError`, `ServiceError`, `NotFoundError` etc. The adapter throws `ServiceError` on DB failure and `ConflictError` (PG 23505) on duplicate month.

**🗣 In plain English:** I read every route, the frozen Cash box and its database adapter, the pricing template we copy, and — importantly — the pricing review where this exact kind of PR broke because the "clean" domain object had fewer fields than the screen expected. That is the trap to avoid here.

---

## 4. ADR conflicts

**None.** This PR is the explicit "PR2 re-points the eight routes" follow-up named in `lib/wiring/cash.ts` (lines 16-21) and the `CashRepository` port header. It honours:
- **ADR-0002** (ports & adapters, dependency rule, vendor types stop at the adapter): routes import the service singleton only and **drop** their `@supabase/*` imports.
- **ADR-0004** (RLS vs service-role): PR2 stays on the **service-role** singleton — no RLS change (that is F-RLS-04e).
- **ADR-0003** (strangler-fig / freeze rule): PR2 is the strangler step that retires the raw-Supabase call sites for the cash surface.

**One watch item — the discrepancy route (R-WIRE-9).** Absorbing it through `cashService` would force a NEW non-cash method onto the Cash port — an ADR-0002 cohesion smell (a `discrepancies` read does not belong in the Cash domain). See §11 for the three options + recommendation.

**🗣 In plain English:** No decisions in the project's decision log are broken — this PR is the step those decisions said was coming. The only snag is the discrepancy endpoint: cramming a non-cash database read into the Cash box would pollute it, which the architecture rules frown on. I flag it rather than guess.

---

## 5. The THREE mandatory carry-forwards (F-16 PR1 Guard review)

These are baked into the per-route sections (§7). Summary + where each lands:

1. **First-month `opening_balance required` 400 check** (`month/route.ts:165-169`). `CashService` has NO `validateMonth`; `createMonth` blindly does `Number(input.openingBalance)` → `Number(null)` = 0. **DECISION D-CARRY: keep the check IN THE ROUTE** (lowest risk, mirrors current behaviour, no service change — the spec recommends this and forbids touching the frozen service). The route must do its own "is this the first month?" probe to know *whether* opening_balance is required. **`probeMonth()` gives exactly that** (`{ isFirst, suggestedOpening }`). See §7.1-POST for the exact branch. **Externally-observable 400 MUST survive.**

2. **`.single()` → `.maybeSingle()` miss-branch parity.** Every not-found branch is mapped explicitly in §7 (look for "NULL→" rows). The service/adapter returns `null` on zero rows; the route must reproduce today's status on null (404 / 409 / specific). Affected: month GET (miss → probe branch), entry POST permission read (`findMonthById` null → 404), export cash (`readCashBookData` null → 404), cheque bank (`bankCheque` null → 404), month lock (`setMonthLocked` null → see D2), entry edit (`updateEntry` null → see R-WIRE-4b).

3. **Domain→response mapping for `updateCheque` (edit) + `setMonthLocked` + ALL raw-row GET/POST.** This is the **highest-risk carry-forward** and is BROADER than the review's two examples. The review named cheque-edit (`{ ok, record: <raw row> }`) and month-lock (`{ month: <raw row> }`). Reading the routes shows the problem is **pervasive**: month GET/POST, entry POST, cheque GET/POST also return **raw rows or raw spreads** that the domain objects do not byte-match. Every one is mapped field-for-field in §7 and implemented in `lib/api/cash/dto.ts` (§6).

**🗣 In plain English:** Three things from the PR1 review must survive. (1) Keep the "first month needs an opening balance → 400" check in the route, using the service's existing "is this the first month?" probe. (2) Re-check every "not found → 404" path still fires. (3) The big one: today many endpoints hand back the database's raw row, and the clean Cash object has different/fewer keys — so a translator must rebuild the exact old shape, and this affects far more endpoints than the review listed.

---

## 6. The DTO layer (`lib/api/cash/dto.ts` — NEW) — the core of byte-identity

Mirror `lib/api/pricing/dto.ts` exactly: pure functions, no I/O, unit-tested **key-for-key AND key-order**. The domain→wire mappings below are derived from each route's literal response (§7). **Key order = the order keys appear in the current route's response object literal.**

> **THE CRITICAL DESIGN POINT (from the F-15 PR2 review lesson):** the cash routes do NOT return clean shapes — they return **raw DB rows** (`monthRow`, `created`) and **raw spreads** (`...e`, `...r`). The domain `CashMonth`/`CashEntry`/`ChequeRecord` are *cleaned, lossy* versions. The DTO functions below must **reconstruct the exact wire shape the route emits today**, including raw columns the domain preserves and any that it drops. Where the domain DROPS a field that the wire emitted, that is a **R-WIRE blocker** — flagged inline.

### 6.1 `toMonthWireDto(m: CashMonth)` → the `month` object

Current wire (month GET `monthRow` = `select('*')`; month POST `created` = `.select().single()` after insert) is the **full `cash_months` row**: `id, year, month, opening_balance, is_locked, created_by, created_at`. The domain `CashMonth` carries ALL of these (`id, year, month, openingBalance, isLocked, createdBy, createdAt`). ✓ lossless.

| Wire (snake_case) | Domain | Note |
|---|---|---|
| `id` | `m.id` | |
| `year` | `m.year` | |
| `month` | `m.month` | |
| `opening_balance` | `m.openingBalance` | **Type note R-WIRE-1**: raw row `opening_balance` may be a Postgres `numeric` returned as a **string** by PostgREST; `toMonth` does `Number(...)`. Today's route returns the raw value (string or number) inside `month`. See R-WIRE-1 — likely a number in practice, but verify in the integration test (assert the exact JSON value/type). |
| `is_locked` | `m.isLocked` | raw row is boolean; domain `Boolean(...)`. Match. |
| `created_by` | `m.createdBy` | |
| `created_at` | `m.createdAt` | |

> **Column-order caveat:** `select('*')` returns columns in DB column order, which is the table's definition order — NOT guaranteed to equal the insertion order of a hand-built literal. The DTO must use the **DB column order** for the `month` object to match `monthRow` byte-for-byte. The baseline migration's `cash_months` column order is the source of truth — **the implementer must read `supabase/migrations/...baseline...sql` for the `cash_months` CREATE TABLE column order and order the DTO keys to match** (R-WIRE-1).

### 6.2 `toEntryListWireDto(e: CashEntry)` → entries in month GET

Current wire: `{ ...e, signed_url, created_by_name, edited_by_name, customer_name }` where `...e` is the raw row from `ENTRY_COLS_FULL` (`id, month_id, entry_date, type, category, amount, description, reference, attachment_path, attachment_name, created_at, edited_at, customer_id, created_by_user:{name}, edited_by_user:{name}, customer:{id,name}`). **So the raw spread KEEPS the join objects `created_by_user`, `edited_by_user`, `customer` AND adds the derived `*_name` keys.** The domain `CashEntry` **drops** the raw join objects (it only keeps the derived `createdByName` etc.).

**⚠ R-WIRE-2 (HIGH — the F-15-style trap):** today's entry wire object contains BOTH the raw join sub-objects (`created_by_user: {name}`, `edited_by_user: {name}`, `customer: {id,name}`) AND the flattened `created_by_name`/`edited_by_name`/`customer_name`. The domain `CashEntry` has ONLY the flattened names — the raw join objects are GONE. **If the screen reads `entry.customer.id` / `entry.created_by_user`, dropping them is a live regression** (exactly the F-15 PR2 B1 failure mode). **The implementer MUST grep the cash UI (`app/cash*`, `components/cash*`, and any `app/api/cash/month` consumer) for `created_by_user`, `edited_by_user`, `.customer.` / `customer?.id`, `edited_by_user` BEFORE choosing the DTO shape.**

- **If the UI reads only the flattened `*_name` keys** (likely — the route adds them precisely so the UI uses them): the DTO emits the flattened shape; the raw join objects were vestigial. But byte-identity is then NOT strict (the keys disappear from JSON). **This must be a conscious, tested decision, not silent.**
- **If the UI reads the raw join objects**: the domain `CashEntry` cannot reproduce them (it dropped `customer.id`). That would be a **STOP — the port shape is lossy for this wire** (same root cause as F-15 PR2 B1; the fix there required widening the port, which is FORBIDDEN here as the foundation is frozen). **STOP and report to conductor** — do not improvise.

The intended wire shape (assuming flatten-only is confirmed safe), key order = today's spread order then appended keys:

| Wire key | Domain | Note |
|---|---|---|
| `id` | `e.id` | |
| `month_id` | `e.monthId` | |
| `entry_date` | `e.entryDate` | |
| `type` | `e.type` | |
| `category` | `e.category` | |
| `amount` | `e.amount` | R-WIRE-1 numeric/string caveat applies. |
| `description` | `e.description` | |
| `reference` | `e.reference` | |
| `attachment_path` | `e.attachmentPath` | |
| `attachment_name` | `e.attachmentName` | |
| `created_at` | `e.createdAt` | |
| `edited_at` | `e.editedAt` | |
| `customer_id` | `e.customerId` | |
| `created_by_user` | **DROPPED by domain** | R-WIRE-2 — verify UI doesn't read it. |
| `edited_by_user` | **DROPPED by domain** | R-WIRE-2 |
| `customer` (join obj) | **DROPPED by domain** | R-WIRE-2 |
| `signed_url` | `e.signedUrl` | |
| `created_by_name` | `e.createdByName` | |
| `edited_by_name` | `e.editedByName` | |
| `customer_name` | `e.customerName` | |

### 6.3 `toEntryCreateWireDto(e: CashEntry)` → entry POST `entry` object

Current wire (entry POST): `{ ...e, created_by_name, customer_name, signed_url: null }` where `...e` is the raw row from `ENTRY_COLS_CREATE` (no `edited_at`, no `edited_by_user`; HAS `created_by_user`, `customer`). Same R-WIRE-2 raw-join concern. Key order: raw-create columns, then `created_by_name`, `customer_name`, `signed_url`. Note this shape OMITS `edited_at`/`edited_by_name` (fresh row) — the DTO for create must NOT emit them. **Two distinct entry DTOs (list vs create) needed** because the column sets differ.

### 6.4 `toChequeWireDto(c: ChequeRecord)` → cheque GET list rows + cheque POST + cheque edit

Cheque GET already builds an **explicit shaped object** (`cheques/route.ts:52-66`), NOT a raw spread — good, this is the byte target. Cheque POST builds the same explicit shape (`:123-137`). The domain `ChequeRecord` carries every field needed. Key order = the route's explicit literal:

| Wire key | Domain | Note |
|---|---|---|
| `id` | `c.id` | |
| `date` | `c.date` | |
| `amount` | `Number(c.amount)` → `c.amount` (already Number in domain) | |
| `cheque_number` | `c.chequeNumber` | |
| `notes` | `c.notes` | |
| `created_at` | `c.createdAt` | |
| `banked` | `c.banked` | |
| `banked_at` | `c.bankedAt` | route emits `?? null`; domain already `string \| null`. |
| `customer` | `c.customer` (NamedRef `{id,name}` \| null) | route emits raw `r.customer` join obj `{id,name}`; domain `customer` is `{id,name}\|null`. **Match** (both `{id,name}`). |
| `customer_name` | `c.customerName` | |
| `driver` | `c.driver` (NamedRef \| null) | route emits raw `r.driver` `{id,name}`; domain `{id,name}`. Match. |
| `logged_by_name` | `c.loggedByName` | |
| `banked_by_name` | `c.bankedByName` | POST emits literal `null` (fresh); domain `bankedByName` is null on a fresh create echo (no `banked_by_user` join in `CHEQUE_COLS_CREATE`). Match. |

> **Cheque POST key-order note:** POST literal order is `id, date, amount, cheque_number, notes, created_at, banked, banked_at, customer, customer_name, driver, logged_by_name, banked_by_name` — identical to GET's shaped object. One DTO covers both. ✓

### 6.5 `toChequeEditWireDto` — the `updateCheque` (edit) raw-row carry-forward (#3)

Current cheque EDIT wire: `{ ok: true, record: <raw cheque_records row> }` (`cheques/[id]/route.ts:65`). The raw row here is `.select().single()` with **NO embedded joins** (plain `.select()` = all columns, no `customer(...)`/`driver(...)`). So `record` = the bare `cheque_records` table row: `id, date, amount, cheque_number, notes, created_at, banked, banked_at, customer_id, customer_name, driver_id, logged_by, banked_by`.

**⚠ R-WIRE-5 (HIGH):** the service's `updateCheque` calls the adapter, which selects `CHEQUE_COLS_LIST` (WITH joins) and maps to the **domain `ChequeRecord`** (`{id, date, amount, chequeNumber, ..., customer: {id,name}, driver: {id,name}, loggedByName, bankedByName}`). This domain shape is **NOT** the bare raw row the edit route returns. The bare row has `customer_id, driver_id, logged_by, banked_by` (FK id columns) which the domain DROPS, and the domain ADDS join objects + flattened names the bare row never had.

**Therefore `toChequeEditWireDto` CANNOT reproduce the bare-row wire from the domain `ChequeRecord`** — `customer_id`/`driver_id`/`logged_by`/`banked_by` are absent from the domain object (domain has `customerId` ✓, but NOT `driverId`, `loggedBy`, `bankedBy` — confirmed against `lib/domain/Cash.ts:61-76`). **This is a STOP — the frozen port shape is lossy for the cheque-edit wire.** Options in §11 / R-WIRE-5; recommended = **D-EDIT-A** (map the available domain fields to the bare-row key names and accept the documented divergence: the missing `driver_id`/`logged_by`/`banked_by` FK ids). **The implementer must grep the UI for what the edit response is consumed as before the conductor decides** — if the admin edit screen re-reads `record.driver_id` etc., this is a real regression and needs the conductor's call.

### 6.6 `toMonthLockWireDto` — the `setMonthLocked` raw-row carry-forward (#3)

Current month-lock wire: `{ month: <raw row from .select().single()> }` = full `cash_months` row (all columns, no joins). The domain `CashMonth` is lossless against the full `cash_months` row (§6.1). **So `toMonthLockWireDto` = `{ month: toMonthWireDto(m) }`** — reuses §6.1. ✓ No loss. (Same DB column-order caveat R-WIRE-1.)

### 6.7 Summary block DTOs (month GET/POST `summary`)

Month GET `summary` = `{ opening, total_income, total_expense, closing }` (snake_case). Service `monthSummary()` returns `CashMonthSummary` = `{ opening, totalIncome, totalExpense, closing }` (camelCase). DTO `toSummaryWireDto(s)` → `{ opening: s.opening, total_income: s.totalIncome, total_expense: s.totalExpense, closing: s.closing }`. Month POST summary is the literal `{ opening, total_income: 0, total_expense: 0, closing: opening }` — the service's `createMonth` returns `summary` = `{opening, totalIncome:0, totalExpense:0, closing:opening}`; map via the same `toSummaryWireDto`. ✓

**🗣 In plain English:** One new translator file. The cheque list/POST and the month-lock shapes translate cleanly. But two shapes are dangerous: (a) the entry list/POST today carries the database's raw join sub-objects that the clean Cash object throws away, and (b) the cheque-EDIT response returns the bare database row with FK id columns the clean object doesn't have. Both can silently break a screen — so before writing those two translators, the implementer must check what the screens actually read, and if they need the dropped fields, stop and ask, because the Cash box is frozen and can't be widened in this PR.

---

## 7. Per-route re-point (current → target → byte-proof)

Throughout: header parsing + 401/403 role gates **stay in the route** (the service takes already-resolved `{userId, role}` — PR1 design). Wrap each service call so a thrown `ServiceError`/`ConflictError` reproduces today's 500/409 body + `console.error` line (§7.10 error posture).

### 7.1 `app/api/cash/month/route.ts`

**GET — current:** 401 if no `x-mfs-user-id`; 400 if year/month invalid; `findMonth` via `.single()` (`monthRow`). If `!monthRow`: probe previous month → `{ exists:false, isFirst:true, suggestedOpening:null }` (no prior) or `{ exists:false, isFirst:false, suggestedOpening }`. Else: list entries (joins + signed URLs), compute totals, return `{ exists:true, month: <raw monthRow>, entries: [<raw spread + names + signed_url>], summary: {opening, total_income, total_expense, closing} }`.

**GET — target:**
- 401/400 gates unchanged in route.
- `const month = await cashService.findMonth(year, month)`.
- **NULL→** `if (!month)` → `const probe = await cashService.probeMonth()` → return `{ exists:false, isFirst: probe.isFirst, suggestedOpening: probe.suggestedOpening }`. (Carry-forward #2: `findMonth` null = today's `!monthRow`. `probeMonth` reproduces both prior/no-prior branches — adapter `probeMonth` = `latestMonthRow` + `sumEntries`, identical math to the route's `closingBalance`.)
- Else: `const entries = await cashService.listEntriesForMonth(month.id)`; `const summary = cashService.monthSummary(month.openingBalance, entries)`. Return `{ exists:true, month: toMonthWireDto(month), entries: entries.map(toEntryListWireDto), summary: toSummaryWireDto(summary) }`.
- **Byte-proof:** `month` via §6.1 (R-WIRE-1 column order); entries via §6.2 (R-WIRE-2 raw-join check); summary via §6.7. `monthSummary` totals = route's `filter/reduce` Number() math (service code identical). ✓ pending R-WIRE-1/2.
- Drop `supabaseService`, local `closingBalance`, `getSignedUrl` imports/helpers.

**POST — current:** 401; 403 if `role !== 'admin'`; 400 if year/month invalid; `.single()` existing check → 409 `'Month already exists'` if found; latest-month probe → if first-ever and `opening_balance` null/NaN → **400 `'opening_balance required for first month'`** (carry-forward #1); else compute opening; insert; on error 500 `createErr.message`; return `{ month: <raw created>, summary: {opening, total_income:0, total_expense:0, closing:opening} }` status 201.

**POST — target:**
- 401/403/400 gates unchanged in route.
- **Carry-forward #1 (first-month 400):** `const probe = await cashService.probeMonth()`. `if (probe.isFirst && (body?.opening_balance == null || isNaN(Number(body.opening_balance)))) return 400 'opening_balance required for first month'`. (`probeMonth().isFirst` ⇔ today's "no prior month exists".)
- Build `CreateMonthInput`: `{ year, month, createdBy: userId, openingBalance: body?.opening_balance == null ? null : Number(body.opening_balance) }`. (Adapter recomputes opening from prior month when one exists; uses `input.openingBalance` only on first-ever — matches route.)
- `const { month: created, summary } = await cashService.createMonth(input)`.
- **409 carry-forward #2:** today's pre-check `.single()` → 409. The adapter instead relies on the UNIQUE `(year,month)` → `23505` → `ConflictError`. **Wrap the call: `catch (e) { if (e instanceof ConflictError) return 409 'Month already exists'; ... }`.** This is the PR1-review 🟢 improvement (closes a race) with the SAME wire result. **Keep the message string `'Month already exists'` exact.** (The old explicit pre-check is removed; the conflict now surfaces from the insert.)
- Return `{ month: toMonthWireDto(created), summary: toSummaryWireDto(summary) }` status 201.
- **Byte-proof:** `created` raw row vs `toMonthWireDto` — §6.1 R-WIRE-1. summary literal `{opening, total_income:0, total_expense:0, closing:opening}` — service returns exactly that. ✓ pending R-WIRE-1.

### 7.2 `app/api/cash/month/[id]/route.ts` (PATCH lock)

**Current:** 401; 403 non-admin; 400 if `is_locked` not boolean; `update().eq(id).select().single()`; 500 on error; return `{ month: <raw row> }`.

**Target:** gates unchanged. `const m = await cashService.setMonthLocked(id, body.is_locked)`.
- **NULL→ D2 (CONDUCTOR DECISION):** today the route uses `.single()` and returns `{ month: data }` — on a **missing id**, `.single()` sets `data=null` AND `error` (PGRST116). The route checks `if (error) return 500`. So **today a missing-id lock returns 500** (error set), NOT 404, NOT `{month:null}`. The service's `setMonthLocked` uses `.maybeSingle()` → returns `null`, NO error. So the re-point would return `{ month: null }` status 200 instead of today's 500. **This is a byte-divergence on the missing-id path.** Options: **(D2-A)** `if (m === null) return 500 { error: <?> }` to mirror today's 500 — but the exact `error.message` from PGRST116 is vendor text we can't reproduce faithfully; **(D2-B)** accept `{ month: null }` 200 (arguably more correct, but a wire change on an unreachable-in-practice path — the UI only locks months it just listed). **Recommend D2-B with a flag**, OR confirm the missing-id lock is unreachable in the UI. **STOP/flag — do not improvise.** On the happy path: `return { month: toMonthWireDto(m) }` (§6.6). ✓
- **Byte-proof (happy path):** §6.6 = lossless. Drop `supabaseService`.

### 7.3 `app/api/cash/entry/route.ts` (POST)

**Current:** 401; 400 invalid JSON; destructure body; 400 missing fields; 400 bad type; 400 amount≤0; `findMonthById` via `.single()` → 404 `'Month not found'` if null; 403 if locked; 403 office-not-current-month (LOCAL `new Date()`); 400 entry_date outside month; insert (income→null category, expense→null customer shaping); 500 on error; return `{ entry: { ...e, created_by_name, customer_name, signed_url:null } }` status 201.

**Target:** 401 + invalid-JSON gates unchanged. Build `CreateEntryInput` from body (camelCase; `createdBy: userId`). `const month = await cashService.findMonthById(body.month_id)`. `const v = cashService.validateEntry({ input, month, role, now: new Date() })` → `if (!v.ok) return NextResponse.json({ error: v.message }, { status: v.status })`. **This single call reproduces ALL the validation branches in order** (missing fields 400, bad type 400, amount 400, month null 404, locked 403, office-month 403, entry_date 400) — the service `validateEntry` cascade is byte-identical to the route (PR1 review §3 confirmed). **Carry-forward #1/#2:** `validateEntry` returns 404 `'Month not found'` when `month===null` — and `findMonthById` (`.maybeSingle()`) returns null on miss, identical to today's `.single()`→null. ✓ **F-TD-28 DEFERRED:** pass `now: new Date()` (LOCAL), NOT `londonToday()`.
- `const entry = await cashService.createEntry(input)` → `return { entry: toEntryCreateWireDto(entry) }` status 201.
- **Byte-proof:** validation strings + statuses identical (service mirrors route). Insert shaping (income/expense null rules, trim, Number) is in the adapter verbatim. Entry echo via §6.3 (R-WIRE-2 raw-join + omit edited_* check). ✓ pending R-WIRE-2.
- Drop `supabaseService`.

### 7.4 `app/api/cash/entry/[id]/route.ts` (PATCH, DELETE)

**PATCH — current:** 401; 403 non-admin; 400 invalid JSON; build `updates` (`edited_by`/`edited_at` always; `!= null` field guards); `update().eq(id).select().single()`; 500 on error; return `{ entry: data }` (**raw row, no joins** — plain `.select()`).

**PATCH — target:** gates unchanged. Build `UpdateEntryInput` (camelCase; `editedBy: userId`; only-supplied fields via `!= null`). `const e = await cashService.updateEntry(id, patch)`.
- **⚠ R-WIRE-4b (HIGH):** today's PATCH returns `{ entry: <raw row from plain .select()> }` = bare `cash_entries` row (`id, month_id, entry_date, type, category, amount, description, reference, attachment_path, attachment_name, created_at, edited_at, customer_id, created_by, edited_by`). The service `updateEntry` adapter selects `ENTRY_COLS_FULL` (WITH joins) → maps to domain `CashEntry` (drops `created_by`/`edited_by` FK ids; adds `*_name`/`signed_url`). **The domain shape ≠ the bare PATCH row** (bare row has `created_by`/`edited_by` ids and NO `*_name`/`signed_url`/join objects). Same lossy-port problem as R-WIRE-5. **STOP-check: grep the UI for how the entry-edit response is consumed** (does it re-read `entry.created_by`/`entry.edited_by`, or does it just re-fetch the month?). If the UI ignores the PATCH response body (likely — edit screens usually re-fetch the month list), the divergence is invisible; if it reads bare-row fields, this is a regression needing a conductor decision. **Map via a dedicated `toEntryEditWireDto`** that emits the bare-row key set from the domain fields available, and **flag the dropped `created_by`/`edited_by` ids** (domain `CashEntry` has no `createdById`/`editedById` — confirmed `Cash.ts:39-58`). Recommended default mirrors D-EDIT-A.
- **NULL→** `updateEntry` returns `null` on missing id (`.maybeSingle()`). Today `.single()` on missing id → `error` set → 500. Same D2-shaped divergence (500 today vs null today). **Flag under D2 family** — recommend returning the same shape as the missing-id PATCH today (likely unreachable; the UI edits entries it listed). Confirm with conductor.

**DELETE — current:** 401; 403 non-admin; read `attachment_path` via `.single()`; if present `storage.remove([path])`; `delete().eq(id)`; 500 on error; return `{ ok:true }`.

**DELETE — target:** gates unchanged. `await cashService.deleteEntry(id)` — the service composes `findEntryAttachmentPath` + `attachments.remove` + `deleteEntry` in the SAME order (PR1 §deleteEntry, verified). Return `{ ok:true }`. **Byte-proof:** identical order, idempotent, same body. Wrap for the 500/ServiceError posture (§7.10). ✓ clean. Drop `supabaseService`.

### 7.5 `app/api/cash/cheques/route.ts` (GET, POST)

**GET — current:** 401; build filtered query (status/from/to); 500 on error; return **array** of explicit shaped objects (`:52-66`).

**GET — target:** 401 unchanged. `const cheques = await cashService.listCheques({ status: sp.get('status') ?? 'all', from: sp.get('from'), to: sp.get('to') })`. Return `NextResponse.json(cheques.map(toChequeWireDto))` (a bare array, NOT wrapped — match today). **Byte-proof:** §6.4 = lossless; ordering (date desc, created desc) + filters in adapter verbatim. ✓ clean. Drop `supabaseService`.

**POST — current:** 401; 403 if not office/admin; 400 invalid JSON; 400 missing fields; 400 amount≤0; insert; 500 on error; return explicit shaped object (`:123-137`) status 201.

**POST — target:** 401/403/invalid-JSON gates unchanged. `const v = cashService.validateCheque(input)` → `if (!v.ok) return {error:v.message} status v.status` (reproduces the two 400s in order). Build `CreateChequeInput` (camelCase; `loggedBy: userId`). `const c = await cashService.createCheque(input)` → return `toChequeWireDto(c)` status 201. **Byte-proof:** §6.4; insert trim/null shaping in adapter verbatim; fresh `banked:false`, `banked_at:null`, `banked_by_name:null` all reproduced by domain on a create echo. ✓ clean. Drop `supabaseService`.

### 7.6 `app/api/cash/cheques/[id]/route.ts` (PATCH bank/edit, DELETE)

**PATCH bank — current:** 401; 403 if not office/admin; `update({banked,banked_by,banked_at}).eq(id).eq('banked',false).select().single()`; 500 on error; **404 `'Already banked or not found'` if `!data`**; return `{ ok:true, banked_at: d.banked_at }`.

**PATCH bank — target:** gates unchanged. `const res = await cashService.bankCheque(id, userId)`. **NULL→ (carry-forward #2):** `if (res === null) return 404 { error: 'Already banked or not found' }` — `bankCheque` returns null on already-banked-or-missing (adapter `.maybeSingle()` + `.eq('banked',false)`), identical to today's `!data`→404. Return `{ ok:true, banked_at: res.bankedAt }`. **Byte-proof:** `banked_at` = adapter's `banked_at` echo (the same ISO string it wrote). ✓ clean.

**PATCH edit — current:** 403 if not admin; build `updates` (`!= null` guards); `update().eq(id).select().single()`; 500 on error; return `{ ok:true, record: <raw bare row> }`. **→ R-WIRE-5 (§6.5): the bare-row record can't be reproduced losslessly from the domain `ChequeRecord`.**

**PATCH edit — target:** 403 unchanged. Build `UpdateChequeInput` (camelCase). `const c = await cashService.updateCheque(id, patch)`. Return `{ ok:true, record: toChequeEditWireDto(c) }` (§6.5). **STOP-check + D-EDIT decision (§11).** NULL→ on missing id: `updateCheque` `.maybeSingle()` → null vs today `.single()`→error→500; same D2-family divergence — flag.

**PATCH else — current/target:** `action` not bank/edit → 400 `'action must be bank or edit'`. Unchanged (pure route logic, no DB). ✓

**DELETE — current/target:** 401; 403 non-admin; `await cashService.deleteCheque(id)` (idempotent, void); return `{ ok:true }`. Wrap for 500 posture. ✓ clean. Drop `supabaseService`.

### 7.7 `app/api/cash/export/route.ts` (GET cash/cheques CSV)

**Current:** 401; 403 non-admin; `type` param; **cash**: 400 if no year/month; `readCashBookData` month via `.single()` → 404 `'Month not found'` if null; build 8-col CSV; return `new NextResponse(csv, {headers})`. **cheques**: 400 if no from/to; read register; build 9-col CSV; return CSV. **else**: 400 `'type must be cash or cheques'`. The CSV builder functions are **already copied verbatim into `CashService`** (`buildCashBookCsv`, `buildChequeRegisterCsv`).

**Target:** 401/403/400 gates + `type` branching unchanged in route.
- **cash:** `const data = await cashService.readCashBookData(year, month)`. **NULL→ (carry-forward #2):** `if (data === null) return 404 { error: 'Month not found' }` (`readCashBookData` returns null on missing month — adapter `.maybeSingle()`, identical to today's `.single()`→null). Then `const { filename, csv } = cashService.buildCashBookCsv({ year, month, monthRecord: data.month, entries: data.entries, generatedAt: now })` → `return new NextResponse(csv, { headers: { 'Content-Type':'text/csv; charset=utf-8', 'Content-Disposition': \`attachment; filename="${filename}"\` } })`.
  - **⚠ CONDUCTOR RULING (rename):** the spec says rename the caller-less `buildCashBookCsv` `month_` arg → `monthRecord`. **THIS TOUCHES THE FROZEN SERVICE** — it edits `CashService.ts` (interface line 155 + impl line 344) AND any PR1 unit test referencing `month_`. The spec explicitly authorises this rename ("free, no behaviour impact"). The implementer renames the **field name only** (`month_` → `monthRecord`) in the interface, the impl destructure, and the PR1 `CashService.test.ts` call sites. No logic changes. **This is the ONE sanctioned edit to the foundation in PR2.**
- **cheques:** `const cheques = await cashService.readChequeRegisterData(from, to)` → `cashService.buildChequeRegisterCsv({ from, to, cheques, generatedAt: now })` → same NextResponse CSV.
- **Byte-proof:** CSV builders are character-verbatim copies (PR1 review §3 confirmed CRLF joins, `£${Math.abs(n).toFixed(2)}`, dd/mm/yy, `--------` seps, LOCKED/Open footer). `generatedAt: now` = `new Date()` (route's `now`), and the builder calls `fmtDateTime(generatedAt.toISOString())` — identical to today's `fmtDateTime(now.toISOString())`. Headers reproduced verbatim. ✓ clean (apart from the sanctioned rename).
- Drop `supabaseService` + all the local CSV helper functions (`cell`/`row`/`sep`/`gbp`/`fmtDate`/`fmtDateTime`) — now inside the service.

### 7.8 `app/api/cash/upload/route.ts` (POST)

**Current:** 401; parse formData; 400 no file; 400 disallowed mime; 400 >10MB; build `${userId}/${Date.now()}.${ext}` path; `storage.upload(path, buffer, {contentType, upsert:false})`; 500 on error; return `{ path, name: file.name }` status 201.

**Target:** 401 + formData parse + 400 no-file gates **stay in route** (the service has no "no file" notion — file extraction is presentation). Then `const v = cashService.validateAndBuildUploadPath({ userId, fileName: file.name, contentType: file.type, sizeBytes: file.size, now: new Date() })`. **`validateAndBuildUploadPath` reproduces the mime 400 + 10MB 400 + path build** (`${userId}/${now.getTime()}.${ext}`, `now: new Date()` ⇔ today's `Date.now()`). `if (!v.ok) return {error:v.message} status v.status`. Then `const bytes = new Uint8Array(await file.arrayBuffer())` → `await cashService.uploadAttachment(v.path, bytes, file.type)` (adapter upload, `upsert:false` baked in). Return `{ path: v.path, name: v.name }` status 201.
- **⚠ R-WIRE-8 (note):** today's path uses `Date.now()` at the call site; the service uses `now.getTime()` with `now: new Date()` — same value. The route builds `Buffer.from(...)`; the port takes `Uint8Array`. `Buffer` IS a `Uint8Array` subclass, but pass `new Uint8Array(await file.arrayBuffer())` to match the port type cleanly (the adapter passes bytes straight to `storage.upload`, which accepts both). Byte content identical.
- **Byte-proof:** mime list + 10MB gate verbatim in service; path format identical; upload error → ServiceError → wrap to 500 (§7.10). The success body `{ path, name }` key order matches. ✓ clean. Drop `supabaseService`, `ALLOWED`, `MAX_MB` locals.

### 7.9 `app/api/detail/discrepancy/route.ts` (GET) — **STOP / R-WIRE-9**

**Current:** raw `fetch` to `${SUPA_URL}/rest/v1/discrepancies?...` with service-role key in headers. Reads the **`discrepancies`** table (NOT a cash table). Maps to a camelCase response `{ id, createdAt, status, reason(_→space), orderedQty, sentQty, unit, note, customer, product, category, loggedBy }`. 401/400/404/500 branches.

**This route has NOTHING to do with the Cash domain.** `cashService` exposes no `discrepancies` method and the `CashRepository` port covers only `cash_months`/`cash_entries`/`cheque_records`. **Absorbing it onto `cashService` is impossible without adding a non-cash method to the Cash port — an ADR-0002 cohesion violation, and the foundation is frozen.** This is a **STOP-and-report** item (§11, D-DISCREPANCY). **The implementer must NOT improvise.** The spec line "absorb its raw Supabase fetch onto the service" cannot be honoured against `cashService`; the conductor must choose the target (§11).

**🗣 In plain English:** Eight of the nine routes are genuine cash endpoints that map cleanly onto the Cash box (with the mapping cautions above). The ninth — the discrepancy lookup — is a different feature reading a different table. It can't go onto the Cash box without polluting it, and the box is frozen. So it needs a separate decision from you about where it should go.

### 7.10 Error / 500 posture (uniform — mirrors F-15 PR2 §7.5)

Today each route inspects `{ data, error }` and returns a specific 500 (`error.message` or a literal) + `console.error`. The adapter **throws `ServiceError`** on DB failure (and `ConflictError` on duplicate month). **Wrap each service call in try/catch** (the outer `try { } catch (err) { console.error(...); return 500 }` blocks already exist in every route — reuse them) so a thrown error reproduces today's outer-catch 500 (`{ error: 'Server error' }`) and `console.error` line. **Note a benign divergence:** today some inner 500s returned `error.message` (vendor text); the wrapped path returns the outer-catch `'Server error'`. For the routes whose inner branch returned `error.message`, this is a 500→500 message change (vendor error text → `'Server error'`). **R-WIRE-7 — accepted micro-divergence on the DB-error 500 message body** (status stays 500; only the error *string* on an infra-failure path changes; never observable in normal operation). Flag in the PR description; mirror F-15 PR2's accepted handling. Do NOT try to reconstruct vendor `error.message` strings.

---

## 8. Exact files to change

| # | File | Change |
|---|------|--------|
| 1 | `lib/api/cash/dto.ts` | **NEW.** Pure domain→snake_case translators: `toMonthWireDto`, `toMonthLockWireDto`, `toSummaryWireDto`, `toEntryListWireDto`, `toEntryCreateWireDto`, `toEntryEditWireDto`, `toChequeWireDto`, `toChequeEditWireDto`. Key-for-key + key-ORDER. |
| 2 | `lib/api/cash/dto.test.ts` | **NEW.** Key-for-key + key-order unit tests for every DTO (incl. a list-with-data case — the F-15 PR2 T1/T2 lesson: never assert only on empty/defensive shapes). |
| 3 | `app/api/cash/month/route.ts` | Re-point GET+POST through `cashService`; carry-forward #1 (first-month 400 via `probeMonth`), #2 (409 via ConflictError), DTO mapping. Drop `supabaseService`/local helpers. |
| 4 | `app/api/cash/month/[id]/route.ts` | Re-point PATCH lock; `toMonthLockWireDto`; D2 null-branch decision. Drop `supabaseService`. |
| 5 | `app/api/cash/entry/route.ts` | Re-point POST; `validateEntry({now:new Date()})` + `createEntry`; `toEntryCreateWireDto`. Drop `supabaseService`. |
| 6 | `app/api/cash/entry/[id]/route.ts` | Re-point PATCH (`updateEntry` + `toEntryEditWireDto`, R-WIRE-4b) + DELETE (`deleteEntry`). Drop `supabaseService`. |
| 7 | `app/api/cash/cheques/route.ts` | Re-point GET (`listCheques`+`toChequeWireDto` array) + POST (`validateCheque`+`createCheque`). Drop `supabaseService`. |
| 8 | `app/api/cash/cheques/[id]/route.ts` | Re-point PATCH bank (`bankCheque`, 404 null) + edit (`updateCheque`+`toChequeEditWireDto`, R-WIRE-5) + DELETE. Drop `supabaseService`. |
| 9 | `app/api/cash/export/route.ts` | Re-point GET; `readCashBookData`/`readChequeRegisterData` + `buildCashBookCsv`/`buildChequeRegisterCsv`; 404 null. Drop `supabaseService`+CSV helpers. |
| 10 | `app/api/cash/upload/route.ts` | Re-point POST; `validateAndBuildUploadPath`+`uploadAttachment`. Drop `supabaseService`/locals. |
| 11 | `lib/services/CashService.ts` | **SANCTIONED rename only** (§7.7): `month_` → `monthRecord` in interface + impl destructure. No logic change. |
| 12 | `tests/unit/services/CashService.test.ts` (or wherever PR1's lives) | Update the `month_` → `monthRecord` call sites for the rename. No new assertions. |
| 13 | `app/api/detail/discrepancy/route.ts` | **BLOCKED on D-DISCREPANCY (§11).** Do NOT edit until the conductor rules on the target. |
| 14 | `tests/integration/api/cash/*.test.ts` | **NEW.** All re-pointed routes against local Supabase — assert byte-identical JSON/CSV + status codes + the carry-forward branches. |

**🗣 In plain English:** One new translator file + its tests, the 8 cash routes re-plumbed, one tiny sanctioned rename inside the Cash box (with its test updated), and a database-backed integration suite. The discrepancy route is left untouched pending your decision.

---

## 9. Ordered atomic commits (TDD red-green)

1. `feat(cash): domain→wire DTO translators (lib/api/cash/dto.ts)` — RED `dto.test.ts` (key-for-key + key-order, incl. populated list rows), GREEN the pure translators. No route touched.
2. `refactor(cash): rename buildCashBookCsv month_ → monthRecord` — rename in `CashService.ts` + PR1 test call sites (green stays green). Isolated, no behaviour.
3. `feat(cash): re-point export route (cash/cheques CSV) through cashService` — uses the rename + CSV builders.
4. `feat(cash): re-point cheques routes (GET/POST + bank/edit/delete) through cashService` — R-WIRE-5 edit DTO.
5. `feat(cash): re-point entry routes (POST + PATCH/DELETE) through cashService` — R-WIRE-2/4b.
6. `feat(cash): re-point month routes (GET/POST + lock) through cashService` — carry-forwards #1/#2, D2.
7. `feat(cash): re-point upload route through cashService`.
8. `test(cash): integration suite for re-pointed routes (byte-identical JSON/CSV)`.

> Each commit leaves `tsc`/`lint`/`vitest` green. The discrepancy route is NOT in this sequence (blocked). Split per-file further if a diff is large.

**🗣 In plain English:** Build the translator first with its tests, do the tiny rename on its own, then re-plumb each route group, then the database-backed tests. Each step keeps the project compiling and green. The discrepancy route is parked.

---

## 10. Test posture

| Layer | What | New/changed |
|---|---|---|
| **Unit — dto** | every translator key-for-key + **key order**; populated entry/cheque/month rows (NOT just empty/defensive shapes — F-15 PR2 T1/T2 lesson) | NEW `lib/api/cash/dto.test.ts` |
| **Unit — service** | PR1 `CashService.test.ts` stays green after the `month_`→`monthRecord` rename | CHANGED (rename call sites only) |
| **Integration (real, local Docker Supabase)** | all re-pointed routes against `npm run test:integration` (boots dev server on :3100 wired to local Supabase): month GET (exists + miss/probe + first-month), month POST (201 + first-month 400 + 409 dup), entry POST (201 + every validation 400/403/404 in order), entry PATCH/DELETE, cheques GET (array)/POST (201)/bank (404 already-banked)/edit/delete, export cash (CSV bytes + 404 miss) + cheques (CSV bytes), upload (201 + mime 400 + 10MB 400). **Assert exact JSON values/types (R-WIRE-1) + exact CSV strings + key presence for R-WIRE-2/4b/5.** | NEW `tests/integration/api/cash/*.test.ts` |
| **pgTAP / DB** | **none** — no migration, no policy change | none |
| **E2E `@critical`** | cash is **not** in the `@critical` suite (orders/KDS/routes/map only — confirmed against F-15 PR2's same finding). The Gate-4 preview smoke runs the 3 `@critical` specs; cash rides along only as a non-500 sanity check. **Verify by grep** that no `@critical` cash spec exists; if confirmed, no E2E change. | verify-only |

> **Prereq:** `npm run db:up` once + `npm run db:reset` for a fresh seed before `npm run test:integration`.

**🗣 In plain English:** Tests in three places: the translator (pure, fast, key-order-strict), the existing service test (just fix the renamed field), and a real database-backed suite that hits every endpoint and proves the JSON and CSV bytes are unchanged — including the dangerous shapes. The cash screens aren't part of the browser critical path, so no end-to-end browser test is needed (verify that first).

---

## 11. STOP-and-report items + conductor decisions (do NOT improvise)

- **D-DISCREPANCY (R-WIRE-9) — BLOCKER for that one route.** `app/api/detail/discrepancy/route.ts` reads `discrepancies`, not a cash table; `cashService` has no method and the Cash port must not gain one (ADR-0002 cohesion + frozen foundation). **Options:** (a) **drop the discrepancy route from THIS PR** — re-point only the 8 genuine cash routes, defer discrepancy to its own domain extraction (a future F-* unit) — **RECOMMENDED** (keeps PR2 cohesive + the Cash port clean); (b) extract a tiny `Discrepancies` port + adapter + service in THIS PR (scope creep — a new domain, not a re-point); (c) absorb it onto an EXISTING non-cash service if one fits (none does today). **Recommend (a).** The spec's "absorb onto the service" cannot mean `cashService` — confirm the target.

- **D-EDIT (R-WIRE-5 + R-WIRE-4b) — cheque-edit & entry-edit bare-row responses.** The domain objects are **lossy** vs the bare-row responses these PATCH endpoints emit today (missing `driver_id`/`logged_by`/`banked_by` for cheque-edit; missing `created_by`/`edited_by` for entry-edit). **Before writing those two DTOs, grep the UI for what the edit responses are consumed as.** If the UI re-fetches (ignores the PATCH body) → **D-EDIT-A**: map the available domain fields to the bare-row key names, document the dropped FK ids, ship (RECOMMENDED, invisible). If the UI reads the dropped FK ids → **STOP**: the frozen port can't reproduce them; conductor must decide (widen port in a follow-up, or accept the change).

- **D2 — missing-id PATCH null vs today's 500.** `setMonthLocked`/`updateEntry`/`updateCheque` return `null` on a missing id (`.maybeSingle()`), where today's `.single()` set an error → 500. The re-point would return `{ month: null }`/`{ entry: null }`/`{ ok:true, record: null }` at 200 instead of 500. These paths are **unreachable in normal UI flow** (you only edit/lock records you just listed). **Recommend: accept the more-correct null-at-200 OR add an explicit `if (x===null) return 404`** — confirm which, do not improvise. (F-15 PR2 had the same shape on its 500 branches.)

- **R-WIRE-1 — numeric/string + DB column order on `month` raw rows.** Verify in the integration test the exact JSON value+type of `opening_balance`/`amount` and the **column order** of the `month` object (`select('*')` returns DB column order). The DTO key order for `toMonthWireDto` must match the `cash_months` CREATE TABLE column order — read the baseline migration. Not a decision, a verification the implementer must do.

- **R-WIRE-2 — entry raw-join objects.** Grep the UI for `created_by_user`/`edited_by_user`/`.customer.id` on entry objects before finalising `toEntryListWireDto`/`toEntryCreateWireDto`. If read → STOP (lossy frozen port). If not → flatten-only DTO, tested.

- **R-WIRE-7 — DB-error 500 message body.** Accepted micro-divergence: inner 500s that returned vendor `error.message` now return the outer-catch `'Server error'`. Status unchanged (500). Note in PR description; mirror F-15 PR2.

**🗣 In plain English:** Five things need your call or a UI grep before the implementer commits, and one route is outright blocked. None of them are guesswork-safe. The headline: the discrepancy route doesn't belong on the Cash box (I recommend dropping it from this PR), and two edit endpoints hand back raw database rows the clean Cash object can't fully rebuild (so the implementer must check whether the screens actually read those fields).

---

## 12. Hexagonal / depth check (Gate 2 facts)

- **Port used:** `CashRepository` (PR1) + `AttachmentStorage` (PR1). **No new port. No new port method.** Every cash route maps onto an existing `CashService` method. *(The discrepancy route is the lone exception — it has NO cash port method, which is exactly why it's blocked, not absorbed.)*
- **Adapter:** existing `lib/adapters/supabase/CashRepository.ts` + `AttachmentStorage.ts`. **No new adapter.**
- **New dependency:** **none.** `package.json` untouched. No new vendor, no wrapper needed.
- **Vendor leak check:** all 8 cash routes **drop** their `import { supabaseService } from '@/lib/adapters/supabase/client'`; the discrepancy route's raw `fetch` to `/rest/v1/...` would also be retired (pending D-DISCREPANCY). After PR2 the only Supabase imports on the cash surface live in `lib/adapters/supabase/*` (correct). Coupling **improves**.
- **Rip-out test:** "replace the DB/file-store vendor for Cash tomorrow" = one new `lib/adapters/<vendor>/{CashRepository,AttachmentStorage}.ts` + edits to `lib/wiring/cash.ts`. Routes + DTO depend on the service/domain only. **PASS** (and strictly improves vs today, where 8 routes import the vendor client directly).
- **DTO depth:** `lib/api/cash/dto.ts` is a pure translation seam (like `lib/api/pricing/dto.ts` / `lib/api/orders/dto.ts`). Deletion test: delete it and the snake_case key-order reconstruction smears into 8 routes. It concentrates the wire-compat contract. **Justified, not a pass-through.**

**Hexagonal verdict line:**
> **Port:** uses existing `CashRepository` + `AttachmentStorage` (no new port, no new method) — EXCEPT the discrepancy route, which has no cash method and is therefore BLOCKED, not absorbed (D-DISCREPANCY). **Adapter:** existing Supabase adapters (no new adapter). **New deps:** none (package.json untouched; no wrapper needed). **Rip-out test: PASS** (vendor swap = one adapter set + one wiring file; 8 routes shed their direct `supabaseService` import → coupling improves). **DTO is not a pass-through (PASS):** concentrates the snake_case + key-order wire contract for 8 routes.

**🗣 In plain English:** No new sockets, no new plugs, no new libraries. After this PR a Cash database/file-store swap still costs one adapter set + one wiring file, and we actually reduce coupling because 8 routes stop touching the vendor directly. The one wrinkle: the discrepancy route has no Cash socket to plug into, which is why it's blocked rather than wired.

---

## 13. Risk Assessment

### Concurrency / race conditions
- **R-CONC-1 — month-create duplicate race.** Severity: low (improves). Today: non-atomic check-then-insert (TOCTOU window). The adapter relies on the real `cash_months_year_month_key` UNIQUE → `23505` → `ConflictError` → 409. **Same 409 wire result, closes the race.** Mitigation: wrap to map `ConflictError` → 409 `'Month already exists'`. **Must-fix: no** (improvement, behaviour-preserving).
- **R-CONC-2 — cheque bank double-bank.** Severity: none-new. `bankCheque` keeps the `.eq('banked', false)` idempotency guard from the route. No new race. **Must-fix: no.**
- No new locks/transactions introduced. **No material new concurrency risk.**

### Security
- **No auth/RLS change** — stays on the service-role singleton (per spec; F-RLS-04e does the cutover). 401/403 role gates reproduced byte-identically in the routes. No privilege change. **No material security risk introduced.**
- Service-role key handling: the discrepancy route currently inlines the Supabase service-role env-var key in a raw fetch header — if retired, that's a small security improvement (one fewer raw key use). Pending D-DISCREPANCY. **Must-fix: no.**

### Data migration
- **None.** No schema/data change. No `.sql`. No preview-branch resync risk. **No risk in this category.**

### Business-logic flaws (the dominant surface — wire byte-identity)
- **R-WIRE-1 — numeric/string + DB column order on raw `month` rows.** Severity: medium. `select('*')` returns DB column order + possibly numeric-as-string. The DTO must match column order; the integration test must assert exact value/type. **Must-fix: YES (verification)** — pinned by the integration test + DTO key-order test.
- **R-WIRE-2 — entry raw-join objects dropped by the domain.** Severity: **high**. Today's entry wire carries raw `created_by_user`/`edited_by_user`/`customer` join objects AND flattened names; the domain has only the flattened names. If the UI reads the raw objects → live regression (the F-15 PR2 B1 failure mode). **Must-fix: YES — grep the UI before finalising; if read, STOP (frozen port is lossy).** Mitigation: UI grep + a DTO that emits the verified-needed shape + integration assertion on key presence.
- **R-WIRE-4b / R-WIRE-5 — bare-row edit responses (entry-edit, cheque-edit) are lossy vs the domain.** Severity: **high**. The PATCH bare rows carry FK id columns (`created_by`/`edited_by` / `driver_id`/`logged_by`/`banked_by`) the domain objects drop. **Must-fix: YES — grep the UI; D-EDIT decision.** Mitigation: D-EDIT-A (map available fields, document dropped ids) if UI re-fetches; else STOP.
- **R-WIRE-3 / key-order across all DTOs.** Severity: high (primary). `NextResponse.json` preserves insertion order; a mis-ordered key changes the bytes. Mitigation: §6 field tables in route-literal order + `dto.test.ts` key-ORDER assertions + integration JSON equality. **Must-fix: YES (test coverage)** — the gate, met by the plan.
- **R-WIRE-6 — D2 missing-id null vs 500.** Severity: low (unreachable path). Re-point returns null-at-200 where today returns 500. **Must-fix: no (but requires the D2 conductor decision).**
- **R-WIRE-7 — DB-error 500 message body change.** Severity: low (infra-failure path; status unchanged). Accepted micro-divergence, note in PR. **Must-fix: no.**
- **R-WIRE-9 / D-DISCREPANCY — discrepancy route can't go on `cashService`.** Severity: blocker for that route only. **Must-fix: YES — conductor must rule (recommend dropping from PR2).** Does NOT block the 8 cash routes.

### Launch blockers
- **None new at the infra level.** No migration to apply, no preview-branch resync, no `@critical` E2E impact (cash not in that suite — verify). The byte-identity items (R-WIRE-1/2/3/4b/5) are review/ANVIL gates, not launch-infra blockers.

### Risk headline
**The plan's architecture is sound and the Gate 2 hexagonal verdict is PASS for the 8 cash routes** (no new port/method/adapter/dep; rip-out improves). **But there are MUST-FIX items the implementer cannot skip and TWO that need a conductor ruling before code:**
- **MUST-FIX (test/verification, met by the plan):** R-WIRE-1 (numeric/column-order), R-WIRE-3 (key-order DTO tests + integration JSON equality).
- **MUST-FIX requiring a UI grep + possible STOP:** R-WIRE-2 (entry raw-join), R-WIRE-4b/R-WIRE-5 (bare-row edit responses) — if the UI reads the dropped fields, the frozen port is lossy and the implementer must STOP (these are the F-15 PR2 B1 failure mode and are the single biggest risk in this PR).
- **BLOCKER needing a conductor decision (loops to Order if mis-handled):** D-DISCREPANCY (R-WIRE-9) — the discrepancy route does not belong on `cashService`; recommend dropping it from PR2.
- **Conductor decisions (not blockers, do not improvise):** D-EDIT (cheque/entry edit response shape), D2 (missing-id null vs 500).

**🗣 In plain English:** The plumbing strategy is correct and clean — a database swap stays cheap and 8 routes stop touching the vendor. What can bite: a few endpoints currently hand back the database's raw row, and the tidy Cash object has fewer fields, so before writing those translators the implementer must check the screens actually don't need the missing fields — if they do, stop, because the Cash box is frozen. And the discrepancy route simply isn't a cash endpoint; I recommend taking it out of this PR rather than forcing it onto the Cash box.

---

## 14. Acceptance criteria

1. All 8 cash routes import `cashService` from `@/lib/wiring/cash` and contain **zero** `@supabase/*` imports (lint-clean, no-adapter-imports rule green).
2. Every route's JSON/CSV/status/headers are byte-identical to pre-PR (proved by the integration suite asserting exact bodies, incl. the three carry-forwards: first-month 400, every 404/null branch, the edit/lock response shapes).
3. `dto.test.ts` passes key-for-key AND key-order for every translator, with at least one populated (non-empty) case per shape.
4. PR1's `CashService.test.ts` green after the `month_`→`monthRecord` rename (no behaviour change).
5. `tsc --noEmit`, `next lint`, full `vitest` green. No `package.json` change. No `.sql`.
6. The discrepancy route is either dropped from PR2 (recommended) or handled per the conductor's D-DISCREPANCY ruling — NOT forced onto `cashService`.
7. D-EDIT, D2 resolved by the conductor; the chosen behaviour is tested + noted in the PR description; R-WIRE-7 micro-divergence noted.

---

## 15. Gate 2 conductor rulings — LOCKED (implementer: read this FIRST, it overrides every "STOP/flag/decide" note above)

All STOP-and-report items and conductor decisions from §11 are now RESOLVED. Build to these — do NOT re-open them. The conductor did the UI grep against `app/cash/page.tsx` (the sole cash UI file) at Gate 2; the findings are recorded below so you don't have to re-derive them.

1. **D-DISCREPANCY → DROP FROM PR2.** Do NOT touch `app/api/detail/discrepancy/route.ts`. It is out of scope (logged as **ARCH-FU-08** in `docs/plans/BACKLOG.md` for its own future Discrepancies-domain extraction). PR2 re-points the **8 genuine cash routes only**. Remove the discrepancy route from file-list item #13 and from acceptance criterion #6 — it is simply not in this PR.

2. **R-WIRE-2 (entry raw-join objects) → SAFE, flatten-only DTO.** UI grep result: `app/cash/page.tsx` reads only the flattened `*_name` keys on entries; it never reads `entry.created_by_user`, `entry.edited_by_user`, or `entry.customer.id`/`.customer.name`. (The one `c.customer?.name` read at line 782 is on a **cheque** `ChequeRecord`, whose `customer` NamedRef the domain maps losslessly — not an entry.) → `toEntryListWireDto`/`toEntryCreateWireDto` emit the **flattened shape** (drop the vestigial raw join objects). Pin with a populated-row DTO test + an integration key-presence assertion. NOT a STOP.

3. **R-WIRE-4b (entry-edit bare row) → SAFE, D-EDIT-A.** UI grep result: the entry-edit PATCH response is consumed at `app/cash/page.tsx:237` reading ONLY `data.entry?.edited_at` (which the domain `CashEntry.editedAt` carries). The dropped `created_by`/`edited_by` FK ids are never read. → `toEntryEditWireDto` maps the available domain fields to the bare-row key names; the dropped FK ids are an accepted, invisible divergence (document in the PR).

4. **R-WIRE-5 (cheque-edit bare row) → SAFE, D-EDIT-A.** UI grep result: `data.record` from the cheque-edit PATCH is **never read anywhere** in `app/cash/page.tsx` — the screen re-fetches the list after an edit. → `toChequeEditWireDto` maps available domain fields to the bare-row key names; dropped `driver_id`/`logged_by`/`banked_by` are accepted, invisible (document in the PR). NOT a STOP.

5. **Month-lock `setMonthLocked` response → consumed but LOSSLESS.** UI grep result: `app/cash/page.tsx:364` does `setMonthData(prev => ... month: d.month)`. The domain `CashMonth` is lossless against the full `cash_months` row, so `{ month: toMonthWireDto(m) }` (§6.6) is correct. Key-ORDER is not functionally read by the UI (it reads named fields), but still emit DB-column order per R-WIRE-1 for strict byte-identity + to pass the DTO key-order test.

6. **D2 (missing-id PATCH null vs today's 500) → RETURN EXPLICIT 404.** For `setMonthLocked` / `updateEntry` / `updateCheque` returning `null` on a missing id, the route returns **404** with a small `{ error: '<resource> not found' }` body (e.g. `'Month not found'`, `'Entry not found'`, `'Cheque not found'`). This deliberately replaces today's *accidental* 500 (PGRST116 on `.single()`) on an **unreachable-in-practice** path (you only edit/lock records you just listed). Document this in the PR as a known, intentional micro-change (500→404 on a not-found edit/lock). Add an integration test for each 404 branch.

7. **R-WIRE-7 (DB-failure 500 body text) → ACCEPTED.** Wrapping the service call so a thrown `ServiceError` surfaces the outer-catch `{ error: 'Server error' }` (instead of the old vendor `error.message`) is accepted; status stays 500. Mirror F-15 PR2. Document in the PR. Do NOT try to reconstruct vendor error strings.

8. **R-WIRE-1 (numeric type + DB column order) → VERIFY (not a decision).** Still mandatory: read the baseline migration's `cash_months` CREATE TABLE column order and order `toMonthWireDto` keys to match; assert the exact JSON value+type of `opening_balance`/`amount` in the integration suite.

9. **`month_` → `monthRecord` rename → CONFIRMED** (the one sanctioned edit to the frozen service; §7.7).

**🗣 In plain English:** Every "stop and check the screens" worry the planner raised — the conductor already checked the one cash screen and it came back clear: the screen never reads the fields the clean Cash object drops, so build the translators the simple way. The discrepancy route is out (parked in the backlog as ARCH-FU-08). The only deliberate observable change is on a can't-really-happen path: editing/locking a record that was just deleted now answers "404 not found" instead of a crash — which is more honest. Everything else is byte-for-byte identical.
