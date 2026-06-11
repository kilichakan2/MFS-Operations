# F-FND-01 — ADR seed (hexagonal / strangler-fig / RLS)

## Goal
F-FND-01 seeds the project's first formal ADRs so the architectural decisions made in the v1.1 review have a durable, dated home that future engineers can find before they touch the code. Three new ADRs (0002 hexagonal shape and naming, 0003 strangler-fig migration and FREEZE rule, 0004 RLS-vs-service-role security model) get committed alongside an `docs/adr/README.md` index, a markdownlint dev tool, and a small ripple amendment to the architecture review so its forward references resolve to the chosen ADR numbers. No application code is touched; this is the "decisions of record" cornerstone the entire Lego migration leans on.

## Source spec
- Architecture review v1.1: `docs/architecture-review-2026-06-06.md` (Phase 0a, unit **F-FND-01**, line 301).
- Lego principle contract: `CLAUDE.md` (the doc 0002 codifies as ADR form).
- APOSD principles reference: `~/.claude/skills/saas-consultant/references/aposd-principles.md`.
- Locked-decisions session (this conversation) — the amendment that fixed the 0001 collision and selected numbering 0002 / 0003 / 0004.

## Compliance
**NO** runtime compliance impact. Docs-only PR. No `app/**`, `lib/**`, `hooks/**`, or `components/**` edits. The CLAUDE.md Lego rule is not modified — ADR-0002 records the same rule in ADR form and cites the contract verbatim. APOSD lens cited by name where it informs each decision. No auth, payments, HACCP, RLS policies, or financial logic touched (ADR-0004 documents the **future** RLS work but ships zero policy changes in this PR).

## Branch + base
- Base: `main` HEAD `361d3e1` (most recent commit).
- Branch: `forge/f-fnd-01-adr-seed`.
- PR opened to `main`, **not merged** — Hakan ships via `/ship` after gates pass.

---

## 1. File-by-file changes

### New files (5)

| Path | Purpose |
|---|---|
| `docs/adr/README.md` | One-paragraph "what is an ADR" intro + index table of the four ADRs with the grandfather note on 0001. |
| `docs/adr/0002-hexagonal-shape-and-naming.md` | Records the hexagonal layer names, folder layout, dependency rule, services-don't-import-services rule, depth rule. |
| `docs/adr/0003-strangler-fig-migration-and-freeze-rule.md` | Records the strangler-fig domain-by-domain migration, Orders-first sequencing, FREEZE rule after F-04, contract tests on every port. |
| `docs/adr/0004-rls-vs-service-role-security-model.md` | Records the current service-role-everywhere state, the target authenticated-client default, the `requireServiceRole()` admin escape hatch, and the Phase 0.5 sequencing alongside the Lego phases. |
| `.markdownlint.json` | Markdownlint config at repo root. |

### Modified files (3)

#### `docs/architecture-review-2026-06-06.md` — number ripple

Grep target before edit: `grep -n 'ADR-001\|ADR-002\|ADR-003' docs/architecture-review-2026-06-06.md`. The locked spec calls out that the **Phase 0a Foundations section** is the primary site of the old numbering. Expected hit lines (verify during implementation; replace exact tokens, do not paraphrase):
- Line 301 — the F-FND-01 description currently reads "seed three Architecture Decision Records: (1) Hexagonal shape... (2) Strangler-fig... (3) RLS-vs-service-role..." The numbering (1)/(2)/(3) is **not** ADR-NNN tokens, so it stays as-is; but the implementer should re-verify no `ADR-001` / `ADR-002` / `ADR-003` tokens exist elsewhere via the grep above. If the grep returns hits, each is updated to `ADR-0002` / `ADR-0003` / `ADR-0004` respectively. If the grep returns zero hits, the ripple is a no-op for this file and the implementer records that in the commit body.
- Implementer commits the result whether ripple-edits land or not — the grep is the source of truth.

#### `package.json` — devDependency + script

