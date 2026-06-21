# F-17 PR1 — Complaints + Compliments hexagonal foundation (INTRODUCE-ONLY)

**Date:** 2026-06-23
**Unit:** F-17 PR1
**Type:** Pure hexagonal domain extraction. Introduce-only. Zero behaviour change.
**Author:** forge-planner (FORGE Phase 2 — Order)

🗣 In plain English: This PR builds the clean "Lego sockets" (owned interfaces) and
their plugs (adapters) for the Complaints and Compliments features, plus a small
amount of business code in the middle. Nothing in the running app calls any of it
yet — it's parts on the workbench. A later PR (PR2) will swap the routes over to
use them, and a still-later PR (F-RLS-04f) will add per-user security. After THIS
PR the app behaves exactly as before, byte-for-byte.

---

## Mini-map

```
DOMAIN (core logic) — F-17 PR1
  ├─ ComplaintsRepository (port) → [Supabase] + [Fake]   (adapters)
  └─ ComplimentsRepository (port) → [Supabase] + [Fake]  (adapters)
🗣 Two new sockets + their two plugs each, wired MASTER-KEY only — nothing plugs in yet
```

---

## Goal

Introduce the owned hexagonal foundation for BOTH the Complaints feature and the
Compliments feature, mirroring the freshest template in the repo (Cash, F-16 PR1):

- `lib/domain/Complaint.ts` + `lib/domain/Compliment.ts` — pure camelCase domain types
- `lib/ports/ComplaintsRepository.ts` + `lib/ports/ComplimentsRepository.ts` — owned interfaces
- `lib/services/ComplaintsService.ts` + `lib/services/ComplimentsService.ts` — factories only
- `lib/adapters/supabase/ComplaintsRepository.ts` + `.../ComplimentsRepository.ts`
- `lib/adapters/fake/ComplaintsRepository.ts` + `.../ComplimentsRepository.ts`
- `lib/wiring/complaints.ts` + `lib/wiring/compliments.ts` — MASTER-KEY singletons only
- barrel edits to `lib/domain/index.ts`, `lib/ports/index.ts`, `lib/services/index.ts`,
  `lib/adapters/supabase/index.ts`, `lib/adapters/fake/index.ts`

🗣 In plain English: We're copying the exact shape of the Cash feature's clean
rebuild and applying it to Complaints and Compliments. Same folders, same naming,
same factory-vs-singleton split.

The whole value of an introduce-only extraction is that the lifted code is BYTE-IDENTICAL
to what the eight existing routes do today, so PR2 can re-point them with zero drift.

---

## Domain terms (plain English)

- **Port** — `lib/ports/*Repository.ts`. 🗣 The socket shape the app insists on; the DB
  has to fit it, not the other way round.
- **Adapter** — `lib/adapters/<vendor>/*Repository.ts`. 🗣 The actual plug for one vendor.
  Supabase gets one plug, the in-memory Fake gets another; the socket never changes.
- **Service factory** — `createXService(deps)`. 🗣 A "build me an engine, here are its
  parts" function. The parts (adapters) are handed in, never hard-wired inside.
- **Wiring / composition root** — `lib/wiring/*.ts`. 🗣 The one wall plate where plug
  meets socket. The ONLY business-layer file allowed to import a vendor adapter.
- **Master-key (service-role) client** — `supabaseService`. 🗣 The skeleton key that
  bypasses row-level security. This PR uses ONLY that, exactly like the routes do today.
- **snake_case ↔ camelCase mapping** — DB columns like `resolution_note` become
  `resolutionNote` inside the adapter. 🗣 The vendor's spelling stops at the adapter door;
  the rest of the app speaks our own vocabulary.

---

## Compliance / RLS flags

- **NO RLS / per-caller authenticated client in this PR.** The `complaints`,
  `complaint_notes`, `compliments`, and `audit_log` tables all already have RLS policies
  in the baseline (lines 2419–2437), but today's routes use the service-role master key,
  which bypasses them. This PR composes MASTER-KEY singletons only. The per-caller
  authenticated factory (`complaintsServiceForCaller`) is explicitly DEFERRED to **F-RLS-04f**.
  🗣 In plain English: We are NOT turning on per-user security here. We keep the existing
  skeleton-key behaviour so nothing changes. Locking it down is a separate, later job.
- **NO migration.** Schema is untouched.
- **NO email-helper changes.** `lib/complaint-email.ts` and `lib/compliment-email.ts`
  stay exactly as-is; they move behind the `Mailer` port in a later PR.

---

## ADR conflicts

None. This PR is a textbook application of **ADR-0002** (hexagonal shape & naming):
ports in `lib/ports/`, adapters in `lib/adapters/<vendor>/`, services depend on ports
only, vendor SDK confined to the adapter, wiring is the only place adapters are imported
by the business layer. No ADR is contradicted; this PR strengthens ADR-0002 adherence
for two more features.

