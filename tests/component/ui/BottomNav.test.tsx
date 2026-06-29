import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { BottomNav } from "@/components/ui/BottomNav";

const Icon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
  </svg>
);

const ITEMS = [
  { href: "/dashboard", label: "Home", icon: Icon },
  { href: "/orders", label: "Orders", icon: Icon },
  { href: "/kds", label: "KDS", icon: Icon },
];

describe("BottomNav", () => {
  it("renders one cell per item", () => {
    render(<BottomNav items={ITEMS} />);
    expect(screen.getAllByRole("link").length).toBe(3);
  });

  it("the activeHref cell gets aria-current=page and the orange token", () => {
    render(<BottomNav items={ITEMS} activeHref="/orders" />);
    const active = screen.getByRole("link", { name: "Orders" });
    expect(active.getAttribute("aria-current")).toBe("page");
    expect(active.className).toContain("text-action-primary");
  });

  it("renders the More cell and fires onOpenMore when onOpenMore is given", async () => {
    const onOpenMore = vi.fn();
    const user = userEvent.setup();
    render(<BottomNav items={ITEMS} onOpenMore={onOpenMore} />);
    await user.click(screen.getByRole("button", { name: "More" }));
    expect(onOpenMore).toHaveBeenCalledOnce();
  });

  it("renders no More cell when onOpenMore is absent", () => {
    render(<BottomNav items={ITEMS} />);
    expect(screen.queryByRole("button", { name: "More" })).toBeNull();
  });

  it("the nav carries the accessible label", () => {
    render(<BottomNav items={ITEMS} aria-label="Primary" />);
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeDefined();
  });

  it("uses no hex / stock-palette / mfs-* colour classes", () => {
    const { container } = render(
      <BottomNav items={ITEMS} activeHref="/orders" onOpenMore={() => {}} />,
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
      <BottomNav items={ITEMS} activeHref="/orders" onOpenMore={() => {}} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
