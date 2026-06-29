import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { Radio } from "@/components/ui/Radio";

// Radix RadioGroup uses pointer capture / scrollIntoView for some interactions.
beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

const OPTIONS = [
  { value: "case", label: "Case" },
  { value: "kg", label: "Kg" },
  { value: "unit", label: "Unit", disabled: true },
];

describe("Radio", () => {
  it("renders a radiogroup with N radios", () => {
    render(<Radio options={OPTIONS} aria-label="Order unit" />);
    expect(screen.getByRole("radiogroup", { name: "Order unit" })).toBeDefined();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  it("clicking an option fires onValueChange", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Radio options={OPTIONS} aria-label="Order unit" onValueChange={onValueChange} />,
    );
    await user.click(screen.getByRole("radio", { name: "Kg" }));
    expect(onValueChange).toHaveBeenCalledWith("kg");
  });

  it("arrow keys move roving focus and Space selects within the group", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Radio
        options={OPTIONS}
        aria-label="Order unit"
        onValueChange={onValueChange}
      />,
    );
    await user.tab();
    expect(screen.getByRole("radio", { name: "Case" })).toBe(
      document.activeElement,
    );
    // ArrowDown moves the roving focus to the next enabled radio (Radix).
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("radio", { name: "Kg" })).toBe(
      document.activeElement,
    );
    // Activating the now-focused radio selects it.
    await user.keyboard(" ");
    expect(onValueChange).toHaveBeenCalledWith("kg");
  });

  it("disabled option is not selectable", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Radio options={OPTIONS} aria-label="Order unit" onValueChange={onValueChange} />,
    );
    await user.click(screen.getByRole("radio", { name: "Unit" }));
    expect(onValueChange).not.toHaveBeenCalledWith("unit");
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <Radio options={OPTIONS} aria-label="Order unit" />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
