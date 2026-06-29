import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { CardHead } from "@/components/ui/CardHead";

const Icon = (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
  </svg>
);

describe("CardHead", () => {
  it("renders the title with uppercase styling (no hex leak)", () => {
    render(<CardHead title="Today's orders" />);
    const el = screen.getByText("Today's orders");
    expect(el.className).toContain("uppercase");
    expect(el.className).toContain("text-body");
  });

  it("renders the icon when given and omits it when not", () => {
    const { container, rerender } = render(
      <CardHead title="X" icon={Icon} />,
    );
    expect(container.querySelector("svg")).not.toBeNull();
    rerender(<CardHead title="X" />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("renders a count Badge when count is given, hidden when null", () => {
    const { rerender } = render(<CardHead title="X" count={9} />);
    expect(screen.getByText("9").className).toContain("rounded-pill");
    rerender(<CardHead title="X" />);
    expect(screen.queryByText("9")).toBeNull();
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <CardHead title="Today's orders" icon={Icon} count={4} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
