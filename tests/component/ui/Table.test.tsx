import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { Table } from "@/components/ui/Table";

function Sample() {
  return (
    <Table>
      <Table.Head>
        <Table.Row>
          <Table.HeaderCell>Customer</Table.HeaderCell>
          <Table.HeaderCell align="end">Orders</Table.HeaderCell>
          <Table.HeaderCell hideBelow="md">Last visit</Table.HeaderCell>
        </Table.Row>
      </Table.Head>
      <Table.Body>
        <Table.Row>
          <Table.Cell>The Harbour Kitchen</Table.Cell>
          <Table.Cell align="end">12</Table.Cell>
          <Table.Cell hideBelow="md">Mon</Table.Cell>
        </Table.Row>
        <Table.Row last>
          <Table.Cell>Naz Restaurant</Table.Cell>
          <Table.Cell align="end">4</Table.Cell>
          <Table.Cell hideBelow="md">Tue</Table.Cell>
        </Table.Row>
      </Table.Body>
    </Table>
  );
}

describe("Table", () => {
  it("renders a real semantic table with thead/tbody/th/td", () => {
    const { container } = render(<Sample />);
    expect(container.querySelector("table")).not.toBeNull();
    expect(container.querySelector("thead")).not.toBeNull();
    expect(container.querySelector("tbody")).not.toBeNull();
    expect(container.querySelectorAll("th").length).toBe(3);
    expect(container.querySelectorAll("td").length).toBe(6);
  });

  it("exposes ARIA table/columnheader/cell roles", () => {
    render(<Sample />);
    expect(screen.getByRole("table")).toBeDefined();
    expect(screen.getAllByRole("columnheader").length).toBe(3);
    expect(screen.getAllByRole("cell").length).toBe(6);
  });

  it("header cells carry scope=col", () => {
    const { container } = render(<Sample />);
    for (const th of Array.from(container.querySelectorAll("th"))) {
      expect(th.getAttribute("scope")).toBe("col");
    }
  });

  it("align=end applies text-end", () => {
    const { container } = render(<Sample />);
    const cells = Array.from(container.querySelectorAll("td"));
    expect(cells[1].className).toContain("text-end");
  });

  it("hideBelow=md applies the responsive hide class", () => {
    const { container } = render(<Sample />);
    const cells = Array.from(container.querySelectorAll("td"));
    expect(cells[2].className).toContain("md:table-cell");
    expect(cells[2].className).toContain("hidden");
  });

  it("last row drops its bottom border", () => {
    const { container } = render(<Sample />);
    const rows = Array.from(container.querySelectorAll("tbody tr"));
    expect((rows[0] as HTMLElement).className).toContain("border-b");
    expect((rows[1] as HTMLElement).className).not.toContain("border-b");
  });

  it("anti-leak: no inline style attribute and no grid-template anywhere", () => {
    const { container } = render(<Sample />);
    expect(container.querySelector("[style]")).toBeNull();
    expect(container.innerHTML).not.toContain("grid-template");
    expect(container.innerHTML).not.toContain("gridTemplate");
  });

  it("has no axe violations", async () => {
    const { container } = render(<Sample />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
