import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { SyncDot } from "@/components/ui/SyncDot";

describe("SyncDot", () => {
  it("state=synced renders the success fill and shows time when given", () => {
    const { container } = render(<SyncDot state="synced" time="14:05" />);
    expect(container.innerHTML).toContain("bg-status-success-fill");
    expect(screen.getByText("14:05")).toBeDefined();
  });

  it("state=syncing renders the warning fill + pulse", () => {
    const { container } = render(<SyncDot state="syncing" />);
    expect(container.innerHTML).toContain("bg-status-warning-fill");
    expect(container.innerHTML).toContain("animate-pulse");
  });

  it("state=stuck renders the error fill + default aria-label 'Sync error'", () => {
    render(<SyncDot state="stuck" />);
    const el = screen.getByRole("status", { name: "Sync error" });
    expect(el.className).toContain("bg-status-error-fill");
  });

  it("state=clean renders nothing", () => {
    const { container } = render(<SyncDot state="clean" />);
    expect(container.firstChild).toBeNull();
  });

  it("size toggles the dot dimension (sm w-1.5 vs md w-2.5)", () => {
    const { container, rerender } = render(<SyncDot state="syncing" size="sm" />);
    expect(container.innerHTML).toContain("w-1.5");
    rerender(<SyncDot state="syncing" size="md" />);
    expect(container.innerHTML).toContain("w-2.5");
  });

  it("uses no stock-palette/hex colour class", () => {
    const { container } = render(<SyncDot state="synced" time="14:05" />);
    expect(container.innerHTML).not.toMatch(/bg-(green|amber|red|gray)-\d/);
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,6}/);
  });

  it("has no axe violations across non-clean states", async () => {
    for (const state of ["synced", "syncing", "stuck"] as const) {
      const { container, unmount } = render(<SyncDot state={state} />);
      expect(await axe(container)).toHaveNoViolations();
      unmount();
    }
  });
});
