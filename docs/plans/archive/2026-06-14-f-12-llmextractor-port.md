# F-12 — LLMExtractor port + Anthropic adapter (pure relocation)

**Date:** 2026-06-14
**Unit:** F-12 (Day-3, last unit of the 16-day sprint Day-3 block)
**Type:** Hexagonal breach removal — PURE RELOCATION, zero behaviour change
**Author:** forge-planner (Phase 2, Order)

---

```
DOMAIN (core logic)
  └─ LLMExtractor (port) → [Anthropic]  (adapter)   + [Fake] (test adapter)
🗣 one socket for "turn raw text into mapped rows" — Anthropic is the only plug; swap the AI vendor = one new adapter + one wiring line
```

---

## 1. Goal

Today `app/api/admin/import/route.ts` imports `@anthropic-ai/sdk` directly — the
route IS the AI integration. That breaks the architecture rule (CLAUDE.md): a
vendor SDK may only live inside `lib/adapters/<vendor>/`, and the UI/route layer
talks to the app's own ports, never to a vendor.

🗣 In plain English: right now the import screen's "read this pasted text" button
has the AI company's machinery bolted straight onto it. We're moving that
machinery into its own labelled box. The screen will ask the box for "mapped
rows" without knowing or caring that Anthropic is inside. If we ever switch AI
providers, we change one box and one wiring line — nothing on the screen.

**Hard constraint: ZERO behaviour change.** Every value the AI sees and every
value the AI returns stays byte-for-byte identical. This is a relocation, not a
rewrite. (Hakan explicitly chose relocation over modernizing.)

### Frozen-byte-for-byte invariants (copied VERBATIM, never edited)
- Model id: `claude-sonnet-4-6` (do NOT upgrade to opus, do NOT change the id)
- `max_tokens: 4096`
- Forced tool-use: `tool_choice: { type: 'tool', name: tool.name }` (do NOT
  switch to `output_config.format` — that would force an SDK bump)
- Both entity types: `customers` + `products`
- The two system prompts (`CUSTOMER_SYSTEM`, `PRODUCT_SYSTEM`) — moved verbatim
- The two tool schemas (`CUSTOMER_TOOL`, `PRODUCT_TOOL`) — moved verbatim
- The user-message template: `` `Map the following ${entityLabel} data:\n\n${raw_text.trim()}` ``
  with `entityLabel` = `'customer'` / `'product'`
