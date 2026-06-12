# F-TD-11 — Orders composition root (`lib/wiring/orders.ts`)

- **Date:** 2026-06-11
- **Unit:** F-TD-11 (BACKLOG.md §F-TD-11, born from the F-09 rip-out audit BLOCKER-1,
  `docs/anvil/2026-06-11-f-09-rip-out-audit.md`)
- **Branch:** `refactor/f-td-11-orders-composition-root` off `main` (HEAD `eab7e3c`)
- **Kind:** pure refactor — **ZERO behaviour change** (no API, DB, or UI difference)

**🗣 In plain English:** Today, four different files each personally know that
"the database is Supabase". This change moves that knowledge into ONE small
file, so swapping the database vendor one day means editing exactly one file —
which is the standard this project's own rulebook (CLAUDE.md) demands. Nothing
the staff or customers see changes at all.

---

## 1. Goal

The Orders rip-out test passes the letter of the CLAUDE.md acceptance test:
swapping the database vendor for the Orders domain = one new adapter folder +
**one** wiring file changed (`lib/wiring/orders.ts`). Today the count is four
(`lib/services/OrdersService.ts` + the three `lib/usecases/` files). A guard is
added so the count can never silently creep back up.

**🗣 In plain English:** The "how expensive is it to fire our database vendor?"
test must answer "one folder of replacement code + one wiring file". Right now
the honest answer is four files, which failed the F-09 audit. We fix the count
and install an alarm that goes off if anyone ever re-introduces the problem.

---

## 2. Domain terms used

- **Port / adapter / service / use-case / domain type** — exactly as defined in
  ADR-0002 (`docs/adr/0002-hexagonal-shape-and-naming.md:17`).
- ⚠️ NEW TERM (architecture, not business): **Composition root** — the single
  file where abstract interfaces are bolted to concrete vendor implementations;
  here `lib/wiring/orders.ts`. Proposed for the ADR-0002 vocabulary at the next
  ADR touch (no CONTEXT.md entry — it is an implementation term, not a business
  term, and CONTEXT.md is the _business_ glossary).

**🗣 In plain English:** "Composition root" = the one assembly station where the
generic machine parts get connected to the actual brand-name components. One
station, clearly labelled, instead of four hidden ones.

---

## 3. Compliance

**NO.** No auth, payments, data retention, HACCP, legislation, or financial
logic is touched. No document needs updating. The service-role data-access
posture (ADR-0004) is byte-for-byte unchanged — the same adapter singletons,
constructed the same way, just imported from a different file.

**🗣 In plain English:** This is purely internal re-plumbing; no rule-sensitive
behaviour moves an inch.

---

## 4. ADR review and conflicts

- **ADR-0002 (hexagonal shape):** this unit _enforces_ it — "services depend on
  ports, never on a concrete vendor". Note: ADR-0002's folder list does not yet
  name `lib/wiring/`; CLAUDE.md's folder list doesn't either. This is an
  _addition_ alongside the listed folders, not a contradiction — CLAUDE.md
  already speaks of "one wiring/config line", and BACKLOG §F-TD-11's locked fix
  shape names `lib/wiring/orders.ts` explicitly. No ADR change required now;
  fold the folder into ADR-0002 when it is next amended (noted in §12 follow-ups).
- **ADR-0003 (strangler-fig / FREEZE):** no conflict — Orders is already
  migrated; this touches only migrated code.
- **ADR-0004 (RLS vs service-role):** no conflict — wiring still uses the same
  service-role-backed adapters.
- **Conflicts: none.**

**🗣 In plain English:** No past architectural decision is being overturned;
this change is the enforcement arm of a decision already made. One small
housekeeping note: the official architecture document should mention the new
`lib/wiring/` folder next time it's edited.

---

## 5. Current state (read and verified on `eab7e3c`)

The four vendor-import sites (all verified — audit line numbers hold):

| File                            | Vendor import                                                                                                   | Pre-wired singleton                     |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `lib/services/OrdersService.ts` | lines 143–147 (`supabaseOrdersRepository`, `supabaseCustomersRepository`, `supabaseProductsRepository`)         | lines 529–542 (`ordersService` + JSDoc) |
| `lib/usecases/pickingList.ts`   | lines 27–30 (`supabaseProductsRepository`, `supabaseUsersRepository`) + line 26 value-import of `ordersService` | lines 119–124 (`pickingListUsecase`)    |
| `lib/usecases/kdsLineDone.ts`   | line 25 (`supabaseUsersRepository`) + line 24 value-import of `ordersService`                                   | lines 76–80 (`kdsLineDoneUsecase`)      |
| `lib/usecases/kdsQueue.ts`      | line 22 (`supabaseProductsRepository`) + line 21 value-import of `ordersService`                                | lines 70–74 (`kdsQueueUsecase`)         |

