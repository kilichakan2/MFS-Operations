# F-PROD-04 Pass 1 — HACCP label-printing regression hardening

**Date:** 2026-06-29
**Phase:** FORGE Order (plan) — spec locked at Gate 1
**Slug:** fprod04-pass1-print-regression-hardening
**Author:** forge-planner

---

## Objective

Make a dead/unverified session **impossible to fail silently** on the HACCP label-print
path. Today, when the session cookie is expired/legacy, the print fetch is transparently
redirected to the login page, the code mistakes that 200 HTML page for a label, and either
prints garbage or nothing — with no error shown. This pass detects "this is not a real
label" and surfaces a clear "session expired — log in again" message using each page's
**existing** error UI, instead of printing.

🗣 In plain English: when the tablet's login has quietly gone stale, tapping "print" right
now produces a silent dud. After this fix it pops up a plain "you've been logged out, log
in again" message instead of pretending it worked. No new buttons, no new look — just the
print path learning to tell a real label from a login screen.

**Out of scope (hard guards — see Scope Guards below):** no `/api/labels` auth changes, no
`middleware.ts` changes, no session/cookie logic, no `Printer` port (Pass 2), no new label
fields (Pass 3), no new UI component or styling.

---

## Root-cause recap (verified against the code)

- The Sunmi V3 Android app is a thin Capacitor remote-URL shell — it loads the live site
  (`capacitor.config.ts` `server.url = https://mfsops.com`). All app logic, including the
  print client, is the live web code.
  🗣 The "app" on the device is really just a browser pointed at the website, so a website
  bug is a device bug.

- On 2026-06-12, auth-sprint commit `88af11d` (T1) made `middleware.ts` HMAC-verify the
  `mfs_session` cookie and **fail closed** on any legacy/forged/unverified cookie. Verified
  at `middleware.ts:121-134`: `sessionTokens.verify(sessionCookie)` returning falsy →
  `NextResponse.redirect(...)` to `/login` (with the cookie cleared).
  🗣 The new lock rejects old-style passes; an out-of-date tablet gets bounced to the login
  page on every request.

- `/api/labels` is listed in `SHARED_API_PATHS` (`middleware.ts:80`) but **not** in
  `PUBLIC_PATHS`. Its path does **not** start with `/haccp`, so on an unverified cookie the
  middleware takes the **`/login`** branch (`middleware.ts:129-133`), NOT the `/haccp`
  kiosk branch. This is the key fact behind the detection signal: a dead session on the
  label fetch lands on **`/login`**.
  🗣 Important detail: the label request, when logged out, always ends up at `/login` — a
  fixed, recognisable address we can test for.

