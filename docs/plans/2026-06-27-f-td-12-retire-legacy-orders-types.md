# F-TD-12 — Retire legacy `lib/orders/types.ts`

**Date:** 2026-06-27
**Unit:** Day-16 sealing unit 3 of 6 (`docs/plans/2026-06-12-sixteen-day-roadmap.md`)
**Type:** Pure type-rename + dead-file deletion. ZERO behaviour change.
**Author:** forge-planner (Phase 2, Order)

---

## Mini-map

```
DOMAIN (core logic)
  ├─ lib/domain/Order.ts          — OrderState, OrderUom (canonical types, ALREADY here)
  ├─ lib/domain/orderReference.ts — NEW: parseOrderReference / formatOrderReference /
  │                                  isValidStateTransition / ORDER_REFERENCE_REGEX (runtime helpers)
  └─ lib/orders/types.ts          — legacy wire dialect → DELETED
🗣 Two boxes claim "what an order is" — keep the domain one, move its 4 useful tools home, bin the rest.
```

---

## Goal

Delete `lib/orders/types.ts` entirely so the Orders UI and the one helper test speak the
**domain** language (`@/lib/domain`), not the legacy wire dialect. `OrderState` and `OrderUom`
end up defined exactly ONCE — in `lib/domain/Order.ts` — and the 4 pure runtime helpers move to a
new pure-TypeScript domain file. Nothing references the dead row-shape interfaces, so they vanish
with the file.

**🗣 In plain English:** There are currently two files both describing an order's status. One is the
"real" home (the domain); the other is a leftover from before the rebuild. This unit deletes the
leftover, rescues the 4 still-useful little functions inside it into a clean domain file, and points
the 7 files that still reference the leftover at the proper home. Because TypeScript types disappear
when the code is compiled to run, the actual running app is unchanged — this is housekeeping that
makes the next developer's life easier and removes a duplicate that could drift apart over time.

---

## Domain terms used in this plan

- **Domain layer** (`lib/domain/`) — pure TypeScript types/logic the app owns, no framework or vendor
  imports allowed. **🗣 The app's own private dictionary; it must not depend on any outside tool.**
- **Port / adapter** — not touched by this unit (no data flow changes). **🗣 The sockets and plugs stay
  exactly as they are; we are only renaming labels the UI reads.**
- **Type erasure** — TypeScript types are stripped out when compiled to JavaScript; only runtime values
  (functions, constants, regexes) survive. **🗣 The "shape" labels evaporate at build time, so moving them
  cannot change what the app does — only the functions/regex carry real weight, and those we relocate intact.**
- **Barrel file** (`lib/domain/index.ts`) — a single re-export hub so callers write `import { Order } from '@/lib/domain'`.
  **🗣 One front desk that hands out everything in the domain folder; note it currently re-exports TYPES only, no functions.**

---

## Compliance flags

- **HACCP / food-safety:** none. This unit touches the Orders pipeline UI types only; no HACCP code.
- **Auth / RLS / data:** none. No DB, migration, RLS, or route change.
- **Dependencies:** none added. No `package.json` change.

---

## ADR conflicts

**None.** This unit *advances* ADR-0002 (`docs/adr/0002-hexagonal-shape-and-naming.md`): the dependency
rule says inner layers (UI → domain) and the domain must stay vendor/framework-free. Re-pointing the UI
at `@/lib/domain/Order` and placing the helpers in a pure `lib/domain/orderReference.ts` (no imports)
strengthens conformance. `lib/domain/Order.ts`'s own JSDoc (lines 22–32) explicitly anticipates this
deletion ("When the last route stops importing from `lib/orders/types.ts`, that file ... can be deleted").

**🗣 In plain English:** No decision record is broken. The opposite — the domain file already has a written
note saying "delete the legacy file once nothing imports it," and that moment has arrived.

---

## Step 0 — VERIFICATION (already performed by the planner; findings below)

Re-ran the import grep and confirmed the recon. Findings:

