# F-TD-04 — Lazy, relocated Supabase service client

**Date:** 2026-06-14
**Lane:** STANDARD (hexagonal seam — vendor client wiring)
**Status:** Plan (Gate 2 input). Spec locked at Gate 1.
**Plan file:** `docs/plans/2026-06-14-f-td-04-lazy-supabase-client.md`

---

## Goal

Move the single shared Supabase service-role client out of `lib/supabase.ts` and
into its proper adapter home `lib/adapters/supabase/client.ts`, and make its
construction **lazy** so that merely *importing* the module runs no
`createClient(...)` and validates no env vars. Keep a byte-identical
`supabaseService` call-site surface so none of the ~88 existing query sites
change syntax. Delete the old file and the test-only env shim that only existed
to paper over the eager construction.

🗣 Today the database "plug" is wired the instant anything in its electrical
circuit gets switched on — even a unit test that never uses the database trips
the breaker because the plug demands real credentials at power-on. This task
rewires it so the plug only draws power the first time a query actually runs, and
moves the plug into the box labelled "Supabase" where every other Supabase wire
already lives. After this, tests run with no fake credentials propping them up —
which is the whole proof the rewiring worked.

---

## Domain / architecture terms used in this plan

- **Service-role client** — the Supabase connection that bypasses row-level
  security; server-only, never shipped to the browser.
  🗣 The master key to the database. Powerful, so it lives server-side only and
  in exactly one place.
- **Module-load / module-eval time** — code that runs the moment a file is
  `import`ed, before any function is called.
  🗣 What happens when you flip the light switch on, versus what happens only when
  you actually walk into a room. Today the client is "switch-on" work; we want it
  to be "walk-in" work.
- **Lazy getter + memoization** — build the client on first use, then cache and
  reuse that one instance forever.
  🗣 Don't make the coffee until someone orders one — then keep the same pot warm
  for everyone after.