- Output shape: `{ clean_rows, flagged_rows }` unchanged
- "no `tool_use` block → 502 with message `AI did not return structured data —
  please try again`" preserved
- The two `console.warn` lines for missing `clean_rows` / `flagged_rows`
- The two `console.error` lines for the no-tool-block path
  (`'[import] No tool_use block. stop_reason:'` + `'[import] Content:'`)

🗣 In plain English: I have listed every knob and every word so the implementer
copies them exactly. If any of these change, the AI's answers could change, and
that is forbidden for this unit.

### Dependency note
`@anthropic-ai/sdk@^0.39.0` is ALREADY in `package.json` (line 25, confirmed).
`tool_use` works in 0.39. **No new dependency, no SDK upgrade.**

🗣 In plain English: nothing new gets installed. We're rearranging code that
already exists, using the AI library that's already here.

---

## 2. Domain vocabulary (CONTEXT.md / glossary terms)

- **Port** — the socket the app owns. Here: `LLMExtractor`. 🗣 The shape the
  import screen plugs into; the AI vendor must fit it, not the reverse.
- **Adapter** — the concrete plug for one vendor. Here:
  `lib/adapters/anthropic/`. 🗣 The actual Anthropic-specific box; the only place
  the AI library is imported.
- **Fake adapter** — a no-network stand-in. 🗣 A pretend AI box that returns
  canned answers, so tests run fast, free, and the same way every time.
- **Wiring / composition root** — `lib/wiring/llm.ts`. 🗣 The parts list that
  bolts the Anthropic box onto the socket and hands the route a ready-to-use unit.
- **Rip-out test** — CLAUDE.md acceptance test. 🗣 "If we swap the AI vendor
  tomorrow, how many files change?" Must be: one adapter + one wiring line.

CONTEXT.md exists and has a glossary. **Add one entry** (Step 0b below) for
`LLMExtractor` so the project vocabulary stays the single source of truth.

---

## 3. Compliance flags

- **No DB migration, no schema change, no RLS change, no PITR.** This unit
  touches no Postgres. 🗣 We don't touch the database at all, so none of the
  database-safety machinery applies.
- **No auth change.** The route keeps its `x-mfs-user-id` 401 guard verbatim.
- **Secret handling:** `ANTHROPIC_API_KEY` (env var) moves from the route into
  the adapter, read LAZILY in the wiring (see Step 5). 🗣 The AI password stops
  being read the instant the file loads; it's read only when an extraction
  actually happens — so unit tests can load the code with no key set.

---

## 4. ADR review — conflicts

**No conflicts. The plan executes exactly what ADR-0002 already mandates.**

- `docs/adr/0002-hexagonal-shape-and-naming.md` explicitly names
  `lib/adapters/anthropic/` as the home for the AI vendor and lists
  `@anthropic-ai/sdk` among the SDKs "permitted inside `lib/adapters/**` and
  nowhere else." It even cites `Anthropic.Tool` as an example of a vendor type
  that may be used INSIDE an adapter but must never cross the port boundary.
  🗣 The architecture decision log already drew this exact box and said the AI
  library belongs only inside it. F-12 is the unit that finally builds it.
- ADR-0002 also says the vendor-import lint rule is "tightened to cover every
  vendor on the list in F-27 (Phase 5)." F-12 front-runs the `@anthropic-ai/sdk`
  slice of that (same pattern F-10 used for `bcryptjs`). 🗣 We're locking the AI
  library into its box at lint time now, ahead of the big sweep, copying exactly
  how the password library was locked in.
- ADR-0003 (FREEZE rule) and ADR-0004 (RLS) are untouched — no Supabase, no RLS.

🗣 In plain English: the rulebook already says "the AI goes in this box." There's
nothing to argue about; we just build the box.

---

## 5. Exact files to change

### NEW files (created)
| Path | What it is |
|---|---|
| `lib/domain/Import.ts` | Owned domain types for AI-extracted rows + the result envelope. No vendor shape. |
| `lib/ports/LLMExtractor.ts` | The port interface (the socket). Pure TS. |
| `lib/adapters/anthropic/LLMExtractor.ts` | The Anthropic adapter — SOLE place `@anthropic-ai/sdk` is imported. Holds prompts, tool schemas, model call, parse, mapping, error. |
| `lib/adapters/anthropic/index.ts` | Barrel: re-exports the factory. |
| `lib/adapters/fake/LLMExtractor.ts` | Deterministic no-network Fake adapter. |
| `lib/wiring/llm.ts` | Composition root: lazy Anthropic client → singleton. |
| `tests/unit/adapters/anthropic/LLMExtractor.test.ts` | Adapter unit tests (mock the SDK). |
| `tests/unit/adapters/fake/LLMExtractor.test.ts` | Fake adapter determinism tests. |
| `tests/unit/api/import.route.test.ts` | Thin-route dispatch tests (Fake adapter). |

### EDITED files
| Path | Change |
|---|---|
| `app/api/admin/import/route.ts` | Becomes thin: import wired singleton, dispatch on `type`, call port, return `{clean_rows, flagged_rows}`, map extraction error → SAME 502. Deletes the SDK import, the client, the two tools, the two prompts, the inline call+parse. |
| `lib/domain/index.ts` | Add `export type` lines for the new Import domain types. |
| `lib/ports/index.ts` | Add `export type { LLMExtractor } from "./LLMExtractor";` |
| `.eslintrc.json` | Add `@anthropic-ai/sdk` to BOTH `paths` blocks (base + services override) and add `lib/adapters/anthropic/**/*.ts` to the overrides `files` allow-list. |
| `tests/unit/lint/no-supabase-sdk.test.ts` | Add `@anthropic-ai/sdk` to the hermetic mirror config + new test cases. |
| `tests/unit/lint/no-adapter-imports.test.ts` | Add `@anthropic-ai/sdk` disk-loaded pin cases. |
| `CONTEXT.md` | Add `LLMExtractor` glossary entry. |

### UNTOUCHED (confirmed by reading)
- `app/api/admin/import/confirm/route.ts` — no Anthropic. Leave it.
- `app/api/admin/import/manual/route.ts` — no Anthropic. Leave it.
- `app/admin/page.tsx` — receives JSON over HTTP, imports no server types.
  Its `CleanRow`/`FlaggedRow`/`ImportResult` interfaces (lines 26–35) are
  client-side mirrors of the wire shape; the wire shape does NOT change, so the
  UI needs no edit. **Leave page.tsx untouched** (minimize UI churn).
  🗣 The screen reads the answer as plain text over the network — it never
  reaches into the server's code — so the screen needs zero changes.

---

## 6. The chosen port interface (with justification)

```ts
// lib/ports/LLMExtractor.ts
import type { CustomerExtraction, ProductExtraction } from "@/lib/domain";

