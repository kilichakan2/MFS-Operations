# F-27 — Vendor-fence teeth (self-enforcing hexagonal lint guard)

**Date:** 2026-06-27
**Sprint day:** Day 16 ("seal + close")
**Type:** CONFIG + TEST-ONLY. No application runtime code, no migration, no RLS, no new dependency.
**Spec status:** Locked at FORGE Gate 1 — the three deliverables below are fixed.

---

## Mini-map

```
DOMAIN (core logic) — UNCHANGED by F-27
  ├─ (every existing port/adapter pair stays exactly as-is)
  └─ ENFORCEMENT LAYER (this unit) — config + tests that GUARD the fence
       ├─ .eslintrc.json        ← add @capacitor/{core,android} to both ban blocks
       ├─ vendor-fence-complete.test.ts   ← every runtime dep must be fenced OR allow-listed
       └─ no-disable-arch-rules.test.ts   ← nobody may eslint-disable the Lego rules
🗣 F-27 doesn't add a plug or a socket — it bolts the fence shut so future plugs can't bypass it.
```

**🗣 In plain English:** Nothing in the running app changes. We are adding two automated
inspectors (unit tests) plus one extra entry on the existing "vendors must live behind an
adapter" list. The inspectors fail the build if someone later sneaks a vendor in, or tries to
switch the architecture rules off with a comment.

---

## Goal

"The Lego principle gets teeth." The hexagonal vendor-fence — the ESLint `no-restricted-imports`
rule that forces every vendor SDK to sit behind `lib/adapters/<vendor>/` — is already near-complete
and clean today. F-27 makes it **self-enforcing against FUTURE regressions** and adds a guard so the
architecture lint rules can't be silently switched off.

**🗣 In plain English:** Right now the rulebook is good but it relies on a human remembering to add
each new vendor to it. F-27 hires a robot that automatically catches any new vendor that isn't behind
an adapter, and a second robot that catches anyone disabling the rulebook with a code comment.

No ceremony on presentation libraries — UI-only packages (charts, markdown, icons) that talk to no
external service are deliberately NOT fenced; they go on an explicit allow-list with a stated reason.

---

## Domain terms

- **Vendor-fence** — the `no-restricted-imports` ESLint rule banning vendor SDK imports outside their
  adapter folder. **🗣 The list of "you may only touch this brand of Lego inside its own box."**
- **Ban list / `paths` block** — the array of `{ name, message }` entries inside
  `rules["no-restricted-imports"][1].paths`. Each `name` is a banned package. **🗣 The actual roll-call
  of fenced vendors.**
- **Allow-list (test-side)** — a hard-coded set in the new test of packages deliberately NOT fenced
  (framework + pure-UI + build CLI). **🗣 The short list of "these aren't vendors, leave them alone."**
- **Pin test** — a unit test that loads the REAL config/source from disk and fails if a guard is
  weakened or deleted. **🗣 A tripwire on the rulebook itself, so deleting the rule breaks the build.**
- **`@capacitor/core` / `@capacitor/android`** — Capacitor is the native iOS/Android shell bridge.
  **🗣 The glue that lets the web app run as a phone app; if it's ever imported in TypeScript it must
  go behind an adapter like every other vendor.**
- **`@capacitor/cli`** — Capacitor's command-line build tool, run from the terminal, never `import`ed
  in app code. **🗣 A workshop tool, not a part bolted into the product — so it stays off the fence.**

---

## Compliance / ADR check

- **ADR-0002** (`docs/adr/0002-hexagonal-shape-and-naming.md`) — hexagonal naming + dependency rule.
  F-27 strengthens enforcement of ADR-0002; it does not conflict with it.
- **ADR-0003** (Supabase FREEZE rule) — referenced in the existing `@supabase/supabase-js` ban
  message; untouched.
- **No ADR conflicts.** F-27 is purely additive enforcement. **🗣 No past decision is contradicted —
  we are tightening a screw that two ADRs already told us to tighten.**

---

## Frame-verified facts (confirmed against the real tree on 2026-06-27)

1. **Zero `@capacitor/*` imports** in `app/`, `lib/`, `components/`, `hooks/` (`grep` exit 1 = no
   match). The Capacitor entries are therefore **forward-looking defense-in-depth**, not a fix.
