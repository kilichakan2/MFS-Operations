# F-16 PR1 — Cash domain foundation extraction (precision plan)

> Date: 2026-06-22 · Author: forge-planner (FORGE Phase 2 — Order)
> Status: planned, awaiting Gate 2.
> Spec lock: Gate 1 approved — pure hexagonal extraction of the Cash domain,
> **ZERO behaviour change, introduce-only**. Adds NEW files under `lib/` ONLY.
> NO route edited, NO migration, NO DB/RLS change.

---

## Visual mini-map

```
DOMAIN (core logic)
  ├─ CashRepository    (port) → [Supabase] (adapter)  + [Fake] (test adapter)
  └─ AttachmentStorage (port) → [Supabase] (adapter)  + [Fake] (test adapter)
  CashService (business rules) depends on BOTH ports, never on Supabase
  wired in lib/wiring/cash.ts (the one file allowed to touch lib/adapters/**)
🗣 Two new sockets — one for the cash database, one for the receipt-file store; the cash brain plugs into both, and only the wiring panel knows which vendor is behind each.
```

---

## Goal

Extract every piece of Cash business logic and persistence out of the eight
`app/api/cash/**` route files into the owned hexagonal layers (`lib/domain`,
`lib/ports`, `lib/services`, `lib/adapters/{supabase,fake}`, `lib/wiring`),
mirroring the F-13 Users and F-15 Pricing extractions exactly. This PR
**introduces** the new files and wires the production singletons but does **not**
consume them anywhere — the routes are untouched and keep working byte-for-byte.

🗣 We are building the new clean machine next to the old wiring, fully assembled
and ready, but we are not plugging the building into it yet. Nothing the user
sees or does changes. PR2 throws the switch.

### Why now (sets up two follow-ups, does NEITHER here)
- **F-16 PR2** re-points the eight Cash routes through `cashService` and absorbs
  the `app/api/detail/discrepancy/route.ts` raw `fetch()` to PostgREST.
  🗣 PR2 is the "throw the switch" step — that is where behaviour could move,
  so it gets its own review.
- **F-RLS-04e** flips Cash onto Row-Level-Security with a per-caller client.
  🗣 The security cutover for cash, later, on its own.

---

## Domain terms (plain English)

- **Cash month** (`cash_months`) — one calendar month's cash book: a year, a
  month, an opening balance, and a lock flag. 🗣 One page of the paper cash
  ledger, with a "do not edit" stamp option.
- **Cash entry** (`cash_entries`) — one income or expense line inside a month,
  optionally with a receipt attachment. 🗣 A single in/out line on that page.
- **Cheque record** (`cheque_records`) — a customer cheque a driver brought in;
  later marked "banked". 🗣 A cheque sitting in the drawer; "banked" = taken to
  the bank.
- **Closing balance** — opening + income − expense for a month. 🗣 What's left at
  the bottom of the page.
- **Suggested opening** — the previous month's closing, proposed as the next
  month's opening. 🗣 Last page's bottom line copied to the top of the new page.
- **Port** — an interface the app owns (`lib/ports/`). 🗣 A socket shape our code
  insists on; the vendor must fit it.
- **Adapter** — the concrete vendor plug for a port (`lib/adapters/<vendor>/`).
  🗣 The actual Supabase plug for the socket; the Fake plug is for tests.
- **Service factory** — a function that builds the business object from ports,
  never a ready-made singleton in the service file. 🗣 A kit, not a built
  appliance; wiring assembles the appliance.
- **`AttachmentStorage`** — the file-store port for the `cash-attachments`
  bucket (upload / signed-url / remove). 🗣 The "filing cabinet" socket for
  receipt images, separate from the database socket.

---

## Compliance / safety flags

- **Introduce-only invariant.** The PR must add files only. Any diff line inside
  `app/**`, `supabase/migrations/**`, or any existing file (other than the four
  barrel files listed below) is a spec violation. 🗣 If we touched a route or the
  database, we broke the promise — that is a hard stop.
- **No new runtime dependency.** Everything needed (`@supabase/supabase-js`,
  `@/lib/errors`, `@/lib/observability/log`) already exists. Expect **zero**
  `package.json` changes. 🗣 No new vendor enters the building.
- **Service-role posture preserved.** Today every Cash route uses
  `supabaseService` (the service-role master key, RLS bypassed). PR1's wiring
  singleton uses the SAME key, so behaviour is identical. The per-caller
  authenticated factory is **F-RLS-04e**, NOT this PR. 🗣 Same master key as
  today; the locked-down per-user key comes later.

---

## ADR conflicts

None. This PR is a textbook application of **ADR-0002** (hexagonal shape and
naming) and **ADR-0003** (Supabase SDK freeze rule). It adds two new ports, two
Supabase adapters, two Fake adapters, one service, one wiring root — exactly the
shape ADR-0002 prescribes. No ADR is contradicted; no new ADR is required.
🗣 Nothing here fights an earlier decision; it follows the house rules to the
letter.

---

## Exact files to change

### New files (the whole PR)

