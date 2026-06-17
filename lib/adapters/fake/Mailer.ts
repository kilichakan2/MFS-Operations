/**
 * lib/adapters/fake/Mailer.ts
 *
 * Deterministic no-network Fake for the Mailer port (F-11). No SDK import —
 * pure JavaScript. Used by helper/route unit tests to assert "an email was
 * asked to be sent to these people with this subject" without hitting the real
 * Resend API (which costs money and needs a live key — a deliberate test
 * boundary).
 *
 * Boundary discipline (ADR-0002): this file imports zero vendor SDKs and
 * returns the owned SendResult only. Same shape as the other fakes in this
 * folder.
 *
 * Construction:
 *   - `createFakeMailer(seed?)` factory — records each message in `sent` and
 *     returns `seed.result` (default `{ id: 'fake-email-id' }`).
 *   - `fakeMailer` singleton — for symmetry with the other barrels.
 */

import type { EmailMessage, Mailer, SendResult } from "@/lib/ports";

export interface FakeMailerSeed {
  /** Result returned by every send(). Defaults to { id: 'fake-email-id' }. */
  result?: SendResult;
}

export function createFakeMailer(
  seed?: FakeMailerSeed,
): Mailer & { readonly sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return {
    sent,
    async send(message: EmailMessage): Promise<SendResult> {
      sent.push(message);
      return seed?.result ?? { id: "fake-email-id" };
    },
  };
}

export const fakeMailer: Mailer = createFakeMailer();
