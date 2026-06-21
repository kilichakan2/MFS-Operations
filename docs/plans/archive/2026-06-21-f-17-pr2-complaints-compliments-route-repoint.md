# F-17 PR2 — Re-point the 8 complaint/compliment routes onto the owned services

**Date:** 2026-06-21
**Unit:** F-17 PR2 (second PR of F-17; PR1 = `98cb48c`, introduce-only)
**Type:** production route re-point (full FORGE + ANVIL) — no migration expected
**Author:** forge-planner

---

## 1. Summary + the byte-identity invariant

Re-point eight live API routes so their data plumbing runs **Route → Service → Port → Adapter** instead of the routes talking to Supabase directly (two routes use the `@supabase/supabase-js` client; six use raw `fetch` to the Supabase REST URL). PR1 already built the owned layer (domain types, ports, Supabase + Fake adapters, services, wiring); **no route consumes it yet** — PR2 wires it in.

🗣 PR1 built the new plumbing behind the wall and left it capped. PR2 connects the taps to it. Water comes out of the same taps, same pressure — the customer (the front-end) sees no difference.

**THE HARD INVARIANT — byte-identical wire output.** Every route must emit the **exact same JSON key SET, in the exact same key ORDER, with the exact same HTTP status codes** as it does today. The front-end screens (`app/complaints/page.tsx`, `app/compliments/page.tsx`) are NOT being changed, so any drift in a key name, key order, or status code is a regression.

🗣 The screens read specific JSON field names in a specific order. If we rename or reorder even one field, a screen silently shows blank or breaks. So the wire shape is frozen; we only change what's behind it. `NextResponse.json(...)` serialises object keys in the order you insert them, so insertion order in the translator IS the wire order — that's why this is mechanical and testable.

**Precedent to mirror exactly:** F-16 PR2 cash re-point. `lib/api/cash/dto.ts` (one `to*WireDto()` translator per wire shape, camelCase domain → exact wire keys/order, JSDoc noting key-order is load-bearing) and `tests/integration/cash.test.ts` (asserts `Object.keys(x).toEqual([...])` for exact set + order, plus status codes). PR2 builds the same shape for complaints + compliments.

---

## 2. Files changed

**TWO new translator files (domain types only — no vendor, no adapter imports):**

| File | Purpose |
|---|---|
| `lib/api/complaints/dto.ts` | camelCase domain → the camelCase complaint wire shapes |
| `lib/api/compliments/dto.ts` | camelCase domain → the **snake_case** compliment wire shapes |

**EIGHT routes re-pointed** (drop direct `@supabase/*` SDK import or raw REST `fetch` for the **data** read/write; route keeps its auth check, JSON parse, UUID regex, category/received_via prettify, email call, and the audit_log write — see §7 for the audit_log carve-out):

| # | Route | Method | Service call(s) | Wire shape (keys, order) | Status |
|---|---|---|---|---|---|
| 1 | `app/api/compliments/route.ts` | GET | `complimentsService.listRecent()` | `{ compliments: [ {id, body, created_at, posted_by_id, posted_by_name, recipient_id, recipient_name} ] }` (**snake_case**) | 200 |
| 1 | `app/api/compliments/route.ts` | POST | `complimentsService.validateCreate(...)` → `createCompliment(...)` | `{ compliment: {id, body, created_at, posted_by_id, posted_by_name, recipient_id, recipient_name} }` (**snake_case**) | 201 |
| 2 | `app/api/compliments/users/route.ts` | GET | `complimentsService.listActiveRecipients()` | `{ users: [ {id, name, role} ] }` | 200 |
| 3 | `app/api/screen2/all/route.ts` | GET | `complaintsService.listAllWithNotes()` | **bare array** `[ {id, createdAt, category, description, status, resolutionNote, resolvedAt, customer, loggedBy, resolvedBy, notes:[{id, body, author, createdAt}]} ]` (**camelCase**) | 200 |
| 4 | `app/api/screen2/open/route.ts` | GET | `complaintsService.listOpen()` | **bare array** `[ {id, createdAt, category, description, customer, loggedBy} ]` (**camelCase**) | 200 |
| 5 | `app/api/screen2/sync/route.ts` | POST | `complaintsService.validateCreate(...)` → `createComplaint(...)` | success `{ id }` 201; **duplicate `{ id, duplicate: true }` 200** (W1) | 201 / 200 |
| 6 | `app/api/screen2/resolve/route.ts` | POST | `complaintsService.validateResolve(...)` → `resolveOpen(...)` (+ `findEmailContext` for email) | `{ id }` 200; not-found `{ error: 'Complaint not found or already resolved' }` 404 | 200 / 404 |
| 7 | `app/api/screen2/note/route.ts` | POST | `complaintsService.validateNote(...)` → `findEmailContext(...)` (existence + email ctx) → `createNote(...)` | `{ id, body, author, createdAt }` (**camelCase**) | 201 |
| 8 | `app/api/detail/complaint/route.ts` | GET | `complaintsService.findDetailById(id)` | `{ id, createdAt, category, description, receivedVia, status, resolutionNote, resolvedAt, customer, loggedBy, resolvedBy }` (**camelCase**) | 200; not-found 404 |

