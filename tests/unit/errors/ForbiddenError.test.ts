/**
 * tests/unit/errors/ForbiddenError.test.ts
 *
 * Spec for the 403 subclass. Asserts the static httpStatus/code,
 * the JSON body shape, production-mode redaction, and context
 * propagation. Mirrors tests/unit/errors/NotFoundError.test.ts
 * verbatim in shape — F-03 introduces this subclass and ships its
 * standalone unit test alongside (Gate 2 decision: every existing
 * error subclass has its own test file; new ones follow the same
 * convention).
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { ForbiddenError } from "@/lib/errors/ForbiddenError";
import { AppError } from "@/lib/errors/AppError";

describe("ForbiddenError", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is an instance of AppError", () => {
    expect(new ForbiddenError("not allowed")).toBeInstanceOf(AppError);
  });

  it("httpStatus is 403 and code is FORBIDDEN", () => {
    const err = new ForbiddenError("not allowed");
    expect(err.httpStatus).toBe(403);
    expect(err.code).toBe("FORBIDDEN");
  });

  it('name is "ForbiddenError"', () => {
    expect(new ForbiddenError("not allowed").name).toBe("ForbiddenError");
  });

  it("toJSON() emits the documented body in dev mode", () => {
    vi.stubEnv("NODE_ENV", "development");
    const err = new ForbiddenError("role does not permit this action");
    const body = err.toJSON();
    expect(body.code).toBe("FORBIDDEN");
    expect(body.message).toBe("role does not permit this action");
  });

  it("toJSON() strips cause and stack in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const err = new ForbiddenError("not allowed", {
      cause: new Error("inner"),
    });
    const body = err.toJSON();
    expect(body.cause).toBeUndefined();
    expect(body.stack).toBeUndefined();
  });

  it("surfaces context in the JSON body", () => {
    const err = new ForbiddenError("not allowed", {
      context: { allowedRoles: ["admin"], observedRole: "office" },
    });
    expect(err.toJSON().context).toEqual({
      allowedRoles: ["admin"],
      observedRole: "office",
    });
  });
});