- Add `"markdownlint-cli": "^0.41.0"` (or latest stable) under `devDependencies`.
- Add `"lint:md": "markdownlint 'docs/**/*.md' '*.md'"` under `scripts`.
- `package-lock.json` regenerates on `npm install`; commit both.

#### `.markdownlintignore` (NEW if it doesn't exist)

- Single line: `docs/adr/0001-sunmi-javascript-interface.md`
- Grandfather principle in action — the sunmi ADR pre-dates the template and must not be edited in this PR. If markdownlint passes against it without the ignore, the file is not added; if it complains, the ignore lands. The implementer decides during the local lint run.

### `.markdownlint.json` — exact contents

```json
{
  "default": true,
  "MD013": false,
  "MD029": false,
  "MD041": true
}
```

Rationale:
- `MD013` (line-length) **disabled** — ADRs run long; wrapping at 80 columns degrades readability of decision prose.
- `MD029` (ordered-list-prefix) **disabled** — we use both `1. 2. 3.` and `1. 1. 1.` styles across the project; not worth enforcing one.
- `MD041` (first-line-h1) **kept on** — every ADR's first line is its `# ADR-NNNN — Title` heading. This catches accidental front-matter or stray prose at the top.

---

## 2. Per-ADR content outline

### ADR-0002 — Hexagonal shape and naming

**File:** `docs/adr/0002-hexagonal-shape-and-naming.md`

**Template adherence:** forward template (`# ADR-NNNN — Title` → `- **Status:** Accepted` → `- **Date:** 2026-06-06` → `- **Deciders:** Hakan Kilic, Architecture Review v1.1` → `## Context` → `## Decision` → `## Consequences` → `## References`).

**Context (plain English):**
- Restate the rip-out test from `CLAUDE.md` lines 22–24 ("If I rip out [the DB / auth / payment provider] tomorrow… one adapter + one config line"). One sentence on why MFS-Operations needs this contract recorded as ADR form even though it already lives in `CLAUDE.md` — namely, the contract on its own says *what* but not *how*. This ADR is the *how*.
- One paragraph on the current state surfaced by the v1.1 review: 88 routes import Supabase directly; two parallel access paths; vendor types leaking past would-be adapters; no shared interface vocabulary across the team.

**Decision (terse, technical):**
- Layer names — `port`, `adapter`, `service`, `use-case`, `domain type`. Each defined in one line.
- Folder layout — `lib/ports/`, `lib/adapters/<vendor>/`, `lib/services/`, `lib/usecases/`, `lib/domain/`. One sub-folder per vendor under `adapters/`. Sourced from the v1.1 review "Target shape" diagram at lines 134–171.
- The **dependency rule** — vendor SDK imports (`@supabase/supabase-js`, `resend`, `@anthropic-ai/sdk`, `bcryptjs`, `web-push`, `jspdf`, `xlsx`, `leaflet`, `react-leaflet`, `dexie`) live ONLY inside `lib/adapters/**`. Enforced by ESLint in F-04 / F-27.
- The **services-don't-import-services rule** — composition goes through `lib/usecases/` (cited from the v1.1 review "Application core boundary" section, lines 266–268).
- The **depth rule** — port methods expose business operations, never 1:1 vendor calls. Cite the v1.1 review "Port design" rules at lines 247–251.
- Vendor types never cross the port boundary. Adapter maps to/from domain types inside.

**Consequences (plain English):**
- *Easier:* a new engineer reading any service file can describe what it does without knowing which vendor backs it. Swapping vendors becomes "write one adapter file, change one wiring line." Testing services becomes trivial — fake adapters in-memory.
- *Harder:* every new feature must define a port before writing the adapter. There is real upfront design cost. Shallow ports (the 1:1-vendor-call kind) will be tempting and must be rejected in review.
- *Security/operational:* no immediate shift. The model is documented; enforcement comes via F-04 (lint guard) and F-27 (tightened lint).