| File | Purpose |
|---|---|
| `lib/domain/cash.ts` | App-owned camelCase Cash domain types (no framework/vendor imports). |
| `lib/ports/CashRepository.ts` | DB-operations port across `cash_months`, `cash_entries`, `cheque_records`. |
| `lib/ports/AttachmentStorage.ts` | File-store port for the `cash-attachments` bucket. |
| `lib/services/cash.ts` | `CashService` — factory only; holds the Cash business rules + pure CSV builders. |
| `lib/adapters/supabase/CashRepository.ts` | Supabase `CashRepository` impl (only place `@supabase/*` is imported for Cash DB). |
| `lib/adapters/supabase/AttachmentStorage.ts` | Supabase `AttachmentStorage` impl (Storage SDK). |
| `lib/adapters/fake/CashRepository.ts` | In-memory `CashRepository` for unit tests (Map storage of domain types). |
| `lib/adapters/fake/AttachmentStorage.ts` | In-memory `AttachmentStorage` for unit tests. |
| `lib/wiring/cash.ts` | Composition root; wires Supabase adapters to `createCashService`, exports the service-role singleton. |
| `tests/unit/services/CashService.test.ts` | Unit tests for all Cash business rules + CSV builders against fakes. |
| `tests/unit/wiring/cashService.test.ts` | Pins the wiring singleton exists and is built per-construction (factory not memoized incorrectly). |

🗣 Eleven brand-new files. Nothing old is rewritten.

### Existing files edited (barrels only — additive re-exports)

| File | Edit |
|---|---|
| `lib/domain/index.ts` | Add `export type { ... } from "./cash";`. |
| `lib/ports/index.ts` | Add `export type { CashRepository, ... } from "./CashRepository";` and `AttachmentStorage` exports. |
| `lib/services/index.ts` | Add `export { createCashService, type CashService, type CashServiceDeps } from "./cash";`. |
| `lib/adapters/fake/index.ts` and `lib/adapters/supabase/index.ts` | Add the new Cash adapter factory + singleton re-exports. |

🗣 The five "index" files are just contact sheets that list what each folder
offers; we only add new line items, we change nothing already listed. (This
matches exactly how F-13/F-15 grew the barrels.)

### Explicitly NOT touched (would break the spec)

- Any `app/api/cash/**` route file — PR2.
- `app/api/detail/discrepancy/route.ts` — PR2 absorb (note below).
- Any file in `supabase/migrations/**` — no schema/RLS change.
- `tests/unit/lint/no-adapter-imports.test.ts` — must keep passing UNCHANGED;
  the new files must obey the existing fence. 🗣 The boundary-cop test is left
  alone; our new code must already satisfy it.

---

## The contracts (full TypeScript signatures)

> Source of truth: the eight route files read in this plan. Every method maps
> 1:1 to a route operation; nothing speculative. Field names are camelCase in the
> domain, snake_case only inside the adapters.

### `lib/domain/cash.ts`

```ts
export type CashEntryType = "income" | "expense";
export type ChequeStatusFilter = "all" | "not_banked" | "banked";

/** A small id+name pair for the user/customer join enrichments. */
export interface NamedRef {
  readonly id: string;
  readonly name: string;
}

/** A cash_months row, camelCase. */
export interface CashMonth {
  readonly id: string;
  readonly year: number;
  readonly month: number;          // 1..12
  readonly openingBalance: number;
  readonly isLocked: boolean;
  readonly createdBy: string | null;
  readonly createdAt: string;      // ISO-8601
}

/** A cash_entries row with the joins resolved (createdByName/editedByName/customerName)
 *  and a freshly-minted signed URL. signedUrl is null on create (matches today). */
export interface CashEntry {
  readonly id: string;
  readonly monthId: string;
  readonly entryDate: string;      // YYYY-MM-DD
  readonly type: CashEntryType;
  readonly category: string | null;
  readonly amount: number;
  readonly description: string;
  readonly reference: string | null;
  readonly attachmentPath: string | null;
  readonly attachmentName: string | null;
  readonly createdAt: string;      // ISO-8601
  readonly editedAt: string | null;
  readonly customerId: string | null;
  // join enrichments (route mapping verbatim):
  readonly createdByName: string;  // users.name ?? 'Unknown'
  readonly editedByName: string | null;  // users.name ?? null
  readonly customerName: string | null;  // customers.name ?? null
  readonly signedUrl: string | null;     // attachment signed URL (3600s) or null
}

/** A cheque_records row with joins resolved (route mapping verbatim). */
export interface ChequeRecord {
  readonly id: string;
  readonly date: string;           // YYYY-MM-DD
  readonly amount: number;
  readonly chequeNumber: string | null;
  readonly notes: string | null;
  readonly createdAt: string;      // ISO-8601
  readonly banked: boolean;
  readonly bankedAt: string | null;
  readonly customerId: string | null;     // present on writes; reads echo customer join
  readonly customer: NamedRef | null;      // customers(id,name) join
  readonly customerName: string | null;    // free-text customer_name fallback column
  readonly driver: NamedRef | null;        // users join (driver_id)
  readonly loggedByName: string;           // users.name ?? 'Unknown'
  readonly bankedByName: string | null;    // users.name ?? null
}

/** opening/income/expense/closing for a month (the GET/POST `summary` block). */
export interface CashMonthSummary {
  readonly opening: number;
  readonly totalIncome: number;
  readonly totalExpense: number;
  readonly closing: number;
}

// ── Inputs (what each route body becomes; header/role parsing stays in routes) ──

export interface CreateMonthInput {
  readonly year: number;
  readonly month: number;
  readonly createdBy: string;          // x-mfs-user-id
  /** Required ONLY for the first-ever month; ignored otherwise (auto-computed). */
  readonly openingBalance: number | null;
}

export interface CreateEntryInput {
  readonly monthId: string;
  readonly entryDate: string;
  readonly type: CashEntryType;
  readonly category: string | null;
  readonly amount: number;
  readonly description: string;
  readonly reference: string | null;
  readonly attachmentPath: string | null;
  readonly attachmentName: string | null;
  readonly customerId: string | null;
  readonly createdBy: string;          // x-mfs-user-id
}

export interface UpdateEntryInput {
  readonly amount?: number;
  readonly description?: string;
  readonly category?: string | null;
  readonly reference?: string | null;
  readonly attachmentPath?: string | null;
  readonly attachmentName?: string | null;
  readonly editedBy: string;           // x-mfs-user-id (always set with edited_at)
}

export interface CreateChequeInput {
  readonly date: string;
  readonly customerId: string | null;
  readonly customerName: string | null;
  readonly amount: number;
  readonly driverId: string;
  readonly chequeNumber: string | null;
  readonly notes: string | null;
  readonly loggedBy: string;           // x-mfs-user-id
}

export interface UpdateChequeInput {
  readonly date?: string;
  readonly customerId?: string | null;
  readonly amount?: number;
  readonly driverId?: string;
  readonly chequeNumber?: string | null;
  readonly notes?: string | null;
}

export interface ChequeListFilter {
  readonly status: ChequeStatusFilter;
  readonly from: string | null;
  readonly to: string | null;
}

/** The "month doesn't exist yet" probe result (GET month miss branch). */
export interface MonthExistsProbe {
  readonly isFirst: boolean;
  readonly suggestedOpening: number | null;
}

/** What POST cheque returns (echo with banked=false, bankedByName=null). */
// (ChequeRecord already covers this shape.)
```

