import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { Modal } from "@/components/ui/Modal";

describe("Modal", () => {
  it("when open renders an accessible dialog labelled by its title", () => {
    render(
      <Modal open onOpenChange={() => {}} title="Confirm action">
        <p>Body</p>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)?.textContent).toContain(
      "Confirm action",
    );
  });

  it("when closed renders nothing in the document body", () => {
    render(
      <Modal open={false} onOpenChange={() => {}} title="Hidden">
        <p>Body</p>
      </Modal>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the close button fires onOpenChange(false)", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal open onOpenChange={onOpenChange} title="Confirm">
        <p>Body</p>
      </Modal>,
    );
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("ESC fires onOpenChange(false)", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal open onOpenChange={onOpenChange} title="Confirm">
        <p>Body</p>
      </Modal>,
    );
    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("variant=sheet renders the bottom-sheet positioning + drag handle", () => {
    render(
      <Modal open onOpenChange={() => {}} variant="sheet" title="Sheet">
        <p>Body</p>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("bottom-0");
    expect(dialog.className).toContain("rounded-t-[18px]");
  });

  it("variant=center (default) renders the centred positioning", () => {
    render(
      <Modal open onOpenChange={() => {}} title="Centred">
        <p>Body</p>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("top-1/2");
    expect(dialog.className).toContain("left-1/2");
  });

  it("renders a description when supplied", () => {
    render(
      <Modal open onOpenChange={() => {}} title="T" description="More detail here">
        <p>Body</p>
      </Modal>,
    );
    expect(screen.getByText("More detail here")).toBeDefined();
  });

  it("uses no hex / stock-palette / mfs-* colour classes", () => {
    render(
      <Modal open onOpenChange={() => {}} variant="sheet" title="T">
        <p>Body</p>
      </Modal>,
    );
    const html = document.body.innerHTML;
    expect(html).not.toMatch(
      /\b(bg|text|border)-(slate|gray|amber|red|blue|white)-\d/,
    );
    expect(html).not.toMatch(/-mfs-(navy|orange)/);
  });

  it("has no axe violations on the open dialog", async () => {
    render(
      <Modal open onOpenChange={() => {}} title="Confirm action">
        <p>Body text</p>
      </Modal>,
    );
    expect(await axe(document.body)).toHaveNoViolations();
  });

  // ── Radix body-pointer-events leak guard (the cold-storage prod-smoke fix) ──
  describe("releases a stuck body { pointer-events: none } on close", () => {
    afterEach(() => {
      document.body.style.pointerEvents = "";
    });

    it("clears the lock on unmount when no modal dialog remains open", async () => {
      const { unmount } = render(
        <Modal open onOpenChange={() => {}} title="Pad">
          <p>Body</p>
        </Modal>,
      );
      // Simulate Radix's dismissable-layer leaving the page locked (the race
      // that bites the production build under rapid open/close).
      document.body.style.pointerEvents = "none";
      unmount();
      await waitFor(() =>
        expect(document.body.style.pointerEvents).not.toBe("none"),
      );
    });

    it("clears the lock when open flips to false", async () => {
      const { rerender } = render(
        <Modal open onOpenChange={() => {}} title="Pad">
          <p>Body</p>
        </Modal>,
      );
      document.body.style.pointerEvents = "none";
      rerender(
        <Modal open={false} onOpenChange={() => {}} title="Pad">
          <p>Body</p>
        </Modal>,
      );
      await waitFor(() =>
        expect(document.body.style.pointerEvents).not.toBe("none"),
      );
    });

    it("does NOT clear the lock while another modal dialog is still open", async () => {
      // A second, still-open Modal must keep the page locked — closing one of a
      // stack must not re-enable the page behind the survivor.
      render(
        <Modal open onOpenChange={() => {}} title="Survivor">
          <p>Still open</p>
        </Modal>,
      );
      const { unmount } = render(
        <Modal open onOpenChange={() => {}} title="Closing">
          <p>Closing</p>
        </Modal>,
      );
      document.body.style.pointerEvents = "none";
      unmount();
      // Give the rAF a chance to run; the survivor dialog ([data-state=open])
      // must prevent the guard from clearing the lock.
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      expect(document.body.style.pointerEvents).toBe("none");
    });
  });
});
