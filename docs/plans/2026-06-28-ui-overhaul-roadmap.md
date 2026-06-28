# MFS-Operations — UI Overhaul Roadmap (single source of truth)

> **This is the one place to track the whole UI-system rebuild.** Status, decisions, the design
> handover, Phase 0, and every screen in Phase 1+. Update the **Change log** at the bottom each
> session. Companion docs: `docs/ui-current-state.md` (inventory), `docs/design/2026-06-27-ui-system-brand-prompt.md`
> (the brief sent to Claude Design), `docs/plans/2026-06-27-ui-system-rebuild-process.md` (process contract).

**Status as of 2026-06-28 (Terminal-1):** ✅ Design delivered + reviewed (STRONG). ✅ **FORGE Phase 0a SHIPPED to `main`** — PR #93 squash `6a847fa`, cert CLEARED (clean-DB `@critical` **75/75** on a prod build), `smoke` required check green, merged CLEAN. **Production redeployed → reskin LIVE** (`mfs-operations.vercel.app` serves the new orange `#EB6619` + Inter on existing screens). **Next build step: 0b core component library.**
**Integration model = STEP BY STEP (decision #14):** main is sealed; 0a is in, 0b next, then each Phase-1 section (no longer accumulate-then-merge-at-end). **Reskin accepted + now LIVE (decision #15):** existing un-migrated screens carry the new palette/fonts on old layouts until Phase 1 rebuilds them — accepted as harmless on an internal staff tool. Weekly execution tracker: `docs/plans/2026-06-29-wc29-plan.md` (**`wc29`**). **After 0b (decision #16): pause UI → repo/docs cleanup on clean main → label printing F-PROD-04.**

```
LANE
  ✓ ui-cartographer   → docs/ui-current-state.md
  ✓ brand-prompt      → docs/design/2026-06-27-ui-system-brand-prompt.md
  ✓ Claude Design     → "MFS Operations Design System" (reviewed, build-ready)
  ✓ design pulled     → docs/design/MFS-Operations-Design-System.dc.html (on-disk source of truth)
  ▶ FORGE Phase 0     → 3 PRs: 0a foundation ✓ SHIPPED (PR #93) · 0b core library ● next · 0c speculative (deferred)
  ○ FORGE Phase 1+    → section by section (requirements-audit FIRST)
  ○ ANVIL             → per phase/section test gate
  ◐ MERGE             → STEP BY STEP (decision #14): 0a in; 0b next; then each section
```

---

## 1 · Isolation & guardrails (do not break)

- **Working location:** the **main working directory** (`/Users/hakankilic/MFS-Operations`). The old worktree (`.claude/worktrees/ui-system-rebuild`, branch `worktree-ui-system-rebuild`) was **retired 2026-06-29** — its isolation reason (the now-sealed 16-day sprint running in parallel on `main`) is gone. Cut each section's feature branch straight from `main` here.
- **Merge IS unlocked** (since 0a, PR #93). `main` is sealed/certified. Each section ships via feature branch → PR → the `smoke` required check. "Work in main" = the main *dir*, NOT committing directly onto the `main` branch.
- **Presentation layer only:** `app/**` + `components/**`. Do NOT touch `lib/ports/**`, `lib/adapters/**`, `lib/wiring/**` (import existing singletons only), `middleware.ts`, auth/RLS, `app/api/**` route auth, `.github/**`, Vercel settings. New service/port/adapter ⇒ STOP, coordinate with Hakan.
- **No new vendor SDK in the UI** (Lego rule). The one approved new runtime dep is **Radix Primitives** (a11y engine). Test-only devDeps (jsdom, @testing-library/react, user-event, vitest-axe) are exempt, like `fake-indexeddb`.
- **No AI references** in commits, PRs, or code.

## 2 · Locked decisions

| # | Decision | Note |
|---|----------|------|
| 1 | Two-tier tokens: primitive → **semantic**; components bind to semantic ONLY | lint-enforced on new/touched code |
| 2 | Single source of truth = **CSS variables**; **Tailwind v3** reads them (NOT v4) | collapses today's double-declaration |
| 3 | **Light + unified dark** from day one (folds KDS `mfs-kds-*` + HACCP `slate-*`) | delivered: `[data-theme="dark"]` |
| 4 | A11y via **Radix Primitives** (single vendor); shadcn only as recoloured copy-in reference | WCAG AA min |
| 5 | **Buy** component-test stack: jsdom + @testing-library/react + user-event + vitest-axe | test-only |
| 6 | **Design comprehensive, build tiered** — full ~30 catalogue + speculative designed; build in waves | speculative = build-on-demand |
| 7 | **Migrate ALL 46 routes** onto the new system (old admin `_components/primitives.tsx` absorbed) | section by section |
| 8 | Per-section **requirements-audit FIRST** (incl. proactive new-business-logic suggestions); confirm each, never batch | see process doc / memory |
| 9 | Multi-format first-class; **default density = comfortable (touch-first)**, compact on desktop | Hakan confirmed |
| 10 | Display font = **Adieu** (licence confirmed OK to ship); Inter for body | resolves old "GTF Adieu unshipped" gap |
| 11 | Spacing via **density sizing system** (control/field/tap/stack/card tokens) ON TOP of Tailwind's default 4px scale (design uses ONE ruler — no custom spacing scale) | resolves spacing open item |
| 12 | **Fidelity, not inertness:** the `.dc.html` is the SINGLE source of truth — foundation gets the real design tokens (colours, Adieu+Inter fonts, dark, density) VERBATIM from day one. Do NOT preserve old colours / Plus Jakarta Sans. Existing screens shift look immediately — safe (isolated branch, no merge until overhaul done). Only "don't break" = the app must still BUILD. | 2026-06-28 — reverses the earlier "visually inert" plan at Hakan's direction |
| 13 | **Phase 0 = 3 FORGE PRs:** 0a foundation (fonts/tokens/Tailwind/Radix/test-stack) · 0b core library (~30 components) · 0c speculative (DEFERRED, build-on-demand). Phase 1+ stays screen-by-screen, audit-first. | 2026-06-28 — agreed at FORGE Frame |
| 14 | **Integration model = MERGE STEP BY STEP** — 0a merges to `main` once its cert clears, then 0b, then each Phase-1 section. Reverses the original "accumulate the whole overhaul on the branch, merge once at the end." | 2026-06-28 — Hakan's call (main is sealed, merge window open) |
| 15 | **Reskin ACCEPTED:** merging 0a's verbatim tokens to `main` re-skins every existing un-migrated screen with the new palette/fonts immediately (old layouts, new paint) until Phase-1 migrates them. Accepted as harmless/reversible on an internal staff tool. | 2026-06-28 — consequence of #12 meeting #14; Hakan chose option A |
| 16 | **Pause UI after Phase 0** (0a+0b merged), BEFORE any Phase-1 screen, to finalise **label printing** (F-PROD-04, critical). Repo/docs cleanup happens on clean main between 0b-merge and the pause. | 2026-06-28 — wc29 sequence |
| — | Deferred: Tailwind v4 upgrade · Style-Dictionary/DTCG pipeline | revisit only when a real reason appears |

## 3 · Design system handover (from Claude Design)

- **Project:** "MFS OPS NEW" — `projectId 0e28a094-d725-42bd-8858-cd469b21a42d` (read via DesignSync MCP; `/design-login` for auth).
- **Main file:** `MFS Operations Design System.dc.html` (~264 KB, self-contained spec).
- **Assets in project (pull into repo at Phase 0):** `fonts/Adieu-Regular.otf`, `fonts/Adieu-Light.otf`; `assets/logo-{navy,orange,white}.svg`, `assets/star-icon-{navy,orange,sand,white}.svg`.
- **Review verdict (2026-06-28): STRONG / build-ready.** Covers the full catalogue + speculative set; two-tier tokens with complete semantic layer (action/surface/text/border/status/sync/focus + lazy-resolving domain status aliases); light + unified dark; density modes (comfortable/compact); breakpoint scale; WCAG-AA contrast pairings; i18n + prefers-reduced-motion; cross-cutting "seams" (PWA/offline) carried. Both open items (font, spacing) resolved.
- The `.dc.html` is the **source of truth FORGE builds against** (pull fresh via DesignSync each session; do not hand-edit a stale copy).

## 4 · Phase 0 — design-system foundation (build FIRST, before any screen)

**Split into 3 FORGE PRs** (decision #13): **0a** = the foundation rows below minus the component library (fonts/assets · token CSS · Tailwind rewire · Radix · test-stack · lint rule · token+stack tests) · **0b** = the **core** component library row · **0c** = the section-driven + build-on-demand rows (DEFERRED). The active 0a plan lives at `docs/plans/2026-06-28-ui-phase-0a-foundation.md`. Tokens are implemented VERBATIM from `docs/design/phase0a-foundation-tokens.reference.css`.

**0a status (✓ DONE, awaiting merge):** token CSS · Tailwind rewire · Radix · test-stack · semantic-tokens lint · token-compile + stack tests — all ✓ on `feat/ui-phase-0a-foundation`. Fonts ✓ (Adieu in repo); **7 brand SVGs DEFERRED** (see change log). **0b** = core component library (next). **0c** rows (section-driven + build-on-demand) = DEFERRED. Review: `docs/reviews/2026-06-28-ui-phase-0a-foundation-review.md`. Cert (PENDING): `docs/anvil/2026-06-28-ui-phase-0a-foundation-cert.md`.

| Task | Status |
|------|--------|
| Pull Adieu fonts + logo/star assets into repo (`public/fonts`, `public/…`) | ○ |
| Tokens CSS: Tier 1 primitives + Tier 2 semantic, light + `[data-theme="dark"]` + density (`[data-density]`) — one source of truth | ○ |
| Tailwind v3 config reads the semantic CSS vars (kill the double-declaration) | ○ |
| Add Radix Primitives (runtime dep, justified) | ○ |
| Add component-test stack (jsdom + RTL + user-event + vitest-axe); vitest config | ○ |
| Build **core** library (semantic-tokens only), absorbing `app/dashboard/admin/_components/primitives.tsx`: Button, IconButton, fields (TextField/Textarea/Select/Checkbox/Radio/Toggle), FormField, PIN Keypad, Picker; Card, KpiTile, ListRow, Table, SectionLabel/PageHeading/CardHead, Tabs/SegmentedControl; Modal/Dialog (centred+sheet), Banner/Alert, Spinner, EmptyState, Badge/StatusPill, SyncDot, Popover/DropdownMenu; AppHeader/BottomNav/MoreDrawer/DesktopSidebar/NavItem | ○ |
| Lint rule: semantic-tokens-only in components (new/touched code) | ○ |
| Tests: token compile + per-component keyboard/focus/ARIA/contrast (vitest-axe) | ○ |
| **section-driven (design now, build later):** FileUpload, Accordion, Toast, Skeleton, ProgressBar, Tooltip, Avatar; HACCP TileState; Map shell restyle; Print/label | ○ |
| **build-on-demand (speculative, designed only):** date/range pickers, calendar, command palette, rich-text, carousel, stepper, data-grid, kanban, timeline, notification center, combobox, slider, rating, tree, breadcrumb, pagination | ○ |

## 5 · Phase 1+ — section-by-section migration (46 routes)

**Per-section loop (HARD gate, never batch):** (a) requirements audit FIRST — document rules/edge cases, confirm correctness, **suggest new business logic with rationale**, lock; (b) redesign on the new system; (c) test to depth (each rule → a test; critical flows → E2E). Confirm with Hakan before the next section. Sequencing TBD with Hakan (suggest: start with a small proof section, e.g. Auth, then Orders).

| Section | Routes | Status |
|---------|--------|--------|
| Auth & entry | `/login`, `/` | ○ |
| Orders | `/orders`, `/orders/new`, `/orders/[id]`, `/orders/[id]/edit`, `/kds` | ○ |
| Dispatch / logging | `/dispatch`, `/screen2`, `/screen3` | ○ |
| Sales / CRM | `/visits`, `/complaints`, `/compliments`, `/pricing`, `/cash` | ○ |
| Routes / logistics | `/routes`, `/runs`, `/driver`, `/map` | ○ |
| Admin dashboards | `/dashboard/admin`, `/admin`, `/admin/{at-risk,commitments,discrepancies,prospects,visits}` | ○ |
| HACCP — core CCP | `/haccp`, `/haccp/{cold-storage,process-room,delivery,mince}` | ○ |
| HACCP — diaries/reviews | `/haccp/{cleaning,product-return,calibration,reviews,annual-review,people,training}` | ○ |
| HACCP — compliance/docs | `/haccp/{allergens,recall,product-specs,food-fraud,food-defence,audit,documents,documents/[ref],visitor,admin}` | ○ |

## 6 · Testing approach

Belt-and-braces where risk is real; TDD red-green-refactor; right layer (unit=logic, integration=connections, component+a11y=UI via the bought stack, E2E=critical flows). Build on the existing repo suite, not a parallel one. Include ≥1 **Android-webview smoke** (Capacitor APK; web-only E2E insufficient). Suite green before any phase/section is "done". Right-size to blast radius.

## 7 · Cross-cutting concerns to preserve (inventory §6)

PWA/offline (SyncDot + RecentActivity), Android/Capacitor + Sunmi printing, PIN keypad, Leaflet maps (quarantined; known re-mount bug), print/PDF/Excel surfaces, EN/TR i18n (route new text through `t()`; TR audit folded into each section's step (a)), role-gated rendering (6 roles).

## 8 · Open items / risks

- Sequencing of Phase 1 sections (which screen first) — decide with Hakan at Phase 0 exit.
- Leaflet interior can't be fully tokenised; restyle around it (accepted).
- Map "container already initialized" re-mount bug — deferred; address when Routes/Map section comes.
- Large scope (46 routes, ~22 HACCP) — expect many gated sessions; this roadmap is the tracker.

## 9 · Change log

- **2026-06-29 (worktree retired → main dir)** — UI rebuild moved out of the worktree into the **main working directory**. Removed `.claude/worktrees/ui-system-rebuild` + force-deleted its squash-merged branch `feat/ui-phase-0a-foundation` (clean; 0a code already in `main` via PR #93). The worktree only existed to isolate UI work from the parallel 16-day sprint, which is now sealed — so it's no longer needed. Section 1 guardrails updated: merge is unlocked, work happens in the main dir, each section still ships via feature branch → PR → `smoke`. Stale local branches (`worktree-ui-system-rebuild`, `feat/ui-overhaul-01/02/03`, old `f-td-*`/`anvil-*`) left for the step-5 cleanup sweep. Next: **0b**.
- **2026-06-28 (0a SHIPPED → main)** — Terminal-1 closed the 0a cert and merged. Cert flipped PENDING→CLEARED on a clean-DB `@critical` **75/75** run (production build, fresh `db:reset`). The run took 3 attempts; BOTH early fails were worktree test-harness wiring, NOT the diff: (1) worktree lacked `.env.e2e.local` PINs (gitignored files don't enter a worktree) → 66 login-throws; (2) the hand-rolled prod server lacked `SUPABASE_JWT_SECRET` so every authenticated WRITE 500'd (`cannot mint DB identity tokens`, the F-RLS-04i ForCaller path) → 65 write-fails. Fixed both → 75/75. Merged via **PR #93** (squash `6a847fa`); `smoke` required check green 75/75; CLEAN merge (no override, no F-INFRA-07 caveat). **Prod redeployed → reskin LIVE** (`mfs-operations.vercel.app` serves new orange `#EB6619` + Inter). Decisions #14 (stepwise merge), #15 (reskin accepted), #16 (pause-after-0b for printing) locked. Next: **0b**.
- **2026-06-28 (Guard+ANVIL)** — 0a Guard + ANVIL. **code-critic: NO BLOCKERS** (re-ran suite 2710✓, hand-verified R2 build-safety — every legacy colour utility resolves, no screen goes colourless; R1 alpha channel-forms correct; tokens.css verbatim vs reference; radix allow-listed/zero-imports; scope clean). Review at `docs/reviews/2026-06-28-ui-phase-0a-foundation-review.md`. **ANVIL:** unit 2710✓ · component 4✓ · guards 12✓ · tsc clean · `next build` green · **visual smoke (PROD build, 6 screens): new tokens LIVE — orange #EB6619, body bg #EDEAE1, Adieu+Inter, Plus Jakarta retired, maps mount clean, 0 console errors** · integration/pgTAP/RLS/PITR = justified N/A (no migration/API/policy). **E2E @critical 62/75 — 13 fails ALL environmental** (dirty SHARED local DB from a prior F-20 run + a dev-server-only Leaflet double-mount that's clean under prod build), NONE from this diff (failing DOM carries the new tokens). **Decision: DEFER the clean-DB @critical to merge-time** (don't `db:reset` the shared DB) — cert PENDING (`docs/anvil/2026-06-28-ui-phase-0a-foundation-cert.md`). Terminal 1 (main seal) is DONE → DB now free → that rung is a quick pre-merge step. **Non-blocking follow-up:** make `token-resolve.test.ts` LEGACY_COLOR_NAMES derive from a live content-grep (currently hand-maintained) — 0b hardening.
- **2026-06-28 (Render)** — 0a BUILT on `feat/ui-phase-0a-foundation` (9 atomic commits `b43142a`→`ca8a4ea`, unpushed). New `app/tokens.css` (verbatim from the reference), `globals.css` + `tailwind.config.ts` rewired to read the vars (double-declaration killed), Adieu+Inter via `next/font` (Plus Jakarta retired), vitest split node/jsdom lanes, semantic-tokens lint + token-resolve guards, `radix-ui` allow-listed. Suite green: **2714 pass / 0 fail**; `tsc` clean; `next build` green. Conductor calls: deleted 2 superseded pre-rebuild oracles (`tests/unit/design-system/*`); ratified +4 legacy colour aliases, `vitest-axe.d.ts`, and the forced `@testing-library/dom` RTL peer. **DEFERRED: the 7 brand SVGs** (`public/brand/logo-*.svg`, `star-icon-*.svg`) — DesignSync unavailable in subagent context + hand-transcription risks corrupting vector artwork; non-load-bearing for 0a (no test/build references them). TODO before any screen needs a logo: place via a safe sync (conductor has DesignSync at session level). Next: Guard (code-critic) → ANVIL → ship-when-unlocked.
- **2026-06-28 (later)** — FORGE Phase 0 kicked off. Frame/grill locked the spec; **Phase 0 split into 3 PRs** (0a/0b/0c — decision #13). **ADR-0009** written (Radix + component-test stack). Design `.dc.html` pulled fresh to disk (`docs/design/MFS-Operations-Design-System.dc.html`; last ~8KB truncated at the 256KiB fetch cap — 0b gallery only, foundation intact) + verbatim token reference saved (`docs/design/phase0a-foundation-tokens.reference.css`). **Inertness REVERSED → fidelity** (decision #12): foundation implements the design tokens verbatim, old colours/Plus-Jakarta retired, existing screens shift look immediately (safe on isolated branch). 0a plan (re)written at `docs/plans/2026-06-28-ui-phase-0a-foundation.md`. Next: Gate 2 plan approval → Render.
- **2026-06-28** — Design delivered by Claude Design, reviewed STRONG/build-ready; both open items resolved (Adieu font licensed; spacing = density system). Density default = comfortable confirmed. Roadmap created. Next: FORGE Phase 0.
- **2026-06-27** — ui-cartographer wrote `docs/ui-current-state.md`; brand-prompt fork wrote the Claude Design brief; isolated work into the `worktree-ui-system-rebuild` worktree after discovering the shared-folder branch collision; locked decisions 1–8; saved per-section discipline to memory.