🗣 These types are the app's own clean words for cash data. The database's
`opening_balance` becomes `openingBalance`; the vendor's spelling never escapes
the adapter.

### `lib/ports/CashRepository.ts`

```ts
import type {
  CashMonth, CashEntry, ChequeRecord, CashMonthSummary,
  CreateMonthInput, CreateEntryInput, UpdateEntryInput,
  CreateChequeInput, UpdateChequeInput, ChequeListFilter, MonthExistsProbe,
} from "@/lib/domain";

export interface CashRepository {
  // ── cash_months ───────────────────────────────────────────────
  /** Find a month by (year, month). null on miss. → GET /api/cash/month. */
  findMonth(year: number, month: number): Promise<CashMonth | null>;

  /** Find a month by id (the entry POST permission read). null on miss. */
  findMonthById(id: string): Promise<CashMonth | null>;

  /** The "does this month exist yet?" probe: returns {isFirst, suggestedOpening}.
   *  suggestedOpening = closing of the most-recent month, or null if none.
   *  Hides: latest-month lookup + its entry sum. → GET month miss branch. */
  probeMonth(): Promise<MonthExistsProbe>;

  /** Create a month. Computes opening from the previous month's closing when one
   *  exists; otherwise uses input.openingBalance (caller has validated it is
   *  present for the first-ever month). Returns the created CashMonth + summary.
   *  Throws ConflictError if (year,month) already exists. → POST /api/cash/month. */
  createMonth(input: CreateMonthInput):
    Promise<{ month: CashMonth; summary: CashMonthSummary }>;

  /** Set is_locked on a month. null on missing id. → PATCH /api/cash/month/[id]. */
  setMonthLocked(id: string, isLocked: boolean): Promise<CashMonth | null>;

  // ── cash_entries ──────────────────────────────────────────────
  /** All entries for a month, joins resolved + signed URLs minted, ordered
   *  entry_date asc then created_at asc. → GET /api/cash/month entries block. */
  listEntriesForMonth(monthId: string): Promise<readonly CashEntry[]>;

  /** Lightweight income/expense sums used to compute a month summary without
   *  re-listing full entries (used by createMonth / probe internally OR exposed
   *  for the summary computation). Returns {totalIncome, totalExpense}. */
  sumEntriesForMonth(monthId: string):
    Promise<{ totalIncome: number; totalExpense: number }>;

  /** Insert an entry; returns the created CashEntry (joins resolved, signedUrl
   *  null — matches today). → POST /api/cash/entry. Caller validates first. */
  createEntry(input: CreateEntryInput): Promise<CashEntry>;

  /** Patch the supplied entry fields + edited_by/edited_at. null on missing id.
   *  → PATCH /api/cash/entry/[id]. */
  updateEntry(id: string, patch: UpdateEntryInput): Promise<CashEntry | null>;

  /** Read just the attachment_path of an entry (for delete cleanup). null on miss. */
  findEntryAttachmentPath(id: string): Promise<string | null>;

  /** Permanently delete an entry. Idempotent. → DELETE /api/cash/entry/[id]. */
  deleteEntry(id: string): Promise<void>;

  // ── cheque_records ────────────────────────────────────────────
  /** List cheques with status + from/to filters, joins resolved, ordered
   *  date desc then created_at desc. → GET /api/cash/cheques. */
  listCheques(filter: ChequeListFilter): Promise<readonly ChequeRecord[]>;

  /** Insert a cheque (banked=false); returns the created ChequeRecord (joins
   *  resolved, bankedByName null). → POST /api/cash/cheques. */
  createCheque(input: CreateChequeInput): Promise<ChequeRecord>;

  /** Idempotently mark a cheque banked (only if currently not banked); returns
   *  the new banked_at, or null if already banked / not found.
   *  → PATCH /api/cash/cheques/[id] action=bank. */
  bankCheque(id: string, bankedBy: string): Promise<{ bankedAt: string } | null>;

  /** Patch the supplied cheque fields (admin edit). Returns the updated row.
   *  → PATCH /api/cash/cheques/[id] action=edit. */
  updateCheque(id: string, patch: UpdateChequeInput): Promise<ChequeRecord | null>;

  /** Permanently delete a cheque. Idempotent. → DELETE /api/cash/cheques/[id]. */
  deleteCheque(id: string): Promise<void>;

  // ── export reads (used by the CSV builders) ───────────────────
  /** The month + its entries for the cash-book CSV (Date|Desc|Customer|Category|
   *  Ref|Debit|Credit|Balance). null on missing month. → GET export type=cash. */
  readCashBookData(year: number, month: number):
    Promise<{ month: CashMonth; entries: readonly CashEntry[] } | null>;

  /** The cheques in [from,to] for the register CSV. → GET export type=cheques. */
  readChequeRegisterData(from: string, to: string):
    Promise<readonly ChequeRecord[]>;
}
```