export interface LLMExtractor {
  /**
   * Extract mapped CUSTOMER rows from raw pasted text.
   * @throws LLMExtractionError when the model returns no structured data
   *         (the route maps this to a 502).
   */
  extractCustomers(rawText: string): Promise<CustomerExtraction>;

  /**
   * Extract mapped PRODUCT rows from raw pasted text.
   * @throws LLMExtractionError when the model returns no structured data
   *         (the route maps this to a 502).
   */
  extractProducts(rawText: string): Promise<ProductExtraction>;
}
```

**Decision: two methods (option a), NOT one `extract(entity, rawText)`.**

Justification:
1. The two entity types return **different row shapes** (customer rows have only
   `name`; product rows have `name`/`category`/`code`/`box_size`). Two methods
   give each its own precise return type with no union-narrowing at the call
   site. 🗣 Customers and products genuinely produce different-shaped answers;
   two clearly-typed methods are honest about that, where one method would force
   the caller to guess which shape came back.
2. It is scoped to **exactly today's two entity types** — no generic
   `extract<T>(schema, ...)`, no entity registry. A speculative generic seam is a
   code-critic blocker (CLAUDE.md "no speculative generality"). 🗣 We build the
   two doors we actually need, not a configurable door factory for doors nobody
   has asked for.
3. **Depth (ADR-0002 depth rule):** each method hides a large non-trivial
   decision set — vendor client, ~125-line system prompt, ~40-line tool schema,
   forced tool-choice, tool_use parse, vendor→domain mapping, array-guarding,
   and error signalling — behind `(rawText) => Promise<Extraction>`. That is a
   deep port behind a tiny interface, not a 1:1 vendor passthrough. 🗣 Each
   method is a small handle on a big machine — exactly what a good socket should
   be.

**Rejected:** `extract(entity: 'customers'|'products', rawText)` — saves nothing
(the route already branches on `type`), and forces a return union the caller must
re-narrow. Two named methods are clearer and equally non-speculative.

---

## 7. Domain types

```ts
// lib/domain/Import.ts
//
// Owned types for AI-extracted import rows. Pure TypeScript — no framework
// import, no vendor import. These are the app's OWN shape; the Anthropic
// adapter maps the vendor's tool_use.input into these before returning.
// The wire shape returned by /api/admin/import is { clean_rows, flagged_rows }
// — identical to today; these types just name it.

