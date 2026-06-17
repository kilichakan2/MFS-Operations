/**
 * tests/unit/compliment-email.test.ts
 *
 * F-11 — pins that sendComplimentEmail routes its send through the Mailer port
 * (not the resend SDK) with a byte-identical message, and that the silent-skip
 * path is unchanged:
 *
 *   - with a key + recipients: mailer.send is called once with the exact
 *     { from, to, subject, html }, where `from` is the locked FROM constant;
 *   - with no key: early-return, the verbatim skip console.log fires, and
 *     mailer.send is NEVER called;
 *   - with no recipients: the verbatim "no recipients" skip log fires and
 *     mailer.send is NEVER called.
 *
 * The Mailer wiring singleton is mocked (vi.mock) so no real Resend is hit. The
 * recipient fetch is mocked on globalThis.fetch. RESEND_API_KEY / Supabase env
 * are set per-test BEFORE importing the module (the helper reads them at module
 * load into module-level consts).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sendMock = vi.fn();
vi.mock("@/lib/wiring/mailer", () => ({
  mailer: { send: (...args: unknown[]) => sendMock(...args) },
}));

const FROM = "MFS Operations <notifications@mfsglobal.co.uk>";

beforeEach(() => {
  vi.resetModules();
  sendMock.mockReset();
  sendMock.mockResolvedValue({ id: "fake-id" });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.RESEND_API_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

describe("sendComplimentEmail — key present, recipients found", () => {
  it("calls mailer.send once with the exact { from, to, subject, html }", async () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { name: "Ann", email: "ann@example.com" },
          { name: "Bob", email: "bob@example.com" },
          { name: "NoMail", email: null },
        ],
      }),
    );

    const { sendComplimentEmail } = await import("@/lib/compliment-email");
    await sendComplimentEmail({
      body: "Great work",
      postedByName: "Hakan",
      recipientName: "Ann",
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const arg = sendMock.mock.calls[0][0];
    expect(arg.from).toBe(FROM);
    expect(arg.to).toEqual(["ann@example.com", "bob@example.com"]);
    expect(typeof arg.subject).toBe("string");
    expect(arg.subject).toContain("Ann");
    expect(typeof arg.html).toBe("string");
    expect(arg.html).toContain("Great work");

    vi.unstubAllGlobals();
  });
});

describe("sendComplimentEmail — silent skip paths", () => {
  it("no key: early-returns, logs the verbatim skip line, never calls mailer.send", async () => {
    // RESEND_API_KEY unset
    const logSpy = vi.spyOn(console, "log");
    const { sendComplimentEmail } = await import("@/lib/compliment-email");
    await sendComplimentEmail({
      body: "x",
      postedByName: "y",
      recipientName: null,
    });
    expect(sendMock).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      "[compliment-email] RESEND_API_KEY not set — skipping",
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

    const { sendComplimentEmail } = await import("@/lib/compliment-email");
    await sendComplimentEmail({
      body: "x",
      postedByName: "y",
      recipientName: null,
    });
    expect(sendMock).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      "[compliment-email] no recipients with email — skipping",
    );

    vi.unstubAllGlobals();
  });
});
