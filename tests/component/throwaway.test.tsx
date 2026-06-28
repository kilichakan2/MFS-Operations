import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { ThrowawayProbe } from "./_fixtures/ThrowawayProbe";

describe("component lane smoke — ThrowawayProbe", () => {
  it("renders its children", () => {
    render(<ThrowawayProbe onClick={() => {}}>Press me</ThrowawayProbe>);
    expect(screen.getByRole("button", { name: "Press me" })).toBeDefined();
  });

  it("fires onClick when the user activates it", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<ThrowawayProbe onClick={onClick}>Press me</ThrowawayProbe>);
    await user.click(screen.getByRole("button", { name: "Press me" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("is keyboard-operable (Enter activates a focused button)", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<ThrowawayProbe onClick={onClick}>Press me</ThrowawayProbe>);
    await user.tab();
    expect(screen.getByRole("button", { name: "Press me" })).toBe(
      document.activeElement,
    );
    await user.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("has no axe accessibility violations", async () => {
    const { container } = render(
      <ThrowawayProbe onClick={() => {}}>Press me</ThrowawayProbe>,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
