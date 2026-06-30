import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { Banner } from "@/components/ui/Banner";

describe("Banner", () => {
  it("renders the message", () => {
    render(<Banner>Heads up</Banner>);
    expect(screen.getByText("Heads up")).toBeDefined();
  });

  it("tone=warning applies the warning-soft surface", () => {
    const { container } = render(<Banner tone="warning">Warn</Banner>);
    expect((container.firstElementChild as HTMLElement).className).toContain(
      "bg-status-warning-soft",
    );
  });

  it("tone=danger applies the error-soft surface AND role=alert", () => {
    render(<Banner tone="danger">Stop</Banner>);
    const alert = screen.getByRole("alert");
    expect(alert.className).toContain("bg-status-error-soft");
  });

  it("non-danger tones use role=status", () => {
    render(<Banner tone="info">Info</Banner>);
    expect(screen.getByRole("status")).toBeDefined();
  });

  it("onDismiss renders a button that fires it", async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    render(<Banner onDismiss={onDismiss}>Closeable</Banner>);
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("renders no dismiss button when onDismiss is absent", () => {
    render(<Banner>Static</Banner>);
    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();
  });

  it("onClick makes the whole banner a single tappable button", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Banner tone="danger" onClick={onClick}>
        Tap to sound alarm
      </Banner>,
    );
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("w-full");
    await user.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("a tappable danger banner is announced (aria-live=assertive) while staying a button", () => {
    render(
      <Banner tone="danger" onClick={() => {}}>
        Tap to sound alarm
      </Banner>,
    );
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-live")).toBe("assertive");
    expect(btn.getAttribute("aria-atomic")).toBe("true");
  });

  it("a tappable non-danger banner is not a live region", () => {
    render(
      <Banner tone="info" onClick={() => {}}>
        Enable alarms
      </Banner>,
    );
    expect(screen.getByRole("button").getAttribute("aria-live")).toBeNull();
  });

  it("onClick omits the dismiss button (no nested button)", () => {
    render(
      <Banner tone="danger" onClick={() => {}} onDismiss={() => {}}>
        Tappable
      </Banner>,
    );
    // exactly one button (the banner itself), no inner Dismiss button
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();
  });

  it("uses no hex / stock-palette / mfs-* colour classes", () => {
    const { container } = render(
      <Banner tone="danger" title="T" onDismiss={() => {}}>
        Body
      </Banner>,
    );
    const html = container.innerHTML;
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(html).not.toMatch(
      /\b(bg|text|border)-(slate|gray|amber|red|blue|white)-\d/,
    );
    expect(html).not.toMatch(/-mfs-(navy|orange)/);
  });

  it("has no axe violations across tones", async () => {
    const { container } = render(
      <div>
        <Banner tone="neutral">N</Banner>
        <Banner tone="info">I</Banner>
        <Banner tone="success">S</Banner>
        <Banner tone="warning">W</Banner>
        <Banner tone="danger">D</Banner>
      </div>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
