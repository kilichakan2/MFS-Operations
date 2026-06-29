import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { axe } from "vitest-axe";
import { PinKeypad } from "@/components/ui/PinKeypad";

afterEach(() => {
  vi.useRealTimers();
});

describe("PinKeypad", () => {
  it("entering 4 digits via key presses calls onComplete with the pin", () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    render(<PinKeypad onComplete={onComplete} />);

    // Keys respond to pointerdown (the touch-first press path).
    act(() => {
      for (const d of ["1", "2", "3", "4"]) {
        fireEvent.pointerDown(screen.getByRole("button", { name: `Digit ${d}` }));
      }
    });
    act(() => {
      vi.advanceTimersByTime(120);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith("1234");
  });

  it("physical keyboard digits fill and the final digit auto-submits", () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    render(<PinKeypad onComplete={onComplete} />);
    act(() => {
      for (const key of ["1", "2", "3", "4"]) {
        window.dispatchEvent(new KeyboardEvent("keydown", { key }));
      }
    });
    act(() => {
      vi.advanceTimersByTime(120);
    });
    expect(onComplete).toHaveBeenCalledWith("1234");
  });

  it("Backspace removes a digit (physical keyboard)", () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    render(<PinKeypad onComplete={onComplete} />);
    act(() => {
      for (const key of ["1", "2", "3", "Backspace", "4"]) {
        window.dispatchEvent(new KeyboardEvent("keydown", { key }));
      }
    });
    act(() => {
      vi.advanceTimersByTime(120);
    });
    // After 1,2,3,<back>,4 the buffer is "124" — not yet 4 digits, no submit.
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("error prop clears the pin and shows the error text", () => {
    const onComplete = vi.fn();
    const { rerender } = render(
      <PinKeypad onComplete={onComplete} />,
    );
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "1" }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "2" }));
    });
    rerender(<PinKeypad onComplete={onComplete} error="Wrong PIN" />);
    expect(screen.getByText("Wrong PIN")).toBeDefined();
    // dots label reflects a cleared buffer
    expect(screen.getByLabelText("0 of 4 digits entered")).toBeDefined();
  });

  it("resetSignal change clears the pin", () => {
    const onComplete = vi.fn();
    const { rerender } = render(
      <PinKeypad onComplete={onComplete} resetSignal={0} />,
    );
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "1" }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "2" }));
    });
    expect(screen.getByLabelText("2 of 4 digits entered")).toBeDefined();
    rerender(<PinKeypad onComplete={onComplete} resetSignal={1} />);
    expect(screen.getByLabelText("0 of 4 digits entered")).toBeDefined();
  });

  it("each digit key and the backspace key carry an aria-label", () => {
    render(<PinKeypad onComplete={() => {}} />);
    for (const d of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"]) {
      expect(screen.getByRole("button", { name: `Digit ${d}` })).toBeDefined();
    }
    expect(
      screen.getByRole("button", { name: "Delete last digit" }),
    ).toBeDefined();
  });

  it("applies custom ARIA labels when provided (overrides the English defaults)", () => {
    render(
      <PinKeypad
        onComplete={() => {}}
        labels={{
          digit: (d) => `Rakam ${d}`,
          backspace: "Son rakamı sil",
        }}
      />,
    );
    expect(screen.getByRole("button", { name: "Rakam 1" })).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Son rakamı sil" }),
    ).toBeDefined();
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <PinKeypad onComplete={() => {}} title="Welcome back" />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