- The print client `printLabelInApp` (`app/haccp/delivery/page.tsx:32-65`) does
  `const res = await fetch(url)` and checks **only** `res.ok`. `fetch` follows the redirect
  transparently and lands on the login page, which returns **200 with HTML**. So `res.ok`
  is `true`, the code reads `res.text()` (the login page's HTML), writes it into a hidden
  iframe, and calls `print()`. Silent failure, no error surfaced.
  🗣 The current check only asks "did the server answer OK?" — and the login page answers OK.
  It never asks "is this actually a label?", so it happily prints the wrong page.

- The label success response sets `Content-Type: text/html` (`app/api/labels/route.ts:151-156`,
  value `'text/html'` from `lib/printing/index.ts:64,72`). The login page is **also**
  `text/html`, so Content-Type alone cannot distinguish them — the redirect signal must.
  🗣 Both the real label and the login page are "web pages", so we can't tell them apart by
  type alone — we tell them apart by *where the request ended up*.

---

## Files to change (exact)

| # | File | Change |
|---|------|--------|
| 1 | `lib/printing/labelFetch.ts` **(NEW)** | Shared, testable helper: a pure classifier + a thin fetch+print wrapper. Holds the detection logic once (DRY — both pages duplicate the bug today). |
| 2 | `app/haccp/delivery/page.tsx` | Replace the local `printLabelInApp` (lines 32-65) with a call into the shared helper; add an auth-bounce error state wired to the page's existing `submitErr` mechanism; thread the error setter through `handlePrint58` and the four `printLabelInApp` call sites. |
| 3 | `app/haccp/mince/page.tsx` | Replace the local `printLabelInApp` (lines 17-43) with a call into the shared helper; surface the auth-bounce error via the page's existing `submitErr` mechanism at its single call site (the use-by dialog, line ~804). |
| 4 | `tests/unit/printing/labelFetch.test.ts` **(NEW)** | Unit tests for the pure classifier (`classifyLabelResponse`). |
| 5 | `tests/e2e/29-haccp-print-dead-session.spec.ts` **(NEW)** | Playwright dead-session E2E: corrupt the cookie, click print, assert the "log in again" message AND that no login-page HTML is written to a print iframe. |

**No** changes to: `middleware.ts`, `app/api/labels/route.ts`, `components/PrintLabelStrip.tsx`
(confirmed pure presentation — callbacks only, no fetch), `lib/printing/sunmi.ts`,
`capacitor.config.ts`, any migration, any session/cookie code.

---

## Does mince duplicate the bug? YES — duplicated, not shared

Confirmed by reading both files:

- `app/haccp/delivery/page.tsx:32-65` defines its **own** `printLabelInApp`.
- `app/haccp/mince/page.tsx:17-43` defines a **second, near-identical** `printLabelInApp`
  (same `fetch` → `res.ok`-only → iframe → print flow; same bug).

They are **not** shared. A fix in only one file leaves the other broken. Therefore the plan
extracts ONE shared helper (`lib/printing/labelFetch.ts`) and re-points both pages at it —
one fix covers both, and removes the duplication.

🗣 In plain English: the same broken print routine was copy-pasted into both the delivery
screen and the mince screen. Fixing one wouldn't fix the other, so we move the routine into
a single shared file and have both screens use it — fix once, both healed, and no more
copy-paste.

Call-site count to re-point:
- **Delivery (4):** detail-header 100mm (`:764`), 58mm via `handlePrint58` (`:88` fallback,
  `:91`), collapsed-row 100mm (`:1666`), collapsed-row 58mm via `handlePrint58` (`:1672`).
  Note `handlePrint58` calls `printLabelInApp` as the Sunmi-bridge fallback (`:88`) and on
  the non-Sunmi path (`:91`) — both must carry the error setter.
- **Mince (1):** use-by dialog `onPointerDown` (`:804`).

---

## Chosen detection approach (with justification)

### The signal

Primary signal: **the fetch landed on the login page.** After a same-origin redirect,
`fetch` exposes:
- `res.redirected === true` — a redirect was followed, and
- `res.url` — the FINAL url (e.g. `https://mfsops.com/login?from=/api/labels`).

Classification rule (the pure function `classifyLabelResponse`):

```
A response is an AUTH BOUNCE (not a real label) if ANY of:
  1. res.redirected === true   AND   new URL(res.url).pathname starts with '/login'
  2. new URL(res.url).pathname starts with '/login'   (covers redirect even if the
     redirected flag is ever unreliable across runtimes)
A response is a HARD ERROR if:
  3. !res.ok   (401/404/500 etc — current behaviour, kept)
Otherwise it is a REAL LABEL.
```

Belt-and-braces body guard (low-false-positive, applied only as a secondary check on the
text, NOT as the primary signal): after `res.text()`, if the body contains a login-page
fingerprint (e.g. the login form markup) and lacks the label fingerprint, treat as auth
bounce. This is a defensive backstop in case a future redirect target changes; the redirect
URL check is the load-bearing signal. **Recommended: keep the body guard minimal** — match
on a single stable label marker the renderer always emits (e.g. the `batch_code` text /
a known label container) rather than trying to fingerprint the login page, to avoid false
positives if the login page is restyled. If a robust label marker is not cheaply available,
the body guard MAY be omitted — the redirect-URL signal is sufficient and is what the tests
pin. The implementer decides at Render and records the choice in the helper's doc comment.

🗣 In plain English: the reliable tell is "did this request get sent to the login page?" —
because a real label request stays on the label address. We check the final address the
request ended up at. We also keep the old "did it error out?" check. An optional extra
sniff of the page contents is a belt-and-braces backstop, but we keep it cautious so we
never mistake a real label for a login bounce.

### `redirect: 'manual'` vs detecting `res.redirected` — recommendation

**Recommend `res.redirected` / `res.url` (the default `redirect: 'follow'`), NOT
`redirect: 'manual'`.**

- With `redirect: 'manual'`, a same-origin redirect in the browser yields an **opaque-redirect**
  response: `res.type === 'opaqueredirect'`, `res.status === 0`, `res.url === ''`, and the
  body/headers are unreadable. You'd detect *a* redirect happened, but you could not read
  the destination, and `res.ok` is `false` (status 0) so it'd already fall into the hard-error
  bucket — usable, but it gives you *less* information and behaves inconsistently across
  fetch implementations and the Sunmi WebView.
  🗣 "Manual" mode slams the door the instant a redirect starts — you learn a redirect
  happened but not where to, and different browsers/WebViews report it differently. That's
  more fragile, not less.

- With the default follow mode, `res.redirected` + `res.url` give a clean, readable,
  positively-identifiable destination (`/login`) and work uniformly in Chromium and the
  Android WebView. It is also trivially unit-testable with a faked `Response`-like object.
  🗣 The default mode lets the request finish and then tells us exactly where it landed —
  more information, more reliable, and easy to test.

**Decision: default follow mode + `classifyLabelResponse(res)` reading `res.redirected` and
`res.url`.** The body guard above is the only place we read `res.text()`, and only after
classification says "real label" (so we never print a bounce, and we never iframe login HTML).

---

## Reuse-existing-error-UI decision (named mechanism)

**Delivery page** — reuse the existing **`submitErr` state + its red inline `<p>`**:
- State: `const [submitErr, setSubmitErr] = useState('')` (`app/haccp/delivery/page.tsx:1014`).
- Render: `{submitErr && <p className="px-4 pb-2 text-red-600 text-xs">{submitErr}</p>}`
  (`:1551`).
- Already used for load/submit failures (`:1032`, etc).
- The print handlers will call `setSubmitErr('Session expired — please log in again to print.')`
  on an auth bounce, and `setSubmitErr('Could not print label — please try again.')` on a
  hard error.

**Mince page** — reuse the existing **`submitErr` state + its render**:
- State: `const [submitErr, setSubmitErr] = useState('')` (`app/haccp/mince/page.tsx:487`).
- Already surfaced for load/submit failures (`:505`, `:585`, `:598`, `:600`, `:609` …).
  The implementer must confirm `submitErr` is rendered on the mince page and place the
  auth-bounce message through the same render path; if the only current render is form-scoped,
  surface it where the print action lives (the use-by dialog / record list) using the SAME
  `submitErr` styling — do **not** invent a new toast/banner/component.

🗣 In plain English: both screens already have a little red "something went wrong" line they
use for save/load failures. We reuse exactly that line for the print failure — same colour,
same place, same code path. No new pop-up, no new style. This honours project decision #17
(one design system, no style leaking into screens).

**No new UI component, no new styling, no new dependency** is introduced. The message text
is the only new string.

---

## Step-by-step implementation

### Step 0 — recon guard (implementer, before editing)
`grep -n "printLabelInApp" app/haccp/delivery/page.tsx app/haccp/mince/page.tsx` and confirm
the call-site list above is exhaustive (4 in delivery, 1 in mince). Confirm `submitErr` is
rendered on the mince page (`grep -n "submitErr" app/haccp/mince/page.tsx`) and note where.
🗣 Double-check nothing moved since this plan was written before changing anything.

### Step 1 — create the shared helper `lib/printing/labelFetch.ts`
Pure, framework-free, no vendor imports. Two exports:

1. `export type LabelResponseKind = 'label' | 'auth-bounce' | 'error'`
2. `export function classifyLabelResponse(res: { ok: boolean; redirected: boolean; url: string; status: number }): LabelResponseKind`
   — implements the classification rule above. Pure, synchronous, fully unit-testable. Reads
   `res.url` via `new URL(res.url).pathname` guarded by a try/catch (a relative/empty url →
   treat as `'error'` rather than throw).
3. `export async function printLabelInApp(url: string, onError: (kind: 'auth-bounce' | 'error') => void): Promise<void>`
   — the fetch+iframe+print flow moved out of the two pages **verbatim** (same iframe style,
   same `onload`/`setTimeout(...,300)`/`setTimeout(...,2000)` timings, same cleanup), with
   the success path GATED on `classifyLabelResponse(res) === 'label'`. On `'auth-bounce'` or
   `'error'` it calls `onError(kind)` and returns WITHOUT writing anything to an iframe.

🗣 In plain English: one new file holds the single correct print routine. It still prints
real labels exactly as before (same timings, same hidden-iframe trick), but now it first
asks "is this a real label?" and, if not, calls back to the screen with the reason instead
of printing.

The decision logic stays a **pure function** so ANVIL can unit-test it without a browser.

### Step 2 — re-point the delivery page
- Delete the local `printLabelInApp` (`:32-65`).
- `import { printLabelInApp } from '@/lib/printing/labelFetch'`.
- Add a small page-level error handler that maps the helper's `onError(kind)` to
  `setSubmitErr(kind === 'auth-bounce' ? 'Session expired — please log in again to print.'
  : 'Could not print label — please try again.')`.
- Thread that handler into all four call sites and into `handlePrint58` (both its `:88`
  fallback and `:91` non-Sunmi path). `handlePrint58` gains an `onError` param (or closes
  over the page setter).
- Do NOT touch the Sunmi bridge path in `handlePrint58` other than passing `onError` into
  the `printLabelInApp` fallback.

### Step 3 — re-point the mince page
- Delete the local `printLabelInApp` (`:17-43`).
- `import { printLabelInApp } from '@/lib/printing/labelFetch'`.
- At the use-by-dialog call site (`:804`), pass an `onError` that calls `setSubmitErr` with
  the same two messages, surfaced via the page's existing `submitErr` render path.

### Step 4 — unit tests (`tests/unit/printing/labelFetch.test.ts`)
Cover `classifyLabelResponse` (see Test matrix).

### Step 5 — Playwright dead-session E2E (`tests/e2e/29-haccp-print-dead-session.spec.ts`)
See Test matrix. Tag `@critical` so it runs in the preview smoke gate.

### Step 6 — verify
`npx tsc --noEmit`, `npm run lint`, `npm run test:unit` (or vitest filter on the new file),
then the E2E per the runbook. No migration, so no `db:reset` needed for schema.

---

## Test matrix (for ANVIL)

### Unit — `classifyLabelResponse` (pure, no browser)

| Case | Input (`ok`, `redirected`, `url`, `status`) | Expected |
|------|---------------------------------------------|----------|
| Real label, no redirect | `true, false, 'https://mfsops.com/api/labels?...', 200` | `'label'` |
| Auth bounce (redirected to /login) | `true, true, 'https://mfsops.com/login?from=/api/labels', 200` | `'auth-bounce'` |
| Auth bounce, redirected flag false but url is /login | `true, false, 'https://mfsops.com/login', 200` | `'auth-bounce'` |
| Hard error 401 | `false, false, 'https://mfsops.com/api/labels?...', 401` | `'error'` |
| Hard error 404 | `false, false, '.../api/labels?...', 404` | `'error'` |
| Hard error 500 | `false, false, '.../api/labels?...', 500` | `'error'` |
| Malformed/empty url | `true, false, '', 200` | `'error'` (guarded, no throw) |
| /login as a substring but not the path (e.g. `/api/labels?from=/login`) | `true, false, 'https://mfsops.com/api/labels?from=/login', 200` | `'label'` (we match `pathname`, not the raw string) |

🗣 In plain English: these tiny tests prove the "is it a real label?" decision is right for
every shape of answer — a genuine label, a login bounce, a server error, and tricky
look-alikes — without needing a phone or a browser.

### Playwright dead-session E2E — `29-haccp-print-dead-session.spec.ts` (`@critical`)

Flow (no physical device needed — the app is the live web app):
1. `loginAs(page, 'warehouse')` via `tests/e2e/_auth.ts`; `page.goto('/haccp/delivery')`.
   (Pre-req: at least one delivery row with a batch number so a print button renders. The
   spec may first log a delivery via the existing happy-path steps from
   `12-haccp-delivery.spec.ts`, or rely on seed data — implementer picks the cheaper stable
   option and documents it.)
2. **Kill the session:** corrupt/delete the `mfs_session` cookie to simulate the expired/
   legacy state — e.g. `await page.context().addCookies([{ name: 'mfs_session', value:
   'tampered-legacy-value', domain, path: '/' }])` (an unverifiable value → middleware
   fails closed → 307 to /login), OR clear just that cookie. Do NOT navigate (a navigation
   would itself redirect the page); leave the print button on screen.
   🗣 We swap the tablet's valid pass for an out-of-date one, exactly like what happened in
   the field, while staying on the print screen.
3. **Click a print button** (100mm or 58mm on a delivery row).
4. **Assert the error is shown:** `expect(page.getByText(/log in again/i)).toBeVisible()`
   (matches the `submitErr` message).
5. **Assert NO login HTML was printed:** assert no iframe containing login-page markup was
   appended — e.g. `expect(page.locator('iframe')).toHaveCount(0)` after the action settles
   (the helper returns before creating an iframe on a bounce), and/or assert the login form
   markup never appears inside any iframe. Optionally stub `window.print` via
   `page.addInitScript` to record calls and assert it was **not** called.
   🗣 We prove two things: the staff member sees "log in again", and the app did NOT shove a
   login page into the printer.
6. (Optional second case) Repeat the kill-then-print on `/haccp/mince` via the use-by dialog
   to pin the mince fix too.

Reference patterns: `tests/e2e/12-haccp-delivery.spec.ts` (delivery screen selectors, login
helpers, `@critical` tag), `tests/e2e/_auth.ts` (login/logout, `clearCookies`).

**ANVIL right-sizing:** this is a client-path robustness change with NO DB/RLS/migration and
NO new vendor. Required rungs: **unit** (classifier) + **Playwright dead-session E2E**
(delivery, plus mince case). pgTAP/integration/PITR are **N/A** (no DB or schema touched) —
state that explicitly in the cert. A focused browser walk of the print path on a preview is
the confidence layer; no full every-button sweep is owed (no UI redesign).

### On-device optional sanity check (NOT required for this pass)

The native Sunmi bridge is untouched, so on-device confirmation is **not required** to ship.
Hakan MAY optionally, on the Sunmi V3:
1. Open the app, go to HACCP → Delivery, confirm a normal label still prints (regression).
2. Force the dead-session state (leave the app idle past session expiry, or reinstall the
   older APK that exhibited the bug, then reopen) and tap print → confirm the on-screen
   "log in again" message appears and **nothing** prints.
3. Log in again, tap print → confirm a real label prints.

🗣 In plain English: you don't need the printer to trust this fix — the browser test proves
it. But if you want to see it with your own eyes, the three taps above show: normal printing
still works, a logged-out tap now warns instead of misprinting, and logging back in restores
printing.

---

## Scope guards (hard — do not cross)

- ❌ Do NOT change `/api/labels` route auth (`app/api/labels/route.ts`). It is correct.
- ❌ Do NOT change `middleware.ts` or any session/cookie/HMAC logic. It is correct.
- ❌ Do NOT add a `Printer` port/adapter — that is **Pass 2**.
- ❌ Do NOT add or change label data fields — that is **Pass 3**.
- ❌ Do NOT re-architect printing beyond extracting the one shared helper.
- ❌ Do NOT introduce a new UI component, toast library, or new styling — reuse `submitErr`.
- ❌ Do NOT touch the Sunmi native bridge (`lib/printing/sunmi.ts`) or `capacitor.config.ts`.

### Sunmi `getSupplierCode` dead-session behaviour — OUT OF SCOPE (explicit)

`lib/printing/sunmi.ts` `getSupplierCode` (`:105-116`) fetches `/api/haccp/supplier-code`.
On a dead session that fetch will also bounce, but the function already **degrades
gracefully**: any non-ok / throw falls back to `supplierName.slice(0,4).toUpperCase()` — a
4-char code, not a crash and not a misprint. The native bridge still prints a real (if
slightly degraded) label, and the broader auth problem is fixed by the user logging back in.
**Leave `getSupplierCode` and the entire `sunmi.ts` bridge untouched this pass.** The
implementer must NOT add auth handling there.

🗣 In plain English: the Sunmi path's supplier-code lookup already has a safe fallback (a
short code) when logged out — it never misprints a login page. It's the browser/iframe path
that was broken. We fix only that and deliberately don't touch the native printer code.

