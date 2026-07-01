# FORGE Execution Plan — `/haccp/cold-storage` rebuild (UI Phase 1, Tier B)

**Date:** 2026-06-30
**Screen:** `app/haccp/cold-storage/page.tsx` — CCP-2 fridge/freezer temperature log
**Tier:** B (ADR-0014 Rule 2) — build straight on the kit, no Claude Design mockup; judged on the live dark preview.
**Spec source:** roadmap §9 change-log entry dated 2026-06-30 ("/haccp/cold-storage requirements AUDITED + locked") — AUTHORITATIVE. This plan builds to it; it does not re-open it.

🗣 **In plain English:** We are re-skinning the fridge/freezer temperature-check screen onto the shared component kit, fixing one real save-blocking bug, and adding a sanity limit so nobody can log an impossible temperature. The plumbing underneath (how data is saved) does not change.

---

## Visual mini-map

```
DOMAIN (core logic)
  └─ HaccpDailyChecksRepository (port) → [Supabase]  (adapter)
🗣 one plug, untouched — this job is a UI re-skin + a server validation-list fix + an entry-bound guard; no new socket
```

---

## Goal

Three locked changes, in one FORGE unit:

1. **🔴 BUG fix (server):** expand `VALID_COLD_STORAGE_CAUSES` from 6 → 8 causes so the two legitimate causes the client already offers ("Defrost cycle — scheduled temperature rise" and "High ambient room temperature") validate and SAVE end-to-end instead of being rejected with a 400.
2. **+SAFETY (client-first, optional server echo):** a −40 °C…+30 °C sanity bound on number-pad entry so a fat-finger can't log nonsense. Pass/amber/critical classification is UNCHANGED.
3. **BUILD (presentation):** re-express `page.tsx` on `components/ui/` + semantic tokens. The inline `Numpad` becomes a **new reusable kit `NumberPad`**; the inline `CCAPopup` / numpad overlay / quick-ref sheet move onto the kit **`Modal`**; all hardcoded hex/palette → semantic tokens; drop the dead `unit_type` field from the POST body + its type.

🗣 **In plain English:** (1) right now a real, valid reason for a temperature blip can't be saved — fix the server's allow-list. (2) Add guard rails to the number pad. (3) Rebuild the screen out of our standard Lego bricks instead of hand-cut ones, and delete one field the server already ignores.

---

## Domain terms (plain-English)

- **CCP-2** — Critical Control Point 2, the cold-storage temperature check. 🗣 The legally-mandated fridge/freezer temp log; getting it wrong is a food-safety failure, so behaviour must be preserved exactly.
- **Corrective action (CA)** — the cause→disposition→recurrence record captured when a reading is amber/critical. 🗣 The "what went wrong, what we did with the food, how we'll stop it recurring" form that fires on a bad reading.
- **Session (AM/PM)** — the twice-daily check, split at 14:00 London. 🗣 Morning vs afternoon round; each can be submitted once per day.
- **Port / adapter** — `HaccpDailyChecksRepository` (the socket the app owns) and its Supabase implementation. 🗣 Untouched here — we are not changing where or how data is stored.
- **Semantic token** — a purpose-named colour like `bg-action-primary` instead of `#EB6619`. 🗣 One central dial; change it once and every screen (including dark mode) repaints.
- **Tier B** — ADR-0014's "standard composition, no mockup" lane. 🗣 This screen decides nothing visually novel, so we build straight onto the kit and judge the live preview.

---

## Compliance flags

- **HACCP safety-critical screen.** Per the saved standing instruction ([[anvil-full-browser-taps]]), this earns the exhaustive @critical Playwright sweep, NOT a right-sized one. The corrective-action save path is the food-safety record — the bug fix must be proven to file correctly.
- **No PII / no auth change / no RLS change.** Role gating stays in the route headers (`['warehouse','butcher','admin']`); the page does none. No data migration.

---

## ADR conflicts

