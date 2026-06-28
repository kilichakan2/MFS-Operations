/**
 * Type augmentation so Vitest 4's `expect(...)` knows about vitest-axe's
 * `toHaveNoViolations` matcher. vitest-axe ships its augmentation against the
 * legacy `Vi` namespace; Vitest 4 reads custom matchers from the `vitest`
 * module's `Assertion` / `AsymmetricMatchersContaining` interfaces, so we
 * re-declare it here. Types only — no runtime effect.
 */
import type { AxeMatchers } from "vitest-axe";

declare module "vitest" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Assertion<T = unknown> extends AxeMatchers {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}
