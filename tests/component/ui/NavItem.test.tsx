import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { NavItem } from "@/components/ui/NavItem";

const Icon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 3h18v18H3z" />
  </svg>
);

describe("NavItem", () => {
  it("renders the label and icon", () => {
    const { container } = render(
      <NavItem href={"/orders" as never} icon={Icon} label="Orders" />,
    );
    expect(screen.getByText("Orders")).toBeDefined();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("with href renders a link to that href", () => {
    render(<NavItem href={"/orders" as never} icon={Icon} label="Orders" />);
    const link = screen.getByRole("link", { name: "Orders" });
    expect(link.getAttribute("href")).toBe("/orders");
  });

  it("active link sets aria-current=page", () => {
    render(<NavItem href={"/orders" as never} icon={Icon} label="Orders" active />);
    expect(
      screen.getByRole("link", { name: "Orders" }).getAttribute("aria-current"),
    ).toBe("page");
  });

  it("inactive link has no aria-current", () => {
    render(<NavItem href={"/orders" as never} icon={Icon} label="Orders" />);
    expect(
      screen.getByRole("link", { name: "Orders" }).getAttribute("aria-current"),
    ).toBeNull();
  });

  it("with onClick (no href) renders a button that fires onClick", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<NavItem onClick={onClick} icon={Icon} label="More" />);
    await user.click(screen.getByRole("button", { name: "More" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("active applies the orange action token", () => {
    render(<NavItem href={"/orders" as never} icon={Icon} label="Orders" active />);
    expect(
      screen.getByRole("link", { name: "Orders" }).className,
    ).toContain("text-action-primary");
  });

  it("orientation=list renders the badge slot when given", () => {
    render(
      <NavItem
        href={"/users" as never}
        icon={Icon}
        label="Users"
        orientation="list"
        badge={<span>DESKTOP</span>}
      />,
    );
    expect(screen.getByText("DESKTOP")).toBeDefined();
  });

  it("orientation=list without a badge renders no badge text", () => {
    render(
      <NavItem href={"/users" as never} icon={Icon} label="Users" orientation="list" />,
    );
    expect(screen.queryByText("DESKTOP")).toBeNull();
  });

  it("uses no hex / stock-palette / mfs-* colour classes", () => {
    const { container } = render(
      <NavItem href={"/orders" as never} icon={Icon} label="Orders" active />,
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
      <NavItem href={"/orders" as never} icon={Icon} label="Orders" />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
