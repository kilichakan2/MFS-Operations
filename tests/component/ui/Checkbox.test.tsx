import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { Checkbox } from "@/components/ui/Checkbox";

describe("Checkbox", () => {
  it("clicking toggles onCheckedChange", async () => {
    const onCheckedChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Checkbox
        label="Print label"
        checked={false}
        onCheckedChange={onCheckedChange}
      />,
    );
    await user.click(screen.getByRole("checkbox", { name: "Print label" }));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("Space toggles when focused", async () => {
    const onCheckedChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Checkbox
        label="Print label"
        checked={false}
        onCheckedChange={onCheckedChange}
      />,
    );
    await user.tab();
    expect(screen.getByRole("checkbox", { name: "Print label" })).toBe(
      document.activeElement,
    );
    await user.keyboard(" ");
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("indeterminate renders aria-checked=mixed", () => {
    render(<Checkbox label="Select all" checked="indeterminate" />);
    expect(
      screen
        .getByRole("checkbox", { name: "Select all" })
        .getAttribute("aria-checked"),
    ).toBe("mixed");
  });

  it("disabled blocks toggle", async () => {
    const onCheckedChange = vi.fn();
    const user = userEvent.setup();
    render(<Checkbox label="Off" disabled onCheckedChange={onCheckedChange} />);
    await user.click(screen.getByRole("checkbox", { name: "Off" }));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it("clicking the label toggles (label is associated)", async () => {
    const onCheckedChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Checkbox label="Print label" onCheckedChange={onCheckedChange} />,
    );
    await user.click(screen.getByText("Print label"));
    expect(onCheckedChange).toHaveBeenCalled();
  });

  it("has no axe violations", async () => {
    const { container } = render(<Checkbox label="Print label" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