Singleton consumers (full enumeration via
`grep -rn "from ['\"]@/lib/adapters" lib app components tests` and
`grep -rln "ordersService\|pickingListUsecase\|kdsQueueUsecase\|kdsLineDoneUsecase"`):

- **Routes (5):** `app/api/orders/route.ts:21` and `app/api/orders/[id]/route.ts:27`
  import `ordersService` from `@/lib/services` (the barrel);
  `app/api/orders/[id]/picking-list/route.ts:27` imports `pickingListUsecase`
  from `@/lib/usecases/pickingList`; `app/api/kds/orders/route.ts:22` imports
  `kdsQueueUsecase` from `@/lib/usecases/kdsQueue`;
  `app/api/kds/lines/[lineId]/done/route.ts:32` imports `kdsLineDoneUsecase`
  from `@/lib/usecases/kdsLineDone`.
- **Barrel:** `lib/services/index.ts:17-22` re-exports `ordersService` (and the
  factory + types). There is **no** `lib/usecases/index.ts` barrel.
- **Tests: ZERO singleton imports.** All unit tests
  (`tests/unit/services/OrdersService.test.ts`,
  `tests/unit/usecases/{pickingList,kdsLineDone,kdsQueue}.test.ts`) build their
  own instances via the factories with fake adapters; integration/e2e tests go
  over HTTP. No `vi.mock` exists anywhere in `tests/`. **No test file changes
  imports in this unit.**
- **Existing pin test:** `tests/unit/services/OrdersService.test.ts:678-775`
  ("OrdersService architecture pins") — polices sibling-service imports,
  runtime observability coupling, auth coupling, log coupling, on
  `OrdersService.ts` only. It does **not** police adapter imports (F-TD-05).
- **ESLint:** legacy `.eslintrc.json` (ESLint 8, `next lint`). The F-04 rule is
  a root-level `no-restricted-imports` forbidding `@supabase/supabase-js`,
  switched off for `lib/supabase.ts`, `lib/adapters/supabase/**/*.ts`,
  `tests/**` via one `overrides` block. House pattern: the rule's behaviour is
  pinned by a unit test, `tests/unit/lint/no-supabase-sdk.test.ts`, using the
  `ESLint` class API with `useEslintrc: false`.
- **Build posture:** `next.config.ts:4-8` sets `eslint.ignoreDuringBuilds: true`
  and `typescript.ignoreBuildErrors: true` — neither lint nor tsc fail
  `next build`. The hard fail-closed gates in this repo are the vitest unit
  suite (1504 green required) and the baseline counts (tsc 60, lint 58).

**🗣 In plain English:** I checked every claim in the audit against the real
files — all four leak points are exactly where the audit said. Good news: the
robot tests never use the pre-wired shortcuts, so not a single test file needs
its imports changed. The project already has a proven recipe for "ban an import
by law and pin the law with a test" (the F-04 guard) — we reuse that recipe.

---

## 6. Design decisions

### D1 — The composition root: `lib/wiring/orders.ts`

One new file, the only business-layer file allowed to import
`@/lib/adapters/supabase`. Exact content shape (implementer writes JSDoc header
explaining the composition-root role + the rip-out contract):

```ts
import { createOrdersService, type OrdersService } from "@/lib/services";
import {
  createPickingListUsecase,
  type PickingListUsecase,
} from "@/lib/usecases/pickingList";
import {
  createKdsQueueUsecase,
  type KdsQueueUsecase,
} from "@/lib/usecases/kdsQueue";
import {
  createKdsLineDoneUsecase,
  type KdsLineDoneUsecase,
} from "@/lib/usecases/kdsLineDone";
import {
  supabaseOrdersRepository,
  supabaseCustomersRepository,
  supabaseProductsRepository,
  supabaseUsersRepository,
} from "@/lib/adapters/supabase";

export const ordersService: OrdersService = createOrdersService({
  orders: supabaseOrdersRepository,
  customers: supabaseCustomersRepository,
  products: supabaseProductsRepository,
});

export const pickingListUsecase: PickingListUsecase = createPickingListUsecase({
  ordersService,
  products: supabaseProductsRepository,
  users: supabaseUsersRepository,
});

export const kdsQueueUsecase: KdsQueueUsecase = createKdsQueueUsecase({
  ordersService,
  products: supabaseProductsRepository,
});

export const kdsLineDoneUsecase: KdsLineDoneUsecase = createKdsLineDoneUsecase({
  ordersService,
  users: supabaseUsersRepository,
});
```

