import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { EmptyState } from "@/components/ui/EmptyState";

const Icon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
  </svg>
);

describe("EmptyState", () => {
  it("renders the title", () => {
    render(<EmptyState title="No orders yet" />);
    expect(screen.getByText("No orders yet")).toBeDefined();
  });

  it("renders message, icon and action when given", () => {
    const { container } = render(
      <EmptyState
        icon={Icon}
        title="Nothing here"
        message="Try a different range."
        action={<button>Refresh</button>}
      />,
    );
    expect(screen.getByText("Try a different range.")).toBeDefined();
    expect(container.querySelector("svg")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeDefined();
  });

  it("omits message, icon and action when not given", () => {
    const { container } = render(<EmptyState title="Bare" />);
    expect(container.querySelector("svg")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("uses no hex / stock-palette / mfs-* colour classes", () => {
    const { container } = render(
      <EmptyState icon={Icon} title="T" message="m" action={<button>a</button>} />,
    );
    const html = container.innerHTML;
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(html).not.toMatch(
      /\b(bg|text|border)-(slate|gray|amber|red|blue|white)-\d/,
    );
    expect(html).not.toMatch(/-mfs-(navy|orange)/);
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <EmptyState icon={Icon} title="Nothing here" message="Try later." />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