2. **`package.json` `dependencies` has exactly 24 entries.** Cross-checked against the ban list:
   - **14 already fenced** (present as `name` in BOTH eslintrc blocks): `@supabase/supabase-js`,
     `bcryptjs`, `@anthropic-ai/sdk`, `resend`, `leaflet`, `leaflet.markercluster`, `react-leaflet`,
     `react-leaflet-cluster`, `jspdf`, `jspdf-autotable`, `xlsx`, `web-push`, `dexie`,
     `dexie-react-hooks`.
   - **2 to be fenced by F-27:** `@capacitor/android`, `@capacitor/core`.
   - **8 deliberately allow-listed:** `react`, `react-dom`, `next` (framework), `zod` (validation
     utility), `recharts`, `react-markdown`, `lucide-react` (pure presentation, no external service),
     `@capacitor/cli` (build CLI).
   - **14 + 2 + 8 = 24.** Every dependency is accounted for. **NO live breach** — after F-27's
     eslintrc edit, every non-allow-listed runtime dep is fenced, so `vendor-fence-complete.test.ts`
     is GREEN on first run.
3. **12 `eslint-disable` lines exist in source** (Frame said 13; the real count is 12 — immaterial,
   none are architecture rules). 11 name `react-hooks/exhaustive-deps`; 1 is a BARE `// eslint-disable`
   with no rule named (`app/cash/page.tsx:732`). **None name `no-restricted-imports` or
   `no-restricted-syntax`**, so `no-disable-arch-rules.test.ts` is GREEN on first run.
   - **Design note for the disable-guard:** the bare disable at `app/cash/page.tsx:732` technically
     disables ALL rules including the architecture ones. The spec scopes the new guard to disables that
     **explicitly NAME** `no-restricted-imports`/`no-restricted-syntax`, so the bare line must NOT trip
     it (otherwise the test is RED on first run, violating the locked spec). Honour the spec: match only
     named-rule disables. (A future hardening to also ban bare disables is BACKLOG-worthy, not F-27.)
4. **`tests/unit/lint/` exists** with three pin tests to mirror: `no-supabase-sdk.test.ts`,
   `no-adapter-imports.test.ts`, `no-cross-service-imports.test.ts`.
5. **`lib/adapters/capacitor/` does not exist yet** — fine. The `overrides[0].files` glob simply
   matches nothing today; it pre-permits a future adapter.

**🗣 In plain English:** I checked the real files. There is no current rule-break to fix — F-27 is a
pure future-proofing guard, exactly as the spec said. Every vendor is already accounted for, and no one
is currently disabling the architecture rules.

---

## Files touched (exhaustive — nothing else)

| File | Action |
|------|--------|
| `.eslintrc.json` | **edit** — add `@capacitor/core` + `@capacitor/android` to both ban blocks; add `lib/adapters/capacitor/**/*.{ts,tsx}` to the adapter allow-list override |
| `tests/unit/lint/vendor-fence-complete.test.ts` | **new** — every runtime dep fenced-or-allow-listed; both ban blocks in sync |
| `tests/unit/lint/no-disable-arch-rules.test.ts` | **new** — no source line disables the architecture rules |

**🗣 In plain English:** Three files: one rulebook tweak, two new inspector tests. That is the entire
blast radius.

---

## Ordered, atomic steps (each commit-sized)

### Step 1 — Edit `.eslintrc.json` (the rulebook)

Make three coordinated edits so the two ban blocks stay in sync (the new sync-test enforces this):

1. **Top-level ban block** (`rules["no-restricted-imports"][1].paths`, currently lines 7–64) — append
   two entries after the `dexie-react-hooks` entry (line 62):
   ```json
   {
     "name": "@capacitor/core",
     "message": "Use a Capacitor port via @/lib/wiring/. @capacitor/core may only be imported inside lib/adapters/capacitor/. See ADR-0002 / F-27."
   },
   {
     "name": "@capacitor/android",
     "message": "Use a Capacitor port via @/lib/wiring/. @capacitor/android may only be imported inside lib/adapters/capacitor/. See ADR-0002 / F-27."
   }
   ```
2. **`lib/services`/`lib/usecases` override ban block** (`overrides[1].rules["no-restricted-imports"][1].paths`,
   currently lines 104–161) — append the SAME two entries after its `dexie-react-hooks` entry
   (line 159), byte-identical messages.