The three use-cases share the **same** `ordersService` instance, as today
(today each use-case file imports the one `ordersService` singleton — identical
object graph, just assembled in one place). All factories and adapter
singletons already exist; nothing is invented.

**🗣 In plain English:** The new file is a parts list, not logic: "take the real
Supabase-backed order store, customer list, product catalogue and staff list,
plug them into the order engine and the three kitchen/picking coordinators, and
hand the assembled machines out." Fifteen lines of plugging, zero decisions.

### D2 — Enforcement mechanism: ESLint `no-restricted-imports` override + config-pin unit test (F-04 house pattern)

**Chosen: ESLint, not a file-reading pin test — with the config itself pinned
by a new unit test.** Justification (the one paragraph): the repo already has
exactly one established mechanism for "this import is banned outside that
folder" — F-04's `no-restricted-imports` rule in `.eslintrc.json` plus
`tests/unit/lint/no-supabase-sdk.test.ts` pinning its behaviour — and F-TD-05
(BACKLOG.md §F-TD-05) already records ESLint as the cleaner fix-shape because it
fires at lint/editor time, covers **every current and future file** in
`lib/services/**` and `lib/usecases/**` with zero per-file test maintenance
(the alternative — extending the readFileSync pin test — must enumerate files
or scan directories, fails later in the cycle, and duplicates a mechanism the
repo already owns). The known weakness — `next build` ignores ESLint
(`next.config.ts:5`) and `npm run lint` carries a 58-problem baseline policed
only by a grep count — is closed in two ways: (a) the new
`tests/unit/lint/no-adapter-imports.test.ts` makes the unit suite (the repo's
hardest gate) fail if the shipped config stops catching violations, and unlike
F-04's hermetic mirror it loads the **real** `.eslintrc.json` from disk
(F-TD-05's lesson: pins must catch drift, not codify it); (b) the plan's
"prove the alarm rings" steps (§7 steps 1 and 5) demonstrate the real
`npm run lint` failing on a real violation. The existing architecture pin
(`OrdersService.test.ts:678-775`) **stays in place untouched** — it polices
different couplings (sibling services, observability, auth, log) that this
rule does not; the new guard sits alongside it. F-TD-05 itself stays open (its
cross-service dimension is still per-file), but gains a progress note.

The exact `.eslintrc.json` edit — append a second `overrides` entry (the
existing F-04 rule, its message, and the existing override are byte-for-byte
untouched):

```json
{
  "files": ["lib/services/**/*.ts", "lib/usecases/**/*.ts"],
  "rules": {
    "no-restricted-imports": [
      "error",
      {
        "paths": [
          {
            "name": "@supabase/supabase-js",
            "message": "Use supabaseService from @/lib/supabase for app code, or add an adapter under lib/adapters/supabase/ for vendor-specific operations. See ADR-0003 (FREEZE rule)."
          }
        ],
        "patterns": [
          {
            "group": [
              "@/lib/adapters",
              "@/lib/adapters/**",
              "**/adapters",
              "**/adapters/**"
            ],
            "message": "Services and use-cases depend on ports, never on adapters (ADR-0002). Wire concretions in the composition root lib/wiring/ instead. See F-TD-11."
          }
        ]
      }
    ]
  }
}
```

Two load-bearing details the implementer must not lose:

1. **The override must re-state the F-04 `paths` entry verbatim.** ESLint
   legacy-config overrides _replace_ a rule's options for matched files — they
   do not merge. Omitting `paths` would silently strip the
   `@supabase/supabase-js` ban from `lib/services/**` and `lib/usecases/**`
   (the spec's "must still police what the current pin polices" requirement —
   here applied to F-04's rule, which currently covers those folders via the
   root config). The pin test asserts this case explicitly.
2. **The `group` globs cover both alias and relative forms** —
   `@/lib/adapters/supabase` and `../adapters/supabase` alike (minimatch
   semantics). `lib/wiring/**` is not in `files`, so the composition root is
   untouched by the rule, as are `tests/**` (root rule never had `patterns`;
   the new ones live only in this override).

New pin test `tests/unit/lint/no-adapter-imports.test.ts` — same harness as
`no-supabase-sdk.test.ts` (the `ESLint` class, NOT `Linter` — `Linter.verify()`
ignores `overrides[]`; `useEslintrc: false`; `lintText(code, { filePath })`),
but `overrideConfig` is built by reading the real `.eslintrc.json`
(`JSON.parse(readFileSync(...))`), deleting the `extends` key (so the
next/core-web-vitals machinery isn't pulled in), and adding
`parserOptions: { ecmaVersion: 2022, sourceType: "module" }`. Cases:

1. Forbidden: `import { supabaseOrdersRepository } from "@/lib/adapters/supabase";`
   at `filePath: "lib/services/OrdersService.ts"` → 1 error.
2. Forbidden: same import at `lib/usecases/pickingList.ts` → 1 error.
3. Forbidden (relative form): `import { x } from "../adapters/supabase";`
   at `lib/services/Foo.ts` → 1 error.
4. Allowed: same adapter import at `lib/wiring/orders.ts` → 0 errors.
5. Allowed (sanity): `import type { OrdersRepository } from "@/lib/ports";`
   at `lib/services/OrdersService.ts` → 0 errors.
6. Forbidden (F-04 parity preserved): `import { createClient } from "@supabase/supabase-js";`
   at `lib/services/OrdersService.ts` → 1 error carrying the F-04 message
   (proves detail 1 above survived).
7. Message: the new pattern message text is reported as-is (typo tripwire).

Fixture caveat: fixtures must use plain `import { … }` statements, never
`import type` — the pin test parses with espree, which cannot parse TypeScript
`import type` syntax. The real `npm run lint` run (TS parser via
`next/core-web-vitals`) flags `import type` from adapters too, which is correct
per ADR-0002 ("vendor types never cross the port boundary") — and step 5 proves
the real lint path.

**🗣 In plain English:** We add one new house law — "business-logic files may
not mention the vendor's parts bin; only the assembly station may" — written in
the same law-book and the same legal language as the existing vendor-import
law. Then we add a robot test that reads the actual law-book off the shelf and
checks the law still catches offenders, so nobody can quietly delete the law
later. And because the project's build deliberately doesn't read the law-book,
the robot test is what makes breaking this law impossible to ship. One subtle
trap is documented: adding the new law for these folders would accidentally
_erase_ the old vendor law there unless the old law is restated — so it is
restated, and a test checks it.

### D3 — Barrel and template-comment updates

- `lib/services/index.ts` drops the `ordersService` re-export (keeps
  `createOrdersService`, `type OrdersService`, `type OrdersServiceRepos`);
  its docstring (lines 4–15, "F-08 routes import the singleton") is rewritten
  to: factory + types here, singletons live in `lib/wiring/orders.ts`.
- `lib/services/OrdersService.ts` "Construction" template comment (lines 52–61)
  is rewritten so F-13+ copy the composition-root pattern: factory here, tests
  pass fakes, **production wiring lives in `lib/wiring/<domain>.ts` — never a
  pre-wired singleton in the service file** (cite ADR-0002 + F-TD-11).
- Each use-case docstring's "Construction: factory + pre-wired singleton (F-07
  template)" line (`pickingList.ts:20`, `kdsLineDone.ts:19`, `kdsQueue.ts:16`)
  becomes "Construction: factory (F-07 template); production wiring in
  `lib/wiring/orders.ts` (F-TD-11)".
- No reformatting beyond these changed lines (house rule, §11).

**🗣 In plain English:** Every signpost that used to say "the ready-made
machine lives here" is repointed to the new assembly station — most importantly
the worked-example comment that the next eight services will be copied from.

### D4 — Step ordering: guard first (red), then refactor (green)

The ESLint guard lands **first**, while the four violations still exist: the
real `npm run lint` then reports exactly 4 new errors naming the four files
(62 by the grep count) — the alarm demonstrably rings against the _actual_
defect, not a synthetic one. The refactor steps then turn it green (back to
58). A belt-and-braces synthetic violation check (§7 step 5) re-proves the
end state, as the locked spec requires. Intermediate commits carry the +4 lint
count by design; the PR's end state restores the baseline (gates check the PR,
not each commit).