---

## Hexagonal / rip-out note — N/A (justified)

This pass adds **no external dependency** and introduces **no port/adapter**. It is pure
UI-layer (presentation) robustness: client code that already lived in `app/**` is moved into
a small shared module under `lib/printing/` (the same place the existing `sunmi.ts`,
`html.ts`, `zpl.ts` label helpers live) and made testable. No vendor SDK is imported; no DB,
auth, payments, or storage seam is created or crossed.

- **Port used/added:** none. The fetch is to the app's own `/api/labels` route (first-party),
  not a vendor.
- **Adapter:** none.
- **New dependencies:** none (no `package.json` change).
- **Rip-out test:** N/A — there is no vendor to rip out. The "swap a vendor = one adapter +
  one wiring line" test does not apply to in-app presentation logic.
- **Boundary rules:** the new file `lib/printing/labelFetch.ts` imports nothing from
  `lib/adapters/**` and no vendor SDK, so it violates no inward-dependency rule. `app/**`
  importing from `lib/printing/**` (an owned, vendor-free module) is allowed — this is not
  an `lib/adapters/**` import.

🗣 In plain English: the Lego rules are about swapping outside vendors (database, payments,
etc.). This change touches none of those — it just tidies and hardens our own print routine
inside our own code — so the "how many files change if we swap the vendor?" test simply
doesn't apply here. Nothing new gets plugged into a socket.