None. The work is consistent with:
- **ADR-0002 (hexagonal):** data path already clean (page → route → `HaccpDailyChecksService` → `HaccpDailyChecksRepository` port → Supabase adapter). No inner layer imports an adapter; no new vendor import.
- **ADR-0014 (tiered design):** Rule 1 (compose only from `components/ui/` + tokens) is the build target; Rule 3 (a missing pattern is added to the kit FIRST) is why `NumberPad` becomes a kit component rather than staying inline.

🗣 **In plain English:** nothing here fights a past architectural decision — it actively satisfies two of them.

---

## Files to change (exact)

### Server (Change 1, optional part of Change 2)
- `lib/services/HaccpDailyChecksService.ts`
  - `VALID_COLD_STORAGE_CAUSES` (:112–119) — expand 6 → 8.
  - *(optional, Change 2 server echo)* `validateColdStorage` (:1036–1075) — add a defensive bound check on each reading's `temperature_c`.

### Domain (Change 2 shared constant + Change 3 dead-field drop)
- `lib/domain/HaccpDailyCheck.ts`
  - `ColdStorageReadingInput` (:176–181) — REMOVE the `unit_type` field (dead; server re-derives from DB via `unitById.get(r.unit_id)`).
- **NEW** `lib/domain/coldStorage.ts` — single source of truth for the bound constants (and, if Gate-2 picks Option A below, the cause list). Pure TS, no imports.
  - `export const COLD_STORAGE_MIN_TEMP_C = -40`
  - `export const COLD_STORAGE_MAX_TEMP_C = 30`
  - `export function isColdStorageTempInRange(temp: number): boolean` — `Number.isFinite(temp) && temp >= MIN && temp <= MAX` (inclusive).
- `lib/domain/index.ts` — re-export the new module's symbols through the barrel.

### Kit (Change 3 — new reusable component)
- **NEW** `components/ui/NumberPad.tsx` — reusable numeric entry pad (see "NumberPad contract" below).
- `components/ui/index.ts` — export `NumberPad` + `NumberPadProps` from the barrel.

### Presentation (Change 3 — the rebuild)
- `app/haccp/cold-storage/page.tsx` — full rebuild onto the kit (details in Steps 6–11). Remove `unit_type` from the POST body (`:469`). May be split into co-located `_components/` if it stays clearer (allowed; not required).

🗣 **In plain English:** one server file (the bug + optional echo), two small domain files (a dead field removed, a tiny new rules file), one new Lego brick, and the screen itself.

---

## Numbered steps (executable)

### Step 1 — Bug fix: expand the server cause allow-list
In `lib/services/HaccpDailyChecksService.ts`, `VALID_COLD_STORAGE_CAUSES` (:112–119), add the two strings **verbatim, byte-for-byte** matching the client `CAUSE_OPTIONS` (`page.tsx:156–165`):
- `"Defrost cycle — scheduled temperature rise"` (note the em-dash `—`, U+2014, not a hyphen)
- `"High ambient room temperature"`

**Downstream verification — already confirmed clean, do NOT change these (but cover with tests):**
- Server `DISPOSITION_MAP` (:73–79) is keyed by *disposition label*, not cause → both new causes produce dispositions already in the map. No change.
- Server `deriveColdStorageAction` (:290–305) and `buildColdStorageCorrectiveActions` (:1101–1138) special-case only `"Equipment failure"`; both new causes fall through to the freezer/chiller amber/critical protocol branch → valid `action_taken` text is produced and the CA row files correctly. No change.
- Client `RECURRENCE_BY_CAUSE` (:167–176) already has entries for both new causes. No change.
- Client `getDispositionDefault`/`getDispositionOptions` (:223–232) special-case only `"Equipment failure"`; both new causes route through the generic worst-status branch → valid options. No change.

🗣 **In plain English:** the only thing blocking those two reasons was the server's bouncer list. Every downstream step already knows how to handle them — I traced each one. So this is a two-line allow-list fix, pinned by a test that proves the whole save path works.

