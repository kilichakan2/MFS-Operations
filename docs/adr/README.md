# Architecture Decision Records

## What is an ADR?

An Architecture Decision Record is a short, dated record of a single architectural decision: the context the team was in when the call was made, the decision itself, and the consequences (both good and bad) that follow from it. ADRs are numbered sequentially and, once accepted, are never edited — if the decision later changes, a new ADR is written that *supersedes* the old one, and the old one stays in the repo as part of the history. The MFS-Operations project uses ADRs so that future engineers can find the *why* behind a structural choice in 30 seconds, and so that the team's own architectural reasoning becomes legible to itself over time.

## Index

| # | Title | Status | Date | Notes |
| --- | --- | --- | --- | --- |
| 0001 | [Sunmi JavaScript interface](./0001-sunmi-javascript-interface.md) | Accepted | 2026-05-12 | Predates the current ADR template; grandfathered (do not retroactively edit). |
| 0002 | [Hexagonal shape and naming](./0002-hexagonal-shape-and-naming.md) | Accepted | 2026-06-06 | Layers, folders, dependency rule, depth rule. |
| 0003 | [Strangler-fig migration and FREEZE rule](./0003-strangler-fig-migration-and-freeze-rule.md) | Accepted | 2026-06-06 | Domain-by-domain Lego migration, Orders first, FREEZE after F-04. |
| 0004 | [RLS vs service-role security model](./0004-rls-vs-service-role-security-model.md) | Accepted | 2026-06-06 | Parallel safety track; per-request authenticated client default; `requireServiceRole()` admin escape hatch. |

## Template

New ADRs follow the forward template: a metadata block (Status / Date / Deciders), then `Context`, `Decision`, `Consequences`, and `References`. Copy the fenced block below to start a new ADR.

```markdown
# ADR-NNNN — Title

- **Status:** Accepted | Superseded by ADR-MMMM | Deprecated
- **Date:** YYYY-MM-DD
- **Deciders:** Names / roles / source documents

## Context

Plain-English description of the situation that forced the decision. What was true before? What pressure was the team under? What was tried and didn't work?

## Decision

Terse, technical statement of what was decided. Layer names, folder paths, rules, contracts. Concrete enough that a reviewer can check a PR against it.

## Consequences

Plain English. What gets easier? What gets harder? Any security or operational shift?

## References

Source documents, related ADRs, external links.
```

## File-format rule

Filename = `NNNN-kebab-case-title.md`. Four-digit zero-padded number, single hyphen separator, kebab-case slug, `.md` extension.
