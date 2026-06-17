# F-11 — Mailer port + Resend adapter

- **Date:** 2026-06-17
- **Unit:** F-11 (FORGE)
- **Author:** forge-planner
- **Spec status:** locked at FORGE Gate 1 (do not expand scope)

## Mini-map (the shape after this unit)

```
DOMAIN (core logic)
  └─ Mailer (port, NEW) → [Resend]  (adapter, NEW)
                        → [Fake]    (test double, NEW)
🗣 put the email vendor behind a socket — swap Resend = one new plug + one wiring line; the 3 email helpers never change
```

🗣 **In plain English:** Today the three email-sending files reach straight for the
Resend SDK (`await import('resend')`). We're slipping an app-owned "send an email"
socket between them and Resend, so the vendor lives in exactly one box. The email
copy (the big HTML) and the recipient-fetch stay exactly where they are — locked
out of scope.

---

## Goal

Put the Resend email SDK behind an app-owned `Mailer` port, following the
hexagonal rules in `CLAUDE.md` (`## Non-negotiable architecture`) and ADR-0002.
Re-point the three email helpers so their **send call** goes through the port
instead of importing `resend` directly. Behaviour must be **byte-identical** —
same `from`, same recipients, same HTML, same silent-skip-when-no-key, same
console.log output.

🗣 **In plain English:** This is a plumbing-only change. The user must not be able
to tell anything happened — same emails, same recipients, same logs. The only
difference is *where* the Resend SDK is imported (one folder now, instead of three
helpers). It clears a real architecture breach: Resend is currently imported
outside an adapter, which the rules forbid.

---

## Domain terms (with plain-English bridges)

- **Mailer (port)** — `lib/ports/Mailer.ts`, a new interface the app owns: "send
  this email message; tell me the id or that it was skipped."
  🗣 The socket the business logic insists on. Resend has to fit *it*, not the
  other way round.
- **Resend adapter** — `lib/adapters/resend/Mailer.ts`, the only file allowed to
  `import { Resend } from 'resend'`. Maps Resend's send response/errors to our
  owned result type.
  🗣 The actual plug for Resend. The one box where the vendor lives.
- **Fake Mailer** — `lib/adapters/fake/Mailer.ts`, an in-memory test double that
  records the messages it was "sent" so unit tests can assert "send was called
  with X" without hitting the real Resend API.
  🗣 A pretend plug for tests — it remembers what you sent so a test can check it,
  and never touches the network or costs money.
- **Wiring / composition root** — `lib/wiring/mailer.ts`, the one business-layer
  file allowed to import the adapter and hand back a ready-to-use `mailer`
  singleton.
  🗣 The parts list. It bolts the Resend plug into the socket. Swap vendors = edit
  this one file.
- **`EmailMessage` / `SendResult`** — owned input/output types defined on the port.
  🗣 Our own shapes for "an email to send" and "what came back." Resend's shapes
  never leak past the adapter, so the helpers never learn a vendor's vocabulary.

---

## Compliance / architecture flags

- **Hexagonal dependency rule (CLAUDE.md "Blockers"):** the three helpers
  currently `await import('resend')` — a **vendor SDK imported outside
  `lib/adapters/<vendor>/`**. That is a live breach of the non-negotiable rule.
  F-11 **clears** it. This is the architectural point of the unit.
  🗣 Right now Resend is plugged in three places it shouldn't be. After F-11 it's
  in one allowed box and nowhere else.
- **No new dependency:** `resend: ^6.9.4` is already in `package.json` (line 46).
  F-11 adds **zero** new `package.json` entries. Justification requirement: N/A
  (no new dep).
  🗣 We're not buying anything new — just moving where the thing we already own
  gets used.
