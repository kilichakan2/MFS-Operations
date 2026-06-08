/**
 * tests/unit/errors/UnauthorizedError.test.ts
 *
 * Spec for the 401 subclass. Asserts the static httpStatus/code,
 * the JSON body shape, production-mode redaction, and context
 * propagation. Mirrors tests/unit/errors/NotFoundError.test.ts
 * verbatim in shape — F-03 introduces this subclass and ships its
 * standalone unit test alongside (Gate 2 decision: every existing
 * error subclass has its own test file; new ones follow the same
 * convention).
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { UnauthorizedError } from "@/lib/errors/UnauthorizedError";
import { AppError } from "@/lib/errors/AppError";

describe("UnauthorizedError", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is an instance of AppError", () => {
    expect(new UnauthorizedError("no identity")).toBeInstanceOf(AppError);
  });

  it("httpStatus is 401 and code is UNAUTHORIZED", () => {
    const err = new UnauthorizedError("no identity");
    expect(err.httpStatus).toBe(401);
    expect(err.code).toBe("UNAUTHORIZED");
  });

  it('name is "UnauthorizedError"', () => {
    expect(new UnauthorizedError("no identity").name).toBe("UnauthorizedError");
  });

  it("toJSON() emits the documented body in dev mode", () => {
    vi.stubEnv("NODE_ENV", "development");
    const err = new UnauthorizedError("authentication required");
    const body = err.toJSON();
    expect(body.code).toBe("UNAUTHORIZED");
    expect(body.message).toBe("authentication required");
  });

  it("toJSON() strips cause and stack in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const err = new UnauthorizedError("no identity", {
      cause: new Error("inner"),
    });
    const body = err.toJSON();
    expect(body.cause).toBeUndefined();
    expect(body.stack).toBeUndefined();
  });

  it("surfaces context in the JSON body", () => {
    const err = new UnauthorizedError("no identity", {
      context: { observedHeader: "x-mfs-user-id" },
    });
    expect(err.toJSON().context).toEqual({ observedHeader: "x-mfs-user-id" });
  });
});
