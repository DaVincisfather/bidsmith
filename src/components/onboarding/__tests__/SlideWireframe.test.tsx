import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SlideWireframe } from "../SlideWireframe";

const slide = {
  source: 3,
  shapes: [
    { shapeIndex: 0, geometry: { x: 0, y: 0, cx: 4000000, cy: 800000 }, text: "Rubrik", candidate: false },
    { shapeIndex: 1, geometry: { x: 0, y: 1000000, cx: 6000000, cy: 3000000 }, text: "Beskriv er metod", candidate: true },
    { shapeIndex: 2, geometry: null, text: "Svävande ruta", candidate: true },
  ],
};
const size = { cx: 12192000, cy: 6858000 };

describe("SlideWireframe", () => {
  it("ritar placerbara shapes och listar geometri-lösa kandidater separat", () => {
    render(
      <SlideWireframe slide={slide} slideSize={size} selectedShapeIndex={null}
        decisions={new Map([[1, "pending"]])} onSelect={() => {}} />,
    );
    expect(screen.getByTestId("shape-3-0")).toBeInTheDocument();
    expect(screen.getByTestId("shape-3-1")).toBeInTheDocument();
    expect(screen.getByText(/svävande ruta/i)).toBeInTheDocument(); // listan under
  });

  it("ytter-SVG:n har role='group' (inte 'img') — den har interaktiva barn", () => {
    render(
      <SlideWireframe slide={slide} slideSize={size} selectedShapeIndex={null}
        decisions={new Map([[1, "pending"]])} onSelect={() => {}} />,
    );
    // role="img" hade gömt kandidat-knapparna för hjälpmedel; group exponerar dem.
    expect(screen.getByRole("group", { name: /slide 3/i })).toBeInTheDocument();
  });

  it("klick på kandidat anropar onSelect med shapeIndex", () => {
    const onSelect = vi.fn();
    render(
      <SlideWireframe slide={slide} slideSize={size} selectedShapeIndex={null}
        decisions={new Map([[1, "pending"]])} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByTestId("shape-3-1"));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("kandidat kan väljas med tangentbord (Enter/Space), statisk shape har ingen button-roll", () => {
    const onSelect = vi.fn();
    render(
      <SlideWireframe slide={slide} slideSize={size} selectedShapeIndex={null}
        decisions={new Map([[1, "pending"]])} onSelect={onSelect} />,
    );
    const candidate = screen.getByTestId("shape-3-1");
    expect(candidate).toHaveAttribute("role", "button");
    expect(candidate).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(candidate, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(1);
    fireEvent.keyDown(candidate, { key: " " });
    expect(onSelect).toHaveBeenCalledTimes(2);
    // Statisk shape ska inte annonseras som knapp och inte vara fokuserbar.
    const staticShape = screen.getByTestId("shape-3-0");
    expect(staticShape).not.toHaveAttribute("role");
    expect(staticShape).not.toHaveAttribute("tabindex");
    fireEvent.keyDown(staticShape, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it("statiska shapes är inte klickbara", () => {
    const onSelect = vi.fn();
    render(
      <SlideWireframe slide={slide} slideSize={size} selectedShapeIndex={null}
        decisions={new Map()} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByTestId("shape-3-0"));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("ritar en enkel ram för tabeller — icke-interaktiv (mappning sker i TablePanel)", () => {
    const onSelect = vi.fn();
    render(
      <SlideWireframe slide={slide} slideSize={size} selectedShapeIndex={null}
        decisions={new Map()} onSelect={onSelect}
        tables={[
          { source: 3, frameIndex: 0, geometry: { x: 0, y: 4500000, cx: 8000000, cy: 1000000 }, gridColsEmu: [100], rows: [] },
        ]} />,
    );
    const tableBox = screen.getByTestId("table-3-0");
    expect(tableBox).toBeInTheDocument();
    fireEvent.click(tableBox);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("hoppar över tabeller utan geometri (ärvd/saknad xfrm)", () => {
    render(
      <SlideWireframe slide={slide} slideSize={size} selectedShapeIndex={null}
        decisions={new Map()} onSelect={() => {}}
        tables={[{ source: 3, frameIndex: 0, geometry: null, gridColsEmu: [100], rows: [] }]} />,
    );
    expect(screen.queryByTestId("table-3-0")).not.toBeInTheDocument();
  });
});
