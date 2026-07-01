# Delivery Signoff — Frame Spec (T2 → T1 handoff)

**Status:** Frame complete (T2 planning terminal). Ready for T1 FORGE.
**Date:** 2026-06-30
**Author:** T2 relay (spec only — no code written here)
**Scope:** 3 FORGE units, build in order. T1 runs FORGE→ANVIL on each.

> This is a **Frame-level spec**: it pins down *what* and *why* and the decisions Hakan
> made, so T1's FORGE Frame gate is a fast confirm. It deliberately does **not**
> prescribe file-level implementation — that is T1's Order/Render job. Where it names
> existing files, that is reuse-surface intel from the T2 codebase recon, not a mandate.

---

## 1. Purpose (the one-liner)

Turn the driver screen from a **read-only navigator** ("drivers navigate, they don't
report" — `app/driver/page.tsx:3-12`) into a screen that **captures a proper proof-of-delivery
signoff at every stop**, works **offline**, and feeds **driver-collected payments** into the
office's existing cash/cheque books as a confirmed, auditable handoff.

Real-world driver: arrives at a stop → taps the stop → fills the signoff (payment, name,
signature, photo, fridge/freezer temps) → taps Done → moves to the next stop. Back at the
depot (in signal), the app flushes everything to the server. The office then "receives" the
cash/cheques the driver hands over, and anyone can view the delivery record later.

---

## 2. Current state (verified by recon, 2026-06-30)

- **Driver screen** `app/driver/page.tsx` — read-only manifest. Per-stop `[Navigate]` Google
  Maps deep link. No reporting back. No signoff concept anywhere in the app.
- **Routes/stops data model** (`supabase/migrations/20260101000000_baseline.sql`):
  `routes` (assigned_to one driver) → `route_stops` (→ `customers`, `position`, `priority`,
  `estimated_arrival`). Each stop has a **dead `visited` boolean** — selected and echoed in
  reads but **never written `true`** by any code path. This is our free progress hook.
  Domain: `lib/domain/Route.ts`; port `lib/ports/RoutesRepository.ts` (+ contract).
- **A stop links to a customer only** — name + postcode + lat/lng. **No order link, no item
  list, no phone/contact, no time window.** Payment amount is therefore **free entry** (nothing
  to reconcile against in v1).
- **Cash & cheque** `app/cash/page.tsx` — two tabs. Cash tab = monthly cash book of
  income/expense `cash_entries`. Cheque tab = `cheque_records` register; **"logging IS
  receiving — no confirm step"** (`app/api/cash/cheques/route.ts:5-6`); only second state is
  `banked`. **No draft/pending state, no collector→office handoff, no card concept** exists today.
  Stack: `lib/domain/Cash.ts` → `lib/ports/CashRepository.ts` → `lib/services/CashService.ts`
  → `lib/adapters/{supabase,fake}/CashRepository.ts` → `lib/api/cash/dto.ts` → routes → page.
- **Offline outbox** — EXISTS and is reusable, but **JSON-only**:
  - `lib/ports/LocalCache.ts` (`QueuedRecord` { localId, screen, payload, synced, retries });
    `screen` is a **closed union** `screen1|screen2|screen3|screen2_resolve`.
  - `lib/adapters/dexie/LocalCache.ts` — Dexie DB `mfs-ops`, schema **v2**; `.stores()` strings
    are **SACRED (R3)** — never edit in place, only add a new `version(n)`.
  - `lib/syncEngine.ts` — `triggerSync()` POSTs each record's JSON to a per-`screen` endpoint
    (`ENDPOINT` map), guards on `navigator.onLine`, max 3 retries, marks `synced:true` on 2xx.
    **No service-worker background sync** — the app must be **open + online** to flush.
  - UI: `components/ui/SyncDot.tsx`, `hooks/useSyncStatus.ts`, `lib/adapters/dexie/react.ts`.
- **Photo / camera / signature** — effectively **none**. Only file input in the app is the
  Cash receipt picker (`app/cash/page.tsx:182`, **online-only** multipart POST). No camera
  capture, no signature pad anywhere. Both must be built.
- **Supabase Storage** — exactly **one bucket `cash-attachments`** (hard-coded in
  `lib/adapters/supabase/AttachmentStorage.ts:30`), created manually in the dashboard (no
  buckets migration exists). Port `lib/ports/AttachmentStorage.ts` takes `Uint8Array`. No
  photo bucket exists yet.

---

## 3. Decisions (Hakan, locked at Frame)

### 3.1 The signoff form (driver, per stop)

Default outcome is **delivered**. For a **successful** delivery, **every field is hard-required**
— the Done button is blocked until all are filled:

| Field | Rule |
|---|---|
| **Payment method** | exactly one of `CASH · CHEQUE · CARD · NO PAYMENT` |
| **Payment amount** | required **unless** method = NO PAYMENT; hidden/disabled when NO PAYMENT. GBP, free entry |
| **Recipient name** | required, free text |
| **Signature** | required, finger-drawn on screen |
| **Photo(s)** | required — **at least one**, a **couple allowed** (multiple) |
| **Temperature** | `Chiller °C` and/or `Freezer °C`; ticking a compartment makes its °C required. **`Ambient` tick → both temps greyed out** and not required (dry/ambient drop) |

- **Couldn't-deliver:** a **small corner tick + short reason** (e.g. closed / refused / nobody
  home / other). When ticked, the form asks for **nothing else** — no payment/sig/photo/temp.
  Keep it light; it must not feel like an extra step. Failed stops still record (office sees them).
