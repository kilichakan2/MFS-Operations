/**
 * tests/unit/wiring/mailer.test.ts
 *
 * F-11 — pins the Mailer composition root. The wiring is a parts list: it bolts
 * the Resend adapter into the Mailer port and exports a ready singleton. The
 * key read is lazy (inside the adapter, per send), so importing this module
 * triggers no network and reads no key at module load.
 *
 * `resend` is mocked so the singleton's lazy client construction never reaches
 * the real SDK if a send were ever attempted here.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("resend", () => {
  class MockResend {
    emails = { send: vi.fn() };
  }
  return { Resend: MockResend };
});

describe("lib/wiring/mailer — composition root", () => {
  it("imports without reading env or hitting the network (side-effect free)", async () => {
    // Importing with no RESEND_API_KEY set must not throw — the key is read
    // lazily inside the adapter on send(), never at import time.
    const prev = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    try {
      const mod = await import("@/lib/wiring/mailer");
      expect(mod.mailer).toBeDefined();
    } finally {
      if (prev !== undefined) process.env.RESEND_API_KEY = prev;
    }
  });

  it("exports a Mailer singleton with a send function", async () => {
    const { mailer } = await import("@/lib/wiring/mailer");
    expect(typeof mailer.send).toBe("function");
  });

  it("with no key, the singleton's send returns the silent-skip result", async () => {
    const prev = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    try {
      const { mailer } = await import("@/lib/wiring/mailer");
      const result = await mailer.send({
        from: "MFS Operations <notifications@mfsglobal.co.uk>",
        to: ["a@example.com"],
        subject: "x",
        html: "<p>x</p>",
      });
      expect(result).toEqual({ skipped: true, reason: "no-api-key" });
    } finally {
      if (prev !== undefined) process.env.RESEND_API_KEY = prev;
    }
  });
});
