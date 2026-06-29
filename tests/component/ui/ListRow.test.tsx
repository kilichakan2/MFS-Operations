import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { ListRow } from "@/components/ui/ListRow";

describe("ListRow", () => {
  it("renders cells", () => {
    render(<ListRow cells={<span>Cell content</span>} />);
    expect(screen.getByText("Cell content")).toBeDefined();
  });

  it("shows an accent dot with the mapped token only when accent is given", () => {
    const { container, rerender } = render(<ListRow cells={<span>x</span>} />);
    expect(container.querySelector("span[aria-hidden]")).toBeNull();
    rerender(<ListRow cells={<span>x</span>} accent="warning" />);
    const dot = container.querySelector("span[aria-hidden]") as HTMLElement;
    expect(dot.className).toContain("bg-status-warning-fill");
  });

  it("last toggles the bottom border", () => {
    const { container, rerender } = render(<ListRow cells={<span>x</span>} />);
    expect((container.firstElementChild as HTMLElement).className).toContain("border-b");
    rerender(<ListRow cells={<span>x</span>} last />);
    expect((container.firstElementChild as HTMLElement).className).not.toContain("border-b");
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <ListRow cells={<span>The Harbour Kitchen</span>} accent="success" />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