**🗣 In plain English:** Install the smoke alarm while the kitchen is still
smoky — watch it shriek at the four real problems — then clear the smoke and
watch it go quiet. Finally light one deliberate match at the end to prove the
alarm still works, and put it out.

---

## 7. Implementation steps (TDD-sized commits)

Run protocol: `npm run db:up` once (integration suite needs it from step 3 on).
After every step: `npm test` and `npx tsc --noEmit` (must stay 60).

**Step 0 — Branch.** `refactor/f-td-11-orders-composition-root` off `main`.
No new dependencies — `package.json` untouched (the locked spec discourages
any; none is needed: `eslint` ^8 is already a devDependency and the pin-test
harness exists).
**🗣 In plain English:** A safe side-copy to work on; nothing new gets installed.

**Step 1 — Guard, red.** Write `tests/unit/lint/no-adapter-imports.test.ts`
(§6 D2 cases 1–7) → run it → **red** (config not yet edited). Append the §6 D2
override to `.eslintrc.json` → pin test **green**. Run `npm run lint` → grep
count **62**: the 4 extra errors name exactly
`lib/services/OrdersService.ts`, `lib/usecases/pickingList.ts`,
`lib/usecases/kdsLineDone.ts`, `lib/usecases/kdsQueue.ts`. Paste that output
into the PR description ("alarm rings" evidence, part 1). Commit.
**🗣 In plain English:** The new alarm is written and immediately catches the
four real offenders by name — proof number one that it works.