**References:**
- `CLAUDE.md` lines 3–24 (the contract this ADR formalises).
- `docs/architecture-review-2026-06-06.md` "Target shape" (lines 134–171), "Cross-cutting design rules" (lines 242–290).
- APOSD principles cited **by name**: *deep modules*, *information hiding*, *pull complexity downward*, *define errors out of existence*, *design it twice*. Reference `~/.claude/skills/saas-consultant/references/aposd-principles.md` sections 3, 4, 5, and principle #12.

### ADR-0003 — Strangler-fig migration and FREEZE rule

**File:** `docs/adr/0003-strangler-fig-migration-and-freeze-rule.md`

**Context (plain English):**
- Restate the rip-out result from the v1.1 review verdict (line 14): "about 100 files would change." One paragraph on why a big-bang rewrite would be catastrophic (88 routes, two access paths, live production, single engineer + Claude pair) and why Martin Fowler's strangler-fig pattern is the chosen alternative.
- One paragraph on the discovery in the v1.1 review (Phase 1, F-05) that **Orders** is the right first domain — 5 routes, fresh in head, isolated.

**Decision (terse, technical):**
- Migrate one bounded context at a time. New layer (`lib/ports/`, `lib/adapters/supabase/`, `lib/services/`) lives alongside existing code. Per the v1.1 review "Migration strategy" (lines 210–219).
- **Orders first** — F-05 ports, F-06 adapters + contract tests, F-07 service, F-08 thin route rewrites. Cited from the v1.1 review Phase 1 (lines 322–328).
- **FREEZE rule.** Once F-04 (the ESLint guard forbidding `@supabase/supabase-js` outside `lib/adapters/supabase/**` and `lib/supabase.ts`) ships, no new code may import the vendor outside the adapter folder. The lint guard freezes the existing surface area so the migration can drain without backfilling. Cite the v1.1 review F-04 (line 310).
- **Contract tests on every port.** One shared test suite per port that the real Supabase adapter AND a `FakeInMemoryOrdersRepository` both pass. A PR that adds an adapter without a contract-suite pass is blocked. Cite the v1.1 review F-06 (line 325) and the "Tests at the seam" section (lines 271–274).
- Dependent units explicitly enumerated:
  - **F-04** — ESLint lint guard (Phase 0).
  - **F-05..F-08** — Orders slice (Phase 1).
  - **F-09** — Orders ANVIL rip-out gate.
  - **Phase 3 domains** — F-13 (Users + Auth), F-14 (Routes), F-15 (Pricing), F-16 (Cash), F-17 (Compliments + Complaints), F-18 (Visits / Screen 3), F-19 (HACCP — biggest), F-20 (Admin), F-21 (Dashboard, blocked on most of Phase 3). Cite the v1.1 review lines 336–348.
  - **F-27** — Phase 5 lint tightening; the moment the rip-out test becomes CI-enforced.

**Consequences (plain English):**
- *Easier:* every PR is small, reviewable, mergeable independently. Each domain ANVIL-gates on its own rip-out test. Rollback is per-domain, not catastrophic.
- *Harder:* the migration lives in flight for 8–12 weeks. Two patterns (old route-direct-to-Supabase + new route-via-service) coexist in the codebase. New engineers may copy the old pattern by accident — mitigated by F-04's lint guard.
- *Security/operational:* parallel safety track (ADR-0004 / Phase 0.5) runs alongside, so the migration does not block RLS work. Observability scaffolding (F-FND-03) lands before any domain so correlation IDs thread through both old and new patterns.