🗣 In plain English: The project's architecture rulebook (ADR-0002) is the thing this
PR follows to the letter. No conflicts — it's doing exactly what the rulebook prescribes.

---

## THE DESIGN DECISION: audit_log and the customer-name read

Three complaint routes (`screen2/sync`, `screen2/resolve`, `screen2/note`) do extra work
beyond their own table: they (a) READ `customers` for a display name and (b) WRITE
`audit_log`. The question is whether the Complaints port owns those.

### Investigation done

- Searched the whole hexagonal tree for an existing audit abstraction. There is **no
  general-purpose `AuditLog` port, service, or adapter**. The only audit code in the
  hexagonal layers is Orders-specific: `order_audit_log` is read inside
  `OrdersRepository` (for KDS flashes), and `OrdersRepository.ts:541–556` explicitly
  documents the choice to keep that read inside the Orders adapter rather than build a
  shared audit port — calling a shared audit port premature.
- The complaint routes write to the **general `audit_log`** table (not `order_audit_log`)
  via raw `fetch` POSTs, **fire-and-forget** (`.catch(...)` only logs; the response never
  depends on the audit write succeeding).
- The customer-name read in those routes is a single-column lookup used purely to build
  the `audit_log.summary` string and the email payload.

### DECISION 1 — customer-name read: KEEP IT IN THE COMPLAINTS PORT.

The `ComplaintsRepository.createComplaint` method returns a `Complaint` domain object
**with the customer name already resolved** (via the same `customers(name)` join the GET
routes already use). The customer name PR2 needs for the audit summary + email is then a
field on the returned object — no separate cross-domain `CustomersRepository` call from
the complaint flow.

**Why:** The GET routes (`screen2/all`, `screen2/open`, `detail/complaint`) ALREADY join
`customers(name)` inside the complaints query. Resolving the name in the same adapter
read is the established pattern (Cash does identical user/customer join resolution inside
`CashRepository`). It keeps PR2's re-point to ONE object call and avoids dragging in a
second port. Rip-out stays clean: the join lives in the one Supabase adapter file.

🗣 In plain English: When you log a complaint, the adapter also fetches the customer's
name in the same trip and hands it back attached to the complaint. PR2 doesn't need to
make a second call to look the name up. This copies exactly what the Cash feature does.

### DECISION 2 — audit_log write: OUT OF SCOPE for this PR (stays a cross-cutting concern).

The `audit_log` write does **NOT** belong in the Complaints port or service. It stays as
a route-level concern for PR2 to call directly (as it does today), and the eventual
clean home is a future shared `AuditLog` port — NOT baked into Complaints.

**Why:**
1. `audit_log` is genuinely cross-cutting — `screen2`, and the `audit_screen` enum
   (`screen1`/`screen2`/`screen3`/`screen5`) shows it spans many features. Baking it into
   Complaints would make a per-feature copy of a shared concern.
2. The repo has a documented precedent (`OrdersRepository.ts:541–556`) for deliberately
   NOT building a shared audit port until there is a second real consumer. F-17 is not the
   place to invent that abstraction.
3. The writes are fire-and-forget today — they do not affect the response. Lifting them
   into a service would force a decision about error semantics that introduce-only must avoid.
4. **Introduce-only test:** PR2 can still re-point byte-identically. The audit POST stays
   a raw call in the route in PR2 (unchanged from today); only the complaint INSERT and
   reads move to the service. This keeps PR1 minimal and PR2 drift-free.

**The customer name the audit summary needs** is supplied by Decision 1 (it rides back on
the returned `Complaint`), so PR2 still has it without a `customers` round-trip.

🗣 In plain English: Writing to the activity log is a shared, whole-company concern, not a
Complaints concern. We deliberately leave it where it is rather than copy it into the
Complaints box. There's even a written precedent in the Orders code for making exactly this
call. PR2 keeps logging the same way it does now; it just gets the customer name for free
from the new complaint object.

### Backlog note to add (in PR description / BACKLOG.md)

Add **F-TD-NEW (AuditLog port)** to `docs/plans/BACKLOG.md`: "General `audit_log` table is
written by raw fetch in screen2 + others; no owned port. Build a shared `AuditLog` port +
Supabase/Fake adapters once a second consumer makes it non-premature." 🟢 low priority.

---

## Exact column / enum reference (verified against baseline)

`complaints` (baseline 361–375):
`id uuid`, `created_at timestamptz`, `customer_id uuid NOT NULL`, `category complaint_category NOT NULL`,
`description text NOT NULL (len>=5)`, `received_via complaint_received_via NOT NULL`,
`user_id uuid NOT NULL` (the logger), `status complaint_status NOT NULL DEFAULT 'open'`,
`resolution_note text`, `resolved_by uuid`, `resolved_at timestamptz`.
CHECK `complaints_resolution_check`: status='open' ⇒ all three resolution fields NULL;
status='resolved' ⇒ all three NOT NULL.

