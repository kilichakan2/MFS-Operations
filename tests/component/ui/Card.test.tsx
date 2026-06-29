import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { Card } from "@/components/ui/Card";

describe("Card", () => {
  it("renders children", () => {
    render(<Card>Card body</Card>);
    expect(screen.getByText("Card body")).toBeDefined();
  });

  it("renders a plain non-link container when no href", () => {
    const { container } = render(<Card>Body</Card>);
    expect(container.querySelector("a")).toBeNull();
  });

  it("renders a link to href when href is given", () => {
    render(<Card href={"/orders" as never}>Open orders</Card>);
    const link = screen.getByRole("link", { name: "Open orders" });
    expect(link.getAttribute("href")).toBe("/orders");
  });

  it("uses the semantic surface token (no hex leak)", () => {
    const { container } = render(<Card>Body</Card>);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("bg-surface-raised");
    expect(root.className).toContain("border-default");
  });

  it("compact toggles padding from p-5 to p-4", () => {
    const { container, rerender } = render(<Card>Body</Card>);
    expect((container.firstElementChild as HTMLElement).className).toContain("p-5");
    rerender(<Card compact>Body</Card>);
    expect((container.firstElementChild as HTMLElement).className).toContain("p-4");
  });

  it("has no axe violations", async () => {
    const { container } = render(<Card href={"/orders" as never}>Open orders</Card>);
    expect(await axe(container)).toHaveNoViolations();
  });
});
