import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { Popover } from "@/components/ui/Popover";

function Harness() {
  return (
    <Popover trigger={<button>Open panel</button>}>
      <div>Panel body</div>
    </Popover>
  );
}

describe("Popover", () => {
  it("renders the trigger", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Open panel" })).toBeDefined();
  });

  it("the panel is hidden until the trigger is clicked", () => {
    render(<Harness />);
    expect(screen.queryByText("Panel body")).toBeNull();
  });

  it("clicking the trigger opens the panel", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open panel" }));
    expect(screen.getByText("Panel body")).toBeDefined();
  });

  it("ESC closes the open panel", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open panel" }));
    expect(screen.getByText("Panel body")).toBeDefined();
    await user.keyboard("{Escape}");
    expect(screen.queryByText("Panel body")).toBeNull();
  });

  it("the panel uses the semantic overlay surface (no hex leak)", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open panel" }));
    const panel = screen.getByText("Panel body").parentElement as HTMLElement;
    expect(panel.className).toContain("bg-surface-overlay");
  });

  it("uses no hex / stock-palette / mfs-* colour classes when open", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open panel" }));
    const html = document.body.innerHTML;
    expect(html).not.toMatch(
      /\b(bg|text|border)-(slate|gray|amber|red|blue|white)-\d/,
    );
    expect(html).not.toMatch(/-mfs-(navy|orange)/);
  });

  it("has no axe violations on the open popover", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open panel" }));
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