`complaint_notes` (baseline 348–355):
`id uuid`, `complaint_id uuid NOT NULL` (FK CASCADE), `user_id uuid NOT NULL` (FK SET NULL),
`body text NOT NULL (trimmed len>=1)`, `created_at timestamptz`.

`compliments` (baseline 381–388):
`id uuid`, `body text NOT NULL (len>0)`, `posted_by uuid NOT NULL`, `recipient_id uuid` (nullable),
`created_at timestamptz`.

Enums (baseline 43–72):
- `complaint_category`: `weight | quality | delivery | missing_item | pricing | service | other`
- `complaint_received_via`: `phone | in_person | whatsapp | email | other`
- `complaint_status`: `open | resolved`

🗣 In plain English: These are the exact database column names, rules, and dropdown values
for the three tables. The adapter must respect every one of them (e.g. a complaint can't be
"resolved" without all three resolution fields filled — the DB rejects it otherwise).

---

## Files to CREATE (10 files) + barrels to EDIT (5 files)

### CREATE — domain (2)
1. `lib/domain/Complaint.ts`
2. `lib/domain/Compliment.ts`

### CREATE — ports (2)
3. `lib/ports/ComplaintsRepository.ts`
4. `lib/ports/ComplimentsRepository.ts`

### CREATE — services (2)
5. `lib/services/ComplaintsService.ts`
6. `lib/services/ComplimentsService.ts`

### CREATE — supabase adapters (2)
7. `lib/adapters/supabase/ComplaintsRepository.ts`
8. `lib/adapters/supabase/ComplimentsRepository.ts`

### CREATE — fake adapters (2)
9. `lib/adapters/fake/ComplaintsRepository.ts`
10. `lib/adapters/fake/ComplimentsRepository.ts`

### CREATE — wiring (2)
11. `lib/wiring/complaints.ts`
12. `lib/wiring/compliments.ts`

### CREATE — tests (4)
13. `tests/unit/services/ComplaintsService.test.ts`
14. `tests/unit/services/ComplimentsService.test.ts`
15. `tests/unit/wiring/complaintsService.test.ts`
16. `tests/unit/wiring/complimentsService.test.ts`

### EDIT — barrels (5)
- `lib/domain/index.ts` — add Complaint + Compliment type exports
- `lib/ports/index.ts` — add ComplaintsRepository + ComplimentsRepository type exports
- `lib/services/index.ts` — add the two service factory + type exports
- `lib/adapters/supabase/index.ts` — add the two supabase factory + singleton exports
- `lib/adapters/fake/index.ts` — add the two fake factory + singleton (+ seed type) exports

> File count to CREATE: **16** (12 source + 4 test). Barrel files EDITED: **5**. No route
> file edited, no migration, no email-helper edit.

🗣 In plain English: 16 brand-new files and 5 small additions to "index" list files so the
new pieces are importable. Zero edits to anything that's actually running in the app.

---

## Domain type definitions (exact)

### `lib/domain/Complaint.ts`

```ts
export type ComplaintCategory =
  | "weight" | "quality" | "delivery" | "missing_item"
  | "pricing" | "service" | "other";
export type ComplaintReceivedVia =
  | "phone" | "in_person" | "whatsapp" | "email" | "other";
export type ComplaintStatus = "open" | "resolved";

/** A complaint_notes row, joins resolved (author name). */
export interface ComplaintNote {
  readonly id: string;
  readonly complaintId: string;
  readonly body: string;
  readonly authorName: string;   // users.name ?? 'Unknown'
  readonly createdAt: string;    // ISO-8601
}

/** A complaints row with joins resolved — the FULL shape (screen2/all). */
export interface Complaint {
  readonly id: string;
  readonly createdAt: string;
  readonly category: ComplaintCategory;
  readonly description: string;
  readonly receivedVia: ComplaintReceivedVia;
  readonly status: ComplaintStatus;
  readonly resolutionNote: string | null;
  readonly resolvedAt: string | null;
  readonly customerName: string;     // customers.name ?? 'Unknown'
  readonly loggedByName: string;     // logger users.name ?? 'Unknown'
  readonly loggedById: string | null;// logger users.id (screen2/all exposes logged_by.id)
  readonly resolvedByName: string | null;
  readonly notes: readonly ComplaintNote[]; // empty in summaries that don't fetch notes
}

/** A complaints row with the customer id+name pair (detail/complaint exposes both). */
export interface ComplaintDetail extends Complaint {
  readonly customerId: string;
  readonly customerName: string;
}

// ── Inputs / contexts ──

export interface CreateComplaintInput {
  readonly id?: string;              // optional client-supplied id (offline-queue replay)
  readonly customerId: string;
  readonly category: ComplaintCategory;
  readonly description: string;
  readonly receivedVia: ComplaintReceivedVia;
  readonly status: ComplaintStatus;
  readonly resolutionNote: string | null; // required when status='resolved'
  readonly loggedBy: string;         // x-mfs-user-id
}

/** Returned by createComplaint: the new id + the resolved customer name (so PR2
 *  can build the audit summary + email without a second customers read). */
export interface CreatedComplaint {
  readonly id: string;
  readonly customerName: string;     // customers.name ?? 'Unknown'
  readonly duplicate: boolean;       // true on 23505 retry (matches screen2/sync 200)
}

export interface ResolveComplaintInput {
  readonly complaintId: string;
  readonly resolutionNote: string;
  readonly resolvedBy: string;       // x-mfs-user-id
}

/** Context read for the resolve/note email payloads (category/description/customer). */
export interface ComplaintEmailContext {
  readonly id: string;
  readonly category: ComplaintCategory;
  readonly description: string;
  readonly status: ComplaintStatus;
  readonly customerName: string;     // ?? 'Unknown'
}

export interface CreateNoteInput {
  readonly complaintId: string;
  readonly body: string;
  readonly userId: string;           // x-mfs-user-id
}

/** Returned by createNote (the screen2/note 201 body shape, author resolved). */
export interface CreatedNote {
  readonly id: string;
  readonly body: string;
  readonly createdAt: string;
}
```

