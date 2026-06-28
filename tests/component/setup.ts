/**
 * Component test lane setup (jsdom only).
 *
 * Two-lane Vitest: this file applies ONLY to the `component` project
 * (environment: jsdom). The `unit` project (environment: node) is unaffected —
 * existing logic tests keep their old behaviour.
 *
 * It does two things:
 *  - registers vitest-axe's accessibility matcher (`toHaveNoViolations`)
 *  - cleans up the rendered DOM after every test
 *
 * NOTE: `@testing-library/jest-dom` is deliberately NOT used.
 */
import { afterEach, expect } from "vitest";
import { cleanup } from "@testing-library/react";
import * as matchers from "vitest-axe/matchers";
import "vitest-axe/extend-expect";

expect.extend(matchers);

afterEach(() => {
  cleanup();
});