/** A successfully-mapped customer row. */
export interface CustomerCleanRow {
  name: string;
}

/** A successfully-mapped product row. Sentinel "none" preserved verbatim
 *  (the confirm route converts "none" → null before insert — unchanged). */
export interface ProductCleanRow {
  name: string;
  category: string;
  code: string;
  box_size: string;
}

/** A row the model could not map / wants reviewed. Same shape for both
 *  entity types (matches both tool schemas' flagged_rows.items). */
export interface FlaggedRow {
  row: number;
  raw: string;
  reason: string;
}

export interface CustomerExtraction {
  clean_rows: CustomerCleanRow[];
  flagged_rows: FlaggedRow[];
}

export interface ProductExtraction {
  clean_rows: ProductCleanRow[];
  flagged_rows: FlaggedRow[];
}
```

**Error type** — a typed domain error, defined alongside the port (recommended by
the spec so the contract is total/clear). Place it in `lib/ports/LLMExtractor.ts`
(it is part of the port contract; it carries no vendor shape):

```ts
// in lib/ports/LLMExtractor.ts (exported)
export class LLMExtractionError extends Error {
  constructor(message = "AI did not return structured data") {
    super(message);
    this.name = "LLMExtractionError";
  }
}
```

🗣 In plain English: instead of the adapter quietly returning an empty answer
when the AI misbehaves, it throws a clearly-labelled error. The route catches
that one label and returns the same 502 message users see today. The adapter
contract is now honest: it either gives you rows or tells you plainly it
couldn't. NOTE: `LLMExtractionError` is a runtime value (a class), so the ports
barrel re-export for it uses `export { LLMExtractionError }` (value export) while
the interface uses `export type { LLMExtractor }`.

**Boundary discipline:** `CleanRow`/`FlaggedRow` etc. are domain types, so the
array-guard (`Array.isArray(...) ? ... : []`) and the two `console.warn` lines
live INSIDE the adapter (where today's route does them), mapping vendor output →
these domain types. No `Anthropic.*` type ever appears in `lib/domain` or
`lib/ports`.

---

## 8. Ordered TDD steps (red → green → refactor)

> Convention from F-10: ports/domain are pure types (no test needed on their
> own); the proof is the adapter unit tests + lint pins + the route test. Write
> the failing test first where a test exists for the step.

### Step 0a — Domain + port skeleton (compile-only)
- Create `lib/domain/Import.ts` (Section 7 types).
- Create `lib/ports/LLMExtractor.ts` (Section 6 interface + `LLMExtractionError`).
- Wire barrels: add to `lib/domain/index.ts` and `lib/ports/index.ts`
  (remember: `LLMExtractionError` is a VALUE export, the interface is a TYPE
  export).
- **Proof:** `npx tsc --noEmit` stays at 0 errors.
- 🗣 Lay down the socket shape and the answer shapes first; nothing uses them yet.

### Step 0b — CONTEXT.md glossary entry
- Add under `## Glossary`:
  > **LLMExtractor** — the app's own socket for "turn this pasted text into
  > mapped customer or product rows." The AI vendor (currently Anthropic) plugs
  > in behind it via an adapter; the import screen and route never see the
  > vendor. Swapping the AI = one new adapter + one wiring line.
- 🗣 Record the new word in the project dictionary so reviews stay consistent.

### Step 1 — Anthropic adapter (RED → GREEN)
**RED first.** Create `tests/unit/adapters/anthropic/LLMExtractor.test.ts`,
mocking `@anthropic-ai/sdk` (vi.mock). Assertions:
1. `extractCustomers(text)` calls `messages.create` with EXACTLY:
   `model: 'claude-sonnet-4-6'`, `max_tokens: 4096`,
   `system` === the customer system prompt, `tools` === `[CUSTOMER_TOOL]`,
   `tool_choice: { type: 'tool', name: 'return_mapped_customers' }`,
   `messages: [{ role: 'user', content: 'Map the following customer data:\n\n' + text.trim() }]`.