> **Important byte-identical note on `category`:** the existing GET routes return
> `category.replace(/_/g, ' ')` (e.g. `"missing item"`) — a **presentation transform**.
> That transform STAYS IN THE ROUTE in PR2; the domain type carries the raw enum value.
> The domain `Complaint.category` is the raw `ComplaintCategory` enum. 🗣 The underscore→space
> prettifying is a display thing, so it stays at the edge (the route), not in the data model.

### `lib/domain/Compliment.ts`

```ts
/** A compliments row with poster + recipient joins resolved (compliments GET/POST). */
export interface Compliment {
  readonly id: string;
  readonly body: string;
  readonly createdAt: string;
  readonly postedById: string | null;   // poster.id ?? null
  readonly postedByName: string;         // poster.name ?? 'Unknown'
  readonly recipientId: string | null;   // recipient.id ?? null
  readonly recipientName: string | null; // recipient.name ?? null
}

/** An active user for the recipient dropdown (compliments/users GET). */
export interface ComplimentRecipient {
  readonly id: string;
  readonly name: string;
  readonly role: string;
}

export interface CreateComplimentInput {
  readonly body: string;
  readonly postedBy: string;             // x-mfs-user-id
  readonly recipientId: string | null;
}
```

🗣 In plain English: These TypeScript shapes mirror EXACTLY the JSON each existing route
produces today (I cross-checked every field against the route mapping code). PR2 maps
these camelCase fields back to the snake_case keys the front-end currently receives, so the
wire output is unchanged. The only deliberate split: raw enum values live in the data,
display prettifying stays at the route edge.

---

## Port method signatures (one method per PR2 route operation)

### `lib/ports/ComplaintsRepository.ts`

```ts
import type {
  Complaint, ComplaintDetail, ComplaintNote, ComplaintEmailContext,
  CreateComplaintInput, CreatedComplaint, ResolveComplaintInput,
  CreateNoteInput, CreatedNote,
} from "@/lib/domain";

export interface ComplaintsRepository {
  /** All complaints + their full notes thread, newest first.
   *  → GET /api/screen2/all. (notes populated) */
  listAllWithNotes(): Promise<readonly Complaint[]>;

  /** All OPEN complaints, newest first (notes empty — route doesn't fetch them).
   *  → GET /api/screen2/open. */
  listOpen(): Promise<readonly Complaint[]>;

  /** One complaint by id, customer id+name + logger + resolver resolved.
   *  null on miss. → GET /api/detail/complaint. */
  findDetailById(id: string): Promise<ComplaintDetail | null>;

  /** Insert a complaint (resolution fields set iff status='resolved'); returns
   *  the new id + resolved customer name. duplicate=true on 23505 (offline replay).
   *  → POST /api/screen2/sync. */
  createComplaint(input: CreateComplaintInput): Promise<CreatedComplaint>;

  /** Atomically set status=resolved + the three resolution fields, ONLY where
   *  the complaint is currently open. Returns the resolved id, or null if no
   *  open row matched (404 branch). → POST /api/screen2/resolve. */
  resolveOpen(input: ResolveComplaintInput): Promise<{ id: string } | null>;

  /** Read the email/audit context for a complaint (category, description, status,
   *  customer name). null on miss. → used by resolve + note flows. */
  findEmailContext(id: string): Promise<ComplaintEmailContext | null>;

  /** Insert an internal note; returns the new id + created_at. The caller has
   *  verified the complaint exists (via findEmailContext). → POST /api/screen2/note. */
  createNote(input: CreateNoteInput): Promise<CreatedNote>;
}
```

