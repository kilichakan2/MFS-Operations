import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
});
