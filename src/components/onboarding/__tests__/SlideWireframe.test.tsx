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

  it("klick på kandidat anropar onSelect med shapeIndex", () => {
    const onSelect = vi.fn();
    render(
      <SlideWireframe slide={slide} slideSize={size} selectedShapeIndex={null}
        decisions={new Map([[1, "pending"]])} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByTestId("shape-3-1"));
    expect(onSelect).toHaveBeenCalledWith(1);
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
});