**Step 2 — Composition root.** Create `lib/wiring/orders.ts` exactly per §6 D1.
The old singletons still exist in parallel for two steps — harmless duplication
(stateless object graphs, nothing imports the new file yet). No unit test for
this file (importing it would construct the real Supabase client from
`lib/supabase.ts` — wrong for the fakes-only unit suite; its correctness is
proven by the integration + e2e suites in steps 3 and 6, which exercise the
full wired graph over HTTP). `npx tsc --noEmit` → 60. Commit.
**🗣 In plain English:** The assembly station is built and stocked, but no door
is connected to it yet — so nothing can break.

**Step 3 — Routes switch over.** One-line import change in each of the 5 routes
(no logic change, no other line touched):

- `app/api/orders/route.ts:21` → `import { ordersService } from "@/lib/wiring/orders";`
- `app/api/orders/[id]/route.ts:27` → same
- `app/api/orders/[id]/picking-list/route.ts:27` → `import { pickingListUsecase } from "@/lib/wiring/orders";`
- `app/api/kds/orders/route.ts:22` → `import { kdsQueueUsecase } from "@/lib/wiring/orders";`
- `app/api/kds/lines/[lineId]/done/route.ts:32` → `import { kdsLineDoneUsecase } from "@/lib/wiring/orders";`

Proof: `npm run test:integration` fully green (the integration suite exercises
all five endpoints over real HTTP against the local stack — this is the
zero-behaviour-change net for the route flip). Commit.
**🗣 In plain English:** The five web doors are re-pointed at the assembly
station, and the full battery of real-HTTP tests confirms every door answers
exactly as before.

**Step 4 — De-vendor the four files (guard goes green).**

- `lib/services/OrdersService.ts`: delete the `@/lib/adapters/supabase` import
  (lines 143–147) and the `ordersService` singleton + its JSDoc + the
  `─── Default singleton ───` banner (lines 529–542); rewrite the Construction
  template comment (lines 52–61) per §6 D3. Factory, interface, types, logic:
  untouched.
- `lib/services/index.ts`: drop `ordersService` from the export list; rewrite
  docstring per §6 D3.
- `lib/usecases/pickingList.ts`: delete line 26 (`import { ordersService }`)
  and lines 27–30 (adapter import) and lines 119–124 (singleton + JSDoc); keep
  line 25's `import type { OrdersService }`; docstring line 20 per §6 D3.
- `lib/usecases/kdsLineDone.ts`: delete line 24 (value import), line 25
  (adapter import), lines 76–80 (singleton); keep line 23's type import;
  docstring line 19 per §6 D3.
- `lib/usecases/kdsQueue.ts`: delete line 21 (value import), line 22 (adapter
  import), lines 70–74 (singleton); keep line 20's type import; docstring
  line 16 per §6 D3.

Proof: `npm test` — all 1504 existing unit tests + the new pin cases green
(no existing test imports the deleted singletons — verified §5);
`npm run lint` → back to **58** (alarm silent — paste alongside step 1's 62);
`npx tsc --noEmit` → 60. Commit.
**🗣 In plain English:** The four files hand in their vendor keys. Every
existing robot test still passes untouched, and the alarm — which screamed at
62 — now reads a calm 58.

**Step 5 — Prove the alarm rings (end-state check, locked spec requirement).**
Temporarily re-add `import { supabaseOrdersRepository } from "@/lib/adapters/supabase";`
to `lib/services/OrdersService.ts` AND
`import { supabaseProductsRepository } from "@/lib/adapters/supabase";` to
`lib/usecases/kdsQueue.ts` → `npm run lint` → count **60**, both files flagged
with the F-TD-11 message → **revert both** → `npm run lint` → **58**. Record
the before/after output in the PR description ("alarm rings" evidence, part 2).
Nothing is committed in the violated state.
**🗣 In plain English:** One deliberate match in each of the two protected
rooms; the alarm names both rooms; matches out; silence confirmed. Written
evidence goes in the pull request.

**Step 6 — Full verification.**
`npm test` (1504 + new pin cases, all green) · `npm run test:integration` ·
`npm run test:e2e:api` · `npm run test:e2e:ui` · `npm run lint` (grep count
**58**) · `npx tsc --noEmit` (**60**). Rip-out grep, must return nothing:
`grep -rn "@/lib/adapters" lib/services lib/usecases`.
**🗣 In plain English:** Every robot test in the house runs, the two
error-count baselines are exactly where they started, and a direct search
proves the business-logic folders no longer mention the vendor at all.

**Step 7 — Rip-out re-enumeration (goes in the PR description verbatim).**
Re-run the F-09 audit's wiring count:
`grep -rln "from ['\"]@/lib/adapters" lib app components | grep -v "^lib/adapters/" | grep -v "^lib/wiring/"`
→ must be **empty**; and
`grep -rln "from ['\"]@/lib/adapters" lib/wiring` → exactly `lib/wiring/orders.ts`.
Record in the PR: **"Orders rip-out cost: 1 adapter folder
(`lib/adapters/<new-vendor>/`) + 1 wiring file (`lib/wiring/orders.ts`)."**
**🗣 In plain English:** The auditor's own counting method is re-run and the
answer — one folder plus one file — is written into the pull request for the
re-audit (F-09 re-gates after this merges).

**Step 8 — Bookkeeping.** `docs/plans/BACKLOG.md`: §F-TD-11 status →
shipped-pending-merge with PR ref (final flip post-merge per house convention);
§F-TD-05 add note: "adapter-import dimension now ESLint-enforced for
`lib/services/**` + `lib/usecases/**` (F-TD-11); cross-service-import dimension
still open — owner F-13 unchanged."
**🗣 In plain English:** The to-do ledger records what this PR actually closed
(the vendor-import hole) and what it deliberately didn't (the
services-calling-services rule, which stays booked against the next unit).

