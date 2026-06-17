# F-PROD-02 — KDS line-done undo with confirmation

- **Date:** 2026-06-17
- **Unit:** F-PROD-02 (carved from BACKLOG, see `docs/plans/BACKLOG.md` §F-PROD-02 line 379)
- **Author:** forge-planner (FORGE Phase 2 — Order)
- **Status:** PLAN — awaiting Gate 2

🗣 In plain English: this is the build sheet for letting a kitchen operator un-tick a line they ticked by mistake. A second tap on a green (done) line pops a confirmation; confirm reverts it to pending. If that line was the one that auto-finished the whole order, undoing it re-opens the order too.

---

## Mini-map — the slice this touches

```
DOMAIN (Orders core)
  ├─ OrdersRepository (port)  → [Supabase] (adapter) + [Fake] (adapter)
  │     new method: markLineUndone (mirrors markLineDone)
  ├─ UsersRepository  (port)  → [Supabase]/[Fake]  (identity guard, reused)
  └─ flow: app/kds → /api/kds/lines/[id]/undo → kdsLineUndone usecase
                    → OrdersService.undoLineDone → markLineUndone
🗣 one new socket method on a socket that already exists — swap the DB = still one adapter folder + one wiring line
```

---

## 1. Goal

Add an **undo** to the KDS line-done flow. Today a second tap on an already-done line is a silent idempotent no-op (`markLineDone` returns `alreadyDone:true`). F-PROD-02 turns that second tap into a deliberate, confirmed revert:

- Second tap on a done line → confirmation modal.
- **Confirm** → line reverts to pending (`done_at`/`done_by` cleared).
- **Cancel** → nothing changes.
- If the line's parent order is `completed` (this line was the last one, auto-completing the order), the undo **cascades**: order reverts `completed → printed`, `completed_at` cleared, in the same write.
- Exactly **one** audit event per undo (`line_undone`), NULL user (KDS runs service-role).

🗣 In plain English: undo is a real, guarded action — not a hidden side effect. The tricky part is the cascade: re-opening a finished order, which the database actively forbids today, so the undo path has to be the one place allowed to do it.

---

## 2. Domain terms (plain-English bridge)

- **Port** (`lib/ports/OrdersRepository.ts`) — the socket the Orders core defines; vendors must fit it. 🗣 The "what the app needs from a database" contract; today it has 8 methods, we add a 9th.
- **Adapter** (`lib/adapters/supabase/OrdersRepository.ts`, `lib/adapters/fake/OrdersRepository.ts`) — the concrete plugs. 🗣 Supabase is the real plug; Fake is the test plug. Both must learn the new method.
- **Use-case** (`lib/usecases/kdsLineUndone.ts`, new) — one business action composing the identity check + the orders engine. 🗣 The "an operator taps undo" script.
- **Service** (`lib/services/OrdersService.ts`) — orchestration. 🗣 The shop-floor manager that calls the right repository methods in the right order.
- **Wiring** (`lib/wiring/orders.ts`) — the one file that bolts adapters to factories. 🗣 The fuse box; swapping the DB edits only here.
- **`order_audit_action`** — a Postgres ENUM type, the `action` column of `order_audit_log`. 🗣 A fixed dropdown of allowed event names in the DB; `line_undone` is not in it yet, so we must add it.
- **TOCTOU guard** — "time-of-check to time-of-use"; guarding the write on the row still being in the expected state. 🗣 We re-check "is this line actually still done?" inside the UPDATE itself so two simultaneous taps can't both win.
- **`completed_at` / `done_at`** — timestamps on `orders` / `order_lines`. 🗣 The "finished at" stamps; undo wipes them.

---

## 3. Compliance / security flags

- **NULL-user audit (accepted gap).** Per the locked spec, the `line_undone` event records `user_id = NULL`, identical to every current KDS action (service-role, no per-request DB identity). Real attribution is **deferred to BACKLOG F-RLS-04a-kds** (`docs/plans/BACKLOG.md` §F-RLS-04a-kds line 357). **Do NOT solve attribution here.** This is a known, logged gap — see §11 Risk-S1.
  🗣 The audit row will say "a line was undone" but not "by whom", exactly like "a line was marked done" says today. Fixing the "by whom" is a separate, already-scheduled job. Calling it out so Gate 2 sees it is a conscious choice, not an oversight.
- **No new PII, no new auth surface.** The undo route stays public (KDS kiosk model, `/api/kds` under `PUBLIC_PATHS`), identity-checked through the Users port exactly like line-done.

---

## 4. ADR conflicts

**None.** The design mirrors the existing line-done vertical slice and obeys ADR-0002 (`docs/adr/0002-hexagonal-shape-and-naming.md`):

