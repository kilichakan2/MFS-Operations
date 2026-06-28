# HANDOVER → Terminal 1 — MFS-Operations UI design-system rebuild

**Written 2026-06-28 by the worktree terminal (Terminal 2), handing the UI rebuild over to Terminal 1.**
You are taking over the **from-scratch UI design-system rebuild**. Terminal 2 (the worktree session)
is being closed. This file + the roadmap are your entry point — read them, do not re-discover the work.

---

## 0 · First action — READ THESE, in order
1. `docs/plans/2026-06-28-ui-overhaul-roadmap.md` — **THE single source of truth** (status, all locked
   decisions, design handover, Phase-0 split, all 46 routes by section, full change log). Everything
   below is a summary of it; if they ever disagree, the roadmap wins (then fix this file).
2. `docs/plans/2026-06-28-ui-phase-0a-foundation.md` — the executed 0a plan.
3. `docs/reviews/2026-06-28-ui-phase-0a-foundation-review.md` — code-critic verdict (NO BLOCKERS).
4. `docs/anvil/2026-06-28-ui-phase-0a-foundation-cert.md` — ANVIL cert (**PENDING** — see §3).
5. `docs/adr/0009-ui-a11y-radix-and-component-test-stack.md` — the Radix + test-stack decision.
6. Memory `ui-rebuild-progress` (auto-loaded) + `ui-rebuild-section-discipline`.

## 1 · Where the work physically lives (git topology — important)
- **Worktree:** `/Users/hakankilic/MFS-Operations/.claude/worktrees/ui-system-rebuild` (a git worktree of
  the same repo). Continue working HERE — it has everything set up.
- **Branch with 0a on it:** `feat/ui-phase-0a-foundation` (currently checked out IN the worktree; 9 commits
  `b43142a`→`ca8a4ea` + a docs commit). **Unpushed. No PR. Not merged.**
- **Integration branch:** `worktree-ui-system-rebuild` (cut off clean `main`). The overhaul accumulates here.
- **`main`:** Terminal 1's Day-16 seal is **DONE**. Main is sealed/clean. The shared local Supabase DB is
  therefore **free now** (no other terminal using it).
- Note: a branch checked out in the worktree can't be simultaneously checked out elsewhere — just work in
  the worktree dir and you avoid that entirely.

## 2 · What 0a IS (and the one decision that shaped it)
0a = the **design-system foundation** (FORGE PR 1 of 3; see §6). It is presentation-layer only.
**Decision reversal you must know (roadmap decisions #12/#13):** the original "visually inert" plan (keep
the old colours) was **DROPPED** in favour of **fidelity to the Claude Design file** (`docs/design/
MFS-Operations-Design-System.dc.html`). So 0a carries the **real new design tokens verbatim**: new MFS
palette, Adieu (display) + Inter (body) via `next/font`, Plus Jakarta Sans **retired**, dark theme +
density modes scaffolded. **Consequence (expected, NOT a bug):** the 48 existing un-migrated screens now
show the new palette/fonts immediately. That is safe because nothing merges to `main` until the whole
overhaul is done + Hakan unlocks.

