# MFS-Operations docs — start here

This folder is the project's written memory. If you're a developer or an AI landing cold,
read this page first — it tells you what lives where and which doc to open for what.

## Quick map

| Path | What it is | When to read it |
|---|---|---|
| `ROADMAP.md` | Program single-source-of-truth — what's built, what's next. Updated every working session. | First, for the big picture. |
| `architecture-review-2026-06-06.md` | The foundational hexagonal (ports & adapters) architecture review that seeded the whole migration. Cited by the ADRs. | To understand *why* the codebase is shaped the way it is. |
| `MFS_OPS_PROJECT_PLAN.md` | "What's live" product snapshot (overlaps ROADMAP; kept for its feature inventory). | For a feature-by-feature status view. |
| `ui-current-state.md` | Live UI inventory feeding the active UI-system rebuild. | When working on UI / the design system. |
| `LABEL_PRINTING_PLAN.md` | The label-printing feature plan (F-PROD-04) — the #1 post-Phase-0 priority. | When building label printing. |
| `adr/` | Architecture Decision Records (`0001`…`0009` + README). Each = one locked decision + its rationale. | Before changing anything architectural. **Pinned by `CLAUDE.md` — do not move.** |
| `runbooks/` | Operational procedures (preview smoke, cutover, cred-sync). | When running an op. **`preview-smoke.md` is pinned by code/config — do not move.** |
| `design/` | The design-system source (`.dc.html`) + the brand prompt sent to Claude Design. | UI design source of truth. |
| `reference/` | Evergreen domain knowledge, grouped by area (see below). Not dated plans — long-lived facts. | When you need domain/spec detail. |
| `plans/` | Dated execution plans. **Active** plans sit loose; **shipped/superseded** plans move to `plans/archive/`. | When starting or tracking a unit of work. |
| `plans/BACKLOG.md` | THE single living deferred index (`F-TD-*` / `F-PROD-*` / `ARCH-FU-*`). | Whenever something is deferred. **Pinned by code — do not move.** |
| `anvil/` | ANVIL clearance certificates — one per shipped unit. Flat, date-prefixed. | Audit trail: proof a unit was tested before ship. |
| `reviews/` | code-critic Guard reviews — one per shipped unit. Flat, date-prefixed. | Audit trail: what was flagged before ship. |
| `backlog/` | A single **archived** phase-2 order-pipeline scope doc (historical). NOT the living backlog. | Rarely — the living backlog is `plans/BACKLOG.md`. |

## reference/ — evergreen domain docs, by area

| Path | Holds |
|---|---|
| `reference/haccp/` | HACCP compliance & food-safety docs: `DOCUMENT_CONTROL.md`, `HACCP_AUDIT_STATUS.md`, `HACCP_CCP1_AUDIT.md`, `HACCP_ALARMS_PLAN.md`. |
| `reference/routing/` | Route-optimiser engine: `routing-engine-spec.md`, `ROUTING_CHANGELOG.md`. |
| `reference/security/` | RLS / data-isolation: `rls-audit-2026-06-12.md`, `rls-expand-contract-plan-2026-06-12.md`. |
| `reference/printing/` | Label/ZPL printing: `PRINT_RELAY_PLAN.md`. |

> **Note — the HACCP handbook your staff read is NOT in this folder.** These are *developer/compliance*
> reference docs. The handbook butchers actually read on the tablet is a live in-app feature backed by the
> **database** (tables `haccp_sop_content` / `haccp_documents`, searched via the `haccp_search` function),
> read through the owned port `lib/ports/HaccpHandbookRepository.ts` and surfaced on the `/haccp/documents`
> screens. See `wc29` for the architecture-watch note.

## Conventions

- **Dated work** → `plans/YYYY-MM-DD-<slug>.md` while active, then `plans/archive/` once shipped or superseded. Nothing is deleted — history stays in `archive/` (and in git).
- **Evergreen facts** → `reference/<area>/<topic>.md`. No date prefix; these describe how things *are*, not a one-time task.
- **Decisions** → an ADR in `adr/`. ADRs are append-only records — supersede, don't rewrite.
- **Pinned files** (referenced by code/config — never move without updating the pin): `plans/BACKLOG.md`, `runbooks/preview-smoke.md`, `adr/0001`+`0002`.
