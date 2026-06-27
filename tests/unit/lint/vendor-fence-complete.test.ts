/**
 * tests/unit/lint/vendor-fence-complete.test.ts
 *
 * F-27 — "the Lego principle gets teeth." The headline regression guard for
 * the hexagonal vendor-fence (the `no-restricted-imports` rule that forces
 * every vendor SDK to sit behind `lib/adapters/<vendor>/`).
 *
 * Unlike the ESLint-runtime pins (no-cross-service-imports.test.ts), this is
 * a file-reading pin: it loads the REAL `package.json` and the REAL
 * `.eslintrc.json` from disk and proves the fence is COMPLETE — every
 * shippable runtime dependency is either fenced or deliberately allow-listed —
 * and that the two copies of the fence (top-level block + services/usecases
 * override block) list the same vendors. `next build` ignores ESLint
 * (next.config.ts), so THIS test, inside the hard-gated unit suite, is what
 * makes a future un-fenced vendor unshippable.
 *
 * Scope: `dependencies` ONLY. `devDependencies` are build/test tooling
 * (eslint, vitest, playwright, fake-indexeddb, @types/*, tailwind, …) — never
 * runtime vendor SDKs shipped to the user — so they are out of scope for the
 * runtime vendor-fence.
 *
 * The rule value is array-wrapped: `["error", { paths: [...] }]`. Index `[1]`
 * is the options object; `.paths` is the entry array. This exact access path
 * is load-bearing.
 *
 * Cases:
 *   (1) Every non-allow-listed runtime dependency is fenced (top-level block).
 *   (2) The two ban blocks list the identical set of vendors (sync).
 *   (3) The ALLOWLIST contains no fenced vendor (allow-list and fence are
 *       mutually exclusive — a dep is one or the other, never both).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const ROOT = process.cwd();

/**
 * Deliberately NOT fenced. These are not external-service vendor SDKs, so they
 * do not need to sit behind an adapter. Each carries a one-word reason — adding
 * to this list is a deliberate, reviewed act with a stated justification,
 * exactly the "written justification" CLAUDE.md already demands for deps.
 */
const ALLOWLIST = new Set<string>([
  "react", // framework
  "react-dom", // framework
  "next", // framework
  "zod", // validation
  "recharts", // presentation
  "react-markdown", // presentation
  "lucide-react", // presentation
  "@capacitor/cli", // build-tooling (CLI, not an importable runtime SDK)
]);

function readJson(relPath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(ROOT, relPath), "utf8")) as Record<
    string,
    unknown
  >;
}

/** Pull the `name`s out of an array-wrapped no-restricted-imports rule. */
function fencedNames(
  rule: unknown,
): string[] {
  // rule shape: ["error", { paths: [{ name, message }, ...] }]
  const opts = (rule as unknown[])[1] as { paths: { name: string }[] };
  return opts.paths.map((p) => p.name);
}

describe("F-27 vendor-fence completeness — every runtime vendor is fenced", () => {
  const pkg = readJson("package.json");
  const deps = Object.keys(
    (pkg.dependencies ?? {}) as Record<string, string>,
  );

  const config = readJson(".eslintrc.json");
  const rules = config.rules as Record<string, unknown>;
  const topNames = fencedNames(rules["no-restricted-imports"]);

  // Locate the services/usecases override robustly (by its files glob) rather
  // than hard-coding overrides[1], so reordering overrides can't false-red.
  const overrides = config.overrides as {
    files: string[];
    rules: Record<string, unknown>;
  }[];
  const servicesOverride = overrides.find((o) =>
    o.files.includes("lib/services/**/*.ts"),
  );

  // ── (1) completeness ────────────────────────────────────────────────
  it("fences every non-allow-listed runtime dependency", () => {
    const unfenced = deps.filter(
      (d) => !ALLOWLIST.has(d) && !topNames.includes(d),
    );
    expect(
      unfenced,
      unfenced.length === 0
        ? ""
        : `Un-fenced runtime vendor(s): ${unfenced.join(", ")}.\n` +
            "EITHER fence it — add a { name, message } to BOTH " +
            "no-restricted-imports `paths` blocks in .eslintrc.json and create " +
            "lib/adapters/<vendor>/ — OR justify it on the ALLOWLIST in " +
            "tests/unit/lint/vendor-fence-complete.test.ts with a one-word reason.",
    ).toEqual([]);
  });

  // ── (2) sync ────────────────────────────────────────────────────────
  it("keeps the two ban blocks in sync (same vendors fenced in both)", () => {
    expect(
      servicesOverride,
      "could not locate the lib/services / lib/usecases override in .eslintrc.json",
    ).toBeDefined();
    const overrideNames = fencedNames(
      servicesOverride!.rules["no-restricted-imports"],
    );
    expect(
      [...overrideNames].sort(),
      "vendor fenced in one block but not the other — both no-restricted-imports " +
        "`paths` blocks in .eslintrc.json must list the same vendors.",
    ).toEqual([...topNames].sort());
  });

  // ── (3) allow-list / fence are mutually exclusive ───────────────────
  it("never allow-lists a fenced vendor (a dep is fenced OR allow-listed)", () => {
    const both = [...ALLOWLIST].filter((a) => topNames.includes(a));
    expect(
      both,
      both.length === 0
        ? ""
        : `Dependency listed in BOTH the fence and the ALLOWLIST: ${both.join(", ")}. ` +
            "Pick one — fence a vendor, or allow-list a non-vendor, never both.",
    ).toEqual([]);
  });
});