> **Note on `readCashBookData` / `listEntriesForMonth`:** today's GET-month
> select includes `month_id` and `edited_at`; the export select omits them. Both
> map to the same `CashEntry` domain shape — the adapter populates whatever the
> verbatim select returns and leaves the rest at its documented default. The
> select **strings are copied verbatim** from the respective routes so PR2's wire
> output is byte-identical. 🗣 Each read copies the exact column list the matching
> route uses today, so the screen looks the same after PR2.

### `lib/ports/AttachmentStorage.ts`

```ts
export interface AttachmentStorage {
  /** Upload bytes to the bucket at `path`; throws ServiceError on vendor error.
   *  upsert:false (matches today). → POST /api/cash/upload. */
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<void>;

  /** A time-limited signed URL for a stored object, or null on failure/empty
   *  path. → GET /api/cash/month attachment URLs. */
  createSignedUrl(path: string, ttlSeconds: number): Promise<string | null>;

  /** Remove the given object paths (best-effort, matches today's pre-delete). */
  remove(paths: readonly string[]): Promise<void>;
}
```

🗣 The filing-cabinet socket: put a file in, get a temporary view link, take a
file out. The cash brain asks for these by name; only the Supabase plug knows
it's Supabase Storage.

### `lib/services/cash.ts` — `CashService` (factory only)

```ts
export interface CashServiceDeps {
  readonly cash: CashRepository;
  readonly attachments: AttachmentStorage;
}

export interface CashService {
  // ── pure business calculators (the rules lifted out of the routes) ──

  /** opening + Σ(income) − Σ(expense). Number() coercion preserved. */
  closingBalance(opening: number, entries: readonly { type: string; amount: number }[]): number;

  /** Build the summary block {opening,totalIncome,totalExpense,closing}. */
  monthSummary(opening: number, entries: readonly { type: string; amount: number }[]): CashMonthSummary;

  /** Validate a create-entry request against a month. Returns ok | a typed
   *  rejection {status, message} mirroring the route's exact codes:
   *   - missing required fields → 400 'month_id, entry_date, type, amount, description required'
   *   - type ∉ {income,expense} → 400 'type must be income or expense'
   *   - amount <= 0 → 400 'amount must be positive'
   *   - month not found → 404 'Month not found'
   *   - month.is_locked → 403 'This month is locked'
   *   - non-admin AND month != current calendar month(now) → 403 'Office users…'
   *   - entry_date not within month → 400 'entry_date must be within the month'
   *  Takes `now: Date` so the calendar-month check is testable and byte-identical
   *  to today's `new Date()` (LOCAL time, NOT london — preserved deliberately). */
  validateEntry(args: {
    input: CreateEntryInput;
    month: CashMonth | null;
    role: string | null;
    now: Date;
  }): { ok: true } | { ok: false; status: number; message: string };

  /** Validate a create-cheque request. Returns ok | rejection mirroring the route:
   *   - missing date/customer(id or name)/amount/driver_id → 400
   *   - amount <= 0 → 400 'amount must be positive'. */
  validateCheque(input: CreateChequeInput):
    { ok: true } | { ok: false; status: number; message: string };

  // ── upload policy (pure) ──
  /** ALLOWED mime list + MAX 10MB gate; builds the `${userId}/${ts}.${ext}` path.
   *  Returns the path+name to upload, or a typed rejection. */
  validateAndBuildUploadPath(args: {
    userId: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    now: Date;
  }): { ok: true; path: string; name: string }
    | { ok: false; status: number; message: string };

  // ── CSV builders (PURE — the heart of making PR2's export route thin) ──
  /** Build the cash-book CSV string (8 cols, CRLF) byte-identical to today.
   *  Caller supplies month + entries + generatedAt (Date). */
  buildCashBookCsv(args: {
    year: number; month: number;
    month: CashMonth;
    entries: readonly CashEntry[];
    generatedAt: Date;
  }): { filename: string; csv: string };

  /** Build the cheque-register CSV string (9 cols, CRLF) byte-identical to today. */
  buildChequeRegisterCsv(args: {
    from: string; to: string;
    cheques: readonly ChequeRecord[];
    generatedAt: Date;
  }): { filename: string; csv: string };

  // ── thin passthroughs to the repository (so PR2 routes call ONE object) ──
  findMonth(year: number, month: number): Promise<CashMonth | null>;
  findMonthById(id: string): Promise<CashMonth | null>;
  probeMonth(): Promise<MonthExistsProbe>;
  createMonth(input: CreateMonthInput): Promise<{ month: CashMonth; summary: CashMonthSummary }>;
  setMonthLocked(id: string, isLocked: boolean): Promise<CashMonth | null>;
  listEntriesForMonth(monthId: string): Promise<readonly CashEntry[]>;
  createEntry(input: CreateEntryInput): Promise<CashEntry>;
  updateEntry(id: string, patch: UpdateEntryInput): Promise<CashEntry | null>;
  /** Delete an entry: remove its attachment first (if any), then delete the row.
   *  Composes attachments.remove + cash.deleteEntry — the one place PR1 needs
   *  the two ports together. */
  deleteEntry(id: string): Promise<void>;
  listCheques(filter: ChequeListFilter): Promise<readonly ChequeRecord[]>;
  createCheque(input: CreateChequeInput): Promise<ChequeRecord>;
  bankCheque(id: string, bankedBy: string): Promise<{ bankedAt: string } | null>;
  updateCheque(id: string, patch: UpdateChequeInput): Promise<ChequeRecord | null>;
  deleteCheque(id: string): Promise<void>;
  uploadAttachment(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  readCashBookData(year: number, month: number):
    Promise<{ month: CashMonth; entries: readonly CashEntry[] } | null>;
  readChequeRegisterData(from: string, to: string): Promise<readonly ChequeRecord[]>;
}

export function createCashService(deps: CashServiceDeps): CashService { /* … */ }
```

