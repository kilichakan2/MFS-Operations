/**
 * tests/unit/adapters/resend/Mailer.test.ts
 *
 * F-11 — battle-tests the Resend Mailer adapter on the bench. The adapter is
 * the ONLY file allowed to import `resend`; these tests pin:
 *
 *   - with a key: send() calls Resend `emails.send` with the exact
 *     { from, to, subject, html } and maps { data: { id } } → { id } (no vendor
 *     type leaks past the boundary);
 *   - with no key: send() returns { skipped: true, reason: 'no-api-key' } and
 *     NEVER constructs the Resend client / NEVER calls emails.send;
 *   - the client is lazy + memoized — built once on first keyed send.
 *
 * `resend` is mocked (vi.mock) — no network, no key, no cost.
 * Modelled on tests/unit/adapters/anthropic/LLMExtractor.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock the SDK before importing the adapter ────────────────────────────────
// The mock Resend class records the args it was constructed with and the args
// passed to emails.send; the send return value is set per-test.
const sendMock = vi.fn();
const constructedWith: Array<unknown> = [];

vi.mock("resend", () => {
  class MockResend {
    emails = { send: sendMock };
    constructor(key: unknown) {
      constructedWith.push(key);
    }
  }
  return { Resend: MockResend };
});

// Import AFTER the mock is registered.
import { createResendMailer } from "@/lib/adapters/resend";
import type { EmailMessage } from "@/lib/ports";

const message: EmailMessage = {
  from: "MFS Operations <notifications@mfsglobal.co.uk>",
  to: ["a@example.com", "b@example.com"],
  subject: "Hello",
  html: "<p>hi</p>",
};

beforeEach(() => {
  sendMock.mockReset();
  constructedWith.length = 0;
});

describe("createResendMailer — key present", () => {
  it("calls Resend emails.send with the exact { from, to, subject, html }", async () => {
    sendMock.mockResolvedValue({ data: { id: "msg_123" }, error: null });
    const mailer = createResendMailer({ getApiKey: () => "test-key" });

    await mailer.send(message);

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][0]).toEqual({
      from: "MFS Operations <notifications@mfsglobal.co.uk>",
      to: ["a@example.com", "b@example.com"],
      subject: "Hello",
      html: "<p>hi</p>",
    });
  });

  it("constructs the Resend client with the key", async () => {
    sendMock.mockResolvedValue({ data: { id: "msg_123" }, error: null });
    const mailer = createResendMailer({ getApiKey: () => "test-key" });
    await mailer.send(message);
    expect(constructedWith).toEqual(["test-key"]);
  });

  it("maps { data: { id } } → owned { id } (no vendor shape leaks)", async () => {
    sendMock.mockResolvedValue({ data: { id: "msg_123" }, error: null });
    const mailer = createResendMailer({ getApiKey: () => "test-key" });
    const result = await mailer.send(message);
    expect(result).toEqual({ id: "msg_123" });
  });

  it("maps a null data field → { id: undefined } without throwing", async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: "x" } });
    const mailer = createResendMailer({ getApiKey: () => "test-key" });
    const result = await mailer.send(message);
    expect(result).toEqual({ id: undefined });
  });

  it("memoizes the client — built once across two keyed sends", async () => {
    sendMock.mockResolvedValue({ data: { id: "msg_123" }, error: null });
    const mailer = createResendMailer({ getApiKey: () => "test-key" });
    await mailer.send(message);
    await mailer.send(message);
    expect(constructedWith).toHaveLength(1);
    expect(sendMock).toHaveBeenCalledTimes(2);
  });
});

describe("createResendMailer — no key (silent skip)", () => {
  it("returns { skipped: true, reason: 'no-api-key' } when getApiKey() is undefined", async () => {
    const mailer = createResendMailer({ getApiKey: () => undefined });
    const result = await mailer.send(message);
    expect(result).toEqual({ skipped: true, reason: "no-api-key" });
  });

  it("never constructs the client and never calls emails.send with no key", async () => {
    const mailer = createResendMailer({ getApiKey: () => undefined });
    await mailer.send(message);
    expect(constructedWith).toHaveLength(0);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("treats an empty-string key as no key", async () => {
    const mailer = createResendMailer({ getApiKey: () => "" });
    const result = await mailer.send(message);
    expect(result).toEqual({ skipped: true, reason: "no-api-key" });
    expect(constructedWith).toHaveLength(0);
    expect(sendMock).not.toHaveBeenCalled();
  });
});