3. **Adapter allow-list override** (`overrides[0].files`, currently lines 81–92) — add
   `"lib/adapters/capacitor/**/*.{ts,tsx}"` to the `files` array (before the `"tests/**"` entry, to
   keep adapter globs grouped). Pre-permits a future Capacitor adapter.

**Constraints:**
- Do **NOT** add `@capacitor/cli` to any ban block — it is a build-time CLI, not an importable runtime
  SDK; it stays allow-listed (and on the test's ALLOWLIST in Step 2).
- Both ban blocks MUST end up with the identical set of `name`s (16 entries each: 14 existing + 2 new).
  The sync assertion in Step 2 fails the build if they drift.

**🗣 In plain English:** Add Capacitor to the "behind an adapter only" list in both places it appears,
and pre-open the gate for a future Capacitor adapter folder. Leave the Capacitor command-line tool
alone.

### Step 2 — Write `tests/unit/lint/vendor-fence-complete.test.ts` (the headline regression guard)

A vitest test using `import { describe, it, expect } from 'vitest'` and node `fs`/`path` to read files
directly (NO new dependency; this is the file-read style, not the ESLint-runtime style of
`no-cross-service-imports.test.ts`). Mirror the doc-comment header style of the existing pin tests.

Logic:
1. Read `package.json`, parse `dependencies` ONLY.
   - **Comment the reasoning:** "`devDependencies` are build/test tooling (eslint, vitest, playwright,
     fake-indexeddb, types, tailwind…) — never runtime vendor SDKs shipped to the user — so they are
     out of scope for the runtime vendor-fence."
2. Define an explicit `ALLOWLIST` (a `Set<string>` or const array) of the 8 non-vendor deps, each with
   a one-word reason comment matching reality:
   ```
   'react'          // framework
   'react-dom'      // framework
   'next'           // framework
   'zod'            // validation
   'recharts'       // presentation
   'react-markdown' // presentation
   'lucide-react'   // presentation
   '@capacitor/cli' // build-tooling (CLI, not an importable runtime SDK)
   ```
3. Read `.eslintrc.json`, parse as JSON, collect the `name` values from the top-level ban block:
   `config.rules["no-restricted-imports"][1].paths.map(p => p.name)`.
   - **The rule value is the array `["error", { paths: [...] }]`** — index `[1]` is the options object,
     `.paths` is the array. This exact path is load-bearing (see Risk R2).
4. **ASSERT (fence completeness):** for every `dependency` NOT in `ALLOWLIST`, it MUST appear in the
   collected ban-list `name`s. Failure message must:
   - Name the offending package, and
   - Tell the dev to EITHER fence it (add a `{name,message}` to `.eslintrc.json` in BOTH blocks + create
     `lib/adapters/<vendor>/`) OR justify it on this test's `ALLOWLIST` with a reason.
5. **ASSERT (block sync):** collect the `name`s from the override block too
   (`config.overrides` → find the entry whose `files` includes `lib/services/**/*.ts` →
   `.rules["no-restricted-imports"][1].paths.map(p => p.name)`), and assert the two `name` SETS are
   equal. Failure message: "vendor fenced in one block but not the other — both `no-restricted-imports`
   `paths` blocks in `.eslintrc.json` must list the same vendors."
   - Locate the override block robustly (e.g. find the override whose `files` array includes the
     `lib/services/**/*.ts` glob) rather than hard-coding `overrides[1]`, so a future reordering of
     overrides doesn't false-red the test.

**Expected first-run result:** GREEN. The 16 fenced names = the 24 deps minus the 8 allow-listed.

**🗣 In plain English:** This test reads the real list of installed packages and the real rulebook,
then proves every shippable vendor is on the fence — and that the two copies of the fence agree. If you
later run `npm install some-vendor-sdk`, this test turns red until you either fence it or write down why
it's safe.

### Step 3 — Write `tests/unit/lint/no-disable-arch-rules.test.ts` (the disable guard)

A vitest test (same import style; `fs`/`path`, optionally a small recursive directory walker — no new
dependency; mirror how existing pin tests walk the tree if they do).

Logic:
1. Recursively collect source files under `app/**`, `lib/**`, `components/**`, `hooks/**` matching
   `.ts`/`.tsx`. EXCLUDE `node_modules`, `tests/**`, `.next/**`.
