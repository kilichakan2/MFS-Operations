#!/usr/bin/env python3
"""Strip order-pipeline objects from the baseline pg_dump.

The order-pipeline migration (20260530_001_order_pipeline_schema.sql) uses
CREATE TABLE IF NOT EXISTS / CREATE TYPE / etc. When the baseline already
contains those objects (because the prod dump was taken AFTER the migration
landed in prod), the migration is a silent no-op on local — we never actually
exercise it. This script removes order-pipeline objects from the baseline so
the migration runs cleanly on top of an empty slate.

pg_dump structure: top-level statements are separated by 2+ blank lines
(\\n\\n\\n or more). Single blank lines only occur inside function bodies,
so splitting on \\n{3,} keeps function bodies intact.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

BASELINE = Path("supabase/migrations/20260101000000_baseline.sql")

PIPELINE_TABLES = ["orders", "order_lines", "order_audit_log"]
PIPELINE_TYPES = ["order_state", "order_audit_action", "order_uom"]
PIPELINE_SEQUENCES = ["order_reference_seq"]
PIPELINE_FUNCTIONS = [
    "generate_order_reference",
    "orders_audit_trigger",
    "order_lines_audit_trigger",
]
PIPELINE_TRIGGER_NAMES = ["orders_audit", "order_lines_audit"]

ALL_PIPELINE_OBJECTS = (
    PIPELINE_TABLES
    + PIPELINE_TYPES
    + PIPELINE_SEQUENCES
    + PIPELINE_FUNCTIONS
)


def _alt(names: list[str]) -> str:
    return "|".join(re.escape(n) for n in names)


# Each entry: (regex, label-formatter). Patterns target the DDL "subject" of the
# block — the thing being CREATEd, ALTERd, GRANTed, etc. — not incidental
# references inside function bodies or string literals.
DROP_PATTERNS: list[tuple[re.Pattern[str], "callable"]] = [
    (
        re.compile(
            rf'(CREATE TABLE(?: IF NOT EXISTS)?|ALTER TABLE(?: ONLY)?|DROP TABLE(?: IF EXISTS)?)\s+"public"\."({_alt(PIPELINE_TABLES)})"'
        ),
        lambda m: f"{m.group(1)} public.{m.group(2)}",
    ),
    (
        re.compile(
            rf'(CREATE TYPE|ALTER TYPE|DROP TYPE(?: IF EXISTS)?)\s+"public"\."({_alt(PIPELINE_TYPES)})"'
        ),
        lambda m: f"{m.group(1)} public.{m.group(2)}",
    ),
    (
        re.compile(
            rf'(CREATE SEQUENCE(?: IF NOT EXISTS)?|ALTER SEQUENCE|DROP SEQUENCE(?: IF EXISTS)?)\s+"public"\."({_alt(PIPELINE_SEQUENCES)})"'
        ),
        lambda m: f"{m.group(1)} public.{m.group(2)}",
    ),
    (
        re.compile(
            rf'(CREATE (?:OR REPLACE )?FUNCTION|ALTER FUNCTION|DROP FUNCTION(?: IF EXISTS)?)\s+"public"\."({_alt(PIPELINE_FUNCTIONS)})"'
        ),
        lambda m: f"{m.group(1)} public.{m.group(2)}",
    ),
    (
        re.compile(
            rf'CREATE (?:UNIQUE )?INDEX(?: IF NOT EXISTS)?\s+"((?:{_alt(PIPELINE_TABLES)})_\w+)"'
        ),
        lambda m: f"CREATE INDEX {m.group(1)}",
    ),
    (
        re.compile(
            rf'CREATE (?:UNIQUE )?INDEX[^\n]*?\bON\s+"public"\."({_alt(PIPELINE_TABLES)})"'
        ),
        lambda m: f"CREATE INDEX ON public.{m.group(1)}",
    ),
    (
        re.compile(
            rf'CREATE (?:OR REPLACE )?TRIGGER\s+"({_alt(PIPELINE_TRIGGER_NAMES)})"'
        ),
        lambda m: f"CREATE TRIGGER {m.group(1)}",
    ),
    (
        re.compile(
            rf'CREATE (?:OR REPLACE )?TRIGGER[^\n]*?\bON\s+"public"\."({_alt(PIPELINE_TABLES)})"',
            re.DOTALL,
        ),
        lambda m: f"CREATE TRIGGER ON public.{m.group(1)}",
    ),
    (
        re.compile(
            rf'CREATE POLICY\s+"[^"]+"\s+ON\s+"public"\."({_alt(PIPELINE_TABLES)})"'
        ),
        lambda m: f"CREATE POLICY ON public.{m.group(1)}",
    ),
    (
        re.compile(
            rf'ALTER TABLE\s+"public"\."({_alt(PIPELINE_TABLES)})"\s+ENABLE ROW LEVEL SECURITY'
        ),
        lambda m: f"ALTER TABLE public.{m.group(1)} ENABLE RLS",
    ),
    (
        re.compile(
            rf'COMMENT ON (TABLE|TYPE|FUNCTION|SEQUENCE|INDEX|TRIGGER|POLICY)\s+"public"\."({_alt(ALL_PIPELINE_OBJECTS)})"'
        ),
        lambda m: f"COMMENT ON {m.group(1)} public.{m.group(2)}",
    ),
    (
        re.compile(
            rf'COMMENT ON COLUMN\s+"public"\."({_alt(PIPELINE_TABLES)})"'
        ),
        lambda m: f"COMMENT ON COLUMN public.{m.group(1)}",
    ),
    (
        re.compile(
            rf'(?:GRANT|REVOKE)[^;]*?\bON\s+(?:TABLE\s+|SEQUENCE\s+|FUNCTION\s+|TYPE\s+)?"public"\."({_alt(ALL_PIPELINE_OBJECTS)})"',
            re.DOTALL,
        ),
        lambda m: f"GRANT/REVOKE on public.{m.group(1)}",
    ),
]


def classify_block(block: str) -> tuple[bool, str | None]:
    for pattern, label_fn in DROP_PATTERNS:
        m = pattern.search(block)
        if m:
            return True, label_fn(m)
    return False, None


def main() -> int:
    if not BASELINE.exists():
        print(f"baseline not found: {BASELINE}", file=sys.stderr)
        return 1

    text = BASELINE.read_text()

    # Top-level statements are separated by 2+ blank lines (\n\n\n+).
    # Single blank lines only appear inside function bodies.
    blocks = re.split(r"\n{3,}", text)

    kept: list[str] = []
    dropped: list[tuple[str, str]] = []
    for block in blocks:
        if not block.strip():
            continue
        drop, reason = classify_block(block)
        if drop:
            dropped.append((reason or "?", block))
        else:
            kept.append(block)

    new_text = "\n\n\n".join(kept) + "\n"
    BASELINE.write_text(new_text)

    print(f"Total blocks:    {len(blocks)}")
    print(f"Kept blocks:     {len(kept)}")
    print(f"Dropped blocks:  {len(dropped)}")
    print()
    print("=== Dropped objects ===")
    for reason, _ in dropped:
        print(f"  - {reason}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