- New behaviour enters via a **port method** the app owns (depth rule, ADR-0002 line 25 — `markLineUndone` hides a multi-step guarded transaction, not a 1:1 vendor call).
- Vendor SDK stays inside `lib/adapters/supabase/` (ADR-0002 line 21).
- Route reaches the DB only via the use-case singleton from `lib/wiring/orders.ts` (ADR-0002 amendment line 41 — composition root).
- Vendor types never cross the boundary (ADR-0002 line 27).

🗣 In plain English: this follows the exact same shape as the feature it extends. No rule is bent, so there is nothing for the architecture decision log to fight about.

---

## 5. Key technical findings (read before building)

These four facts drove the design. An implementer who misses them will ship a bug.

### 5.1 The DB CHECK constraint forbids a naive revert
`supabase/migrations/20260530000000_order_pipeline_schema.sql:92-95` puts a CHECK on `orders`:
```
(state='placed'    AND printed_at IS NULL     AND completed_at IS NULL) OR
(state='printed'   AND printed_at IS NOT NULL AND completed_at IS NULL) OR
(state='completed' AND printed_at IS NOT NULL AND completed_at IS NOT NULL)
```
**Consequence:** reverting `completed → printed` MUST clear `completed_at` in the **same UPDATE statement**. Setting `state='printed'` while leaving `completed_at` non-NULL violates the CHECK (23514) and the write fails.
🗣 The database has a rule: "printed orders have no finished-stamp." So re-opening an order means flipping the state and wiping the finished-stamp together, in one breath — not two steps.

### 5.2 The line audit trigger already fires on the undo UPDATE
`order_lines_audit_trigger()` (`...20260530000000...sql:248-261`): on any `order_lines` UPDATE it inserts an audit row. The `line_done` branch only fires when `OLD.done_at IS NULL AND NEW.done_at IS NOT NULL`. **An undo is the reverse** (`OLD.done_at IS NOT NULL AND NEW.done_at IS NULL`) → it currently falls into the `ELSE` branch and logs **`line_edited`**, which is wrong and would also make the KDS card flash orange (`line_edited` is a flash action).
**Decision (see §7):** extend the trigger so the reverse transition logs **`line_undone`** instead of `line_edited`. This keeps audit-write at the DB-trigger layer (consistent with every other order event) and means the adapter does NOT manually insert an audit row.
🗣 The database already auto-writes a diary entry every time a line changes. Right now it would mislabel an undo as an "edit" (and wrongly flash the card). We teach the diary to recognise an undo and label it correctly — one event, correct name, no false flash.

### 5.3 `markLineDone`'s parent-state guard is the thing we must invert
`markLineDone` throws `ConflictError` if the parent is `placed` or `completed` (port lines 360-366; adapter lines 790-795). The undo's allowed states are the **mirror**: `printed` (plain undo) and `completed` (cascade undo). `placed` is impossible (a line can't be done on an unprinted order) but if encountered must be treated as "line not done" → idempotent no-op or NotFound per the line state, NOT a cascade.
🗣 Marking done is blocked on a finished order. Undo is the opposite: it's *allowed* on a finished order (that's the whole point) and on an open printed order, and meaningless on an un-printed one.

### 5.4 The UI already has everything it needs to choose the modal copy
`app/kds/page.tsx` renders `order.state` (line 78, `KdsOrder.state`) and per-line `done_at` (line 59) client-side from the poll payload. So the board **already knows**, before any tap, whether a line is done and whether its parent order is `completed`. The reopen-warning modal copy is a pure client-side decision: `line.done_at !== null && order.state === 'completed'` → warn "This will reopen the completed order". No extra fetch, no new API field.
**Caveat:** completed cards currently *fade out* after `COMPLETED_FADE_MS` (`lib/orders/kdsLogic.ts:88-93`) and their lines are rendered `disabled` (`app/kds/page.tsx:557`, `disabled={isDone || isCompleted}`). The undo feature must make done lines tappable again (see §8) for the window the card is still visible.
🗣 The screen already shows enough to know "this tap will reopen a finished order" — no new server call needed. But today finished cards grey out their lines and start disappearing; we have to re-enable tapping on them while they're still on screen.

---

## 6. Port design — the central decision

### 6.1 Decision: ONE new method `markLineUndone` (fold the order-revert in), NOT a separate `markOrderReopened`

The line-done slice split `markLineDone` + `markOrderCompleted` into two methods because **two distinct actors/moments** drive them: a butcher taps one line (per-line), and *separately* the system may complete the order (per-order), with a race-swallow in between. The split let the use-case compose them and swallow the benign completion race.

