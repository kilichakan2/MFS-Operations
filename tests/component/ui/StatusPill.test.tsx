import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { StatusPill } from "@/components/ui/StatusPill";
import type { Accent } from "@/components/ui/accent";

describe("StatusPill", () => {
  it("renders the label", () => {
    render(<StatusPill accent="success" label="Live" />);
    expect(screen.getByText("Live")).toBeDefined();
  });

  const cases: Array<{ accent: Accent; fill: string }> = [
    { accent: "success", fill: "bg-status-success-fill" },
    { accent: "warning", fill: "bg-status-warning-fill" },
    { accent: "danger", fill: "bg-status-error-fill" },
    { accent: "navy", fill: "bg-action-secondary" },
  ];

  it("maps every accent to the right dot fill token (no hex leak)", () => {
    for (const { accent, fill } of cases) {
      const { container, unmount } = render(
        <StatusPill accent={accent} label="X" />,
      );
      expect(container.innerHTML).toContain(fill);
      unmount();
    }
  });

  it("has no axe violations", async () => {
    const { container } = render(<StatusPill accent="warning" label="Prospect" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