> **Gate-2 decision (cause-list de-drift):** the cause list is duplicated (client `CAUSE_OPTIONS` + server `VALID_COLD_STORAGE_CAUSES`) — that duplication IS the root cause of this bug.
> - **Option A (recommended, "change once"):** define `export const COLD_STORAGE_CAUSES` once in `lib/domain/coldStorage.ts`; the page imports it for `CAUSE_OPTIONS`, the service derives `VALID_COLD_STORAGE_CAUSES = new Set(COLD_STORAGE_CAUSES)`. Future drift is impossible. Slightly larger diff.
> - **Option B (minimal):** just add the two strings to the server set, and add a unit **parity test** asserting the client list and server set are identical. Smaller diff; the parity test is the guard.
> Either way a parity test ships. Recommend **A** (aligns with Hakan's "change once" principle); fall back to **B** if the conductor wants the smallest diff.

### Step 2 — Entry-bound constants + pure check (domain)
Create `lib/domain/coldStorage.ts` with `COLD_STORAGE_MIN_TEMP_C = -40`, `COLD_STORAGE_MAX_TEMP_C = 30`, and `isColdStorageTempInRange(temp)` (inclusive, finite-guarded). Re-export via `lib/domain/index.ts`.

🗣 **In plain English:** put the −40/+30 limit in one tiny pure file both the screen and the server can read — so the guard rail can't say one thing on the screen and another on the server.

### Step 3 — Bound enforcement at the pad (client)
The cold-storage page passes `min={COLD_STORAGE_MIN_TEMP_C}` / `max={COLD_STORAGE_MAX_TEMP_C}` to `NumberPad`. The pad disables **Confirm** (and shows an inline token-styled hint, e.g. "Enter a value between −40 °C and +30 °C") when the current value parses outside the inclusive range or is non-finite. The classification thresholds (`getTempStatus`) are untouched — a +12 °C chiller deviation is in-range and still allowed; only impossible values (e.g. 300, −99) are blocked.

🗣 **In plain English:** the Confirm button greys out only for genuinely impossible numbers, never for a real-but-bad reading that needs a corrective action.

### Step 4 — Optional defensive server echo (Change 2, note-only)
In `validateColdStorage`, after the unit-known loop (:1053–1058) and BEFORE the deviation/CA block, add: for each reading, if `!isColdStorageTempInRange(r.temperature_c)` → `reject(400, "Temperature out of range")`. This is cheap, consistent with the client, and uses the SAME pure helper.
- **Precedence note:** insert it AFTER the existing missing-fields (400), today (400), and unit-known (400) checks so their ordering is preserved; it sits before the CA-payload checks.
- **Recommendation:** INCLUDE it (defence in depth + shared helper = no drift). It is unit-testable in isolation. If the conductor wants client-only, drop this step — the plan stands.

🗣 **In plain English:** add the same guard rail on the server too, reusing the exact same rule file, so a crafted request can't sneak a nonsense value past the screen. Cheap and consistent — recommended.

### Step 5 — Drop the dead `unit_type` field
- `lib/domain/HaccpDailyCheck.ts`: remove `readonly unit_type: string;` from `ColdStorageReadingInput` (:180).
- `app/haccp/cold-storage/page.tsx`: in `doSubmit` (:466–470) stop sending `unit_type` in each reading object.
- Verified safe: the only server read of `unit_type` is `worstUnit?.unit_type` (:1121), which comes from the DB-derived `units`, NOT from the input reading. No other consumer.

🗣 **In plain English:** the client posts a field the server throws away and re-looks-up from the database — delete it from both the type and the request.

### Step 6 — NumberPad kit component (Change 3, new brick)
Create `components/ui/NumberPad.tsx` (see contract below) and export it from the barrel. It is the keypad BODY only (display + grid + Confirm) — NOT an overlay. Semantic tokens only (it must pass `semantic-tokens-only`). Its render root is a `<div>`, not an `<svg>` (it must pass `reusable-visual-in-kit`).

### Step 7 — Wrap NumberPad in kit Modal (replace `fixed inset-0`)
In the page, render `<Modal variant="sheet" open={!!numpadUnit} onOpenChange={…} title={unit.name}>` containing `<NumberPad …/>`. Delete the hand-rolled `fixed inset-0 bg-white z-50` overlay (`page.tsx:94`). Modal provides scrim, focus-trap, ESC, scroll-lock, close.

### Step 8 — CCAPopup onto kit Modal
Keep the corrective-action form as a screen-specific component (it is HACCP-domain, NOT reusable → stays in the page / `_components/`, NOT in `components/ui/`). Replace its `fixed inset-0 bg-black/75` overlay (`:267`) with `<Modal variant="sheet" title="Corrective Action Required">`. Re-express the cause grid, disposition row, recurrence list and notes using kit primitives where they fit:
- Disposition (small single-select set) → `SegmentedControl` or kit `Button` toggles.
- Cause (8-option grid) + recurrence (vertical list) → kit `Button` (variant `primary` when selected, `secondary`/`ghost` otherwise) or `Radio`. Implementer picks the closest kit fit; the invariant is **no hand-rolled primitives + semantic tokens only** (no `#EB6619`, no `bg-orange-500`, no `bg-amber-50`).
- Notes → kit `Textarea`. Protocol steps block → token-styled `Card`/`div` (semantic tokens).
- Submit → kit `Button variant="danger"`, disabled until `cause && disposition && recurrence` (preserve `canSubmit`).

🗣 **In plain English:** the corrective-action form keeps its exact behaviour and stays specific to HACCP, but every coloured chip and the dark backdrop now come from standard kit pieces and the central colour dial.

### Step 9 — Quick-ref sheet onto kit Modal
Replace the `fixed inset-0 bg-black/50` quick-ref (`:667`) with `<Modal variant="sheet" title="CCP 2 — Quick Reference">`; restyle the chiller/freezer threshold rows with semantic tokens (drop `#EB6619`, `bg-green-600`, `bg-red-600`).

### Step 10 — Header, selectors, list, states → kit + tokens
- Header bar (`:515`, `bg-[#1E293B]`) → token surface (e.g. `bg-surface-…`); Back → kit `IconButton`; Quick ref + Handbook → kit `Button` (ghost/secondary) with leading icons. (Dark theme is inherited from `app/haccp/layout.tsx` `data-theme="dark"` + `ThemeLock` — do NOT re-add `data-theme`.)
- AM/PM session toggle (`:538–553`, with the done-check ✓) → kit `SegmentedControl` (the ✓ goes in the option `label` ReactNode). Preserve the "default to first un-submitted session" logic and `currentSession()` 14:00 split EXACTLY.
- Date input (`:554`) → keep native `<input type="date">` (no kit DatePicker exists) but restyle with semantic tokens; keep `max={todayISO()}`.
- Unit rows (`:567–611`) → kit `Card` (tappable) + `StatusPill`/`Badge` for pass/amber/critical; preserve the target/max line and "Already recorded" hint. Status colours via the `status-*` token family (success/warning/error), NOT `bg-green-50`/`bg-amber-50`/`bg-red-50`.
- Loading → kit `Spinner`; error (`submitError`) → kit `Banner` (danger); the read-only "already submitted" panel (`:616–625`) → kit `Banner`/`Card` (success); comments → kit `Textarea`; submit → kit `Button`.
- Success full-screen (`:499–509`) → token surfaces + kit `Spinner`/icon; keep the 2-second `setTimeout` redirect to `/haccp`.

### Step 11 — Token sweep (zero hardcoded colour)
Remove every hardcoded colour the audit flagged: ~15× `#EB6619`, `STATUS_BG` green/amber/red Tailwind maps, `bg-[#1E293B]`, `bg-black/75`, `bg-black/50`, numpad `bg-slate-800`/`active:bg-orange-500`/`text-white`, `text-orange-400`, `bg-green-100`, etc. Every colour resolves through a semantic token so dark mode (inherited) renders correctly. i18n stays **hardcoded EN** — do NOT wire `t()` (→ tracked under BACKLOG F-UI-I18N-01).

🗣 **In plain English:** hunt down every literal colour and route it through the central dial, or the dark theme this screen now lives under will render with white boxes.

---

## NumberPad contract (the new kit brick)

**New vs extend `PinKeypad` — RECOMMENDATION: build a NEW `NumberPad`.** They are genuinely different components; extending PinKeypad would bolt conditionals onto an unrelated shape and make both shallow:

| | `PinKeypad` (existing) | `NumberPad` (new) |
|---|---|---|
| Value display | masked dots, fixed length | live numeric value + unit suffix (e.g. `°C`) |
| Length | fixed (`pinLength`) | variable, free entry |
| Decimal / negative | none | optional `.` (chillers) OR `−` (freezers) |
| Submit | auto-submit on final digit | explicit **Confirm** button |
| Bounds | n/a | optional inclusive `min`/`max` gating Confirm |

🗣 **In plain English:** the PIN pad hides what you type and fires the moment it's full; the temperature pad shows the number, allows decimals/negatives, and waits for a deliberate Confirm. Forcing one component to do both makes both worse — a new brick is correct (and ADR-0014 Rule 3 says add it to the kit).

**Proposed props (semantic intent only — Decision #17; numeric bounds are DATA, not style):**
```
value: string
onChange: (next: string) => void
onConfirm: () => void
allowDecimal?: boolean      // chillers
allowNegative?: boolean     // freezers
min?: number; max?: number  // inclusive bound → gates Confirm
suffix?: string             // e.g. "°C"
title?: ReactNode; subtitle?: ReactNode
tone?: 'neutral' | 'success' | 'warning' | 'danger'  // big-value tint, mirrors StatusTile's semantic `state`
hint?: ReactNode            // e.g. corrective-action preview / out-of-range message
confirmLabel?: ReactNode
labels?: { … }              // a11y aria-labels, EN defaults (mirror PinKeypad pattern)
```
- The page keeps owning HACCP logic: it computes status via `getTempStatus`, maps it to `tone`, and passes `allowNegative={unit.unit_type === 'freezer'}` / `allowDecimal={unit.unit_type === 'chiller'}`. The pad stays generic.
- Pure, unit-testable key-press reducer (mirror the current `press()` logic: backspace, single decimal, sign toggle, leading-zero replace) — extract it so it can be unit-tested without rendering.
- Render root `<div>`; semantic tokens only.

🗣 **In plain English:** the pad knows how to enter a number; the screen still owns "is this fridge a freezer" and "is this reading bad" — passed in as plain props, so the pad is reusable by any future numeric screen.

---

## TDD test plan (write tests first / alongside)

1. **Cause validation (bug fix) — unit, service.**
   - `validateColdStorage` with a deviation citing `"Defrost cycle — scheduled temperature rise"` + a valid disposition + recurrence → **`{ ok: true }`** (currently fails 400 — RED before fix).
   - Same for `"High ambient room temperature"`.
   - Junk cause (`"banana"`) → still `reject(400, "Invalid cause: …")` (regression guard).
   - `buildColdStorageCorrectiveActions` with each new cause → emits a CA row with non-empty `action_taken` and a mapped `product_disposition` (proves the FULL file path, not just the gate).
2. **Cause parity — unit.** Client cause list ≡ server cause set (Option A makes this structural; Option B makes it an explicit assertion). The single guard that stops this bug recurring.
3. **Entry bound — unit, pure.** `isColdStorageTempInRange`: `-40`→true, `30`→true, `-40.1`→false, `30.1`→false, `NaN`/`Infinity`→false, `12`→true (deviation still allowed).
4. **Temp classification parity — unit.** `getTempStatus` (client) and `coldStorageTempStatus` (server) agree at the boundaries (≤target=pass, ≤max=amber, >max=critical) for a chiller and a freezer fixture. Pins "behaviour preserved".
5. **NumberPad — unit, component.** The key-press reducer: decimal once, sign toggle, backspace, leading-zero. Confirm disabled when value is out of `[min,max]` or non-finite; enabled for an in-range value. (No jsdom React-render needed for the reducer; the disabled-state check can be a pure predicate test — see the F-26 client-reactive-seam note: prove interactive re-render via the browser tap, not a bought React-test stack.)
6. **Lint guards — unit.** `NumberPad.tsx` passes `semantic-tokens-only` (no hex/stock-palette/brand-primitive) and `reusable-visual-in-kit` (root is `<div>`, and it now lives in the kit so the page no longer hand-rolls it).
7. **Exhaustive @critical Playwright E2E (HACCP safety-critical — full sweep, NOT right-sized):**
   - AM submit happy path (all units pass) → success → redirect.
   - A deviation → corrective-action citing **"Defrost cycle — scheduled temperature rise"** that now **SAVES** (the bug-fix regression pin — this is the headline proof).
   - Once-per-session: re-submit same session → server 23505 → **409** block + client read-only state.
   - Today-only: a non-today date submit → **400** rejection (both client guard + server).
   - Out-of-range entry: Confirm blocked at +300 / −99; allowed at a valid deviation.
   - **Dark-mode render:** screen renders correctly under the inherited `data-theme="dark"` (no white boxes), Modals included.
8. **No migration / no RLS / no pgTAP / no PITR** — confirmed: no schema, no policy, no service-role change. State this explicitly in the ANVIL cert.

🗣 **In plain English:** the test that matters most replays the exact bug — a "Defrost cycle" blip that used to fail to save now saves — and we drive the real screen in a browser for every safety path because this is HACCP.

---

## Acceptance criteria

- [ ] A deviation citing either new cause validates AND files a correct corrective-action row end-to-end (test 1 + the E2E save).
- [ ] Junk causes still rejected (no allow-list loosening beyond the two strings).
- [ ] Confirm is blocked outside −40…+30 °C inclusive; in-range deviations still allowed; classification unchanged.
- [ ] `NumberPad` exists in `components/ui/`, is exported from the barrel, passes `semantic-tokens-only` + `reusable-visual-in-kit`.
- [ ] All overlays (numpad, CCA, quick-ref) use kit `Modal`; zero hand-rolled `fixed inset-0`.
- [ ] Zero hardcoded hex / stock-palette colour in the screen; dark mode renders correctly.
- [ ] `unit_type` removed from `ColdStorageReadingInput` and the POST body; server still derives unit type from DB.
- [ ] Every PRESERVE item (AM/PM default, per-unit entry incl. freezer `−`/chiller `.`, classification, CA flow, once-per-session 409, today-only, pre-fill, loading/empty/error/submitted, success+redirect, role gating, Back/Quick-ref/Handbook) behaves identically.
- [ ] i18n stays hardcoded EN; no `t()` wired.
- [ ] tsc + next lint clean; unit + @critical green; no migration/RLS/PITR.

---

## Risk Assessment

> **Headline: NO must-fix Gate-2 blockers.** The highest-attention item (the bug-fix filing end-to-end) is resolved in-plan: I traced every downstream map and they already handle the two new causes; a unit test + the E2E "Defrost cycle saves" path pin it.

### Concurrency / race conditions
- **No new risk.** Single-submit flow; the once-per-session double-submit race is already guarded by the DB unique constraint (23505 → `ConflictError` → 409). The rebuild must not drop the client `sessionAlreadyDone` read-only gate. **Severity: low. Mitigation:** E2E 409 test. **Must-fix: no.**

### Security
- **No new surface.** React auto-escapes; no `dangerouslySetInnerHTML` here (unlike the label HTML path). Notes remain free-text stored via the existing port. The optional server bound check (Step 4) is a *hardening*, not a regression. **Severity: low. Must-fix: no.**

### Data migration
- **None.** No schema/column/RLS/policy/PITR change. Dropping `unit_type` is a request-shape change only (the column is DB-derived, never written from the input). **Severity: none. Must-fix: no.**

### Business-logic flaws
- **Bug-fix completeness (headline).** If the cause set were expanded but a downstream map silently lacked the cause, a CA could file with empty/wrong protocol text — a food-safety record defect. **Mitigation:** verified `DISPOSITION_MAP`, `deriveColdStorageAction`, `buildColdStorageCorrectiveActions`, `RECURRENCE_BY_CAUSE`, `getDisposition*` all special-case only `"Equipment failure"` → both new causes route through valid generic branches; pinned by test 1 (build emits non-empty action + mapped disposition) and the E2E save. **Severity: medium, mitigated. Must-fix: no (resolved in-plan).**
- **Classification / negate-key parity.** A rebuild could change pass/amber/critical feedback or the freezer-`−`/chiller-`.` key behaviour. **Mitigation:** preserve `getTempStatus` verbatim; parity test (4) + NumberPad reducer test (5) + E2E. **Severity: medium. Must-fix: no.**
- **Cause-list re-drift.** The duplication that caused this bug persists if only the set is patched. **Mitigation:** Option A (shared constant) or Option B (parity test) — both ship a guard. **Severity: medium (recurrence prevention). Must-fix: no.**
- **Bound over-blocking.** An inclusive bound wrong by a sign/edge could block a legitimate reading. **Mitigation:** inclusive, finite-guarded; explicit boundary tests incl. an in-range deviation. **Severity: low. Must-fix: no.**

### Launch blockers
- **Dark-mode regression** — this screen now lives under `data-theme="dark"`; any surviving hardcoded light background (`bg-white`, `bg-slate-100`) renders a white box. **Mitigation:** semantic-tokens-only sweep (Step 11) + dark-render E2E + live preview judgement. **Severity: medium. Must-fix: no (caught by the token sweep + visual gate).**
- **Modal height on kiosk** — full-screen pad inside a `max-h-[85vh]` sheet must keep the keypad + Confirm reachable. **Mitigation:** verify on the live preview; sheet body scrolls. **Severity: low. Must-fix: no.**

**Out-of-scope / backlog noted (not fixed here):** duplicate hardcoded AM/PM 14:00 cutoff in `HaccpReportingService.ts` (`:136-137` vs `:1241-1242`) — candidate backlog, untouched.

---

## Hexagonal verdict (for Gate 2)

- **Port used:** `HaccpDailyChecksRepository` (existing) — **unchanged**. No new port, no port added.
- **Adapter:** `lib/adapters/supabase/HaccpDailyChecksRepository.ts` — **unchanged**.
- **New dependencies:** **none.** `NumberPad` uses React only; `Modal` already depends on `radix-ui` (pre-existing). No `package.json` entry added, so no justification needed.
- **Rip-out test:** **PASS** — no seam is created or touched. This is a UI re-skin + a server validation-list fix + an entry-bound guard; swapping Supabase would still be one adapter + one wiring line, exactly as today.
- **Brand/kit assets:** the one new reusable visual primitive (`NumberPad`) is DEFINED in `components/ui/` and consumed via the barrel → satisfies `reusable-visual-in-kit`; it uses semantic tokens only → satisfies `semantic-tokens-only`. No brand asset (logo/icon) added or moved.

🗣 **In plain English:** no new sockets, no new vendors, nothing that changes how a vendor would be swapped — the architecture verdict is a clean PASS. The only new shared brick is a standard one, parked in the shared kit where the guards expect it.