2. `extractProducts(text)` calls it with the product prompt, `[PRODUCT_TOOL]`,
   `tool_choice.name === 'return_mapped_products'`, and `content` starting
   `'Map the following product data:\n\n'`.
3. Given a stub message whose `content` includes a `tool_use` block with
   `input: { clean_rows: [...], flagged_rows: [...] }`, the method returns those
   arrays mapped to the domain shape.
4. Given a stub message with NO `tool_use` block, the method throws
   `LLMExtractionError` (assert `err.name === 'LLMExtractionError'`) and the two
   `console.error` lines fire with `stop_reason` + content JSON.
5. Array-guarding: stub `input` with `clean_rows` missing → returns `[]` for it
   and the matching `console.warn` fires; same for `flagged_rows`.

**GREEN.** Create `lib/adapters/anthropic/LLMExtractor.ts`:
- `import Anthropic from "@anthropic-ai/sdk";`
- Factory `createAnthropicLLMExtractor(deps: { getApiKey: () => string | undefined }): LLMExtractor`
  — client built lazily on first call from `deps.getApiKey()` (mirrors
  `web-crypto` `getSecret` + the F-TD-04 lazy-client lesson), memoized.
- Move `CUSTOMER_TOOL`, `PRODUCT_TOOL` (typed `Anthropic.Tool`),
  `CUSTOMER_SYSTEM`, `PRODUCT_SYSTEM` VERBATIM from the route.
- A private `run(tool, systemPrompt, entityLabel, rawText)` helper does the
  `messages.create`, the `tool_use` find + `LLMExtractionError` throw (with the
  two `console.error` lines), and returns `toolBlock.input as Record<string, unknown>`.
- `extractCustomers` / `extractProducts` call `run(...)` then map+array-guard
  into `CustomerExtraction` / `ProductExtraction` (the two `console.warn` lines
  move here).
- Create `lib/adapters/anthropic/index.ts`:
  `export { createAnthropicLLMExtractor } from "./LLMExtractor";`
- **Proof:** the RED test goes green; `tsc` 0.
- 🗣 The AI machine now lives in its own box, behaves identically, and the box's
  tests prove every knob is set exactly as before.

### Step 2 — Fake adapter (RED → GREEN)
**RED.** `tests/unit/adapters/fake/LLMExtractor.test.ts`: assert
`createFakeLLMExtractor()` returns deterministic, well-shaped
`CustomerExtraction`/`ProductExtraction` (same output for same input; valid
domain shape), and that a configurable "force error" seed makes it throw
`LLMExtractionError` (so route tests can exercise the 502 path).
**GREEN.** `lib/adapters/fake/LLMExtractor.ts`:
- `createFakeLLMExtractor(seed?)` — no network, no SDK import. Returns canned
  domain rows (e.g. one clean row echoing a line of the input, empty flagged).
  Optional `seed.throwOnExtract` makes both methods throw `LLMExtractionError`.
- Add exports to `lib/adapters/fake/index.ts`
  (`createFakeLLMExtractor`, `fakeLLMExtractor` singleton for symmetry).
- 🗣 A pretend AI box for tests — gives the same canned answer every time, and
  can be told to "fail" so we can test the error screen.

### Step 3 — Wiring (compile-only)
- Create `lib/wiring/llm.ts` (mirror `password.ts` + `session.ts` lazy secret):
  ```ts
  import { createAnthropicLLMExtractor } from "@/lib/adapters/anthropic";
  import type { LLMExtractor } from "@/lib/ports";

  export const llmExtractor: LLMExtractor = createAnthropicLLMExtractor({
    getApiKey: () => process.env.ANTHROPIC_API_KEY,
  });
  ```
- **Proof:** `tsc` 0; importing this module triggers NO network and reads NO env
  at import time (lazy).
