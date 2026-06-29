import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { IconButton } from "@/components/ui/IconButton";

const Dot = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="4" fill="currentColor" />
  </svg>
);

describe("IconButton", () => {
  it("exposes the accessible name from aria-label", () => {
    render(<IconButton aria-label="Add" icon={<Dot />} />);
    expect(screen.getByRole("button", { name: "Add" })).toBeDefined();
  });

  it("fires onClick on click", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<IconButton aria-label="Add" icon={<Dot />} onClick={onClick} />);
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("fires onClick on Enter when focused", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<IconButton aria-label="Add" icon={<Dot />} onClick={onClick} />);
    await user.tab();
    expect(screen.getByRole("button", { name: "Add" })).toBe(
      document.activeElement,
    );
    await user.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("disabled blocks onClick", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <IconButton aria-label="Add" icon={<Dot />} disabled onClick={onClick} />,
    );
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders the expected semantic class per variant", () => {
    const { rerender } = render(
      <IconButton aria-label="x" icon={<Dot />} variant="primary" />,
    );
    expect(screen.getByRole("button", { name: "x" }).className).toContain(
      "bg-action-primary",
    );
    rerender(<IconButton aria-label="x" icon={<Dot />} variant="danger" />);
    expect(screen.getByRole("button", { name: "x" }).className).toContain(
      "bg-status-error-soft",
    );
  });

  it("has no axe violations", async () => {
    const { container } = render(<IconButton aria-label="Add" icon={<Dot />} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
