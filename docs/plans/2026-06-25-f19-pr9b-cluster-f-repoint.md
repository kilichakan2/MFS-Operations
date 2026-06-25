# F-19 Cluster F — PR9b (re-point): flip the 8 HACCP "docs & lookups" routes onto the hexagon

- **Date:** 2026-06-25
- **Feature:** F-19 Cluster F, PR9b — the re-point half of the two-step rhythm (PR9a = introduce-only foundation, SHIPPED `b9e0a6e`; PR9b = re-point, this plan).
- **Phase:** FORGE Order → plan for Render.
- **Branch suggestion:** `f19-pr9b-cluster-f-repoint`
- **Pattern:** the 4th repeat of the established A→E re-point (PR2 / PR4 / PR6 / PR8). Zero new foundation; only route edits.

> 🗣 **In plain English:** PR9a already built the clean "sockets and plugs" (ports, adapters, services, fuse-box singletons) for eight HACCP admin/lookup screens, and proved with tests they produce the exact same output the screens return today. Those plugs are wired into the fuse box but nothing calls them yet. THIS PR walks into each of the 8 screen API handlers, rips out the inline database calls, and replaces them with a one-line call to the matching pre-built service — then deletes the now-unused direct database import. No new plumbing, no database change, no behaviour change on the happy path.

---

## Mini-map

```
DOMAIN (HACCP docs & lookups core logic)  — all ports/services/adapters already exist (PR9a)
  ├─ HaccpHandbookRepository  (port) → [Supabase]   ← haccpHandbookService   ← handbook · search · documents
  ├─ HaccpSuppliersRepository (port) → [Supabase]   ← haccpSuppliersService  ← supplier-code · recall · admin/suppliers
  └─ HaccpLookupsRepository   (port) → [Supabase]   ← haccpLookupsService    ← users · customers
🗣 PR9b moves the 8 screens onto the 3 sockets built in PR9a — swap a vendor later = change one plug, nothing in the screens.
```

---

## Goal

Re-point all 8 HACCP "docs & lookups" route handlers from inline `supabaseService.from(...)` / `.rpc(...)` calls to the three pre-built service singletons in `lib/wiring/haccp.ts` (`haccpHandbookService`, `haccpSuppliersService`, `haccpLookupsService`). Each route keeps its cookie/role auth gate, its HTTP status codes, its query-param parsing, and its `new Date().toISOString()` wall-clock at the edge; the service does the data fetch, the shaping, and the validation rejects. The happy-path response stays **byte-identical**. Each route drops its now-unused direct `@supabase/*` adapter import → the rip-out test for Cluster F is fully realised.

> 🗣 **In plain English:** Turn each screen handler into a thin doorman — check the cookie, parse the URL, ask the pre-built brain for the answer, return it. The brain (already tested in PR9a) does the database work. The screens behave the same; the database is now reachable only through one swappable plug.

---

## Domain terms (plain-English glossary for this plan)

- **Re-point** — change the caller to ask a service instead of hitting the DB inline; no new files. 🗣 Re-routing the wire from the wall socket to the new junction box; the appliance is unchanged.
- **Service singleton** (`lib/wiring/haccp.ts`) — the ready-to-use, service-role-wired brain a route imports and calls. 🗣 The fully-assembled appliance plugged into the fuse box; the route just flips its switch.
- **Reject object** (`{ ok: false, status, message }`) — how a service hands a validation failure back so the route can turn it into an HTTP 400/403. 🗣 The brain says "no, and here's why and what code to send"; the doorman relays it.
- **Byte-identical (happy path)** — for a successful request, the JSON body and key order are character-for-character what the route returns today. 🗣 Same answer, same order, same shape — a screen can't tell anything changed.
- **R6 / DB-error 500 body** — on a database error, return `{ error: 'Server error' }`, never raw Postgres text. 🗣 If the database trips, we say "Server error", not leak the database's own complaint.
- **Service-role** — the master-key DB client that bypasses row-level security. 🗣 The skeleton key the screens already use today; PR9b keeps it, doesn't add a per-user key.

---

## Compliance flags