> **VERIFIED on disk — routes 3 & 4 emit a BARE ARRAY**, not a `{complaints:[...]}` wrapper. `screen2/all` ends with `return NextResponse.json(result)` (line 107) and `screen2/open` with `return NextResponse.json(complaints)` (line 56). The translator output for these two is the array, and the route returns it directly. Do NOT wrap.
🗣 Two of the GET routes hand back a plain list, not a labelled box with a list inside. Mirror that exactly or the screen's `.map()` breaks.

**ONE backlog line appended:** `docs/plans/BACKLOG.md` — add **F-TD-32** (verified free; highest existing is F-TD-31). See §8.

---

## 3. The dto.ts translator design

Mirror `lib/api/cash/dto.ts`: pure functions, no I/O, one `to*WireDto()` per wire shape, JSDoc on each noting "key ORDER is load-bearing — `NextResponse.json` preserves insertion order." Import domain types from `@/lib/domain` only.

### `lib/api/compliments/dto.ts` — **snake_case** (the only snake_case domain in PR2)

Domain `Compliment` is camelCase (`postedById`, `postedByName`, `recipientId`, `recipientName`, `createdAt`); the wire is snake_case. Each translator maps camelCase → snake_case in the route's current literal order.

- `toComplimentWireDto(c: Compliment)` → `{ id, body, created_at, posted_by_id, posted_by_name, recipient_id, recipient_name }`
  - Mapping: `created_at: c.createdAt`, `posted_by_id: c.postedById`, `posted_by_name: c.postedByName`, `recipient_id: c.recipientId`, `recipient_name: c.recipientName`. (`id`, `body` pass through.)
  - **Defaults are already baked into the domain by the adapter** (verified `lib/adapters/supabase/ComplimentsRepository.ts`): `postedByName` defaults to `'Unknown'`, `recipientName` to `null`. The route literal today applies the same `?? 'Unknown'` / `?? null`. So the translator does a straight field copy — do NOT re-apply defaults (would double-handle; the adapter owns them). **VERIFY in unit test** that adapter output already carries `'Unknown'`/`null` so the wire matches the route's old `?? 'Unknown'`/`?? null`.
- Used by BOTH GET (mapped over the array → `{ compliments: [...] }`) and POST (single → `{ compliment: {...} }`). One translator, two wrappers — the keys/order are identical between GET and POST (confirmed: route.ts lines 37–45 vs 92–100 are the same object literal).
- `toRecipientWireDto(r: ComplimentRecipient)` → `{ id, name, role }` (straight pass-through; `ComplimentRecipient` is already `{id, name, role}`). Used by `compliments/users` GET → `{ users: [...] }`.

🗣 The compliments screen was built reading database-style field names (`posted_by_name`), but the new domain uses code-style names (`postedByName`). This file is the dictionary that translates one to the other in the exact order the screen expects.

### `lib/api/complaints/dto.ts` — **camelCase**

The complaint routes already emit camelCase, so these translators map camelCase domain → camelCase wire (mostly a structural reshape + dropping fields the wire never had, e.g. `loggedById`, `receivedVia` for the list shapes).

