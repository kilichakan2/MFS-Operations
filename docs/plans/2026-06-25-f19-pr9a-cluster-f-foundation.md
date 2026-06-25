# F-19 Cluster F — PR9a (foundation only): HACCP "docs & lookups" hexagon

- **Date:** 2026-06-25
- **Feature:** F-19 Cluster F, PR9a of the two-step rhythm (PR9a = introduce-only foundation; PR9b = re-point, planned separately later)
- **Phase:** FORGE Order → plan for Render
- **Branch suggestion:** `f19-pr9a-cluster-f-foundation`

> 🗣 **In plain English:** Eight HACCP admin/lookup screens (the SOP handbook reader, the search box, the document-control register, the "who can I pick" user list, the customer list, the label-code lookup, the recall/withdrawal contact list, and the supplier-management admin page) each currently reach straight into the database from inside the screen's API handler. This PR builds the clean "sockets and plugs" those screens will plug into later — it does **not** move the screens yet, and touches **no** database migration. PR9b (a separate later PR) flips the screens over.

---

## Mini-map

```
DOMAIN (HACCP docs & lookups core logic)
  ├─ HaccpHandbookRepository  (port) → [Supabase] · [Fake]   handbook + search + documents
  ├─ HaccpSuppliersRepository (port) → [Supabase] · [Fake]   supplier-code + recall + admin/suppliers
  └─ HaccpLookupsRepository   (port) → [Supabase] · [Fake]   users + customers selectors
🗣 Three sockets, grouped by what they read: the SOP/doc library, the supplier book, and the two pick-lists. PR9a builds sockets+plugs; PR9b moves the 8 screens onto them.
```

---

## Goal

Introduce the hexagonal foundation for the 8 HACCP "docs & lookups" routes **without editing any route and without any DB migration**. After PR9a, the new ports/adapters/services/wiring exist and are fully unit-tested, but have **zero callers** — exactly like every prior cluster's first PR (PR1/PR3/PR5/PR7).

Each service must reproduce its route's **current response shape byte-for-byte** so PR9b becomes a pure re-point with no behaviour change. The unit tests written here are the safety net PR9b leans on.

> 🗣 **In plain English:** Build the new plumbing, prove with tests that it produces the exact same output the screens already return, but don't connect the screens to it yet. That keeps the risky "flip the switch" step (PR9b) small and provably safe.

---

## Domain terms (plain-English glossary for this plan)

- **Port** (`lib/ports/`) — a socket the app owns, described in business words, no vendor mentioned. 🗣 The shape the business insists on; vendors must fit it.
- **Adapter** (`lib/adapters/<vendor>/`) — the plug for one specific vendor; the only place that vendor's SDK is imported. 🗣 The actual plug; Supabase gets one, the fake gets one.
- **Service** (`lib/services/`) — business logic that depends on ports only, never on a vendor. 🗣 The brain; it knows the rules but not where data lives.
- **Wiring** (`lib/wiring/haccp.ts`) — the one business-layer file allowed to import adapters; it bolts plugs into sockets and exports ready-to-use singletons. 🗣 The fuse box.
- **Selector / pick-list** — a read-only list of options (users, customers) a form drop-down shows. 🗣 The choices in a drop-down, nothing more.
- **Soft delete / `active` flag** — rows are never physically removed; an `active=false` flag hides them. 🗣 We cross things out, we don't shred them — so an auditor can still see history.

---

## Compliance flags

- **HACCP food-safety records** — this is a UK food-safety compliance domain (SALSA audit). The **recall/withdrawal contact list** (SALSA 3.4) and the **supplier approval register** (FSA approval numbers, cert expiry) are auditor-facing. A wrong label, dropped field, or mis-mapped supplier is a compliance-integrity defect, not cosmetic. The byte-identical requirement is therefore a **safety** requirement.
- **PII** — supplier contact names/phones/emails and `users.name` flow through these reads/writes. PR9a introduces no new exposure (no route changes); the new code must not read or write columns beyond what each route already touches.
- **Write surfaces** — unlike Cluster E (read-only), Cluster F includes **writes**: recall config save (POST), supplier-contact update (PATCH), supplier create (POST), supplier update (PATCH). These must reproduce the routes' exact insert/update payloads, defaults, and trims. See Risk B-block.

---

## ADR review & conflicts

Read: ADR-0002 (hexagonal shape & naming), ADR-0003 (strangler-fig + FREEZE rule), ADR-0004 (RLS vs service-role).