> Note: `screen2/sync` and `screen2/resolve` set `resolved_*` fields directly — the DB
> CHECK constraint forces all-or-nothing. The adapter must build the insert/update payload
> so the constraint is satisfied (open ⇒ nulls; resolved ⇒ note+by+at all set), exactly as
> the routes do. The Fake adapter must enforce the same CHECK (reject resolved-with-missing-fields).

### `lib/ports/ComplimentsRepository.ts`

```ts
import type {
  Compliment, ComplimentRecipient, CreateComplimentInput,
} from "@/lib/domain";

export interface ComplimentsRepository {
  /** Newest-first, limit 100, poster + recipient joins resolved.
   *  → GET /api/compliments. */
  listRecent(): Promise<readonly Compliment[]>;

  /** Insert a compliment; returns it with joins resolved (poster + recipient).
   *  → POST /api/compliments. */
  createCompliment(input: CreateComplimentInput): Promise<Compliment>;

  /** Active users (id,name,role) ordered by name, for the recipient dropdown.
   *  → GET /api/compliments/users. */
  listActiveRecipients(): Promise<readonly ComplimentRecipient[]>;
}
```

🗣 In plain English: Each method above is one job a real route does today (GET the list,
POST a new one, etc.). Nothing speculative — every method has a route waiting for it in PR2.

---

## Service shape (factories only — NO singletons in services)

### `lib/services/ComplaintsService.ts`

```ts
import type { /* domain types as above */ } from "@/lib/domain";
import type { ComplaintsRepository } from "@/lib/ports";

export interface ComplaintsServiceDeps {
  readonly complaints: ComplaintsRepository;
}

export interface ComplaintsService {
  listAllWithNotes(): Promise<readonly Complaint[]>;
  listOpen(): Promise<readonly Complaint[]>;
  findDetailById(id: string): Promise<ComplaintDetail | null>;
  /** Validates required fields + the resolved⇒resolution_note rule (route messages),
   *  then delegates. Returns ok | {status,message} rejection mirroring screen2/sync. */
  validateCreate(input: CreateComplaintInput):
    | { ok: true } | { ok: false; status: number; message: string };
  createComplaint(input: CreateComplaintInput): Promise<CreatedComplaint>;
  resolveOpen(input: ResolveComplaintInput): Promise<{ id: string } | null>;
  findEmailContext(id: string): Promise<ComplaintEmailContext | null>;
  createNote(input: CreateNoteInput): Promise<CreatedNote>;
}

export function createComplaintsService(
  deps: ComplaintsServiceDeps,
): ComplaintsService { /* ... */ }
```

> The Complaints service carries the validation cascade currently inline in `screen2/sync`
> (the `missing[]` list + the resolved⇒resolution_note rule) and `screen2/resolve` (the
> `complaint_id` / `resolution_note` required + UUID regex), returning typed rejections
> with the routes' EXACT message strings, mirroring `CashService.validateEntry`. The UUID
> regex and `category.replace` display transform stay in the route (presentation).
> Everything else is a thin passthrough to the port.

### `lib/services/ComplimentsService.ts`

```ts
export interface ComplimentsServiceDeps {
  readonly compliments: ComplimentsRepository;
}
export interface ComplimentsService {
  listRecent(): Promise<readonly Compliment[]>;
  /** Validates body non-empty (route's 'body required' 400). */
  validateCreate(input: CreateComplimentInput):
    | { ok: true } | { ok: false; status: number; message: string };
  createCompliment(input: CreateComplimentInput): Promise<Compliment>;
  listActiveRecipients(): Promise<readonly ComplimentRecipient[]>;
}
export function createComplimentsService(
  deps: ComplimentsServiceDeps,
): ComplimentsService { /* ... */ }
```

🗣 In plain English: The services hold the small "is this request valid?" checks that are
currently buried in the route files, copied word-for-word so the error messages users see
don't change. The validation messages must be the EXACT strings the routes return today.
Everything else just forwards to the adapter.

---

## Adapter shape

### Supabase adapters

- Import `@supabase/supabase-js` type + `supabaseService` from `@/lib/adapters/supabase/client`.
- Export `createSupabaseComplaintsRepository(client)` factory + `supabaseComplaintsRepository`
  singleton (= `createSupabaseComplaintsRepository(supabaseService)`); same for Compliments.
- Map snake_case ↔ camelCase in private mapper functions (`toComplaint`, `toNote`,
  `toCompliment`), using the `one<T>()` to-one-join helper pattern from `CashRepository`.
