import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
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

  it("fires onTap when the tile is pressed", () => {
    const onTap = vi.fn();
    render(
      <StatusTile icon={Icon} label="Go" statusLine="S" state="neutral" onTap={onTap} />,
    );
    fireEvent.pointerDown(screen.getByRole("button", { name: /Go/ }));
    expect(onTap).toHaveBeenCalledOnce();
  });

  it("renders the help affordance only when onHelp is given, and fires it", () => {
    const onHelp = vi.fn();
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
        onHelp={onHelp}
      />,
    );
    fireEvent.pointerDown(screen.getByRole("button", { name: "Help for Cold" }));
    expect(onHelp).toHaveBeenCalledOnce();
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
