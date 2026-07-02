# Goods In (CCP 1) unit — EXECUTION PLAN

**Source spec (LOCKED, Gate 1 approved):** `docs/plans/2026-07-02-goods-in-ccp1-unit.md` — bands are locked, do NOT re-derive them.
**Branch:** `feat/goods-in-ccp1-unit` (off `main`). PR merges via the required `smoke` check.
**Written:** 2026-07-02 (FORGE Order phase). Implementer must be able to execute this without seeing the planning conversation.

**🗣 In plain English:** this plan rebuilds the delivery-intake screen on the design kit, renames it "Goods In" on labels only, moves its temperature pass/amber/reject limits out of hardcoded code into an admin-editable, audit-logged database table (exactly like the process-room screen already does), and makes ONE file the single owner of the grading rule so the screen and the server can never disagree again. The big food-safety fix riding along: poultry was passing at ≤8°C when the law says ≤4°C.

---

## 0 · Mini-map

```
DOMAIN (core logic)
  ├─ lib/domain/goodsIn.ts (NEW — the one grading rule) ← client page AND server service
  ├─ HaccpDailyChecksRepository (port) → [Supabase] lib/adapters/supabase/HaccpDailyChecksRepository.ts
  │                                      [Fake]     lib/adapters/fake/HaccpDailyChecksRepository.ts
  └─ Printer (port) → [Sunmi/browser] — BYTE-PRESERVED, not touched
🗣 one new brain file + two extra methods on an existing socket — no new vendors, no new plugs
```

---

## 1 · Goal

1. **Scope A** — recompose `app/haccp/delivery/page.tsx` from `components/ui/` + semantic tokens only; repaint illegal chrome greens; labels-only rename to "Goods In"; register the screen in the token-purity guard.
2. **Scope B** — new `haccp_goods_in_thresholds` + immutable `haccp_goods_in_threshold_audit` tables (CCP-3 pattern), double-locked admin RLS, fail-closed resolution, `/haccp/admin` → Thresholds gets a Goods In section, DOCUMENT_CONTROL §4 corrected with the two written justifications.
3. **Scope C** — new `lib/domain/goodsIn.ts` is the single source of the band rule; both client `calcStatus` and the daily-checks service's `temp_status` derivation import it; the duplicate dies. Server stays authoritative on persist.

**🗣 In plain English:** three jobs in one PR — same look-and-feel system as the other rebuilt HACCP screens, the temperature rulebook moves into the database with a tamper-proof change log, and the rule itself lives in exactly one file.

---

## 2 · Domain terms (CONTEXT.md conventions apply)

- **CCP 1 / Goods In** — the delivery-intake critical control point: probe the delivery, grade the temperature, accept / conditionally accept / reject.
- **Band** — the pass / amber (conditional accept, corrective action logged) / reject verdict for a temperature within a category. Statuses persist as the existing DB strings `pass` / `urgent` / `fail` — **do not rename them**.
- **Fail-closed** — if the app cannot load a category's threshold row, it must refuse to grade (throw → 500 / disabled entry), never fall back to a hardcoded or looser ruler.
- **BLS** — born/reared/slaughter/cut traceability block required for meat categories.
- **🗣 In plain English:** "fail-closed" = if the ruler is missing, stop measuring — never grab a different ruler and hope.

---

## 3 · Compliance flags