- 🗣 The parts list that snaps the Anthropic box onto the socket. The AI password
  is read only when an extraction runs, never at startup.

### Step 4 — Thin the route (RED → GREEN)
**RED.** `tests/unit/api/import.route.test.ts` (mock `@/lib/wiring/llm` to inject
a Fake): assert
- POST with no `x-mfs-user-id` → 401 (verbatim).
- POST invalid JSON → 400; missing `raw_text` → 400; bad `type` → 400 (verbatim).
- `type:'customers'` → calls `extractCustomers`, returns its
  `{clean_rows, flagged_rows}` with 200.
- `type:'products'` → calls `extractProducts`, returns 200.
- Fake throws `LLMExtractionError` → route returns **502** with body
  `{ error: 'AI did not return structured data — please try again' }` (the
  message MUST match today's text byte-for-byte — note the route's user-facing
  502 message appends `— please try again`, which is NOT part of the default
  `LLMExtractionError.message`; the route supplies the full 502 string).
- Any other thrown error → 500 `{ error: 'Server error' }` (verbatim).

**GREEN.** Rewrite `app/api/admin/import/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { llmExtractor } from "@/lib/wiring/llm";
import { LLMExtractionError } from "@/lib/ports";
```
Keep the docblock, the 401/400 guards, and the dispatch:
```ts
const result =
  type === "customers"
    ? await llmExtractor.extractCustomers(raw_text)
    : await llmExtractor.extractProducts(raw_text);
return NextResponse.json(result);
```
Catch `LLMExtractionError` → 502 with the exact today message; re-throw / fall
through other errors to the existing 500. Delete the SDK import, the client, the
two tools, the two prompts, the inline call+parse.
- **Proof:** RED test green; `tsc` 0.
- 🗣 The screen's button now just asks the box "map this" and hands back the
  answer. All the AI guts are gone from the route — it's a thin doorman again.

### Step 5 — Lint enforcement (the F-10 replication)
Edit `.eslintrc.json` — **add `@anthropic-ai/sdk` to BOTH `paths` blocks**
(base block AND the services-override block — they RESTATE, not merge; missing
either is the F-10 trap), and add `"lib/adapters/anthropic/**/*.ts"` to the
overrides `files` allow-list. The forbidden message (byte-identical everywhere):
```
Use the LLMExtractor port via @/lib/wiring/llm. @anthropic-ai/sdk may only be imported inside lib/adapters/anthropic/. See ADR-0002 / F-12.
```
Then **RED → GREEN** the two lint mirrors:
- `tests/unit/lint/no-supabase-sdk.test.ts` (hermetic): add the
  `@anthropic-ai/sdk` path to the in-file `f04Config.paths`, add the vendor dir
  to the override `files`, add an `ANTHROPIC_FORBIDDEN_MESSAGE` const, and add a
  describe block: banned in `app/api`, allowed in
  `lib/adapters/anthropic/LLMExtractor.ts`, message verbatim.
- `tests/unit/lint/no-adapter-imports.test.ts` (disk-loaded pin): add cases
  asserting the SHIPPED config bans `@anthropic-ai/sdk` in `lib/services/**` and
  `app/api/**`, allows it in `lib/adapters/anthropic/**`, and reports the message
  verbatim (define a matching `ANTHROPIC_MESSAGE` const).
- **Proof:** `npm run lint` 0 (the new route no longer imports the SDK, so the
  real lint passes); both mirror suites green.
- 🗣 We bolt the rule shut: from now on, anything outside the Anthropic box that
  tries to import the AI library fails the build — exactly how the password
  library got locked in F-10.

### Step 6 — Full green gate
- `npx tsc --noEmit` → 0
- `npm run lint` → 0
- `npm run test:unit` (or vitest) → all green, count rises from 1552
  (adapter + fake + route + lint cases added).