---

## Risk Assessment (mandatory)

### Concurrency / race conditions
- **Double-tap / rapid re-print while a fetch is in flight** — severity LOW. The helper
  creates a fresh iframe per call and cleans up on its own timers; an auth bounce now creates
  no iframe. No shared mutable state is introduced. Mitigation: none required; behaviour is
  no worse than today. Must-fix: NO.
- No other concurrency surface (no DB writes, no shared cache).

### Security
- **No auth weakening** — severity NONE/INFORMATIONAL. The fix is strictly client-side and
  makes the failure mode *safer* (it stops rendering an arbitrary fetched HTML page into an
  iframe and printing it). It does not relax any server check. The login page HTML is no
  longer injected into a same-origin iframe and printed — a small reduction in attack
  surface. Mitigation: the body guard (if used) must match a positive label marker, not
  execute fetched content. Must-fix: NO.

### Data migration
- **None** — severity NONE. No schema, no migration file, no `db:reset`. Confirmed no DB or
  RLS touched. Must-fix: NO.

### Business-logic flaws
- **False positive: a real label misclassified as an auth bounce → staff blocked from
  printing a valid label** — severity MEDIUM (HACCP labels are compliance-critical).
  Mitigation: the load-bearing signal is the redirect URL `/login`, which only occurs on an
  actual auth bounce; the body guard is kept minimal/optional and matches a positive label
  marker (no login-page fingerprinting) to avoid false positives if the login page is
  restyled; the substring-vs-pathname test case pins that `/api/labels?from=/login` is NOT
  misclassified. Unit tests cover every shape. Must-fix: NO (mitigated by design + tests).
