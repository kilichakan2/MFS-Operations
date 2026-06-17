/**
 * lib/wiring/mailer.ts — composition root for the Mailer port (F-11)
 *
 * The ONE business-layer file where the Mailer port is bolted to its concrete
 * Resend adapter (same F-TD-11 rule as the other wiring files: only composition
 * roots import from `@/lib/adapters/*`).
 *
 * Rip-out contract (CLAUDE.md acceptance test): swapping the email vendor =
 * one new adapter folder (`lib/adapters/<vendor>/`) + one edit to THIS file.
 * The three email helpers, the port, the domain types, the routes and the UI
 * never change.
 *
 * This file is a parts list, not logic. `getApiKey` is lazy — the env var is
 * read per send inside the adapter, never at import — so importing this module
 * triggers no network and reads no key at startup. The missing-key silent-skip
 * (today's behaviour) is preserved by the adapter's per-call guard (D2); each
 * helper also keeps its own skip check + console.log (D3).
 */
import { createResendMailer } from "@/lib/adapters/resend";
import type { Mailer } from "@/lib/ports";

export const mailer: Mailer = createResendMailer({
  getApiKey: () => process.env.RESEND_API_KEY,
});