- `toComplaintListItemWireDto(c: Complaint)` → `{ id, createdAt, category, description, status, resolutionNote, resolvedAt, customer, loggedBy, resolvedBy, notes }` where `notes` is `c.notes.map(toNoteWireDto)`. (Maps `customer: c.customerName`, `loggedBy: c.loggedByName`, `resolvedBy: c.resolvedByName`.) **`category` is emitted RAW here** — the route applies `.replace(/_/g,' ')` at the edge (see §5, G1 sibling). Used by `screen2/all`.
- `toOpenComplaintWireDto(c: Complaint)` → `{ id, createdAt, category, description, customer, loggedBy }` (RAW category; route prettifies at edge). Used by `screen2/open`.
- `toNoteWireDto(n: ComplaintNote)` → `{ id, body, author, createdAt }` (`author: n.authorName`). Used inside `screen2/all` items AND by `screen2/note` POST.
- `toComplaintDetailWireDto(d: ComplaintDetail)` → `{ id, createdAt, category, description, receivedVia, status, resolutionNote, resolvedAt, customer, loggedBy, resolvedBy }` — **`category` AND `receivedVia` emitted RAW**; route prettifies BOTH at the edge (§5, G1). (`customer: d.customerName`, `loggedBy: d.loggedByName`, `resolvedBy: d.resolvedByName`.)

> **DESIGN DECISION — where does the underscore→space prettify live?** Two valid options:
> (a) translator emits RAW, route does `.replace(/_/g,' ')` on the returned DTO field before responding; or
> (b) translator takes the prettify as the caller's job and the route maps it.
> **Choose (a): translator emits RAW, route prettifies at the edge.** This matches the PR1 design note baked into `lib/domain/Complaint.ts` (lines 10–13) and `ComplaintsService.ts` (lines 18–21): *"the `category.replace(/_/g,' ')` display transform stays in the route (PR2); the domain carries the raw enum."* The DTO is a pure structural translator; the presentation transform is a route concern. This keeps the DTO unit-testable against raw enum values and keeps the G1 carry-forward explicit in the route diff.
🗣 The database stores `missing_item`; the screen shows `missing item`. That cosmetic swap stays in the route (the "edge"), not in the translator, because PR1 already decided the domain carries the raw value. The translator just reshapes; the route does the final polish.

---

## 4. W1 — the duplicate-replay 200 path (LOAD-BEARING)

**Why it matters:** the till's offline queue retries a failed POST **forever**. If a replayed complaint insert returns 500 instead of 200, the till hammers the endpoint indefinitely. Today `screen2/sync` detects the duplicate from the raw REST response (`httpStatus === 409 || text.includes('23505')`, line 90) and returns `{ id, duplicate: true }` 200 (line 92). PR2 must preserve this through the new adapter path.

**Current adapter behaviour (VERIFIED `lib/adapters/supabase/ComplaintsRepository.ts` lines 301–322):** `createComplaint` inserts via the supabase-js client; on error it checks `(error as {code?:string}).code === '23505'` and, if matched, returns `CreatedComplaint { id: input.id ?? '', customerName, duplicate: true }` — it does NOT throw. Any other error throws `ServiceError`. On success returns `{ id: recordId, customerName, duplicate: false }`.

