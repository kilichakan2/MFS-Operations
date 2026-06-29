import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { DesktopSidebar } from "@/components/ui/DesktopSidebar";

const Icon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
  </svg>
);

const ITEMS = [
  { href: "/dashboard", label: "Home", icon: Icon },
  { href: "/orders", label: "Orders", icon: Icon },
  { href: "/users", label: "Users", icon: Icon },
];

describe("DesktopSidebar", () => {
  it("renders one row per item", () => {
    render(<DesktopSidebar items={ITEMS} />);
    expect(screen.getAllByRole("link").length).toBe(3);
  });

  it("highlights the activeHref row", () => {
    render(<DesktopSidebar items={ITEMS} activeHref="/orders" />);
    expect(
      screen.getByRole("link", { name: "Orders" }).className,
    ).toContain("text-action-primary");
  });

  it("expanded toggles the rail width to w-60, collapsed to w-16", () => {
    const { rerender } = render(<DesktopSidebar items={ITEMS} />);
    expect(screen.getByRole("complementary").className).toContain("w-16");
    rerender(<DesktopSidebar items={ITEMS} expanded />);
    expect(screen.getByRole("complementary").className).toContain("w-60");
  });

  it("the chevron fires onToggle with an aria-label reflecting state", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<DesktopSidebar items={ITEMS} onToggle={onToggle} />);
    const btn = screen.getByRole("button", { name: "Expand sidebar" });
    await user.click(btn);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("the toggle label reflects the expanded state", () => {
    render(<DesktopSidebar items={ITEMS} expanded onToggle={() => {}} />);
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeDefined();
  });

  it("renders the logo slot when given", () => {
    render(<DesktopSidebar items={ITEMS} logo={<span>BRAND</span>} />);
    expect(screen.getByText("BRAND")).toBeDefined();
  });

  it("uses no hex / stock-palette / mfs-* colour classes", () => {
    const { container } = render(
      <DesktopSidebar items={ITEMS} activeHref="/orders" expanded onToggle={() => {}} />,
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
      <DesktopSidebar items={ITEMS} activeHref="/orders" onToggle={() => {}} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