- **Single-use-vendor wrapper rule:** `resend` is imported in exactly 3 files
  today; after F-11 it's imported in exactly 1 (`lib/adapters/resend/Mailer.ts`).
  The wrapper rule ("single-use vendor libraries must sit behind an owned
  `lib/adapters/<vendor>/` wrapper") is **satisfied** by this unit.
  🗣 One vendor, one box — exactly what the rule wants.

## ADR conflicts / new-ADR question

- **No new ADR required.** ADR-0002 already names this exact case. Its "Folder
  layout" paragraph lists `lib/adapters/resend/` verbatim, and its "dependency
  rule" paragraph lists `resend` verbatim as a vendor SDK that belongs inside
  `lib/adapters/**` and nowhere else. ADR-0002's Context even calls out "three
  email helpers" as a known breach. F-11 is the *execution* of an already-accepted
  decision.
  🗣 The decision to put Resend behind an adapter was already written down in
  June. We're not deciding anything new — we're doing the thing the ADR said to do.
- **No conflict** with ADR-0003 (Supabase freeze) or ADR-0004 (RLS) — F-11 does
  not touch Supabase or RLS. The raw Supabase REST recipient-fetch inside each
  helper is **explicitly out of scope** (deferred to F-15 / F-17).

---

## Precedent to copy — F-12 (Anthropic / LLMExtractor)

F-12 is a near-exact structural twin: a single-use vendor (`@anthropic-ai/sdk`)
put behind a port (`LLMExtractor`), with a factory adapter, a lazy key read, a
Fake double, a wiring singleton, and an ESLint ban. **Copy its shape.** Key files
to mirror:

- Port: `lib/ports/LLMExtractor.ts`
- Adapter: `lib/adapters/anthropic/LLMExtractor.ts` + `lib/adapters/anthropic/index.ts`
- Fake: `lib/adapters/fake/LLMExtractor.ts`
- Wiring: `lib/wiring/llm.ts` (lazy `getApiKey: () => process.env.ANTHROPIC_API_KEY`)
- ESLint ban + barrel export pattern.

🗣 **In plain English:** We've done this exact move before, last week, for the AI
vendor. F-11 is the same recipe with "email" swapped for "AI." Follow the F-12
files step-for-step and the risk drops sharply.

---

## Design decisions (locked before implementation)

### D1 — `from` is a per-message field on `EmailMessage`, NOT an adapter default

The constant `FROM = 'MFS Operations <notifications@mfsglobal.co.uk>'` appears
identically in all three helpers. **Decision: keep it a per-message field** — each
helper passes `from` in the `EmailMessage` it builds; the port carries it; the
adapter forwards it to Resend unchanged.

**Why:** (1) Byte-identical behaviour is the prime invariant — the helpers already
own this string; passing it through changes nothing observable. (2) It keeps the
port vendor-neutral and the adapter dumb (no app-policy constant baked into the
Resend box). (3) It's the minimal diff: each helper keeps its `const FROM` and
adds it to the message object. An adapter-default would *move* the constant into
the vendor box, mixing app policy into the adapter and making the adapter aware of
*this app's* sender identity — the wrong direction. (4) Future-proof: if a second
sender address is ever needed, the port already supports it with no adapter edit.

🗣 **In plain English:** The "from" address is a business choice, not a Resend
detail — so it rides along on each message rather than being hard-coded inside the
Resend box. Cleaner, and it keeps the diff tiny.

### D2 — "no key → skip" lives as a **guard in the adapter**, returning a `skipped` result; the wiring always wires the real Resend adapter

The spec offers two options: (a) a no-op Mailer wired when the key is absent, or
(b) a guard. **Decision: guard inside the adapter.** The adapter reads the key
lazily (per F-12 / F-TD-04 lazy-client lesson); on `send()`, if the key is absent
it returns `{ skipped: true, reason: 'no-api-key' }` **without** constructing the
Resend client or calling the network. The wiring always wires the single real
Resend adapter — no branching in the composition root.

**Why not a no-op adapter wired at startup (option a):**
- The current skip decision is made **per call at request time** (`if (!RESEND_KEY)
  return`), reading `process.env` live. A startup-time wiring branch would read the
  key once at module load — a **behaviour change** (the key could be set after cold
  start in some deploys; the current code re-reads every call). Lazy per-call guard
  preserves today's exact semantics.
- One wiring line, one adapter, no conditional in the composition root keeps the
  rip-out test clean (swap vendor = 1 adapter + 1 line; no "which adapter?" fork).
- A no-op adapter would be a *second* Mailer implementation to maintain and wire-
  switch; the guard is one branch in the one adapter.

**Console.log parity:** today each helper prints its **own** skip line
(`[compliment-email] RESEND_API_KEY not set — skipping`, etc.) *before* doing
anything else, then returns. To preserve byte-identical logs **the helper keeps
its own early-return skip check and its own console.log** — see D3. The adapter's
internal `skipped` result is a belt-and-braces second guard (defence in depth) and
is **not** relied on for the user-visible log. (If the helper's guard and the
adapter's guard ever disagree, the helper's wins for logging — they read the same
env var so they won't.)

🗣 **In plain English:** "If there's no API key, quietly do nothing" stays true. We
check the key *each time we try to send* (exactly like today), not once at boot —
so nothing about timing changes. And the familiar "not set — skipping" log line
stays printed by each helper, word for word.

### D3 — keep each helper's existing skip check + console.log lines verbatim

Each helper retains: its `const RESEND_KEY`, its `if (!RESEND_KEY) { console.log(...); return }`
early return, its recipient fetch, its "no recipients" skip log, and its final
`console.log('... sent ... ', result?.data?.id)` line. The **only** lines that
change inside each helper:

- DELETE: `const { Resend } = await import('resend')` and `const resend = new Resend(RESEND_KEY)`
- ADD at top: `import { mailer } from '@/lib/wiring/mailer'`
- REPLACE: `const result = await resend.emails.send({ from: FROM, to: recipients, subject, html })`
  with `const result = await mailer.send({ from: FROM, to: recipients, subject, html })`
- The final log changes from `result?.data?.id` to `result.id` (the owned
  `SendResult` exposes `id?: string` directly — see port signature). This is a
  **deliberate, noted equivalent**: same value, flatter shape. Document it in the
  helper as a one-line comment.

🗣 **In plain English:** Inside each helper we only swap the two Resend lines for
one Mailer line. Everything else — the skip log, the recipient fetch, the "sent to
N people" log — stays exactly as is. The one cosmetic change: the log reads the
id off our own result shape instead of Resend's nested shape; same id value.

### D4 — a Fake Mailer **is** needed

Add `lib/adapters/fake/Mailer.ts` (mirrors `lib/adapters/fake/LLMExtractor.ts`).
It records every `EmailMessage` passed to `send()` in an array and returns a
configurable `SendResult` (default `{ id: 'fake-email-id' }`, or `{ skipped: true }`
when seeded). This lets unit tests assert the helpers call `mailer.send` with the
right `from`/`to`/`subject`/`html` **without** importing Resend or hitting the
network. Export it from `lib/adapters/fake/index.ts`.

🗣 **In plain English:** Yes — we need a pretend mailer for tests so we can prove
"the helper asked to send an email to these people with this subject" without ever
calling the real Resend (which costs money and needs a live key).

---

## Port interface (spelled out — implement exactly)

`lib/ports/Mailer.ts` — pure TypeScript, **no framework import, no vendor import,
no `resend` types**:

```ts
/**
 * lib/ports/Mailer.ts
 *
 * The Mailer port — the app's own socket for "send this email". The email
 * vendor (currently Resend) plugs in behind it via an adapter; the email
 * helpers never see the vendor. (F-11)
 *
 * Pure TypeScript: no vendor import, no framework import. Resend types
 * (CreateEmailResponse, etc.) never appear here — they stay inside the
 * adapter, which maps them into the owned SendResult below.
 */

/** An email to send — owned input shape, vendor-neutral. */
export interface EmailMessage {
  /** Sender, e.g. 'MFS Operations <notifications@mfsglobal.co.uk>'. Per-message (D1). */
  from: string;
  /** Recipient addresses. */
  to: string[];
  subject: string;
  html: string;
}

/** Result of a send — owned output shape. Carries enough to preserve today's log. */
export interface SendResult {
  /** Provider message id when the email was dispatched; undefined when skipped. */
  id?: string;
  /** True when the send was deliberately skipped (e.g. no API key configured). */
  skipped?: boolean;
  /** Machine-readable skip reason, present only when skipped is true. */
  reason?: string;
}

export interface Mailer {
  /**
   * Send one email. Never throws for a "no key configured" condition — returns
   * { skipped: true } instead (mirrors today's silent-skip). Transport errors
   * from the provider propagate as a rejected promise (today's behaviour: the
   * helper's caller wraps the send in try/catch).
   */
  send(message: EmailMessage): Promise<SendResult>;
}
```

Add to `lib/ports/index.ts`:
```ts
export type { Mailer, EmailMessage, SendResult } from "./Mailer";
```

🗣 **In plain English:** The port says exactly two things: here's what an email
looks like (`EmailMessage`), and here's what you get back (`SendResult` — an id, or
a "skipped" flag). Nothing Resend-shaped appears here, so the helpers stay
vendor-blind. `send` only *rejects* on a real transport failure — a missing key is
a calm "skipped," matching today.

### Note on the "depth rule" (ADR-0002)

`send()` is intentionally a single method that mirrors one vendor call. This is
acceptable here because the port's job is a genuine business operation ("notify
people by email") and the adapter hides a real decision: vendor-response mapping,
the missing-key guard, and lazy client construction. It is **not** a 1:1 leak of
`resend.emails.send` — the input/output types are owned and the client lifecycle is
hidden. (Compare: `PasswordHasher.hash/compare` and `LLMExtractor` are similarly
thin and were accepted.)

🗣 **In plain English:** The reviewer's "don't just rename a vendor call" rule is
satisfied — the adapter does real work (maps the response, handles the no-key case,
manages the client), it isn't a paper-thin pass-through.

---

## Adapter (spelled out)

`lib/adapters/resend/Mailer.ts` — the **only** file importing `resend`:

- Factory `createResendMailer(deps: { getApiKey: () => string | undefined }): Mailer`
  (mirrors `createAnthropicLLMExtractor`).
- Lazy memoized client: build `new Resend(key)` on first send that has a key
  (mirrors F-12 / F-TD-04 lazy-client).
- `send(message)`:
  - `const key = deps.getApiKey()`; if falsy → `return { skipped: true, reason: 'no-api-key' }`
    (no client constructed, no network).
  - else `const res = await client.emails.send({ from, to, subject, html })`.
  - Map Resend's `CreateEmailResponse` (`{ data: { id } | null, error: ErrorResponse | null }`)
    to owned `SendResult`: `return { id: res.data?.id }`. **Confirmed shape**:
    `CreateEmailResponseSuccess = { id: string }`, response is `{ data, error }`
    (verified against `node_modules/resend/dist/index.d.cts` lines 346–350).
  - Resend's `error` field / vendor types must **not** cross the boundary; if a
    transport error is thrown by the SDK it propagates (today's helpers don't
    inspect `result.error`, so neither do we — byte-identical).

`lib/adapters/resend/index.ts` — barrel, factory only:
```ts
export { createResendMailer } from "./Mailer";
```

🗣 **In plain English:** The Resend box: read the key when you actually send; no
key → say "skipped"; otherwise call Resend and hand back just the id in our own
shape. Resend's own response object never escapes this file.

## Fake adapter (spelled out)

`lib/adapters/fake/Mailer.ts` — no SDK import, pure JS (mirrors fake LLMExtractor):

- `createFakeMailer(seed?: { result?: SendResult }): Mailer & { readonly sent: EmailMessage[] }`
  — records each message in `sent`, returns `seed?.result ?? { id: 'fake-email-id' }`.
- Export `fakeMailer` singleton for symmetry.
- Add to `lib/adapters/fake/index.ts`.

🗣 **In plain English:** A stand-in mailer for tests that just writes down what it
was asked to send.

## Wiring (spelled out)

`lib/wiring/mailer.ts` (mirrors `lib/wiring/llm.ts` exactly):
```ts
import { createResendMailer } from "@/lib/adapters/resend";
import type { Mailer } from "@/lib/ports";

export const mailer: Mailer = createResendMailer({
  getApiKey: () => process.env.RESEND_API_KEY,
});
```
Lazy key read — no env read or network at import time.

🗣 **In plain English:** The one-line parts list: plug the Resend box into the
Mailer socket and hand the app a ready `mailer`. Swap email vendors later = change
the import on line 1 and the factory call. That's the whole rip-out.

---

## ESLint ban (must be added — F-11 closes the breach)

Add `resend` to **both** `paths` arrays in `.eslintrc.json` (the top-level `rules`
block AND the `lib/services/**` + `lib/usecases/**` override block — they don't
merge; both must list it, per the F-TD-11 lesson in the lint test header), and add
`lib/adapters/resend/**/*.ts` to the `overrides[0].files` allow-list (alongside
`lib/adapters/supabase/**`, `bcrypt`, `anthropic`).

New `paths` entry (both blocks, identical message):
```json
{
  "name": "resend",
  "message": "Use the Mailer port via @/lib/wiring/mailer. resend may only be imported inside lib/adapters/resend/. See ADR-0002 / F-11."
}
```

🗣 **In plain English:** We tell the linter "Resend may only be imported inside the
Resend box." This is what makes the breach un-reintroducible — any future helper
that reaches for Resend directly fails the build.

---

## Exact file list

### New files (6)
1. `lib/ports/Mailer.ts` — the port (interface + `EmailMessage` + `SendResult`).
2. `lib/adapters/resend/Mailer.ts` — Resend adapter (only `resend` importer).
3. `lib/adapters/resend/index.ts` — barrel (factory export).
4. `lib/adapters/fake/Mailer.ts` — Fake Mailer test double.
5. `lib/wiring/mailer.ts` — composition root singleton.
6. *(tests — see test plan; new test files under `tests/unit/`)*

### Modified files (7)
1. `lib/ports/index.ts` — add `export type { Mailer, EmailMessage, SendResult }`.
2. `lib/adapters/fake/index.ts` — export `createFakeMailer`, `fakeMailer`.
3. `.eslintrc.json` — add `resend` ban (both blocks) + adapter allow-list entry.
4. `lib/compliment-email.ts` — swap the 2 Resend lines for the Mailer port (D3);
   keep `FROM`, skip check, fetch, logs.
5. `lib/complaint-email.ts` — same swap (D3).
6. `lib/pricing-email.ts` — same swap (D3).
7. `tests/unit/lint/no-adapter-imports.test.ts` — add cases for the `resend` ban
   (mirrors the F-10/F-12 case blocks: banned in services/routes, allowed in
   `lib/adapters/resend/`, verbatim message text). This is the **drift-catcher**
   pin and is required by the existing test's pattern.

### Explicitly NOT touched (out of scope — locked at Gate 1)
- The raw Supabase REST recipient-fetch in each helper — **leave verbatim** (F-15 /
  F-17).
- All `buildEmail` / `esc` / HTML-string code in each helper — **leave verbatim**.
- `app/api/screen2/note/route.ts` (and the other 4 consuming routes:
  `screen2/resolve`, `screen2/sync`, `compliments`, `pricing/[id]`) — they call the
  helper, never Resend, so they **compile unchanged**. Verify, don't edit.

🗣 **In plain English:** Six new files, seven edits. The edits to the three email
helpers are tiny (two lines out, one line in). Everything risky — the email copy,
the recipient lookup, the routes — is left untouched on purpose.

---

## Numbered implementation steps (TDD order)

1. **Write the port** `lib/ports/Mailer.ts` (signature above). Add to
   `lib/ports/index.ts`. — *no test yet; types only.*
2. **Write a failing Fake-driven adapter contract test** (red): a unit test that,
   given a `createFakeMailer`, asserts `send` records the message and returns the
   seeded result. Then **write** `lib/adapters/fake/Mailer.ts` + barrel export to
   make it pass (green).
3. **Write a failing Resend-adapter test** (red) using a mocked `resend` module
   (vitest `vi.mock('resend')`): (a) with a key, `send` calls `emails.send` with
   the exact `{from,to,subject,html}` and maps `{data:{id}}` → `{id}`; (b) with no
   key (`getApiKey` returns undefined), `send` returns `{skipped:true,
   reason:'no-api-key'}` and **never constructs the client / never calls
   `emails.send`**. Then **write** `lib/adapters/resend/Mailer.ts` + barrel to make
   it pass (green). **Never hit real Resend.**
4. **Write the wiring** `lib/wiring/mailer.ts`. Unit test: importing the module
   reads no env and makes no network call at import time (mirror any existing
   wiring import-purity assertion if present; otherwise assert the singleton is a
   `Mailer` with a `send` function).
5. **Add the ESLint ban** to `.eslintrc.json` (both blocks + allow-list). Extend
   `tests/unit/lint/no-adapter-imports.test.ts` with the `resend` cases (banned in
   `lib/services`, banned in `app/api`, allowed in `lib/adapters/resend`, verbatim
   message). Run the lint pin — green.
6. **Re-point `lib/compliment-email.ts`** per D3 (import `mailer`; delete the two
   Resend lines; replace send; `result.id`). Add/keep a helper-level unit test that
   injects... — note: the helpers currently read `mailer` from the wiring singleton
   directly (no DI). To unit-test the send call, the cleanest minimal approach is
   `vi.mock('@/lib/wiring/mailer')` returning a fake, then assert `mailer.send` was
   called with the right message and that the no-key skip path still early-returns
   and logs. (Do **not** refactor the helpers to take an injected mailer — that
   would expand scope beyond the locked spec.)
7. **Re-point `lib/complaint-email.ts`** per D3. Mirror the helper test for the
   three event types (new/resolved/note) — assert the message passed to
   `mailer.send` is byte-identical to today's `{from, to, subject, html}`.
8. **Re-point `lib/pricing-email.ts`** per D3. Mirror the helper test.
9. **Full regression:** run `npm run lint` (the new ban must pass and the helpers
   must no longer trip it), `npm run test:unit`. Confirm the 5 consuming routes
   still type-check (`tsc`/`next build` path) with no edits.

🗣 **In plain English:** Build the socket first, then the pretend plug, then the
real Resend plug (test-driven, with Resend mocked), then the parts list, then lock
the rule with the linter, then swap the two lines in each of the three helpers —
testing each as we go. Nothing calls the real Resend at any point in the tests.

---

## Test plan / matrix hint for ANVIL

**No DB / no RLS surface in this unit.** Email send is **mocked** — never hit real
Resend. No integration-DB or pgTAP work is required by F-11 itself.

| Layer | What to cover |
|---|---|
| Unit — port/fake | Fake Mailer records messages; returns seeded/ default result. |
| Unit — adapter (key present) | `send` calls Resend `emails.send` with exact `{from,to,subject,html}`; maps `{data:{id}}`→`{id}`; no vendor type leaks. |
| Unit — adapter (no key) | `send` returns `{skipped:true,reason:'no-api-key'}`; client never constructed; network never called. |
| Unit — wiring | import is side-effect-free (no env read / no network at module load); singleton is a `Mailer`. |
| Unit — lint pin | `resend` banned in `lib/services` + `app/api`, allowed in `lib/adapters/resend`, verbatim message (extend `no-adapter-imports.test.ts`). |
| Unit — each helper (×3) | With key: `mailer.send` called once with byte-identical message; final log uses `result.id`. No key: early-return + existing skip `console.log`, `mailer.send` NOT called. No recipients: existing "no recipients" skip path unchanged. |
| Integration / E2E | None required (no new route, no DB surface). Existing route suites should stay green since the helpers' external contract is unchanged. |

🗣 **In plain English:** All tests are fast unit tests with Resend faked out. We
prove the helper still tries to send the same email to the same people, still stays
quiet when there's no key, and that Resend can only be imported in its one box.

---

## Acceptance criteria

1. `resend` is imported in **exactly one** file: `lib/adapters/resend/Mailer.ts`.
   (`grep -rln "from 'resend'\|import('resend')" lib app` returns only that file.)
2. The three helpers no longer contain `await import('resend')` or `new Resend(`.
3. `npm run lint` passes; the new `resend` ban is active and the helpers don't trip
   it; the lint pin test asserts the ban verbatim.
4. `npm run test:unit` green, including the new adapter/fake/wiring/helper tests.
5. Behaviour byte-identical: same `from`, same recipient sets (fetch untouched),
   same HTML (builders untouched), same silent-skip-when-no-key, same skip/sent
   console.log lines (final log id value unchanged; shape `result.id`).
6. **Rip-out test:** swapping the email vendor = 1 new adapter folder
   (`lib/adapters/<vendor>/`) + 1 edited line in `lib/wiring/mailer.ts`. Nothing in
   the helpers, ports, domain, routes, or UI changes.
7. Zero new `package.json` entries.
8. The 5 consuming routes compile unchanged.

🗣 **In plain English:** Done means: Resend lives in one box, the linter enforces
it, every test passes, the emails are identical, and swapping email vendors later
is a two-line job.

---

## Risk Assessment

Scope is a plumbing relocation with a hard byte-identical invariant and no DB/RLS
surface. Risks are correspondingly contained, but a few are real.

### Concurrency / race conditions
- **Lazy memoized client across concurrent sends — LOW.** The adapter memoizes the
  Resend client on first send. Concurrent first-calls could each construct a client
  (a benign double-construct, last wins); no shared mutable state is corrupted and
  Resend clients are stateless HTTP wrappers. F-12's identical pattern shipped
  without issue.
  - **Mitigation:** mirror F-12's simple `if (!client) client = new Resend(...)`;
    no locking needed.
  - **Must-fix:** No.
  🗣 Two emails firing at once might each build a Resend client the very first time
  — harmless, same as the AI adapter we already ship.

### Security
- **Service-role key / secrets — N/A here, LOW.** F-11 does not touch the Supabase
  service-role recipient fetch (out of scope) and does not log the API key. The
  adapter reads `RESEND_API_KEY` lazily and never logs it.
  - **Mitigation:** confirm no `console.log` prints the key; keep the fetch verbatim.
  - **Must-fix:** No.
- **Vendor-type leak — LOW.** Resend's `error`/response types must not cross the
  port. The mapping `{ id: res.data?.id }` is the only thing returned.
  - **Mitigation:** adapter returns owned `SendResult` only; lint + the "no vendor
    import in ports" rule enforce it.
  - **Must-fix:** No.
  🗣 No secret gets logged and Resend's own data shapes can't escape the box.

### Data migration
- **None — N/A.** No schema change, no migration, no data backfill. Email is a
  side-effect, not stored by this unit.
  - **Must-fix:** No.
  🗣 Nothing in the database changes.

### Business-logic flaws (the real watch-items)
- **Console.log drift — MEDIUM.** The invariant is byte-identical logs. The final
  log changes from `result?.data?.id` to `result.id` (D3) — same *value*, and the
  optional chaining is preserved (`result.id` is `string | undefined`). The skip
  log and "no recipients" log are kept verbatim. Risk: an implementer "tidies" a
  log string and breaks parity.
  - **Mitigation:** D3 enumerates every line that may change; helper unit tests
    assert the skip log fires and `mailer.send` is/ isn't called; code review
    diffs the log strings character-for-character.
  - **Must-fix:** No (covered by tests + explicit D3 enumeration).
- **`from` accidentally dropped or defaulted — MEDIUM.** If an implementer follows
  the "adapter default" path instead of D1, a wrong/blank `from` could ship.
  - **Mitigation:** D1 locks `from` as a per-message field; helper tests assert the
    exact `from` string in the message passed to `mailer.send`.
  - **Must-fix:** No.
- **Skip semantics moved to import-time — MEDIUM.** If an implementer wires a no-op
  adapter at startup (option a) instead of the lazy guard (D2), the no-key decision
  shifts from per-request to per-cold-start — a behaviour change.
  - **Mitigation:** D2 locks the lazy per-call guard; the helper keeps its own
    per-call skip check; adapter test asserts no-key path constructs no client.
  - **Must-fix:** No.
  🗣 The two things that could silently change the emails — the "from" line and the
  "stay quiet with no key" timing — are pinned by explicit decisions and tests.

### Launch blockers
- **ESLint two-block restatement — MEDIUM (process trap, not runtime).** The
  `.eslintrc.json` override blocks do **not** merge; `resend` must be added to the
  top-level `paths` AND the services/usecases override `paths`, and
  `lib/adapters/resend/**` added to the allow-list. Miss one and either the breach
  isn't fully closed or the adapter itself fails lint.
  - **Mitigation:** step 5 spells out both blocks; the extended lint pin test
    asserts banned-in-services, banned-in-routes, allowed-in-adapter, verbatim
    message — it fails if any block is missed.
  - **Must-fix:** No (the pin test catches it before merge).
- **`next build` ignores ESLint — LOW.** As the lint-test header notes, `next
  build` skips ESLint, so the breach-closure relies on the **unit-suite lint pin**,
  not the build. That pin is mandatory (file 7).
  - **Mitigation:** include the lint pin cases; they run in the hard-gated unit
    suite.
  - **Must-fix:** No.
  🗣 The only real gotcha is a config that has to be edited in two places — and we
  have a test that fails loudly if you edit only one.

### Risk headline
**No must-fix risks.** All risks are LOW/MEDIUM and covered by explicit locked
decisions (D1–D4) plus the test matrix. The two highest-attention items —
console.log parity and the two-block ESLint restatement — are each pinned by a
named test. **Gate 2 is not blocked on risk.**

🗣 **In plain English:** Nothing here is a stop-the-line risk. The handful of "be
careful" items are all caught by tests, so this is safe to proceed to build.

---

## Hexagonal verdict (computed — for Gate 2)

- **Port used/added:** **ADDS** a new port `Mailer` (`lib/ports/Mailer.ts`) — the
  app-owned "send an email" socket. (Owned types `EmailMessage`, `SendResult`.)
- **Adapter implementing it:** **NEW** `lib/adapters/resend/Mailer.ts`
  (`createResendMailer`) — the sole `resend` importer; plus a **NEW** Fake double
  `lib/adapters/fake/Mailer.ts`. Wired in **NEW** `lib/wiring/mailer.ts`.
- **New dependencies:** **NONE.** `resend@^6.9.4` already in `package.json`. No new
  `package.json` entry → no justification needed. Single-use-vendor wrapper rule:
  **satisfied** (Resend imported in exactly one adapter file after this unit).
- **Rip-out test:** **PASS.** After F-11, swapping the email vendor = 1 new adapter
  folder + 1 edited line in `lib/wiring/mailer.ts`; helpers, ports, domain, routes,
  UI unchanged. (Before F-11: 3 files import Resend directly → FAIL. F-11 is the
  fix.)

🗣 **In plain English:** One socket, one Resend plug, one parts-list line, nothing
new bought. Swapping email vendors later changes exactly two lines. The rip-out
test passes — which is the whole reason this unit exists.