- **False negative: a future redirect target other than `/login`** — severity LOW. The
  `!res.ok` hard-error branch still catches non-2xx; an unexpected 2xx redirect elsewhere is
  not currently producible by the middleware (it only redirects dead sessions to `/login` or
  `/haccp`, and `/api/labels` takes the `/login` branch). If `/haccp` were ever the target,
  the classifier should also treat `/haccp` (the kiosk login) as a bounce — implementer note:
  optionally include `/haccp` in the bounce-path check for robustness (low cost, no false
  positives since `/api/labels` never legitimately resolves to a page). Must-fix: NO.

### Launch blockers
- **Mince page `submitErr` not rendered where the print action is** — severity LOW/MEDIUM.
  If the mince page's `submitErr` is only rendered in a form-scoped location not visible from
  the print (use-by) flow, the message could be shown off-screen. Mitigation: Step 0 recon
  requires confirming the render location; surface the message via the same `submitErr`
  styling where the print action lives. Must-fix: NO (handled by recon step), but the
  implementer MUST verify visibility in the E2E mince case.

**Risk headline:** No must-fix risks. The one MEDIUM risk (false-positive blocking a valid
label print) is design-mitigated (redirect-URL primary signal, minimal optional body guard)
and pinned by unit tests including the look-alike case. Nothing blocks Gate 2.

---

## Acceptance criteria

1. On a dead/unverified session, tapping any print button on `/haccp/delivery` and
   `/haccp/mince` shows a clear "session expired — log in again" message via the existing
   `submitErr` UI, and **no** login-page HTML is written to an iframe or printed.
2. On a valid session, all existing print paths (delivery 100mm/58mm collapsed + detail,
   mince use-by dialog, Sunmi bridge fallback) still print real labels with byte-identical
   behaviour (same iframe timings).
3. `classifyLabelResponse` is a pure function with full unit coverage (table above all green).
4. A `@critical` Playwright dead-session E2E passes for the delivery print path (and the
   mince path if included).
5. No changes to `middleware.ts`, `app/api/labels/route.ts`, session/cookie logic,
   `lib/printing/sunmi.ts`, or `capacitor.config.ts`; no migration; no new `package.json`
   entry; no new UI component/styling.
6. `npx tsc --noEmit` and `npm run lint` clean.

---

## Commit / PR hygiene (project rule — overrides global default)

**HARD: NO AI references anywhere** — no `Co-Authored-By`, no "Claude", no robot emoji, in
commits, PR title/body, code, or comments. This overrides any global git-trailer default.
