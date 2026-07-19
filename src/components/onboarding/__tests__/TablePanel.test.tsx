import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TablePanel } from "../TablePanel";
import type { DraftTable } from "@/lib/pptx-template/onboarding/draft";

const table: DraftTable = {
  source: 3,
  frameIndex: 0,
  geometry: { x: 0, y: 0, cx: 100, cy: 100 },
  gridColsEmu: [400, 300],
  rows: [
    { heightEmu: 10, cellTexts: ["Krav", "Uppfyllnad"] },
    { heightEmu: 10, cellTexts: ["Exempel krav", "Ja — se referens"] },
  ],
};

describe("TablePanel", () => {
  it("Bekräfta skickar valda kolumnroller + rubrikrader + mallrad", () => {
    const onDecide = vi.fn();
    render(<TablePanel table={table} onDecide={onDecide} saving={false} />);
    fireEvent.change(screen.getByLabelText(/kolumn 1/i), { target: { value: "krav" } });
    fireEvent.change(screen.getByLabelText(/kolumn 2/i), { target: { value: "uppfyllnad" } });
    fireEvent.click(screen.getByRole("button", { name: /bekräfta/i }));
    expect(onDecide).toHaveBeenCalledWith({
      headerRows: 1, templateRowIndex: 1, columns: ["krav", "uppfyllnad"],
    });
  });

  it("visar de svenska rolletiketterna i varje kolumn-dropdown", () => {
    render(<TablePanel table={table} onDecide={vi.fn()} saving={false} />);
    const select = screen.getByLabelText(/kolumn 1/i);
    const options = Array.from(select.querySelectorAll("option")).map((o) => o.textContent);
    expect(options).toEqual(["Krav", "Uppfyllnad", "Referens", "Status", "Ignorera"]);
  });

  it("förhandsvisar radernas celltext", () => {
    render(<TablePanel table={table} onDecide={vi.fn()} saving={false} />);
    expect(screen.getByText("Exempel krav")).toBeInTheDocument();
    expect(screen.getByText("Ja — se referens")).toBeInTheDocument();
  });

  it("initierar dropdowns + status-text från ett befintligt bekräftat beslut", () => {
    const decided: DraftTable = {
      ...table,
      decision: { headerRows: 1, templateRowIndex: 1, columns: ["krav", "status"], confirmed: true },
    };
    render(<TablePanel table={decided} onDecide={vi.fn()} saving={false} />);
    expect(screen.getByLabelText(/kolumn 1/i)).toHaveValue("krav");
    expect(screen.getByLabelText(/kolumn 2/i)).toHaveValue("status");
    expect(screen.getByText(/bekräftad som kravmatris/i)).toBeInTheDocument();
  });
});
