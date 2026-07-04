import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CostBuckets } from "../CostBuckets";
import type { CostByLabel } from "@/lib/stats";

const rows: CostByLabel[] = [
  { label: "RFP analysis", costUsd: 2, count: 1 },
  { label: "consultant matching", costUsd: 3, count: 1 },
  { label: "phases bundle", costUsd: 4, count: 1 },
  { label: "opportunity scoring", costUsd: 1, count: 1 },
];

describe("CostBuckets", () => {
  it("visar de tre kategorierna + Övrigt och totalsumma som primär vy", () => {
    render(<CostBuckets costByLabel={rows} />);
    expect(screen.getByText("Analys")).toBeInTheDocument();
    expect(screen.getByText("Konsultmatchning")).toBeInTheDocument();
    expect(screen.getByText("Anbudsgenerering")).toBeInTheDocument();
    expect(screen.getByText("Övrigt")).toBeInTheDocument();
    // Grand total = 2 + 3 + 4 + 1
    expect(screen.getByText("Totalt")).toBeInTheDocument();
    expect(screen.getByText("$10.00")).toBeInTheDocument();
  });

  it("detaljlistan är kollapsad från början (per-etikett-raderna dolda)", () => {
    render(<CostBuckets costByLabel={rows} />);
    const toggle = screen.getByRole("button", { name: /visa detaljer/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("opportunity scoring")).not.toBeInTheDocument();
  });

  it("togglar detaljlistan vid klick (samma aria-mönster som källa-chip)", () => {
    render(<CostBuckets costByLabel={rows} />);
    const toggle = screen.getByRole("button", { name: /visa detaljer/i });

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("opportunity scoring")).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("opportunity scoring")).not.toBeInTheDocument();
  });

  it("visar tom-läge när ingen data finns", () => {
    render(<CostBuckets costByLabel={[]} />);
    expect(screen.getByText(/ingen data ännu/i)).toBeInTheDocument();
  });
});