- **HACCP food-safety records (SALSA audit).** The recall/withdrawal contact list (SALSA 3.4) and the supplier approval register (FSA approval numbers, cert expiry) are auditor-facing. The two **mutating** surfaces (recall POST/PATCH, admin/suppliers POST/PATCH) write rows an auditor relies on. Byte-identity of the **written payload** was already code-critic-verified line-by-line in PR9a (the suppliers adapter reproduces each route's current insert/update byte-for-byte). PR9b must NOT touch any payload-building code — it lives in the service now; the route only passes the parsed body + the edge-computed `userId`/ISO stamp. **PR9b is a compliance no-op on the write path** by construction.
- **PII.** Supplier contact names/phones/emails and `users.name` flow through these reads/writes. PR9b changes no `.select()` column list (those live in the adapters, untouched), so no new exposure.

---

## ADR review & conflicts

Read: ADR-0002 (hexagonal shape & naming), ADR-0003 (strangler-fig + FREEZE), ADR-0004 (RLS vs service-role).

- **ADR-0002** — honoured and IMPROVED. After PR9b, `app/api/haccp/{handbook,search,documents,users,customers,supplier-code,recall,admin/suppliers}/route.ts` import from `@/lib/wiring/haccp` (a service), never from `@/lib/adapters/supabase/client`. The "UI/route → service → adapter" direction is restored for all 8 surfaces. No route imports a vendor SDK after this PR.
- **ADR-0003 (FREEZE)** — honoured. `@supabase/supabase-js` (via `supabaseService`) is **removed** from the 8 routes; it now lives only in `lib/adapters/supabase/`. No new vendor, no `.eslintrc.json` change.
- **ADR-0004 (RLS vs service-role)** — honoured. The wiring singletons are **service-role only** (PR9a). PR9b adds NO `…ForCaller(userId)` per-request authenticated factory — deferred to Cluster G / F-RLS-04h, exactly as every prior re-point deferred it. The routes' access level is unchanged, which is why the happy path stays byte-identical.

**No ADR conflicts. No ADR-adjacent housekeeping required.**

> 🗣 **In plain English:** The rulebook says screens must go through a service, not the database directly, and only the adapter folder may touch the vendor library. PR9b is exactly the move that satisfies both for these 8 screens. No new library, so nothing new to ban or permit.

---

## The one deliberate, sanctioned behaviour delta (read this before any step)

This is a **byte-identical re-point on the HAPPY PATH**, but there is ONE intentional difference on the **DB-error path**, and it is the same delta every prior cluster (A→E) shipped:

- **Today (inline):** on a Supabase error the routes return the raw Postgres message — `return NextResponse.json({ error: error.message }, { status: 500 })`.
- **After PR9b (R6 posture):** the PR9a adapters **throw `ServiceError`** on a DB error (confirmed: `lib/adapters/supabase/HaccpSuppliersRepository.ts:83,101,128,150,168,182,198,220`, and the handbook/lookups adapters mirror this). The thrown error is caught by the route's existing outer `try/catch` and returned as `{ error: 'Server error' }` with status 500.

So the **happy-path body is byte-identical**; the **error body changes from raw Postgres text → `'Server error'`**. This is the **R6 house style** and is the established, accepted posture across Cluster A–E. It is an improvement (no Postgres internals leak) and must be stated plainly in the ship record, NOT "fixed" back. See Risk R-F-B7.

**One adapter that intentionally does NOT throw:** `findLabelCodeByName` (supplier-code) reads `data` only and ignores errors, returning `null` so the service's `name.slice(0,4).toUpperCase()` fallback fires — byte-identical to the route today, which also reads `data` only (`supplier-code/route.ts:23-30`, no `error` handling, no try/catch).

> 🗣 **In plain English:** When everything works, the screens get the exact same JSON. When the database errors, the screens now see a clean "Server error" instead of the database's raw complaint — the same safety upgrade clusters A through E already shipped. The label-code lookup is the one spot that deliberately swallows errors and falls back to the first 4 letters of the name, exactly as it does today.

---

## Files to change (exact paths)

**Edited route files (8) — the entire scope of PR9b's source change:**

1. `app/api/haccp/handbook/route.ts` → `haccpHandbookService.getHandbook(...)`
2. `app/api/haccp/search/route.ts` → `haccpHandbookService.search(...)`
3. `app/api/haccp/documents/route.ts` → `haccpHandbookService.getDocuments()`
4. `app/api/haccp/users/route.ts` → `haccpLookupsService.getUsers()`
5. `app/api/haccp/customers/route.ts` → `haccpLookupsService.getCustomers()`
6. `app/api/haccp/supplier-code/route.ts` → `haccpSuppliersService.getLabelCode(...)`
7. `app/api/haccp/recall/route.ts` → `haccpSuppliersService.getRecallContactList()` / `.saveRecallConfig(...)` / `.updateRecallSupplierContact(...)`
8. `app/api/haccp/admin/suppliers/route.ts` → `haccpSuppliersService.listSuppliers()` / `.createSupplier(...)` / `.updateSupplier(...)`

In every one: replace `import { supabaseService } from '@/lib/adapters/supabase/client'` with `import { <service> } from '@/lib/wiring/haccp'`, delete the `const supabase = supabaseService` line (where present), delete all inline `.from()/.select()/.insert()/.update()/.rpc()` blocks, and call the service.

**New / extended test files (route-level):**

9. `tests/integration/haccp/cluster-f-repoint.test.ts` (new) — route-level integration assertions for all 8 surfaces against local Supabase (or extend an existing HACCP integration file if one already covers these routes — implementer checks `tests/integration/haccp/` first and follows the prevailing pattern from the Cluster E re-point tests).
10. E2E specs: extend the HACCP Playwright suite for the 2 mutating surfaces (`recall`, `admin/suppliers`) — see Test matrix. Tag the destructive-surface taps `@critical` only if they are non-destructive (they must be).

**Explicitly NOT changed:**
- No file under `lib/` (ports, services, adapters, wiring, domain are all PR9a-complete and frozen for this PR).
- No `supabase/migrations/**` (no migration).
- No `.eslintrc.json`, no `package.json`.
- No `components/**` or page-level `app/**` UI files (the route handlers are the only `app/**` edits).
- The Orders `lib/ports/CustomersRepository.ts` and its adapters (R-F-D1).

> 🗣 **In plain English:** PR9b edits exactly 8 handler files plus tests. Everything in the `lib/` plumbing folder was finished and tested in PR9a and is not touched here. Zero database changes, zero rulebook changes.

---

## Service method contracts the routes call (confirmed against PR9a source)

These are the EXACT signatures the routes must call (read from `lib/services/Haccp{Handbook,Suppliers,Lookups}Service.ts`). The reject objects are `{ ok: false, status, message }`; the route maps `status`/`message` to the HTTP response.

```
haccpHandbookService:
  getHandbook({ section: string|null, doc: string|null })
      → HandbookResponse { section, doc, entries } | HandbookReject {ok:false,status,message}
  search(q: string|null|undefined)
      → SearchResponse { results, query } | { results: [] }      (q<2 short-circuit lives in service)
  getDocuments() → readonly HaccpDocument[]                       (BARE ARRAY — R-F-B1)

haccpSuppliersService:
  getLabelCode(name: string) → { label_code }                    (slice(0,4) fallback lives in service)
  getRecallContactList() → { config, suppliers }
  saveRecallConfig(input: SaveRecallConfigInput, userId: string, nowIso: string) → { config }
  updateRecallSupplierContact(input: UpdateSupplierContactsInput) → { supplier }   (input carries id + 3 contact fields)
  listSuppliers() → { suppliers }
  createSupplier(body: CreateSupplierInput) → { supplier } | SuppliersReject
  updateSupplier(body: UpdateSupplierInput) → { supplier } | SuppliersReject       (body carries id + fields)

haccpLookupsService:
  getUsers() → { users }                                         (admins-first sort lives in service)
  getCustomers() → { customers }
```

> 🗣 **In plain English:** This is the menu of methods the screens call. Notice the service already owns the tricky bits — the "less than 2 letters → empty" rule, the label-code fallback, the admins-first sort, the validation rejects. The route just relays the cookie data and the parsed body in, and the JSON out.

---

## Numbered implementation steps (per route)

> Order: do the read-only routes first (lowest risk, warms the pattern), then the mutating routes. Run `npx tsc --noEmit` after each file. TDD: integration assertions are written/extended first where a gap exists (Step A), then routes flipped.

### Step A — tests first (where a gap exists)
Check `tests/integration/haccp/` for existing coverage of these 8 routes. For any surface lacking a happy-path + auth-gate + (for mutating) write assertion, add it to `tests/integration/haccp/cluster-f-repoint.test.ts` BEFORE flipping that route, mirroring the Cluster E re-point integration tests. The PR9a unit suites already prove the service shaping — these tests prove the **route wiring** (auth gate fires, status codes, body shape, write lands).

### Step 1 — `handbook/route.ts` (read, `haccpHandbookService`)
- Replace import: `supabaseService` → `import { haccpHandbookService } from '@/lib/wiring/haccp'`; delete `const supabase = supabaseService` (line 12).
- KEEP: the cookie role gate (lines 16-19, roles `warehouse|butcher|admin`), the `section`/`doc` param parse (lines 21-22), the outer try/catch.
- DELETE: lines 24-26 (the `if (!section && !doc)` 400 — now owned by the service reject) and lines 28-48 (the whole `let query = …` chain + error branch + response).
- REPLACE WITH:
  ```ts
  const result = await haccpHandbookService.getHandbook({ section, doc })
  if ('ok' in result && result.ok === false) {
    return NextResponse.json({ error: result.message }, { status: result.status })
  }
  return NextResponse.json(result)
  ```
- Expected body (happy): `{ section: section ?? null, doc: doc ?? null, entries: [...] }` — service already returns this key order. Missing-params → `{ error: 'Missing section or doc parameter' }` 400 (service reject, byte-identical message).

### Step 2 — `search/route.ts` (read, `haccpHandbookService`)
- Replace import; delete `const supabase` (line 12).
- KEEP: role gate (16-19), `const q = …searchParams.get('q')?.trim()` (line 21) — the route still trims at the edge; the service also defends q<2.
- DELETE: lines 22-24 (the q<2 short-circuit — service owns it too, but it's harmless to keep; for a clean re-point, delete it and let the service short-circuit) and lines 26-33 (the rpc + error + response).
- REPLACE WITH:
  ```ts
  const result = await haccpHandbookService.search(q)
  return NextResponse.json(result)
  ```
- Expected body: q<2 → `{ results: [] }`; valid → `{ results: [...], query: q }`. The service's `search` re-trims internally, so passing the already-trimmed `q` is byte-identical.

### Step 3 — `documents/route.ts` (read, `haccpHandbookService`) — **R-F-B1 bare array**
- Replace import; delete `const supabase` (line 10).
- KEEP: role gate (14-17), try/catch.
- DELETE: lines 19-30 (the select chain + error + the bare-array response).
- REPLACE WITH:
  ```ts
  const documents = await haccpHandbookService.getDocuments()
  return NextResponse.json(documents)
  ```
- Expected body: a **BARE ARRAY** `[...]`, NOT `{ documents: [...] }`. The service returns a bare array (R-F-B1). Pin with a test asserting `Array.isArray(body) === true`.

### Step 4 — `users/route.ts` (read, `haccpLookupsService`)
- Replace import; delete `const supabase` (line 12).
- KEEP: role gate (16-19), try/catch.
- DELETE: lines 21-35 (the select + error + the inline `.sort` admins-first comparator).
- REPLACE WITH:
  ```ts
  const result = await haccpLookupsService.getUsers()
  return NextResponse.json(result)
  ```
- Expected body: `{ users: [...] }` with admins-first then name order — the service reproduces the exact comparator (R-F-B4).

### Step 5 — `customers/route.ts` (read, `haccpLookupsService`) — **R-F-D1: HACCP lookups, NOT Orders CustomersRepository**
- Replace import; delete `const supabase` (line 10).
- KEEP: role gate (14-17), try/catch.
- DELETE: lines 19-30 (select + error + response).
- REPLACE WITH:
  ```ts
  const result = await haccpLookupsService.getCustomers()
  return NextResponse.json(result)
  ```
- Expected body: `{ customers: [...] }` id+name, name order.
- **R-F-D1 GUARD:** this route goes through `haccpLookupsService` → `HaccpLookupsRepository.listActiveCustomers`. Do **NOT** import or wire `lib/ports/CustomersRepository.ts` — that port is LIVE in Orders (`findCustomerById`, wired in `lib/wiring/orders.ts`) and is a different operation in a different bounded context. Cross-wiring it is a blocker.

### Step 6 — `supplier-code/route.ts` (read, `haccpSuppliersService`) — **note: NO try/catch in this route**
- Replace import: `supabaseService` → `haccpSuppliersService`. This route has NO `const supabase` line and NO try/catch (lines 12-32).
- KEEP: role gate (13-16, roles include `driver`), the `name` param parse + the name-required 400 (18-21).
- DELETE: lines 23-31 (the `.from('haccp_suppliers').select('label_code').ilike(...).maybeSingle()` + the inline `?? name.slice(0,4)` fallback + response).
- REPLACE WITH:
  ```ts
  const result = await haccpSuppliersService.getLabelCode(name)
  return NextResponse.json(result)
  ```
- Expected body: `{ label_code }` — DB code, else `name.slice(0,4).toUpperCase()`. The adapter's `findLabelCodeByName` ignores DB errors (returns null) so the fallback still fires — byte-identical to today (no try/catch, reads `data` only). **Do NOT add a try/catch** (byte-identity: the route has none today, and the adapter does not throw here).

### Step 7 — `recall/route.ts` (mutating, `haccpSuppliersService`) — GET + POST + PATCH
**GET:**
- KEEP role gate (20-23), try/catch.
- DELETE lines 25-49 (the `Promise.all` config+suppliers reads, the `PGRST116` branch, the error branches, the response).
- REPLACE WITH:
  ```ts
  const result = await haccpSuppliersService.getRecallContactList()
  return NextResponse.json(result)
  ```
- Expected: `{ config: <RecallConfig|null>, suppliers: [...] }`. The adapter returns `null` for the no-row (PGRST116) case and throws `ServiceError` for a real DB error → caught → `'Server error'` 500 (R6 / R-F-B7).

**POST (admin only):**
- KEEP: role+userId gate (60-64, `role !== 'admin' || !userId` → 403 "Admin only"), `const body = await req.json()` + destructure (66-72), the `Array.isArray` payload validation (74-76 → 400 "Invalid payload"), try/catch. **KEEP the wall-clock at the edge** — compute `const nowIso = new Date().toISOString()`.
- DELETE lines 78-106 (the payload object, the id-branch insert/update, the error branch, the response).
- REPLACE WITH:
  ```ts
  const nowIso = new Date().toISOString()
  const result = await haccpSuppliersService.saveRecallConfig(
    { id, internal_team, regulatory, other_contacts },
    userId,
    nowIso,
  )
  return NextResponse.json(result)
  ```
- Expected: `{ config: <savedRow> }`. The service builds `{ ...input, updated_by: userId, updated_at: nowIso }` and routes insert vs update on `id` presence — byte-identical written payload (verified PR9a).
- **Determinism note:** the route computes `nowIso` and injects it; the service never calls `new Date()`. Keep the edge `Array.isArray` validation BEFORE the service call (the service does not re-validate that — it's an edge concern, byte-identical to today).

**PATCH (admin only):**
- KEEP: admin gate (117-120 → 403), `const body = await req.json()` + destructure (122-128), the `if (!id)` 400 "Supplier ID required" (130-132), try/catch.
- DELETE lines 134-149 (the update with inline `?.trim() || null`, the select, the error, the response).
- REPLACE WITH:
  ```ts
  const result = await haccpSuppliersService.updateRecallSupplierContact({
    id, contact_name, contact_phone, contact_email,
  })
  return NextResponse.json(result)
  ```
- Expected: `{ supplier: { id, name, contact_name, contact_phone, contact_email } }`. The service applies `?.trim() || null` per field (byte-identical). Keep the edge `if (!id)` 400 (the input type requires id; the route's explicit 400 message stays at the edge, byte-identical).

### Step 8 — `admin/suppliers/route.ts` (mutating, `haccpSuppliersService`) — GET + POST + PATCH (NO DELETE)
- Replace import; delete `const supabase` (line 14). **KEEP the `isAdmin(req)` helper** (16-18) — it's an edge auth concern.

**GET:**
- KEEP admin gate (24), try/catch. DELETE lines 26-32 (select + error + response).
- REPLACE WITH:
  ```ts
  const result = await haccpSuppliersService.listSuppliers()
  return NextResponse.json(result)
  ```
- Expected: `{ suppliers: [...] }`.

**POST (create, returns 201):**
- KEEP admin gate (43), `const body = await req.json()` (45), try/catch.
- The name-required 400 ("Name is required") is now owned by the service reject — DELETE the inline `const name = (body.name ?? '').trim(); if (!name) …` (46-47) and the whole position-count + insert block (49-77).
- REPLACE WITH:
  ```ts
  const result = await haccpSuppliersService.createSupplier(body)
  if ('ok' in result && result.ok === false) {
    return NextResponse.json({ error: result.message }, { status: result.status })
  }
  return NextResponse.json(result, { status: 201 })
  ```
- Expected: `{ supplier: <row> }` status **201** on success; `{ error: 'Name is required' }` 400 on missing name. The service computes `position = count+1`, the `label_code.trim().toUpperCase().slice(0,6) || null`, all 13 `?? null` defaults, `active ?? true` (byte-identical written row, verified PR9a). **Keep the `, { status: 201 }`** on the success response at the route edge.

**PATCH (update):**
- KEEP admin gate (88), `const body = await req.json()` (90), try/catch.
- The id-required 400, the 16-key whitelist, and the "No valid fields to update" 400 are all now owned by the service — DELETE lines 91-117 (the destructure-onwards through the response).
- REPLACE WITH:
  ```ts
  const result = await haccpSuppliersService.updateSupplier(body)
  if ('ok' in result && result.ok === false) {
    return NextResponse.json({ error: result.message }, { status: result.status })
  }
  return NextResponse.json(result)
  ```
- Expected: `{ supplier: <row> }`; `{ error: 'id required' }` 400; `{ error: 'No valid fields to update' }` 400. The service applies the same 16-key whitelist in the same order (byte-identical).
- **R-F-D2 GUARD:** there is NO DELETE handler in this file today (it ends at PATCH, line 122) and the service has no delete method. Do **NOT** add one. The file header comment mentions "DELETE — deactivate" but no handler exists; leave it as-is (out of scope to even touch the comment).

### Step 9 — go green
`npx tsc --noEmit`; ESLint incl. `tests/unit/lint/no-adapter-imports.test.ts` (confirms no route imports an adapter); full unit suite; `npm run db:up && npm run db:reset` then the integration suite; `npm run build`; then the E2E matrix below on a prod-build preview.

> 🗣 **In plain English:** Flip the 6 read screens first (safest), then the 2 write screens. After each file, run the type-checker. Keep the cookie checks, the URL parsing, the wall-clock, and the HTTP status codes at the door; hand everything else to the pre-built brain. Then run the full ladder of checks.

---

## TDD test plan (ANVIL executes)

PR9b touches live routes, so unlike PR9a it runs the **full ladder**: unit (already green from PR9a) → integration (route wiring) → E2E.

### Unit
- The 3 PR9a service suites (`tests/unit/services/Haccp{Handbook,Suppliers,Lookups}Service.test.ts`) already pass and are the shaping seatbelt — re-run, no change expected.
- `tests/unit/lint/no-adapter-imports.test.ts` — must stay green; additionally confirm (manually or via a grep assertion) that none of the 8 routes still import `@/lib/adapters/supabase/client`.

### Integration (`tests/integration/haccp/` — new/extended)
For each of the 8 routes, against local Supabase: assert (a) the auth gate fires (no/invalid cookie → 401/403 as today), (b) the happy-path body shape + key order matches today, (c) for the mutating surfaces, the row actually written matches. Specifically:
- handbook: `?section=` → `{section, doc:null, entries}`; `?doc=` → `{section:null, doc, entries}`; neither → 400 "Missing section or doc parameter".
- search: `?q=a` → `{results:[]}`; valid q → `{results, query}`.
- documents: **bare array** assertion (`Array.isArray`).
- users: admins-first ordering preserved.
- customers: `{customers}` id+name, name order.
- supplier-code: matched name → DB code; unmatched → `slice(0,4).toUpperCase()`.
- recall GET: `{config, suppliers}`, config-null branch when no config row.
- recall POST: admin gate; non-array field → 400 "Invalid payload"; valid → row persisted with `updated_by`/`updated_at`.
- recall PATCH: admin gate; missing id → 400; valid → contact fields trimmed-or-nulled.
- admin/suppliers POST: missing name → 400 "Name is required"; valid → 201 + row with `position`, `label_code`, defaults.
- admin/suppliers PATCH: missing id → 400; empty update → 400 "No valid fields to update"; valid → whitelisted fields written.

### E2E — Hakan's standing rule (exhaustive browser-tap on the 2 mutating surfaces)
- **FULL exhaustive every-button browser-tap E2E on `recall` and `admin/suppliers` ONLY** (the 2 mutating GET/POST/PATCH surfaces) on the prod-build preview. Tap every screen, every button, open every modal.
- **NON-DESTRUCTIVE on the shared preview branch:** open add/edit modals → tap CANCEL (never submit); tap help/info/expand controls; verify lists render and the recall config + supplier table load. Do NOT submit a create/update/save against the shared preview DB. (Write paths are proven by the integration tests against a disposable local DB instead.)
- The other 6 surfaces are read-only GET → lighter coverage: a smoke that each screen/list loads and shows data is sufficient.
- Keep the `@critical` preview-smoke set green (the 3 specs + DB identity probe per `docs/runbooks/preview-smoke.md`).

### Build
`npm run build` green; `npx tsc --noEmit` green; lint green.

> 🗣 **In plain English:** PR9a's tests proved the brains. PR9b's tests prove the screens are correctly plugged into those brains — the cookie check still guards the door, the JSON still looks identical, and a write still lands the same row. On the two screens that can change data (recall, supplier admin) we click every button by hand in a real browser, but only safe buttons (Cancel, not Save) so we don't pollute the shared test database.

---

## Acceptance criteria

- [ ] 8 route files re-pointed; each imports its service from `@/lib/wiring/haccp` and NONE import `@/lib/adapters/supabase/client` (or any `@supabase/*`) afterwards.
- [ ] Happy-path response body + key order byte-identical to today for all 8 surfaces (handbook, search, documents [bare array], users [admins-first], customers, supplier-code [slice fallback], recall GET/POST/PATCH, admin/suppliers GET/POST [201]/PATCH).
- [ ] DB-error body is `{ error: 'Server error' }` 500 (R6), replacing the old raw `error.message` — stated explicitly in the ship record as the one sanctioned delta.
- [ ] `supplier-code` keeps NO try/catch and adds none; its DB-error path still falls back to the name slice (adapter returns null).
- [ ] recall POST keeps the edge `Array.isArray` validation and computes `nowIso` at the edge; admin/suppliers POST keeps the `, { status: 201 }`.
- [ ] NO DELETE handler added to admin/suppliers (R-F-D2); customers routes through `haccpLookupsService`, NOT the Orders `CustomersRepository` (R-F-D1).
- [ ] No file under `lib/`, no migration, no `.eslintrc.json`, no `package.json` change.
- [ ] Full ladder green: unit (3 PR9a suites + lint) · integration (8 surfaces) · E2E (exhaustive non-destructive taps on recall + admin/suppliers, smoke on the 6 reads) · build.
- [ ] `no-adapter-imports` lint test green.

---

## Risk Assessment (mandatory)

### Concurrency / race conditions
- **R-F-C1 (low, no must-fix):** `createSupplier` does a non-atomic `count` → `insert position=count+1` (two concurrent creates could collide on position). This is the route's pre-existing behaviour, lifted verbatim into the service in PR9a. PR9b must NOT change it. **Mitigation:** unchanged; note for a future hardening ticket. **No must-fix.**

### Security
- **R-F-S1 (low):** Supplier-contact PII + `users.name` flow through these routes. PR9b changes no `.select()` column list (those live in the untouched adapters). **Mitigation:** confirm via diff that no route adds/removes a column. **No must-fix.**
- **R-F-S2 (low):** Service-role (RLS-bypassing) singletons — unchanged from today's route access, ADR-0004-sanctioned deferral to F-RLS-04h. The auth gates (cookie role checks, admin-only on recall POST/PATCH + all of admin/suppliers) stay at the route edge and are PRESERVED verbatim. **Mitigation:** integration tests assert each gate still fires. **No must-fix.**

### Data migration
- **None.** PR9b adds no migration and changes no schema. **No material risks in this category.**

### Business-logic flaws (the real surface — happy-path byte-identity)
- **R-F-B1 (medium):** `documents` returns a **bare array**, not `{documents:[...]}`. Re-pointing to a method that wraps it would break the screen. **Mitigation:** call `getDocuments()` (which returns a bare array) and `NextResponse.json(documents)` directly; integration test asserts `Array.isArray`. **No must-fix on the plan** (test-pinned), but the single most error-prone shape — call it out to the implementer.
- **R-F-B2 (medium):** Write-payload exactness on the auditor-facing registers (recall POST/PATCH, admin/suppliers POST/PATCH). **Already code-critic-verified byte-for-byte in PR9a.** PR9b's risk is mis-passing the inputs (e.g. forgetting to compute `nowIso` at the edge, or passing `body` instead of the destructured fields). **Mitigation:** follow the exact call signatures in "Service method contracts"; integration tests assert the persisted row. **No must-fix.**
- **R-F-B3 (low):** The reject-object handling. Routes that call `getHandbook`/`createSupplier`/`updateSupplier` get back EITHER a success object OR a `{ ok:false, status, message }` reject and must branch with `if ('ok' in result && result.ok === false)`. Forgetting the branch would return a reject object as a 200 body. **Mitigation:** the three reject-returning calls are enumerated explicitly in Steps 1, 8(POST), 8(PATCH); integration tests assert the 400 path. **No must-fix.**
- **R-F-B4 (low):** users admins-first sort — owned by the service (PR9a, tested). PR9b just calls `getUsers()`. **Mitigation:** integration assertion on ordering. **No must-fix.**
- **R-F-B5 (low):** recall `getRecallConfig` null (PGRST116) vs real DB error — owned by the adapter (PR9a). PR9b inherits it. **Mitigation:** integration test for the config-null branch. **No must-fix.**
- **R-F-B6 (low):** `supplier-code` adding a spurious try/catch or error-throw would change its error-swallowing behaviour (it must fall back to the name slice). **Mitigation:** Step 6 explicitly forbids adding a try/catch; the adapter's `findLabelCodeByName` deliberately ignores errors. **No must-fix.**
- **R-F-B7 (medium, INFORMATIONAL — sanctioned delta, NOT a flaw):** DB-error body changes from raw Postgres `error.message` → `{ error: 'Server error' }` (R6 / R6 house style). This is the ONE intentional non-byte-identical behaviour, identical to Cluster A–E. **Mitigation:** state it plainly in the ship record; do not "restore" the raw message. **No must-fix** — it is the intended posture, not a defect.

### Launch blockers
- **R-F-D1 (informational, NOT a blocker):** `customers/route.ts` must go through the new `HaccpLookupsRepository.listActive` (via `haccpLookupsService`), NOT the Orders-owned `lib/ports/CustomersRepository.ts` (live in Orders, `findCustomerById`). The plan wires it correctly (Step 5). Cross-wiring would be a Gate-2 blocker — flagged to the implementer. **No blocker as planned.**
- **R-F-D2 (informational, NOT a blocker):** `admin/suppliers/route.ts` has NO DELETE handler (ends at PATCH, line 122). The hexagon has no delete method. The plan adds none (Step 8). **No blocker.**
- **R-F-L1 (none):** No eslint allow-list edit needed (no new vendor). Confirmed. **No blocker.**

### Risk headline
**No Gate-2-blocking must-fix risks.** PR9b is a thin, mechanical re-point of 8 handlers onto pre-built, already-tested services. The two highest-attention items are R-F-B1 (the `documents` bare array — the easiest shape to break, test-pinned) and R-F-B2/R-F-B3 (passing the exact inputs + branching on the reject objects for the 4 mutating handlers). The one deliberate behaviour delta is R-F-B7 (DB-error body → `'Server error'`), the established R6 house posture across Cluster A–E — an improvement, to be documented, not reverted. The two corrected scout premises (R-F-D1 customers → HACCP lookups; R-F-D2 no DELETE) are wired correctly by the plan, neither a blocker.

---

## Hexagonal verdict (populates Gate 2)

- **Ports used/added:** USES the three PR9a ports — `HaccpHandbookRepository`, `HaccpSuppliersRepository`, `HaccpLookupsRepository` — via their service singletons. ADDS no port. Explicitly does NOT touch the Orders-owned `CustomersRepository` or the auth-context `UsersRepository` (R-F-D1).
- **Adapters used/added:** USES the PR9a Supabase adapters via wiring. ADDS no adapter, edits no adapter.
- **New dependencies:** **NONE.** No `package.json` entry, no new vendor, no `.eslintrc.json` change. `@supabase/supabase-js` is REMOVED from the 8 routes (confined to `lib/adapters/supabase/` as the FREEZE rule requires).
- **Rip-out test:** After PR9b, the 8 HACCP docs/lookups surfaces reach the DB ONLY through the 3 ports. Swapping the DB for any sub-domain = one new `lib/adapters/<vendor>/Haccp{Handbook|Suppliers|Lookups}Repository` + one wiring line in `lib/wiring/haccp.ts`. Routes, services, ports, domain types untouched. **RESULT: PASS** — and PR9b is precisely the PR that *realises* this PASS (PR9a built the sockets; PR9b unplugs the routes from the wall and into the sockets).
- **Gate-2 verdict:** **PASS — no blocker.** No new/unjustified/unwrapped dep; rip-out PASSes (and is now fully realised); no must-fix risk; the two corrected premises are wired correctly. The one sanctioned behaviour delta (R6 DB-error body) is documented, not a blocker.

> 🗣 **In plain English:** No new libraries, no rulebook edits. Before this PR, 8 screens reached straight into the database; after it, they all go through one of three swappable plugs. Replacing the database for the handbook, the supplier book, or the pick-lists is now a one-plug-one-wire change — and this is the PR that makes that true. Green.