The undo is **not** symmetric to that. The cascade revert is **atomic and unconditional**: if the line being undone belongs to a `completed` order, the order MUST revert in the **same** transaction (the CHECK constraint in §5.1 forbids an intermediate state, and a half-done undo — line pending but order still `completed` — is a corrupt state no reader should ever see). There is no benign race to swallow and no second actor. Splitting into `markLineUndone` + `revertOrderToPrinted` would (a) expose an illegal intermediate state between the two calls, (b) force the use-case to know the cascade rule, and (c) fail the depth rule (ADR-0002 line 25) by making the caller re-assemble what the port should hide.

**Therefore: one deep method, `markLineUndone(lineId, when)`, that internally branches on parent state and does the cascade atomically.** This is APOSD "design it twice" (alternative (B) = split) rejected for the reasons above; it is the mirror of `markLineDone`'s own design-it-twice note (port lines 349-358) but lands on the *opposite* fold because the undo's two effects are genuinely one atomic operation, where mark-done's two effects were genuinely separable.

🗣 In plain English: marking-done is two jobs (tick a line; maybe finish the order) that can be done one after another — so they're two methods. Undo is one job that sometimes has a tail (un-tick a line and, if needed, re-open the order) that the database insists happen together — so it's one method. Splitting it would let the system be briefly in a state the database itself calls illegal.

### 6.2 The signature (mirroring `markLineDone`'s documented style)

Add to `lib/ports/OrdersRepository.ts`, immediately after `markOrderCompleted` (≈ line 426), with full JSDoc in the house style:

```ts
markLineUndone(
  lineId: string,
  when: Date,
): Promise<{
  readonly alreadyPending: boolean;   // line was already not-done → no-op
  readonly orderId: string;
  readonly orderReopened: boolean;    // true iff a completed order was reverted to printed
}>;
```

