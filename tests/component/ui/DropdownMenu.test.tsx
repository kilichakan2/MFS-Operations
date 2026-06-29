import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { DropdownMenu, type DropdownMenuItem } from "@/components/ui/DropdownMenu";

function makeItems(onLogout = () => {}): DropdownMenuItem[] {
  return [
    { id: "lang", label: "Language" },
    { id: "settings", label: "Settings", disabled: true },
    { id: "sep", separator: true },
    { id: "logout", label: "Log out", tone: "danger", onSelect: onLogout },
  ];
}

describe("DropdownMenu", () => {
  it("renders the trigger", () => {
    render(<DropdownMenu trigger={<button>Menu</button>} items={makeItems()} />);
    expect(screen.getByRole("button", { name: "Menu" })).toBeDefined();
  });

  it("clicking the trigger opens a role=menu", async () => {
    const user = userEvent.setup();
    render(<DropdownMenu trigger={<button>Menu</button>} items={makeItems()} />);
    await user.click(screen.getByRole("button", { name: "Menu" }));
    expect(screen.getByRole("menu")).toBeDefined();
  });

  it("renders a menuitem per non-separator item", async () => {
    const user = userEvent.setup();
    render(<DropdownMenu trigger={<button>Menu</button>} items={makeItems()} />);
    await user.click(screen.getByRole("button", { name: "Menu" }));
    // 3 non-separator items (Language, Settings, Log out)
    expect(screen.getAllByRole("menuitem").length).toBe(3);
  });

  it("selecting an item fires its onSelect", async () => {
    const onLogout = vi.fn();
    const user = userEvent.setup();
    render(
      <DropdownMenu trigger={<button>Menu</button>} items={makeItems(onLogout)} />,
    );
    await user.click(screen.getByRole("button", { name: "Menu" }));
    await user.click(screen.getByRole("menuitem", { name: "Log out" }));
    expect(onLogout).toHaveBeenCalledOnce();
  });

  it("a danger item carries the error-text token", async () => {
    const user = userEvent.setup();
    render(<DropdownMenu trigger={<button>Menu</button>} items={makeItems()} />);
    await user.click(screen.getByRole("button", { name: "Menu" }));
    expect(
      screen.getByRole("menuitem", { name: "Log out" }).className,
    ).toContain("text-status-error-text");
  });

  it("a disabled item is marked disabled", async () => {
    const user = userEvent.setup();
    render(<DropdownMenu trigger={<button>Menu</button>} items={makeItems()} />);
    await user.click(screen.getByRole("button", { name: "Menu" }));
    const settings = screen.getByRole("menuitem", { name: "Settings" });
    expect(settings.getAttribute("data-disabled")).not.toBeNull();
  });

  it("uses no hex / stock-palette / mfs-* colour classes when open", async () => {
    const user = userEvent.setup();
    render(<DropdownMenu trigger={<button>Menu</button>} items={makeItems()} />);
    await user.click(screen.getByRole("button", { name: "Menu" }));
    const html = document.body.innerHTML;
    expect(html).not.toMatch(
      /\b(bg|text|border)-(slate|gray|amber|red|blue|white)-\d/,
    );
    expect(html).not.toMatch(/-mfs-(navy|orange)/);
  });

  it("has no axe violations on the open menu", async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu
        trigger={<button>Menu</button>}
        items={makeItems()}
        aria-label="Account menu"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Menu" }));
    // Scope axe to the opened menu (the subject under test). The bare trigger
    // button lives outside any landmark in jsdom's document.body, which trips
    // axe's "region" rule — an artifact of test isolation, not a menu defect.
    expect(await axe(screen.getByRole("menu"))).toHaveNoViolations();
  });
});