- **ADR-0002** — honoured. New ports in `lib/ports/`, adapters in `lib/adapters/<vendor>/`, services depend on ports only, wiring is the sole adapter-importer. Vendor types (`SupabaseClient`, `PostgrestError`) never leak past the adapter boundary; snake_case→domain mapping lives inside each adapter.
- **ADR-0002 depth rule** — each port method is a **business operation** (`listActiveCustomers()`, `getRecallContactList()`, `saveRecallConfig(...)`, `createSupplier(...)`), not a renamed `select()`. Each hides a projection, a filter set, a join, an ordering, a default-assignment, or a trim/map. No shallow 1:1 vendor mirrors.
- **ADR-0003 (FREEZE)** — honoured. `@supabase/supabase-js` stays confined to `lib/adapters/supabase/`. **No new vendor library is introduced** (unlike PR7's `xlsx`), so **no `.eslintrc.json` change is required** — Supabase is already banned outside its adapter folder and the adapter folder is already on the allow-list. Verified against `.eslintrc.json` lines 9–10, 70, 92–93.
- **ADR-0004 (RLS vs service-role)** — honoured. **Service-role ONLY.** No `…ForCaller(userId)` per-request authenticated factory is added — deferred to F-RLS-04h / Cluster G, exactly as every prior cluster deferred it. Wiring singletons use `supabaseService`, matching the access the 8 routes have today, so PR9b is byte-identical.

**No ADR conflicts. No ADR-adjacent housekeeping required** (PR7 needed the `xlsx` ban + allow-list; PR9a needs nothing because it adds no new vendor).

> 🗣 **In plain English:** The rulebook says "only the adapter folder may touch a vendor library." We add no new library, so there's nothing new to ban or permit — unlike the Excel PR, this one needs zero rulebook edits.

---

## KEY DECOMPOSITION DECISION (locked)

### The question
Surfaces 6 (supplier-code), 7 (recall), 8 (admin/suppliers) all touch `haccp_suppliers` (recall also touches `haccp_recall_config`). Do they share one consolidated port/service or stay separate? And what about the 5 others?

### The decision: **THREE ports / THREE services**, grouped by the data they own.

| # | Port | Service | Surfaces it backs | Tables |
|---|------|---------|-------------------|--------|
| 1 | `HaccpHandbookRepository` | `HaccpHandbookService` | handbook, search, documents | `haccp_sop_content`, `haccp_documents`, RPC `haccp_search` |
| 2 | `HaccpSuppliersRepository` | `HaccpSuppliersService` | supplier-code, recall, admin/suppliers | `haccp_suppliers`, `haccp_recall_config` |
| 3 | `HaccpLookupsRepository` | `HaccpLookupsService` | users, customers | `users` (HACCP selector), `customers` |

### Why CONSOLIDATE supplier-code + recall + admin/suppliers into ONE suppliers port (the spec's headline question)
All three are **the same bounded sub-domain: "the supplier book"**. supplier-code reads one supplier's `label_code`; recall reads active suppliers' contact info + writes one supplier's contacts + reads/writes recall config; admin/suppliers does full supplier CRUD. These are not three coincidental table-sharers — they are three views/operations on **one owned entity** (`Supplier`) plus its directly-attached `RecallConfig` (the recall route reads them together in one `Promise.all`, so they co-locate naturally).

Splitting them would create **three adapters all importing the same table** and three places to change when the supplier shape moves — the exact rip-out tax ADR-0002 forbids. One deep `HaccpSuppliersRepository` with distinct business methods (`findLabelCode`, `listActiveWithContacts`, `getRecallConfig`, `saveRecallConfig`, `updateSupplierContacts`, `listAllSuppliers`, `createSupplier`, `updateSupplier`) keeps the supplier book behind one socket. `haccp_recall_config` rides along because the recall **route** already binds it to suppliers in one response — it is the recall view's other half, not a separate domain. 🗣 One book, one librarian — not three librarians fighting over the same shelf.

### Why GROUP handbook + search + documents into ONE handbook port
handbook (`haccp_sop_content`) and search (RPC `haccp_search`, which searches `haccp_sop_content`) are the **same table via two access paths** — a list-by-section and a full-text search over the same SOP content. documents (`haccp_documents`) is the document-control register — closely adjacent ("the SOP library + its index"). All three are **read-only reference content** with no writes and no overlap with suppliers or selectors. One `HaccpHandbookRepository` with `listSopContent`, `searchSop`, `listDocuments`. 🗣 The handbook and its search box read the same pages; the document register is the library's index card. One reading-room socket.

### Why GROUP users + customers into ONE lookups port (and NOT reuse F-13 UsersService or the Orders CustomersRepository)
Both are tiny **read-only selectors** for HACCP forms — "give me the active names to put in a drop-down." Grouping them under one `HaccpLookupsRepository` avoids two near-empty ports.

- **Do NOT reuse F-13's `UsersService`** — that is the **auth bounded context** (credentials, lockout, login). This `users` read is a HACCP-form selector (`id, name, role` filtered to 3 roles, admins-first sort). Coupling a food-safety drop-down to the auth domain would entangle two contexts and break the depth rule. The HACCP selector owns its own narrow read.
- **Do NOT reuse the Orders `CustomersRepository`** — INVESTIGATED: that port is **NOT an unused stub** (the spec's premise is wrong). It is **actively wired into Orders** (`lib/wiring/orders.ts:54,105,119`) with live Supabase + Fake adapters, and its only method is `findCustomerById(id): Customer | null` — a lookup-by-id, explicitly scoped "Orders-only, read-by-id" in its own JSDoc. HACCP needs `listActive(): {id,name}[]` — a different operation. Adopting it would force adding a `listActive` method to a port the **Orders** domain owns, creating cross-domain coupling exactly when F-20 Admin is slated to own the full Customers CRUD. **Decision: leave `lib/ports/CustomersRepository.ts` untouched; HACCP reads customers through its own `HaccpLookupsRepository.listActiveCustomers()`.** Flagged in Risks (D1) and to the conductor. 🗣 The Orders customer-card is a different tool from the HACCP drop-down; sharing one would tie two unrelated screens together. Leave Orders' tool alone.

### Why not ONE mega "Cluster F" port
A single `HaccpDocsAndLookupsRepository` would mix reference content, the supplier write-book, and selectors behind one fat socket — three unrelated change-reasons in one file, the opposite of cohesion. Three cohesive ports each pass the deletion test independently. 🗣 Three tidy boxes beat one junk drawer.

### Adapter does I/O + mapping; service does shaping
Adapters run the `.select()`/`.insert()`/`.update()`/`.rpc()` and map snake_case rows → domain types at the return boundary. Services hold the route's pure logic: handbook's section-vs-doc branch, supplier-code's `slice(0,4).toUpperCase()` fallback, admin/suppliers' field-whitelist + `label_code` `slice(0,6)` normalisation + next-position assignment, recall's payload assembly, users' admins-first sort. 🗣 The plug fetches and translates; the brain decides the rules.

---

## Files to change (exact paths)

**New source files (15):**

*Domain (3):*
1. `lib/domain/HaccpHandbook.ts` — `SopContentEntry`, `HandbookResult`, `SearchResult`, `HaccpDocument` + the `…Response` shapes.
2. `lib/domain/HaccpSuppliers.ts` — `Supplier`, `SupplierContact`, `SupplierWithContact`, `RecallConfig`, `RecallContactList`, the create/update input types + the route `…Response` shapes.
3. `lib/domain/HaccpLookups.ts` — `HaccpUserOption`, `HaccpCustomerOption` + their `…Response` shapes.

*Ports (3):*
4. `lib/ports/HaccpHandbookRepository.ts`
5. `lib/ports/HaccpSuppliersRepository.ts`
6. `lib/ports/HaccpLookupsRepository.ts`

*Services (3, factories only):*
7. `lib/services/HaccpHandbookService.ts`
8. `lib/services/HaccpSuppliersService.ts`
9. `lib/services/HaccpLookupsService.ts`

*Supabase adapters (3):*
10. `lib/adapters/supabase/HaccpHandbookRepository.ts` — factory + `supabaseHaccpHandbookRepository` singleton.
11. `lib/adapters/supabase/HaccpSuppliersRepository.ts` — factory + `supabaseHaccpSuppliersRepository` singleton.
12. `lib/adapters/supabase/HaccpLookupsRepository.ts` — factory + `supabaseHaccpLookupsRepository` singleton.

*Fake adapters (3):*
13. `lib/adapters/fake/HaccpHandbookRepository.ts` — factory + singleton + `FakeHaccpHandbookSeed`.
14. `lib/adapters/fake/HaccpSuppliersRepository.ts` — factory + singleton + `FakeHaccpSuppliersSeed` (test-inspectable: records inserts/updates).
15. `lib/adapters/fake/HaccpLookupsRepository.ts` — factory + singleton + `FakeHaccpLookupsSeed`.

**Edited files (barrels + wiring — additive only, 6):**
16. `lib/domain/index.ts` — export the 3 new domain modules' types.
17. `lib/ports/index.ts` — export the 3 new port types.
18. `lib/services/index.ts` — export the 3 new service factories + types.
19. `lib/adapters/supabase/index.ts` — export the 3 new factories + singletons.
20. `lib/adapters/fake/index.ts` — export the 3 new factories + singletons + seed types.
21. `lib/wiring/haccp.ts` — add 3 service singletons (service-role only), with a PR9a header block mirroring the PR7 block.

**New test files (3):**
22. `tests/unit/services/HaccpHandbookService.test.ts`
23. `tests/unit/services/HaccpSuppliersService.test.ts`
24. `tests/unit/services/HaccpLookupsService.test.ts`

**Explicitly NOT changed:** none of the 8 route files; no `supabase/migrations/**`; no `.eslintrc.json`; no `app/**`; no `components/**`; no `package.json`; the Orders `lib/ports/CustomersRepository.ts` and its adapters are untouched.

> 🗣 **In plain English:** 15 brand-new files (3 sets of socket + plug + fake + data-shape + brain), 6 small additive edits to "index" files and the fuse box, 3 test files. Zero screen files, zero database changes, zero rulebook edits.

---

## Chosen method signatures & return types

> Convention for all three ports: read methods return **domain types** (camelCase, owned), never vendor rows. The adapter maps. Errors: reads that the routes 500 on a DB error throw `ServiceError` (existing class, as in other HACCP adapters); the service/route maps to HTTP later in PR9b. `getRecallConfig` returns `null` on no-row (the route's `PGRST116`/`null` branch) — define-errors-out-of-existence, APOSD §11.

### `lib/ports/HaccpHandbookRepository.ts`
```ts
export interface HaccpHandbookRepository {
  /** handbook route. Lists active SOP content for EITHER a section_key OR a
   *  source_doc substring match. Adapter runs the `.eq('active',true)`,
   *  `.order('sop_ref')`, and the section-vs-doc branch; service decides which
   *  branch from the (section, doc) inputs. Exactly one of section/doc is set. */
  listSopContent(args: { section: string | null; doc: string | null }): Promise<readonly SopContentEntry[]>;

  /** search route. RPC `haccp_search`. Returns ranked results as-is (domain-mapped). */
  searchSop(query: string): Promise<readonly SearchResult[]>;

  /** documents route. Full document-control register, ordered by (category, doc_ref). */
  listDocuments(): Promise<readonly HaccpDocument[]>;
}
```
> 🗣 Three reads over the SOP library and its index. The "which branch" logic (section vs doc) is a business rule the brain owns; the plug just fetches.

### `lib/ports/HaccpSuppliersRepository.ts`
```ts
export interface HaccpSuppliersRepository {
  // ── supplier-code surface ──
  /** Case-insensitive name match, returns label_code or null (service applies
   *  the slice(0,4) fallback). */
  findLabelCodeByName(name: string): Promise<string | null>;

  // ── recall surface (reads) ──
  /** Active suppliers with contact fields, ordered by name. */
  listActiveSupplierContacts(): Promise<readonly SupplierContact[]>;
  /** Latest recall config (most-recent created_at) with updater name joined, or
   *  null when none exists (the route's PGRST116/null branch). */
  getRecallConfig(): Promise<RecallConfig | null>;

  // ── recall surface (writes) ──
  /** Upsert recall config: insert when id absent, update when present.
   *  Returns the saved config row. Service builds the payload (updated_by/at). */
  saveRecallConfig(input: SaveRecallConfigInput): Promise<RecallConfig>;
  /** Update one supplier's three contact fields; returns the narrow contact row
   *  shape the recall PATCH responds with. Service applies the trim-or-null. */
  updateSupplierContacts(input: UpdateSupplierContactsInput): Promise<SupplierContactReply>;

  // ── admin/suppliers surface ──
  /** All suppliers (active + inactive), the full admin column set, ordered by name. */
  listAllSuppliers(): Promise<readonly Supplier[]>;
  /** Count of all supplier rows — feeds the next-position assignment. */
  countSuppliers(): Promise<number>;
  /** Insert a new supplier from the route's exact insert payload; returns the row. */
  createSupplier(input: CreateSupplierInput): Promise<Supplier>;
  /** Update a supplier from the route's whitelisted field set; returns the row. */
  updateSupplier(id: string, fields: UpdateSupplierFields): Promise<Supplier>;
}
```
> 🗣 The supplier book: look up a label, list active contacts, read/write the recall config, edit one supplier's contacts, and full admin list/create/update. One socket, nine clearly-named operations. Note: the route's "DELETE = deactivate" is in the file's header comment but **the handler does not exist in the current file** (file ends at PATCH, 122 lines) — so PR9a adds **no** delete method (byte-identity: model only what the route actually does). Flagged R-F-D2.

### `lib/ports/HaccpLookupsRepository.ts`
```ts
export interface HaccpLookupsRepository {
  /** Active users in roles [admin, warehouse, butcher], ordered by name. The
   *  admins-first re-sort is a presentation rule → it lives in the SERVICE, not
   *  here (so this stays a faithful DB read). */
  listSelectableUsers(): Promise<readonly HaccpUserOption[]>;
  /** Active customers, id+name only, ordered by name. */
  listActiveCustomers(): Promise<readonly HaccpCustomerOption[]>;
}
```
> 🗣 Two drop-down feeds. The "admins at the top" reshuffle is a display choice, so it sits in the brain — keeping the plug an honest mirror of the query.

### Service interfaces (factories only — no singletons in `lib/services/`)
```ts
// HaccpHandbookService
getHandbook(args: { section: string | null; doc: string | null }): Promise<HandbookResponse>; // { section, doc, entries }
search(q: string): Promise<SearchResponse>;            // { results, query }  (q<2 → {results:[]} handled by service)
getDocuments(): Promise<DocumentsResponse>;            // BARE ARRAY — route returns `data ?? []` un-wrapped (R-F-B1)

// HaccpSuppliersService
getLabelCode(name: string): Promise<{ label_code: string }>;       // applies slice(0,4).toUpperCase() fallback
getRecallContactList(): Promise<RecallGetResponse>;                // { config, suppliers }
saveRecallConfig(input, userId: string): Promise<{ config: RecallConfig }>;
updateRecallSupplierContact(input): Promise<{ supplier: SupplierContactReply }>;
listSuppliers(): Promise<{ suppliers: readonly Supplier[] }>;
createSupplier(body): Promise<{ supplier: Supplier }>;             // next-position + label_code slice(0,6) + defaults
updateSupplier(body): Promise<{ supplier: Supplier } | ValidationReject>; // field whitelist + "no valid fields" 400

// HaccpLookupsService
getUsers(): Promise<{ users: readonly HaccpUserOption[] }>;        // admins-first sort applied here
getCustomers(): Promise<{ customers: readonly HaccpCustomerOption[] }>;
```
> 🗣 One method per screen action; each returns exactly the JSON the route returns today (mirrored `…Response` types). HTTP status codes, cookie/role auth, and `new Date().toISOString()` stay at the route edge in PR9b — services take already-computed values in (e.g. `userId` for recall's `updated_by`). **The `documents` response is a bare array, not `{documents:[...]}`** — easy to get wrong, pinned by a test (R-F-B1).

---

## Numbered implementation steps (TDD order)

**Step 0 — capture response-shape snapshots (first).** From the 8 route files, write the exact response object for each (already captured in the Appendix). These become the test assertions — the byte-identity contract.

**Step 1 — domain types.** Write `lib/domain/HaccpHandbook.ts`, `HaccpSuppliers.ts`, `HaccpLookups.ts` mirroring each route's `.select()` columns (camelCase) + each route's response object. Pure TS, no vendor imports. Export from `lib/domain/index.ts`. ⚠️ Watch for export-name collisions in the domain barrel (see how PR-D handled `HaccpUserRef` — `lib/domain/index.ts:232,243`); prefix HACCP-specific names (`HaccpUserOption`, not `UserOption`).

**Step 2 — ports.** Write the 3 port interfaces; import domain types only; export from `lib/ports/index.ts`.

**Step 3 — write the failing unit tests** (3 service test files). Red first.

**Step 4 — services.** Move the route's pure logic VERBATIM into each service method (branches, fallbacks, sorts, field whitelists, slice/trim normalisations, default assignments). Factories only; export from `lib/services/index.ts`. **No singletons here.**

**Step 5 — Supabase adapters.** Copy each route's `.select()`/`.insert()`/`.update()`/`.rpc()` chains VERBATIM so wire output is byte-identical after PR9b. Map vendor rows → domain types at the return boundary (snake_case→camelCase mapping lives here, nowhere else). Each gets a factory + a `supabaseService`-wired singleton. Export from `lib/adapters/supabase/index.ts`.

**Step 6 — Fake adapters.** In-memory, seedable, mirroring `HaccpReviewsRepository.ts`'s fake pattern. The suppliers fake is **test-inspectable** (records `createSupplier`/`updateSupplier`/`saveRecallConfig`/`updateSupplierContacts` payloads so tests assert the exact written row — parity with the recorded-writes pattern in the reviews fake). Export from `lib/adapters/fake/index.ts`.

**Step 7 — wiring.** Add to `lib/wiring/haccp.ts` (service-role only, INTRODUCE-ONLY, no caller):
```ts
export const haccpHandbookService: HaccpHandbookService =
  createHaccpHandbookService({ handbook: supabaseHaccpHandbookRepository });
export const haccpSuppliersService: HaccpSuppliersService =
  createHaccpSuppliersService({ suppliers: supabaseHaccpSuppliersRepository });
export const haccpLookupsService: HaccpLookupsService =
  createHaccpLookupsService({ lookups: supabaseHaccpLookupsRepository });
```
Add a PR9a header block mirroring the PR7 block. NO `…ForCaller`.

**Step 8 — go green.** `npx tsc --noEmit`, lint (incl. `tests/unit/lint/no-adapter-imports.test.ts`), the 3 new unit suites, the full unit suite, `npm run build`.

> 🗣 **In plain English:** Write the "correct answer" tests first, build sockets → plugs → fakes → brains, prove the tests pass. No route is touched, so no integration/E2E run is needed.

---

## TDD test plan (ANVIL executes)

PR9a is introduce-only → **unit-level + green build**. No integration/E2E changes because **no route is touched** (state this explicitly in the ship record).

### `tests/unit/services/HaccpHandbookService.test.ts`
- `getHandbook` with `section` set → asserts `{section, doc:null, entries}` and that `entries` mirror the seeded rows in `sop_ref` order; with `doc` set → `{section:null, doc, entries}`; with neither → service path that the route 400s on (model the validation: service returns/throws the 400-equivalent so PR9b stays thin — assert it).
- `search`: q with <2 chars → `{results:[]}` (no repo call); valid q → `{results, query:q}` mirroring seeded RPC rows.
- `getDocuments`: asserts a **bare array** (NOT wrapped) in `(category, doc_ref)` order. **R-F-B1 pin.**

### `tests/unit/services/HaccpSuppliersService.test.ts`
- `getLabelCode`: match → returns DB `label_code`; **no match → `name.slice(0,4).toUpperCase()`** fallback (e.g. `"Euro Quality Lambs"` → `"EURO"`). Empty/short name edge.
- `getRecallContactList`: `{config, suppliers}`; config-null branch → `config:null`; suppliers empty → `[]`.
- `saveRecallConfig`: id present → update path records the payload incl. `updated_by`=injected userId; id absent → insert path. Assert the recorded payload exactly (uses inspectable fake).
- `updateRecallSupplierContact`: trim-or-null on each contact field (`"  "` → `null`, `" Bob "` → `"Bob"`); returns the narrow `{id,name,contact_name,contact_phone,contact_email}` reply shape.
- `createSupplier`: next-position = count+1; `label_code` = `body.label_code.trim().toUpperCase().slice(0,6)` or null; every `?? null` default for the 13 optional fields; returns `{supplier}`. Assert the exact insert payload via the inspectable fake.
- `updateSupplier`: only whitelisted keys pass through (a non-whitelisted key is dropped); empty update → "No valid fields to update" 400-equivalent; returns `{supplier}`.

### `tests/unit/services/HaccpLookupsService.test.ts`
- `getUsers`: seed mixed roles → asserts **admins first, then name-sorted** (the route's `.sort` comparator reproduced); shape `{users:[{id,name,role}]}`.
- `getCustomers`: `{customers:[{id,name}]}` in name order; empty → `[]`.

### Lint / typecheck / build
- `tests/unit/lint/no-adapter-imports.test.ts` green (services import ports only; only wiring imports adapters).
- `npx tsc --noEmit` green; lint green (no eslint change needed); `npm run build` green; full unit suite green.

> 🗣 **In plain English:** Each test file proves a brain reproduces its screen's exact output for known inputs — the seatbelt PR9b buckles into. The supplier writes are checked by recording the exact row the brain would send to the DB.

---

## Acceptance criteria

- [ ] 15 new source files + 6 additive barrel/wiring edits + 3 test files, exactly as listed. No route edited; no migration; **no `.eslintrc.json` edit**; no `package.json` entry.
- [ ] Three ports, three services, three Supabase adapters, three fake adapters — grouped as decided (handbook / suppliers / lookups).
- [ ] `@supabase/supabase-js` imported ONLY inside `lib/adapters/supabase/**` (unchanged; nothing new outside).
- [ ] No port mentions a vendor; vendor rows mapped to `lib/domain/` types inside the adapters (snake_case→camelCase never leaks).
- [ ] Services export FACTORIES only (no singleton in `lib/services/`); wiring holds the singletons; service-role only; no `…ForCaller`.
- [ ] `lib/ports/**` and `lib/domain/**` import no adapters; services import ports only (lint-pinned).
- [ ] Orders `lib/ports/CustomersRepository.ts` + its adapters untouched.
- [ ] Service unit tests reproduce all 8 route response shapes for fixed inputs, incl. the bare-array `documents` response, the supplier-code fallback, the admins-first sort, and the exact write payloads.
- [ ] Lint + typecheck + build green. Full unit suite green.
- [ ] Ship record explicitly notes: introduce-only, no caller, no route, no migration, no eslint/dep delta, no integration/E2E delta.

---

## Risk Assessment (mandatory)

### Concurrency / race conditions
- **R-F-C1 (low, no must-fix):** `createSupplier` reads `count` then inserts `position = count+1` — a non-atomic read-then-write. Two concurrent creates could assign the same position. **This is the route's existing behaviour**, copied verbatim; PR9a must NOT "fix" it (that would break byte-identity). **Mitigation:** reproduce as-is; note for a future hardening ticket. **No must-fix.**

### Security
- **R-F-S1 (low):** Supplier contact PII and `users.name` flow through these reads/writes. PR9a must not read/write columns beyond what each route touches. **Mitigation:** copy `.select()`/insert/update column lists verbatim; reviewer diffs each against its route. Code-critic check item. **No must-fix.**
- **R-F-S2 (low):** Service-role (RLS-bypassing) singletons in wiring — matches today's route access, ADR-0004-sanctioned deferral to F-RLS-04h. **Mitigation:** wiring test pins no `…ForCaller` leaked early. **No must-fix.**

### Data migration
- **None.** PR9a adds no migration and changes no schema. **No material risks in this category.**

### Business-logic flaws (the real risk surface — byte-identity; Cluster F adds WRITES)
- **R-F-B1 (medium):** `documents` route returns a **bare array** (`NextResponse.json(data ?? [])`), every other surface returns a wrapped object. Emitting `{documents:[...]}` would break the screen. **Mitigation:** `getDocuments` returns a bare array; explicit test asserts un-wrapped. **No must-fix on the plan** (resolved by the test), but the single most error-prone shape.
- **R-F-B2 (medium):** Write-payload exactness. `createSupplier` has 13 `?? null` defaults + `active ?? true` + `position` + `label_code.trim().toUpperCase().slice(0,6) || null`; `updateSupplier` has a 16-key whitelist + "no valid fields" 400; recall PATCH does `?.trim() || null` per field; recall POST builds `updated_by/updated_at`. Any drift changes a written row — a compliance defect on an auditor-facing register. **Mitigation:** move the payload-building code verbatim; inspectable fakes assert the exact written row; reviewer diffs line-by-line. **No must-fix on the plan**, but the inspectable-write tests are non-optional.
- **R-F-B3 (low):** supplier-code fallback `name.slice(0,4).toUpperCase()` and case-insensitive `ilike` match. Mishandling the no-match branch changes the printed label. **Mitigation:** explicit match/no-match tests. **No must-fix.**
- **R-F-B4 (low):** users admins-first sort comparator (`a.role==='admin'` precedence then `localeCompare`). A naïve sort drops the admins-first guarantee (Hakan/Ege must top the list). **Mitigation:** reproduce the comparator verbatim; mixed-role test. **No must-fix.**
- **R-F-B5 (low):** recall `getRecallConfig` null/`PGRST116` branch (no config row yet) vs a real DB error (500). Conflating them changes behaviour. **Mitigation:** port returns `null` only for no-row; real errors throw `ServiceError`; both branches tested. **No must-fix.**
- **R-F-B6 (low):** recall config carries an `updater:updated_by(name)` JOIN. The domain `RecallConfig` must map that nested shape consistently (e.g. `updaterName`); a leaked `updater:{name}` vendor shape would break the contract. **Mitigation:** map the join inside the adapter to an owned field; test the mapped shape. **No must-fix.**

### Launch blockers
- **R-F-D1 (informational, NOT a blocker):** Spec said `lib/ports/CustomersRepository.ts` is an "unused stub" — it is **NOT**; it is live in Orders. Decision: do not adopt/replace it; HACCP uses its own `HaccpLookupsRepository`. Called out to the conductor. **No blocker** (the decision avoids the coupling).
- **R-F-D2 (informational):** admin/suppliers' header comment mentions DELETE (deactivate), but the current file has **no DELETE handler** (ends at PATCH). PR9a models only what exists → no delete method. If a DELETE handler actually exists elsewhere/uncommitted, flag at implementation; otherwise byte-identity = no delete. **No blocker.**
- **R-F-L1 (none):** Unlike PR7, no eslint allow-list edit is needed (no new vendor). Confirmed against `.eslintrc.json`. **No blocker.**

### Risk headline
**No Gate-2-blocking must-fix risks.** Cluster F's new risk surface vs Cluster E is **writes** (R-F-B2) — the create/update/save payloads must be byte-exact on auditor-facing registers, enforced by the inspectable-fake write-assertion tests. The bare-array `documents` response (R-F-B1) is the most error-prone read shape. Two spec premises were corrected (R-F-D1 CustomersRepository is live, not a stub; R-F-D2 no DELETE handler exists) — both resolved by the decomposition, neither a blocker.

---

## Hexagonal verdict (populates Gate 2)

- **Ports used/added:** ADDS three ports — `HaccpHandbookRepository`, `HaccpSuppliersRepository`, `HaccpLookupsRepository`. Uses no existing port. Explicitly does NOT extend the Orders-owned `CustomersRepository` or the auth-context `UsersRepository` (cross-domain coupling avoided).
- **Adapters added:** `lib/adapters/supabase/{HaccpHandbook,HaccpSuppliers,HaccpLookups}Repository` (Supabase plugs) + `lib/adapters/fake/{…}` (in-memory twins). Each port: one Supabase adapter + one fake.
- **New dependencies:** **NONE.** No `package.json` entry. `@supabase/supabase-js` is already confined to `lib/adapters/supabase/`; no new vendor library, so **no wrapping or justification needed and no eslint change**.
- **Rip-out test:** After PR9a, swapping the DB for any of the three sub-domains = one new `lib/adapters/<vendor>/Haccp{Handbook|Suppliers|Lookups}Repository` + one wiring line in `lib/wiring/haccp.ts`. Services, ports, domain types, and (after PR9b) routes untouched. **RESULT: PASS.**
- **Gate-2 verdict:** **PASS — no blocker.** No new/unjustified/unwrapped dep; rip-out PASSes; no must-fix risk blocks the plan; the two corrected spec premises are resolved by the decomposition, not by re-planning.

> 🗣 **In plain English:** Three clean sockets, six plugs, zero new libraries, zero rulebook edits. After this, replacing the database for the handbook, the supplier book, or the pick-lists is a one-plug-one-wire change. Green.

---

## Appendix — current response shapes (the byte-identity contract for PR9b)

Captured from route source on 2026-06-25:

1. **handbook** (GET): `{ section: section ?? null, doc: doc ?? null, entries: data ?? [] }`. Entry cols: `sop_ref, title, content_md, version, source_doc`. `active=true`, `order('sop_ref')`. section→`.eq('section_key',section)`; else doc→`.ilike('source_doc', '%'+doc+'%')`. neither → 400 "Missing section or doc parameter".
2. **search** (GET): `{ results: data ?? [], query: q }`. q<2 → `{results:[]}`. RPC `haccp_search({query:q})`.
3. **documents** (GET): **BARE ARRAY** `data ?? []`. Cols: `doc_ref, title, version, category, register_type, description, purpose, linked_docs, status, updated_at, review_due, owner`. `order('category')` then `order('doc_ref')`.
4. **users** (GET): `{ users }`. Cols `id, name, role`; `.in('role',['admin','warehouse','butcher'])`, `active=true`, `order('name')`; then **admins-first** re-sort + `localeCompare`.
5. **customers** (GET): `{ customers: data ?? [] }`. Cols `id, name`; `active=true`, `order('name')`.
6. **supplier-code** (GET ?name=): `{ label_code }`. `haccp_suppliers.select('label_code').ilike('name', name).limit(1).maybeSingle()`; fallback `name.slice(0,4).toUpperCase()`.
7. **recall**: GET → `{ config: configRes.data ?? null, suppliers: suppliersRes.data ?? [] }`. config cols `id, internal_team, regulatory, other_contacts, updated_at, updater:updated_by(name)`, `order(created_at desc).limit(1).single()` (PGRST116 = null, else 500). suppliers cols `id, name, categories, contact_name, contact_phone, contact_email, active`, `active=true`, `order('name')`. POST → `{config: result.data}`; payload `{internal_team, regulatory, other_contacts, updated_by:userId, updated_at:ISO}`; id present=update else insert; non-array field → 400 "Invalid payload"; non-admin → 403. PATCH → `{supplier: data}`; updates `contact_name/phone/email` each `?.trim() || null`; select `id, name, contact_name, contact_phone, contact_email`; no id → 400; non-admin → 403.
8. **admin/suppliers**: GET → `{ suppliers: data ?? [] }`; cols `id, name, active, position, address, contact_name, contact_phone, contact_email, fsa_approval_no, fsa_activities, cert_type, cert_expiry, products_supplied, date_approved, notes, categories, label_code, created_at`, `order('name')`; non-admin → 403. POST → `{supplier}` status **201**; name required (400 "Name is required"); `position = count+1`; `label_code = body.label_code?.trim().toUpperCase().slice(0,6) || null`; 13 `?? null` defaults + `active ?? true`. PATCH → `{supplier}`; 16-key whitelist (`name, active, position, address, contact_name, contact_phone, contact_email, fsa_approval_no, fsa_activities, cert_type, cert_expiry, products_supplied, date_approved, notes, categories, label_code`); no id → 400; empty update → 400 "No valid fields to update". **NO DELETE handler in the current file** despite the header comment.