> **Design note — why this service is "thicker" than `PricingService`.**
> Pricing was a pure passthrough (its only rule, `is_expired`, lived in the
> adapter). Cash has genuine pure business rules that live in the routes today —
> `closingBalance`, the month summary, the entry permission/validation cascade,
> the upload mime/size policy, and **two substantial CSV builders**. Those are
> pure functions over domain data: they belong in the service (deletion test —
> if they stayed in the routes, complexity would smear across PR2's eight
> handlers instead of concentrating here). The CSV builders especially must be
> pure service functions so PR2's `export` route becomes a thin caller:
> `const { filename, csv } = cashService.buildCashBookCsv(...)`.
> 🗣 Unlike pricing, the cash routes actually *think*; we move the thinking into
> the service so PR2's routes shrink to "read input → ask the service → reply".

> **Caller identity matches F-13/F-15.** The service takes already-resolved
> `{userId, role}` as plain inputs (`createdBy`, `editedBy`, `loggedBy`, and the
> `role`/`now` args on `validateEntry`). Header parsing (`x-mfs-user-id`,
> `x-mfs-user-role`) and the 401/403 *role gate* stay in the routes (PR2). The
> service only owns the *business* validation cascade (locked month, calendar
> month, date-in-month, type/amount rules). 🗣 The doorman (auth/role) stays at
> the door; the accountant (business rules) moves inside.

### `lib/wiring/cash.ts` (mirrors `lib/wiring/pricing.ts` / `users.ts`)

```ts
import { createCashService, type CashService } from "@/lib/services";
import {
  supabaseCashRepository,
  supabaseAttachmentStorage,
} from "@/lib/adapters/supabase";

export const cashService: CashService = createCashService({
  cash: supabaseCashRepository,
  attachments: supabaseAttachmentStorage,
});

// F-RLS-04e (LATER) will add cashServiceForCaller(userId) here, mirroring
// pricingServiceForCaller. NOT in PR1 — service-role singleton only.
```

🗣 The wiring panel: it is the only file allowed to know "Supabase" for cash, and
it just clicks the two Supabase plugs into the cash brain and hands out the ready
appliance. PR1 ships the master-key version only.

---

## snake_case ⇄ camelCase mapping (all 3 tables)

> Mapping happens ONLY inside `lib/adapters/supabase/CashRepository.ts`. Vendor
> column names never appear in domain/ports/services. 🗣 Translation desk lives
> at the Supabase door; past it, everything speaks the app's language.

### `cash_months` ⇄ `CashMonth`
| DB column | Domain field |
|---|---|
| `id` | `id` |
| `year` | `year` |
| `month` | `month` |
| `opening_balance` | `openingBalance` (Number()) |
| `is_locked` | `isLocked` (Boolean()) |
| `created_by` | `createdBy` |
| `created_at` | `createdAt` |

### `cash_entries` ⇄ `CashEntry`
| DB column / join | Domain field |
|---|---|
| `id` | `id` |
| `month_id` | `monthId` |
| `entry_date` | `entryDate` |
| `type` | `type` |
| `category` | `category` |
| `amount` | `amount` (Number()) |
| `description` | `description` |
| `reference` | `reference` |
| `attachment_path` | `attachmentPath` |
| `attachment_name` | `attachmentName` |
| `created_at` | `createdAt` |
| `edited_at` | `editedAt` |
| `customer_id` | `customerId` |
| `users!cash_entries_created_by_fkey(name)` | `createdByName` (`?? 'Unknown'`) |
| `users!cash_entries_edited_by_fkey(name)` | `editedByName` (`?? null`) |
| `customers(id,name).name` | `customerName` (`?? null`) |
| (computed) `createSignedUrl(attachment_path, 3600)` | `signedUrl` (null if no path) |

### `cheque_records` ⇄ `ChequeRecord`
| DB column / join | Domain field |
|---|---|
| `id` | `id` |
| `date` | `date` |
| `amount` | `amount` (Number()) |
| `cheque_number` | `chequeNumber` |
| `notes` | `notes` |
| `created_at` | `createdAt` |
| `banked` | `banked` (Boolean()) |
| `banked_at` | `bankedAt` (`?? null`) |
| `customer_id` | `customerId` |
| `customers(id,name)` | `customer` (NamedRef \| null) |
| `customer_name` | `customerName` |
| `users!cheque_records_driver_id_fkey(id,name)` | `driver` (NamedRef \| null) |
| `users!cheque_records_logged_by_fkey(name)` | `loggedByName` (`?? 'Unknown'`) |
| `users!cheque_records_banked_by_fkey(name)` | `bankedByName` (`?? null`) |

