import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { axe } from "vitest-axe";
import {
  NumberPad,
  pressNumberPadKey,
  isNumberPadValueConfirmable,
} from "@/components/ui/NumberPad";

describe("pressNumberPadKey — pure entry reducer", () => {
  it("replaces a lone leading zero rather than prefixing", () => {
    expect(pressNumberPadKey("0", "5")).toBe("5");
  });

  it("appends digits otherwise", () => {
    expect(pressNumberPadKey("4", "2")).toBe("42");
  });

  it("backspace removes the last character", () => {
    expect(pressNumberPadKey("42", "back")).toBe("4");
  });

  it("allows a single decimal only when allowDecimal is set", () => {
    expect(pressNumberPadKey("4", ".", { allowDecimal: true })).toBe("4.");
    expect(pressNumberPadKey("4.5", ".", { allowDecimal: true })).toBe("4.5"); // no second dot
    expect(pressNumberPadKey("4", ".")).toBe("4"); // decimal not allowed → ignored
  });

  it("toggles a leading sign only when allowNegative is set", () => {
    expect(pressNumberPadKey("20", "-", { allowNegative: true })).toBe("-20");
    expect(pressNumberPadKey("-20", "-", { allowNegative: true })).toBe("20");
    expect(pressNumberPadKey("20", "-")).toBe("20"); // sign not allowed → ignored
  });
});

describe("isNumberPadValueConfirmable — bound predicate", () => {
  it("rejects empty / lone sign / lone decimal", () => {
    expect(isNumberPadValueConfirmable("")).toBe(false);
    expect(isNumberPadValueConfirmable("-")).toBe(false);
    expect(isNumberPadValueConfirmable(".")).toBe(false);
  });

  it("honours the inclusive bound", () => {
    expect(isNumberPadValueConfirmable("-40", -40, 30)).toBe(true);
    expect(isNumberPadValueConfirmable("30", -40, 30)).toBe(true);
    expect(isNumberPadValueConfirmable("300", -40, 30)).toBe(false);
    expect(isNumberPadValueConfirmable("-99", -40, 30)).toBe(false);
    expect(isNumberPadValueConfirmable("12", -40, 30)).toBe(true); // in-range deviation
  });
});

describe("NumberPad — component", () => {
  it("pressing a digit calls onChange with the next value", () => {
    const onChange = vi.fn();
    render(
      <NumberPad value="" onChange={onChange} onConfirm={() => {}} suffix="°C" />,
    );
    fireEvent.pointerDown(screen.getByRole("button", { name: "5" }));
    expect(onChange).toHaveBeenCalledWith("5");
  });

  it("renders the decimal key for chillers, the sign key for freezers", () => {
    const { rerender } = render(
      <NumberPad value="" onChange={() => {}} onConfirm={() => {}} allowDecimal />,
    );
    expect(screen.getByRole("button", { name: "." })).toBeDefined();
    expect(screen.queryByRole("button", { name: "-" })).toBeNull();

    rerender(
      <NumberPad value="" onChange={() => {}} onConfirm={() => {}} allowNegative />,
    );
    expect(screen.getByRole("button", { name: "-" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "." })).toBeNull();
  });

  it("disables Confirm outside the bound and enables it in-range", () => {
    const { rerender } = render(
      <NumberPad
        value="300"
        onChange={() => {}}
        onConfirm={() => {}}
        min={-40}
        max={30}
        suffix="°C"
      />,
    );
    expect(
      (screen.getByRole("button", { name: /^Confirm/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    rerender(
      <NumberPad
        value="12"
        onChange={() => {}}
        onConfirm={() => {}}
        min={-40}
        max={30}
        suffix="°C"
      />,
    );
    expect(
      (screen.getByRole("button", { name: /^Confirm/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("Confirm fires onConfirm when the value is in range", () => {
    const onConfirm = vi.fn();
    render(
      <NumberPad
        value="4"
        onChange={() => {}}
        onConfirm={onConfirm}
        min={-40}
        max={30}
        suffix="°C"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm 4°C" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <NumberPad
        value="4"
        onChange={() => {}}
        onConfirm={() => {}}
        title="Lamb Chiller"
        suffix="°C"
        min={-40}
        max={30}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