**Step 9 — PR + Gate 4.** No migration in this PR (the Supabase preview branch
is born trivially). `npm run test:e2e:preview -- <preview-url> --unprotected`
→ must be 8/8. Ship checklist: `npm run db:branches` — no orphans after merge.
Post-merge: conductor re-runs the F-09 rip-out audit (BACKLOG §F-TD-11 owner
note).
**🗣 In plain English:** The standard dress rehearsal on a deployed throwaway
copy must pass 8-for-8 before merging, and after merging the original failed
audit is run again to officially flip its verdict.

---

## 8. File-by-file change list

**New (2):**

| File                                         | What                                 |
| -------------------------------------------- | ------------------------------------ |
| `lib/wiring/orders.ts`                       | the composition root (§6 D1)         |
| `tests/unit/lint/no-adapter-imports.test.ts` | config-pin for the new guard (§6 D2) |

**Modified (12):** `lib/services/OrdersService.ts` ·
`lib/services/index.ts` · `lib/usecases/pickingList.ts` ·
`lib/usecases/kdsLineDone.ts` · `lib/usecases/kdsQueue.ts` ·
`app/api/orders/route.ts` · `app/api/orders/[id]/route.ts` ·
`app/api/orders/[id]/picking-list/route.ts` · `app/api/kds/orders/route.ts` ·
`app/api/kds/lines/[lineId]/done/route.ts` · `.eslintrc.json` ·
`docs/plans/BACKLOG.md`

**Deleted (0). Test files with import changes (0).** `package.json` untouched.
Total touched: **14**.

**🗣 In plain English:** Two small new files, twelve existing files edited
(five of them by a single import line each), nothing deleted, no new
libraries, and not one robot-test file has to change how it gets its parts.

---

## 9. Test plan (TDD)

This is a behaviour-preserving refactor: the 1504 existing unit tests + the
integration suite + the e2e smokes ARE the net — they pin the behaviour that
must not change. The only NEW behaviour is the guard, and it gets the only new
test, written red-first:

1. **Behaviour: "a service or use-case file importing from the adapters folder
   is reported as a lint error; the wiring file is exempt; the old
   supabase-js ban still applies in those folders."** Test file:
   `tests/unit/lint/no-adapter-imports.test.ts` (cases §6 D2; public interface
   only — it exercises the shipped `.eslintrc.json` through ESLint's public
   API, no internals).
2. Existing suites as regression net, run per step (§7): unit after every step;
   integration at steps 3 and 6; e2e at step 6; preview smoke at Gate 4.
3. No unit test for `lib/wiring/orders.ts` itself — justified in §7 step 2
   (it would drag the real vendor client into the fakes-only suite; the wired
   graph is covered over HTTP by integration + e2e + preview smoke).

**🗣 In plain English:** One new test for the one new promise (the alarm). For
everything else, the promise is "nothing changes" — and the fairest judge of
that is the existing army of tests, run unmodified.

---

## 10. Acceptance criteria (locked at Gate 1)

- [ ] Rip-out re-enumeration (§7 step 7 greps) = **1 adapter folder + 1 wiring
      file**, recorded verbatim in the PR description.