- **HACCP safety-critical screen** → full ANVIL matrix + exhaustive `@critical` browser-tap E2E on the prod-build preview (per `feedback_anvil_full_browser_taps`).
- **Supplier-facing behaviour change (accepted at Gate 1, spec §6):** poultry deliveries at 4–5°C become amber-with-CA; >5°C becomes reject (previously passed up to 8°C). Red meat unchanged.
- **Register duty:** DOCUMENT_CONTROL.md §4 must be corrected **in the same PR**, carrying two written justifications (red-meat >8°C vs Reg 853/2004's 7°C transport limit; poultry 1°C documented grace band above the legal ≤4°C).
- **🗣 In plain English:** the paperwork the food inspector reads must change in the same breath as the code, with the two "here's why we deviate slightly from the strictest reading" notes written down.

---

## 4 · ADR review

| ADR | Verdict |
|---|---|
| 0002 (hexagonal shape/naming) | **Complies** — extends an existing port; vendor SQL stays in `lib/adapters/supabase/`. |
| 0004 (RLS security model) | **Complies with documented divergence** — writes locked to `is_admin()` at the DB, same deliberate divergence already documented in the process-room migration header (regulatory control ⇒ defense-in-depth). Copy that header rationale into the new migration. |
| 0010 (printer transport port) | **Untouched** — hard guard §9. |
| 0014 (design-system consumption, tiered workflow) | **Complies** — Tier B, kit-only composition, no new reusable visual defined inside the screen. If the rebuild needs a shared primitive that doesn't exist, it goes to `components/ui/` + barrel FIRST (Rule 3). |

**No ADR conflicts.**

---

## 5 · Files to change (complete list)

| File | Action |
|---|---|
| `lib/domain/goodsIn.ts` | NEW — threshold types, fail-closed resolver, band/status derivation, band-copy formatter |
| `lib/domain/index.ts` | export the new module's types/functions |
| `lib/domain/HaccpDailyCheck.ts` | extend `DeliveryListResult` with `thresholds`; add `UpdateGoodsInThresholdInput` re-export point if placed here (preferred home: `goodsIn.ts`, re-exported via `index.ts`) |
| `supabase/migrations/20260702120000_haccp_goods_in_thresholds.sql` | NEW — tables + seed + grants + RLS (additive, idempotent) |
| `supabase/tests/019-rls-goods-in-thresholds.test.sql` | NEW pgTAP — RLS + immutability + CHECK proofs |
| `lib/ports/HaccpDailyChecksRepository.ts` | add `listGoodsInThresholds()` + `updateGoodsInThreshold()`; `listDeliveries` result now carries thresholds |
| `lib/adapters/supabase/HaccpDailyChecksRepository.ts` | implement the two methods; extend `listDeliveries` to also select thresholds (fatal on error) |
| `lib/adapters/fake/HaccpDailyChecksRepository.ts` | mirror the new methods for unit tests |
| `lib/services/HaccpDailyChecksService.ts` | delete local `deliveryTempStatus` bands; thread `thresholds` through `deliveryTempStatus` / `validateDelivery` / `buildDelivery`; add `listGoodsInThresholds` / `validateGoodsInThreshold` / `updateGoodsInThreshold` |
| `app/api/haccp/delivery/route.ts` | GET returns thresholds; POST loads thresholds and threads them (mirror `app/api/haccp/process-room/route.ts` lines 73–96); response key order preserved |
| `app/api/haccp/admin/goods-in-thresholds/route.ts` | NEW — GET/PATCH, double-gated, audit-logged (mirror `admin/process-room-thresholds/route.ts`) |
| `app/haccp/admin/page.tsx` | Thresholds tab: add "Goods In (CCP 1)" section (new section only follows pairing law — F-TD-42 exclusion) |
| `app/haccp/delivery/page.tsx` | full Scope-A recomposition + Scope-C re-point + labels-only rename |
| `app/tokens.css` | NEW category-chip semantic tokens (§5.11 brand mapping) |
| `tailwind.config.ts` | expose the category tokens as utilities (`category.*` colour group) |
| `tests/unit/domain/goodsIn.test.ts` | NEW — band boundary + fail-closed proofs |
| `tests/unit/services/HaccpDailyChecksService.goodsIn.test.ts` | NEW — service threading + fail-closed |
| `tests/unit/adapters/fake/HaccpDailyChecksRepository.goodsInThresholds.test.ts` | NEW — fake adapter parity |
| `tests/unit/lint/haccp-screens-token-pure.test.ts` | add `app/haccp/delivery/page.tsx` to `SCREENS` |
| `tests/unit/design/contrast-pairings.test.ts` | pin the new category-chip pairings (maths layer) |
| `tests/integration/haccp-goods-in-thresholds.test.ts` | NEW — admin edit + audit + non-admin 403 (mirror `haccp-process-room-thresholds.test.ts`) |
| `tests/e2e/12-haccp-delivery.spec.ts` | rewrite/extend into the exhaustive `@critical` Goods In suite |
| `docs/reference/haccp/DOCUMENT_CONTROL.md` | §4 CCP-1 rows corrected + justifications + configurability note |

**🗣 In plain English:** ~23 files — one new brain file, one new database migration with its proof tests, two extra methods on the existing Supabase socket, one rebuilt screen, one new admin API + admin section, and the test/paperwork trail that makes it shippable.

---

## 6 · Numbered steps (atomic, TDD-first)

### Stage 1 — Domain single source (Scope C foundation)

**Step 1 — branch.** `git checkout -b feat/goods-in-ccp1-unit` from up-to-date `main`.

**Step 2 — failing domain tests.** Write `tests/unit/domain/goodsIn.test.ts` (mirror `tests/unit/domain/processRoom.test.ts` style) covering, with the LOCKED seed values:
- Exact boundaries per category: lamb/beef/red_meat `5.0→pass, 5.1→urgent, 8.0→urgent, 8.1→fail`; offal `3.0→pass, 3.1→fail` (no amber); **poultry `4.0→pass, 4.1→urgent, 5.0→urgent, 5.1→fail`** (the fix); dairy/chilled_other `8.0→pass, 8.1→fail`; frozen/frozen_beef_lamb `-18.0→pass, -17.9→urgent, -15.0→urgent, -14.9→fail`; mince_prep `4.0→pass, 4.1→fail`; dry_goods → `pass` regardless of temp.
- `resolveGoodsInThreshold` THROWS on a missing category (fail-closed) — message names the missing key.
- `goodsInStatus(null, tempCcpRow)` → `fail` (server semantics); no-CCP row (null `pass_max_c`) → `pass`.
- `describeGoodsInBands` produces the chip copy from row values (e.g. `≤5°C pass · 5–8°C conditional accept · >8°C reject`; amber-less: `≤3°C pass · >3°C reject`; dry: no-temp-CCP wording).
- **🗣 In plain English:** every fence-post value is tested on both sides of the fence, and "the ruler is missing" is proven to stop the line, before any real code exists.

**Step 3 — implement `lib/domain/goodsIn.ts`** (pure TS, zero framework/vendor imports — `processRoom.ts` twin) and export from `lib/domain/index.ts`:
```ts
export interface GoodsInThreshold {
  readonly id: string;
  readonly category: string;        // app key: 'lamb' | 'beef' | ... (11 keys)
  readonly label: string;
  readonly pass_max_c: number | null;   // null = no temperature CCP (dry_goods)
  readonly amber_max_c: number | null;  // null = no amber band (pass_max is the reject line)
  readonly position?: number;
}
export interface UpdateGoodsInThresholdInput {
  id: string; pass_max_c: number | null; amber_max_c: number | null;
}
export function resolveGoodsInThreshold(thresholds, category): GoodsInThreshold // throw ServiceError-agnostic Error on missing
export function goodsInStatus(temp: number | null, t: GoodsInThreshold): 'pass' | 'urgent' | 'fail'
export function describeGoodsInBands(t: GoodsInThreshold): { limit: string; detail: string }
```
Rule (DB values in, verdict out — semantics preserved): no-CCP row → `pass`; `temp` null/NaN → `fail`; `temp <= pass_max` → `pass`; `amber_max != null && temp <= amber_max` → `urgent`; else `fail`. **The client keeps its own "no temp typed yet → null (no verdict)" pre-check before calling** — that split (client null, server fail) is today's behaviour and stays. Do NOT add a new numpad entry-bound guard — the current screen has none and behaviour is frozen ("ALL existing behaviour KEPT"). Step-2 tests go green.
**🗣 In plain English:** the whole traffic-light rule is now ~40 lines in one file with no dependencies; everything else asks it for the verdict.

### Stage 2 — Database (Scope B tables)

**Step 4 — migration `supabase/migrations/20260702120000_haccp_goods_in_thresholds.sql`** (14-digit timestamp mandatory; mirror the header discipline of `20260701120000_haccp_process_room_thresholds.sql` — ADDITIVE + IDEMPOTENT + RLS-divergence rationale comments):
1. `CREATE TABLE IF NOT EXISTS public.haccp_goods_in_thresholds` — `id uuid pk default gen_random_uuid()`, `category text NOT NULL UNIQUE`, `label text NOT NULL`, `pass_max_c numeric(4,1) NULL`, `amber_max_c numeric(4,1) NULL`, `position integer NOT NULL DEFAULT 0`, `CONSTRAINT haccp_goods_in_thresholds_band_check CHECK (amber_max_c IS NULL OR (pass_max_c IS NOT NULL AND amber_max_c >= pass_max_c))`.
   **Deliberate divergences from the process-room table, both spec-locked:** (a) nullable amber ("nullable amber where no band"); (b) **NO `active` column** — the process-room Guard lesson: fixed regulatory rows must not be toggle-off-able, so the toggle doesn't exist at all.
2. Seed 11 rows, each guarded `WHERE NOT EXISTS (... WHERE category = '<key>')` (LOCKED values):

| pos | category | label | pass_max_c | amber_max_c |
|---|---|---|---|---|
| 1 | lamb | Lamb | 5.0 | 8.0 |
| 2 | beef | Beef | 5.0 | 8.0 |
| 3 | offal | Offal | 3.0 | NULL |
| 4 | frozen | Frozen | -18.0 | -15.0 |
| 5 | frozen_beef_lamb | Frozen Beef/Lamb | -18.0 | -15.0 |
| 6 | poultry | Poultry | **4.0** | **5.0** |
| 7 | dairy | Dairy / Chilled | 8.0 | NULL |
| 8 | chilled_other | Chilled Other | 8.0 | NULL |
| 9 | dry_goods | Dry Goods | NULL | NULL |
| 10 | red_meat | Red meat (legacy) | 5.0 | 8.0 |
| 11 | mince_prep | Mince / prep (legacy) | 4.0 | NULL |

3. `CREATE TABLE IF NOT EXISTS public.haccp_goods_in_threshold_audit` — `id`, `threshold_id uuid NOT NULL`, `changed_by uuid NOT NULL`, `changed_at timestamptz DEFAULT now() NOT NULL`, `old_pass_max_c` / `new_pass_max_c` / `old_amber_max_c` / `new_amber_max_c numeric(4,1)`, `summary text`.
4. Grants: `GRANT ALL ... TO authenticated, service_role` on both (baseline blanket grant doesn't cover new tables).
5. RLS (each policy preceded by `DROP POLICY IF EXISTS`): thresholds — SELECT `current_user_is_active()`; INSERT/UPDATE/DELETE `is_admin()`. Audit — SELECT + INSERT `is_admin()`; **NO UPDATE/DELETE policy → immutable**.
6. Verify locally: `npm run db:reset` twice (idempotence proof).
**🗣 In plain English:** a new rulebook table seeded with the approved numbers plus a write-once change diary; only an admin can change the rulebook, nobody — not even an admin — can rewrite the diary. Legacy keys get rows so grading never finds a hole.

**Step 5 — pgTAP `supabase/tests/019-rls-goods-in-thresholds.test.sql`** (mirror `018-rls-process-room-thresholds.test.sql`): RLS enabled on both tables; band CHECK rejects inverted row (`23514`); non-admin active staff CAN SELECT thresholds, INSERT → `42501`, UPDATE/DELETE → 0 rows; admin CAN UPDATE and INSERT audit; admin UPDATE/DELETE on audit → 0 rows (immutable); non-admin CANNOT SELECT audit. Run the pgTAP suite locally.

### Stage 3 — Port, adapters, service, routes (server authoritative)

**Step 6 — failing fake-adapter + service tests.**
- `tests/unit/adapters/fake/HaccpDailyChecksRepository.goodsInThresholds.test.ts` (mirror the `.processRoomThresholds` twin): list returns seeded rows; update mutates + records an audit entry in the fake.
- `tests/unit/services/HaccpDailyChecksService.goodsIn.test.ts`: `deliveryTempStatus(temp, category, thresholds)` delegates to the domain fn (spot-check poultry 4.5 → `urgent`); missing category row → throws (fail-closed, → route 500); `validateGoodsInThreshold` rejects non-finite numbers, `amber_max < pass_max`, changing a value's null-ness (band STRUCTURE is code-locked; only numbers move — `amber == pass` is allowed and means "amber band empty"); `updateGoodsInThreshold` writes the audit trail via the port.

**Step 7 — port + adapters.**
- `lib/ports/HaccpDailyChecksRepository.ts`: add `listGoodsInThresholds(): Promise<readonly GoodsInThreshold[]>` and `updateGoodsInThreshold(input: UpdateGoodsInThresholdInput, changedBy: string): Promise<GoodsInThreshold>`; extend the `listDeliveries` result type (`DeliveryListResult` in `lib/domain/HaccpDailyCheck.ts`) with `thresholds: readonly GoodsInThreshold[]`.
- `lib/adapters/supabase/HaccpDailyChecksRepository.ts`: implement both (update = read-old → update → insert audit row, same shape as `updateProcessRoomThreshold` at ~line 569); in `listDeliveries` (~line 172) add the thresholds select `ORDER BY position` — **fatal on error** (copy the "do NOT fall back to hardcoded limits" comment stance from `listProcessRoom` ~line 463).
- `lib/adapters/fake/HaccpDailyChecksRepository.ts`: mirror. Step-6 tests green.
**🗣 In plain English:** the existing Supabase plug learns two new tricks (read the rulebook, edit-with-diary); the practice-dummy plug used by unit tests learns the same tricks so tests never need a real database.

**Step 8 — service re-point.** In `lib/services/HaccpDailyChecksService.ts`:
- DELETE the hardcoded bands inside `deliveryTempStatus` (lines 223–249); the exported service method becomes `deliveryTempStatus(temp, category, thresholds)` = `goodsInStatus(temp, resolveGoodsInThreshold(thresholds, category))`, wrapping the resolver throw in `ServiceError` (mirror `resolveProcRoomThresholds` at lines 377–392 — including the "positional fallback would false-pass a CCP" comment).
- Thread `thresholds` through `validateDelivery` / `buildDelivery` / `buildDeliveryCorrectiveActions` signatures where a status is derived (keep the W2 allergen-only CA gate byte-identical).
- Add `listGoodsInThresholds` / `validateGoodsInThreshold` / `updateGoodsInThreshold` mirroring the process-room trio (lines ~680–688).
- Grep-proof: **no band literal (5.0/8.0/3.0/4.0/-18.0/-15.0) remains in this file for delivery grading.**

**Step 9 — routes.**
- `app/api/haccp/delivery/route.ts`: GET — `listDeliveries` result now carries `thresholds`; include them in the JSON (append key; existing key order preserved per the F-19 header note). POST — before validation: `const thresholds = await dc.listGoodsInThresholds(); if (thresholds.length === 0) return 500 'Could not load thresholds'` (mirror process-room route lines 73–96); thread into `deliveryTempStatus` / `validateDelivery` / `buildDelivery`. Role gate, `?range=` parsing, key order untouched.
- NEW `app/api/haccp/admin/goods-in-thresholds/route.ts`: copy `admin/process-room-thresholds/route.ts` verbatim shape — `isAdmin` header gate + per-caller client (so DB `is_admin()` fires too), GET list-all, PATCH validate→update→audit.
- Extend `tests/integration/haccp-goods-in-thresholds.test.ts` (NEW, mirror the process-room integration test): non-admin GET/PATCH → 403; admin PATCH edits poultry amber and an audit row appears; inverted band rejected.
**🗣 In plain English:** the delivery API now fetches the rulebook fresh on every save and refuses to save if the rulebook is unreachable; a new admin-only API edits the rulebook with the diary entry written in the same breath.

### Stage 4 — Screen rebuild (Scope A) + admin UI

**Step 10 — token groundwork.**
- `app/tokens.css` `:root`: add category-chip semantic tokens per pairing-law §5.11 (brand p14): `--category-meat-fill:var(--mfs-maroon-500)` / `--category-meat-fg:#ffffff`; `--category-frozen-fill:var(--mfs-navy-700)` / `--category-frozen-fg:#ffffff`; `--category-chilled-fill:var(--mfs-sand-500)` / `--category-chilled-fg:var(--mfs-ink-900)`; `--category-poultry-fill:var(--mfs-orange-500)` / `--category-poultry-fg:var(--mfs-ink-900)`; `--category-ambient-fill:var(--mfs-red-600)` / `--category-ambient-fg:#ffffff` (red-600 not red-500 — the 500 fails white-text contrast; bold weight per §5.11).
- `tailwind.config.ts`: add a `category` colour group exposing them as utilities.
- `tests/unit/design/contrast-pairings.test.ts`: pin the novel pairs in the maths layer — at minimum `INK_900` on `SAND_500` and `WHITE` on `RED_600`/`MAROON_500`/`NAVY_700`, each ≥ its role threshold; token-mapping layer pins the new declarations.
- Screen-side mapping (a page-local constant, visual concern): lamb/beef/red_meat/offal/mince_prep → meat; frozen/frozen_beef_lamb → frozen; dairy/chilled_other → chilled; poultry → poultry; dry_goods → ambient.
**🗣 In plain English:** the rainbow of stock Tailwind chip colours becomes five brand-approved chip colours with mathematically-proven readable text, added to the design system first so any future screen reuses them.

**Step 11 — guard first (TDD for the repaint).** Add `"app/haccp/delivery/page.tsx"` to `SCREENS` in `tests/unit/lint/haccp-screens-token-pure.test.ts`. It FAILS against the current page (raw hex `#EB6619`, stock palette everywhere) — that red test is the repaint's driving test.

**Step 12 — recompose `app/haccp/delivery/page.tsx`** (composition style: `app/haccp/process-room/page.tsx` + `app/haccp/cold-storage/page.tsx`; consume ONLY via the `components/ui` barrel):
- `ScreenHeader` bold-navy real `<header>` (`surface` prop), no logo; title "Goods In", keep the CCP 1 delivery-intake subtitle sense; actions = back-to-hub, Quick ref, Handbook (HB-001) as `ghost-inverse` (guard bans `secondary`/bare `ghost` there).
- Kit `NumberPad` replaces the hand-rolled `Numpad` (lines ~280–330); full-screen temp entry keeps the live pass/amber/reject verdict tile + guidance copy, now computed via `goodsInStatus` against the FETCHED thresholds and worded via `describeGoodsInBands`.
- Kit `Modal` (sheet) for CCA popup (both tracks: conditional-accept and reject-locked disposition, read-only CA-001 protocol steps, cause-aware recurrence, shared notes), delivery detail sheet, Quick reference sheet.
- Kit `Badge`/`StatusPill`/`Banner` for temp-status badges, SOP 5B banner, flash confirmation, `ca_write_failed` warning.
- **Green/amber caging repaint:** green/amber utilities (`status-success-*`/`status-warning-*`) may remain ONLY on temperature verdict tiles + pass/warn/fail badges. Repaint to pairing law (orange-500 fill + ink-900 label for selected/primary, neutral tokens otherwise): "No — all clear" contamination button, "Same as born in"/"Same as slaughter" chips, "N logged" counter, green flash banner, green "No allergens" filled button. All "wrong" states = `--mfs-red-*` semantic family.
- Category chips → Step-10 tokens; `CATEGORIES` limit/detail strings now DERIVED from fetched thresholds via `describeGoodsInBands` (delete the hardcoded strings at lines 132–142; admin edits self-update the copy). Delete `calcStatus`'s hardcoded bands (lines 235–252) — keep only the null-temp → null pre-check around the domain call.
- **Client fail-closed:** if GET returns no/failed thresholds → error banner + temp entry disabled; never grade against a baked-in table (there is none left).
- ALL inventoried behaviour KEPT byte-equivalent in logic (spec §1 list): category-first form, category-filtered supplier chips + Other free text, meat-only BLS block (14 curated + ISO search, same-as shortcuts, live `DDMM-CC-N` preview), contamination 3-way + 4 types + notes, SALSA 14-allergen check with auto-CA on meat/poultry only, two-track CCA popup, Today/This-week/Last-week log + detail sheet, Europe/London stamping, `ca_write_failed` path.
- Labels-only rename — NO route/middleware/API path changes; i18n stays EN.
- Step-11 guard goes green; `PrintLabelStrip` / `buildDeliveryInput` / `getPrinter` blocks copied byte-identical (verify: `git diff` shows no changes inside those functions/JSX props beyond unavoidable surrounding-line moves).
**🗣 In plain English:** same screen, same buttons, same flows — rebuilt from the shared kit so it looks like the other finished screens, with every colour drawn from the brand rulebook and the temperature copy reading straight from the database.

**Step 13 — admin UI.** `app/haccp/admin/page.tsx` Thresholds tab (~line 721): add a "Goods In (CCP 1)" section below the process-room cards — fetch `/api/haccp/admin/goods-in-thresholds`, one editor row per category showing pass-max + amber-max (amber input hidden/disabled where the row has no amber band; dry_goods row shown read-only as "No temperature CCP"). Save → PATCH → existing `savedReminder` fires (reminder copy covers DOCUMENT_CONTROL §4 + retrain — extend wording to name CCP 1). **Only this new section follows the pairing law; do NOT repaint the rest of the admin screen (F-TD-42 stays open).**

### Stage 5 — Register, E2E, ship

**Step 14 — `docs/reference/haccp/DOCUMENT_CONTROL.md` §4.**
- Extend the §4 configurability paragraph (line 96): CCP-1 Goods In limits are now also app-configurable (`haccp_goods_in_thresholds`, admin-edited at `/haccp/admin` → Thresholds, immutable audit `haccp_goods_in_threshold_audit`).
- REPLACE the three wrong CCP-1 rows (lines 102–104: "fresh ≤4" and "frozen ≤-12" are wrong — 4°C is poultry's limit, -12°C is the QFF retail-cabinet exception) with rows matching the locked band table, in the CCP-3 three-band style (pass / amber-CA / reject per category).
- Add the TWO written justifications, verbatim intent: (1) red meat reject at >8°C sits 1°C above Reg 853/2004's 7°C core transport limit — retained per general UK chill-holding 8°C, decision Hakan 2026-07-02; (2) poultry 4–5°C is a documented 1°C grace band above the legal ≤4°C for probe/unloading fluctuation, amber-with-CA, decision Hakan 2026-07-02.
- §7-style retrain reminder applies.
**🗣 In plain English:** the inspector-facing register stops lying (it currently lists limits the app never enforced), states the real bands, and records why two of them deviate from the strictest legal reading.

**Step 15 — exhaustive `@critical` E2E.** Rewrite `tests/e2e/12-haccp-delivery.spec.ts` as the exhaustive Goods In tap suite (keep + extend the existing 3 pins). Port the race-proof `enterSession`-style discipline from `tests/e2e/13-haccp-cold-storage.spec.ts` wherever dirty DB state applies — deliveries accumulate per day, so every assertion keys on a unique per-run marker (supplier "Other" free-text / notes), never on counts. Required coverage:
1. Full form walk incl. the meat BLS block (curated chips, ISO search, same-as shortcuts, live batch preview).
2. Numpad verdict tiles per band — **including the NEW poultry cases: 4.5 → amber/conditional-accept, 5.5 → reject** — plus a lamb 6.0 amber and a frozen -16.0 amber.
3. CCA popup BOTH tracks (conditional accept with cause; reject with disposition locked to Reject) reaching the admin CA queue.
4. Allergen-only W2 pin preserved (zero CA rows).
5. Log Today/This-week/Last-week + detail sheet fields.
6. Admin: threshold edit (poultry amber 5.0 → 5.5) → verdict copy on the screen updates → audit row visible/queryable → **restore the value** → non-admin PATCH denied (403) and no Thresholds edit access.
7. Visual law: light theme, navy header white text, green/amber present ONLY inside verdict tiles/badges (computed-style assertions per `_theme.ts` helpers), category chips brand-coloured.
8. Print strip present on a logged delivery (tap does not need real hardware — assert the strip renders and the handler wiring is intact).

**Step 16 — full local proof + PR.** `npm run db:reset` (twice) → unit (`vitest` incl. new lint pins, migration filename convention auto-covers Step 4) → pgTAP suite → `npm run test:integration` → `npm run test:e2e:ui`. Push `feat/goods-in-ccp1-unit`, open PR (dependency-justification line: **no new packages**). PR merges only via the required `smoke` check. ANVIL then runs the full matrix + prod-build preview taps (`npm run test:e2e:preview -- <url> --unprotected`, readiness-gate on `/api/auth/team` = 200) and verifies the migration raised **no PITR gate** (additive-only). Cert: `Branch:` line bare, literal "CLEARED FOR PRODUCTION".

---

## 7 · TDD test plan (summary of test-first pairs)

| Test (written FIRST) | Drives |
|---|---|
| `tests/unit/domain/goodsIn.test.ts` | Step 3 domain module |
| `supabase/tests/019-rls-goods-in-thresholds.test.sql` | Step 4 migration RLS (written with it, run against it) |
| `tests/unit/adapters/fake/...goodsInThresholds.test.ts` + `tests/unit/services/...goodsIn.test.ts` | Steps 7–8 port/adapters/service |
| `tests/integration/haccp-goods-in-thresholds.test.ts` | Step 9 routes |
| `tests/unit/lint/haccp-screens-token-pure.test.ts` (goes RED at Step 11) | Step 12 repaint |
| `tests/unit/design/contrast-pairings.test.ts` additions | Step 10 tokens |
| `tests/e2e/12-haccp-delivery.spec.ts` rewrite | whole-unit acceptance (ANVIL) |

---

## 8 · Acceptance criteria

1. Poultry at 4.5°C → amber + CA; at 5.5°C → reject — client tile, server `temp_status`, and register all agree.
2. Zero band literals outside `lib/domain/goodsIn.ts` seeds/tests and the migration seed; client and server both import the domain module.
3. Missing/unloadable threshold row → server 500 / client disabled entry; NEVER a silent looser grade (fail-closed).
4. pgTAP proves: non-admin write to thresholds DENIED at the DB; audit rows immutable even to admins.
5. `app/haccp/delivery/page.tsx` passes the token-purity guard; green/amber appear only on verdict tiles + status badges; header says "Goods In"; route/API paths byte-identical.
6. Printer flow (`PrintLabelStrip` / `buildDeliveryInput` / `getPrinter`) and hub alarm files byte-identical in the diff.
7. DOCUMENT_CONTROL §4 corrected with both written justifications in the same PR.
8. Full ladder green: unit + pgTAP + integration + `@critical` E2E on prod-build preview; migration additive (no PITR gate); no new `package.json` entries.

---

## 9 · Hard guards (untouchable — restate for the implementer)

- `components/PrintLabelStrip`, `buildDeliveryInput`, `getPrinter` printer-port flow **byte-preserved** (ADR-0010, PRs #98–#105).
- `lib/haccp-alarm-status.ts`, `hooks/useHACCPAlarm.ts` untouched.
- Route `/haccp/delivery`, middleware, and all API paths unchanged — the rename is labels-only.
- i18n stays EN (F-UI-I18N-01 is a separate task).
- F-TD-42 admin-wide repaint NOT in scope — only the new Goods In admin section follows pairing law.
- Migration additive-only; `active`-toggle pattern explicitly banned for these fixed rows.

---

## 10 · Risk Assessment

| # | Category | Risk | Severity | Mitigation | Must-fix? |
|---|---|---|---|---|---|
| R1 | Business logic | A category key reaching the server without a seeded row (typo, legacy client) now 500s ALL logging for that delivery — fail-closed by design, but seed incompleteness would brick a lane | HIGH | Seed all 11 keys incl. legacy `red_meat`/`mince_prep`; domain test enumerates every key in `calcStatus`/`deliveryTempStatus` today and asserts a row exists in the seed fixture; E2E walks every selectable category | **YES — resolved by Steps 2/4 (in-plan)** |
| R2 | Security | Threshold write path must be denied to non-admins at BOTH route and DB; audit must be tamper-proof | HIGH | Double gate (route `isAdmin` + RLS `is_admin()` via per-caller client); pgTAP Step 5 proves denial + immutability; integration test proves 403 | **YES — resolved by Steps 5/9 (in-plan)** |
| R3 | Business logic (regression) | Rebuilding a 1714-line safety-critical screen risks dropping one of the many inventoried behaviours (W2 allergen gate, BLS batch preview, CCA recurrence…) | HIGH | Spec §1 inventory is the checklist; existing 3 E2E pins kept; Step 15 exhaustive tap suite; server logic moves untouched (only threading changes) | **YES — resolved by Steps 12/15 (in-plan)** |
| R4 | Concurrency | Two admins editing the same threshold: read-old → update → audit can record a stale "old" value (same window exists in the process-room precedent) | LOW | Accepted, mirrors precedent; audit still captures both changes in order; single-admin reality (Hakan) | No |
| R5 | Concurrency | Client grades against thresholds fetched at page-load; an admin edit between load and submit makes the tile disagree with the persisted verdict | LOW | Server re-loads thresholds at POST and is authoritative on persist (spec-mandated); discrepancy self-corrects on the logged row display | No |
| R6 | Data migration | Preview-branch resync / repeat `db:reset` failure from a non-idempotent or short-named migration | MED | 14-digit timestamp; `IF NOT EXISTS` + guarded seeds + `DROP POLICY IF EXISTS`; Step 4 runs `db:reset` twice; filename-convention test | No (covered) |
| R7 | Launch blocker (compliance) | Shipping the code without the §4 register correction leaves the inspector-facing paperwork contradicting the app | MED | Step 14 in the same PR; admin save-reminder names §4 + retrain | **YES — resolved by Step 14 (in-plan)** |
| R8 | Business/ops | Supplier-facing tightening: poultry 4–8°C deliveries that used to pass now amber/reject | MED | Accepted at Gate 1 (spec §6, Hakan walked in knowing); grace band 4–5 documented; no further mitigation needed | No |
| R9 | Numeric edge | `numeric(4,1)` DB values vs client float comparison at exact boundaries (e.g. 5.0) | LOW | Bands are ≤-inclusive on one-decimal values; domain tests pin every boundary on both sides | No |

**Headline:** no unresolved must-fix risks — R1, R2, R3, R7 are must-fix by nature and each has a dedicated, testable step inside this plan. Gate 2 is not blocked by any open risk.

**🗣 In plain English:** the scary ones — a missing rulebook row freezing a delivery lane, a non-admin editing food-safety limits, losing a hidden behaviour in the rebuild, and paperwork drifting from the app — all have a named step and a named test that proves them handled before merge.

---

## 11 · Gate-2 hexagonal answers

- **Port:** `lib/ports/HaccpDailyChecksRepository.ts` (existing) — extended with `listGoodsInThresholds` / `updateGoodsInThreshold`; no new port needed.
- **Adapters:** `lib/adapters/supabase/HaccpDailyChecksRepository.ts` (real) + `lib/adapters/fake/HaccpDailyChecksRepository.ts` (test double) — both implement the additions. Wiring untouched (`lib/wiring/haccp.ts` already composes this pair).
- **New dependencies:** **NONE.** No `package.json` change; nothing to justify or wrap.
- **Rip-out test:** **PASS** — replacing Supabase still costs one adapter file + one wiring line; the new tables are reached only through the port, the domain module is pure TS, and the UI talks only to `/api` routes → services.
- **🗣 In plain English:** we widened an existing socket instead of drilling a new hole; no new vendors walked in the door, so swapping the database later still means changing one plug.