> The adapter must use the **`one<T>()` coercion helper** (Supabase embeds a
> to-one join as object-or-1-element-array), copied from the Pricing adapter.
> 🗣 Supabase sometimes returns a joined record as a list of one; the helper
> flattens it so the rest of the code sees a single record or null.

---

## Numbered implementation steps

> Build inner-out (domain → ports → adapters → service → wiring → tests) so each
> layer compiles against the one below before the next is written.

1. **`lib/domain/cash.ts`** — write the types above verbatim. Pure TS; no imports
   from `@/lib`, no framework, no vendor. Add the `export type { … }` block to
   `lib/domain/index.ts`.
2. **`lib/ports/CashRepository.ts`** and **`lib/ports/AttachmentStorage.ts`** —
   write the interfaces above, importing domain types only. Add both to
   `lib/ports/index.ts` (`export type`).
3. **`lib/adapters/supabase/CashRepository.ts`** — implement every `CashRepository`
   method against `supabaseService`. Copy each `.select('…')` string **verbatim**
   from the matching route. Map snake→camel per the tables above. Use the
   `one<T>()` helper. Wrap each `{ data, error }` so DB errors throw
   `ServiceError` (reads return null/empty on miss). Construct via factory
   `createSupabaseCashRepository(client)` + export the `supabaseCashRepository`
   singleton (pinned to `supabaseService`) — exactly the Pricing adapter pattern.
   - `createMonth` reproduces the route's branch: if `probeMonth` finds a prior
     month, opening = that month's closing; else opening = `input.openingBalance`.
     Throw `ConflictError` on a duplicate `(year,month)` (the route returns 409;
     the unique index `cash_months_year_month_key` backs this — map PG `23505`).
   - `bankCheque` reproduces `.eq('banked', false)` idempotency → null when no row.
4. **`lib/adapters/supabase/AttachmentStorage.ts`** — implement `upload` /
   `createSignedUrl` / `remove` against `supabaseService.storage.from('cash-attachments')`.
   `upload` uses `{ contentType, upsert: false }`. `createSignedUrl` returns
   `data?.signedUrl ?? null`. Factory + singleton `supabaseAttachmentStorage`.
   Add both new Supabase adapters to `lib/adapters/supabase/index.ts`.
5. **`lib/adapters/fake/CashRepository.ts`** and
   **`lib/adapters/fake/AttachmentStorage.ts`** — in-memory twins. Map storage of
   DOMAIN types; `createFakeCashRepository(seed?)` accepts join directories
   (`people`, `customers`) like `createFakePricingRepository`. Mirror the DB's
   hard rules: amount>0 CHECK, type∈{income,expense} CHECK, `(year,month)`
   uniqueness → `ConflictError`, `month_id` cascade on month delete (not needed
   in PR1 but keep parity), `bankCheque` idempotency. The Fake `AttachmentStorage`
   records uploads/removes in a Map and returns a deterministic fake signed URL
   (e.g. `fake-signed://<path>`). Add both to `lib/adapters/fake/index.ts`.
6. **`lib/services/cash.ts`** — `createCashService({cash, attachments})`. Implement:
   - The pure calculators (`closingBalance`, `monthSummary`) — copy the route's
     `Number()` coercion exactly.
   - `validateEntry` / `validateCheque` / `validateAndBuildUploadPath` — port the
     route cascades verbatim, returning `{ok:false,status,message}` with the
     EXACT message strings the routes emit (so PR2 reproduces wire output).
     Use the injected `now: Date` for the calendar-month check (LOCAL time, as
     today — do NOT switch to `londonToday()`; that would be a behaviour change).
   - `buildCashBookCsv` / `buildChequeRegisterCsv` — copy the `cell` / `row` /
     `sep` / `gbp` / `fmtDate` / `fmtDateTime` helpers and the line assembly from
     `export/route.ts` verbatim; join with `'\r\n'`; produce the same filename.
   - The thin passthroughs delegate to the ports; `deleteEntry` composes
     `attachments.remove([path])` (after reading the path) then
     `cash.deleteEntry(id)`. Import ports + domain ONLY; NEVER `lib/adapters/**`
     (lint will reject). Add to `lib/services/index.ts`.
7. **`lib/wiring/cash.ts`** — exactly the snippet above. Service-role singleton
   only; a `// F-RLS-04e` comment marks where the per-caller factory will go.
8. **`tests/unit/services/CashService.test.ts`** — see test plan below.
9. **`tests/unit/wiring/cashService.test.ts`** — assert `cashService` is defined,
   is a `CashService` (has the methods), and that `createCashService` returns a
   fresh object per call (no shared mutable state) — mirroring
   `tests/unit/wiring/pricingServiceForCaller.test.ts` posture.
10. **Run the gates locally:** `npm run lint` (the no-adapter-imports +
    no-supabase-sdk fences must pass with the new files), `npm run typecheck` (or
    `tsc --noEmit`), `npm run test:unit`. NO integration/pgTAP/E2E behaviour
    changes expected (nothing is consumed yet).

---

## TDD test plan (for ANVIL)

