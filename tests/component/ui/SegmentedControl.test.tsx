import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { SegmentedControl } from "@/components/ui/SegmentedControl";

const OPTIONS = [
  { id: "today", label: "Today" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
];

describe("SegmentedControl", () => {
  it("renders one button per option", () => {
    render(<SegmentedControl value="today" onChange={() => {}} options={OPTIONS} />);
    expect(screen.getAllByRole("button").length).toBe(3);
  });

  it("marks the active option aria-pressed=true and others false", () => {
    render(<SegmentedControl value="week" onChange={() => {}} options={OPTIONS} />);
    expect(screen.getByRole("button", { name: "Week" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Today" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("fires onChange with the option id on click", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SegmentedControl value="today" onChange={onChange} options={OPTIONS} />);
    await user.click(screen.getByRole("button", { name: "Month" }));
    expect(onChange).toHaveBeenCalledWith("month");
  });

  it("activates via keyboard (Enter on focused button)", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SegmentedControl value="today" onChange={onChange} options={OPTIONS} />);
    await user.tab();
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("today");
  });

  it("exposes a group with the accessible name from aria-label", () => {
    render(
      <SegmentedControl value="today" onChange={() => {}} options={OPTIONS} aria-label="Date range" />,
    );
    expect(screen.getByRole("group", { name: "Date range" })).toBeDefined();
  });

  it("is NOT Radix Tabs — no tablist/tab/tabpanel roles present", () => {
    render(<SegmentedControl value="today" onChange={() => {}} options={OPTIONS} />);
    expect(screen.queryByRole("tabpanel")).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("the active pill uses the secondary-action semantic token (no hex leak)", () => {
    render(<SegmentedControl value="today" onChange={() => {}} options={OPTIONS} />);
    expect(screen.getByRole("button", { name: "Today" }).className).toContain("bg-action-secondary");
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <SegmentedControl value="today" onChange={() => {}} options={OPTIONS} aria-label="Date range" />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
