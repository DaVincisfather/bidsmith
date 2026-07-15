import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SlideNav } from "../SlideNav";
import type { SlideGroup } from "@/lib/bid-editor/slot-meta";
import type { BidSection } from "@/lib/types";

const section = { type: "ai", key: "k", title: "t", generatedAt: "" } as BidSection;
const groups: SlideGroup[] = [
  { source: 2, sections: [section, section] },
  { source: 5, sections: [section] },
];

describe("SlideNav", () => {
  it("listar slides med rutantal och anropar onSlideClick", () => {
    const onClick = vi.fn();
    render(<SlideNav groups={groups} otherCount={0} activeSlide={null} onSlideClick={onClick} />);
    expect(screen.getByRole("button", { name: /slide 2/i })).toHaveTextContent("2 rutor");
    expect(screen.getByRole("button", { name: /slide 5/i })).toHaveTextContent("1 ruta");
    fireEvent.click(screen.getByRole("button", { name: /slide 5/i }));
    expect(onClick).toHaveBeenCalledWith(5);
  });

  it("visar Övriga rutor bara när de finns", () => {
    const { rerender } = render(<SlideNav groups={groups} otherCount={0} activeSlide={null} onSlideClick={vi.fn()} />);
    expect(screen.queryByText(/övriga rutor/i)).not.toBeInTheDocument();
    rerender(<SlideNav groups={groups} otherCount={3} activeSlide={null} onSlideClick={vi.fn()} />);
    expect(screen.getByText(/övriga rutor/i)).toBeInTheDocument();
  });
});