- [ ] `lib/wiring/orders.ts` is the only file outside `lib/adapters/` that
      imports `@/lib/adapters/supabase`; `lib/services/**` and
      `lib/usecases/**` contain zero adapter imports (grep clean).
- [ ] The guard demonstrably fails when violated: step 1's real-lint 62 AND
      step 5's violate→60→revert→58 evidence both pasted in the PR.
- [ ] The guard still polices what F-04 policed in those folders
      (`@supabase/supabase-js` ban — pin case 6 green) and the existing
      architecture pin (`OrdersService.test.ts:678-775`) is green and
      **unmodified**.
- [ ] ZERO behaviour change: all 5 endpoints answer identically — full
      integration suite green unmodified, e2e UI/API green, Gate-4 preview
      smoke 8/8.
- [ ] Baselines unchanged: `npx tsc --noEmit` = **60**; `npm run lint` grep
      count = **58**; all **1504** pre-existing unit tests green (plus the new
      pin cases).
- [ ] The F-07 template comment (`OrdersService.ts:52-61` region) and the three
      use-case docstrings document the composition-root pattern for F-13+.
- [ ] `package.json` untouched; no file reformatted beyond changed lines.
- [ ] F-09 re-gates after merge (post-merge action, noted in PR + BACKLOG).

**🗣 In plain English:** Done means: the "fire the vendor" bill is provably one
folder plus one file; an alarm proven to ring guards it forever; the next
service author who copies the worked example copies the right pattern; and not
a single person, screen, or API caller can tell anything happened.

---

## 11. House rules restated (binding on the implementer)

- **NO reformatting of existing code beyond changed lines.** If a deletion
  unavoidably disturbs adjacent formatting (e.g. removing the trailing
  singleton block leaves a dangling section banner), declare it explicitly in
  the PR description.
- No new `package.json` entries. (None needed; if reality disagrees, stop and
  return to the conductor — a new package needs written justification and is
  discouraged by the locked spec.)
- The locked spec's out-of-scope list holds: `lib/supabase.ts` stays where it
  is (F-TD-04), `lib/orders/types.ts` untouched (F-TD-12), no other domain
  touched, no behaviour change of any kind.

**🗣 In plain English:** Touch only what the job needs, confess any unavoidable
cosmetic ripple, add nothing to the shopping list, and leave the neighbours'
gardens alone.

---

## 12. Risk Assessment

**Headline: no open must-fix risks.** Two risks rated must-fix were identified
and both are **resolved by design inside this plan**: R1 (the ESLint override
silently erasing F-04's vendor ban in the guarded folders — closed by
restating `paths` in the override + pin case 6) and R2 (the guard being
decorative because `next build` ignores ESLint — closed by the real-config pin
test in the hard-gated unit suite + the two real-lint ring proofs). Nothing
blocks Gate 2.