- **Select strings copied VERBATIM** from the eight routes so wire output is byte-identical:
  - `listAllWithNotes`: the two parallel selects from `screen2/all` (complaints +
    complaint_notes), grouped in the adapter exactly as the route groups them.
  - `listOpen`: the `screen2/open` select.
  - `findDetailById`: the `detail/complaint` select (note its alias `resolvedBy:users!...`).
  - `createComplaint`: insert payload mirroring `screen2/sync` (resolved_* set iff resolved),
    then resolve the customer name (`customers(name)`); map 23505 → `duplicate:true` (NOT a
    thrown error — `screen2/sync` returns 200 on duplicate).
  - `resolveOpen`: UPDATE `...&status=eq.open` mirroring `screen2/resolve` (0 rows ⇒ null).
  - `findEmailContext`: the resolve/note context select (`category,description,status,customers(name)`).
  - `createCompliment` / `listRecent` / `listActiveRecipients`: the `compliments` route selects.
- Error contract (per `CashRepository`): reads return null/empty on miss; DB failure throws
  `ServiceError` (`@/lib/errors`). The `screen2/sync` 23505 case is NOT an error — it maps to
  `duplicate:true`. Use `log` from `@/lib/observability/log` for error logging.

> **REST-vs-SDK note:** today six of the eight routes use raw `fetch` to the PostgREST
> endpoint, not the supabase-js client. The adapters MUST use the supabase-js `client`
> (the `createSupabase...Repository(client)` pattern), NOT raw fetch — that is the whole
> point of the extraction and matches `CashRepository`. The select column lists transfer
> directly; the equivalent supabase-js query builder produces identical wire shapes. The
> integration test (PR2) is what proves byte-identity end to end; PR1's job is to encode the
> selects faithfully. 🗣 The old code talks to the database two different messy ways; the new
> adapter standardises on the clean client, but asks for the exact same columns.

### Fake adapters

- In-memory `Map`-backed, no vendor import. Export `createFakeComplaintsRepository(seed?)`
  + `fakeComplaintsRepository` singleton; same for Compliments.
- Seed shape mirrors `FakeCashSeed`: a `people` directory (user id → {id,name}) and a
  `customers` directory so joins (logger/resolver/author/poster/recipient/customer) resolve
  to populated names. Define + export `FakeComplaintsSeed` and `FakeComplimentsSeed`.
- Mirror DB hard rules so both adapters answer identically:
  - `complaints_resolution_check` — reject create/resolve where status='resolved' but a
    resolution field is missing (throw `ServiceError` with the constraint-name message, like
    the Fake Cash adapter does for its CHECKs).
  - `complaints_description_check` (len>=5), `complaint_notes_body_check` (trimmed len>=1),
    `compliments_body_check` (len>0) — reject violations.
  - `resolveOpen` only matches currently-open rows (returns null otherwise).
  - `listActiveRecipients` returns only active seeded users, ordered by name.

🗣 In plain English: The Fake is a pretend database that lives in memory for tests. It must
behave like the real one in every way that matters (same rejections, same ordering) so the
service tests are trustworthy.

---

## Wiring (MASTER-KEY singletons ONLY — no per-caller factory this PR)

### `lib/wiring/complaints.ts`

```ts
import { createComplaintsService, type ComplaintsService } from "@/lib/services";
import { supabaseComplaintsRepository } from "@/lib/adapters/supabase";

export const complaintsService: ComplaintsService = createComplaintsService({
  complaints: supabaseComplaintsRepository,
});
```

### `lib/wiring/compliments.ts`

```ts
import { createComplimentsService, type ComplimentsService } from "@/lib/services";
import { supabaseComplimentsRepository } from "@/lib/adapters/supabase";

export const complimentsService: ComplimentsService = createComplimentsService({
  compliments: supabaseComplimentsRepository,
});
```

> Header comment in each wiring file must state: (1) this is the only business-layer file
> allowed to import `@/lib/adapters/*`; (2) MASTER-KEY only — per-caller authenticated
> factory deferred to F-RLS-04f; (3) the rip-out contract; (4) "not yet consumed —
> introduce-only (F-17 PR1)".

🗣 In plain English: This is the wall plate connecting socket to plug, using the
skeleton-key database connection. No per-user security wiring — that's a later PR. And a
note that nothing uses it yet.

---

## TDD test plan

### Unit tests (service against Fake adapter) — write FIRST, red→green

**`tests/unit/services/ComplaintsService.test.ts`** (mirror `CashService.test.ts` harness):
- `makeService(seed?)` helper builds `createComplaintsService({ complaints: createFakeComplaintsRepository(seed) })`.
- `validateCreate`: every branch of the `screen2/sync` `missing[]` cascade with EXACT
  message strings; the `resolved`⇒`resolution_note` required branch; the happy `{ok:true}`.
- `createComplaint`: open complaint persisted with resolution fields null; resolved
  complaint persists all three; returned `customerName` resolved from seed; `duplicate`
  behaviour when same client-supplied id inserted twice.