- Integration suite (122) unchanged — no integration test touches this route's
  AI path (see Section 9 scope boundary).
- 🗣 Everything compiles, the rule passes, and the new tests prove identical
  behaviour. Nothing old broke.

---

## 9. Test matrix + DELIBERATE scope boundary

| Layer | Coverage |
|---|---|
| Adapter unit (mock SDK) | Call params per entity, parse → domain, no-block → `LLMExtractionError`, array-guard + warns |
| Fake unit | Deterministic shape; forced-error throws `LLMExtractionError` |
| Route unit | 401/400 guards, dispatch on `type`, 502 mapping, 500 fallthrough |
| Lint hermetic mirror | `@anthropic-ai/sdk` banned/allowed + message verbatim |
| Lint disk-loaded pin | Same, against the SHIPPED `.eslintrc.json` |

**DELIBERATE SCOPE BOUNDARY (stated, not silently skipped):**
**No integration or E2E test hits the real Anthropic API.** It is
non-deterministic, costs money, and needs a live key. Route/integration paths
use the **Fake** adapter. This absence is intentional and documented here so it
is not mistaken for a coverage gap. 🗣 We deliberately do not call the real AI in
automated tests — it'd cost money and give a different answer every run. Tests
use the pretend AI box instead.

**Baselines to preserve:** tsc 0 · lint 0 · unit 1552 (will rise) · integration
122. ANVIL layers 3+4 (typecheck/lint) run STRICT.

---

## 10. Acceptance criteria

1. `app/api/admin/import/route.ts` contains NO `@anthropic-ai/sdk` import and no
   `Anthropic` client.
2. `@anthropic-ai/sdk` is imported in EXACTLY ONE file:
   `lib/adapters/anthropic/LLMExtractor.ts` (verifiable: `grep -rl
   "@anthropic-ai/sdk" --include=*.ts lib app | grep -v adapters/anthropic`
   returns nothing; the lint pins enforce it).
3. The POST contract is identical: same 401/400 codes, same 502 message, same
   `{clean_rows, flagged_rows}` body, same model/tokens/prompts/tool-choice
   sent to the AI (proven by adapter unit assertions).
4. `app/admin/page.tsx`, `confirm/route.ts`, `manual/route.ts` unchanged.
5. tsc 0, lint 0, all unit tests green, integration 122 unchanged.
6. No new `package.json` dependency.

---

## 11. Rip-out test (CLAUDE.md acceptance test)

> "If we replace the AI vendor tomorrow, how many files change?"

**Answer after F-12: one new adapter folder (`lib/adapters/<new-vendor>/`) + one
line in `lib/wiring/llm.ts`.** The route, the port, the domain types, the UI, and
every test that uses the Fake are untouched. **PASS.**

🗣 In plain English: swapping AI providers becomes a one-box, one-line job — which
is the whole point of this unit.

---

## 12. Risk Assessment (mandatory)

### Concurrency / race conditions
- **Lazy memoized client (`getApiKey` + memo) under concurrent requests.**
  Severity: LOW. The memo is a module-level `let` set on first call; a race
  could construct the client twice but both are equivalent and the last wins —
  no correctness impact (same as the shipped F-TD-04 Supabase lazy client, which
  has the identical pattern). Mitigation: accept it; mirror F-TD-04 exactly.
  **Must-fix: NO.**

### Security
- **`ANTHROPIC_API_KEY` handling.** Severity: LOW. The key moves from route to
  adapter and is read lazily in wiring — strictly an improvement (no eager read,
  no key in the route layer). No key is logged. Mitigation: confirm the two
  `console.error` lines log only `stop_reason` + message content (they do today),
  never the key. **Must-fix: NO.**
- **No new attack surface.** The route's `x-mfs-user-id` 401 guard and input
  validation are preserved verbatim. **Must-fix: NO.**