2. For each file, scan line-by-line for an actual `eslint-disable` **directive comment**
   (`eslint-disable`, `eslint-disable-line`, `eslint-disable-next-line`) that NAMES
   `no-restricted-imports` OR `no-restricted-syntax`.
   - **Scope the match to real directives, not the bare word** (Risk R3): require the `eslint-disable*`
     token to appear inside a comment (`//` or `/* */`) AND be followed (same directive) by a rule list
     containing `no-restricted-imports`/`no-restricted-syntax`. A regex like
     `/eslint-disable(?:-next-line|-line)?[^\n]*\b(no-restricted-imports|no-restricted-syntax)\b/`
     applied to comment text is sufficient. Do NOT match the rule name appearing alone (e.g. in a
     string literal or this very test's own message).
   - **Do NOT flag the bare `// eslint-disable` at `app/cash/page.tsx:732`** — it names no rule, so it
     falls outside the spec's scope (named-rule disables only). This keeps the test GREEN today.
3. **ASSERT zero matches.** Failure message: name the `file:line` and explain the architecture lint
   rules (`no-restricted-imports`, `no-restricted-syntax`) may NEVER be disabled — that is the whole
   point of F-27; if you think you need to, you are bypassing the Lego fence and must go via an adapter
   instead.

**Expected first-run result:** GREEN (the 12 existing disables are all `react-hooks/exhaustive-deps` or
bare; none name an architecture rule).

**🗣 In plain English:** This test reads every source file and fails if anyone has written a comment
that switches off the architecture rules. Today nobody has, so it passes. Tomorrow it stops anyone from
quietly silencing the fence.

### Step 4 — Confirm green (no app code, read-only verification)

Run, in order, and confirm all pass:
1. `npx vitest run tests/unit/lint` — the two new tests + the three existing lint pins all GREEN.
2. `npm run lint` (`next lint`) — the edited `.eslintrc.json` is valid and the tree still lints clean
   (no new violations introduced by the Capacitor entries; there are zero `@capacitor` imports).
3. `npm run typecheck` (`tsc --noEmit`) — the two new `.ts` test files compile.
4. `npm test` (full `vitest run` unit suite) — nothing else regressed (expected ~2713 unit tests, i.e.
   the prior 2711 + the two new lint tests; exact count is informational, not a gate).

**🗣 In plain English:** Run the inspectors and the linter and the type-checker. Everything must be
green on the first try — if it isn't, something in the rulebook edit is off and we stop and look.

---

## TDD test plan

This unit IS test code, so the usual "write the failing test first" maps slightly differently. The two
new tests are themselves the deliverable. To prove each test actually has teeth (not a vacuous green):

- **vendor-fence-complete — completeness teeth:** temporarily (in a scratch edit, NOT committed)
  imagine removing `web-push` from the ban list → the test must go RED naming `web-push`. Imagine
  `npm install stripe` → RED naming `stripe`. Confirm by reasoning/local scratch; revert. The committed
  state is GREEN.
- **vendor-fence-complete — sync teeth:** imagine adding `@capacitor/core` to ONLY the top-level block →
  the sync assertion must go RED. Confirm; the committed state has it in BOTH → GREEN.
- **no-disable-arch-rules — teeth:** imagine adding
  `// eslint-disable-next-line no-restricted-imports` to any source file → RED naming that file:line.
  Confirm; committed state GREEN.
- **Regression net:** full unit suite + `npm run lint` + `tsc` all green (Step 4).

No integration / pgTAP / E2E test changes — see ANVIL right-sizing.

**🗣 In plain English:** Before trusting each inspector, we mentally (or in a throwaway edit) break the
thing it's supposed to catch and confirm it actually goes red — so we know it's a real tripwire, not a
test that always passes.

---

## Acceptance criteria

1. `.eslintrc.json` lists `@capacitor/core` and `@capacitor/android` in BOTH `no-restricted-imports`
   `paths` blocks, with F-27 messages; `@capacitor/cli` is NOT added; `lib/adapters/capacitor/**/*.{ts,tsx}`
   is in the adapter allow-list override.
2. `tests/unit/lint/vendor-fence-complete.test.ts` exists, reads `dependencies` from `package.json`,
   holds the 8-entry ALLOWLIST with reasons, asserts every non-allow-listed dep is fenced, asserts the
   two ban blocks are in sync, and is GREEN.
3. `tests/unit/lint/no-disable-arch-rules.test.ts` exists, scans the four source globs, asserts zero
   architecture-rule disables, and is GREEN.
4. `npx vitest run tests/unit/lint`, `npm run lint`, `npm run typecheck`, and the full unit suite all
   pass.
5. No file outside the three listed is modified. No `package.json` change. No migration. No RLS.

**🗣 In plain English:** Done means: Capacitor is on the fence in both places, the two new inspectors
exist and pass, the whole test suite + linter + type-checker are green, and we touched only three files.

---

## Hexagonal / rip-out check

**N/A — and that is the correct answer here.** F-27 adds no port, no adapter, no vendor wiring, and no
runtime dependency. There is nothing to "rip out." This unit IS the enforcement layer that PROTECTS the
hexagonal boundary for every existing and future vendor.

- **Port used/added:** none.
- **Adapter:** none.
- **New dependencies:** none (the two new test files use only `vitest` + node built-in `fs`/`path`,
  already present).
- **Rip-out test:** N/A (no vendor introduced). The two `@capacitor/*` entries are forward-looking ban
  list additions with zero current importers — they constrain a FUTURE adapter, they don't create one.

**Gate 2 verdict line:** PASS — no port/adapter change, no new dependency, no rip-out exposure; F-27
strengthens the fence rather than reaching through it.

**🗣 In plain English:** The usual "if we swap this vendor, how many files change?" question doesn't
apply — we're not adding a vendor, we're building the guard that keeps every future vendor swap honest.

---

## ANVIL right-sizing (for Gate 3 approval)

This is **config + unit-test-only** with **ZERO runtime, UI, DB, auth, or RLS change**. The test matrix
should be **unit-only**:

- ✅ The 2 new lint pin tests (`vendor-fence-complete`, `no-disable-arch-rules`).
- ✅ Full existing unit suite (`npm test`) — regression net.
- ✅ `npm run lint` — the edited config is valid and the tree still lints clean.
- ✅ `npm run typecheck` — the two new test files compile.
- ❌ NO integration suite (no service/route/DB behaviour changed).
- ❌ NO pgTAP / RLS (no migration, no policy, no SQL).
- ❌ NO E2E / browser sweep (no UI, no user-facing behaviour — zero rendered pixels change).
- ❌ NO preview smoke beyond confirming lint/build pass (nothing deploys differently; the app bundle is
  byte-identical — ESLint config and `tests/**` are not shipped to the user).

**Justification:** the blast radius is the lint config and two test files. `next build` does not run
ESLint (per `next.config.ts`), and tests don't ship — so the user-facing artifact is unchanged. There is
no code path a browser or integration test could exercise that differs from before. Per the project's
"right-size ANVIL to blast radius" rule (MEMORY: `anvil-full-browser-taps`), a no-UI/no-RLS/no-runtime
change does NOT earn integration, pgTAP, or browser-tap coverage. Confirming lint + typecheck + full unit
suite are green is the complete and correct ANVIL.

**🗣 In plain English:** Because nothing the user ever runs is changing — only the rulebook and two
test-only files — the right amount of testing is "run all the unit tests, the linter, and the
type-checker, and make sure they're green." A full browser walkthrough or database tests would be
theatre here; there's nothing new for them to touch.

---

## Risks & mitigations

### R1 — ALLOWLIST drifts out of date (false-green or false-red) · severity: MEDIUM · must-fix: NO
The `vendor-fence-complete` test's hard-coded ALLOWLIST could rot: a future genuinely-vendor package
mistakenly allow-listed (false-green, the fence has a hole) or a new framework/UI util not yet
allow-listed (false-red, build blocked for a safe dep).
- **Mitigation:** every ALLOWLIST entry carries a one-word reason comment (framework / validation /
  presentation / build-tooling), so adding to it is a deliberate, reviewed act with a stated
  justification — exactly the "written justification" CLAUDE.md already demands for deps. The failure
  message is fully actionable ("fence it OR justify it on the ALLOWLIST with a reason"), so a false-red
  is a 30-second, well-signposted fix and a false-green requires someone to consciously write a wrong
  reason in a PR a reviewer sees.
- **Residual:** a reviewer must still reject an unjustified ALLOWLIST addition — this is process, not
  code, but it is the same bar CLAUDE.md sets for all dependency additions.

### R2 — Mis-parsing the array-wrapped rule shape · severity: MEDIUM · must-fix: NO
`.eslintrc.json` stores the rule as `["error", { paths: [...] }]`. Reading
`config.rules["no-restricted-imports"].paths` (forgetting the `[1]`) yields `undefined` and a confusing
crash or vacuous test.
- **Mitigation:** the plan pins the exact access path: top-level
  `config.rules["no-restricted-imports"][1].paths`; override
  `<servicesOverride>.rules["no-restricted-imports"][1].paths`. The existing
  `no-cross-service-imports.test.ts` confirms this `["error", {…}]` shape is real. The TDD "sync teeth"
  and "completeness teeth" checks (mentally breaking the config) will immediately expose a wrong path as
  a vacuous/crashing test before commit.

### R3 — Disable-guard regex over-matches · severity: MEDIUM · must-fix: NO
A naive search for the substring `no-restricted-imports` would match the rule name appearing in a
string literal, a code comment discussing the rule, or even the new test's OWN message text — producing
false reds.
- **Mitigation:** scope the match to an actual `eslint-disable*` **directive** (the
  `eslint-disable`/`-line`/`-next-line` token must be present in the same comment as the named rule),
  per the regex in Step 3. The four scanned globs EXCLUDE `tests/**`, so the guard never scans itself.
  Verified GREEN against today's tree: 11 `exhaustive-deps` disables + 1 bare disable, none naming an
  architecture rule.

### R4 — Bare `eslint-disable` slips the named-rule scope · severity: LOW · must-fix: NO
The bare `// eslint-disable` at `app/cash/page.tsx:732` disables ALL rules (including the architecture
ones) but names none, so the named-rule-scoped guard won't catch it. This is a (pre-existing, narrow)
gap, not a regression.
- **Mitigation:** honour the locked spec (named-rule disables only) so the test is GREEN on first run.
  Note the gap for BACKLOG (a future "ban bare disables in source" hardening). Do NOT widen the regex in
  F-27 — that would turn the test RED on first run against existing code, breaking the locked spec.

### Risk-category sweep (mandatory)
- **Concurrency / race conditions:** none — static config + file-reading tests, no runtime, no shared
  state. *No material risks in this category.*
- **Security:** none — no auth, no RLS, no data path touched; if anything, F-27 *raises* the security
  floor by making vendor-fence bypass harder. *No material risks.*
- **Data migration:** none — no schema, no migration, no SQL. *No material risks.*
- **Business-logic flaws:** none — no business logic changed; the only logic added is in test files,
  whose correctness is proven by the TDD teeth checks (R1–R3). *No material risks beyond R1–R3.*
- **Launch blockers:** none — the change is invisible to the shipped bundle (ESLint config + `tests/**`
  don't ship). Worst case of a bug is a false-red unit test caught in CI before merge, never a prod
  incident. *No launch blockers.*

**🗣 In plain English:** The realistic risks are all about the two new tests being slightly wrong —
either too strict (blocks a safe package) or too loose (misses a vendor) — and each is mitigated by a
clear, actionable failure message and by deliberately trying to break each test before trusting it. None
of these can cause a production problem, because nothing the user runs is changing.

**Must-fix risks (Gate 2 blockers): NONE.** No risk in any category is flagged must-fix.

---

## Summary for the conductor

- **Plan file:** `docs/plans/2026-06-27-f-27-vendor-fence-teeth.md`
- **Approach:** add `@capacitor/{core,android}` to both `no-restricted-imports` ban blocks +
  pre-permit a future `lib/adapters/capacitor/`; add two new vitest pin tests (vendor-fence completeness
  + sync, and an architecture-rule disable guard). Confirm green via vitest/lint/typecheck. Unit-only
  ANVIL.
- **Files touched:** `.eslintrc.json` (edit) · `tests/unit/lint/vendor-fence-complete.test.ts` (new) ·
  `tests/unit/lint/no-disable-arch-rules.test.ts` (new).
- **ADR conflicts:** none (strengthens ADR-0002 / ADR-0003 enforcement).
- **Hexagonal verdict:** PASS — N/A; no port/adapter/vendor/dep added; this IS the enforcement layer.
- **Risk headline:** no must-fix risks. Three MEDIUM test-correctness risks (ALLOWLIST drift, array-rule
  parse path, disable-regex over-match), all mitigated and non-blocking.
- **Live-breach check:** NONE found — all 24 runtime deps are fenced-or-allow-listed after the edit;
  spec stays a "future guard," not a "fix a live gap."