1. **Importers of `lib/orders/types.ts` — CONFIRMED, exactly 7 files:**
   - `app/orders/page.tsx:33` — `import type { OrderState, OrderUom }`
   - `app/orders/new/page.tsx:29` — `import type { OrderUom }`
   - `app/orders/[id]/page.tsx:29` — `import type { OrderState, OrderUom }`
   - `app/orders/[id]/edit/page.tsx:32` — `import type { OrderState, OrderUom }`
   - `app/kds/page.tsx:31` — `import type { OrderState, OrderUom }`
   - `components/EditLockBanner.tsx:14` — `import type { OrderState }`
   - `tests/unit/orders/types.test.ts:21` — `import { parseOrderReference, formatOrderReference, isValidStateTransition, ORDER_REFERENCE_REGEX, type OrderState }`

2. **The 4 helpers + `ORDER_REFERENCE_REGEX` — CONFIRMED no production importer.** A repo-wide grep for
   `parseOrderReference|formatOrderReference|isValidStateTransition|ORDER_REFERENCE_REGEX` (excluding the
   legacy file itself) returns matches ONLY in `tests/unit/orders/types.test.ts`. No `app/**`, no `lib/**`,
   no `components/**` consumer.

3. **The dead row-shape interfaces — CONFIRMED no importer of the legacy symbols.** A grep for
   `OrderRow|OrderLineRow|OrderAuditLogRow|OrderWithLines|OrderAuditAction` shows matches in other files,
   **but they are NAME COLLISIONS, not imports** (none of them import from `lib/orders/types.ts` — the
   only importers are the 7 files in finding 1):
   - `app/orders/page.tsx:56` declares its OWN page-local `interface OrderRow` (a render view-model). **Leave it untouched.**
   - `lib/adapters/supabase/OrdersRepository.ts:95,114` declare their OWN adapter-internal `type OrderRow`/`OrderLineRow`. **Leave them untouched.**
   - `lib/ports/OrdersRepository.ts:65` mentions `OrderAuditLogRow` in a JSDoc comment only. **Cosmetic; out of scope, leave it.**
   - `lib/domain/Order.ts:23–27` mentions the legacy names in deprecation JSDoc (see Step 8).

**Verdict: NO hidden production consumer. The recon is accurate. The full-deletion scope is safe.**

> **⚠️ AMENDMENT (2026-06-27, conductor — Render-phase correction).** Step 0's grep searched for the
> string `lib/orders/types` and so MISSED three files that import the deleted file by the **relative
> path `'./types'`** (they live inside `lib/orders/`). `tsc` caught all three at the implementer's
> typecheck gate. They import ONLY the type symbols and get the identical type-only re-point as the
> other six. **Add to scope:**
> - `lib/orders/dashboardFilters.ts:14` — `import type { OrderState } from './types'` → `from '@/lib/domain/Order'`
> - `lib/orders/kdsLogic.ts:16` — `import type { OrderState } from './types'` → `from '@/lib/domain/Order'`
> - `lib/orders/pickingList.ts:19` — `import type { OrderUom } from './types'` → `from '@/lib/domain/Order'`
>
> Match each file's existing quote style. These are pure-type imports (type-erased at runtime) — same
> zero-behaviour-change category as the original six. The Step 11 grep gate is hereby strengthened to
> ALSO check the relative form: `grep -rn "['\"]\\(@/lib/orders/types\\|\\./types\\)['\"]" lib/orders` must
> return 0 hits after the edits.

**🗣 In plain English:** I re-checked every claim myself. The leftover file is imported by exactly 7
places. Its 4 functions are used only by one test. Its "row shape" descriptions are used by nobody. The
one trap I found is that the names `OrderRow`/`OrderLineRow` ALSO appear in two other files — but those are
separate, independently-declared copies that have nothing to do with the legacy file, so the implementer
must NOT touch them. Safe to proceed with the full deletion.

---

## Helper-home decision (Step 2 requirement)

**Decision: a dedicated new file `lib/domain/orderReference.ts`.** NOT folded into `lib/domain/Order.ts`.

**Why:**
- The 4 helpers are **runtime values** (functions + a regex), not types. `lib/domain/Order.ts` and the
  barrel `lib/domain/index.ts` currently contain **only `export type`** (the barrel header explicitly states
  "Re-exports types only — no runtime values, no factories. The domain layer is pure description"). Dropping
  runtime functions into `Order.ts` would mix value exports into a file/barrel that is deliberately type-only —
  a needless break in an established, documented convention.
- A dedicated `orderReference.ts` keeps a clean single-responsibility unit (reference parsing/formatting +
  the state-transition guard) that any future route/service can import without pulling the whole `Order`
  type module.
