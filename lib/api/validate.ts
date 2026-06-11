/**
 * lib/api/validate.ts
 *
 * The one tiny bridge between zod and the app's typed-error contract.
 *
 * `lib/api/**` is the presentation boundary (plan §5 D6): the ONLY
 * place zod may be imported (alongside the schema modules under
 * lib/api/orders/ and lib/api/kds/). zod is treated as a framework-
 * level library (no I/O, no vendor service) — it never appears in
 * lib/domain, lib/ports, lib/services or lib/adapters. F-27's lint
 * tightening can codify this.
 *
 * What this hides: the ZodError → ValidationError mapping, so clients
 * always receive the documented `fields: Record<field, string[]>`
 * shape (lib/errors/ValidationError.ts) no matter which schema failed.
 */
import type { z } from "zod";
import { ValidationError } from "@/lib/errors";

/**
 * Parse `value` with `schema`; return the (possibly transformed)
 * output, or throw `ValidationError("Invalid request", fields)` where
 * `fields = { '<path.joined>': [messages…] }`. Root-level issues
 * (e.g. a null body) are keyed `'body'`.
 */
export function parseOrThrow<Out>(
  schema: z.ZodType<Out, unknown>,
  value: unknown,
): Out {
  const result = schema.safeParse(value);
  if (!result.success) {
    const fields: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.length > 0 ? issue.path.join(".") : "body";
      (fields[path] ??= []).push(issue.message);
    }
    throw new ValidationError("Invalid request", fields);
  }
  return result.data;
}
