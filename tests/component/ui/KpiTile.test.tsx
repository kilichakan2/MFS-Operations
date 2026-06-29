import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { KpiTile } from "@/components/ui/KpiTile";
import type { Accent } from "@/components/ui/accent";

describe("KpiTile", () => {
  it("renders value and label", () => {
    render(<KpiTile value={24} label="Orders" accent="success" />);
    expect(screen.getByText("24")).toBeDefined();
    expect(screen.getByText("Orders")).toBeDefined();
  });

  const cases: Array<{ accent: Accent; fill: string; text: string }> = [
    { accent: "success", fill: "bg-status-success-fill", text: "text-status-success-text" },
    { accent: "warning", fill: "bg-status-warning-fill", text: "text-status-warning-text" },
    { accent: "danger", fill: "bg-status-error-fill", text: "text-status-error-text" },
    { accent: "navy", fill: "bg-action-secondary", text: "text-action-secondary" },
  ];

  it("maps every accent to its semantic stripe + value-text token", () => {
    for (const { accent, fill, text } of cases) {
      const { container, unmount } = render(
        <KpiTile value={1} label="L" accent={accent} />,
      );
      const html = container.innerHTML;
      expect(html).toContain(fill);
      expect(html).toContain(text);
      unmount();
    }
  });

  it("renders a link when href is given, a non-link otherwise", () => {
    const { container, rerender } = render(
      <KpiTile value={1} label="L" accent="navy" />,
    );
    expect(container.querySelector("a")).toBeNull();
    rerender(<KpiTile value={1} label="L" accent="navy" href={"/orders" as never} />);
    expect(screen.getByRole("link")).toBeDefined();
  });

  it("shows sub when given", () => {
    render(<KpiTile value={1} label="L" accent="navy" sub="3 placed" />);
    expect(screen.getByText("3 placed")).toBeDefined();
  });

  it("compact swaps the value size class to text-h1", () => {
    const { container } = render(
      <KpiTile value={1} label="L" accent="navy" compact />,
    );
    expect(container.innerHTML).toContain("text-h1");
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <KpiTile value={24} label="Orders" accent="success" sub="all done" href={"/orders" as never} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
