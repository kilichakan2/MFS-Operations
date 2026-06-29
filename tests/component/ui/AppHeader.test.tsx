import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { AppHeader } from "@/components/ui/AppHeader";

describe("AppHeader", () => {
  it("renders the banner landmark", () => {
    render(<AppHeader title="Orders" />);
    expect(screen.getByRole("banner")).toBeDefined();
  });

  it("renders title / logo / sync / actions / menu slots when given", () => {
    render(
      <AppHeader
        title="Orders"
        logo={<span>LOGO</span>}
        sync={<span>SYNC</span>}
        actions={<button>Act</button>}
        menu={<span>MENU</span>}
      />,
    );
    expect(screen.getByText("Orders")).toBeDefined();
    expect(screen.getByText("LOGO")).toBeDefined();
    expect(screen.getByText("SYNC")).toBeDefined();
    expect(screen.getByRole("button", { name: "Act" })).toBeDefined();
    expect(screen.getByText("MENU")).toBeDefined();
  });

  it("omits slots not given", () => {
    render(<AppHeader title="Orders" />);
    expect(screen.queryByText("LOGO")).toBeNull();
    expect(screen.queryByText("SYNC")).toBeNull();
  });

  it("uses the inverse surface chrome token", () => {
    render(<AppHeader title="Orders" />);
    expect(screen.getByRole("banner").className).toContain("bg-surface-inverse");
  });

  it("uses no hex / stock-palette / mfs-* colour classes", () => {
    const { container } = render(
      <AppHeader
        title="Orders"
        logo={<span>L</span>}
        sync={<span>S</span>}
        actions={<button>A</button>}
        menu={<span>M</span>}
      />,
    );
    const html = container.innerHTML;
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(html).not.toMatch(
      /\b(bg|text|border)-(slate|gray|amber|red|blue|white)-\d/,
    );
    expect(html).not.toMatch(/-mfs-(navy|orange)/);
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <AppHeader title="Orders" actions={<button>Act</button>} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