- It is still pure TypeScript with **no framework/vendor imports** — fully compliant with the domain-layer rule.

**🗣 In plain English:** The 4 things being rescued are real functions, not just labels. The domain's "front
desk" (`index.ts`) and the `Order.ts` file are set up to hand out labels only — never functions. Slipping
functions in there would break a tidy rule the codebase already follows. So the functions get their own small,
clean file. It still obeys the "no outside tools" rule.

---

## Exact files to change

| # | File | Action |
|---|------|--------|
| 1 | `lib/domain/orderReference.ts` | **CREATE** — the 4 helpers + regex, copied verbatim |
| 2 | `app/orders/page.tsx` | EDIT import (line 33) |
| 3 | `app/orders/new/page.tsx` | EDIT import (line 29) |
| 4 | `app/orders/[id]/page.tsx` | EDIT import (line 29) |
| 5 | `app/orders/[id]/edit/page.tsx` | EDIT import (line 32) |
| 6 | `app/kds/page.tsx` | EDIT import (line 31) |
| 7 | `components/EditLockBanner.tsx` | EDIT import (line 14) |
| 8 | `tests/unit/orders/types.test.ts` | EDIT import (line 21), split helpers vs type |
| 9 | `lib/domain/Order.ts` | EDIT JSDoc (lines 22–32, 52–53, 64–66) — remove now-stale deprecation prose |
| 10 | `lib/orders/types.ts` | **DELETE** |
| 11 | `lib/orders/dashboardFilters.ts` | EDIT import (line 14) `./types` → `@/lib/domain/Order` *(amendment)* |
| 12 | `lib/orders/kdsLogic.ts` | EDIT import (line 16) `./types` → `@/lib/domain/Order` *(amendment)* |
| 13 | `lib/orders/pickingList.ts` | EDIT import (line 19) `./types` → `@/lib/domain/Order` *(amendment)* |

No other files. Do **NOT** touch `app/orders/page.tsx:56`, `lib/adapters/supabase/OrdersRepository.ts`,
or `lib/ports/OrdersRepository.ts` (the name-collision files from Step 0).

---

## Numbered steps (atomic, ordered)

### Step 1 — Create `lib/domain/orderReference.ts`
Create the file with the 4 helpers copied **verbatim** from `lib/orders/types.ts` lines 82–116, plus a
header. It imports `OrderState` from `./Order` (type-only) for the `isValidStateTransition` signature —
that is a same-layer domain import, allowed (domain may import domain; no outward/vendor import). Content:

```ts
/**
 * lib/domain/orderReference.ts
 *
 * Pure domain helpers for the Orders bounded context: MFS-YYYY-NNNN
 * reference parsing/formatting and the application-layer state-transition
 * guard. Relocated from the retired lib/orders/types.ts (F-TD-12).
 *
 * Pure TypeScript — no framework, no vendor imports. Domain-layer rule.
 */
import type { OrderState } from "./Order";

/** Regex matching the MFS-YYYY-NNNN order reference format. */
export const ORDER_REFERENCE_REGEX = /^MFS-(\d{4})-(\d{4})$/;

/**
 * Parses an MFS-YYYY-NNNN reference into its year and sequence parts.
 * Returns null if the input doesn't match the format.
 */
export function parseOrderReference(reference: string): { year: number; sequence: number } | null {
  const match = ORDER_REFERENCE_REGEX.exec(reference);
  if (!match) return null;
  return {
    year: parseInt(match[1], 10),
    sequence: parseInt(match[2], 10),
  };
}

/**
 * Formats a year + sequence pair into an MFS-YYYY-NNNN reference.
 * Sequences over 9999 produce a longer string (still parseable, just wider).
 */
export function formatOrderReference(year: number, sequence: number): string {
  return `MFS-${year}-${sequence.toString().padStart(4, "0")}`;
}

/**
 * Whether a state transition is permitted at the application layer.
 * The database also enforces this via CHECK constraints — this is for
 * pre-validation in API routes so we can return clear 400 errors.
 */
export function isValidStateTransition(from: OrderState, to: OrderState): boolean {
  if (from === to) return false;
  if (from === "placed" && to === "printed") return true;
  if (from === "printed" && to === "completed") return true;
  return false;
}
```

> Logic must be byte-equivalent to the original (same regex, same padding, same transition table). The
> existing test (Step 8) is the proof of equivalence.

