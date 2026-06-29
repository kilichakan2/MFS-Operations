import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { TextField } from "@/components/ui/TextField";
import { FormField } from "@/components/ui/FormField";

describe("TextField", () => {
  it("typing fires onChange", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<TextField aria-label="Name" onChange={onChange} />);
    await user.type(screen.getByRole("textbox"), "ab");
    expect(onChange).toHaveBeenCalled();
  });

  it("disabled blocks typing", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<TextField aria-label="Name" disabled onChange={onChange} />);
    await user.type(screen.getByRole("textbox"), "ab");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("error renders the error border class and sets aria-invalid", () => {
    render(<TextField aria-label="Name" error />);
    const input = screen.getByRole("textbox");
    expect(input.className).toContain("border-status-error-fill");
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });

  it("is reachable via Tab", async () => {
    const user = userEvent.setup();
    render(<TextField aria-label="Name" />);
    await user.tab();
    expect(screen.getByRole("textbox")).toBe(document.activeElement);
  });

  it("renders prefix and suffix affixes", () => {
    render(<TextField aria-label="Price" prefix="£" suffix="/ kg" />);
    expect(screen.getByText("£")).toBeDefined();
    expect(screen.getByText("/ kg")).toBeDefined();
    expect(screen.getByRole("textbox")).toBeDefined();
  });

  it("forwards a ref to the input", () => {
    const ref = { current: null as HTMLInputElement | null };
    render(<TextField aria-label="Name" ref={ref} />);
    expect(ref.current?.tagName).toBe("INPUT");
  });

  it("wired inside FormField: label focuses it and error binds aria", async () => {
    const user = userEvent.setup();
    render(
      <FormField label="Postcode" error="Enter a full UK postcode">
        <TextField error />
      </FormField>,
    );
    await user.click(screen.getByText("Postcode"));
    const input = screen.getByRole("textbox");
    expect(input).toBe(document.activeElement);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toContain(
      screen.getByRole("alert").getAttribute("id"),
    );
  });

  it("has no axe violations", async () => {
    const { container } = render(<TextField aria-label="Name" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
