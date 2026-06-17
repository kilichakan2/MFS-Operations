/**
 * lib/adapters/resend/Mailer.ts
 *
 * The Resend adapter for the Mailer port (F-11). The ONLY file in the app
 * allowed to import `resend` (enforced by the no-restricted-imports lint rule
 * in `.eslintrc.json`).
 *
 * PURE RELOCATION of the send call that used to live inline in the three email
 * helpers (compliment / complaint / pricing) — every value Resend sees and the
 * id it returns is byte-for-byte identical. The helpers keep their FROM
 * constant, recipient fetch, HTML builders and console.log lines; only their
 * send call now routes through this adapter via the Mailer port.
 *
 * Vendor types (`CreateEmailResponse`, `ErrorResponse`) appear only here. The
 * adapter maps Resend's `{ data, error }` response into the owned SendResult
 * (`{ id }`); no vendor shape crosses the boundary. The helpers never inspect
 * `error` today, so neither does this adapter — a transport error thrown by the
 * SDK propagates unchanged (byte-identical).
 *
 * The client is built lazily on first send that has a key (mirrors F-12 /
 * F-TD-04 lazy-client) and memoized, so unit tests can load this module with no
 * key set, and the missing-key guard never constructs a client or touches the
 * network (D2).
 */
import { Resend } from "resend";
import type { EmailMessage, Mailer, SendResult } from "@/lib/ports";

export interface ResendMailerDeps {
  /** Lazy API-key reader — called on each send, never at import time (D2). */
  getApiKey: () => string | undefined;
}

export function createResendMailer(deps: ResendMailerDeps): Mailer {
  // Lazy memoized client (mirrors web-crypto getSecret + F-TD-04 lazy client):
  // built once on the first keyed send and reused.
  let client: Resend | undefined;
  function getClient(key: string): Resend {
    if (!client) {
      client = new Resend(key);
    }
    return client;
  }

  return {
    async send(message: EmailMessage): Promise<SendResult> {
      const key = deps.getApiKey();
      // Missing-key guard (D2): no client constructed, no network — mirrors
      // today's per-call silent skip. The helpers keep their own skip log; this
      // is belt-and-braces defence in depth.
      if (!key) {
        return { skipped: true, reason: "no-api-key" };
      }

      const { from, to, subject, html } = message;
      const res = await getClient(key).emails.send({ from, to, subject, html });
      // Map Resend's { data: { id } | null, error } → owned SendResult.
      return { id: res.data?.id };
    },
  };
}