What 0a shipped (all committed, suite green 2710✓): `app/tokens.css` (verbatim from `docs/design/
phase0a-foundation-tokens.reference.css`), `globals.css` + `tailwind.config.ts` rewired to read the CSS
vars (double-declaration killed), Adieu+Inter wiring, vitest split into node `unit` + jsdom `component`
lanes, a semantic-tokens-only lint rule (scoped to `components/ui/**`, pinned by a test), and guards
(`token-resolve`, `vendor-fence` allow-lists `radix-ui`). NO real components yet (that's 0b).

## 3 · 0a's ONE open item — the pre-merge gate (cert is PENDING)
ANVIL passed every rung EXCEPT the clean-DB `@critical` E2E. It ran 62/75 — **all 13 failures were
ENVIRONMENTAL** (a dirty SHARED local DB left over from a prior F-20 run + a dev-server-only Leaflet
double-mount that's clean under a production build), **none from the 0a diff** (the failing screens
visibly carry the new tokens). Terminal 2 deferred it to protect the then-shared DB. **That blocker is
gone (main seal done → DB free).** To CLEAR the cert:
```
npm run db:up        # if not already up (needs Docker + Supabase CLI)
npm run db:reset     # DB is ours now — safe to wipe+reseed
npm run test:e2e:ui  # or: npx playwright test --project=chromium --grep @critical  (against a prod build)
# confirm 75/75 green → edit docs/anvil/2026-06-28-ui-phase-0a-foundation-cert.md: PENDING → CLEARED
```

## 4 · Decisions to confirm with Hakan before you act on them
- **Integration model (load-bearing, UNDECIDED):** does 0a merge to `main` now (main is sealed), OR does
  the whole overhaul keep accumulating on `worktree-ui-system-rebuild` and merge to `main` as one piece at
  the end? The roadmap's original intent was "merge the whole overhaul at the end, after Hakan unlocks."
  **Confirm which model Hakan wants** — it changes whether you open a 0a PR now or keep stacking.
- If merging anything to `main`: it goes through the normal gate (cert CLEARED first; the migration-lock
  hook blocks a merge without a cert). 0a has no migration → no PITR.

## 5 · Standing guardrails (do NOT break — roadmap §1)
- **Presentation layer ONLY:** `app/**` + `components/**` + token/tailwind/test config. NEVER touch
  `lib/ports|adapters|wiring/**` (import existing singletons only), `middleware.ts`, auth/RLS, `app/api/**`
  route auth, `.github/**`, Vercel settings. A new service/port/adapter ⇒ STOP, ask Hakan.
- **No new vendor SDK in the UI** except the already-approved `radix-ui` (a11y engine; allow-listed, not
  fenced — it's a presentation lib like recharts/lucide). Test-only devDeps are exempt.
- **No AI references** in commits, PRs, code, or comments.
- **Per-section discipline (Phase 1+):** every screen = requirements-audit FIRST (incl. proactive
  new-business-logic suggestions) → redesign on the new system → test to depth. Confirm each, NEVER batch.

## 6 · What's next after 0a — the build sequence
Phase 0 is **3 FORGE PRs**: **0a foundation (DONE, this handover)** → **0b core component library**
(~30 components, semantic-tokens only, absorbing `app/dashboard/admin/_components/primitives.tsx`; each
with keyboard/focus/ARIA/contrast tests) → **0c speculative (DEFERRED, build-on-demand)**. Then **Phase 1+**
= the 46 routes, section by section (roadmap §5 has the section list + suggested order: a small proof
section like Auth first, then Orders — sequencing still to confirm with Hakan).
Run each via the full FORGE loop + ANVIL. Build 0b on top of 0a (0a isn't on main yet).

## 7 · Deferred / loose ends (tracked — don't lose these)
- **7 brand SVGs NOT yet in repo** (`public/brand/logo-{navy,orange,white}.svg`,
  `star-icon-{navy,orange,sand,white}.svg`). Source: Claude Design project **"MFS OPS NEW"**
  `0e28a094-d725-42bd-8858-cd469b21a42d` via the **DesignSync** MCP (`get_file`, paths `assets/…`).
  Deferred because hand-transcribing vector art risks silent corruption + DesignSync isn't reachable inside
  subagents (only at the top-level session). Non-load-bearing for 0a (no test/build uses them). Pull them
  via the top-level session (DesignSync works there) before any screen needs a logo. The 2 Adieu fonts ARE
  already in repo + verified (`public/fonts/adieu/`).
- **`token-resolve.test.ts` hardening:** its `LEGACY_COLOR_NAMES` is a hand-maintained list, not a live
  content-grep — a future screen using an unlisted legacy colour name could slip past it. Make it derive
  from a content scan (0b hardening; code-critic non-blocking note).
- **DesignSync caveat:** the full design `.dc.html` on disk has its **last ~8KB truncated** (256KiB fetch
  cap) — that tail is the 0b component gallery. Re-pull the full file via DesignSync (top-level session)
  when you start 0b. The foundation tokens (top of the file) are complete.

## 8 · Reusable ops notes from the 0a run
- DesignSync MCP auth works at the **top-level session** but NOT inside spawned subagents (planner/
  implementer/anvil-runner couldn't reach it) — pull design assets from the conductor/top-level session.
- Binary assets (fonts) come back base64 from `DesignSync get_file` (`isBase64:true`) — decode by script,
  verify with `file` (expect "OpenType font data"). SVGs come back as raw text.
- Land ANVIL/test files WITH the code on the feature branch before any merge; only cert/review/docs go as
  follow-ups. Merge while ON the feature branch so the migration-lock hook matches the cert's bare
  `Branch:` line (no backticks).
