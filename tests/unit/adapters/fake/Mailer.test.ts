/**
 * tests/unit/adapters/fake/Mailer.test.ts
 *
 * F-11 — the Fake Mailer: a no-network, no-SDK stand-in that records every
 * EmailMessage passed to send() so helper/route tests can assert "an email was
 * sent to these people with this subject" without hitting the real Resend
 * (which costs money and needs a live key).
 *
 * Modelled on the other fake adapters in lib/adapters/fake/.
 */
import { describe, it, expect } from "vitest";
import { createFakeMailer } from "@/lib/adapters/fake";
import type { EmailMessage } from "@/lib/ports";

const sample: EmailMessage = {
  from: "MFS Operations <notifications@mfsglobal.co.uk>",
  to: ["a@example.com", "b@example.com"],
  subject: "Hello",
  html: "<p>hi</p>",
};

describe("createFakeMailer — records messages", () => {
  it("records each message passed to send() in `sent`", async () => {
    const mailer = createFakeMailer();
    await mailer.send(sample);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]).toEqual(sample);
  });

  it("accumulates multiple sends in order", async () => {
    const mailer = createFakeMailer();
    await mailer.send(sample);
    await mailer.send({ ...sample, subject: "Second" });
    expect(mailer.sent.map((m) => m.subject)).toEqual(["Hello", "Second"]);
  });

  it("returns the default result { id: 'fake-email-id' }", async () => {
    const mailer = createFakeMailer();
    const result = await mailer.send(sample);
    expect(result).toEqual({ id: "fake-email-id" });
  });

  it("returns a seeded result when provided", async () => {
    const mailer = createFakeMailer({ result: { skipped: true, reason: "no-api-key" } });
    const result = await mailer.send(sample);
    expect(result).toEqual({ skipped: true, reason: "no-api-key" });
  });
});