> Layer depth is scaled to the change: this is introduce-only, so the weight is
> entirely in **unit** tests. Integration / pgTAP / E2E are minimal/unchanged
> because **no route, no DB, no RLS** ships in PR1 — the new code has no
> production caller yet. 🗣 We test the new machine hard on the bench; there is no
> live wiring to smoke-test because nothing is plugged in.

### Unit — `tests/unit/services/CashService.test.ts` (against Fake adapters)
- **`closingBalance`**: empty entries → opening; mixed income/expense → correct;
  string-amount coercion behaves like `Number()` (parity with route).
- **`monthSummary`**: opening/totalIncome/totalExpense/closing all correct;
  income-only, expense-only, and empty cases.
- **`probeMonth` / suggested opening** (via Fake repo): no months → `{isFirst:true,
  suggestedOpening:null}`; one prior month with entries → suggestedOpening equals
  that month's closing.
- **`createMonth`**: first-ever uses `input.openingBalance`; subsequent
  auto-computes from previous closing; duplicate `(year,month)` → `ConflictError`.
- **`validateEntry` — every branch**: missing-fields 400; bad type 400; amount<=0
  400; month-not-found 404; locked-month 403; non-admin wrong-calendar-month 403
  (drive with explicit `now`); admin into a non-current month → ok; entry_date
  outside the month 400; the income→customer and expense→category persistence
  shaping (assert via `createEntry` that category nulls out for income and
  customer nulls out for expense). Assert exact message strings.
- **`validateCheque`**: missing date/customer/amount/driver 400; customer by id
  OR by name both pass; amount<=0 400.
- **`validateAndBuildUploadPath`**: allowed mimes pass; disallowed mime 400 with
  the `File type not allowed: <type>` message; >10MB 400; path shape
  `${userId}/${now.getTime()}.${ext}`; missing extension defaults to `bin`.
- **`buildCashBookCsv`**: full golden-string assertion — header/summary/statement/
  running-balance/totals/footer, 8 cols, CRLF line endings, `£` formatting, LOCKED
  vs Open footer, filename `MFS-CashBook-YYYY-MM.csv`. Drive with a fixed
  `generatedAt` Date so the output is deterministic.
- **`buildChequeRegisterCsv`**: golden-string assertion — 9 cols, summary totals
  (total/banked/outstanding), `customer ?? customer_name ?? '—'` fallback,
  Banked/Not-Banked status, filename `MFS-ChequeRegister-<from>-to-<to>.csv`.
- **`deleteEntry` composition**: with a Fake AttachmentStorage spy, assert
  `remove([path])` is called before `cash.deleteEntry`, and that a no-attachment
  entry skips `remove`.

### Unit — `tests/unit/wiring/cashService.test.ts`
- `cashService` is defined and exposes the `CashService` surface.
- `createCashService` returns a distinct object per call (no accidental shared
  state) — same posture as the existing wiring pins.

### Lint pin — `tests/unit/lint/no-adapter-imports.test.ts`
- **Unchanged file; must still pass.** The new `lib/services/cash.ts` must import
  ports only (no `@/lib/adapters/**`, no `@supabase/*`), and the new Supabase
  adapters may import `@supabase/supabase-js` (allow-listed for
  `lib/adapters/supabase/**`). 🗣 The existing boundary-cop test is the proof our
  new files sit on the right side of every wall — we do not edit it, we satisfy
  it.

### Integration / pgTAP / E2E
- **None new.** No route is re-pointed, no migration ships, RLS is untouched.
  The full suites should run green exactly as on `main` (regression guard only).
  🗣 The big end-to-end tests just confirm we broke nothing; there's no new live
  path to exercise.

---

## Acceptance criteria

1. Eleven new files exist as specified; the five barrels gain only additive
   re-exports; NO other existing file changed.
2. No `app/api/cash/**` route, no `app/api/detail/discrepancy/route.ts`, and no
   migration is touched.
3. `npm run lint`, `npm run typecheck`, `npm run test:unit` all green.
   `no-adapter-imports.test.ts` passes unchanged.
4. `lib/services/cash.ts` imports `@/lib/ports` + `@/lib/domain` + `@/lib/errors`
   only — never `lib/adapters/**`, never `@supabase/*`.
5. `@supabase/*` and Supabase Storage appear ONLY in the two new
   `lib/adapters/supabase/*` files.
6. `createCashService` exports a factory; `lib/wiring/cash.ts` is the sole
   business-layer file importing the Cash adapters, and exports the service-role
   `cashService` singleton.
7. The Fake adapters pass the same behavioural expectations the service tests
   assert (calculators, validation, CSV) so PR2 can rely on parity.
8. `package.json` is unchanged (no new dependency).

---

## Risk Assessment

> Scope is introduce-only and offline (no production caller), so most categories
> are low. Each risk has severity + mitigation + must-fix flag.

### Concurrency / race conditions
- **Severity: none (material).** PR1 adds no executed-in-prod code path — the
  singleton is constructed but never called. The `bankCheque` idempotency and the
  `createMonth` duplicate guard are *modelled* but only exercised in unit tests.
  **Must-fix: NO.** 🗣 Nothing runs in production yet, so nothing can race yet.
  (PR2 inherits the existing route concurrency posture unchanged.)

### Security
- **Service-role posture unchanged — Severity: low.** The wiring singleton uses
  `supabaseService` (RLS-bypassing master key), identical to today's routes. PR1
  does not widen exposure: the singleton has no caller. **Mitigation:** keep the
  per-caller authenticated factory OUT of PR1 (it is F-RLS-04e); add the
  `// F-RLS-04e` placeholder comment only. **Must-fix: NO.**