- **On Done:** the signoff **locks**. Editing a locked signoff requires the **master PIN `1907`**.
  Completing a successful signoff **ticks `route_stops.visited = true`** → route shows progress
  ("7 of 9 delivered").
- **Lock granularity:** locked the moment the driver taps Done (before sync). Re-open = enter 1907.

### 3.2 Offline (REQUIRED)

- The whole signoff — **including photo(s) and signature** — must **save on the device** and
  **sync later** when the app is reopened in signal. Reuse the existing Dexie outbox + `triggerSync`
  pattern, extended to carry **binary** (photo/signature blobs).
- **Accepted constraints** (Hakan signed off knowingly):
  - No background sync — **the app must be open + online to flush** (matches existing discrepancy
    flow). Driver reopens the app back at the depot; the SyncDot shows pending count.
  - **Photos are auto-shrunk** (compressed/resized client-side) before storing/uploading, so a
    day of drops doesn't fill the phone or choke sync.

### 3.3 Payments → office handoff (Option A: staging tray)

Driver-collected payments **do not** write straight into the books. They land in a **new pending
staging tray**. The office works the tray and **confirms** each one, which is the moment it
becomes a real book entry:

| Method | Destination on office confirm |
|---|---|
| **CASH** | confirm (records **taken by** + **taken** date) → becomes a **cash-book income entry** (`cash_entries`) |
| **CHEQUE** | confirm (records **taken by** + **taken** date) → becomes a **cheque-register row** (`cheque_records`) |
| **CARD** | **no confirm** — appears as a **log only** in a **new "Card Payments" tab** on `/cash` |

- **"Taken by"** = the office user who physically receives the cash/cheque from the driver.
  **"Taken"** = that confirmation moment (who + when). Card has no physical handover, so no taken step.
- The staging record carries enough to confirm: amount, method, **customer**, **driver**,
  **route/stop reference**, captured-at. This keeps the existing clean cash/cheque model
  untouched until the office promotes a record into it.

### 3.4 Deliveries view

