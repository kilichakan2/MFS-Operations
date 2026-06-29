import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { SectionLabel } from "@/components/ui/SectionLabel";

describe("SectionLabel", () => {
  it("renders children", () => {
    render(<SectionLabel>Range</SectionLabel>);
    expect(screen.getByText("Range")).toBeDefined();
  });

  it("uses the muted-subtle uppercase semantic tokens (no hex leak)", () => {
    render(<SectionLabel>Range</SectionLabel>);
    const el = screen.getByText("Range");
    expect(el.className).toContain("text-subtle");
    expect(el.className).toContain("uppercase");
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <p>
        <SectionLabel>Range</SectionLabel> of dates
      </p>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
