/**
 * tests/unit/pricing-email.test.ts
 *
 * F-11 — pins that sendPricingEmail routes its send through the Mailer port
 * with a byte-identical message, and that the silent-skip paths are unchanged.
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

const data = {
  id: "p1",
  reference_number: "PA-2026-001",
  customer_name: "Acme",
  is_prospect: false,
  rep_name: "Hakan",
  valid_from: "2026-06-01",
  valid_until: null,
  notes: null,
  lines: [
    {
      product_name: "Lamb Shoulder",
      box_size: "10kg",
      price: 12.5,
      unit: "per_kg",
      notes: null,
      is_freetext: false,
    },
  ],
};

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

describe("sendPricingEmail — key present, recipients found", () => {
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
          { name: "NoMail", email: null },
        ],
      }),
    );

    const { sendPricingEmail } = await import("@/lib/pricing-email");
    await sendPricingEmail(data);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const arg = sendMock.mock.calls[0][0];
    expect(arg.from).toBe(FROM);
    expect(arg.to).toEqual(["ann@example.com"]);
    expect(arg.subject).toBe(
      "✅ Price Agreement Activated — Acme (PA-2026-001)",
    );
    expect(typeof arg.html).toBe("string");
    expect(arg.html).toContain("Lamb Shoulder");
  });
});

describe("sendPricingEmail — silent skip paths", () => {
  it("no key: logs the verbatim skip line, never calls mailer.send", async () => {
    const logSpy = vi.spyOn(console, "log");
    const { sendPricingEmail } = await import("@/lib/pricing-email");
    await sendPricingEmail(data);
    expect(sendMock).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      "[pricing-email] RESEND_API_KEY not set — skipping",
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

    const { sendPricingEmail } = await import("@/lib/pricing-email");
    await sendPricingEmail(data);
    expect(sendMock).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      "[pricing-email] no recipients with email — skipping",
    );
  });
});
