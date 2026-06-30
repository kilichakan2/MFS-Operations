import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { ProgressRing } from "@/components/ui/ProgressRing";

describe("ProgressRing", () => {
  it("renders the rounded percentage by default", () => {
    render(<ProgressRing value={74.6} />);
    expect(screen.getByText("75%")).toBeDefined();
  });

  it("exposes the percentage as an accessible label", () => {
    render(<ProgressRing value={50} />);
    expect(screen.getByLabelText("50% complete")).toBeDefined();
  });

  it("clamps out-of-range values to 0–100", () => {
    const { rerender } = render(<ProgressRing value={-20} />);
    expect(screen.getByText("0%")).toBeDefined();
    rerender(<ProgressRing value={250} />);
    expect(screen.getByText("100%")).toBeDefined();
  });

  it("owns the fill via a token-var conic-gradient (no raw width)", () => {
    const { container } = render(<ProgressRing value={40} accent="success" />);
    const style = (container.firstElementChild as HTMLElement).getAttribute(
      "style",
    );
    expect(style).toContain("conic-gradient");
    expect(style).toContain("var(--status-success-fill)");
    expect(style).toContain("40%");
  });

  it("renders a custom centre label when given", () => {
    render(<ProgressRing value={100} label="6 of 8" />);
    expect(screen.getByText("6 of 8")).toBeDefined();
  });

  it("uses no hex / stock-palette / mfs-* colour classes", () => {
    const { container } = render(<ProgressRing value={60} accent="warning" />);
    const html = container.innerHTML;
    expect(html).not.toMatch(
      /\b(bg|text|border)-(slate|gray|amber|red|blue|green|white)-\d/,
    );
    expect(html).not.toMatch(/-mfs-(navy|orange)/);
  });

  it("has no axe violations", async () => {
    const { container } = render(<ProgressRing value={75} size="lg" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
