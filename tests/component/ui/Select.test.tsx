import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { Select } from "@/components/ui/Select";

// Radix Select relies on Pointer Capture + scrollIntoView, which jsdom does not
// implement. Stub them so the dropdown opens/selects exactly as in a browser.
beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

const OPTIONS = [
  { value: "meat", label: "Meat" },
  { value: "poultry", label: "Poultry" },
  { value: "frozen", label: "Frozen" },
];

describe("Select", () => {
  it("renders a trigger with an accessible name", () => {
    render(<Select options={OPTIONS} aria-label="Division" placeholder="Pick" />);
    expect(screen.getByRole("combobox", { name: "Division" })).toBeDefined();
  });

  it("opening with click reveals options (portalled)", async () => {
    const user = userEvent.setup();
    render(<Select options={OPTIONS} aria-label="Division" />);
    await user.click(screen.getByRole("combobox", { name: "Division" }));
    expect(screen.getByRole("option", { name: "Meat" })).toBeDefined();
    expect(screen.getByRole("option", { name: "Poultry" })).toBeDefined();
  });

  it("selecting an option fires onValueChange", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Select
        options={OPTIONS}
        aria-label="Division"
        onValueChange={onValueChange}
      />,
    );
    await user.click(screen.getByRole("combobox", { name: "Division" }));
    await user.click(screen.getByRole("option", { name: "Poultry" }));
    expect(onValueChange).toHaveBeenCalledWith("poultry");
  });

  it("opens and selects via keyboard", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Select
        options={OPTIONS}
        aria-label="Division"
        onValueChange={onValueChange}
      />,
    );
    const trigger = screen.getByRole("combobox", { name: "Division" });
    trigger.focus();
    await user.keyboard("{Enter}");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onValueChange).toHaveBeenCalled();
  });

  it("disabled trigger does not open", async () => {
    const user = userEvent.setup();
    render(<Select options={OPTIONS} aria-label="Division" disabled />);
    await user.click(screen.getByRole("combobox", { name: "Division" }));
    expect(screen.queryByRole("option")).toBeNull();
  });

  it("error sets aria-invalid and the error border on the trigger", () => {
    render(<Select options={OPTIONS} aria-label="Division" error />);
    const trigger = screen.getByRole("combobox", { name: "Division" });
    expect(trigger.getAttribute("aria-invalid")).toBe("true");
    expect(trigger.className).toContain("border-status-error-fill");
  });

  it("has no axe violations on the closed trigger", async () => {
    const { container } = render(
      <Select options={OPTIONS} aria-label="Division" placeholder="Pick" />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
