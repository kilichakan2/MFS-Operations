import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { Picker, type PickerItem } from "@/components/ui/Picker";

const ITEMS: PickerItem[] = [
  { id: "1", label: "The Harbour Kitchen", sublabel: "Sheffield" },
  { id: "2", label: "Naz Restaurant", sublabel: "Leeds" },
  { id: "3", label: "The Corner Cafe", sublabel: "York" },
];

function Harness(
  props: Partial<React.ComponentProps<typeof Picker>> & {
    onSelect?: (i: PickerItem) => void;
  },
) {
  return (
    <Picker
      open
      onOpenChange={props.onOpenChange ?? (() => {})}
      items={props.items ?? ITEMS}
      onSelect={props.onSelect ?? (() => {})}
      selectedId={props.selectedId}
      title={props.title ?? "Select customer"}
      footerAction={props.footerAction}
    />
  );
}

describe("Picker", () => {
  it("opening renders an accessible dialog labelled by its title", () => {
    render(<Harness />);
    const dialog = screen.getByRole("dialog");
    // Radix Dialog enforces the modal contract via a focus trap + labelledby
    // wiring rather than a literal aria-modal attribute; assert the contract.
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)?.textContent).toContain(
      "Select customer",
    );
  });

  it("focuses the search input on open", () => {
    render(<Harness />);
    expect(screen.getByRole("searchbox", { name: "Search" })).toBe(
      document.activeElement,
    );
  });

  it("typing filters the list by substring", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole("searchbox", { name: "Search" }), "harb");
    expect(screen.getByText("The Harbour Kitchen")).toBeDefined();
    expect(screen.queryByText("Naz Restaurant")).toBeNull();
  });

  it("all-words fallback works (naz rest → Naz Restaurant)", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(
      screen.getByRole("searchbox", { name: "Search" }),
      "naz rest",
    );
    expect(screen.getByText("Naz Restaurant")).toBeDefined();
    expect(screen.queryByText("The Harbour Kitchen")).toBeNull();
  });

  it("clicking a row fires onSelect", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<Harness onSelect={onSelect} />);
    await user.click(screen.getByText("Naz Restaurant"));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "2" }),
    );
  });

  it("Escape calls onOpenChange(false)", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onOpenChange={onOpenChange} />);
    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("the selected row shows the tick (aria-pressed)", () => {
    render(<Harness selectedId="3" />);
    const row = screen.getByText("The Corner Cafe").closest("button");
    expect(row?.getAttribute("aria-pressed")).toBe("true");
  });

  it("empty query shows all items", () => {
    render(<Harness />);
    expect(screen.getByText("The Harbour Kitchen")).toBeDefined();
    expect(screen.getByText("Naz Restaurant")).toBeDefined();
    expect(screen.getByText("The Corner Cafe")).toBeDefined();
  });

  it("no match shows the empty state", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(
      screen.getByRole("searchbox", { name: "Search" }),
      "zzzzz",
    );
    expect(screen.getByText(/No results for/)).toBeDefined();
  });

  it("footer action fires", async () => {
    const onPress = vi.fn();
    const user = userEvent.setup();
    render(<Harness footerAction={{ label: "New prospect", onPress }} />);
    await user.click(screen.getByRole("button", { name: /New prospect/ }));
    expect(onPress).toHaveBeenCalled();
  });

  it("has no axe violations on the open dialog", async () => {
    render(<Harness />);
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
