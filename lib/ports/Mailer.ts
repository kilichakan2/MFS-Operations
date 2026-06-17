/**
 * lib/ports/Mailer.ts
 *
 * The Mailer port — the app's own socket for "send this email". The email
 * vendor (currently Resend) plugs in behind it via an adapter; the email
 * helpers never see the vendor. (F-11)
 *
 * Pure TypeScript: no vendor import, no framework import. Resend types
 * (CreateEmailResponse, etc.) never appear here — they stay inside the
 * adapter, which maps them into the owned SendResult below.
 */

/** An email to send — owned input shape, vendor-neutral. */
export interface EmailMessage {
  /** Sender, e.g. 'MFS Operations <notifications@mfsglobal.co.uk>'. Per-message (D1). */
  from: string;
  /** Recipient addresses. */
  to: string[];
  subject: string;
  html: string;
}

/** Result of a send — owned output shape. Carries enough to preserve today's log. */
export interface SendResult {
  /** Provider message id when the email was dispatched; undefined when skipped. */
  id?: string;
  /** True when the send was deliberately skipped (e.g. no API key configured). */
  skipped?: boolean;
  /** Machine-readable skip reason, present only when skipped is true. */
  reason?: string;
}

export interface Mailer {
  /**
   * Send one email. Never throws for a "no key configured" condition — returns
   * { skipped: true } instead (mirrors today's silent-skip). Transport errors
   * from the provider propagate as a rejected promise (today's behaviour: the
   * helper's caller wraps the send in try/catch).
   */
  send(message: EmailMessage): Promise<SendResult>;
}
