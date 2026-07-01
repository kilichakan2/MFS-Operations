# FORGE plan — /haccp/process-room UI Phase 1 (Tier B rebuild + DB-driven thresholds)

- **Date:** 2026-07-01
- **Slug:** haccp-process-room-ui-phase1
- **Tier:** B (build straight on the design system — NO Claude Design mockup; ADR-0014 Rule 2)
- **Sibling reference (just shipped):** `/haccp/cold-storage` (#108 `d90c0aa`) — this rebuild MIRRORS its structure, kit usage, shared-constant + DB-driven-threshold patterns.

> 🗣 **In plain English:** we are rebuilding the Process Room screen the same way we just rebuilt Cold Storage — same look (the design system), same plumbing (one socket for the database) — and we are moving the temperature pass/fail limits out of the code and into a database table an admin can edit. Nothing the staff do on the screen changes in feel; a lot changes underneath so limits can be updated without a developer.

---

## 1. Goal

Rebuild `app/haccp/process-room/page.tsx` onto the shared design system (kit `NumberPad` + `Modal`, semantic tokens, dark theme inherited from `app/haccp/layout.tsx`), and move the CCP-3 temperature pass/amber/critical limits out of hardcoded page + service logic into a new DB table (`haccp_process_room_thresholds`) that an **admin** can edit (audit-logged, with an on-save reminder to update the compliance register). Preserve every existing behaviour of the two independent forms (Temperature check + Shift diary) and the corrective-action pop-up. Extract the duplicated cause list into `lib/domain`. Add temperature range validation (client + server). Delete dead code. Port the race-proof `enterSession` E2E helper to spec 16.

> 🗣 **In plain English:** make the screen match the rest of the app, let an admin change the temperature limits without a code release (safely, with a paper trail), and keep every button doing exactly what it does today.

---

## 2. Domain terms (plain-English glossary for this plan)

- **Port** = `lib/ports/HaccpDailyChecksRepository.ts` — the interface the app owns for reading/writing the HACCP daily-check tables. 🗣 The socket shape the business logic insists on; the database has to fit it.
- **Adapter** = `lib/adapters/supabase/HaccpDailyChecksRepository.ts` (real) + `lib/adapters/fake/HaccpDailyChecksRepository.ts` (test double). 🗣 The actual plugs — one for the live Supabase database, one fake for tests.
- **Wiring** = `lib/wiring/haccp.ts` — the one place adapters are bolted to services. 🗣 The fuse box; the only spot allowed to know which database vendor we use.
- **Band derivation** = turning a temperature number into `pass` / `amber` / `critical` using the row's `target_temp_c` + `max_temp_c`. 🗣 The traffic-light rule: green / amber / red.
- **CCP 3** = Critical Control Point 3 (process-room temperature). **SOP 1** = the shift diary. 🗣 The two legally-required checks this screen captures.
- **RLS** = Row-Level Security — Postgres rules that decide who can read/write each row. 🗣 A bouncer on every table row, independent of the app code.
- **`is_admin()` / `current_user_is_active()`** = existing Postgres helper functions used inside RLS policies. 🗣 Two door-checks: "are you an admin?" and "are you a real, active staff member?"

---

## 3. Compliance flags

- **CCP 3 temperature limits are a regulatory control.** `docs/reference/haccp/DOCUMENT_CONTROL.md` §4 currently records the hardcoded limits (Product ≤4°C, Room ≤12°C, both citing Reg 853/2004) and §8 audit checklist has an item "Temperature limits in the app match this register (section 4)". Moving limits to a DB table **breaks that hardcoded-guarantee** unless we (a) seed the table to the current-approved values and (b) reinstate the control as an on-save reminder + audit log. 🗣 The rule that stopped anyone quietly changing a food-safety limit was "it's in the code, changing it needs a developer + a doc update". We are replacing that guard with "an admin can change it, but every change is logged and the admin is reminded to update the register + retrain staff."
- **Band change to the Product point is a regulatory decision (see Risk R-1, must-fix).** Product gains an amber zone (4–7°C) it did not have before. This must be reflected in DOCUMENT_CONTROL §4 and §7 change log before ship. 🗣 Today product is pass-or-critical at 4°C; after this it is pass ≤4 / amber 4–7 / critical >7 — that is a genuine food-safety limit change and must be written into the register, not just the code.

---

## 4. ADR conflicts

- **ADR-0002 (hexagonal shape + naming):** No conflict. All new DB access flows Route → `lib/wiring/haccp.ts` singleton → `HaccpDailyChecksService` → `HaccpDailyChecksRepository` port → Supabase/Fake adapters. Vendor SDK (`@supabase/*`) stays inside `lib/adapters/supabase/` only. New domain types are pure TS in `lib/domain/`. 🗣 We reuse the existing socket; nothing points the wrong way.
- **ADR-0014 (kit-only consumption + tiered workflow):** No conflict. Tier B is correct (the screen makes no new visual decision the system hasn't decided — it mirrors cold-storage). Rule 1 (kit-only) is honoured: `NumberPad`/`Modal`/`Button`/`Badge`/`Banner`/`SegmentedControl`/`Textarea`/`Spinner`/`IconButton` from `components/ui`; semantic tokens only; no hardcoded colours (the literal `#EB6619` and raw `bg-green-*`/`bg-amber-*`/`bg-red-*` all go). The tick/cross checklist row is **single-screen** (no cold-storage analogue, used nowhere else) → composed from existing kit primitives + page-local non-exported glyphs (exactly like cold-storage's local `CheckGlyph`); it is NOT promoted to `components/ui/` because a single-use pattern is not a shared visual (ADR-0014 Rule 3 triggers only for *shared* patterns; promoting speculatively is the rejected "speculative seam"). 🗣 Every visible piece comes from the shared kit; the one bespoke thing (the yes/no checklist row) is used only here, so it stays local — we don't add it to the shared kit until a second screen needs it.
- Lint guards that will police this: `tests/unit/lint/no-adapter-imports.test.ts`, `tests/unit/lint/reusable-visual-in-kit.test.ts`, `tests/unit/migrations/filename-convention.test.ts`.

---

## 5. Files touched / created

### Created
1. `lib/domain/processRoom.ts` — shared causes, entry bounds, `isProcessRoomTempInRange`, band helper `processRoomBand`, `ProcessRoomThreshold` type.
2. `supabase/migrations/20260701120000_haccp_process_room_thresholds.sql` — new thresholds table + seed(2) + audit table + RLS + grants.
3. `app/api/haccp/admin/process-room-thresholds/route.ts` — admin GET (list all) + PATCH (edit), audit-logged.
4. Test files (see §8 test matrix): unit specs for band/range/causes; integration spec for the thresholds route + process-room submit; pgTAP spec for the new RLS; E2E edits to spec 16.

### Modified
5. `lib/domain/index.ts` — re-export the new `processRoom.ts` values/types + the `ProcessRoomThreshold` type.
6. `lib/domain/HaccpDailyCheck.ts` — add `thresholds` to `ProcessRoomListResult`; add `ProcessRoomThreshold`, `UpdateProcessRoomThresholdInput`, `ProcessRoomThresholdPersist` types (or place the row type in `processRoom.ts` and the persist/input here — see step 1 note).
7. `lib/ports/HaccpDailyChecksRepository.ts` — add `listActiveProcessRoomThresholds`, `listAllProcessRoomThresholds`, `updateProcessRoomThreshold`.
8. `lib/ports/__contracts__/HaccpDailyChecksRepository.contract.ts` (if present) — extend the shared contract for the 3 new methods.
9. `lib/adapters/supabase/HaccpDailyChecksRepository.ts` — implement the 3 methods (+ audit-row insert inside `updateProcessRoomThreshold`); extend `listProcessRoom` to also load thresholds.
10. `lib/adapters/fake/HaccpDailyChecksRepository.ts` — implement the 3 methods + seedable `processRoomThresholds`; include `thresholds` in the process-room list.
11. `lib/services/HaccpDailyChecksService.ts` — band-aware `validateProcessingTemp` / `buildProcessingTemp` / `buildProcessingTempCorrectiveActions` (thresholds-driven); shared-cause set from `PROCESS_ROOM_CAUSES`; range guard via `isProcessRoomTempInRange`; new `listProcessRoomThresholds` + `validateProcessRoomThreshold` + `updateProcessRoomThreshold` service methods; extend `listProcessRoom` passthrough to carry thresholds.
12. `lib/wiring/haccp.ts` — no new wiring line needed (the daily-checks adapter is already bound); confirm the new methods reach the existing `createSupabaseHaccpDailyChecksRepository(client)` binding. (If a new admin-only service surface is preferred, it still reuses `haccpDailyChecksServiceForCaller`.)
13. `app/api/haccp/process-room/route.ts` — GET returns `thresholds`; POST `type='temps'` loads thresholds and passes them into validate/build (mirrors the cold-storage units flow).
14. `app/haccp/process-room/page.tsx` — full rebuild (kit + tokens + DB-driven bands + dead-code removal).
15. `app/haccp/admin/page.tsx` — add a "Process Room Thresholds" tab/section (mirror the Suppliers CRUD) + on-save reminder.
16. `docs/reference/haccp/DOCUMENT_CONTROL.md` — §4 limits table updated to the new bands; §7 change log entry (must-fix, R-1).
17. `tests/e2e/16-haccp-process-room.spec.ts` — port `enterSession` for AM/PM temps + the 3 diary phases.

---

## 6. Hexagonal answer block (populates Gate 2)

- **Port used/added:** `HaccpDailyChecksRepository` (existing) — **extended**, not replaced, with `listActiveProcessRoomThresholds()`, `listAllProcessRoomThresholds()`, `updateProcessRoomThreshold()`. No new port. 🗣 We widen the existing socket rather than cut a new one.
- **Adapter(s):** `lib/adapters/supabase/HaccpDailyChecksRepository.ts` (real) + `lib/adapters/fake/HaccpDailyChecksRepository.ts` (test). Both already wired in `lib/wiring/haccp.ts` via `createSupabaseHaccpDailyChecksRepository(client)`. 🗣 Same two plugs already in the fuse box; we just teach them the new table.
- **New dependencies (`package.json`):** **NONE.** Everything uses the existing `@supabase/*` client (adapter-only), the existing kit, and pure TS domain. 🗣 No new outside libraries — nothing to justify.
- **Rip-out test:** **PASS.** Swapping the DB vendor = write one new adapter satisfying `HaccpDailyChecksRepository` (now including the 3 threshold methods) + the wiring lines that already exist in `lib/wiring/haccp.ts`. The new table adds methods to the SAME port, so it does not add a second wiring seam. Services, use-cases, domain, ports, UI unchanged. 🗣 If we replaced Supabase tomorrow, it's still "one adapter + the wiring already there" — the new table rode the existing socket, so the count didn't go up.

---

## 7. Ordered, atomic steps (each = one commit; TDD red→green)

> Order is bottom-up so each layer compiles against the one below. Every step lists its own tests.

### Step 1 — Domain constant + threshold type + band helper
**File:** `lib/domain/processRoom.ts` (new), `lib/domain/index.ts`, `lib/domain/HaccpDailyCheck.ts`.
- Create `processRoom.ts` mirroring `coldStorage.ts`:
  - `export const PROCESS_ROOM_CAUSES = ['A/C or cooling failure','Doors left open','Product held in room too long','Batch too large','Equipment failure','Power interruption','Other'] as const` (byte-identical to the current two copies).
  - `export type ProcessRoomCause = (typeof PROCESS_ROOM_CAUSES)[number]`.
  - `export const PROCESS_ROOM_MIN_TEMP_C = -50; export const PROCESS_ROOM_MAX_TEMP_C = 50;` (spec-stated fat-finger bounds; wider than cold-storage's −40..30 because the room-ambient point can read warmer).
  - `export function isProcessRoomTempInRange(temp: number): boolean` — finite && within [MIN,MAX].
  - `export interface ProcessRoomThreshold { id: string; name: string; target_temp_c: number; max_temp_c: number; active?: boolean; position?: number }`.
  - `export function processRoomBand(temp: number, targetC: number, maxC: number): 'pass' | 'amber' | 'critical'` — `temp <= targetC ? 'pass' : temp <= maxC ? 'amber' : 'critical'` (identical shape to the service's `coldStorageTempStatus`). **Note the improvement over cold-storage:** we put band derivation in the *domain* so BOTH the client screen and the server service consume the one copy — this is the exact anti-drift move DELTA 3 asks for, applied to the band logic too.
- Barrel: add value exports (`PROCESS_ROOM_CAUSES`, `PROCESS_ROOM_MIN_TEMP_C`, `PROCESS_ROOM_MAX_TEMP_C`, `isProcessRoomTempInRange`, `processRoomBand`) + type exports (`ProcessRoomCause`, `ProcessRoomThreshold`) to `lib/domain/index.ts`.
- In `HaccpDailyCheck.ts`: add `thresholds: readonly ProcessRoomThreshold[]` to `ProcessRoomListResult`; add `UpdateProcessRoomThresholdInput` (`{ id: string; target_temp_c?: number; max_temp_c?: number; active?: boolean }`) and `ProcessRoomThresholdPersist` if the adapter needs a distinct persist shape.
- **Decision on `CCP3_RECURRENCE_BY_CAUSE` (DELTA 3 tail):** KEEP it page-local. It is UI-only (drives which recurrence buttons appear) with no server counterpart, so extracting it to domain buys zero anti-drift value — cold-storage deliberately left its `RECURRENCE_BY_CAUSE` in the page for the same reason. Only the *cause list* (which the server validates) and the *band logic* (which the server derives) are shared. 🗣 We only move the two things both the screen and the server must agree on; the recurrence menu is screen-only, so it stays on the screen.
- **TDD:** `tests/unit/domain/processRoom.test.ts` — RED first: assert `PROCESS_ROOM_CAUSES` has 7 entries; `isProcessRoomTempInRange(-50/50)===true`, `(-51/51/NaN)===false`; `processRoomBand`: `3→pass`, `4→pass`, `5→amber`, `7→amber`, `7.1→critical` (product 4/7) and `12→pass`, `13→amber`, `15→amber`, `16→critical` (room 12/15).

### Step 2 — Migration: table + seed + audit + RLS + grants
**File:** `supabase/migrations/20260701120000_haccp_process_room_thresholds.sql` (new). **14-digit timestamp — mandatory** (short form is banned; breaks preview resync; `filename-convention.test.ts` enforces).
- `CREATE TABLE IF NOT EXISTS public.haccp_process_room_thresholds (id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY, name text NOT NULL, target_temp_c numeric(4,1) NOT NULL, max_temp_c numeric(4,1) NOT NULL, active boolean DEFAULT true NOT NULL, position integer DEFAULT 0 NOT NULL, CONSTRAINT haccp_process_room_thresholds_band_check CHECK (target_temp_c <= max_temp_c));` — mirrors `haccp_cold_storage_units` shape; adds a DB-level `target <= max` sanity constraint.
- `ALTER TABLE ... OWNER TO postgres;`
- **Seed 2 rows (idempotent — guard so `db:reset` + preview resync don't duplicate):**
  - `Product core` — target 4.0, max 7.0, position 1.
  - `Room ambient` — target 12.0, max 15.0, position 2.
  - Use `INSERT ... WHERE NOT EXISTS (SELECT 1 FROM ... WHERE name = ...)` (or `ON CONFLICT` on a unique `name`) so re-runs are safe.
- **Audit table (DELTA 2 mechanism — decision + why below):**
  - `CREATE TABLE IF NOT EXISTS public.haccp_threshold_audit (id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY, threshold_id uuid NOT NULL, changed_by uuid NOT NULL, changed_at timestamptz DEFAULT now() NOT NULL, old_target_temp_c numeric(4,1), new_target_temp_c numeric(4,1), old_max_temp_c numeric(4,1), new_max_temp_c numeric(4,1), summary text);`
  - **Decision: a dedicated `haccp_threshold_audit` table, NOT the generic `audit_log`.** Rationale: (a) the generic `audit_log` (baseline, `audit_log_select` = `is_admin()`) is a free-form/order-pipeline log whose shape doesn't carry old→new target/max cleanly; (b) an immutable, purpose-built table mirrors the proven `order_audit_log` pattern and makes the FSA-facing "who changed a CCP limit, when, from what to what" query trivial; (c) it keeps the audit rows co-located with the thing they audit. 🗣 We give the limit-changes their own logbook instead of dumping them in a shared drawer — easier to hand an inspector.
- **RLS (DELTA 1 tail + DELTA 2 admin-only writes) — decision stated explicitly:**
  - `ALTER TABLE public.haccp_process_room_thresholds ENABLE ROW LEVEL SECURITY;`
  - `haccp_process_room_thresholds_select` — `FOR SELECT USING (public.current_user_is_active())`. 🗣 Any real, active staff member can READ the limits (the process-room GET + server band derivation run as the staff caller).
  - `haccp_process_room_thresholds_insert/update/delete` — `WITH CHECK (public.is_admin())` / `USING (public.is_admin())`. 🗣 Only an admin can CHANGE the limits, enforced at the database itself — not just at the route.
  - **This is a deliberate divergence from the 30-table `current_user_is_active()`-for-all pattern** (documented in `20260625120000_haccp_authenticated_rls_policies.sql` as "fine-grained admin-only stays at the route edge"). We tighten writes to `is_admin()` at the DB because the thresholds are a regulatory control and admin-only is a hard requirement, not a convention — defense-in-depth beyond the route's `isAdmin` gate. The `is_admin()` helper already exists (baseline line 177) and reads the same `app.current_user_id` GUC the authenticated client sets, so it works under the per-caller authenticated client. 🗣 The other HACCP tables trust the app's front-door check for admin-only; for a food-safety limit we also lock the database door.
  - `haccp_threshold_audit` — `ENABLE ROW LEVEL SECURITY`; `_select USING (public.is_admin())`, `_insert WITH CHECK (public.is_admin())`; **no UPDATE/DELETE policy** → immutable (RLS-enabled + no policy = deny for authenticated; only service-role could, and we never use it here). 🗣 Only admins can read the logbook; nobody can edit or erase an entry.
  - **Grants (new tables — baseline's blanket grant does NOT cover them):** `GRANT ALL ON TABLE public.haccp_process_room_thresholds TO authenticated; GRANT ALL ON TABLE public.haccp_threshold_audit TO authenticated;` (+ `service_role` for the rollback parachute). RLS still constrains what each role can actually do.
  - Idempotent: `DROP POLICY IF EXISTS` before each `CREATE POLICY`; `CREATE TABLE IF NOT EXISTS`; seed guarded.
- **TDD:** apply via `npm run db:reset`; assert the 2 seed rows + band constraint reject (a manual `psql` check or the pgTAP spec in step 10). No non-destructive DROP → no PITR gate.

### Step 3 — Port methods
**File:** `lib/ports/HaccpDailyChecksRepository.ts` (no separate contract file exists — see TDD note).
- Add to the interface (in the process-room section):
  - `listActiveProcessRoomThresholds(): Promise<readonly ProcessRoomThreshold[]>` — active thresholds for GET display + POST band derivation.
  - `listAllProcessRoomThresholds(): Promise<readonly ProcessRoomThreshold[]>` — active + inactive, for the admin editor.
  - `updateProcessRoomThreshold(input: UpdateProcessRoomThresholdInput, changedBy: string): Promise<ProcessRoomThreshold>` — update the row AND write the audit row; returns the updated domain row.
- **TDD:** NOTE — there is currently NO shared `lib/ports/__contracts__/HaccpDailyChecksRepository.contract.ts` (verified absent; unlike Orders/AuditLog). Do NOT invent one just for this change (out of scope). Put the RED tests on the **fake adapter's own unit spec** (`tests/unit/adapters/fake/HaccpDailyChecksRepository.processRoomThresholds.test.ts`, new): seed `processRoomThresholds` → `listActive`/`listAll` read back; `updateProcessRoomThreshold` mutates the row AND appends a `thresholdAudits` entry. The supabase adapter is covered by the integration spec (step 10). RED until the adapters implement the 3 methods.

### Step 4 — Supabase + Fake adapters
**Files:** `lib/adapters/supabase/HaccpDailyChecksRepository.ts`, `lib/adapters/fake/HaccpDailyChecksRepository.ts`.
- **Supabase:**
  - `listActiveProcessRoomThresholds`: `client.from('haccp_process_room_thresholds').select('id, name, target_temp_c, max_temp_c').eq('active', true).order('position')` → map to `ProcessRoomThreshold[]` (mirror `listActiveColdStorageUnits`, lines 299–312). `ServiceError` on `error`.
  - `listAllProcessRoomThresholds`: same select incl. `active, position`, no `.eq('active')`, ordered by `position`.
  - `updateProcessRoomThreshold`: read current row (for old values), `.update({...patch}).eq('id', id).select(...).single()`, then `.from('haccp_threshold_audit').insert({ threshold_id, changed_by, old_*, new_*, summary })`. Map `23505`→`ConflictError` if applicable; `ServiceError` otherwise. Vendor types never leak — map to `ProcessRoomThreshold`.
  - Extend `listProcessRoom` (lines 426–...): add a third parallel `client.from('haccp_process_room_thresholds').select(...).eq('active',true).order('position')` to the `Promise.all`, return `thresholds` in the result (mirror how `listColdStorage` returns `units`). Thresholds error is fatal (thresholds are required to render bands) → throw `ServiceError` (the route already 500s on `listProcessRoom` throw).
- **Fake:** add `processRoomThresholds?: readonly ProcessRoomThreshold[]` to `FakeHaccpDailyChecksSeed`; implement the 3 methods reading/mutating an internal array; expose `thresholdAudits: readonly {...}[]` for test inspection; include `thresholds` in the `listProcessRoom` result (default from seed or `EMPTY`).
- **TDD:** the shared contract spec (step 3) now goes GREEN for the fake; add a supabase-adapter integration check in step 10.

### Step 5 — Service: band-aware temps + shared causes + range guard + threshold admin methods
**File:** `lib/services/HaccpDailyChecksService.ts`.
- Replace `VALID_PROC_ROOM_CAUSES` literal set (lines 118–126) with `new Set<string>(PROCESS_ROOM_CAUSES)` (import from `@/lib/domain`, alongside the existing `COLD_STORAGE_CAUSES` import at line 68).
- **Thread thresholds through the temps methods (mirror the cold-storage units flow):** change the signatures of `validateProcessingTemp`, `buildProcessingTemp`, `buildProcessingTempCorrectiveActions` to accept `thresholds: readonly ProcessRoomThreshold[]` (resolve `product` + `room` rows by name/position). Replace the hardcoded `<= 4.0` (line 1334, 1356, 1377) and `<= 12.0` (line 1335, 1357, 1378) with `processRoomBand(temp, target, max)` per point.
  - New deviation semantics: `hasDeviation = productBand !== 'pass' || roomBand !== 'pass'` (product amber now counts, matching cold-storage where any non-pass is a deviation).
  - `within_limits` = both bands `pass`; `product_within_limit` = productBand `pass`; `room_within_limit` = roomBand `pass` (persist shape unchanged, values now band-driven).
- **Range guard (DELTA 4 server side):** in `validateProcessingTemp`, after the today check and before the CA-payload checks, `if (!isProcessRoomTempInRange(input.product_temp_c) || !isProcessRoomTempInRange(input.room_temp_c)) return reject(400, 'Temperature out of range')` — mirrors cold-storage lines 1061–1065. Precedence: missing-fields → today → **range** → CA-payload.
- **Band-aware CA rows (`buildProcessingTempCorrectiveActions`):** currently product breach always → critical path + `management_verification_required: true` (line 1411). Make it band-aware:
  - Product amber (4–7): CA raised, `management_verification_required` = false (mirror cold-storage amber). Product critical (>7): true.
  - Room amber (12–15): `management_verification_required` false (already the case, line 1424 keys off `> 15`); room critical (>15): true.
  - `deriveProcRoomAction` (lines 347–362) currently keys product breach to `product_breach` protocol regardless of severity. Decide protocol text for product-amber vs product-critical: reuse `PR_PROTOCOLS.product_breach` for both (the text — "return to chilled storage, record time, reduce batch" — is appropriate at amber too) OR add a lighter `product_amber` protocol. **Recommendation:** keep one `product_breach` protocol for both product bands (least behaviour churn; the CCP-3 handbook action is the same "get it back to chill" regardless), and let `management_verification_required` carry the severity distinction. State this in the PR.
- **New service methods:**
  - `listProcessRoomThresholds(): Promise<readonly ProcessRoomThreshold[]>` → `dailyChecks.listAllProcessRoomThresholds()` (admin view).
  - `validateProcessRoomThreshold(input): ValidationResult` — require `id`; if both `target_temp_c` and `max_temp_c` absent → 400 "No valid fields"; if both present require `target_temp_c <= max_temp_c` else 400; bounds via `isProcessRoomTempInRange`. 🗣 Stop an admin saving nonsense (max below target, or an impossible number).
  - `updateProcessRoomThreshold({ input, changedBy }): Promise<...>` → validate then `dailyChecks.updateProcessRoomThreshold(input, changedBy)`.
- Extend `listProcessRoom` passthrough (line 774) so the `thresholds` field flows through unchanged.
- **TDD:** `tests/unit/services/HaccpDailyChecksService.processRoom.test.ts` — RED first:
  - product 5°C (thresholds 4/7) → band amber, `hasDeviation=true`, CA row with `management_verification_required=false`.
  - product 8°C → critical, `management_verification_required=true`.
  - room 13 → amber (no mgmt-verify); room 16 → critical (mgmt-verify).
  - out-of-range 60°C → 400 "Temperature out of range".
  - invalid cause "banana" → 400; valid cause from `PROCESS_ROOM_CAUSES` → ok.
  - `validateProcessRoomThreshold`: max < target → 400; out-of-bounds → 400; valid → ok.

### Step 6 — Wiring confirmation
**File:** `lib/wiring/haccp.ts`.
- No new binding line required — `haccpDailyChecksServiceForCaller(userId)` already wires `createSupabaseHaccpDailyChecksRepository(client)`, which now carries the 3 new methods. Confirm the admin threshold route uses `haccpDailyChecksServiceForCaller` (the per-caller authenticated client, so `is_admin()` fires in RLS). 🗣 Nothing new to plug in — the new methods travel on the plug already in the fuse box; this preserves the one-adapter rip-out count.

### Step 7 — Thresholds API route (admin)
**File:** `app/api/haccp/admin/process-room-thresholds/route.ts` (new). Mirror `app/api/haccp/admin/suppliers/route.ts`.
- `isAdmin(req)` = `x-mfs-user-role === 'admin'`; also require `x-mfs-user-id`.
- `GET` → `haccpDailyChecksServiceForCaller(userId).listProcessRoomThresholds()` → `{ thresholds }`.
- `PATCH` → body `{ id, target_temp_c?, max_temp_c?, active? }` → `svc.updateProcessRoomThreshold({ input: body, changedBy: userId })`; map `{ ok:false }` validation result to its status; else return the updated row.
- 403 "Admin only" when not admin; 500 on throw. 🗣 A tiny admin-only door for reading/editing the limits, identical in shape to the supplier door.

### Step 8 — Screen rebuild
**File:** `app/haccp/process-room/page.tsx` (full rewrite, behaviour-preserving).
- Import from `@/components/ui`: `Modal, NumberPad, Button, IconButton, SegmentedControl, Textarea, Banner, Spinner, Badge, type NumberPadTone`. Import from `@/lib/domain`: `PROCESS_ROOM_CAUSES, PROCESS_ROOM_MIN_TEMP_C, PROCESS_ROOM_MAX_TEMP_C, processRoomBand`.
- **Bands from DB, not hardcoded:** `loadData` now also reads `d.thresholds`; resolve `productThreshold` + `roomThreshold` by name (`'Product core'` / `'Room ambient'`). Replace `productStatus` (lines 90–93) and `roomStatus` (95–100) with `processRoomBand(t, threshold.target_temp_c, threshold.max_temp_c)`. Limit labels ("Limit ≤4°C" / "≤12°C" at lines 759, 770, 862) become `≤${threshold.target_temp_c}°C` (and show the amber ceiling `max_temp_c` where the amber band is described).
- **Kit NumberPad + Modal** replace the bespoke `Numpad` (delete lines 127–199). Use the cold-storage draft-buffer pattern (edits stay in a local `draft`, committed only on Confirm) so an out-of-range value can't enable Submit. Pass `min={PROCESS_ROOM_MIN_TEMP_C} max={PROCESS_ROOM_MAX_TEMP_C} allowDecimal allowNegative suffix="°C" tone={...} hint={...}`.
- **Semantic tokens** replace all literal colours: the `STATUS_*` maps (lines 104–123) become the cold-storage `STATUS_CARD`/`STATUS_BADGE_TONE`/`STATUS_TONE` token maps; every `#EB6619` → `text-action-primary`/`Button variant="primary"`; every `bg-green-*/amber-*/red-*` → `bg-status-*-soft` + `text-status-*-text`; header dark theme inherited from `app/haccp/layout.tsx` (drop the hardcoded `bg-[#1E293B]`, use `bg-surface-raised` etc. as cold-storage does).
- **CCAPopup** ported into the kit `Modal variant="sheet"` (mirror cold-storage's CCAPopup) — cause buttons from `PROCESS_ROOM_CAUSES`, disposition/recurrence/notes preserved, protocol steps read-only. The `productBreached`/`roomBreached` computations become band-based (`productBand !== 'pass'` etc.), and the ccp3 protocol/disposition helpers become band-aware to match the service (product amber vs critical).
- **Diary card (`DiaryPhaseCard`)** re-expressed on tokens; the tick/cross rows use `IconButton`/`Button` + page-local `CheckGlyph`/`CrossGlyph` (single-screen, not kit — see ADR-0014 note §4). Quick-ref overlay + Handbook link header ported to `Modal`/`Button` (mirror cold-storage header).
- **DELTA 6 dead-code removal:** delete `isNeg` (line 135, always-false), `tempSubmitPending` state + its 3 uses (lines 584, 664, 872 — it gates nothing), and the unreachable `-` key handler branch (line 141; `-` is never in `keys`). The kit `NumberPad` owns negative entry via `allowNegative`, so no bespoke `-` logic remains.
- **DELTA 7:** past-dates behaviour LEFT AS-IS — keep the `<input type="date" max={todayISO()}>` + `handleDateChange` + smart session default exactly as today.
- **Preserve exactly:** AM/PM sessions, one row per (date, session), smart "first unfilled session" default, per-session read-only lock, three diary phases (10/5/5 items from `CHECKS`), tick/cross, any-issues toggle + note-required-if-issues, per-phase read-only lock, CCA-before-submit-on-deviation, quick-ref, Handbook link.
- **TDD:** component tests are covered by the E2E (step 11) + integration (step 10); no new unit harness for the page (consistent with cold-storage). Manual ANVIL browser-tap on the prod-build preview per the HACCP exhaustive-tap rule.

### Step 9 — Admin editor section + audit surfacing + on-save reminder
**File:** `app/haccp/admin/page.tsx`.
- Add a third tab alongside `'ca' | 'suppliers'` → `'thresholds'` (the page is already admin-gated by its route middleware — confirm `/haccp/admin` is admin-only; the suppliers tab already assumes it). Mirror the Suppliers CRUD scaffolding (`loadThresholds` via `GET /api/haccp/admin/process-room-thresholds`, an edit drawer, `handleSaveThreshold` via `PATCH`).
- Fields per threshold: `name` (read-only label), `target_temp_c`, `max_temp_c`, `active` toggle. Validate client-side `target <= max`.
- **On-save reminder (DELTA 2):** after a successful PATCH, show a persistent `Banner` (kit) reading e.g. *"Limit updated. You MUST update docs/reference/haccp/DOCUMENT_CONTROL.md §4 and retrain staff on the new limit (SALSA/FSA control)."* UI-only reminder is acceptable per spec. 🗣 The app can't force the paperwork, but it refuses to let the admin forget it.
- Optionally show recent `haccp_threshold_audit` rows (who/when/old→new) under the editor for the FSA trail (nice-to-have; the audit table is the source of truth regardless).
- **Note:** the admin page is currently on raw Tailwind (not yet migrated to the kit). To avoid scope-creep, build the new thresholds section on the **kit** (Banner/Button/Textarea/SegmentedControl) even though the surrounding page isn't migrated — new code meets the standard; pre-existing page is known debt (CLAUDE.md diff-scope rule). State this in the PR.
- **TDD:** integration coverage in step 10 (PATCH round-trip + audit row written + non-admin 403).

### Step 10 — Integration + pgTAP tests
**Files:** `tests/integration/haccp-process-room-thresholds.test.ts` (new), pgTAP spec under the DB test dir (mirror the existing HACCP RLS pgTAP).
- **Integration (booted dev server + local Supabase):**
  - `GET /api/haccp/process-room` returns `thresholds` (2 rows) alongside `temps`/`diary`.
  - `POST type=temps` with product 5°C / room 10°C → amber deviation path requires + accepts a CA; persists band `amber`.
  - `POST type=temps` product 2 / room 10 (both pass) → no CA, `has_deviation:false`.
  - `GET /api/haccp/admin/process-room-thresholds` as admin → 200 list; as warehouse → 403.
  - `PATCH` as admin (target_temp_c 4→3) → 200, updated row; a `haccp_threshold_audit` row exists with old 4 / new 3 / changed_by. `PATCH` max<target → 400.
- **pgTAP / RLS:**
  - RLS enabled on both new tables.
  - active staff can `SELECT` thresholds; cannot `INSERT/UPDATE/DELETE` (admin-only).
  - admin can `UPDATE` a threshold; the `haccp_threshold_audit` `INSERT` succeeds as admin, denied as non-admin; audit rows are immutable (no UPDATE/DELETE policy).
  - band `CHECK (target <= max)` rejects an inverted row.

### Step 11 — E2E: port the `enterSession` race-proof pattern (DELTA 8 / BACKLOG F-INFRA-08 template)
**File:** `tests/e2e/16-haccp-process-room.spec.ts`.
- Study the shipped helper in `tests/e2e/13-haccp-cold-storage.spec.ts` (lines 82–89) + `13-haccp-cold-storage-phase1.spec.ts` — it waits for the client `loadData` fetch to render (a stable element visible) BEFORE selecting the session, then returns `'editable' | 'readonly'` and the test early-returns on a read-only (already-submitted) session.
- **Port two helpers to spec 16:**
  - `enterTempSession(page, 'AM'|'PM'): 'editable'|'readonly'` — wait for a stable rendered element (e.g. the "Product core" tile / "Temperature check" card) to be visible (proving `loadData` incl. thresholds resolved), click the session, then race the `{session} check submitted` banner vs the `Submit {session} temperature check` button; return which won. Tests 1 & 3 use it (they currently have NO guard / a naive `isVisible`).
  - `enterDiaryPhase(page, phase): 'editable'|'readonly'` — wait for the diary card to render, open the phase, then race the phase's Done state (`{n} of 3 done` / the collapsed done card) vs the `Submit {phase}` button; early-return on already-submitted. Test 2 uses it.
- Rationale (carry the cold-storage comment): the shared preview DB is never reset and these checks are once-per-(date,session/phase), so after the first run a session/phase stays read-only; without waiting for `loadData` the click races the render and the spec strands on a missing Submit button → 30s timeout.
- Keep the existing admin-queue assertion for the critical room CA (deviation_description `Room: 16°C ...`).

---

## 8. Acceptance criteria

1. `/haccp/process-room` renders on the kit + semantic tokens + inherited dark theme; no literal `#EB6619`, no raw `bg-green/amber/red-*` survive; bespoke `Numpad` gone (kit `NumberPad`+`Modal` in use).
2. Product & room pass/amber/critical bands are computed from `haccp_process_room_thresholds` (seeded 4/7 and 12/15), on BOTH client display and server persistence — no hardcoded `4`/`12`/`15` remain in page or service temps logic.
3. All existing behaviours preserved: AM/PM sessions + smart default + per-session lock; 3 diary phases (10/5/5) + tick/cross + issues-note gate + per-phase lock; CCA-on-deviation with cause→protocol→recurrence→disposition→notes; quick-ref + Handbook.
4. Cause list is a single `PROCESS_ROOM_CAUSES` in `lib/domain`, consumed by client screen AND server validation (no second copy).
5. Client + server reject out-of-range temps (< −50 or > 50°C) with a clear error.
6. Admin (only) can edit thresholds via `/haccp/admin`; each edit writes a `haccp_threshold_audit` row (who/when/old→new) and shows the DOCUMENT_CONTROL + retrain reminder; non-admin gets 403 and DB RLS denies the write.
7. Dead code (`isNeg`, `tempSubmitPending`, unreachable `-` handler) removed; past-date behaviour unchanged.
8. Spec 16 uses `enterSession`-style guards for temps (AM/PM) + all 3 diary phases; green against the shared preview DB regardless of prior submissions.
9. DOCUMENT_CONTROL.md §4 + §7 reflect the new bands (R-1 must-fix).
10. Full regression green: unit + integration + pgTAP + `@critical` E2E; rip-out audit still one-adapter.

---

## 9. Risk Assessment

### R-1 — Product band change is a regulatory limit change (business-logic + launch blocker) — **MUST-FIX**
- **Severity:** High. Product gains an amber zone (4–7°C) it never had; a 5°C product reading that was `critical` today becomes `amber` after this change. That is a genuine CCP-3 limit change, and `DOCUMENT_CONTROL.md` §4 still records "Product during processing ≤4°C (Reg 853/2004)" with §8 asserting "app limits match the register".
- **Mitigation:** (a) Seed the table to the Gate-1-approved bands (4/7, 12/15). (b) Update DOCUMENT_CONTROL §4 limits table + §7 change log in the same PR. (c) Make the CA severity band-aware so product-amber does not falsely demand management sign-off while product-critical still does. (d) Confirm at ship gate that Hakan/compliance has signed off the amber zone (spec says approved at Frame Gate 1 — record that).
- **Must-fix flag:** YES — ships broken against the compliance register otherwise. Blocks Gate 2 until the DOCUMENT_CONTROL update is included in the plan/PR scope (it is, step 8/§5 item 16).

### R-2 — Admin-only write enforcement (security) — **MUST-FIX**
- **Severity:** High. Thresholds are a food-safety control; a non-admin editing them is a safety + audit failure.
- **Mitigation:** Two gates — route edge (`isAdmin` in the new route) AND DB RLS (`is_admin()` on INSERT/UPDATE/DELETE of `haccp_process_room_thresholds` and the audit table). pgTAP (step 10) proves non-admin writes are denied at the DB. Audit table is immutable (no UPDATE/DELETE policy).
- **Must-fix flag:** YES for the *pgTAP proof that non-admin writes are denied at the DB* — without that test the admin-only claim is unverified. The implementation itself is standard; the missing verification is the blocker.

### R-3 — Audit-log mechanism choice (data model)
- **Severity:** Medium. Wrong choice = a weak or hard-to-query FSA trail.
- **Decision + mitigation:** dedicated immutable `haccp_threshold_audit` (old→new target/max, changed_by, changed_at) over the generic `audit_log` — rationale in step 2. The audit insert lives in the adapter's `updateProcessRoomThreshold` alongside the update so it can't be forgotten by a caller. Residual risk: update + audit are two statements, not one transaction — a crash between them could update without logging. Acceptable for admin-frequency edits; note as a follow-up (could wrap in an RPC/transaction later). 🗣 Tiny window where a limit changes but the logbook entry is missed; rare, admin-only, and flagged for a later tighten.
- **Must-fix:** No.

### R-4 — Threshold read failure breaks the screen (availability)
- **Severity:** Medium. Bands can't render without thresholds; if the thresholds read throws, GET 500s.
- **Mitigation:** Seed guarantees 2 rows always exist; adapter throws `ServiceError` on a genuine DB error (fail-closed, consistent with cold-storage units). The screen shows the existing "Could not load" banner. Do NOT silently fall back to hardcoded limits (that would resurrect the drift). 🗣 If the limits can't load we stop and say so, rather than guess a limit — right call for food safety.
- **Must-fix:** No.

### R-5 — Concurrency / race: thresholds edited mid-session, and the dirty preview-DB E2E race
- **Severity:** Low–Medium. (a) An admin editing a limit between the client GET and the server POST could make the client's displayed band differ from the server's persisted band. Server is the source of truth (it re-derives from live thresholds at POST), so the persisted record is always correct; worst case the user sees a stale colour. (b) The E2E once-per-period race on the never-reset preview DB (DELTA 8).
- **Mitigation:** (a) Accept server-authoritative derivation; no locking needed at admin-edit frequency. (b) Port `enterSession` guards (step 11) — the core purpose of DELTA 8.
- **Must-fix:** No (but step 11 is required for green E2E).

### R-6 — Data migration safety
- **Severity:** Low. Additive migration only (CREATE TABLE + seed + CREATE POLICY), no DROP/TRUNCATE/ALTER TYPE → no PITR gate. 14-digit filename avoids the preview-resync + same-day-collision failure. Historical `haccp_processing_temps` rows are untouched (`temp_status` was stored at submit time).
- **Mitigation:** idempotent guards on seed + `IF NOT EXISTS` + `DROP POLICY IF EXISTS`; verify on `db:reset` and on a PR preview-branch resync.
- **Must-fix:** No.

### R-7 — Kit-only / ADR-0014 for the checklist row + un-migrated admin page
- **Severity:** Low. The tick/cross row has no kit analogue; the admin page isn't kit-migrated.
- **Mitigation:** compose the row from existing kit primitives + page-local glyphs (single-use, not a shared-visual violation); build only the NEW admin section on the kit and leave the rest as declared known debt (diff-scope rule). `reusable-visual-in-kit.test.ts` should stay green (no reusable visual defined inline/imported from outside `components/ui`).
- **Must-fix:** No.

### Categories with no material risk
- **Payments / external vendors:** none touched. **New dependencies:** none added. **Auth model:** unchanged (same `x-mfs-user-*` header gate + per-caller authenticated client).

---

## 10. Test matrix seed for ANVIL

- **Unit:** `processRoomBand` (product 4/7 + room 12/15 boundaries); `isProcessRoomTempInRange` (−50/50 in, −51/51/NaN out); `PROCESS_ROOM_CAUSES` count + shared-set validation; service band-aware temps (amber vs critical → `management_verification_required`), range-guard 400, cause 400; `validateProcessRoomThreshold` (max<target, out-of-bounds, no-fields).
- **Integration:** `GET /process-room` returns thresholds; `POST temps` pass/amber/critical persistence + CA; admin thresholds `GET` 200 (admin) / 403 (warehouse); `PATCH` update + audit row + max<target 400.
- **DB / pgTAP / RLS:** RLS enabled on both new tables; staff SELECT allowed, staff write denied, admin write allowed; audit immutable; `target<=max` CHECK enforced; seed present.
- **E2E (`@critical`, prod-build preview, exhaustive HACCP browser-tap):** spec 16 with `enterTempSession` (AM/PM) + `enterDiaryPhase` (opening/operational/closing); temps happy, diary happy, room-critical CA reaches admin queue; all race-proof against the shared preview DB.

---

## 11. Summary for the conductor

Bottom-up rebuild that mirrors the shipped cold-storage unit: shared `lib/domain/processRoom.ts` (causes + bounds + band helper), a new `haccp_process_room_thresholds` table (seeded 4/7 & 12/15) with an immutable `haccp_threshold_audit`, three new methods on the **existing** `HaccpDailyChecksRepository` port (read active / list all / update+audit) implemented in both supabase + fake adapters, a band-aware/range-guarded/shared-cause service, an admin-only thresholds route, a kit+tokens screen rebuild, an admin editor section with an audit trail + compliance reminder, and the `enterSession` E2E port. Two must-fix blockers: R-1 (DOCUMENT_CONTROL §4/§7 must record the new product amber band) and R-2 (pgTAP must prove non-admin DB writes are denied).
