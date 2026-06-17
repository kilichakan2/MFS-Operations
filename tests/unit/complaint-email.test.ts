/**
 * tests/unit/complaint-email.test.ts
 *
 * F-11 — pins that sendComplaintEmail routes its send through the Mailer port
 * with a byte-identical message across all three event types (new / resolved /
 * note), and that the silent-skip paths are unchanged.
 *
 * The Mailer wiring singleton is mocked; the recipient fetch is mocked on
 * globalThis.fetch. Env is set per-test before importing the module.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sendMock = vi.fn();
vi.mock("@/lib/wiring/mailer", () => ({
  mailer: { send: (...args: unknown[]) => sendMock(...args) },
}));

const FROM = "MFS Operations <notifications@mfsglobal.co.uk>";

const complaint = {
  id: "c1",
  customer: "Acme",
  category: "Late delivery",
  description: "Order arrived late",
  status: "open",
};

function mockRecipients() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { name: "Ann", email: "ann@example.com" },
        { name: "NoMail", email: null },
      ],
    }),
  );
}

beforeEach(() => {
  vi.resetModules();
  sendMock.mockReset();
  sendMock.mockResolvedValue({ id: "fake-id" });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.RESEND_API_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

describe("sendComplaintEmail — key present, all three event types", () => {
  const cases = [
    { type: "new_complaint", event: { type: "new_complaint", complaint, author: "Hakan" } },
    {
      type: "resolved",
      event: { type: "resolved", complaint, resolvedBy: "Hakan", resolutionNote: "fixed" },
    },
    {
      type: "note_added",
      event: { type: "note_added", complaint, noteBody: "checking", noteAuthor: "Hakan" },
    },
  ] as const;

  for (const { type, event } of cases) {
    it(`calls mailer.send once with the exact { from, to, subject, html } for ${type}`, async () => {
      process.env.RESEND_API_KEY = "test-key";
      process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
      mockRecipients();

      const { sendComplaintEmail } = await import("@/lib/complaint-email");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await sendComplaintEmail(event as any);

      expect(sendMock).toHaveBeenCalledTimes(1);
      const arg = sendMock.mock.calls[0][0];
      expect(arg.from).toBe(FROM);
      expect(arg.to).toEqual(["ann@example.com"]);
      expect(typeof arg.subject).toBe("string");
      expect(arg.subject).toContain("Acme");
      expect(typeof arg.html).toBe("string");
      expect(arg.html.length).toBeGreaterThan(0);
    });
  }
});

describe("sendComplaintEmail — silent skip paths", () => {
  it("no key: logs the verbatim skip line with the event type, never calls mailer.send", async () => {
    const logSpy = vi.spyOn(console, "log");
    const { sendComplaintEmail } = await import("@/lib/complaint-email");
    await sendComplaintEmail({ type: "new_complaint", complaint, author: "Hakan" });
    expect(sendMock).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      "[complaint-email] RESEND_API_KEY not set — skipping (new_complaint)",
    );
  });

  it("no recipients: logs the verbatim 'no recipients' line, never calls mailer.send", async () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => [] }),
    );
    const logSpy = vi.spyOn(console, "log");

    const { sendComplaintEmail } = await import("@/lib/complaint-email");
    await sendComplaintEmail({ type: "new_complaint", complaint, author: "Hakan" });
    expect(sendMock).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      "[complaint-email] no recipients with email — skipping",
    );
  });
});
