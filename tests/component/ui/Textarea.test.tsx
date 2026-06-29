import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { Textarea } from "@/components/ui/Textarea";

describe("Textarea", () => {
  it("typing fires onChange", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Textarea aria-label="Notes" onChange={onChange} />);
    await user.type(screen.getByRole("textbox"), "hi");
    expect(onChange).toHaveBeenCalled();
  });

  it("shows the counter with correct count when showCount + maxLength set", async () => {
    const user = userEvent.setup();
    render(<Textarea aria-label="Notes" showCount maxLength={280} />);
    expect(screen.getByText("0 / 280")).toBeDefined();
    await user.type(screen.getByRole("textbox"), "abc");
    expect(screen.getByText("3 / 280")).toBeDefined();
  });

  it("does not show the counter without showCount", () => {
    render(<Textarea aria-label="Notes" maxLength={280} />);
    expect(screen.queryByText("0 / 280")).toBeNull();
  });

  it("error renders the error border class and sets aria-invalid", () => {
    render(<Textarea aria-label="Notes" error />);
    const ta = screen.getByRole("textbox");
    expect(ta.className).toContain("border-status-error-fill");
    expect(ta.getAttribute("aria-invalid")).toBe("true");
  });

  it("disabled blocks typing", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Textarea aria-label="Notes" disabled onChange={onChange} />);
    await user.type(screen.getByRole("textbox"), "hi");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("has no axe violations", async () => {
    const { container } = render(<Textarea aria-label="Notes" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
