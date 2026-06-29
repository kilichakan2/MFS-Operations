import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { Button } from "@/components/ui/Button";

describe("Button", () => {
  it("renders children as the accessible name", () => {
    render(<Button>Place order</Button>);
    expect(screen.getByRole("button", { name: "Place order" })).toBeDefined();
  });

  it("defaults to type=button", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" }).getAttribute("type")).toBe(
      "button",
    );
  });

  it("fires onClick on click", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Go</Button>);
    await user.click(screen.getByRole("button", { name: "Go" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("fires onClick on Enter when focused (keyboard)", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Go</Button>);
    await user.tab();
    expect(screen.getByRole("button", { name: "Go" })).toBe(
      document.activeElement,
    );
    await user.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("disabled prevents onClick", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Button disabled onClick={onClick}>
        Go
      </Button>,
    );
    await user.click(screen.getByRole("button", { name: "Go" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("loading sets aria-busy=true and blocks onClick", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Button loading onClick={onClick}>
        Saving
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Saving" });
    expect(btn.getAttribute("aria-busy")).toBe("true");
    await user.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders the expected semantic class per variant", () => {
    const { rerender } = render(<Button variant="primary">x</Button>);
    expect(
      screen.getByRole("button", { name: "x" }).className,
    ).toContain("bg-action-primary");
    rerender(<Button variant="secondary">x</Button>);
    expect(
      screen.getByRole("button", { name: "x" }).className,
    ).toContain("bg-action-secondary");
    rerender(<Button variant="ghost">x</Button>);
    expect(
      screen.getByRole("button", { name: "x" }).className,
    ).toContain("text-action-ghost-fg");
    rerender(<Button variant="danger">x</Button>);
    expect(
      screen.getByRole("button", { name: "x" }).className,
    ).toContain("bg-action-danger");
  });

  it("forwards a ref to the underlying button", () => {
    const ref = { current: null as HTMLButtonElement | null };
    render(<Button ref={ref}>x</Button>);
    expect(ref.current?.tagName).toBe("BUTTON");
  });

  it("has no axe violations", async () => {
    const { container } = render(<Button>Place order</Button>);
    expect(await axe(container)).toHaveNoViolations();
  });
});