**Optional (do NOT do unless trivially clean):** the barrel `lib/domain/index.ts` is type-only by design;
do **not** add these runtime helpers to it. Callers import directly from `@/lib/domain/orderReference`.

### Step 2 — Re-point `app/orders/page.tsx` (line 33)
Change `import type { OrderState, OrderUom } from "@/lib/orders/types";`
→ `import type { OrderState, OrderUom } from "@/lib/domain/Order";`

### Step 3 — Re-point `app/orders/new/page.tsx` (line 29)
Change `import type { OrderUom } from "@/lib/orders/types";`
→ `import type { OrderUom } from "@/lib/domain/Order";`

### Step 4 — Re-point `app/orders/[id]/page.tsx` (line 29)
Change `import type { OrderState, OrderUom } from "@/lib/orders/types";`
→ `import type { OrderState, OrderUom } from "@/lib/domain/Order";`

### Step 5 — Re-point `app/orders/[id]/edit/page.tsx` (line 32)
Change `import type { OrderState, OrderUom } from "@/lib/orders/types";`
→ `import type { OrderState, OrderUom } from "@/lib/domain/Order";`

### Step 6 — Re-point `app/kds/page.tsx` (line 31)
Change `import type { OrderState, OrderUom } from "@/lib/orders/types";`
→ `import type { OrderState, OrderUom } from "@/lib/domain/Order";`

### Step 7 — Re-point `components/EditLockBanner.tsx` (line 14)
Change `import type { OrderState } from '@/lib/orders/types'`
→ `import type { OrderState } from '@/lib/domain/Order'`

> Note: pages use double-quote `@/...` and a `.ts`/no-extension style; `EditLockBanner.tsx` uses single
> quotes. Match each file's existing quote style so Prettier/ESLint stays clean.

### Step 8 — Re-point `tests/unit/orders/types.test.ts` (line 15–21)
Split the import: the 3 functions + regex come from the new helper file; `OrderState` (a type) comes from
the domain types file:

```ts
import {
  parseOrderReference,
  formatOrderReference,
  isValidStateTransition,
  ORDER_REFERENCE_REGEX,
} from '../../../lib/domain/orderReference'
import type { OrderState } from '../../../lib/domain/Order'
```

Also update the file-header comment (lines 2–11) that says "lib/orders/types.ts" to reference the new
location. Test BODY (assertions) is unchanged — it is the equivalence guarantee.

> Optional, low-value: the file currently lives at `tests/unit/orders/types.test.ts`. Renaming it to
> `tests/unit/domain/orderReference.test.ts` would mirror the new source location, but it is not required
> and adds git-move noise. **Recommendation: leave the test path as-is** (rename is cosmetic; keep the diff
> minimal). If the implementer prefers the mirror, a `git mv` is acceptable but call it out at Guard.

