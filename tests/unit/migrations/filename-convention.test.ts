/**
 * tests/unit/migrations/filename-convention.test.ts
 *
 * F-TD-15 — pins the migration-filename convention: every file in
 * `supabase/migrations/` must use a full 14-digit timestamp,
 * `YYYYMMDDHHMMSS_name.sql`. The older `YYYYMMDD_NNN_name.sql` form is
 * banned because the Supabase CLI derives a migration's `version` from the
 * digits BEFORE the first underscore — so two same-day `YYYYMMDD_NNN` files
 * collide on the same version (`schema_migrations_pkey` 23505 on db:reset),
 * AND the short form breaks Supabase preview-branch re-sync on a PR's 2nd+
 * push (`Remote migration versions not found in local migrations directory`
 * → branch `status=MIGRATIONS_FAILED`).
 *
 * This is the same idiom as the lint pins under tests/unit/lint/: it reads
 * the SHIPPED artifact from disk (here, the real migrations folder) so the
 * test fails the moment a non-conforming file lands. It is NOT an ESLint
 * rule because ESLint lints file *contents*, not the *names* of .sql files
 * in a folder. The vitest config already globs tests/unit/**\/*.test.ts
 * (vitest.config.ts:8), so this file is picked up with zero config change.
 *
 * Because it reads the live folder, this test FAILS until the 4 historical
 * short-named files are renamed and PASSES once they are — a real
 * acceptance check, not a tautology.
 */
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

// "14 digits, then an underscore, then lowercase letters / numbers /
// underscores, ending in .sql". e.g. 20260613000000_enable_rls_42_tables.sql
// passes; 20260613_001_enable_rls_42_tables.sql fails (only 8 leading digits).
const MIGRATION_FILENAME = /^\d{14}_[a-z0-9_]+\.sql$/;

const MIGRATIONS_DIR = resolve(
  __dirname,
  "../../../supabase/migrations",
);

function migrationFilenames(): string[] {
  return readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
}

describe("F-TD-15 migration-filename convention (YYYYMMDDHHMMSS_name.sql)", () => {
  it("finds at least one migration (guards against a wrong path silently passing)", () => {
    expect(migrationFilenames().length).toBeGreaterThan(0);
  });

  it("every migration filename uses a full 14-digit timestamp", () => {
    const offenders = migrationFilenames().filter(
      (f) => !MIGRATION_FILENAME.test(f),
    );
    expect(
      offenders,
      `Migration filenames must match ${MIGRATION_FILENAME} ` +
        `(full 14-digit YYYYMMDDHHMMSS_name.sql). Offending file(s): ` +
        `${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("the regex itself rejects the banned YYYYMMDD_NNN form (the guard has teeth)", () => {
    // Pinned negative + positive cases so the rule can't be quietly
    // loosened and still pass.
    expect("20260613_001_enable_rls_42_tables.sql").not.toMatch(
      MIGRATION_FILENAME,
    );
    expect("20260530_001_foo.sql").not.toMatch(MIGRATION_FILENAME);
    expect("20260613000000_enable_rls_42_tables.sql").toMatch(
      MIGRATION_FILENAME,
    );
  });

  it("no two migrations share the same 14-digit version prefix (the original collision guard)", () => {
    const files = migrationFilenames();
    // The CLI reads the version from the leading digits. For conforming
    // files that's exactly the first 14; this catches two scripts that
    // would claim the same schema_migrations slot.
    const versions = files.map((f) => f.slice(0, 14));
    const unique = new Set(versions);
    expect(
      unique.size,
      `Duplicate migration version prefix(es) detected among: ` +
        `${files.join(", ")}`,
    ).toBe(files.length);
  });
});
