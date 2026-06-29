import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { Badge } from "@/components/ui/Badge";

describe("Badge", () => {
  it("renders children", () => {
    render(<Badge>7</Badge>);
    expect(screen.getByText("7")).toBeDefined();
  });

  it("defaults to the neutral surface token (no hex leak)", () => {
    render(<Badge>7</Badge>);
    expect(screen.getByText("7").className).toContain("bg-surface-sunken");
  });

  it("tone=success applies the success-soft status token", () => {
    render(<Badge tone="success">3</Badge>);
    expect(screen.getByText("3").className).toContain("bg-status-success-soft");
  });

  it("tone=danger applies the error-soft status token", () => {
    render(<Badge tone="danger">3</Badge>);
    expect(screen.getByText("3").className).toContain("bg-status-error-soft");
  });

  it("has no axe violations", async () => {
    const { container } = render(<Badge tone="warning">12</Badge>);
    expect(await axe(container)).toHaveNoViolations();
  });
});
