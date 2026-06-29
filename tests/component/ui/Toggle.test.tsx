import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { Toggle } from "@/components/ui/Toggle";

describe("Toggle", () => {
  it("renders role=switch with aria-checked", () => {
    render(<Toggle label="Offline mode" checked={false} />);
    const sw = screen.getByRole("switch", { name: "Offline mode" });
    expect(sw.getAttribute("aria-checked")).toBe("false");
  });

  it("click toggles onCheckedChange", async () => {
    const onCheckedChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Toggle
        label="Offline mode"
        checked={false}
        onCheckedChange={onCheckedChange}
      />,
    );
    await user.click(screen.getByRole("switch", { name: "Offline mode" }));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("Space toggles when focused", async () => {
    const onCheckedChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Toggle
        label="Offline mode"
        checked={false}
        onCheckedChange={onCheckedChange}
      />,
    );
    await user.tab();
    expect(screen.getByRole("switch", { name: "Offline mode" })).toBe(
      document.activeElement,
    );
    await user.keyboard(" ");
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("disabled blocks toggle", async () => {
    const onCheckedChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Toggle label="Off" disabled onCheckedChange={onCheckedChange} />,
    );
    await user.click(screen.getByRole("switch", { name: "Off" }));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it("clicking the label toggles (label associated)", async () => {
    const onCheckedChange = vi.fn();
    const user = userEvent.setup();
    render(<Toggle label="Offline mode" onCheckedChange={onCheckedChange} />);
    await user.click(screen.getByText("Offline mode"));
    expect(onCheckedChange).toHaveBeenCalled();
  });

  it("has no axe violations", async () => {
    const { container } = render(<Toggle label="Offline mode" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