- `resolveOpen`: open→resolved returns `{id}`; already-resolved / unknown id returns null.
- `findEmailContext`: returns context for a known complaint; null on miss.
- `createNote`: persists + returns `{id, body, createdAt}`; author resolvable.
- `listAllWithNotes` / `listOpen` / `findDetailById`: ordering (newest first), notes
  grouping, join name resolution (`'Unknown'` fallbacks), null on miss.

**`tests/unit/services/ComplimentsService.test.ts`**:
- `validateCreate`: empty/whitespace body → `{ok:false,400,'body required'}`; happy path.
- `createCompliment`: persisted, poster/recipient names resolved from seed, `recipientId`
  null path.
- `listRecent`: newest-first ordering, limit-100 behaviour, join fallbacks.
- `listActiveRecipients`: active-only, name-ordered.

**`tests/unit/wiring/complaintsService.test.ts`** + **`tests/unit/wiring/complimentsService.test.ts`**
(mirror `tests/unit/wiring/cashService.test.ts`):
- Importing the wiring module produces a defined service singleton with all expected methods
  (smoke that the composition root wires without throwing).

> These run with the existing `npm run test:unit` / vitest. No DB needed.

### Integration tests (Supabase adapter against local DB) — DEFERRED to PR2 (documented)

Follow the **Cash precedent exactly**: Cash PR1 had NO per-adapter integration test; the
end-to-end byte-identity proof is the route-level `tests/integration/cash.test.ts` written
in PR2. F-17 PR1 mirrors that: the wire-shape integration suite
(`tests/integration/complaints.test.ts` / `compliments.test.ts`) is written in **PR2**, when
the routes actually call the services and there is observable wire output to assert against.

🗣 In plain English: For an introduce-only PR, the meaningful tests are the unit tests that
prove the lifted logic matches the routes. The full database round-trip tests come in PR2
when the routes actually use the new code — and that's exactly what the Cash feature did.
Writing them now would test code nothing calls yet.

> If the implementer or Guard wants belt-and-braces DB coverage in PR1, an OPTIONAL
> `tests/integration/adapters/supabase/ComplaintsRepository.test.ts` (mirroring
> `UsersRepository.test.ts`) may be added, but it is NOT required for the gate and is not
> the Cash precedent.

---

## Atomic commit breakdown

1. `feat(complaints): domain types + Compliment domain types + barrel`
   — `lib/domain/Complaint.ts`, `lib/domain/Compliment.ts`, `lib/domain/index.ts`.
2. `feat(complaints): ComplaintsRepository + ComplimentsRepository ports + barrel`
   — the two `lib/ports/*.ts` + `lib/ports/index.ts`.
3. `feat(complaints): Complaints + Compliments services (factories) + barrel`
   — the two `lib/services/*.ts` + `lib/services/index.ts`.
4. `feat(complaints): supabase adapters + barrel`
   — the two `lib/adapters/supabase/*.ts` + `lib/adapters/supabase/index.ts`.
5. `feat(complaints): fake adapters + barrel`
   — the two `lib/adapters/fake/*.ts` + `lib/adapters/fake/index.ts`.
6. `test(complaints): service unit tests against fakes + wiring smoke`
   — the four `tests/unit/**` files.
7. `feat(complaints): master-key wiring singletons (introduce-only)`
   — `lib/wiring/complaints.ts`, `lib/wiring/compliments.ts`.

> Order matters: inner layers (domain → ports → services) before adapters before wiring, so
> each commit type-checks on its own. 🗣 Build the socket before the plug before the wall plate.

---

## Acceptance criteria (hard guardrails — implementer checklist)

- [ ] **No route file edited.** `git diff --stat` shows ZERO files under `app/api/`.
- [ ] **No migration.** ZERO new files under `supabase/migrations/`.
- [ ] **No email-helper change.** `lib/complaint-email.ts` + `lib/compliment-email.ts`
      unchanged in the diff.
- [ ] **No RLS / per-caller client.** Neither wiring file imports
      `authenticatedClientForCaller` / `dbTokenMinter`; no `*ForCaller` export exists.
- [ ] Services export **factories only** — no `export const xService` inside `lib/services/**`.
      (Pinned by `tests/unit/lint/no-adapter-imports.test.ts` + the singleton lint rule.)
- [ ] Vendor SDK `@supabase/*` imported **only** inside the two `lib/adapters/supabase/*.ts`
      files. `lib/domain/**`, `lib/ports/**`, `lib/services/**` have zero vendor/framework imports.
