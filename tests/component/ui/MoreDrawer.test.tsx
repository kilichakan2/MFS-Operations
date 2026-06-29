import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { MoreDrawer } from "@/components/ui/MoreDrawer";

const Icon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
  </svg>
);

const ITEMS = [
  { href: "/users", label: "Users", icon: Icon, desktopOnly: true },
  { href: "/products", label: "Products", icon: Icon },
  { href: "/insights", label: "Insights", icon: Icon },
];

describe("MoreDrawer", () => {
  it("when open renders a dialog listing one row per item", () => {
    render(<MoreDrawer open onClose={() => {}} items={ITEMS} />);
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByRole("link", { name: /Users/ })).toBeDefined();
    expect(screen.getByRole("link", { name: /Products/ })).toBeDefined();
    expect(screen.getByRole("link", { name: /Insights/ })).toBeDefined();
  });

  it("a desktopOnly item renders the Desktop badge", () => {
    render(<MoreDrawer open onClose={() => {}} items={ITEMS} />);
    expect(screen.getByText("Desktop")).toBeDefined();
  });

  it("composes Modal variant=sheet (bottom-sheet positioning present)", () => {
    render(<MoreDrawer open onClose={() => {}} items={ITEMS} />);
    expect(screen.getByRole("dialog").className).toContain("bottom-0");
  });

  it("tapping a row calls onClose", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<MoreDrawer open onClose={onClose} items={ITEMS} />);
    await user.click(screen.getByRole("link", { name: /Products/ }));
    expect(onClose).toHaveBeenCalled();
  });

  it("when closed renders nothing", () => {
    render(<MoreDrawer open={false} onClose={() => {}} items={ITEMS} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("uses no hex / stock-palette / mfs-* colour classes", () => {
    render(<MoreDrawer open onClose={() => {}} items={ITEMS} />);
    const html = document.body.innerHTML;
    expect(html).not.toMatch(
      /\b(bg|text|border)-(slate|gray|amber|red|blue|white)-\d/,
    );
    expect(html).not.toMatch(/-mfs-(navy|orange)/);
  });

  it("has no axe violations on the open drawer", async () => {
    render(<MoreDrawer open onClose={() => {}} items={ITEMS} />);
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