| #   | Category                           | Risk                                                                                                                                                                                                                                                                                                                                                                                            | Sev. | Mitigation                                                                                                                                                                                                                                                                                                                                                                  | Must-fix?                    |
| --- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| R1  | Business logic / guard correctness | ESLint legacy overrides **replace** rule options per file — adding the new override without restating the F-04 `paths` entry would silently strip the `@supabase/supabase-js` ban from `lib/services/**` + `lib/usecases/**`.                                                                                                                                                                   | High | Override restates `paths` verbatim (§6 D2 detail 1); pin case 6 asserts the F-04 message still fires inside `lib/services/`; F-04's own pin test (`no-supabase-sdk.test.ts`) is untouched and stays green.                                                                                                                                                                  | **Yes — resolved in design** |
| R2  | Launch blocker / guard efficacy    | The guard never actually gates anything: `next.config.ts:5` sets `ignoreDuringBuilds: true`, and `npm run lint`'s 58-problem baseline is policed only by a grep count a human could misread.                                                                                                                                                                                                    | High | The pin test loads the **real** `.eslintrc.json` and runs in the unit suite — the repo's hard fail-closed gate; step 1 (red on the 4 real violations, 62) and step 5 (synthetic violate→60→revert→58) prove the real lint path; both outputs recorded in the PR.                                                                                                            | **Yes — resolved in design** |
| R3  | Business logic                     | Behaviour drift while editing imports/singletons (wrong adapter plugged into a factory slot in the wiring file, e.g. `users:` given a products repo).                                                                                                                                                                                                                                           | Med  | TypeScript structural typing rejects most mis-pluggings at `tsc` time (`UsersRepository` ≠ `ProductsRepository` shapes); deps objects use named fields, not positional args; full integration suite re-run at step 3 (route flip) and step 6 exercises all five endpoints over HTTP; preview smoke 8/8.                                                                     | No                           |
| R4  | Concurrency / race conditions      | None introduced: no logic line changes; the idempotency claim/replay dance, KDS double-tap idempotence and the swallowed benign `ConflictError` all live in untouched code. Singleton **identity** is preserved (one `ordersService` shared by all three use-cases, as today), and the singletons are stateless closures — even a transient duplicate instance during steps 2–3 cannot diverge. | Low  | Existing race-torture tests (unit + integration) run unmodified and must stay green.                                                                                                                                                                                                                                                                                        | No                           |
| R5  | Security                           | None: no auth path, no RLS/service-role posture, no data-access change — the identical adapter singletons are constructed identically, imported from one file instead of four. The guard _tightens_ security posture marginally (vendor surface confined harder).                                                                                                                               | Low  | Integration suite's 401/403/404/409 assertions unchanged; ADR-0004 untouched.                                                                                                                                                                                                                                                                                               | No                           |
| R6  | Data migration                     | None: no migration, no schema, no data touched. Rollback = revert the PR (one commit-range, no DB component).                                                                                                                                                                                                                                                                                   | Low  | Preview branch is born trivially; Gate-4 smoke still must pass 8/8.                                                                                                                                                                                                                                                                                                         | No                           |
| R7  | Module-init / bundling (Next.js)   | Each of the 5 route bundles now pulls the whole wiring module, constructing all 4 singletons per bundle (e.g. the KDS queue route also builds the picking-list use-case).                                                                                                                                                                                                                       | Low  | Construction is plain object-literal closure creation — no I/O, no vendor calls at module load (`lib/supabase.ts`'s `createClient` was already module-level via today's adapter imports, so route-load cost is unchanged in kind); per-bundle module duplication already existed for `lib/services` today. No behaviour or perf change observable; e2e smokes confirm boot. | No                           |
| R8  | `import type` subtleties           | Use-cases keep `import type { OrdersService } from "@/lib/services"` — type-only, erased at compile time, so wiring→usecase→services creates no runtime cycle (and no value cycle exists anyway: services never import use-cases or wiring). Separately, espree-based pin fixtures cannot use `import type` syntax (parse error).                                                               | Low  | Cycle check done (§5 graph: routes→wiring→{usecases→services(type-only), services, adapters}; all arrows point inward, acyclic). Pin fixtures use value imports only (§6 D2 caveat); the real TS-parsed lint covers `import type` violations.                                                                                                                               | No                           |
| R9  | Launch blocker / process           | Intermediate commits (steps 1–3) carry lint count 62 — someone eyeballing a mid-PR commit could mistake the deliberate red for regression.                                                                                                                                                                                                                                                      | Low  | Step 1's commit message and the PR description state the guard-first red→green design (§6 D4); the PR end state is 58; gates evaluate the PR, not commits.                                                                                                                                                                                                                  | No                           |
| R10 | Business logic / docs drift        | Template comment left half-updated → F-13 copies the old pre-wired-singleton pattern and reopens the wound the day the next service ships.                                                                                                                                                                                                                                                      | Low  | Dedicated step (§7 step 4 + §6 D3) with named line regions; acceptance criterion pins it; BACKLOG F-TD-05/F-TD-11 notes cross-reference.                                                                                                                                                                                                                                    | No                           |

Shallow-module note for code-critic: `lib/wiring/orders.ts` is deliberately
shallow — a composition root's entire job is to be the one trivially-readable
file where concretions meet abstractions (the complexity it "lacks" is exactly
the vendor coupling it evicts from four deep files). Do not deepen it.

**🗣 In plain English:** The two genuinely dangerous spots are sneaky law-book
mechanics: adding the new import-ban could quietly delete the old one for those
folders (so the old one is restated and a test checks it), and this project's
build deliberately ignores the law-book (so a test that reads the real
law-book sits inside the one test suite that _cannot_ be ignored, and we ring
the alarm for real, twice, with the output saved). Everything else is the
boring kind of risk — and "boring" is the whole point of a change whose promise
is that nobody can tell it happened.

---

## 13. Follow-ups (not in this unit)

- **F-TD-05** (cross-service import enforcement) — still open, owner F-13;
  gains a progress note (§7 step 8).
- **ADR-0002 amendment** — add `lib/wiring/` (composition root) to the named
  folder layout next time the ADR is touched; CLAUDE.md folder list likewise.
- **F-27 (Phase 5)** — the every-vendor ESLint tightening can fold this
  override's pattern into its general scheme.

**🗣 In plain English:** Three small later jobs are written down rather than
smuggled in: finish the second half of the old test-coverage debt when the
next service is built, mention the new folder in the official architecture
papers, and fold this rule into the grand all-vendors rule planned for the
final phase.