### Step 9 — Clean stale JSDoc in `lib/domain/Order.ts`
The deprecation prose (lines 22–32 "Forward-looking deprecation notes", and the "Mirrors
`lib/orders/types.ts:15`" / "soon-to-be-retired" sentences at lines 52–53 and 64–66) now points at a
file that no longer exists. Edit those comments so they no longer reference `lib/orders/types.ts`:
- Replace the "Forward-looking deprecation notes" block with a one-line note that `OrderState`/`OrderUom`
  are the single canonical declaration (legacy `lib/orders/types.ts` retired in F-TD-12).
- In the `OrderState` and `OrderUom` JSDoc, drop the "Mirrors `lib/orders/types.ts:NN`" /
  "re-declared (not re-exported) ... soon-to-be-retired" sentences (the duplication they describe is gone).

> This is comment-only — zero code/type change. Do it so the codebase contains no dangling reference to the
> deleted file. (Search after deletion: `grep -rn "lib/orders/types" --include=*.ts --include=*.tsx` should
> return ZERO hits across `lib/`, `app/`, `components/`, `tests/`.)

### Step 10 — Delete `lib/orders/types.ts`
`git rm lib/orders/types.ts` (or delete the file). This removes the 5 dead row-shape/audit symbols
(`OrderRow`, `OrderLineRow`, `OrderAuditLogRow`, `OrderWithLines`, `OrderAuditAction`) confirmed unused in Step 0.

### Step 11 — Final consistency assertion
After all edits, confirm:
- `grep -rn "lib/orders/types"` over `app/ lib/ components/ tests/` returns ZERO hits.
- `OrderState` and `OrderUom` are declared exactly ONCE in source: `lib/domain/Order.ts:56,68`.
  (Local-collision declarations like the page-local `OrderRow` are unrelated and remain.)

---

## TDD test plan

This is a **type-only re-point + dead-file deletion**. The type system itself is the exhaustive test
oracle: a wrong/missing import cannot compile. The plan therefore leans on existing nets rather than new
bespoke specs.

1. **`tsc` (type check) — PRIMARY NET.** Run `npx tsc --noEmit` (or `npm run typecheck` if defined). This
   visits **every** usage site of `OrderState`/`OrderUom` across the 6 re-pointed files and fails closed on
   any broken import or symbol mismatch. **🗣 The compiler walks every place these labels are used; if even
   one import is wrong, it refuses to build — so it is impossible to ship a broken rename silently.**
2. **Production build** (`npm run build`). Confirms the Next.js App Router pages still compile and tree-shake.
   **🗣 A full dress rehearsal of the real build; proves the live pages still assemble.**
3. **Re-pointed helper unit test** (`tests/unit/orders/types.test.ts`, re-pointed in Step 8). Its assertions
   are UNCHANGED, so a green run proves the relocated `parseOrderReference`/`formatOrderReference`/
   `isValidStateTransition`/`ORDER_REFERENCE_REGEX` behave byte-identically after the move. **🗣 The same
   exam, now sat by the relocated functions — passing it proves we moved them without breaking them.**
4. **ESLint / arch-rule pins.** Run `npm run lint`. The `no-adapter-imports` and vendor-fence pins must stay
   green; the new `lib/domain/orderReference.ts` must have no framework/vendor import. **🗣 The robot
   inspector that enforces the Lego rules; it must confirm the new file stays vendor-free.**
5. **Full unit suite** (`npm test` / vitest). Right-sizes to "no regression" — expect the existing count to
   hold (the suite gains 0 net tests; the orders/types test simply re-points).
6. **`@critical` Playwright preview smoke** — boot/render check on the Orders + KDS screens.
   `npm run test:e2e:preview -- <preview-url> --unprotected` (readiness-gated on `/api/auth/team`=200).
   **🗣 A final "do the order screens still open and render?" check against a real deployed copy.**

**NO bespoke new browser button-click specs.** A type-only re-point changes zero runtime behaviour (type
erasure ⇒ byte-identical compiled JS for the UI pages), so new click specs would add zero coverage beyond
what `tsc` + build + the existing `@critical` boot smoke already guarantee. Writing them would be ANVIL
over-fitting. **🗣 In plain English:** Because the labels vanish at build time, the running buttons are
literally the same bytes as before — clicking them in a new test proves nothing the compiler hasn't already
proven. ANVIL should right-size to unit + build + the existing smoke, not a fresh every-button sweep.

**ANVIL right-sizing verdict:** unit + tsc + build + lint + existing `@critical` smoke. **NO** PITR gate
(no DB), **NO** new pgTAP (no SQL), **NO** exhaustive browser-tap sweep (no UI/behaviour change).

---

## Acceptance criteria

1. `lib/orders/types.ts` no longer exists.
2. `lib/domain/orderReference.ts` exists, is pure TypeScript (no framework/vendor import), and exports the
   4 helpers + regex with byte-equivalent logic.
3. All 6 UI/component files import `OrderState`/`OrderUom` from `@/lib/domain/Order`.
4. `tests/unit/orders/types.test.ts` imports helpers from `@/lib/domain/orderReference` and the type from
   `@/lib/domain/Order`, and PASSES with unchanged assertions.
5. `OrderState` and `OrderUom` are declared exactly ONCE (in `lib/domain/Order.ts`). No duplication remains.
6. `grep -rn "lib/orders/types"` over source returns ZERO hits (including in `Order.ts` JSDoc).
7. `tsc --noEmit`, `npm run build`, `npm run lint`, and the full unit suite all green.
8. `@critical` preview smoke green (Orders + KDS boot/render).
9. Compiled UI bundle is behaviourally identical (no runtime diff) — verified by the byte-erasure argument +
   green build + green smoke.

---

## Risk Assessment

Severity scale: 🔴 must-fix (Gate 2 blocker) · 🟡 mitigate · 🟢 informational.

### Concurrency / race conditions — 🟢 none
No async, no shared state, no ordering. Compile-time-only change. **No material risks in this category.**
**🗣 Nothing here runs at the same time as anything else; type labels don't race.**

### Security — 🟢 none
No auth, no RLS, no input handling, no secrets. The relocated helpers are the same pure string/regex logic.
**No material risks in this category.**
**🗣 No locks, keys, or user data are touched — this is rearranging internal labels.**

### Data migration — 🟢 none
No DB, no migration, no schema, no RLS, no PITR gate. **No material risks in this category.**
**🗣 The database is never opened; nothing to migrate or back up.**

### Business-logic flaws — 🟡 low (mitigated)
The only runtime logic that MOVES is the 4 helpers. Risk: a transcription typo while copying (e.g. a changed
regex or padding) would silently alter reference parsing. **Mitigation:** copy verbatim; the unchanged
existing unit test (Step 8) is a byte-for-byte equivalence oracle and must stay green — that is the proof.
Severity drops to low because the test exhaustively pins the round-trip, the transition table, and the regex
edge cases. **Not a must-fix** provided the test is re-pointed and green.
**🗣 The one real-logic move is 4 small functions; a fat-finger copy could change behaviour, but the existing
test catches that exactly — keep it green and you're safe.**

### Launch blockers — 🟡 low (mitigated)
- **Stale references to the deleted file.** If Step 9 (JSDoc cleanup in `Order.ts`) is skipped, the code
  compiles but contains a dangling textual reference to a non-existent file — cosmetic debt, not a break.
  Mitigation: the Step 11 grep gate (`grep "lib/orders/types"` = 0 hits) catches it. 🟢 after that gate.
- **Name-collision trap.** `OrderRow`/`OrderLineRow` also exist as independent local declarations in
  `app/orders/page.tsx` and `lib/adapters/supabase/OrdersRepository.ts`. An implementer who "tidies" those
  thinking they belong to the legacy file would break unrelated code. Mitigation: Step 0 + the file table
  explicitly mark those as DO-NOT-TOUCH. 🟡 → 🟢 if the implementer respects the table.
- **Barrel-export temptation.** Adding the runtime helpers to the type-only `lib/domain/index.ts` would
  break the documented "types only" barrel convention and could trip arch-lint. Mitigation: Step 1 + the
  helper-home decision say explicitly NOT to. 🟢.

**No 🔴 must-fix risks. NO Gate 2 blockers.**

**🗣 In plain English:** Nothing here can block launch. The two things to watch are (1) copy the 4 functions
exactly and keep their test green, and (2) do NOT touch the unrelated `OrderRow` look-alikes in the page and
adapter — they just happen to share a name. Both are guarded by explicit instructions and a final grep check.

---

## Rollback

Code-only change, no DB/infra. Rollback = `git revert <commit>` (or drop the branch before merge).
Reverting restores `lib/orders/types.ts` and the original imports atomically. No data, no migration, nothing
external to undo. **🗣 If anything looks wrong, one git command puts every file back exactly as it was — there's
no database or deployment state to unwind.**

---

## Hexagonal verdict (populates Gate 2)

- **Port used/added:** NONE. No port created, changed, or consumed. This is an intra-domain type relocation.
- **Adapter:** NONE touched. Routes/services/adapters/DTOs (`lib/api/orders/dto.ts`) are untouched; data flow
  unchanged.
- **New dependencies:** NONE. No `package.json` change. No vendor library added or wrapped.
- **Rip-out test:** N/A in the vendor sense (no vendor involved); the analogous "swap cost" here is the
  duplication-removal goal — `OrderState`/`OrderUom` go from 2 declarations to 1, *improving* locality.
- **Dependency direction:** UI → `lib/domain` (inward). The new `lib/domain/orderReference.ts` imports only
  `./Order` (same layer, type-only). No outward/vendor import. **PASS.**

**Rip-out / arch-rule result: PASS.** No new dep, no vendor breach, dependency points inward, domain stays pure.
No Gate 2 architectural blocker.

**🗣 In plain English:** No plugs or sockets change. No new outside tool is added. The change only makes the
app's own dictionary tidier (one definition instead of two) and keeps every dependency arrow pointing the
correct way (screens depend on the core, never the reverse). Architecturally clean — nothing for Gate 2 to stop.
