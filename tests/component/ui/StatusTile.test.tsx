import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { StatusTile, type TileState } from "@/components/ui/StatusTile";

const Icon = (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
  </svg>
);

describe("StatusTile", () => {
  it("renders label and status line", () => {
    render(
      <StatusTile
        icon={Icon}
        label="Cold Storage"
        statusLine="AM done · PM overdue"
        state="overdue"
        onTap={() => {}}
      />,
    );
    expect(screen.getByText("Cold Storage")).toBeDefined();
    expect(screen.getByText("AM done · PM overdue")).toBeDefined();
  });

  const cases: Array<{ state: TileState; shell: string; line: string }> = [
    { state: "complete", shell: "bg-status-success-soft", line: "text-status-success-text" },
    { state: "overdue", shell: "bg-status-error-soft", line: "text-status-error-text" },
    { state: "due", shell: "bg-status-warning-soft", line: "text-status-warning-text" },
    { state: "deviation", shell: "bg-status-deviation-soft", line: "text-status-deviation-text" },
    { state: "neutral", shell: "bg-status-neutral-soft", line: "text-status-neutral-text" },
  ];

  it("maps every state to its semantic shell + status-text token", () => {
    for (const { state, shell, line } of cases) {
      const { container, unmount } = render(
        <StatusTile
          icon={Icon}
          label="L"
          statusLine="S"
          state={state}
          onTap={() => {}}
        />,
      );
      const html = container.innerHTML;
      expect(html).toContain(shell);
      expect(html).toContain(line);
      unmount();
    }
  });

  // ── tap vs scroll (Fix 1) ──────────────────────────────────────────────────
  // A pointerDown ALONE is the start of a gesture that may become a scroll; it
  // must NOT navigate. Only a real `click` (which the browser suppresses when a
  // touch sequence turns into a scroll) opens the tile.
  it("does NOT fire onTap on pointerDown alone (scroll-start is not a tap)", () => {
    const onTap = vi.fn();
    render(
      <StatusTile icon={Icon} label="Go" statusLine="S" state="neutral" onTap={onTap} />,
    );
    fireEvent.pointerDown(screen.getByRole("button", { name: /Go/ }));
    expect(onTap).not.toHaveBeenCalled();
  });

  it("fires onTap once on a real click (a genuine tap)", () => {
    const onTap = vi.fn();
    render(
      <StatusTile icon={Icon} label="Go" statusLine="S" state="neutral" onTap={onTap} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Go/ }));
    expect(onTap).toHaveBeenCalledOnce();
  });

  it("fires onTap when activated from the keyboard (Enter on the focused tile)", async () => {
    const onTap = vi.fn();
    const user = userEvent.setup();
    render(
      <StatusTile icon={Icon} label="Go" statusLine="S" state="neutral" onTap={onTap} />,
    );
    await user.tab();
    expect(screen.getByRole("button", { name: /Go/ })).toBe(document.activeElement);
    await user.keyboard("{Enter}");
    expect(onTap).toHaveBeenCalledOnce();
  });

  it("fires onTap on Space too (the other native button activation key)", async () => {
    const onTap = vi.fn();
    const user = userEvent.setup();
    render(
      <StatusTile icon={Icon} label="Go" statusLine="S" state="neutral" onTap={onTap} />,
    );
    await user.tab();
    expect(screen.getByRole("button", { name: /Go/ })).toBe(document.activeElement);
    await user.keyboard("{ }");
    expect(onTap).toHaveBeenCalledOnce();
  });

  it("renders the help affordance only when onHelp is given", () => {
    const { rerender } = render(
      <StatusTile icon={Icon} label="Cold" statusLine="S" state="neutral" onTap={() => {}} />,
    );
    expect(screen.queryByRole("button", { name: "Help for Cold" })).toBeNull();

    rerender(
      <StatusTile
        icon={Icon}
        label="Cold"
        statusLine="S"
        state="neutral"
        onTap={() => {}}
        onHelp={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: "Help for Cold" })).not.toBeNull();
  });

  it("clicking the help button fires onHelp only — never the tile's onTap", () => {
    const onTap = vi.fn();
    const onHelp = vi.fn();
    render(
      <StatusTile
        icon={Icon}
        label="Cold"
        statusLine="S"
        state="neutral"
        onTap={onTap}
        onHelp={onHelp}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Help for Cold" }));
    expect(onHelp).toHaveBeenCalledOnce();
    expect(onTap).not.toHaveBeenCalled();
  });

  it("uses no hex / stock-palette / mfs-* colour classes", () => {
    const { container } = render(
      <StatusTile
        icon={Icon}
        label="L"
        statusLine="S"
        state="deviation"
        size="small"
        onTap={() => {}}
        onHelp={() => {}}
      />,
    );
    const html = container.innerHTML;
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(html).not.toMatch(
      /\b(bg|text|border)-(slate|gray|amber|red|blue|green|white)-\d/,
    );
    expect(html).not.toMatch(/-mfs-(navy|orange)/);
  });

  it("has no axe violations (with and without help)", async () => {
    const { container } = render(
      <div>
        <StatusTile icon={Icon} label="A" statusLine="S" state="complete" onTap={() => {}} />
        <StatusTile
          icon={Icon}
          label="B"
          statusLine="S"
          state="due"
          size="small"
          onTap={() => {}}
          onHelp={() => {}}
        />
      </div>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