**References:**
- `docs/architecture-review-2026-06-06.md` "Migration strategy" (lines 210–219), Phase 0 (lines 306–310), Phase 1 (lines 322–328), Phase 3 (lines 336–348), Phase 5 (line 360).
- APOSD principles cited **by name**: *complexity is incremental* (principle #1 — the strangler-fig is exactly this principle applied at the architecture scale) and *strategic vs tactical* (section 8 — the whole rationale for choosing this slower path over a fast rewrite).

### ADR-0004 — RLS vs service-role security model

**File:** `docs/adr/0004-rls-vs-service-role-security-model.md`

**Context (plain English):**
- Restate Critical Finding **C3** from the v1.1 review (lines 71–75 verdict, lines 71–75 critical-findings detail): the service-role key is the only auth path; Postgres RLS is effectively dormant; every route hand-rolls its own role check; one missed check leaks data. Quote the count if useful — "88 hand-rolled role checks."
- One paragraph on the trade-off: service-role-everywhere is *fast* (the app trusts itself) but *fragile* (the database trusts the app, so one bug means data leak with no DB-level safety net). RLS-on flips this to defence-in-depth.

**Decision (terse, technical):**
- **Current state (recorded as the baseline this ADR migrates away from):** `supabaseService` is used in every route (`lib/supabase.ts:15`); 88 routes hand-roll role checks; RLS policies on most tables are dormant; the comment at `lib/supabase.ts:9` claiming centralisation is factually false (14 files inline the URL + key, per Critical Finding C2). Cite the v1.1 review lines 71–75.
- **Target state:** RLS on by default; per-request authenticated Supabase client (anon key + user JWT) is the default for all user-facing routes; service-role only behind an explicit `requireServiceRole()` helper used by admin-tagged routes inside `lib/admin/` or equivalent.
- **Phase 0.5 sequencing (parallel safety track, not after the Lego refactor):**
  - **F-RLS-01** — RLS audit + threat model (`docs/rls-audit-2026-06-06.md`). Runs `get_advisors` via Supabase MCP. Per-table documentation of current RLS state, who reaches it, what a missed check would leak. **Docs-only PR.** Starts in parallel with F-01 (Phase 0).
  - **F-RLS-02** — Per-table expand-contract plan. Per-table: target policy, migration order (enable RLS → add policy → switch reads → switch writes → remove service-role fallback), rollback. Docs-only PR.
  - **F-RLS-03** — Introduce per-request authenticated Supabase client. `supabaseService` remains available but marked "admin paths only" in review. `AuthenticatedDbAdapter` becomes the port default.
  - **F-RLS-04..n** — Migrate tables one bounded context at a time. Sequenced to align with the matching Lego phase: Orders RLS lands with Phase 1 (F-05..F-08), Users + Auth RLS lands with F-13, etc.
  - **F-RLS-final** — Retire service-role from all user-facing paths. Service-role remains only behind `requireServiceRole()`. Tighten the F-04 / F-27 lint rule to forbid service-role outside `lib/admin/`.
- **Accepted risk window.** Between today and F-RLS-final shipping, the production database remains trust-the-app. The ADR explicitly acknowledges this and lists the mitigations (`requireRole()` helper from F-03, no new service-role-importing routes after F-04, RLS audit document from F-RLS-01 visible to the whole team).
- **Interleave with Lego phases.** Each F-RLS-NN runs as the matching Lego domain ports/adapters land — so when Orders ports go in (F-05/F-06), Orders RLS goes on (F-RLS-04). Coupling the work means no domain ships with the seam half-built.

**Consequences (plain English):**
- *Easier:* once F-RLS-final lands, a missed role check in app code stops being a data leak. The database is the safety net. New engineers stop hand-rolling auth.
- *Harder:* per-request authenticated clients add latency (JWT verification) and complexity (the route must thread the user JWT through to the adapter). Every RLS policy is its own SQL artefact with its own migration. Admin paths require a deliberate, explicit escape hatch.
- *Security/operational:* this is the **largest** security improvement in the entire migration. The accepted risk window is real and called out — Hakan should treat F-RLS-01 (the audit) as the highest-priority parallel work.

**References:**
- `docs/architecture-review-2026-06-06.md` Critical Finding C3 (lines 71–75), Verdict last paragraph (line 18), Phase 0.5 (lines 312–320).
- `lib/supabase.ts:9` (the lying comment about centralisation) and `lib/supabase.ts:15` (the service-role client).
- `CLAUDE.md` (the Lego principle this ADR's authenticated-client work runs against in parallel).
- Reference: multi-tenancy dimension from `~/.claude/skills/saas-consultant/references/architecture-review.md` (the dimension that scores RLS as a core readiness criterion).

---

## 3. README.md content

**File:** `docs/adr/README.md`

**Structure:**

1. **Title:** `# Architecture Decision Records` (H1).
2. **What is an ADR (one paragraph):** Plain-English definition — a short, dated record of a single architectural decision: the context, the decision, and the consequences. Numbered sequentially. Once accepted, never edited; superseded by a new ADR if the decision changes. Two-sentence reason MFS-Operations uses them: future engineers can find the *why* in 30 seconds, and the team's architectural reasoning becomes legible to itself.
3. **Index table:**

| # | Title | Status | Date | Notes |
|---|---|---|---|---|
| 0001 | Sunmi JavaScript interface | Accepted | 2026-05-12 | Predates the current ADR template; grandfathered (do not retroactively edit). |
| 0002 | Hexagonal shape and naming | Accepted | 2026-06-06 | Layers, folders, dependency rule, depth rule. |
| 0003 | Strangler-fig migration and FREEZE rule | Accepted | 2026-06-06 | Domain-by-domain Lego migration, Orders first, FREEZE after F-04. |
| 0004 | RLS vs service-role security model | Accepted | 2026-06-06 | Parallel safety track; per-request authenticated client default; `requireServiceRole()` admin escape hatch. |

4. **Template (one paragraph + fenced code block):** Brief note that new ADRs follow the forward template (Status/Date/Deciders metadata, then Context / Decision / Consequences / References). Embed the template fenced block so contributors copy-paste.

5. **One-line file-format rule:** filename = `NNNN-kebab-case-title.md`. Zero-padded four digits.

---

## 4. Implementation steps (ordered)

1. **Cut the branch.** `git checkout -b forge/f-fnd-01-adr-seed` off `main` HEAD `361d3e1`.
2. **Install markdownlint-cli.** `npm install --save-dev markdownlint-cli`. This updates `package.json` and `package-lock.json`.
3. **Add `lint:md` script** to `package.json` scripts block: `"lint:md": "markdownlint 'docs/**/*.md' '*.md'"`.
4. **Create `.markdownlint.json`** at repo root with the four-key config above.
5. **Create `docs/adr/README.md`** per section 3 above.
6. **Create `docs/adr/0002-hexagonal-shape-and-naming.md`** per section 2 ADR-0002 outline.
7. **Create `docs/adr/0003-strangler-fig-migration-and-freeze-rule.md`** per section 2 ADR-0003 outline.
8. **Create `docs/adr/0004-rls-vs-service-role-security-model.md`** per section 2 ADR-0004 outline.
9. **Grep + ripple-amend `docs/architecture-review-2026-06-06.md`.** Run `grep -n 'ADR-001\|ADR-002\|ADR-003' docs/architecture-review-2026-06-06.md`. For each hit, replace `ADR-001` → `ADR-0002`, `ADR-002` → `ADR-0003`, `ADR-003` → `ADR-0004`. If zero hits, record "no ripple required — review document never referenced ADRs by the short numbering" in the commit body.
10. **Run `npm run lint:md` locally.** Must exit zero. If the sunmi ADR (0001) trips it, add `.markdownlintignore` at repo root containing `docs/adr/0001-sunmi-javascript-interface.md` and re-run. Do NOT edit `0001-sunmi-javascript-interface.md`.
11. **Run `npx markdown-link-check docs/adr/*.md docs/adr/README.md` locally.** No install needed via npx. Must exit zero. Fix any 404s before committing.
12. **Single commit** with conventional message: `docs(adr): seed hexagonal/strangler-fig/RLS ADRs (F-FND-01)`. Body lists the 5 new files, the 3 modified files (package.json, package-lock.json, architecture-review-2026-06-06.md), and the result of the ripple grep (hits or no hits).
13. **Push the branch.** `git push -u origin forge/f-fnd-01-adr-seed`.
14. **Open PR to `main`** via `gh pr create`. Title: `docs(adr): seed hexagonal/strangler-fig/RLS ADRs (F-FND-01)`. Body references unit `F-FND-01` and links `docs/architecture-review-2026-06-06.md` Phase 0a.

---

## 5. ANVIL strategy

This is a docs-only PR with no application code. The ANVIL gate is reduced to two commands, both run locally (no CI configured — see Risk #3):

1. **`npm run lint:md`** — must exit zero. Asserts every ADR + README conforms to the markdownlint config. The sunmi ADR (0001) is grandfathered via `.markdownlintignore` if it would otherwise fail.
2. **`npx markdown-link-check docs/adr/*.md docs/adr/README.md`** — must exit zero. Asserts every reference link inside the new ADRs and the README resolves (404 = block).

Both must pass before the PR is opened for review. Both run again after any review-driven edit.

No unit tests, no integration tests, no E2E — there is no runtime code.

---

## 6. Risks and open questions

1. **markdownlint may complain about the sunmi ADR's pre-existing style.** The 0001 ADR predates the forward template and uses a different heading convention (`# ADR-0001 — Title` → `## Status` with inline date, not the bullet-list metadata block). If markdownlint flags it under the new config, the fix is to add `.markdownlintignore` containing `docs/adr/0001-sunmi-javascript-interface.md` — **not** to edit the file. This is the grandfather principle (cited in the README) made operational. Implementer makes the call during step 10.
2. **The architecture-review-2026-06-06.md amendment ships in the same PR as the new ADRs.** Reviewer should be made aware in the PR body. The ripple is small (token-level find/replace) but the locked-spec amendment is the reason it's bundled — keeping the two changes atomic preserves the review document's correctness with respect to the ADR numbers from day one.
3. **No CI configured.** `.github/workflows/` is empty. `npm run lint:md` and `markdown-link-check` are local-only gates for this PR. F-FND-01 deliberately does not add a CI workflow — that's a separate scope unit (out of scope below). Implementer must run the gates locally and screenshot or paste the clean output into the PR body so reviewer has evidence.
4. **`package.json` already has scripts — verify no collision.** Implementer reads the existing `scripts` block before adding `lint:md` to confirm the key doesn't exist. If it does (unlikely but worth checking), surface the collision and stop — do not silently rename.
5. **markdownlint version pin.** Recommend `^0.41.0` (or whatever is current at install time). The implementer pins whatever `npm install` resolves and lets `package-lock.json` lock the transitive tree.
6. **markdown-link-check picks up its own implicit config.** External links (e.g. to Martin Fowler's strangler-fig essay if cited in ADR-0003) may be flaky. If a transient 404 fires, retry once; if persistent, the link is removed or replaced with a stable archive URL. Internal links (relative paths to `CLAUDE.md`, `docs/architecture-review-2026-06-06.md`, sibling ADRs) are the load-bearing ones — they must resolve.

---

## 7. Out of scope (DO NOT touch in this PR)

- **F-RLS-01** — the RLS audit document. ADR-0004 references it as planned work. It ships as its own PR in Phase 0.5.
- **F-FND-02** — typed error contract module (`lib/errors/`). ADR-0002 references error handling philosophy ("define errors out of existence") but the module itself is its own PR.
- **F-FND-03** — observability scaffolding (`lib/observability/`, `Caller` context). ADR-0003 references it as a sibling foundation but it ships separately.
- **F-01 through F-04** — Phase 0 quick wins (consolidate inline clients, fix `road-times.ts`, `requireRole()` helper, ESLint guard). ADR-0003 references F-04's FREEZE rule but does not ship it.
- **CI / GitHub Actions** — no workflow files are created. `npm run lint:md` is local-only this round. A future PR introduces CI; until then, the gates run on the implementer's machine.
- **Editing `docs/adr/0001-sunmi-javascript-interface.md`** — the grandfather principle. Even if markdownlint complains, the file is added to `.markdownlintignore`, not edited.