- **Vendor-type leak — Severity: low, but a real boundary risk.** If the adapter
  returns a PostgREST row shape (snake_case) instead of mapping to the domain,
  the boundary leaks. **Mitigation:** the mapping tables above are exhaustive;
  the Fake-vs-service tests assert camelCase domain shapes; lint forbids vendor
  imports outside the adapter. **Must-fix: NO** (covered by tests + lint).
- 🗣 Same lock as today and no new door opened; the only thing to watch is making
  sure the database's spelling never escapes the adapter, which the tests catch.

### Data migration
- **Severity: none.** No migration, no schema change, no backfill, no RLS policy.
  **Must-fix: NO.** 🗣 We do not touch the database at all.

### Business-logic flaws (the real risk area)
- **CSV / validation drift — Severity: MEDIUM.** The whole value of PR1 is that
  the extracted logic is **byte-identical** to the routes. The subtle traps:
  1. The entry calendar-month check uses **local-server `new Date()`**, NOT
     `londonToday()`. Switching to London would be a behaviour change.
     **Mitigation:** `validateEntry` takes an injected `now: Date` and uses raw
     `getFullYear()/getMonth()` exactly as the route; a unit test pins this.
  2. CSV builders must reproduce CRLF joins, `£` formatting, the dd/mm/yy and
     dd/mm/yy HH:MM date formats, column counts (8 / 9), and the LOCKED/Open
     footer. **Mitigation:** golden-string unit tests with a fixed `generatedAt`.
  3. Income nulls `category`; expense nulls `customer_id`. **Mitigation:** asserted
     via `createEntry` shaping tests.
  **Must-fix: NO** for Gate 2 (it is a build-quality requirement enforced by the
  test plan, not a structural blocker) — but it is the **#1 thing ANVIL must
  verify** and the #1 thing PR2's preview smoke will catch if missed.
- 🗣 The danger isn't structure, it's faithfully copying the existing money-and-
  export rules character-for-character; golden tests are our seatbelt.

### Launch blockers
- **Introduce-only contract — Severity: HIGH if violated, else none.** A single
  diff line inside a route or a migration breaks the spec's core promise and the
  PR must be rejected. **Mitigation:** the diff review at Gate 4 / code-critic
  must confirm only the 11 new files + 5 additive barrel edits appear.
  **Must-fix: NO** as a *plan* risk (the plan forbids it); it becomes a blocker
  only if implementation strays. 🗣 The one way to fail this PR is to touch
  something we promised not to — easy to check in the diff.

### Risk headline
**No must-fix (Gate-2-blocking) risks.** The dominant risk is byte-identical
fidelity of the extracted CSV/validation logic (MEDIUM), fully owned by the
golden-string + branch unit tests in the ANVIL plan. Structurally the PR is a
clean, low-risk hexagonal introduce-only extraction.

---

## Hexagonal verdict (populates Gate 2)

- **Ports used / added:** TWO new ports — `CashRepository` (all Cash DB ops) and
  `AttachmentStorage` (the `cash-attachments` bucket). Both owned by the app in
  `lib/ports/`, defined in business terms, importing domain types only.
- **Adapters:** `lib/adapters/supabase/CashRepository.ts` and
  `lib/adapters/supabase/AttachmentStorage.ts` implement the ports against
  Supabase (the only new files importing `@supabase/*` / Supabase Storage); plus
  Fake twins under `lib/adapters/fake/` for tests. Wired in `lib/wiring/cash.ts`.
- **New dependencies:** **NONE.** No `package.json` entry added. All needed
  libraries (`@supabase/supabase-js`, internal `@/lib/errors`,
  `@/lib/observability/log`) already exist and stay confined to the adapter
  folder. No single-use-vendor-wrapping question arises.
- **Rip-out test:** **PASS.** Replacing the Cash database vendor = write one new
  adapter folder (`lib/adapters/<vendor>/CashRepository.ts` +
  `AttachmentStorage.ts`) and edit the one wiring file `lib/wiring/cash.ts`.
  `CashService`, `lib/domain/cash.ts`, and the ports are untouched. One adapter +
  one wiring file → satisfies the CLAUDE.md acceptance test.

🗣 Two clean new sockets, the right plugs behind them, no new vendor sneaking in,
and swapping the cash database later costs one adapter plus one wiring line.
Gate 2 is clear.

---

## PR2 / later hand-offs (NOT done in PR1 — recorded so nothing is lost)

- **PR2:** re-point all eight `app/api/cash/**` routes through `cashService`
  (keep header/role parsing + 401/403 role gate in the routes); routes drop their
  direct `@supabase/*` imports. The `export` route becomes a thin caller of
  `buildCashBookCsv` / `buildChequeRegisterCsv`.
- **PR2:** absorb `app/api/detail/discrepancy/route.ts`'s raw `fetch()` to
  PostgREST. NOTE: that route reads the `discrepancies` table, NOT a Cash table —
  it is a separate raw-Supabase-call cleanup the spec bundles into PR2, not part
  of the Cash domain ports. Flag at PR2 planning whether it deserves its own
  small port/adapter (likely a `DiscrepanciesRepository`) rather than joining
  `CashRepository`.
- **F-RLS-04e:** add `cashServiceForCaller(userId)` to `lib/wiring/cash.ts`
  (mirroring `pricingServiceForCaller`) + the Cash RLS policy migration + the
  authenticated-client cutover. Separate unit, separate migration, own Gate run.
```
