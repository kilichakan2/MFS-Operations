import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { PageHeading } from "@/components/ui/PageHeading";

describe("PageHeading", () => {
  it("renders the eyebrow text", () => {
    render(<PageHeading eyebrow="Admin · Daily glance" />);
    expect(screen.getByText("Admin · Daily glance")).toBeDefined();
  });

  it("renders children when given", () => {
    render(
      <PageHeading eyebrow="Admin">
        <span>Sub line</span>
      </PageHeading>,
    );
    expect(screen.getByText("Sub line")).toBeDefined();
  });

  it("renders NO h1 (Q4 decision)", () => {
    const { container } = render(<PageHeading eyebrow="Admin" />);
    expect(container.querySelector("h1")).toBeNull();
  });

  it("uses the subtle semantic token on the eyebrow (no hex leak)", () => {
    render(<PageHeading eyebrow="Admin" />);
    expect(screen.getByText("Admin").className).toContain("text-subtle");
  });

  it("has no axe violations", async () => {
    const { container } = render(<PageHeading eyebrow="Admin · Daily glance" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