- **Lazy `Proxy`** — a stand-in object that looks exactly like the real client
  but forwards every property access to the real (lazily-built) one.
  🗣 A receptionist who *is* the client as far as callers can tell, but only
  phones the real client into existence the first time someone actually asks it
  to do something. Holding the receptionist's business card (`const supabase =
  supabaseService`) doesn't ring the phone — only `supabase.from(...)` does.
- **Codemod** — a scripted find-and-replace across many files.
  🗣 One sed command instead of opening 88 files by hand.
- **Pinning test** — a test whose only job is to fail loudly if a config drifts
  from what's expected.
  🗣 A tripwire across the eslint config so a silent typo can't disarm the guard.

---

## Compliance / safety flags

- **Security:** unchanged. Same service-role key, same server-only boundary, same
  vendor. No key moves to the client bundle; `client.ts` carries no `"use client"`
  and is only imported by server code (API routes, adapters, `lib/road-times.ts`).
  🗣 We are moving the master key from one drawer to another and changing *when*
  it's picked up — not who can pick it up. No new exposure.
- **Data / migration:** none. No DB schema, no migration, no data touched.
- **Auth:** none. Login flows import `supabaseService` and keep working
  byte-identically through the proxy.

---

## ADR review

- **ADR-0002** (hexagonal shape & naming) — this change *improves* compliance:
  the shared Supabase client currently lives outside `lib/adapters/supabase/`,
  which is the one folder allowed to import the Supabase SDK. Moving it to
  `lib/adapters/supabase/client.ts` puts the vendor code fully inside the box
  labelled "Supabase". **No conflict — net positive.**
- **ADR-0003** (Strangler-fig & FREEZE rule), `docs/adr/0003-...md:21` — its prose
  names the allow-list as `lib/adapters/supabase/**` **and** `lib/supabase.ts`.
  After this task, `lib/supabase.ts` no longer exists, so that prose sentence is
  stale. The eslint glob `lib/adapters/supabase/**` already covers the new file,
  so the *enforcement* stays correct — only the *wording* drifts.
  **Not a blocker.** Logged below as a non-blocking doc-sync step (Step 9).
  🗣 The rulebook mentions a room we're about to demolish. The guard at the door
  still works because it also watches the new room — but we should update the
  rulebook so it doesn't reference a room that's gone.
- ADR-0001, 0004, 0005, 0006 — unrelated.

**No ADR conflicts that block. One non-blocking doc-sync (ADR-0003 prose).**

---

## Verified facts (from grep/read at plan time — do not re-derive blind)

- Old client: `lib/supabase.ts`, 18 lines, the only content is the eager
  `export const supabaseService = createClient(URL!, KEY!)`.
- **88 files** import `from '@/lib/supabase'` (the spec's "88 + 6 + road-times"
  framing was loose; the true total is 88). Breakdown:
  - 83 files under `app/api/**`
  - 4 adapter repos: `lib/adapters/supabase/{Orders,Customers,Products,Users}Repository.ts`
  - 1 `lib/road-times.ts`
- Quote variants: **83 use single quotes** (`'@/lib/supabase'`), **5 use double
  quotes** (`"@/lib/supabase"`). The codemod must handle both.
- All 88 use the `@/` path alias. **No** relative-path imports, **no** dynamic
  `import()`/`require()` of the module. So a single literal-string replace is
  exhaustive.
- **Proxy-eagerness check (the critical safety gate): PASS.**
  - Count of `supabaseService.<property>` accesses at any module top level: **0**.
  - All 4 factories (`createSupabase*Repository`) use the injected `client` only
    inside `async` method bodies — never at construction. So
    `createSupabaseProductsRepository(supabaseService)` at module-eval passes the
    *proxy object itself* into the factory without touching a property →
    no `createClient` fires.
  - 80 app routes do `const supabase = supabaseService` at module top level. This
    is a **plain reference assignment**, not a property access — it does **not**
    trip a `Proxy` `get` trap. The real client is built only at the first
    `supabase.from(...)` / `.rpc(...)` inside a handler.
  - `app/api/reference/route.ts:17` and `lib/road-times.ts` follow the same safe
    pattern (alias then use inside handler).
- `@supabase/supabase-js` is `^2.39.0`; it exports both `createClient` and the
  `SupabaseClient` type the factories already import.
- `tests/setup.ts` is referenced in exactly one place: `vitest.config.ts:9`
  (`setupFiles: ["./tests/setup.ts"]`). The integration config
  (`vitest.integration.config.ts`) does **not** reference it.
- `tests/unit/lint/no-supabase-sdk.test.ts` hand-mirrors the eslint config:
  `FORBIDDEN_MESSAGE` (lines 34–37), `f04Config.overrides[0].files` (line 73),
  and case (2) (lines 126–132) all reference `lib/supabase.ts`.

---

## Files to change (exhaustive)

**Create (1):**
- `lib/adapters/supabase/client.ts` — new canonical lazy client.

**Delete (2):**
- `lib/supabase.ts`
- `tests/setup.ts`

**Edit — config/test infra (3):**
- `vitest.config.ts` — remove the `setupFiles` line.
- `.eslintrc.json` — drop the redundant `"lib/supabase.ts"` override entry; update
  the two forbidden-message path references.
- `tests/unit/lint/no-supabase-sdk.test.ts` — sync `FORBIDDEN_MESSAGE`,
  `f04Config.overrides[0].files`, and case (2) to the new path.

**Edit — import-path codemod (88):**
- 83 × `app/api/**/route.ts`
- `lib/adapters/supabase/{Orders,Customers,Products,Users}Repository.ts` (4)
- `lib/road-times.ts` (1)

**Create — new unit test (1):**
- `tests/unit/adapters/supabase/client.test.ts` — lazy + memoized proof.

**Doc-sync, non-blocking (1):**
- `docs/adr/0003-strangler-fig-migration-and-freeze-rule.md` — update the stale
  `lib/supabase.ts` mention in the FREEZE-rule prose (line 21).

**Total: 96 files touched** (1 created client + 1 created test + 2 deleted + 3
config/test-infra edited + 88 codemodded + 1 ADR doc). The 88 codemod edits are
mechanical and identical in shape.

---

## New file sketch — `lib/adapters/supabase/client.ts`

> Implementer: this is a sketch of intent and the required contract, not a
> copy-paste mandate. The two hard requirements: (a) **module-load runs no
> `createClient`**, and (b) `supabaseService` and `getSupabaseService()` both
> resolve to the **same memoized instance**.

```ts
/**
 * lib/adapters/supabase/client.ts
 * ───────────────────────────────────────────────────────────────────────────
 * Single shared Supabase service-role client for all server code.
 *
 * Service role key — bypasses RLS. Server-only. Never import in a client
 * component. The ONLY place (with the sibling repos) allowed to import
 * @supabase/supabase-js. See ADR-0002, ADR-0003.
 *
 * F-TD-04: construction is LAZY. Importing this module runs no createClient
 * and validates no env vars. The real client is built + memoized on first
 * property access (via supabaseService proxy) or first getSupabaseService() call.
 * This is what lets unit tests load the import graph with no env vars set.
 * ───────────────────────────────────────────────────────────────────────────
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let memo: SupabaseClient | null = null;

/** Build-once, return-same. The single shared service client. */
export function getSupabaseService(): SupabaseClient {
  if (memo === null) {
    memo = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return memo;
}

/**
 * Back-compat lazy proxy. Existing call-sites do `supabaseService.from(...)`;
 * the proxy forwards every trap to the memoized real client, constructing it
 * on first ACCESS (not on import, and not on plain `const x = supabaseService`).
 */
export const supabaseService: SupabaseClient = new Proxy(
  {} as SupabaseClient,
  {
    get(_t, prop, receiver) {
      return Reflect.get(getSupabaseService(), prop, receiver);
    },
    has(_t, prop) {
      return Reflect.has(getSupabaseService(), prop);
    },
    set(_t, prop, value, receiver) {
      return Reflect.set(getSupabaseService(), prop, value, receiver);
    },
    ownKeys(_t) {
      return Reflect.ownKeys(getSupabaseService());
    },
    getOwnPropertyDescriptor(_t, prop) {
      return Reflect.getOwnPropertyDescriptor(getSupabaseService(), prop);
    },
    getPrototypeOf(_t) {
      return Reflect.getPrototypeOf(getSupabaseService());
    },
  },
);
```

**Why the extra traps (`has`/`ownKeys`/`getOwnPropertyDescriptor`/`getPrototypeOf`):**
the Supabase SDK and some serializers occasionally probe an object beyond plain
`get` (e.g. `'from' in client`, `Object.keys`). Forwarding only `get` would make
those probes see the empty target `{}` and could behave wrong. Forwarding the
full set keeps the proxy indistinguishable from the real client.
🗣 The receptionist must answer not just "do X" but also "do you have an X?" and
"list everything you can do" exactly as the real client would — otherwise some
caller peeks behind the desk and sees an empty chair.

**`set` trap caveat for the implementer:** forwarding `set` to the real client
means a top-level `supabaseService.foo = ...` *would* construct the client. There
are zero such writes in the codebase today (verified: 0 top-level property
accesses of any kind). Keeping the `set` trap is correct behaviour; it does not
introduce eager construction for any current call-site.

**Circular-import check (encode and verify):** `client.ts` imports **only**
`@supabase/supabase-js`. It must **not** import any sibling repo, the barrel
`lib/adapters/supabase/index.ts`, or anything from `lib/services`/`lib/usecases`.
The repos import `client.ts`, never the reverse → no cycle. The implementer must
confirm this holds after writing the file (grep `client.ts` for any `@/lib`
import → expect none).
🗣 Water flows one way: repos drink from the client, the client never drinks from
the repos. As long as that arrow points one direction, no whirlpool.

**Barrel decision (confirmed):** do **not** add `client.ts` to
`lib/adapters/supabase/index.ts`. The codemod points every call-site at the
direct path `@/lib/adapters/supabase/client`, and the repos import it by direct
path too. Adding it to the barrel would create a second public path for the same
thing and a needless `client → (anything in barrel)` temptation. Leave the
barrel re-exporting only the four repositories as it does today.
🗣 One front door for the client, by direct address. Don't also list it on the
building directory in the lobby — that just invites confusion about which door is
"the" door.

---

## New test sketch — `tests/unit/adapters/supabase/client.test.ts`

This is the red→green proof that F-TD-04 actually delivered laziness. It must run
**with env vars unset** (it deletes them in-test) to prove module-load and even
`getSupabaseService` deferral are clean.

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("F-TD-04 lazy Supabase client", () => {
  const saved = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });
  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = saved.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = saved.key;
  });

  it("importing the module with no env vars does not throw", async () => {
    await expect(
      import("@/lib/adapters/supabase/client"),
    ).resolves.toBeDefined();
  });

  it("holding the supabaseService proxy reference does not construct the client", async () => {
    const mod = await import("@/lib/adapters/supabase/client");
    // plain reference — must NOT throw even with env unset
    const ref = mod.supabaseService;
    expect(ref).toBeDefined();
  });

  it("getSupabaseService() is memoized — same instance every call", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "stub-key";
    const mod = await import("@/lib/adapters/supabase/client");
    expect(mod.getSupabaseService()).toBe(mod.getSupabaseService());
  });
});
```

**Module-cache caveat for the implementer:** Vitest caches dynamic `import()`
within a file. If the memo from one test leaks into another, the "no env vars"
assertions could pass for the wrong reason. Use `vi.resetModules()` in a
`beforeEach` (or `await import` after a reset) so each test gets a fresh module
instance and a fresh `memo`. Confirm the first test genuinely runs with a
freshly-loaded module and unset env.
🗣 Make sure each test starts with an empty coffee pot, or a pot left full by the
previous test will fool you into thinking the machine deferred when it didn't.

---

## Ordered, atomic steps (each independently committable)

> Recommended grouping for review sanity: Steps 1–2 are one commit (new file +
> its test, TDD pair), Step 3 one commit (codemod), Steps 4–8 one commit
> (delete + config sync), Step 9 a trailing doc commit. All on a feature branch
> off `main` (not directly on `main`).

### Step 1 — Write the lazy client (TDD red first)
- First add `tests/unit/adapters/supabase/client.test.ts` (sketch above). Run
  `npm test -- client.test` → it should FAIL (file under import doesn't exist
  yet). That's the red.
- Create `lib/adapters/supabase/client.ts` (sketch above). Re-run → GREEN.
- Verify `client.ts` imports nothing from `@/lib` (no cycle):
  `grep -n "@/lib" lib/adapters/supabase/client.ts` → expect no matches.

### Step 2 — (covered in Step 1) confirm memoization + lazy assertions pass
- All three cases in `client.test.ts` green.

### Step 3 — Codemod all 88 import paths
Run from repo root. Handles both quote styles; scoped to source, excludes
`node_modules` and the to-be-deleted `lib/supabase.ts` itself.

```bash
# macOS/BSD sed (this repo is on darwin) — note the empty '' after -i
grep -rl "from ['\"]@/lib/supabase['\"]" \
  --include="*.ts" --include="*.tsx" \
  app lib \
  | grep -v 'node_modules' \
  | grep -v '^lib/supabase.ts$' \
  | xargs sed -i '' \
      -e "s#from '@/lib/supabase'#from '@/lib/adapters/supabase/client'#g" \
      -e 's#from "@/lib/supabase"#from "@/lib/adapters/supabase/client"#g'
```

**Verify zero stragglers (must return zero):**
```bash
grep -rn "from ['\"]@/lib/supabase['\"]" --include="*.ts" --include="*.tsx" . \
  | grep -v node_modules
# expected: no output
```

**Sanity that the rename actually landed on the expected count:**
```bash
grep -rln "from ['\"]@/lib/adapters/supabase/client['\"]" \
  --include="*.ts" --include="*.tsx" app lib | grep -v node_modules | wc -l
# expected: 88
```

> Note: the codemod intentionally does NOT touch the new `client.ts` (it doesn't
> import from `@/lib/supabase`), nor any test/eslint mirror (handled explicitly
> in Steps 6–7 so the change is reviewable, not silently sed'd).

### Step 4 — Delete the old client
```bash
git rm lib/supabase.ts
```

### Step 5 — Delete the test env-stub shim
```bash
git rm tests/setup.ts
```

### Step 6 — Remove `setupFiles` from `vitest.config.ts`
- Delete line 9: `setupFiles: ["./tests/setup.ts"],`.
- Leave the rest of the config untouched. (Integration config has no reference —
  do not touch `vitest.integration.config.ts`.)

### Step 7 — Update `.eslintrc.json`
- **Override files array (line 18):** change
  `["lib/supabase.ts", "lib/adapters/supabase/**/*.ts", "tests/**"]`
  → `["lib/adapters/supabase/**/*.ts", "tests/**"]`
  (the glob already covers the moved file).
- **Forbidden-message text — appears TWICE** (root rule line 10, and the
  services/usecases override line 32). Both currently read:
  `"Use supabaseService from @/lib/supabase for app code, or add an adapter under lib/adapters/supabase/ for vendor-specific operations. See ADR-0003 (FREEZE rule)."`
  **Decision: update the path in BOTH copies** to keep the message pointing at a
  file that exists, and keep the two copies identical:
  `"Use supabaseService from @/lib/adapters/supabase/client for app code, or add an adapter under lib/adapters/supabase/ for vendor-specific operations. See ADR-0003 (FREEZE rule)."`
  🗣 The "do this instead" hint in the lint error currently points to a file
  we're deleting. Repoint both copies of the hint to the new address, and keep
  them word-for-word identical so the tripwire test stays valid.

### Step 8 — Sync the pinning test `tests/unit/lint/no-supabase-sdk.test.ts`
This MUST move in lockstep with Step 7 or the suite fails. Three edits:
- **`FORBIDDEN_MESSAGE` (lines 34–37):** change the embedded
  `@/lib/supabase` → `@/lib/adapters/supabase/client` so it matches the new
  eslintrc message **verbatim** (case 5 asserts substring equality).
- **`f04Config.overrides[0].files` (line 73):** drop `"lib/supabase.ts"` →
  `["lib/adapters/supabase/**/*.ts", "tests/**"]`, mirroring Step 7.
- **Case (2) (lines 126–132):** it lints `lib/supabase.ts` and expects 0 errors.
  Since that file is gone and the override no longer lists it, change the test
  file path to a path the new override DOES cover, e.g.
  `lib/adapters/supabase/client.ts`. (Update the `it(...)` description too:
  "allows the import in lib/adapters/supabase/client.ts (central client)".)
  - Note: case (3) already lints `lib/adapters/supabase/OrdersRepository.ts` and
    expects 0 — fine to keep; case (2) now proves the *client* file specifically.
- Run `npm test -- no-supabase-sdk` → all 6 cases green.

### Step 9 — Doc-sync ADR-0003 (non-blocking, trailing commit)
- In `docs/adr/0003-strangler-fig-migration-and-freeze-rule.md:21`, update the
  parenthetical that names the allow-list to drop `lib/supabase.ts` and reflect
  that the shared client now lives at `lib/adapters/supabase/client.ts`. Keep the
  88-route footprint statement (still accurate). This is documentation hygiene;
  it does not gate the build.

---

## TDD test plan

| Layer | What proves it | Command |
|---|---|---|
| Unit (new) | `client.test.ts`: import with no env doesn't throw; proxy reference doesn't construct; `getSupabaseService()` memoized | `npm test -- client.test` |
| Unit (pinning) | `no-supabase-sdk.test.ts` 6 cases green after path/message sync | `npm test -- no-supabase-sdk` |
| Unit (whole suite, the headline proof) | All **1533** tests green **with `tests/setup.ts` deleted** — proof module-load is env-clean | `npm test` |
| Lint | 0 problems; new file allow-listed via existing glob | `npm run lint` |
| Types | 0 errors | `npm run typecheck` |
| Integration | All **122** green (real client still constructs lazily on first query and works) | `npm run db:up` → `npm run db:reset` → `npm run test:integration` |

> The single most important acceptance signal: `npm test` stays green **after**
> `tests/setup.ts` is gone. If it fails with "supabaseUrl is required", some path
> is still constructing eagerly — stop and find the eager access; do not re-add
> the shim.

---

## Acceptance criteria (from locked spec)

1. `npm run typecheck` → 0 errors (baseline 0).
2. `npm run lint` → 0 problems (baseline 0).
3. `npm test` → all **1533** green, **with `tests/setup.ts` removed**.
4. `npm run test:integration` → all **122** green (after `db:up` + `db:reset`).
5. `grep -rn "from ['\"]@/lib/supabase['\"]"` (excl. node_modules) → **zero** matches.
6. `lib/supabase.ts` and `tests/setup.ts` no longer exist.
7. `lib/adapters/supabase/client.ts` exists, exports `getSupabaseService` +
   `supabaseService`, imports nothing from `@/lib` (no cycle).

---

## Risk Assessment

### Concurrency / race conditions — **LOW**, no must-fix
The memo is a plain module-level `let memo` with a null-check. Node module
execution is single-threaded; there is no concurrent first-call hazard in this
runtime. Worst case under a contrived race would be two `createClient` calls
returning two instances — but that cannot happen on Node's single event loop for
synchronous getter bodies. **Mitigation:** keep `getSupabaseService` body fully
synchronous (no `await` between the null-check and the assignment) — the sketch
already is. **Must-fix:** no.
🗣 Only one cook in this kitchen at a time, so the "did someone already start the
coffee?" check can't be fooled. Just keep that check and the pour in one
uninterrupted move.

### Security — **LOW**, no must-fix
Same service-role key, same server-only boundary, same vendor. The file gains no
`"use client"` directive and is imported only by server code. No secret moves to
the browser bundle. The proxy does not log or expose the key. **Mitigation:**
confirm `client.ts` has no `"use client"` and is never imported by a
`components/**` or client-hook file (grep after codemod: the 88 importers are all
`app/api/**`, `lib/adapters/**`, `lib/road-times.ts` — all server). **Must-fix:**
no.

### Data migration — **NONE**
No schema, no migration, no data touched. "No material risk in this category."

### Business-logic flaws — **MEDIUM**, no must-fix (but the headline correctness risk)
The whole task hinges on the lazy proxy being behaviourally identical to the old
eager client for all 88 call-sites. Two specific traps:
1. **Incomplete proxy traps.** A `get`-only proxy would mishandle `'x' in client`
   / `Object.keys(client)` probes the SDK may perform. **Mitigation:** implement
   the full trap set in the sketch (`get/has/set/ownKeys/
   getOwnPropertyDescriptor/getPrototypeOf`). The integration suite (122 tests
   making real queries) is the proof.
2. **An eager top-level property access slipping in.** Verified today: **0**
   top-level `supabaseService.<prop>` accesses; the 80 `const supabase =
   supabaseService` lines are plain references (safe). **Mitigation:** the new
   `client.test.ts` "holding the reference doesn't construct" case + the
   `npm test`-without-shim acceptance gate catch any regression. **Must-fix:**
   no, because both are covered by tests in the plan; but they ARE the things
   most likely to go wrong, so the implementer must not skip the full trap set or
   the no-shim test run.
🗣 The receptionist must be a flawless stand-in. The big check is running the
real integration tests (which actually make 122 database calls through the
receptionist) and running the unit suite with its training wheels removed — if
both pass, the stand-in is genuinely indistinguishable.

### Launch blockers / operational — **LOW**, no must-fix
- **Stale-file break:** if the codemod misses a quote variant, `npm run
  typecheck` fails fast (import resolves to a deleted file). **Mitigation:** the
  zero-straggler grep in Step 3 + typecheck gate. Self-catching.
- **Missing setupFiles break:** deleting `tests/setup.ts` without editing
  `vitest.config.ts:9` makes vitest fail on a missing setup file. **Mitigation:**
  Steps 5 and 6 are paired; do them together.
- **Pinning-test/eslint drift:** changing the eslint message without updating
  `FORBIDDEN_MESSAGE` fails case (5). **Mitigation:** Steps 7 and 8 are paired.

**Risk headline: no must-fix risks. No Gate-2 blockers.** The MEDIUM
business-logic item is fully covered by tests already specified in the plan; it
is a "do not cut corners on the proxy trap set and the no-shim test run" caution,
not an unresolved blocker.

---

## Rollback

Single feature branch; nothing ships to `main` until all gates pass. If a gate
fails and can't be quickly fixed:
- `git checkout -- .` / `git restore .` to discard working-tree edits, or
- `git reset --hard <pre-task-commit>` to drop the whole branch state.

The change is self-contained (no DB, no migration, no infra), so rollback is a
pure code revert with zero external side effects. If a problem surfaced only
after merge, reverting the merge commit fully restores the prior behaviour,
including re-adding `lib/supabase.ts` and `tests/setup.ts`.
🗣 Nothing here leaves the codebase — no database change, no deployment switch —
so undo is just "throw away the edits". Even after merge, one revert puts
everything back exactly as it was.

---

## Hexagonal verdict (Gate-2 input)

- **Port used/added:** none. This IS the vendor-client wiring that sits *inside*
  the adapter layer; it is below the port boundary. The existing repos
  (`OrdersRepository`, etc.) remain the ports' adapters; they keep consuming this
  client.
- **Adapter:** `lib/adapters/supabase/client.ts` — the shared Supabase
  service-role client, now correctly inside `lib/adapters/supabase/`.
- **New dependencies:** none. No `package.json` change.
- **Single-use vendor wrapped?** N/A — no new vendor. `@supabase/supabase-js`
  stays confined to `lib/adapters/supabase/**` (now including `client.ts`), which
  is exactly the allowed location.
- **Rip-out test:** **PASS** — and slightly *improved*. Swapping the Supabase
  client still touches one adapter file (`client.ts`) plus its consumers, and the
  vendor SDK import surface is now fully inside `lib/adapters/supabase/` rather
  than leaking out to `lib/supabase.ts`. The boundary is unchanged in count and
  cleaner in shape.

🗣 We didn't add a new socket or a new vendor — we tidied the one Supabase plug
into the Supabase box and made it draw power only on demand. Ripping out Supabase
tomorrow costs no more than before, and arguably less, because all its wires now
live in one box.
