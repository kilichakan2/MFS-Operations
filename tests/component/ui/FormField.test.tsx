import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { FormField } from "@/components/ui/FormField";

describe("FormField", () => {
  it("ties the label htmlFor to the control id (clicking label focuses it)", async () => {
    const user = userEvent.setup();
    render(
      <FormField label="Business name">
        <input type="text" />
      </FormField>,
    );
    await user.click(screen.getByText("Business name"));
    expect(screen.getByRole("textbox")).toBe(document.activeElement);
  });

  it("when error set, control is aria-invalid and describedby includes the error id; error has role=alert", () => {
    render(
      <FormField label="Postcode" error="Enter a full UK postcode">
        <input type="text" />
      </FormField>,
    );
    const control = screen.getByRole("textbox");
    const alert = screen.getByRole("alert");
    expect(control.getAttribute("aria-invalid")).toBe("true");
    expect(alert.textContent).toContain("Enter a full UK postcode");
    expect(control.getAttribute("aria-describedby")).toContain(
      alert.getAttribute("id"),
    );
  });

  it("when hint set, describedby includes the hint id", () => {
    render(
      <FormField label="Email" hint="We'll send confirmations here">
        <input type="text" />
      </FormField>,
    );
    const control = screen.getByRole("textbox");
    const hint = screen.getByText("We'll send confirmations here");
    expect(control.getAttribute("aria-describedby")).toContain(
      hint.getAttribute("id"),
    );
  });

  it("describedby includes both hint and error ids when both set", () => {
    render(
      <FormField label="X" hint="some hint" error="some error">
        <input type="text" />
      </FormField>,
    );
    const control = screen.getByRole("textbox");
    const describedBy = control.getAttribute("aria-describedby") ?? "";
    expect(describedBy).toContain(screen.getByText("some hint").getAttribute("id"));
    expect(describedBy).toContain(screen.getByText("some error").getAttribute("id"));
  });

  it("renders a required indicator", () => {
    render(
      <FormField label="Name" required>
        <input type="text" />
      </FormField>,
    );
    expect(screen.getByText("Name").textContent).toContain("*");
  });

  it("preserves a caller-supplied id on the control", () => {
    render(
      <FormField label="Name">
        <input id="my-input" type="text" />
      </FormField>,
    );
    expect(screen.getByRole("textbox").getAttribute("id")).toBe("my-input");
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <FormField label="Business name" hint="As shown on invoices">
        <input type="text" />
      </FormField>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