- [ ] `lib/domain/**` and `lib/ports/**` do NOT import from `lib/adapters/**`.
- [ ] Domain `category` carries the RAW enum value; the `replace(/_/g,' ')` display transform
      is NOT in the domain/adapter (stays for PR2's route).
- [ ] `createComplaint` returns `customerName` (Decision 1); audit_log write is NOT in the
      Complaints port/service (Decision 2).
- [ ] All select column lists copied verbatim from the corresponding route.
- [ ] Both Fake adapters enforce the DB CHECK constraints (resolution check, len checks).
- [ ] `npm run lint`, `npm run typecheck`, `npm run test:unit` all green.
- [ ] App behaves byte-identically (nothing consumes the new code — verifiable by the
      empty `app/api/` diff).

🗣 In plain English: This is the tick-box list. The single most important proof is that the
`app/api/` folder has zero changes — that's what guarantees the app's behaviour is untouched.

---

## Hexagonal self-check

- **Ports added:** `lib/ports/ComplaintsRepository.ts`, `lib/ports/ComplimentsRepository.ts`
  (correct location — `lib/ports/`).
- **Adapters added:** `lib/adapters/supabase/{Complaints,Compliments}Repository.ts` (real
  vendor) + `lib/adapters/fake/{Complaints,Compliments}Repository.ts` (test twin) — correct
  location, vendor SDK confined to the supabase files.
- **New dependencies (`package.json`):** **NONE.** No new packages. ✅
- **Single-use vendor libraries:** none introduced.
- **Rip-out test:** "If I replace Supabase for Complaints/Compliments tomorrow, how many
  files change?" → ONE new adapter folder (`lib/adapters/<vendor>/{Complaints,Compliments}Repository.ts`)
  + the relevant wiring line in `lib/wiring/{complaints,compliments}.ts`. Domain, ports, and
  services are untouched. **Rip-out = PASS.**

🗣 In plain English: Sockets and plugs are in the right places, no new vendor packages, and
swapping the database later would touch just one new plug + one wiring line per feature.
That's the clean Lego result the project demands.

---

## Risk Assessment

### Concurrency / race conditions
- **Severity: LOW.** Introduce-only — nothing runs the new code in production. The only
  behavioural subtlety is `resolveOpen` (the `status=eq.open` guard makes resolve idempotent
  / safe under double-submit) and `createComplaint` duplicate handling (23505 → `duplicate:true`).
  Both are faithfully copied, not invented, and only become live in PR2.
  **Mitigation:** unit tests assert resolve-already-resolved → null and duplicate-id → duplicate.
  **Must-fix: NO.**

### Security
- **Severity: LOW (with one watch-item).** This PR deliberately keeps the MASTER-KEY
  (service-role, RLS-bypassing) behaviour — identical to today. It does NOT widen exposure.
  Watch-item: the wiring files must NOT accidentally introduce a `*ForCaller` factory or
  import the authenticated client (that would pre-empt F-RLS-04f and is out of scope).
  **Mitigation:** acceptance checklist explicitly forbids it; Guard greps the diff.
  **Must-fix: NO** (it's a scope guard, already covered by the checklist).

### Data migration
- **Severity: NONE.** No schema change, no migration, no data touched. The adapters READ/WRITE
  the same columns the routes already do.
  **Must-fix: NO.**

### Business-logic flaws (byte-identity drift)
- **Severity: MEDIUM — the real risk of this PR.** The entire value is byte-identical
  behaviour. Drift risks:
  (a) the `category.replace(/_/g,' ')` display transform accidentally moving into the
      domain/adapter (it must stay in the route);
  (b) the `complaints_resolution_check` payload built wrong (resolve must set all three
      fields; open must leave them null);
  (c) the `screen2/sync` 23505→200-duplicate behaviour modelled as a thrown error instead
      of `duplicate:true`;
  (d) select column lists diverging from the routes (changes the wire shape PR2 emits).
  **Mitigation:** verbatim select strings (documented per-method above); unit tests cover the
  resolution-check and duplicate branches; the category-transform exclusion is an explicit
  checklist item; PR2's integration suite is the final byte-identity proof.
  **Must-fix: NO** for the PR to ship (it's introduce-only and consumes nothing), but these
  are the items Guard/code-critic must scrutinise hardest because a latent error here surfaces
  in PR2.

### Launch blockers
- **Severity: NONE.** Introduce-only; cannot affect the running app (empty `app/api/` diff).
  No env var, no infra, no migration, no flag.
  **Must-fix: NO.**

### Risk headline
**No must-fix risks. No Gate 2 blockers.** The one risk to actively manage is byte-identity
drift (MEDIUM, business-logic), mitigated by verbatim selects + unit coverage + the explicit
checklist; it does not block this PR because nothing consumes the code until PR2, where the
integration suite catches any residual drift.

🗣 In plain English: This PR is about as safe as a code change gets — nothing live uses it, no
database change, no security change. The one thing to be careful about is copying the existing
behaviour EXACTLY (especially the resolved-complaint rules and the column lists), because a
mistake there would bite in the next PR. Nothing here blocks the gate.