JSDoc must document, in the existing style:
- **What it hides:** the parent-state read; the cascade UPDATE (line `done_at`/`done_by` → NULL AND, if parent `completed`, order `state→printed` + `completed_at→NULL`) done atomically; the TOCTOU guard `.is('done_at', null)`-inverse (`.not('done_at','is',null)`) on the line and `.eq('state','completed')` on the order revert.
- **Idempotency contract:** if the line is already pending (`done_at IS NULL`), return `{ alreadyPending: true, orderId, orderReopened: false }` WITHOUT writing — mirrors `markLineDone`'s `alreadyDone` no-op so a double-confirm / retry is not an error.
- **Parent-state handling:** `printed` → plain line revert; `completed` → cascade revert (this is the deliberate exception to the markLineDone/markOrderCompleted `completed`-guard, called out in the spec); `placed` → cannot occur (a done line cannot exist on a placed order) but treated as `alreadyPending` no-op for safety, never a cascade.
- **Error contract:** `NotFoundError` if `lineId` does not exist; `ServiceError` on DB failure. Does NOT throw `ConflictError` for the `completed` parent (that is the allowed cascade path); no `ForbiddenError`/role logic (route/usecase concern).
- **No `undoneBy` parameter.** Audit attribution is NULL-user (KDS service-role) and the audit row is written by the DB trigger, not the adapter — so the port takes no actor id. (Symmetric to `markLineDone` taking `doneBy` only because it writes `done_by` to the column; the undo CLEARS `done_by`, so there is no id to record. Document this explicitly so a reviewer doesn't read the asymmetry as a mistake.)

🗣 In plain English: the method returns three facts — "was it already undone-already?", "which order?", and "did this also re-open the order?" — which is exactly what the screen needs to show the right result. It takes no "who" because undo erases the "who", and the diary entry is written automatically by the database.

### 6.3 OrdersService method: `undoLineDone`

Add to `lib/services/OrdersService.ts` (interface + factory), mirroring `completeLineDone` (lines 327-388, 499-531) but **thinner** — there is no second port call to compose and no race to swallow, because the cascade is atomic inside the port. It is essentially a typed pass-through that renames the port's `alreadyPending`/`orderReopened` into the service's outward shape:

```ts
undoLineDone(
  lineId: string,
  when: Date,
): Promise<{
  readonly alreadyPending: boolean;
  readonly orderId: string;
  readonly orderReopened: boolean;
}>;
```
Throws: `NotFoundError | ServiceError` (propagated from port). Document that — unlike `completeLineDone` — it swallows nothing, because the port's cascade is atomic.
🗣 The service barely does anything here: it forwards the call and relays the answer. All the cleverness lives one layer down in the port, which is correct.

### 6.4 Use-case: `lib/usecases/kdsLineUndone.ts` (new)

Exact mirror of `lib/usecases/kdsLineDone.ts` — same `KDS_ALLOWED_ROLES = ['butcher','warehouse']`, same per-tap identity guard (unknown → NotFoundError/404, inactive → ForbiddenError/403, wrong role → ForbiddenError/403), then call `ordersService.undoLineDone(lineId, when)`.

```ts
export interface KdsLineUndoneUsecase {
  undoKdsLineDone(
    lineId: string,
    butcherId: string,
    when: Date,
  ): Promise<{ alreadyPending: boolean; orderId: string; orderReopened: boolean }>;
}
export interface KdsLineUndoneUsecaseDeps {
  readonly ordersService: OrdersService;
  readonly users: UsersRepository;
}
export function createKdsLineUndoneUsecase(deps: KdsLineUndoneUsecaseDeps): KdsLineUndoneUsecase;
```
🗣 The undo door has the same bouncer as the done door: it checks the operator is a known, active butcher/warehouse person before letting the action through. Same allow-list, same error codes.

---

## 7. Migration

### 7.1 A migration IS needed — the enum, and the trigger

`order_audit_action` is a **Postgres ENUM** (`...20260530000000...sql:26-34`), not free text. Adding `line_undone` requires `ALTER TYPE order_audit_action ADD VALUE 'line_undone'`. And per §5.2 the line trigger must be taught to emit `line_undone` on the reverse transition (otherwise it mislabels undo as `line_edited` and wrongly flashes the card).

**File:** `supabase/migrations/20260617HHMMSS_kds_line_undo_audit.sql`
(full 14-digit timestamp, e.g. `20260617120000_kds_line_undo_audit.sql` — pick the real HH:MM:SS at write time; the `YYYYMMDD_NNN` short form is BANNED per CLAUDE.md and `tests/unit/migrations/filename-convention.test.ts`).

**Critical Postgres gotcha — `ALTER TYPE ... ADD VALUE` cannot run in the same transaction as its use.** Pre-Postgres-12 this was a hard error; on PG12+ a newly added enum value cannot be used in the **same transaction** that added it. The Supabase migration runner wraps each file in a transaction. **Therefore the enum-add and the trigger function (which references `'line_undone'::order_audit_action`) MUST be in TWO SEPARATE migration files**, applied in order:

- **File A:** `20260617HHMMSS_add_line_undone_enum_value.sql` — just `ALTER TYPE order_audit_action ADD VALUE IF NOT EXISTS 'line_undone';`
- **File B:** `20260617HHMMSS+1_kds_line_undo_trigger.sql` — `CREATE OR REPLACE FUNCTION order_lines_audit_trigger()` with the new branch:
  ```sql
  IF TG_OP = 'UPDATE' THEN
    IF OLD.done_at IS NULL AND NEW.done_at IS NOT NULL THEN
      v_action := 'line_done';
    ELSIF OLD.done_at IS NOT NULL AND NEW.done_at IS NULL THEN
      v_action := 'line_undone';
    ELSE
      v_action := 'line_edited';
    END IF;
    ...
  END IF;
  ```
  Keep the SECURITY DEFINER + `SET search_path = public` posture verbatim (`...20260530000000...sql:228-229`).

**Verify the runner's transaction behaviour before relying on the two-file split** — if a quick local `db:reset` shows the single-file form works on this Supabase CLI version, collapse to one file; otherwise keep two. The two-file split is the safe default.
🗣 In plain English: we're adding a new allowed diary-entry name AND teaching the diary to use it. Postgres has a quirk: you can't invent a new dropdown value and use it in the very same breath — so we do it as two ordered steps to be safe.

### 7.2 No schema change for the data reverts
`done_at`, `done_by` (`order_lines`), `state`, `completed_at` (`orders`) all already exist. The line/order reverts are **data writes**, not schema changes. No column added.
🗣 The actual un-ticking is just writing existing fields back to empty. Nothing structural changes in the tables.

### 7.3 Prod apply sequence
Per the ship sequence (memory: F-RLS-04a / F-TD-22 pattern), apply migrations to **prod FIRST via Supabase MCP `apply_migration`** (File A then File B), confirm green, THEN merge code. Both migrations are additive and backward-compatible (existing code never emits or reads `line_undone`), so there is no cutover window.
🗣 We add the database changes to production before the code that uses them ships — and they're harmless on their own, so there's no risky moment where the two are out of step.

---

## 8. UI design — second-tap → modal → undo, with reopen warning

All changes in `app/kds/page.tsx`.

### 8.1 Make done lines tappable again
Today (line 555-557) a done or completed-order line is non-interactive (`!isDone && !isCompleted && onLineTap(...)`, `disabled={isDone || isCompleted}`). Change so a **done** line is tappable and routes to the undo flow:
- A line that is **not done** → existing `handleLineTap` (mark done). Unchanged.
- A line that **is done** (and the card is still visible) → new `handleLineUndoTap(orderId, lineId)`.
- Visual: keep the green done styling; the tap target stays the same button.
🗣 Done lines stop being dead buttons — tapping one now means "I want to undo this".

### 8.2 The confirmation modal (new `UndoConfirmModal`)
New component in the same file (sibling of `PinModal`/`AttributionModal`). State: `const [undoingLine, setUndoingLine] = useState<{ orderId; lineId; willReopen: boolean } | null>(null)`.

`handleLineUndoTap` computes `willReopen` purely client-side (§5.4): find the order, `willReopen = order.state === 'completed'`. Then `setUndoingLine({ orderId, lineId, willReopen })`.

Modal copy:
- `willReopen === false` → title "Undo this line?", body "Mark this line as not done again."
- `willReopen === true` → title "Reopen the completed order?", body "This will reopen the completed order — undo anyway?"
- Buttons: **Confirm** → `void undoLineDone(orderId, lineId)` then clear; **Cancel** → clear, no change.

🗣 The pop-up adapts its wording: a plain "undo this line?" normally, but a louder "this reopens a finished order — sure?" when that's what's about to happen. The screen already knows which case it is, so no server round-trip.

### 8.3 The optimistic-undo handler `undoLineDone`
Mirror the existing optimistic `markLineDone` (lines 271-348) but in reverse:
- Track a `pendingUndoIdsRef` set (parallel to `pendingDoneIdsRef`, lines 162).
- Optimistically clear `done_at`/`done_by` to `null` in local state AND, if `willReopen`, optimistically set the order `state` back to `printed` + `completed_at` null so the card doesn't vanish under the fade.
- `POST /api/kds/lines/${lineId}/undo`.
- On `res.ok`: clear the pending ref; polling reconciles.
- On failure / network error: ROLLBACK — restore `done_at`/`done_by` (and the order state if reopened) and surface the error toast (existing 3s pattern, lines 328-329).

**Poll-reconciliation extension:** the existing reconciliation (lines 202-224) keeps optimistic *done* state when the server still shows null. Add the mirror: while a line id is in `pendingUndoIdsRef` and the server still shows `done_at != null`, keep the optimistic *pending* state to avoid a green-tick flicker.
🗣 The undo shows instantly (the tick disappears on the same tap), then the server confirms in the background. If the server says no, the tick comes back and an error flashes. Same trick the "mark done" flow already uses, run backwards.

### 8.4 Edge: card already faded out
If the completed card has fully faded (`isCardVisible` false, `lib/orders/kdsLogic.ts:88`), it is no longer on screen and cannot be tapped — undo via UI is simply unavailable past the fade window. **Accept this** (the operator can't undo what they can't see; the audit/data are intact). Document as a known limitation; do NOT extend the fade window in this unit.
🗣 Once a finished order has scrolled off the screen, there's no button left to undo it — that's fine and out of scope here.

---

## 9. Route design

### 9.1 Decision: NEW route `app/api/kds/lines/[lineId]/undo/route.ts`

NOT an extension of the existing `done` route. Rationale:
- **RESTful clarity & consistency:** the codebase models each KDS action as its own POST endpoint under `/api/kds/lines/[lineId]/`. `done` and `undo` are distinct intents; overloading `done` with a `{ action: 'undo' }` body would muddy the contract and the schema.
- **Minimal blast radius:** the existing `done` route stays byte-identical (zero regression risk to the live mark-done path).
- **Mirror template:** the new route is a near-copy of `done/route.ts` (lines 41-61) — same `withRequestContext`/`withErrors` wrappers, same `parseOrThrow` of `kdsLineIdParamSchema` + a body schema, calling `kdsLineUndoneUsecase.undoKdsLineDone(...)`.

Response shape (mirror the done route's `{ ok: true, ... }`):
- `alreadyPending` → `{ ok: true, already_pending: true }`
- `orderReopened` → `{ ok: true, reopened: true }`
- plain undo → `{ ok: true }`

Body schema: reuse the `butcher_id` uuid shape. Add `kdsLineUndoneBodySchema` to `lib/api/kds/schemas.ts` (it can alias `kdsLineDoneBodySchema`'s shape — same `{ butcherId }` contract; keep a distinct export name for clarity).
🗣 In plain English: a brand-new little door for "undo", right next to the "done" door, built from the same blueprint. We don't touch the working "done" door at all.

---

## 10. Ordered, atomic build steps (TDD-friendly)

Each step is independently committable and leaves the suite green.

1. **Contract test cases** — add a `markLineUndone` `describe` block to `lib/ports/__contracts__/OrdersRepository.contract.ts` (after the `markOrderCompleted` block, ≈ line 663). Cases in §12. Run against the **Fake** only at first (red, method absent).
2. **Port** — add `markLineUndone` to `lib/ports/OrdersRepository.ts` with full JSDoc (§6.2). Compiles, contract still red (no impl).
3. **Fake adapter** — implement `markLineUndone` in `lib/adapters/fake/OrdersRepository.ts` (mirror `markLineDone` lines 238-286, inverted; do the atomic line+order revert in the in-memory Map). Contract goes green against Fake.
4. **Migration File A** — `ALTER TYPE ... ADD VALUE 'line_undone'`. Apply to local (`db:reset`).
5. **Migration File B** — trigger `CREATE OR REPLACE` with the `line_undone` branch (§7.1). Apply to local.
6. **Supabase adapter** — implement `markLineUndone` in `lib/adapters/supabase/OrdersRepository.ts` (§13 for the SQL shape). Contract goes green against Supabase (the vendor-test harness).
7. **Service** — add `undoLineDone` to `lib/services/OrdersService.ts` (interface + factory). Unit-test against Fake repo.
8. **Use-case** — `lib/usecases/kdsLineUndone.ts` + export from `lib/usecases/index.ts` (match how `kdsLineDone` is exported). Unit-test the identity guard against the Fake Users repo.
9. **Wiring** — add `kdsLineUndoneUsecase` singleton to `lib/wiring/orders.ts` (mirror `kdsLineDoneUsecase`, lines 65-68: `createKdsLineUndoneUsecase({ ordersService, users: supabaseUsersRepository })`). One line — the rip-out invariant holds.
10. **Schema** — add `kdsLineUndoneBodySchema` to `lib/api/kds/schemas.ts`.
11. **Route** — `app/api/kds/lines/[lineId]/undo/route.ts` (§9).
12. **UI** — `app/kds/page.tsx` (§8): tappable done lines, `UndoConfirmModal`, optimistic `undoLineDone`, poll reconciliation, reopen-warning copy.
13. **Integration + E2E** — §12 layers.

🗣 In plain English: build inward-out, test-first. Write the contract (the promise), then fill it in from the simplest layer (the fake DB) outward to the real DB, the service, the door, and finally the screen — checking the suite stays green at every step.

---

## 11. Risk Assessment (mandatory — Gate 2 input)

### Concurrency / race conditions
- **R-C1 — double-undo / undo-while-completing race. Severity: HIGH. MUST-FIX (design-level).** Two taps, or an undo racing the auto-complete, could corrupt state (e.g. order reverted to `printed` while another tap re-completes, or a line undone twice). **Mitigation (baked into §6.2/§13):** the line UPDATE guards `.not('done_at','is',null)` (TOCTOU — mirror of markLineDone's `.is('done_at',null)`); the order-revert UPDATE guards `.eq('state','completed')`. If the line is already pending → `alreadyPending` no-op. If the order is no longer `completed` when the revert fires (someone re-completed) → the guard misses; treat as benign (the line is what we own; the order state is already consistent) — document, do not throw. **This mitigation is mandatory; without the guards the feature is unsafe.** Covered by integration + pgTAP concurrency tests (§12).
  🗣 Two people tapping at once must never leave the order in a junk state. We re-check the row's state inside the write itself, so only one tap can win and the loser quietly no-ops.
- **R-C2 — non-atomic cascade. Severity: HIGH. MUST-FIX (design-level).** If the line revert and order revert were separate writes, a crash between them leaves a corrupt state the CHECK constraint (§5.1) would even reject. **Mitigation:** §6.1 folds both into one method; in Supabase, do the order-revert and line-revert such that no illegal intermediate is observable — **prefer a single SQL function / RPC** so both writes commit together (see §13 open question). If implemented as two sequential `.update()` calls, order them line-first then order-revert and accept the (small) window; the pgTAP test must prove no reader sees `state='completed'` with the line pending after the call returns.
  🗣 Re-opening an order and un-ticking the line have to happen together or not at all — the database literally calls the half-way state illegal. The plan keeps them in one method; ideally one database call.

### Security
- **S1 — NULL-user audit (accepted, NOT must-fix).** The `line_undone` audit row has no user attribution. **This is the locked spec's deferral to F-RLS-04a-kds** and is consistent with every existing KDS action. Severity: LOW (operational/forensic gap, no security hole — the route still validates the operator is an active allowed-role user before acting; only the *audit* lacks the id). Flagged plainly; not a Gate 2 blocker.
  🗣 The diary won't name who undid the line — same as it doesn't name who marked it done today. It's a known limitation already on the roadmap, not a hole.

### Data migration
- **M1 — enum-add transaction quirk. Severity: MEDIUM. MUST-FIX (build-level).** `ALTER TYPE ADD VALUE` + same-transaction use will fail on PG12+. **Mitigation (§7.1):** two ordered migration files (enum first, trigger second). Verify against the live Supabase CLI version; default to the two-file split. Apply to prod FIRST.
  🗣 Adding the new diary-name and using it in one go can blow up; we split it into two safe ordered steps.
- **M2 — backward compatibility. Severity: LOW.** Both migrations are additive; existing code never references `line_undone`. No data backfill, no cutover window.

### Business-logic flaws
- **B1 — `placed`-state line. Severity: LOW.** A done line cannot exist on a `placed` order (CHECK + flow), but defensively `markLineUndone` treats a not-done line as `alreadyPending` and never cascades a `placed` order. Covered by a contract case.
- **B2 — false orange flash. Severity: MEDIUM. MUST-FIX (build-level).** If the trigger fix (§5.2/§7.1) is omitted, every undo logs `line_edited` and wrongly flashes the card orange (operator thinks the office amended the order). **Mitigation:** the trigger `line_undone` branch (Migration File B) is non-optional. `line_undone` is NOT in the flash-action list (`...OrdersRepository.ts:920`), so a correctly-labelled undo does not flash.
  🗣 Without the trigger fix, undoing a line would make the card flash "the office changed this!" — a lie that sends butchers to re-check paper. The trigger fix prevents that.

### Launch blockers
- **L1 — UI re-enabling completed-card taps. Severity: MEDIUM.** The feature is invisible unless §8.1 makes done lines tappable. Not a data risk, but a "feature doesn't work" blocker — covered by E2E.
- **L2 — none others.** No new deps, no auth surface change, no prod cutover window.

**MUST-FIX summary for Gate 2:** R-C1, R-C2 (concurrency — guards + atomic cascade, design-level, baked into this plan), M1 (two-file migration, build-level), B2 (trigger fix, build-level). All are *resolved within this plan's design* — none block Gate 2 as an unanswered question; they are flagged so the implementer cannot skip them. **No must-fix risk is left unresolved by the plan.**

🗣 In plain English: the dangerous parts are all about doing the re-open safely and atomically, and not lying to the butchers via a false flash. The plan already says exactly how to handle each — nothing is left as an open hole.

---

## 12. Test matrix seed for ANVIL

### Unit (Fake adapter + service + use-case)
- **Contract `markLineUndone`** (`lib/ports/__contracts__/OrdersRepository.contract.ts`):
  1. `NotFoundError` when `lineId` does not exist.
  2. Plain undo on a `printed` order: returns `{ alreadyPending:false, orderReopened:false }`; line `done_at`/`done_by` cleared.
  3. Cascade undo on a `completed` order (this line was the last done): returns `{ orderReopened:true }`; order `state='printed'`, `completed_at=null`, line cleared.
  4. `alreadyPending:true` no-op when the line is already not-done (idempotency); no write.
  5. Cascade undo where OTHER lines remain done: order reverts to `printed`, only the targeted line cleared, others keep `done_at`.
  6. (Defensive) line on a non-completed order with other lines done → plain undo, no cascade, `orderReopened:false`.
- **OrdersService.undoLineDone**: pass-through shape; propagates `NotFoundError`; swallows nothing.
- **kdsLineUndone use-case**: unknown butcher→NotFound; inactive→Forbidden; wrong role→Forbidden; happy path calls `ordersService.undoLineDone`.
- **kdsLogic / UI pure helpers** (if any extracted): `willReopen` computation.

### Integration (vitest, real local Supabase)
- Full undo through the route: `POST /api/kds/lines/[id]/undo` on a printed order → 200 `{ok:true}`, DB line cleared.
- Cascade through the route on a completed order → 200 `{ok:true, reopened:true}`, DB order back to `printed` + `completed_at` null.
- Second undo (already pending) → 200 `{ok:true, already_pending:true}`.
- Identity failures → 404 / 403 matching line-done.
- **Audit assertion:** exactly ONE `order_audit_log` row with `action='line_undone'` per undo; `user_id IS NULL`; on cascade the single row's payload carries before/after (the trigger's `jsonb_build_object('before',OLD,'after',NEW)`).
- **No false flash:** after an undo, `listKdsQueue`/`/api/kds/orders` does NOT return a flash for that order (since `line_undone ∉` flash actions).

### DB / pgTAP
- CHECK-constraint proof: an undo on a completed order leaves `orders` satisfying the state/completed_at CHECK at all observable points (no illegal `completed`+null intermediate visible post-call).
- Trigger proof: reverse transition (`done_at` NOT NULL → NULL) logs `line_undone`, NOT `line_edited`; forward transition still logs `line_done`; a non-done-related line edit still logs `line_edited`.
- Concurrency: two concurrent undo calls on the same line → exactly one writes, the other is a no-op; final state consistent (R-C1).

### E2E (Playwright — `@critical` for the KDS path)
- Tap a done line → confirmation modal appears with plain copy → Confirm → line reverts to pending on the board.
- Tap the last done line of a completed (still-visible) card → modal shows the **reopen warning** copy → Confirm → card returns to printed/in-progress state, count drops below total.
- Cancel → no change.

🗣 In plain English: prove it un-ticks correctly at every layer; prove re-opening a finished order never leaves the database in an illegal state; prove the diary records exactly one correctly-named entry and the card does NOT falsely flash; prove the operator sees the right warning before re-opening an order.

---

## 13. Supabase adapter implementation sketch (for the implementer)

Mirror `markLineDone` (adapter lines 716-836), inverted, with the cascade.

1. Read the line (`id, order_id, done_at`). `maybeSingle()`. Null → `NotFoundError`.
2. **Idempotency:** if `done_at IS NULL` → return `{ alreadyPending:true, orderId, orderReopened:false }` (no write).
3. Read parent order `state`. Decide cascade: `reopened = (state === 'completed')`.
4. **Atomic revert — preferred: a single Postgres RPC / SQL function** `kds_undo_line(p_line_id uuid, p_when timestamptz)` created in Migration File B, that within ONE statement/function:
   - `UPDATE order_lines SET done_at=NULL, done_by=NULL WHERE id=p_line_id AND done_at IS NOT NULL;`
   - if the parent is `completed`: `UPDATE orders SET state='printed', completed_at=NULL WHERE id=<order_id> AND state='completed';`
   - returns `reopened` boolean.
   This guarantees atomicity (R-C2) and keeps the cascade off the JS layer. The adapter calls `client.rpc('kds_undo_line', {...})`.
   **Open question for the implementer / code-critic:** RPC vs two guarded sequential `.update()` calls. RPC is the safer atomic choice and is still hexagonally clean (it lives in the migration + is called only from the Supabase adapter — no vendor type crosses the port). **Recommend RPC.** If two sequential updates are chosen instead, line-first then order-revert, both guarded (`.not('done_at','is',null)`, `.eq('state','completed')`), and the pgTAP test must prove no illegal intermediate is observable.
5. Map result → `{ alreadyPending:false, orderId, orderReopened: reopened }`.
6. On any DB error: `log.error/​warn` + `ServiceError`, matching the house pattern.

Note: the `order_lines` UPDATE fires the audit trigger → `line_undone` row (Migration File B). The adapter writes NO manual audit row.

🗣 In plain English: do the un-tick (and, if needed, the re-open) as one database function call so they can't come apart, let the database's own diary trigger record it, and map the answer back to plain app facts. The one decision to confirm with the reviewer is "one DB function vs two careful writes" — the plan recommends the one-function approach.

---

## 14. Acceptance criteria

- Second tap on a done line opens a confirmation modal; Confirm reverts the line, Cancel does nothing.
- Undo works on `printed` orders (plain) and `completed` orders (cascade: order → `printed`, `completed_at` cleared, line cleared) — all in one atomic operation.
- Exactly one `line_undone` audit row per undo, `user_id` NULL; no false orange flash.
- Reopen-warning modal copy shows when (and only when) the parent order is `completed`.
- Identity guard mirrors line-done (404/403).
- Concurrency-safe (guarded writes; double-undo is a no-op).
- Rip-out invariant intact: swapping the DB = one new adapter folder + the wiring lines for the Orders domain; nothing in `app/`, `lib/services/`, `lib/usecases/` imports an adapter.
- No new `package.json` dependency.
- Migrations applied to prod first (two ordered files), then code merged.

---

## 15. Hexagonal / rip-out verdict (Gate 2)

- **Port used/added:** `OrdersRepository` (existing) — adds method `markLineUndone`. `UsersRepository` (existing) reused unchanged for the identity guard.
- **Adapter(s):** `lib/adapters/supabase/OrdersRepository.ts` (real) and `lib/adapters/fake/OrdersRepository.ts` (test) both implement the new method. Plus the DB-side `kds_undo_line` RPC (recommended) lives in the migration and is called only from the Supabase adapter.
- **New dependencies:** **NONE.** No `package.json` change. (If, against the recommendation, a library were added, it would need a one-line justification + wrapping — but none is needed.)
- **Vendor-leak check:** `@supabase/supabase-js` stays inside `lib/adapters/supabase/`; the new method returns only the plain `{ alreadyPending, orderId, orderReopened }` domain shape; no `SupabaseClient`/`PostgrestResponse` crosses the port. `app/api/kds/lines/[lineId]/undo/route.ts` imports the use-case singleton from `lib/wiring/orders.ts`, never an adapter.
- **Rip-out test:** replacing the DB vendor for Orders = one new adapter folder satisfying `OrdersRepository` (including `markLineUndone`) + the existing wiring lines in `lib/wiring/orders.ts`. The new RPC would be re-expressed as the new vendor's equivalent inside its adapter. **Nothing in `app/`, `lib/services/`, `lib/usecases/`, `lib/domain/`, `lib/ports/` changes.** → **PASS.**

🗣 In plain English: the new ability plugs into the socket the app already owns; only the two database-plugs (real + fake) learn it; no new vendor library; ripping out the database still costs one adapter folder plus the fuse-box lines. The Lego test passes.
