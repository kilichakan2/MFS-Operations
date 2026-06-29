import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { Spinner } from "@/components/ui/Spinner";

describe("Spinner", () => {
  it("renders role=status with the default aria-label", () => {
    render(<Spinner />);
    expect(screen.getByRole("status", { name: "Loading" })).toBeDefined();
  });

  it("uses an overridden label", () => {
    render(<Spinner label="Fetching orders" />);
    expect(screen.getByRole("status", { name: "Fetching orders" })).toBeDefined();
  });

  it("size=lg applies the large dimension class", () => {
    render(<Spinner size="lg" />);
    expect(screen.getByRole("status").className).toContain("w-9");
  });

  it("carries the spin animation class", () => {
    render(<Spinner />);
    expect(screen.getByRole("status").className).toContain(
      "animate-[mfs-spin_0.7s_linear_infinite]",
    );
  });

  it("uses no hex / stock-palette / mfs-* colour classes", () => {
    const { container } = render(<Spinner />);
    const html = container.innerHTML;
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(html).not.toMatch(
      /\b(bg|text|border)-(slate|gray|amber|red|blue|white)-\d/,
    );
    expect(html).not.toMatch(/-mfs-(navy|orange)/);
  });

  it("has no axe violations", async () => {
    const { container } = render(<Spinner />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