### Data migration
- **None.** No DB, no schema, no data movement. The `"none"` sentinel for
  products is preserved verbatim, so the downstream confirm route ("none" → null)
  keeps working unchanged. **Must-fix: NO.**

### Business-logic flaws
- **Behaviour drift via a stray prompt/schema edit** is the ONE real risk.
  Severity: MEDIUM if it happened. The whole unit's value is byte-identical AI
  behaviour; a reformatted prompt or a changed tool field would silently change
  AI output. Mitigation: copy the ~250 lines VERBATIM (no reflow, no rename); the
  adapter unit tests assert `model`, `max_tokens`, `tool_choice.name`, the tools
  array, and the user-message template exactly; a diff-review of the moved
  prompts is required at code-critic. **Must-fix: NO** (mitigated by tests +
  verbatim-copy discipline) — but flag to the implementer as the #1 thing to get
  right.
- **502 message mismatch.** Severity: LOW. The user-facing 502 text
  (`… — please try again`) is longer than the default `LLMExtractionError.message`
  (`AI did not return structured data`). The route, not the error, supplies the
  full 502 string. Mitigation: the route test asserts the exact 502 body.
  **Must-fix: NO.**

### Launch blockers
- **`.eslintrc.json` restate-not-merge trap.** Severity: MEDIUM if missed —
  forgetting to add `@anthropic-ai/sdk` to the SERVICES OVERRIDE `paths` block
  (only adding it to the base block) would leave services able to import the SDK,
  and the disk-loaded pin would catch it as a test failure (good) — but it's the
  exact trap F-10 hit. Mitigation: Step 5 explicitly edits BOTH blocks; the
  disk-loaded pin proves it. **Must-fix: NO** (caught by the pin), but called out
  as the known trap.
- **Forbidden-message byte drift across the three mirrors.** Severity: LOW. The
  message must be byte-identical in `.eslintrc.json`, the hermetic mirror, and
  the disk pin. Mitigation: Section "Step 5" gives the single canonical string;
  the disk pin asserts it verbatim. **Must-fix: NO.**

**Headline: NO must-fix risks. Gate 2 is not blocked by risk.** The single item
to watch is verbatim-copy of the prompts/schemas (business-logic drift),
mitigated by the verbatim discipline + adapter unit assertions + a prompt-diff
review at code-critic.

---

## 13. Edge cases / implementer notes

- **SDK 0.39 surface (confirmed installed):** `Anthropic.Tool`,
  `Anthropic.ToolUseBlock`, `client.messages.create({...})`,
  `message.content.find(b => b.type === 'tool_use')`, `toolBlock.input` all exist
  in 0.39 — copy the route's exact usage. Do NOT use `output_config.format`
  (post-0.39). 🗣 The exact AI-library calls already in the route work as-is in
  the installed version; just move them.
- **`tool_use` typing:** keep the route's
  `message.content.find((b) => b.type === 'tool_use') as Anthropic.ToolUseBlock | undefined`
  pattern inside the adapter.
- **Vendor types stay inside the adapter:** `Anthropic.Tool` /
  `Anthropic.ToolUseBlock` may appear ONLY in
  `lib/adapters/anthropic/LLMExtractor.ts`. The methods return domain types.
- **`raw_text.trim()`** — the route currently trims when building the user
  message AND validates `raw_text?.trim()` for the 400. Keep the 400 validation
  in the route (input validation is a route concern); the trim used in the
  message-build moves into the adapter's `run` helper. Net behaviour: identical
  string sent to the AI.
- **Barrel value vs type export:** `LLMExtractionError` is a class (runtime
  value) → `export { LLMExtractionError }`; `LLMExtractor` is an interface →
  `export type { LLMExtractor }`. Mixing these up is a `tsc` error under
  `isolatedModules`.
- **Fake in `lib/adapters/fake/`** imports zero SDKs (consistent with the other
  fakes) — so it is NOT subject to the anthropic lint rule and needs no override
  entry.