**The re-point (route side):**
1. Build `CreateComplaintInput` from the request body + headers (`loggedBy: userId`).
2. `const v = complaintsService.validateCreate(input); if (!v.ok) return 400 { error: v.message }` — preserves the exact `Missing: …` cascade (the service lifted it verbatim; verified `ComplaintsService.ts` lines 85–106).
3. `const created = await complaintsService.createComplaint(input)`.
4. **If `created.duplicate` → return `NextResponse.json({ id: created.id, duplicate: true }, { status: 200 })`.** (`created.id` = `input.id` on the duplicate path — matches today's `{ id, duplicate: true }` where `id` was the client-supplied body id.)
5. Else → audit_log write (see §7) + email via `findEmailContext` or the data in hand + `return NextResponse.json({ id: created.id }, { status: 201 })`.

> **Customer name for email/audit:** today the route does a separate `supaGet('customers', ...)` to get the customer name (line 103). **Drop that read** — `CreatedComplaint.customerName` already carries it (PR1 Decision 1, verified domain + adapter). This removes one raw REST call from the route.
🗣 The new create call hands back the customer's name with the receipt, so the route no longer needs a second trip to the database just to look it up for the email.

**MANDATORY real-DB integration test (the W1 tripwire):**
- Against the **real local Supabase DB** (not the Fake adapter), POST a complaint with an explicit client-supplied `id`. Assert 201 `{ id }`.
- **Replay the identical POST (same `id`).** Assert the second response is **200 `{ id, duplicate: true }`** — NOT 500.
- This proves that a true unique-violation surfaces as `error.code === '23505'` through `supabase-js` (the client path) and that the adapter's catch fires. The old route read the raw REST body text; the new path relies on the typed `error.code`, so this MUST be proven end-to-end on the real DB, not mocked.

> **CONTINGENCY (if the test shows supabase-js does NOT surface `code:'23505'` reliably):** the duplicate path would silently fall through to the `throw ServiceError` → route 500 → infinite till retry. If the integration test fails this way, broaden the adapter's catch in `lib/adapters/supabase/ComplaintsRepository.ts` (createComplaint) to also match the duplicate via `error.message` / `error.details` containing `'23505'` or `'duplicate key'` / `'unique constraint'`, so the duplicate path still fires. This is an **adapter-only** change (stays inside `lib/adapters/supabase/`), preserves the rip-out test, and keeps the 200 contract. Document the broadening with a `// reason:` comment. **This contingency is a known fork in the plan, not a loop-back to Frame** — it changes how the adapter recognises a duplicate, not the route contract or the port.
🗣 If the database driver doesn't reliably tell us "that's a duplicate" via the tidy error code, we widen the net to also catch it from the error text — inside the adapter only. Either way the till gets its 200 and stops retrying.

---

## 5. G1 — preserve BOTH prettifies at the detail route edge

**VERIFIED `app/api/detail/complaint/route.ts`:** the route applies `.replace(/_/g,' ')` to BOTH `category` (line 39) AND `received_via` (line 41). The domain carries RAW values (verified `Complaint.ts` lines 10–13). So the re-pointed route MUST keep BOTH prettifies at the edge after calling `findDetailById`:

```
const d = await complaintsService.findDetailById(id)        // domain, RAW category + receivedVia
if (!d) return NextResponse.json({ error: 'Not found' }, { status: 404 })
const dto = toComplaintDetailWireDto(d)                       // RAW still
return NextResponse.json({
  ...dto,
  category:    dto.category.replace(/_/g, ' '),               // G1 prettify #1
  receivedVia: dto.receivedVia.replace(/_/g, ' '),            // G1 prettify #2
})
```

> **Key-ORDER caution with the spread-override pattern:** `{ ...dto, category: ..., receivedVia: ... }` keeps `dto`'s insertion order because overriding an existing key does NOT move it. The integration test MUST assert `Object.keys(body).toEqual([id, createdAt, category, description, receivedVia, status, resolutionNote, resolvedAt, customer, loggedBy, resolvedBy])` to pin this. If any doubt, build the literal explicitly in the route instead of spreading.
🗣 Spreading the translated object then re-setting two fields keeps the field order intact (JS doesn't move an existing key when you overwrite it). The test locks the order so a future refactor can't silently scramble it.

**Sibling prettifies in the screen2 GET + write routes (preserve all):**
- `screen2/all` (line 91) and `screen2/open` (line 50): `category.replace(/_/g,' ')` at the edge over the mapped list items.
- `screen2/sync` (line 104): `category.replace(/_/g,' ')` into the email payload `label`; and `received_via?.replace(/_/g,' ')` (line 126) into the email `receivedVia`.
- `screen2/resolve` (line 94): `category.replace(/_/g,' ')` into the email payload.
- `screen2/note` (line 90): `category.replace(/_/g,' ')` into the email payload.
- The **detail GET** wire output is the only place a prettify hits the actual HTTP response body; the screen2 GETs prettify the response list; the write-route prettifies are email-only. All carried forward verbatim.

---

## 6. TDD order (red-green per route)

Re-point **read routes first** (lowest risk, no side-effects), then **write routes**, with **sync LAST** (riskiest — W1 duplicate path).

1. **`lib/api/compliments/dto.ts` + unit tests** (red→green): translator key-set + order for `toComplimentWireDto`, `toRecipientWireDto` against domain fixtures.
2. **`lib/api/complaints/dto.ts` + unit tests**: `toComplaintListItemWireDto`, `toOpenComplaintWireDto`, `toNoteWireDto`, `toComplaintDetailWireDto` key-set + order (RAW category/receivedVia).
3. **Re-point reads:** `compliments` GET → `compliments/users` GET → `screen2/all` GET → `screen2/open` GET → `detail/complaint` GET. After each: integration test asserting exact key set/order + status against the local DB.
4. **Re-point writes:** `compliments` POST → `screen2/note` POST → `screen2/resolve` POST.
5. **`screen2/sync` POST LAST** — re-point + the W1 real-DB duplicate-replay test (§4).

Each route: write/extend the integration test FIRST to capture today's exact wire (red against the not-yet-repointed route is the baseline; green after re-point proves byte-identity).

🗣 Do the harmless lookups first, prove each one byte-for-byte identical, then the writes, saving the till-critical one for last when the pattern is well-grooved.

---

## 7. The audit_log carve-out (architecture note — NOT a blocker)

**VERIFIED:** `screen2/sync` (line 107), `screen2/resolve` (line 104), `screen2/note` (line 100) each write to `audit_log` via a **raw `fetch` POST** to the Supabase REST URL. There is **no owned `AuditLog` port/service/adapter** (grep confirms — only Orders-specific `order_audit_log` lives in the hexagonal layer).

**Decision: PR2 leaves the audit_log raw writes AS-IS in the routes.** This is:
- **PR1 Decision 2 (deliberate):** the Complaints port owns the customer-name read but NOT the cross-cutting audit write (verified port JSDoc `ComplaintsRepository.ts` lines 21–23).
- **Already tracked as F-TD-31** (verified in `BACKLOG.md` lines 297–304, deferred 2026-06-23 from F-17 PR1 planning) — part of the audit-trail trio F-TD-27 / F-TD-30 / F-TD-31.
- **NOT a lint-gate breach:** the F-04 lint rule (`tests/unit/lint/no-supabase-sdk.test.ts`) catches only the `@supabase/supabase-js` SDK *import*, NOT raw `fetch` to the REST URL. The screen2 routes use raw `fetch` (no SDK import), so the audit_log writes do not trip the gate today and won't after PR2.
- **In scope-rule terms (CLAUDE.md):** "pre-existing breaches are known debt; only new or touched code in the current diff is held to this standard." The audit_log raw fetch is pre-existing and untouched by PR2's data re-point; PR2 does not add new raw vendor calls.

> **Hexagonal honesty:** after PR2, these three routes will STILL contain raw Supabase REST `fetch` calls — for audit_log only. The DATA reads/writes (the F-17 surface) are fully behind the service. The audit gap is explicitly owned by F-TD-31. This is the same posture as the cash re-point (cash routes have no audit writes at all — verified — so there was nothing to carve out there; complaints differ).
🗣 The routes keep one old-style direct database call: the "who did what" audit log. That's a company-wide concern with its own backlog item (F-TD-31), not part of fixing complaints' data plumbing. We're not making it worse, and the rulebook says don't expand scope to pre-existing debt.

**Email helpers (`lib/complaint-email.ts`, `lib/compliment-email.ts`) — DEFERRED, do NOT re-point.** VERIFIED: both do a USERS-domain read (raw `fetch` to `/rest/v1/users` for staff recipients) + send via the already-owned `mailer` (`@/lib/wiring/mailer`). They do NOT read complaint/compliment data. PR2 leaves them AS-IS.
- Where a re-pointed route needs email context: `screen2/resolve` and `screen2/note` obtain it via `complaintsService.findEmailContext(id)` (port method VERIFIED to exist, returns `ComplaintEmailContext { id, category (RAW), description, status, customerName }` or null). The route maps that to the `ComplaintContext` shape the UNCHANGED `sendComplaintEmail` expects (`{ id, customer, category (PRETTIFIED at edge), description, status, ... }`) — note `category` must be `.replace(/_/g,' ')`-prettified to match today's email (verified resolve line 94 / note line 90).
  - `screen2/sync` already has customer name from `createComplaint`'s return (`CreatedComplaint.customerName`) — no `findEmailContext` needed there; build the email context from the input + the returned name (matches today's behaviour, drops the extra customers read).
  - `screen2/note` ALSO uses `findEmailContext` for the **existence check** (today the route 404s if the complaint isn't found before inserting the note — verified lines 48–58). `findEmailContext` returns null on miss → route returns 404 `{ error: 'Complaint not found' }`. Preserve that ordering: existence check (via findEmailContext) → 404 if null → createNote → email.
- **Backlog F-TD-32 (this plan records it; implementer writes it):** "re-point `complaint-email.ts` / `compliment-email.ts` recipient-fetch onto `usersService` (drop their direct Supabase users read)."

🗣 The email files only look up *who to email* (a users-domain job), not complaint data, so they're out of scope here — logged as F-TD-32 for later. The routes feed them the complaint details either from the create-receipt or from a small read method that already exists.

---

## 8. The BACKLOG step (verbatim content for the implementer)

Append to `docs/plans/BACKLOG.md` (F-TD-32 is free — highest existing is F-TD-31):

```
### F-TD-32 — complaint-email.ts / compliment-email.ts still read users via raw Supabase fetch
- **Deferred:** 2026-06-21 (F-17 PR2 — email helpers left as-is; they read the
  users domain, not complaint/compliment data).
- **What:** `lib/complaint-email.ts` and `lib/compliment-email.ts` fetch their
  staff recipient list with a raw `fetch` POST to `/rest/v1/users` (active,
  non-driver / active). This is a USERS-domain read living outside the owned
  layer — it should go through `usersService` (the Users port shipped F-13).
- **Fix shape:** add a recipient-list read to the Users port/service (e.g.
  `listNotificationRecipients({ includeDrivers })`) + map in the adapter; re-point
  both email helpers onto `usersService`, dropping their direct Supabase users read.
- **Owner unit:** unscheduled. Pairs with any Users-domain follow-up.
```

🗣 One new line in the running to-do index so the email-files' leftover direct database read isn't forgotten.

---

## 9. ANVIL test matrix

**Unit (Fake adapter + pure translators):**
- `lib/api/complaints/dto.ts` + `lib/api/compliments/dto.ts`: each `to*WireDto` — exact key SET + ORDER via `Object.keys(dto).toEqual([...])`, field-value mapping (camelCase→snake_case for compliments), RAW category/receivedVia preserved (NOT prettified) in the complaint DTOs.
- Service interaction via the **Fake adapters** (`lib/adapters/fake/ComplaintsRepository.ts`, `ComplimentsRepository.ts` — VERIFIED present): `validateCreate`/`validateResolve`/`validateNote` cascades return the exact message strings + status; passthroughs call the port once. Duplicate path: Fake `createComplaint` returns `duplicate:true` → service surfaces it.

**Integration (each route end-to-end vs LOCAL DB — mirror `tests/integration/cash.test.ts`):** new file `tests/integration/complaints.test.ts` (+ compliments cases, or a sibling `compliments.test.ts`). For every route:
- exact status code + `Object.keys(body).toEqual([...])` (or, for the bare-array routes, `Object.keys(body[0]).toEqual([...])`) — the byte-identity tripwire.
- **`screen2/sync` duplicate-replay:** POST with explicit `id` → 201; replay same `id` → **200 `{ id, duplicate: true }`** (the W1 real-DB assertion).
- **`detail/complaint` prettify:** seed a complaint with `category='missing_item'`, `received_via='in_person'`; assert response `category === 'missing item'` AND `receivedVia === 'in person'` AND key order intact (the G1 assertion).
- `screen2/resolve` not-found: resolve a non-existent / already-resolved id → 404 `{ error: 'Complaint not found or already resolved' }`.
- `screen2/note` not-found: note on non-existent id → 404 `{ error: 'Complaint not found' }`.
- `compliments` GET/POST snake_case key order; `compliments/users` `{users:[{id,name,role}]}`.
- 401 unauthenticated path preserved on every route (no `x-mfs-user-id`).

**DB / RLS (pgTAP):** no schema change → no new pgTAP. Run the existing suite green as a regression guard.

**E2E `@critical`:** VERIFIED there are currently **NO `@critical`-tagged specs**, and the 7 existing e2e specs cover orders / KDS / pricing / routes / map — **none exercise the complaints or compliments screens**. So there is no existing E2E path that directly covers PR2.
- **Proposal:** run the full existing e2e suite as a non-regression check (proves PR2 didn't break unrelated surfaces), and rely on the integration suite (which DOES hit every PR2 route end-to-end vs the real DB) as the primary byte-identity proof.
- **FLAG (non-blocking):** there is no automated E2E for the complaints/compliments UI. Recommend a manual prod/preview smoke of both screens (log a complaint, resolve it, add a note, post a compliment) at ship time, and consider an `@critical` complaints e2e spec as a future test-debt item. This is the same manual-smoke posture used on prior cutovers.

**Preview smoke (Gate 4):** `npm run test:e2e:preview` against the PR's Vercel preview (the three existing `@critical` paths — none touch complaints, so this is a regression guard, not direct coverage). Pair with the manual complaints/compliments smoke above.

---

## 10. Hexagonal self-check

```
DOMAIN (Complaints + Compliments core logic)
  ├─ ComplaintsRepository (port)  → [Supabase]  (adapter)  + [Fake] (test adapter)
  └─ ComplimentsRepository (port) → [Supabase]  (adapter)  + [Fake] (test adapter)
🗣 PR2 plugs the existing sockets into the live routes — no new socket, no new plug
```

- **Port(s) used (not added):** `ComplaintsRepository`, `ComplimentsRepository` (both shipped PR1). PR2 adds NO port method — every route's need is covered by the existing service surface (VERIFIED method-by-method: listAllWithNotes, listOpen, findDetailById, validateCreate, validateResolve, validateNote, createComplaint, resolveOpen, findEmailContext, createNote / listRecent, validateCreate, createCompliment, listActiveRecipients).
- **Adapter(s):** `lib/adapters/supabase/ComplaintsRepository.ts`, `ComplimentsRepository.ts` (live) + Fake equivalents (tests). The W1 contingency, if triggered, is an adapter-internal broadening — stays inside `lib/adapters/supabase/`.
- **New dependencies:** **NONE.** No `package.json` change. The two new files (`lib/api/*/dto.ts`) import `@/lib/domain` types only.
- **Vendor-import discipline:** after PR2 NO route imports `@supabase/supabase-js` (compliments routes drop it) and the data reads/writes no longer hit the REST URL directly. The audit_log raw `fetch` remains (F-TD-31, §7) — pre-existing, not lint-gated, explicitly out of scope.
- **Rip-out test:** swapping the DB vendor for Complaints/Compliments = one new adapter under `lib/adapters/<vendor>/` + one wiring line in `lib/wiring/complaints.ts` / `compliments.ts`. The routes, services, ports, domain, and the new DTO files are untouched. **RESULT: PASS.**
  - *Caveat (honest):* the audit_log raw `fetch` in the three write routes would NOT follow a DB-vendor swap (it'd still point at Supabase REST). That is the F-TD-31 gap, pre-existing and tracked — it does not regress in PR2 and is excluded from the rip-out scope by the known-debt rule. The F-17 *data* surface passes cleanly.

---

## 11. Rollback

**Revert-only.** No migration, no schema change, no data change. If a regression appears post-merge, `git revert` the PR commit; the routes return to talking to Supabase directly. The PR1 owned layer remains (unconsumed again, as it was between PR1 and PR2) — safe to leave in place.

🗣 Nothing in the database changes, so undoing PR2 is a clean code revert — no cleanup, no data to fix.

---

## 12. Risk Assessment

**Headline:** No **must-fix** Gate-2 blockers. One load-bearing correctness risk (W1) fully mitigated by a mandatory real-DB test + a pre-planned adapter contingency. Primary risk class is wire-shape drift, mitigated by exact key-set+order integration assertions mirroring the proven cash precedent.

| # | Risk | Category | Severity | Mitigation | Must-fix? |
|---|---|---|---|---|---|
| R1 | Duplicate-replay returns 500 → till offline queue retries forever | Business-logic / launch | **High** | W1 real-DB duplicate test (§4) + adapter-broadening contingency. Adapter already returns `duplicate:true` on `code==='23505'`. | No (mitigated; test is mandatory) |
| R2 | Wire key SET/ORDER drift → front-end screen silently breaks | Business-logic | High | Per-route `Object.keys().toEqual([...])` + status assertions (cash precedent). Bare-array shape for screen2/all & open explicitly noted. | No (test-enforced) |
| R3 | Detail route loses a prettify (G1) → screen shows `missing_item`/`in_person` | Business-logic | Medium | §5 keeps BOTH `.replace` at edge; integration test asserts prettified values + key order. | No |
| R4 | Compliment defaults double-applied or dropped (`'Unknown'`/`null`) | Business-logic | Medium | Adapter owns defaults; translator is straight copy; unit test asserts adapter output carries `'Unknown'`/`null`. | No |
| R5 | screen2/note loses its pre-insert existence 404 → note on a ghost complaint | Business-logic | Medium | §7 preserves `findEmailContext`→null→404 BEFORE `createNote`. | No |
| R6 | resolve loses the not-found 404 (resolveOpen→null) | Business-logic | Medium | `resolveOpen` returns null on no-open-row (VERIFIED adapter lines 346–348); route maps null→404. | No |
| R7 | Concurrency: two tills replay the same complaint id simultaneously | Concurrency | Low | The DB unique constraint + 23505→duplicate:true path makes the second a clean 200 regardless of interleaving; no read-modify-write race introduced. | No |
| R8 | Security: route stops enforcing auth after re-point | Security | Low | Re-point touches only the data call; the `x-mfs-user-id` 401 check stays at the top of every route (preserve verbatim). Integration test asserts 401 path. | No |
| R9 | Data migration | Data migration | None | No migration. **STOP condition** if one is found (§13). | No |
| R10 | Hexagonal regression: a route adds a NEW raw vendor call | Architecture | Low | §7 carve-out is explicit; PR2 removes raw data calls and adds none. code-critic reviews the diff. | No |

**No material concurrency, security, or data-migration risks beyond the above.** The audit_log gap (F-TD-31) is pre-existing tracked debt, not introduced or worsened by PR2.

---

## 13. STOP conditions (loop back to the conductor / Frame)

1. **A migration turns out to be needed** — no schema change is expected; if the re-point reveals one, STOP and flag (changes the gate path: needs migration review + prod-first apply).
2. **A route needs a shape the service does NOT expose** — none found in recon, but if implementation hits one, STOP (do NOT invent a port method; that is a loop-back to Frame).
3. **W1 contingency fires AND broadening the adapter still can't reliably catch the duplicate** — STOP (the 200 contract can't be honoured; needs a Frame decision on the duplicate-detection strategy).
4. **Byte-identity can't be achieved for a wire shape** (e.g. a domain field genuinely missing that the old wire carried) — STOP and flag the specific field.

---

## Appendix A — domain term plain-English bridge

- **DTO translator** 🗣 a small dictionary function that rewrites the app's internal field names into the exact field names the screen expects — nothing else.
- **Byte-identical wire output** 🗣 the JSON the screen receives is character-for-character the same shape as before; only the code producing it changed.
- **Port / adapter** 🗣 the port is the socket the app's logic defines; the adapter is the Supabase-shaped plug. PR2 plugs existing sockets into the routes — no new sockets.
- **Rip-out test** 🗣 "if we swap the database tomorrow, how many files change?" — answer for the F-17 data surface: one adapter + one wiring line. PASS.
- **F-TD-31 / F-TD-32** 🗣 backlog tickets: the audit-log direct-database write (31) and the email files' direct users read (32) — both deliberately left for later, recorded so they're not forgotten.
