# /haccp/mince ("Mince & Meat Prep", CCP-M1/M2/MP1/MP2) unit — EXECUTION PLAN

**Source spec:** LOCKED, FORGE Gate 1 approved 2026-07-02 (conductor prompt). Bands, bug list and scope are locked — do NOT re-derive them.
**Pattern source (mirror where the spec says twin/mirror):** `docs/plans/archive/2026-07-02-goods-in-ccp1-unit.md` + `docs/plans/archive/2026-07-02-goods-in-ccp1-unit-EXECUTION.md` (shipped #112 `63db7fd`).
**Branch:** `feat/haccp-mince-unit` (off `main`). PR merges via the required `smoke` check.
**Tier:** B (ADR-0014) — build straight on the kit, judge on live preview.
**Out of scope (recorded per spec §E):** poultry (screen is poultry-less BY DESIGN — Hakan confirmed); vac-pack 15-day enforcement / chilled-frozen toggle / frozen-output block for `imported_vac` (all REJECTED by Hakan — no form changes for that species); label renderer/printing pipeline (decision #19); hub changes; `/haccp/admin` beyond the new editor section.

**🗣 In plain English:** the last core HACCP screen gets the same treatment Goods In just got — rebuilt on the shared design kit, its temperature and kill-date limits moved out of hardcoded code into an admin-editable, audit-logged database table, one file made the single owner of the grading rule — plus four known bugs fixed. One deliberate difference from Goods In: here the new amber band is COLOUR ONLY; the corrective-action paperwork still fires on anything over the pass line, exactly as today.

---

## 0 · Mini-map

```
DOMAIN (core logic)
  ├─ lib/domain/mincePrep.ts (NEW — the one grading rule) ← client page AND server service
  ├─ HaccpDailyChecksRepository (port) → [Supabase] lib/adapters/supabase/HaccpDailyChecksRepository.ts
  │                                      [Fake]     lib/adapters/fake/HaccpDailyChecksRepository.ts
  └─ Printer (port) → [Sunmi/browser] — BYTE-PRESERVED, not touched
🗣 one new brain file + three extra methods on an existing socket — no new vendors, no new plugs
```

---

## 1 · Goal (PRD — the destination)

Butchery staff log mince runs, meat-prep runs and allergen time-separation on a screen that looks and works like the other rebuilt HACCP screens; the temperature and kill-date limits it grades against live in the database (admin-edited at `/haccp/admin`, every change audit-logged); readings just over the pass line show an amber "warning" colour instead of flat red — while the corrective-action record the inspector sees stays exactly as complete as today; and four known defects (lost time-sep corrective-action text, wrong history header, half-blind dual-failure popup, doubled error message) are gone. Route `/haccp/mince` unchanged.

**🗣 In plain English:** same screen, same flows, new paint from the shared kit, the rulebook moves into the database with a tamper-proof diary, the traffic-light gains a middle colour that changes NOTHING about the paperwork, and four small bugs die.

This Goal is locked. If reality forces it to change, loop back to Frame — do not silently re-plan.

---

## 2 · Domain terms (CONTEXT.md conventions apply)

- **CCP-M1 / CCP-M2 / CCP-MP1 / CCP-MP2** — mince temperature CCP / mince kill-date CCP / prep temperature CCP / prep allergen-label CCP (MMP-001 · MMP-MF-001 · MMP-HA-001).
- **Channel** — one graded measurement point. Six temp channels: mince input · mince output chilled · mince output frozen · prep input · prep output chilled · prep output frozen. Plus per-species kill-day limits (BINARY: pass / hard-fail, no amber).
- **Amber (this unit — DIFFERENT from Goods In, spec-critical)** — DISPLAY ONLY. Badge/tile/numpad colour "warning" for a reading between the pass limit and the amber ceiling. The CCA popup, the 400-requires-CA validation, and the CA-register writes ALL still trigger on ANYTHING over the pass limit (amber AND fail). The persisted booleans (`input_temp_pass`, `output_temp_pass`) keep today's meaning: over pass limit = `false`.
- **Fail-closed** — a missing threshold key must stop grading (throw → route 500 / client disabled entry), never fall back to a hardcoded or looser ruler.
- **Kill-day limit** — max days from kill before mincing: lamb 6, beef 6, `imported_vac` NULL = no app-enforced limit (Hakan's explicit documented deviation — see §10 register duty).
- **🗣 In plain English:** "amber" here is a paint colour, not a policy change — every deviation that filed paperwork yesterday files identical paperwork tomorrow. "Fail-closed" = if the ruler is missing, stop measuring.

⚠️ NEW TERM: none needing CONTEXT.md (channel/amber are unit-local vocabulary documented in the domain module header).

---

## 3 · Compliance flags

- **YES — HACCP safety-critical screen.** Full ANVIL matrix + exhaustive `@critical` browser-tap E2E on the prod-build preview (per `feedback_anvil_full_browser_taps`).
- **Register duty (same PR):** `docs/reference/haccp/DOCUMENT_CONTROL.md` §4 gains (1) the vac-pack deviation note (Reg 853/2004 Annex III Sec V Ch III pt 2(b)(iii) 15-day chilled vac-packed beef/veal rule — verified 2026-07-02, quoted, consciously NOT app-enforced; frozen-route nuance: no clock if boned before freezing, re-freeze after thaw prohibited pt 5); (2) the FOUR amber grace-band justifications (probe/handling fluctuation; display-only; CA unchanged); (3) the note that mince/prep thresholds are now app-configurable (admin, audited) like CCP-1/CCP-3. See Step 15 for exact edits.
- **No supplier/operator-facing behaviour change:** the pass limits are unchanged (7/2/4/-18; kill 6d), so nothing that passed yesterday fails tomorrow and nothing that filed a CA yesterday skips one tomorrow — only tile colours between pass and amber ceilings change from red to amber.
- **🗣 In plain English:** the inspector-facing paperwork changes in the same breath as the code, and no delivery/production decision flips — this unit recolours and re-plumbs, it does not re-legislate.

---

## 4 · ADR review

| ADR | Verdict |
|---|---|
| 0002 (hexagonal shape/naming) | **Complies** — extends the existing `HaccpDailyChecksRepository` port; vendor SQL stays in `lib/adapters/supabase/`. |
| 0004 (RLS security model) | **Complies with documented divergence** — writes locked to `is_admin()` at the DB, the same deliberate divergence already documented in the goods-in + process-room migration headers (regulatory control ⇒ defense-in-depth). Copy that header rationale into the new migration. |
| 0010 (printer transport port) | **Untouched** — hard guard §9: `getPrinter().printMinceLabel`, `PrintLabelStrip`, use-by day options byte-preserved. |
| 0014 (design-system consumption, tiered workflow) | **Complies** — Tier B, kit-only composition via the `components/ui` barrel. If the rebuild needs a shared primitive that doesn't exist, it goes to `components/ui/` + barrel FIRST (Rule 3). Expected: NO new kit component needed (delivery's rebuild proved the set sufficient). |

**No ADR conflicts. No `status: Proposed` ADRs pending ratification.**

---

## 5 · Ports, adapters, dependencies (hexagonal)

- **Ports touched:** `lib/ports/HaccpDailyChecksRepository.ts` (existing) — gains `listMinceThresholds()` + `updateMinceThreshold()`; `insertTimeSeparation` now returns `{ id }` (needed to link the new time-sep CA rows). No new port.
- **New ports introduced:** none.
- **Adapters touched:** `lib/adapters/supabase/HaccpDailyChecksRepository.ts` (real) + `lib/adapters/fake/HaccpDailyChecksRepository.ts` (test double). Wiring untouched (`lib/wiring/haccp.ts` already composes this pair).
- **New package dependencies:** **NONE** (spec §H bans them). Nothing to justify or wrap.
- **Rip-out test:** **PASS** — replacing Supabase still costs one adapter file + one wiring line; the new tables are reached only through the port; `lib/domain/mincePrep.ts` is pure TS; the UI talks only to `/api` routes → services.
- **🗣 In plain English:** we widen an existing socket instead of drilling a new hole; zero new vendors, so the "swap the database" bill stays at one plug.

---

## 6 · Files to change (complete list)

| File | Action |
|---|---|
| `lib/domain/mincePrep.ts` | NEW — threshold types, fail-closed resolver, channel-key helper, 3-state display verdict, boolean pass rules, kill-day rules, band-copy formatter |
| `lib/domain/index.ts` | export the new module's types/functions |
| `lib/domain/HaccpDailyCheck.ts` | `MincePrepListResult` gains `thresholds` (appended LAST) |
| `lib/domain/HaccpCorrectiveAction.ts` | add `"haccp_time_separation_log"` to `HaccpCASourceTable` (comment: nine → ten source tables) |
| `supabase/migrations/20260702150000_haccp_mince_thresholds.sql` | NEW — 2 tables + 9-row seed + grants + RLS (additive, idempotent) |
| `supabase/tests/020-rls-mince-thresholds.test.sql` | NEW pgTAP — RLS + admin double-lock + audit immutability + CHECK proofs (mirror 019) |
| `lib/ports/HaccpDailyChecksRepository.ts` | add `listMinceThresholds()` + `updateMinceThreshold()`; `insertTimeSeparation` returns `{ id: string }` |
| `lib/adapters/supabase/HaccpDailyChecksRepository.ts` | implement the two methods; `listMincePrep` also selects thresholds (fatal on error); `insertTimeSeparation` selects `id` back |
| `lib/adapters/fake/HaccpDailyChecksRepository.ts` | mirror all three changes |
| `lib/services/HaccpDailyChecksService.ts` | delete hardcoded mince band fns (lines 463–484); thread `thresholds` through mince/meatprep validate/build/CA builders; interpolate DB limits into CA texts; add mince-threshold trio; add `buildTimeSeparationCorrectiveActions` |
| `app/api/haccp/mince-prep/route.ts` | POST loads thresholds (empty → 500) and threads them; timesep files CA rows + returns `ca_write_failed`; GET unchanged (thresholds ride in via `listMincePrep`) |
| `app/api/haccp/admin/mince-thresholds/route.ts` | NEW — GET/PATCH, double-gated, audit-logged (copy goods-in route shape verbatim) |
| `app/haccp/admin/page.tsx` | Thresholds tab: add "Mince & Meat Prep" section below Goods In (new section only follows pairing law — F-TD-42 exclusion); `CCP_LABELS` + `SOURCE_LABELS` gain the time-sep entries |
| `app/haccp/mince/page.tsx` | full Tier-B recomposition + domain re-point + bug fixes 2/3/4 |
| `tests/unit/domain/mincePrep.test.ts` | NEW — band boundary + kill-day + fail-closed proofs |
| `tests/unit/services/HaccpDailyChecksService.mincePrep.test.ts` | NEW — threading, fail-closed, amber-still-requires-CA pins, timesep CA builder, threshold validation |
| `tests/unit/services/HaccpDailyChecksService.test.ts` | update existing mince-helper call sites to the new thresholds-taking signatures (behaviour pins unchanged) |
| `tests/unit/adapters/fake/HaccpDailyChecksRepository.minceThresholds.test.ts` | NEW — fake-adapter parity (list/update/audit + timesep insert id) |
| `tests/unit/lint/haccp-screens-token-pure.test.ts` | add `"app/haccp/mince/page.tsx"` to `SCREENS` |
| `tests/integration/haccp-mince-thresholds.test.ts` | NEW — GET thresholds + admin PATCH/audit/403 + POST all 3 forms (mirror `haccp-goods-in-thresholds.test.ts`) |
| `tests/e2e/17-haccp-mince-prep.spec.ts` | rewrite/extend into the exhaustive `@critical` suite (model: `12-haccp-delivery.spec.ts`) |
| `docs/reference/haccp/DOCUMENT_CONTROL.md` | §4 CCP-M rows + configurability note + vac-pack deviation + 4 amber justifications; §7 change-log row |

**🗣 In plain English:** ~22 files — one new brain file, one migration with its proof tests, three tweaks to the existing database socket, one rebuilt screen, one new admin API + admin section, four bug fixes, and the test/paperwork trail. No new colour tokens are needed (this screen has no category chips — the goods-in token work already covers everything it uses).

---

## 7 · Numbered steps (atomic commits, TDD-first, vertical slices)

### Stage 1 — Domain single source

**Step 1 — branch.** `git checkout -b feat/haccp-mince-unit` from up-to-date `main`.

**Step 2 — failing domain tests.** `tests/unit/domain/mincePrep.test.ts` (mirror `tests/unit/domain/goodsIn.test.ts` style), with the LOCKED seed values as fixtures. Cover:
- Exact boundaries per channel, both sides of every fencepost:
  - `mince_input` / `prep_input`: `7.0→pass, 7.1→amber, 8.0→amber, 8.1→fail`
  - `mince_output_chilled`: `2.0→pass, 2.1→amber, 3.0→amber, 3.1→fail`
  - `prep_output_chilled`: `4.0→pass, 4.1→amber, 5.0→amber, 5.1→fail`
  - `mince_output_frozen` / `prep_output_frozen`: `-18.0→pass, -17.9→amber, -17.0→amber, -16.9→fail`
- Boolean rule pins the persisted meaning: `minceTempPass(7.5, inputRow) === false` (**amber = pass:false — the paperwork trigger**); `minceTempPass(7.0, inputRow) === true`; `null`/`NaN` → `false`.
- Kill-days BINARY: lamb/beef `6→pass(hardFail false), 7→hardFail`; `imported_vac` (`pass_max` NULL) → always pass, never hardFail (informational).
- `resolveMinceThreshold` THROWS on a missing key (fail-closed), message names the key; enumerate ALL 9 seeded keys and assert each resolves.
- `minceTempKey('mince'|'meatprep', 'input'|'output', 'chilled'|'frozen')` returns the right key (input ignores mode).
- `describeMinceBand` copy derived from row values (e.g. `≤2°C pass · 2–3°C warning · >3°C deviation`; negative bounds use "to": `-18 to -17`; kill-day rows: `max 6 days` / no-limit rows: `no kill-day limit — recorded for traceability`).
- **🗣 In plain English:** every fence-post is tested on both sides, "amber still means the paperwork fires" is pinned as a test before any code exists, and "the ruler is missing" provably stops the line.

**Step 3 — implement `lib/domain/mincePrep.ts`** (pure TS, zero framework/vendor imports — `goodsIn.ts` twin) and export via `lib/domain/index.ts`:

```ts
export interface MinceThreshold {
  readonly id: string;
  readonly key: string;              // one of the 9 seeded keys
  readonly label: string;
  readonly kind: "temp" | "kill_days";
  readonly pass_max: number | null;  // temp: pass ceiling °C · kill_days: max days · NULL = no limit (imported_vac)
  readonly amber_max: number | null; // temp only — display-band ceiling; NULL on kill_days rows
  readonly position?: number;
}
export interface UpdateMinceThresholdInput {
  readonly id: string; readonly pass_max: number | null; readonly amber_max: number | null;
}
export function minceTempKey(form: "mince" | "meatprep", channel: "input" | "output", mode: string): string
// 'mince_input' | 'prep_input' | 'mince_output_chilled' | 'mince_output_frozen' | 'prep_output_chilled' | 'prep_output_frozen'
export function resolveMinceThreshold(thresholds: readonly MinceThreshold[], key: string): MinceThreshold // THROW on miss (fail-closed)
export function minceTempStatus(temp: number | null, t: MinceThreshold): "pass" | "amber" | "fail"
// DISPLAY verdict: temp null/NaN → fail; temp <= pass_max → pass; amber_max set && temp <= amber_max → amber; else fail.
// NOT persisted anywhere — unlike goods-in's 'urgent', no DB string carries it.
export function minceTempPass(temp: number | null, t: MinceThreshold): boolean
// THE persisted/paperwork rule: minceTempStatus(...) === 'pass'. Amber ⇒ false ⇒ CA required (spec-critical).
export function minceKillDaysPass(days: number, t: MinceThreshold): boolean   // pass_max null → true; days <= pass_max
export function minceKillDaysHardFail(days: number, t: MinceThreshold): boolean // pass_max !== null && days > pass_max
export function describeMinceBand(t: MinceThreshold): { limit: string; detail: string }
```
Header comment must state the amber-is-display-only rule and that `minceTempPass` (not `minceTempStatus`) is the server/persist authority. Step-2 tests go green. Commit.
**🗣 In plain English:** the whole rulebook logic is ~60 dependency-free lines; the screen colours ask `minceTempStatus`, the database rows and the paperwork ask `minceTempPass` — and the second one is deliberately blind to amber.

### Stage 2 — Database

**Step 4 — migration `supabase/migrations/20260702150000_haccp_mince_thresholds.sql`** (14-digit timestamp mandatory; mirror the goods-in migration's header discipline: ADDITIVE + IDEMPOTENT + the RLS-divergence rationale block, adapted):
1. `CREATE TABLE IF NOT EXISTS public.haccp_mince_thresholds` — `id uuid PK DEFAULT gen_random_uuid()`, `key text NOT NULL` + `CONSTRAINT haccp_mince_thresholds_key_key UNIQUE (key)`, `label text NOT NULL`, `kind text NOT NULL CONSTRAINT haccp_mince_thresholds_kind_check CHECK (kind IN ('temp','kill_days'))`, `pass_max numeric(4,1)`, `amber_max numeric(4,1)`, `position integer NOT NULL DEFAULT 0`,
   `CONSTRAINT haccp_mince_thresholds_band_check CHECK (amber_max IS NULL OR (pass_max IS NOT NULL AND amber_max >= pass_max))`,
   `CONSTRAINT haccp_mince_thresholds_kill_binary_check CHECK (kind = 'temp' OR amber_max IS NULL)` (kill-days are BINARY — no amber, structurally).
   **Divergences, all spec-locked:** columns named `pass_max`/`amber_max` (no `_c` — kill-day rows are in days, `kind` carries the unit); NO `active` column (process-room Guard lesson).
2. Seed 9 rows, each guarded `WHERE NOT EXISTS (... WHERE key = '<key>')` (LOCKED values, Reg 853/2004 Annex III Sec V Ch III, verified 2026-07-02):

| pos | key | label | kind | pass_max | amber_max |
|---|---|---|---|---|---|
| 1 | mince_input | Mince input (CCP-M1) | temp | 7.0 | 8.0 |
| 2 | mince_output_chilled | Mince output — chilled (CCP-M1) | temp | 2.0 | 3.0 |
| 3 | mince_output_frozen | Mince output — frozen (CCP-M1) | temp | -18.0 | -17.0 |
| 4 | prep_input | Prep input (CCP-MP1) | temp | 7.0 | 8.0 |
| 5 | prep_output_chilled | Prep output — chilled (CCP-MP1) | temp | 4.0 | 5.0 |
| 6 | prep_output_frozen | Prep output — frozen (CCP-MP1) | temp | -18.0 | -17.0 |
| 7 | kill_days_lamb | Lamb — max days from kill (CCP-M2) | kill_days | 6 | NULL |
| 8 | kill_days_beef | Beef (fresh) — max days from kill (CCP-M2) | kill_days | 6 | NULL |
| 9 | kill_days_imported_vac | Imported / vac-packed — no kill-day limit (CCP-M2) | kill_days | NULL | NULL |

   Seed comments must note: amber is DISPLAY-ONLY (CA still fires above pass — divergence from goods-in) and `kill_days_imported_vac` NULL is Hakan's explicit documented deviation (register §4).
3. `CREATE TABLE IF NOT EXISTS public.haccp_mince_threshold_audit` — `id`, `threshold_id uuid NOT NULL`, `changed_by uuid NOT NULL`, `changed_at timestamptz DEFAULT now() NOT NULL`, `old_pass_max`/`new_pass_max`/`old_amber_max`/`new_amber_max numeric(4,1)`, `summary text`.
4. Grants: `GRANT ALL` on both tables to `authenticated`, `service_role` (baseline blanket grant doesn't cover new tables).
5. RLS mirror of the goods-in migration §5/§6 exactly (each policy preceded by `DROP POLICY IF EXISTS`): thresholds — SELECT `current_user_is_active()`, INSERT/UPDATE/DELETE `is_admin()`; audit — SELECT + INSERT `is_admin()`, **NO UPDATE/DELETE policy → immutable**.
6. Verify locally: `npm run db:reset` **twice** (idempotence proof). Commit.
**🗣 In plain English:** one rulebook table holding both the six temperature bands and the three per-species kill-day limits, seeded with the approved numbers, plus a write-once change diary. Only an admin can edit the rulebook; nobody — not even an admin — can rewrite the diary. The "no limit for imported vac-packed" row is deliberately blank and structurally locked that way.

**Step 5 — pgTAP `supabase/tests/020-rls-mince-thresholds.test.sql`** (mirror `019-rls-goods-in-thresholds.test.sql`): RLS enabled on both tables; band CHECK rejects inverted row (`23514`); kill-binary CHECK rejects an amber value on a `kill_days` row (`23514`); non-admin active staff CAN SELECT thresholds, INSERT → `42501`, UPDATE/DELETE → 0 rows; admin CAN UPDATE + INSERT audit; admin UPDATE/DELETE on audit → 0 rows (immutable); non-admin CANNOT SELECT audit. Target row for the write tests: `mince_input`. Run the pgTAP suite locally. Commit with Step 4 if preferred (one migration slice).

### Stage 3 — Port, adapters, service, route (server authoritative)

**Step 6 — failing fake-adapter + service tests.**
- `tests/unit/adapters/fake/HaccpDailyChecksRepository.minceThresholds.test.ts` (mirror the `.goodsInThresholds` twin): list returns seeded rows ordered by position; update mutates + records an audit entry in the fake; `insertTimeSeparation` now returns an `id` and records the insert.
- `tests/unit/services/HaccpDailyChecksService.mincePrep.test.ts`:
  - `validateMince`/`buildMince`/`buildMinceCorrectiveActions` (+ meatprep twins) accept `thresholds` and delegate to the domain fns. **Spec-critical pins:** input 7.5 (amber) ⇒ `validateMince` rejects without `corrective_action` (400) AND `buildMince` persists `input_temp_pass:false` AND `buildMinceCorrectiveActions` emits the CCP-M1 input CA row — the amber band changes NONE of the paperwork.
  - Missing channel key ⇒ throws `ServiceError` (fail-closed → route 500).
  - CA `deviation_description` limits are interpolated from the resolved rows (e.g. `limit ≤7°C` comes from `pass_max`), and `deriveMinceTempAction`/`derivePrepTempAction` texts carry the DB values, not literals.
  - `killDatePass`/`killDateHardFail` service methods now take `thresholds` and delegate (lamb 7d → hardFail; imported_vac 40d → pass).
  - `validateMinceThreshold(input, current)`: rejects non-finite numbers; null-ness changes (structure lock — mirrors goods-in incl. the imported_vac NULL row); `amber_max < pass_max`; a non-integer or `< 1` `pass_max` on a `kill_days` row; any non-null `amber_max` on a `kill_days` row.
  - `buildTimeSeparationCorrectiveActions`: empty/whitespace `corrective_action` → `[]`; non-empty → exactly one row `{ source_table: 'haccp_time_separation_log', ccp_ref: 'MMP-TS', deviation_description: 'Time separation (MMP-MF-001 Form 3) — issue recorded during allergen changeover. Allergens in production: <allergens_in_production>', action_taken: <the trimmed free text>, product_disposition: null, recurrence_prevention: null, management_verification_required: true }`.
- Update `tests/unit/services/HaccpDailyChecksService.test.ts` mince call sites to the new signatures (assertions unchanged — behaviour pins survive).

**Step 7 — port + adapters.**
- `lib/ports/HaccpDailyChecksRepository.ts`: add `listMinceThresholds(): Promise<readonly MinceThreshold[]>` and `updateMinceThreshold(input: UpdateMinceThresholdInput, changedBy: string): Promise<MinceThreshold>` (doc comments mirror the goods-in pair, incl. the FAIL-CLOSED consumer note); change `insertTimeSeparation` to `Promise<{ id: string }>` (doc: id needed for the new time-sep CA linking).
- `lib/domain/HaccpDailyCheck.ts`: `MincePrepListResult` gains `thresholds: readonly MinceThreshold[]` **appended last** (F-19 byte-identity discipline — existing response key order preserved, new key last).
- `lib/domain/HaccpCorrectiveAction.ts`: extend `HaccpCASourceTable` with `"haccp_time_separation_log"`.
- `lib/adapters/supabase/HaccpDailyChecksRepository.ts`: implement both threshold methods (update = read-old → update → insert audit row — copy the `updateGoodsInThreshold` shape); in `listMincePrep` (~line 753) add the thresholds select `ORDER BY position` to the `Promise.all` — **fatal on error** (copy the "never fall back to hardcoded limits" stance); `insertTimeSeparation` adds `.select('id').single()` and returns it.
- `lib/adapters/fake/HaccpDailyChecksRepository.ts`: mirror all three. Step-6 adapter tests green.
**🗣 In plain English:** the existing Supabase plug learns to read and diary-edit the new rulebook, and the time-separation insert now hands back the new row's ID so a paperwork entry can point at it; the practice-dummy plug learns the same tricks so unit tests never need a real database.

**Step 8 — service re-point.** In `lib/services/HaccpDailyChecksService.ts`:
- DELETE the module-level hardcoded fns `killDatePass` / `killDateHardFail` / `inputTempPass` / `outputTempPass` (lines 463–484). The exposed service methods keep their names but gain a `thresholds: readonly MinceThreshold[]` parameter and delegate to the domain (`minceTempPass(temp, resolveMinceThreshold(thresholds, minceTempKey(form, channel, mode)))`; kill-days via `kill_days_<species>` key), wrapping resolver throws in `ServiceError` (mirror `resolveProcRoomThresholds`' fail-closed comment, lines 377–402).
- Thread `thresholds` through `validateMince` / `buildMince` / `buildMinceCorrectiveActions` / `validateMeatPrep` / `buildMeatPrep` / `buildMeatPrepCorrectiveActions`. Deviation/CA gating logic stays structurally byte-identical — only the boolean sources change.
- Interpolate resolved DB limits into `deriveMinceTempAction` / `derivePrepTempAction` and the CA `deviation_description` strings (`≤7°C`, `2°C`, `4°C`, `-18°C` literals become `${...}` of the resolved row values) — signatures gain the resolved threshold.
- Add the mince-threshold trio (mirror the goods-in trio at lines 1103–1138): `listMinceThresholds` passthrough; `validateMinceThreshold(input, current)` per Step-6 rules (structure lock + kill-day integer rule + amber≥pass; `amber == pass` allowed = amber band empty); `updateMinceThreshold` passthrough.
- Add `buildTimeSeparationCorrectiveActions` per Step-6 contract, next to `buildTimeSeparation`; add both new methods to the `HaccpDailyChecksService` interface.
- Grep-proof: **no mince/prep band literal (7, 2, 4, -18, 6-day) remains in this file for grading or CA text.** Step-6 service tests green. Commit.

**Step 9 — route.** `app/api/haccp/mince-prep/route.ts`:
- POST, `form === 'mince' | 'meatprep'`: before validation — `const thresholds = await dc.listMinceThresholds(); if (thresholds.length === 0) return NextResponse.json({ error: 'Could not load mince/prep thresholds' }, { status: 500 })` (mirror the delivery route's stance); thread `thresholds` into `validateMince`/`killDateHardFail`/`buildMince`/`buildMinceCorrectiveActions` and the meatprep trio. Response keys, kill-date hard-fail 400 extras, role gate, `?range=` parsing all untouched.
- POST, `form === 'timesep'` (**bug fix 1, server half**): capture `const { id } = await dc.insertTimeSeparation(...)`; `const caRows = dc.buildTimeSeparationCorrectiveActions({ input, userId, sourceId: id })`; `const { ca_write_failed } = await submit.fileCorrectiveActions(caRows, 'timesep')`; return `{ ok: true, ca_write_failed }`. Update the route header comment (the "timesep writes NO CA row" note is now false).
- GET: no code change needed beyond types — `listMincePrep` now carries `thresholds` and `NextResponse.json(result)` passes it through (appended last).
- NEW `app/api/haccp/admin/mince-thresholds/route.ts`: copy `app/api/haccp/admin/goods-in-thresholds/route.ts` verbatim shape — `isAdmin` header gate + per-caller client (DB `is_admin()` fires), GET list-all, PATCH → 404 unknown id → `validateMinceThreshold` against the current row → update+audit. Always sends/returns the full band per the goods-in contract.
- `tests/integration/haccp-mince-thresholds.test.ts` (NEW, mirror `haccp-goods-in-thresholds.test.ts`): mince-prep GET carries the 9 seeded threshold rows; non-admin GET/PATCH on the admin route → 403; admin PATCH edits `mince_output_chilled` amber and an audit row appears; inverted band rejected; kill-day row rejects non-integer and any amber; POST mince at input 7.5 **with** CA → 200, row persists `input_temp_pass:false`, CA row exists (amber files paperwork); POST mince at 7.5 **without** CA → 400; POST timesep with `corrective_action` text → row's `corrective_action` column persisted AND a `haccp_time_separation_log` CA-register row exists; POST timesep without text → zero CA rows. Commit.
**🗣 In plain English:** the API now fetches the rulebook fresh on every save and refuses to grade blind; the time-separation form finally saves its "what went wrong" text AND files the register entry it always should have; a new admin-only API edits the rulebook with the diary entry written in the same breath.

### Stage 4 — Screen rebuild + admin UI

**Step 10 — guard first (TDD for the repaint).** Add `"app/haccp/mince/page.tsx"` to `SCREENS` in `tests/unit/lint/haccp-screens-token-pure.test.ts` (update the header's screen count). It FAILS against the current page (raw `#1E293B`/`#EB6619` hexes, stock slate/orange/red/green/amber palette everywhere) — that red test drives the repaint.

**Step 11 — recompose `app/haccp/mince/page.tsx`** (composition reference: `app/haccp/delivery/page.tsx`; consume ONLY via the `components/ui` barrel — expected set: `ScreenHeader`, `NumberPad`, `Modal`, `Button`, `SegmentedControl`, `TextField`, `Textarea`, `Banner`, `Badge`, `Spinner`; plus `goodsInStatus`-style imports of `minceTempStatus`/`minceTempPass`/`minceKillDaysPass`/`minceKillDaysHardFail`/`resolveMinceThreshold`/`minceTempKey`/`describeMinceBand` from `@/lib/domain`):
- `ScreenHeader` bold-navy real `<header>` (`surface` prop) replaces the hand-rolled `bg-[#1E293B]` header; title "Mince & Meat Prep", kicker "CCP-M1 · CCP-M2 · CCP-MP1 · CCP-MP2"; actions = back-to-hub + Handbook as `ghost-inverse` (the guard bans `secondary`/bare `ghost` there).
- Kit `NumberPad` in a kit `Modal` (`variant="sheet"`) replaces the local `Numpad` (lines 359–414, which DROPS): `allowDecimal` always; `allowNegative` when the active channel's output mode is `frozen` (sign-toggle row appears — the #112 both-flags contract); `suffix="°C"`; `tone` from `minceTempStatus` (`pass→success, amber→warning, fail→danger`, empty→`neutral`); title/description + `hint` worded via `describeMinceBand` of the resolved channel row.
- Thresholds arrive on the existing GET (`d.thresholds`). **Client fail-closed:** if missing/empty → error `Banner` + all temp-entry buttons disabled; there is no baked-in band table left. Live verdicts: `status = minceTempStatus(...)`, `pass = status === 'pass'` — tiles/badges render 3-state (success/warning/danger); CCA trigger, submit gating and all persisted flags key on the BOOLEAN exactly as today (amber ⇒ popup + CA, spec-critical).
- Species chips derive their sublabel from the DB rows (`max 6d` from `kill_days_<key>`, `≤7°C` from the input row via `describeMinceBand`); kill-enforcement flag = `kill_days` row `pass_max !== null`. Output-mode toggle labels (`Chilled ≤2°C` / `Frozen ≤-18°C` etc.) derive from the mode rows. Delete the hardcoded `SPECIES` limit strings and the local `inputTempPass`/`outputTempPass`/`killDaysPass`/`killDaysHardFail` (lines 76–80, 197–217).
- CCA popup → kit `Modal` (sheet). **Bug fix 3:** when BOTH channels of a form fail, the cause list = deduped concatenation of both channels' `MINCE_CAUSES_BY_CHANNEL` lists (first-seen order, single `Other` last); still ONE popup, ONE payload applied to both channels' CA rows (server side already does this). Disposition/protocol rendering per channel unchanged.
- **Bug fix 2:** Time-Sep history header + empty-state honour `dateFilter` like the other two tabs ("Today's / This week's / Last week's time separation records"). The date-filter `SegmentedControl` renders on all three tabs (the API already range-filters timesep).
- **Bug fix 1 (client half):** timesep submit body sends `corrective_action: tCA.trim() || undefined` (replacing the hardcoded `undefined` at line 549). `ca_write_failed` surfacing already generic in `doSubmit` — keep.
- **Bug fix 4:** `submitErr` renders ONCE on the mince tab — keep the in-form render next to the submit button (line 998; decision #19a placement), delete the history-section duplicate (line 1010).
- Green/amber caging: green/amber ONLY on temperature tiles/verdicts + pass/warn/fail badges (kill-day verdict badge and history "All pass/Deviation" badges count as pass/fail badges — keep, via status tokens). Repaint ALL chrome: tab selector, species/source/output-mode chips, print use-by option buttons (currently green/blue chrome — becomes neutral/token styling), label-check button, flash banner (kit `Banner`), CCA buttons — selected/primary = orange-500 + ink-900 per pairing law; every "something is wrong" (kill-date hard-fail block, allergen chips, error text, CCA header) = `--mfs-red-*` semantic family. History rows keep boolean-based badges (banded amber is NOT retro-fitted onto stored rows — thresholds may have changed since; live entry only).
- ALL inventoried behaviour KEPT (spec §A checklist): species picker (incl. `setMSpecies` clearing the typed input temp), delivery-batch source picker (16-day window, species filter with legacy `red_meat` shown for both, multi-select, selected-batch strips, empty/amber no-match states), prep's mince-batch second source picker, kill-date hard block (submit disabled + "DO NOT MINCE… Category 3 ABP" message), CCA flow (cause → disposition → recurrence → notes, per CA-001 Table 4, channel-specific lists), allergen 14-pick + mandatory label-check gate blocking submit, `PrintLabelStrip` + use-by dialog (Fresh 7/10/14d · Frozen 3/6mo via `getPrinter().printMinceLabel` — **byte-preserve the call, options and print-error → `submitErr` path**), date filter, server-side batch codes untouched, flash, `ca_write_failed`.
- Step-10 guard goes green. Commit.
**🗣 In plain English:** same screen, same buttons, same flows — rebuilt from the shared kit so it matches the other finished screens, with a new middle "warning" colour on borderline temperatures, every hardcoded limit string now read from the database, and the four bugs fixed en route.

**Step 12 — admin UI + labels.** `app/haccp/admin/page.tsx`:
- Thresholds tab: add a **"Mince & Meat Prep (CCP-M1 / M2 / MP1 / MP2)"** section directly below the Goods In section (~line 857): fetch `/api/haccp/admin/mince-thresholds`; temp rows = pass + amber inputs (numeric, one decimal); kill-day rows = single integer "max days" input; the `kill_days_imported_vac` row renders read-only — "No kill-day limit — documented deviation, recorded for traceability only". Save → PATCH → existing `savedReminder` fires (extend its copy to name CCP-M + §4 + retrain). Section-local editor row component modelled on `GoodsInThresholdRow` (~line 285). A one-line note in the section states the amber bands are display-only (CA unchanged). **Only this new section follows the pairing law — do NOT repaint the rest of the screen (F-TD-42 stays open).**
- `CCP_LABELS` gains `'MMP-TS': 'MMP — Time Separation'`; `SOURCE_LABELS` gains `'haccp_time_separation_log': 'Time Separation'` (the new CA rows would otherwise render unlabelled in the queue). Commit.

### Stage 5 — Register, E2E, ship

**Step 13 — full local unit/integration proof.** `npm run db:reset` (×2) → `vitest` unit suite (domain + service + fake + lint pins; the migration-filename convention test auto-covers Step 4) → pgTAP suite → `npm run test:integration`.

**Step 14 — exhaustive `@critical` E2E.** Rewrite/extend `tests/e2e/17-haccp-mince-prep.spec.ts` modelled on `12-haccp-delivery.spec.ts`: keep its existing pins; `enterSession`-style race discipline; every assertion keys on a unique per-run marker (product name / notes free text), never counts; `toHaveCSS` (retrying) + `page.mouse.move(0,0)` before every colour read; **do NOT assert `corrective_action_required` from list rows** (not in the list select); NO service-role client (audit immutability is pinned at integration + pgTAP layers). Required coverage:
1. Mince happy path — lamb, kill date within 6d, input 5.0 / output 1.0 via the kit NumberPad → flash with `MINCE-DDMM-LAMB-N` batch code → row + print strip in today's log.
2. **Amber display + unchanged paperwork** — mince input 7.5: numpad/tile shows WARNING colour (not red, not green — computed-style assertion), submit opens the CCA popup, completing it lands the CA in the admin queue (the register never went quiet).
3. Fail band — mince output chilled 3.5 → danger colour → CCA → queue. Frozen mode: output -17.5 → amber colour (decimal + sign-toggle together on the pad).
4. **Dual-channel CCA (bug 3)** — input 9.0 AND output 4.0 → ONE popup listing BOTH channel banners and a COMBINED deduped cause list (assert a cause unique to the output list is offered).
5. Kill-date hard block — lamb kill date 8 days back → "DO NOT MINCE" + submit disabled; `imported_vac` same date → informational, submits fine (no form changes for that species).
6. Meat prep — product name, allergen 14-pick, label-check gate blocks then unblocks submit, mince-batch source picker consumes run #1's batch code.
7. **Time-sep (bugs 1+2)** — submit with corrective-action text → record saved; admin CA queue shows the Time Separation entry; history header honours This week / Last week; submit WITHOUT text → no new queue entry.
8. **submitErr single render (bug 4)** — trigger a validation error on the mince tab, assert exactly one error paragraph.
9. Admin — edit `mince_output_chilled` amber 3.0 → 3.5 in the new section → mince screen band copy self-updates → RESTORE → non-admin PATCH/GET denied (403).
10. Visual law — light theme, navy header white title, green/amber ONLY inside temp tiles/verdicts + pass/warn/fail badges (computed-style via `_theme.ts` helpers), chrome selections orange, print strip present.
`npm run test:e2e:ui` locally green.

**Step 15 — register.** `docs/reference/haccp/DOCUMENT_CONTROL.md`:
- §4: add a third exception paragraph — CCP-M mince/meat-prep limits (6 temp channels + per-species kill-day limits) app-configurable since Jul 2026 (`haccp_mince_thresholds`, admin at `/haccp/admin` → Thresholds, immutable `haccp_mince_threshold_audit`); band STRUCTURE code-locked. State explicitly: **CCP-M amber bands are DISPLAY-ONLY — corrective action still triggers on anything above the pass limit** (unlike CCP-1's conditional-accept amber).
- §4 table: add the CCP-M rows — mince/prep input pass ≤7°C · warning 7–8°C · deviation >8°C (source: Reg 853/2004 Annex III Sec V Ch III — 7°C red-meat working limit); mince output chilled ≤2°C · 2–3°C · >3°C (mince ≤2°C, same Chapter); prep output chilled ≤4°C · 4–5°C · >5°C (meat preparations ≤4°C); frozen output (both) ≤-18°C · -18 to -17°C · >-17°C; kill days lamb/beef ≤6 (binary, hard block); imported vac-packed — no app-enforced kill-day limit (justification (3)).
- Written justifications block: (3) **vac-pack deviation** — Reg 853/2004 Annex III Sec V Ch III pt 2(b)(iii) permits mince from vac-packed beef/veal up to 15 days after slaughter (quote the provision); the app consciously does NOT enforce a 15-day clock for `imported_vac` — kill-date control stays manual/operator per Hakan's decision 2026-07-02; note the frozen-route nuance (no day-clock where meat was boned before freezing; re-freezing after thawing prohibited, pt 5). (4)–(7) the **four amber grace bands** (input 7–8; mince out 2–3; prep out 4–5; frozen -18→-17) — 1°C display-only grace for probe/handling fluctuation during active production; corrective-action paperwork unchanged (fires above the pass line); decision Hakan 2026-07-02.
- §7 change-log row (Jul 2026, CCP-M) covering all of the above + retrain reminder. Commit.
**🗣 In plain English:** the inspector-facing register now states the mince-room bands the app actually enforces, why four of them show an amber warning colour without softening the paperwork, and why the imported vac-packed line deliberately has no in-app kill-date ceiling.

**Step 16 — ship.** Push `feat/haccp-mince-unit`, open PR (dependency-justification line: **no new packages**). Merge only via the required `smoke` check — accepted-red signature: `25-haccp-reviews › weekly` (F-INFRA-08) + flaky `04-kds-line-undo` (passes on retry). ANVIL then runs the full matrix + prod-build preview taps (`npm run test:e2e:preview -- <url> --unprotected`, readiness gate: poll `/api/auth/team` for 200) and verifies the migration raised **no PITR gate** (additive-only). Cert: `Branch:` line bare, literal "CLEARED FOR PRODUCTION".

---

## 8 · TDD test plan (test-first pairs, vertical slices)

| Test (written FIRST, red) | Drives | Behaviour in plain English |
|---|---|---|
| `tests/unit/domain/mincePrep.test.ts` | Step 3 domain module | every band fencepost both sides; amber colours but never un-fails; missing key stops the line |
| `supabase/tests/020-rls-mince-thresholds.test.sql` | Step 4 migration | non-admins can read but never write limits; the change diary can never be rewritten; kill-day rows structurally can't grow an amber band |
| fake-adapter + service `.mincePrep` tests | Steps 7–8 | server grades from the DB rulebook, refuses to grade without it, and amber still demands + files paperwork |
| `tests/integration/haccp-mince-thresholds.test.ts` | Step 9 routes | admin edit is 403-proof + audited; timesep text persists AND reaches the CA register; amber POST without CA is a 400 |
| token-purity guard (RED at Step 10) | Step 11 repaint | the screen physically cannot ship with raw hexes or stock palette colours |
| `tests/e2e/17-haccp-mince-prep.spec.ts` rewrite | whole-unit acceptance (ANVIL owns the matrix) | a robot taps every flow on the real built app, including the four bug fixes |

All tests hit public interfaces only (domain exports, HTTP routes, rendered DOM) — none reach into module internals.

---

## 9 · Acceptance criteria (PRD — the contract for Gates 3/4)

1. A mince input reading of 7.5°C shows a WARNING (amber) tile/pad colour, still requires and files the corrective action, and persists `input_temp_pass: false` — client colour, server booleans and CA register all consistent. Same pattern on all 6 channels at their locked bands.
2. Zero band/kill-day literals outside `lib/domain/mincePrep.ts`'s tests, the migration seed and the register doc; client and server both import the one domain module; server authoritative on persist.
3. Missing/unloadable threshold rows → POST 500 / client disabled temp entry with an error banner — never a silent hardcoded grade (fail-closed).
4. pgTAP proves: non-admin writes DENIED at the DB; audit rows immutable even to admins; kill-day rows structurally amber-less.
5. Admin can edit the 6 temp bands + lamb/beef kill days at `/haccp/admin` → Thresholds; `imported_vac` shows read-only "no limit"; every save audit-logged + fires the §4/retrain reminder; screen copy self-updates.
6. Bug fixes verified: timesep corrective-action text persists to `haccp_time_separation_log.corrective_action` AND files an `MMP-TS` CA-register row (only when non-empty); timesep history honours the date filter; dual-channel failures show ONE popup with a combined deduped cause list; `submitErr` renders exactly once on the mince tab.
7. `app/haccp/mince/page.tsx` passes the token-purity guard; green/amber appear only on temperature tiles/verdicts + pass/warn/fail badges; route, API paths and batch-code formats byte-identical; printer flow (`PrintLabelStrip`, use-by dialog, `getPrinter().printMinceLabel`) and hub alarm files byte-identical in behaviour.
8. DOCUMENT_CONTROL §4 updated in the same PR (CCP-M rows + configurability + vac-pack deviation + four amber justifications + change-log).
9. Full ladder green: unit + pgTAP + integration + `@critical` E2E on prod-build preview; migration additive (no PITR gate); no new `package.json` entries.

**🗣 In plain English:** when this ships, the butcher sees a friendlier three-colour screen that behaves identically where it matters, the admin owns the numbers with a tamper-proof diary, the inspector's register matches the app, and four long-standing paper-trail bugs are provably dead.

---

## 10 · Hard guards (untouchable — restate for the implementer)

- `PrintLabelStrip`, `getPrinter().printMinceLabel`, the use-by options (7/10/14/90/182 days), `printErrorMessage` → `submitErr` placement (decision #19a: error next to the button) — **behaviour byte-preserved** (ADR-0010; label renderer/pipeline out of scope, decision #19).
- `lib/haccp-alarm-status.ts`, `hooks/useHACCPAlarm.ts`, the hub — untouched.
- Route `/haccp/mince`, middleware, API paths, batch-code formats `MINCE-/PREP-DDMM-SP-N` — unchanged.
- NO form changes for `imported_vac` (no 15-day clock, no toggle, no frozen-output block — all rejected at Gate 1). No poultry.
- Server hexagon respected: route stays thin; no vendor import outside `lib/adapters/`; wiring only in `lib/wiring/`.
- `/haccp/admin`: ONLY the new section (+ the two label-map entries) — F-TD-42 repaint stays open.
- Migration additive-only; NO `active` column; no style-leaking props on kit components (decision #17).
- Implementer stops and reports rather than improvising on ANY ambiguity.

---

## 11 · Risk Assessment

| # | Category | Risk | Severity | Mitigation | Must-fix? |
|---|---|---|---|---|---|
| R1 | Business logic (spec-critical) | **Amber-semantics drift**: the goods-in twin's amber is saves-free ("conditional accept") — copying it here would silently stop CA paperwork for readings in the new amber bands, degrading a legal record | HIGH | The domain module exposes SEPARATE `minceTempStatus` (display) and `minceTempPass` (paperwork) functions with the rule pinned in Step-2 unit tests, Step-6 service tests (amber ⇒ 400-without-CA + CA row), Step-9 integration and Step-14 E2E #2 | **YES — resolved by Steps 2/3/6/9/14 (in-plan)** |
| R2 | Business logic | A species/channel key without a seeded row now 500s that submission lane (fail-closed by design; seed incompleteness would brick production logging) | HIGH | Seed covers all 9 keys incl. `kill_days_imported_vac`; Step-2 test enumerates every key the page/service can emit and asserts resolution; E2E walks every species + mode | **YES — resolved by Steps 2/4 (in-plan)** |
| R3 | Security | Threshold writes must be denied to non-admins at BOTH route and DB; the audit must be tamper-proof | HIGH | Double gate (route `isAdmin` + RLS `is_admin()` via per-caller client); pgTAP Step 5 proves denial + immutability; integration proves 403 | **YES — resolved by Steps 5/9 (in-plan)** |
| R4 | Business logic (regression) | Rebuilding a 1404-line safety-critical screen risks dropping an inventoried behaviour (species-filter legacy `red_meat`, input-clear on species change, label-check gate, kill-date block, prep's dual source pickers…) | HIGH | Spec §A inventory restated as the Step-11 checklist; existing E2E pins kept; Step-14 exhaustive tap suite; server logic only gains threading | **YES — resolved by Steps 11/14 (in-plan)** |
| R5 | Data/API contract | Changing `insertTimeSeparation` to return `{ id }` and adding a new `source_table` value could break consumers — checked: `haccp_corrective_actions.source_table` is plain `text` (no CHECK), and the port method has exactly the service passthrough + route caller | LOW | Type change propagated port→adapters→service→route in one slice (Steps 6–9); admin queue label map updated (Step 12) so new rows render labelled | No |
| R6 | Launch blocker (compliance) | Shipping code without the §4 register additions leaves inspector-facing paperwork contradicting the app (esp. the vac-pack deviation, which exists ONLY as a decision today) | MED | Step 15 in the same PR; admin save-reminder names CCP-M + §4 + retrain | **YES — resolved by Step 15 (in-plan)** |
| R7 | Concurrency | Two admins editing one threshold: read-old → update → audit can record a stale "old" value (same accepted window as goods-in/process-room precedent) | LOW | Accepted, mirrors precedent; audit still captures both changes in order; single-admin reality | No |
| R8 | Concurrency | Client grades against page-load thresholds; an admin edit mid-entry makes the tile disagree with the persisted verdict | LOW | Server re-loads thresholds at POST and is authoritative (spec-mandated); self-corrects on refresh | No |
| R9 | Data migration | Preview-branch resync / repeat `db:reset` failure from a non-idempotent or short-named migration | MED | 14-digit timestamp; `IF NOT EXISTS` + guarded seeds + `DROP POLICY IF EXISTS`; Step 4 runs `db:reset` twice; filename-convention test | No (covered) |
| R10 | Numeric edge | `numeric(4,1)` vs client float at fenceposts (7.0, -18.0); kill-days stored as numeric but compared as integers | LOW | Bands ≤-inclusive on one-decimal values; Step-2 pins every boundary; `validateMinceThreshold` enforces integer kill days | No |

**Headline: no unresolved must-fix risks.** R1–R4 and R6 are must-fix by nature and each has named steps and named tests inside this plan that prove them handled before merge. **Gate 2 is not blocked.** R1 deserves the conductor's eye at review anyway — it is the single place where blindly mirroring the Goods In twin would produce a compliance regression.

**🗣 In plain English:** the one genuinely dangerous trap in this unit is treating "amber" the way the previous screen did — that would quietly stop legal paperwork. The plan builds a wall against it: two differently-named functions, and tests at four layers that fail if amber ever stops demanding a corrective action. Everything else is the same well-trodden path the Goods In unit already shipped safely.

---

## 12 · Gate-2 hexagonal answers

- **Port:** `lib/ports/HaccpDailyChecksRepository.ts` (existing) — extended with `listMinceThresholds` / `updateMinceThreshold` + the `insertTimeSeparation` return-type widening. No new port.
- **Adapters:** `lib/adapters/supabase/HaccpDailyChecksRepository.ts` (real) + `lib/adapters/fake/HaccpDailyChecksRepository.ts` (test double) — both implement the additions. Wiring untouched.
- **New dependencies:** **NONE.** No `package.json` change; nothing to justify or wrap.
- **Rip-out test:** **PASS** — one adapter + one wiring line still swaps the database; the domain module is pure TS; UI → API → service → port throughout.
- **🗣 In plain English:** same Lego board, one socket widened, zero new plugs — vendor independence is exactly as strong after this unit as before it.
