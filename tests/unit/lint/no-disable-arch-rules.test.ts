/**
 * tests/unit/lint/no-disable-arch-rules.test.ts
 *
 * F-27 — "the Lego principle gets teeth." The disable guard: no source file
 * may switch off the architecture lint rules with an `eslint-disable*`
 * directive that NAMES `no-restricted-imports` or `no-restricted-syntax`.
 * Disabling those rules is bypassing the hexagonal vendor-fence — the whole
 * point of F-27 — so it must never appear in shipped source. If you think you
 * need it, you are reaching past an adapter and must go through the port
 * instead.
 *
 * Scope (per the locked spec): named-rule disables ONLY. A bare
 * `// eslint-disable` (no rule named) technically disables everything,
 * including the architecture rules, but it falls outside this guard — that is
 * a separate, narrower BACKLOG hardening, not F-27. The pre-existing bare
 * disable at app/cash/page.tsx:732 must therefore NOT trip this test, and the
 * 11 `react-hooks/exhaustive-deps` disables are unrelated.
 *
 * The match is scoped to an actual `eslint-disable*` DIRECTIVE token followed
 * (in the same comment) by one of the architecture rule names — so the rule
 * name appearing alone (a string literal, prose, or this very file's message
 * text) does NOT count. The four scanned globs EXCLUDE `tests/**`, so the
 * guard never scans itself.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "lib", "components", "hooks"];
const EXCLUDE_DIRS = new Set(["node_modules", ".next", "tests"]);
const SOURCE_EXT = /\.tsx?$/;

/**
 * Matches an eslint-disable / -line / -next-line directive whose rule list
 * contains an architecture rule. Anchored on the directive token so the bare
 * rule name elsewhere (strings, prose) is ignored.
 */
const ARCH_DISABLE =
  /eslint-disable(?:-next-line|-line)?[^\n]*\b(no-restricted-imports|no-restricted-syntax)\b/;

/** Recursively collect *.ts / *.tsx files under a directory. */
function walk(dir: string, acc: string[]): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc; // directory may not exist (e.g. hooks/) — fine.
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (!EXCLUDE_DIRS.has(entry)) walk(full, acc);
    } else if (SOURCE_EXT.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

function collectSourceFiles(): string[] {
  const acc: string[] = [];
  for (const dir of SCAN_DIRS) walk(join(ROOT, dir), acc);
  return acc;
}

describe("F-27 no-disable-arch-rules — the Lego fence may never be disabled", () => {
  it("has zero eslint-disable directives naming an architecture rule", () => {
    const offenders: string[] = [];
    for (const file of collectSourceFiles()) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (ARCH_DISABLE.test(line)) {
          const rel = file.slice(ROOT.length + 1);
          offenders.push(`${rel}:${i + 1}`);
        }
      });
    }
    expect(
      offenders,
      offenders.length === 0
        ? ""
        : `Architecture lint rules disabled in source: ${offenders.join(", ")}.\n` +
            "The hexagonal rules no-restricted-imports / no-restricted-syntax may " +
            "NEVER be disabled — that is the whole point of F-27. If you think you " +
            "need to import a vendor here, go through its port/adapter instead of " +
            "silencing the fence.",
    ).toEqual([]);
  });
});