- A **new page**, visible to **everyone** (not admin-only). Fine-grained permissions to be
  sorted later ("we will sort that too"). Reads back every completed signoff: payment, name,
  signature, photo(s), temps, outcome (delivered / couldn't-deliver + reason), stop/customer/driver.

### 3.5 Out of scope (v1)

- **Live progress dashboard** — comes later via purchased GPS trackers, not this build.
- **Audit/CSV export** of temperature/signoff records — **not needed** for v1 (on-screen only).
- **Order/item linkage** — stops don't link to orders; amount stays free entry.
- **Server-side PIN enforcement** — `1907` is a client-side "key under the doormat" master
  unlock. Acceptable for an internal ops tool. *If real security is wanted later, the check
  moves server-side.* (Noted, not built.)

---

## 4. The three FORGE units (build in order)

### Unit 1 — Signoff capture + offline + data model + `visited`
**Ships:** drivers can sign off each stop offline; data syncs to the server; route shows
"N of M delivered"; payments captured here land in the **pending staging tray** (table created
in this unit, consumed by Unit 3).

Likely surface (T1 to confirm in Order):
- New domain types (`DeliverySignoff`, outcome, temps, payment capture) in `lib/domain/`.
- New port(s): a delivery-signoff repository + the payment-collections staging repository,
  with fake + contract.
- New Supabase adapter(s) + migration: `delivery_signoffs` table (FK → route_stop / customer /
  driver), `payment_collections` staging table (status `pending`), + RLS. Full-14-digit
  migration filename.
- **Photo storage**: a new bucket (e.g. `delivery-photos`) — the `AttachmentStorage` adapter's
  bucket name is currently **hard-coded** to `cash-attachments`; this must be parameterised so a
  second bucket can exist without breaking the rip-out test. Signatures may store as a small
  PNG/data-URL in the same bucket or inline — T1's call.
- **Offline binary**: new Dexie `version(3)` table for binary payloads (existing v1/v2 `.stores()`
  strings stay byte-identical — R3). Extend `QueuedRecord.screen` union + `syncEngine` `ENDPOINT`
  map with a new `delivery_signoff` screen + server `/sync` route. Reuse SyncDot/useSyncStatus.
- **Capture UI**: signature pad (built from scratch — canvas/pointer events) and camera/photo
  capture (`<input type=file accept=image capture=environment>` + client-side compression),
  both added to `components/ui/` per ADR-0014 Rule 3 (reusable visual primitives live in the kit).
- Writes `route_stops.visited = true` on successful completion; lock + `1907` unlock gate.

### Unit 2 — Deliveries view page (read-only, everyone)
**Ships:** a new page that lists/reads back signoffs captured in Unit 1. Small, read-only.
Resolves signed URLs for photos/signature. No write paths.

### Unit 3 — Office money handling
**Ships:** the office empties the pending tray. A pending list + **confirm** action that records
**taken by/taken** and promotes CASH → `cash_entries` and CHEQUE → `cheque_records`; plus the new
**"Card Payments" tab** (log only) on `/cash`. Extends the existing
`lib/domain/Cash.ts → CashRepository → CashService → dto → app/cash` stack rather than replacing it.

---

## 5. Acceptance criteria (the "is it done" test per unit)

**Unit 1**
- A driver can complete a full signoff (all required fields) for a stop **with no signal**; it
  persists on device and the SyncDot shows it pending.
- On reopening the app in signal, the signoff (incl. photo[s] + signature) syncs; server has the
  record; the stop's `visited` is `true`; payment (if any) exists in `payment_collections` as
  `pending`.
- Ambient tick greys out temps and lets Done proceed; chiller/freezer tick forces their °C.
- Couldn't-deliver tick records outcome + reason with no other fields and is the only escape hatch.
- Locked-after-Done; `1907` reopens; wrong PIN does not.
- **Rip-out test holds** for every new external dependency (storage bucket, etc.): one adapter +
  one wiring line.

**Unit 2**
- Everyone (current roles) can open the Deliveries page and see each signoff's full detail,
  including rendered photo(s) and signature, payment, temps, outcome, and stop/customer/driver.

**Unit 3**
- A pending CASH collection can be confirmed (taken by + taken recorded) and appears as a
  cash-book income entry; a pending CHEQUE likewise becomes a cheque-register row.
- A CARD collection shows in the new Card Payments tab as a log (no confirm step).
- Existing cash/cheque behaviour is byte-identical where untouched.

---

## 6. Architecture guardrails (non-negotiable — CLAUDE.md / ADR-0002)

- UI → service/usecase → adapter. `lib/domain/**` and `lib/ports/**` never import adapters;
  `app/**`/`components/**` never import adapters directly. Vendor SDKs only in `lib/adapters/<vendor>/`.
- Every new external dependency behind a port the app owns; wired only in `lib/wiring/`.
  Rip-out = one adapter + one wiring line.
- New `package.json` entries (e.g. an image-compression lib, if used) need a written one-line
  justification; single-use vendor libs sit behind an owned `lib/adapters/<vendor>/` wrapper.
- Reusable visual primitives (signature pad, camera control) defined in `components/ui/` and
  consumed from its barrel (ADR-0014 Rule 3; enforced by
  `tests/unit/lint/reusable-visual-in-kit.test.ts`).
- Migration filenames: full 14-digit `YYYYMMDDHHMMSS_name.sql`.

---

## 7. Open risks / things for T1 to resolve at Order

1. **`AttachmentStorage` bucket is hard-coded** — must be parameterised to add a second
   (delivery-photos) bucket cleanly. Bucket creation today is manual-dashboard (no migration);
   decide whether to add a buckets migration or document the manual step.
2. **Binary in the outbox** — the existing sync engine POSTs JSON; carrying photo bytes means
   either base64-in-JSON (simple, larger) or multipart per record (leaner). T1 to choose; mind
   the 3-retry idempotency (localId as PK).
3. **Route data offline** — the driver loads `/api/routes/today` online; a cold reload offline
   would lose the manifest (no SW asset caching). v1 assumption: load before leaving / keep app
   open. Flag if that's not acceptable — would need reference-data caching of the route.
4. **Image compression target** — pick a sensible max dimension/quality so photos stay well under
   the 10MB storage limit and sync fast on poor signal.
5. **`payment_collections` ↔ books linkage** — when the office confirms, decide whether to keep a
   back-link from the created `cash_entries`/`cheque_records` row to the staging record (audit trail)
   or just flip the staging status to confirmed.

---

## 8. Handoff

T1 starts **Unit 1** under FORGE. This doc is the Frame input — T1 confirms scope at Gate 1,
plans at Order, builds at Render, Guards, then ANVIL per the standing "FORGE+ANVIL for production
work" rule (this touches prod DB, storage, auth/RLS, and a new offline write path — full loop, not
frame-light).
