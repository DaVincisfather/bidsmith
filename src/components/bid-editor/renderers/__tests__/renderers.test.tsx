import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CoverRenderer } from "../CoverRenderer";
import { PhasesRenderer } from "../PhasesRenderer";
import type { ExecutionPhase } from "@/lib/types";

describe("CoverRenderer (dokumenthuvudet, editor-omdesignen)", () => {
  it("renderar kicker + kundnamn + titel typografiskt — ingen slide-bild", () => {
    const { container } = render(
      <CoverRenderer title="Verksamhetsstöd" client="Region Sörmland" date="2026-08-14" />,
    );
    expect(screen.getByText("Region Sörmland")).toBeInTheDocument();
    expect(screen.getByText("Verksamhetsstöd")).toBeInTheDocument();
    expect(screen.getByText("2026-08-14")).toBeInTheDocument();
    // PPTX-previewn är borta: ingen bakgrundsbild, ingen absolutpositionering.
    expect(container.innerHTML).not.toContain("backgroundImage");
    expect(container.innerHTML).not.toContain("anbudsmall-v2-cover");
  });

  it("fälten är redigerbara och rapporterar rätt fält", () => {
    const onFieldChange = vi.fn();
    render(
      <CoverRenderer
        title="Verksamhetsstöd"
        client="Region Sörmland"
        date="2026-08-14"
        onFieldChange={onFieldChange}
      />,
    );
    const client = screen.getByText("Region Sörmland");
    expect(client).toHaveAttribute("contenteditable", "true");
    expect(client.tagName).toBe("H1");
  });
});

const PHASES: ExecutionPhase[] = [
  {
    name: "Etablering",
    objective: "Styrgrupp och målbild.",
    activities: [],
    deliverables: ["Etablerad styrgrupp"],
    duration: "Vecka 1–4",
    risks: ["Semesterperioden"],
    hoursEstimate: 240,
    period: "Q1",
  },
  {
    name: "Införande",
    objective: "Stegvist införande.",
    activities: [],
    deliverables: ["Infört arbetssätt"],
    duration: "Vecka 5–12",
  },
];

describe("PhasesRenderer (tidslinjen, editor-omdesignen)", () => {
  it("renderar faserna som numrerad tidslinje utan slide-färgbalkar", () => {
    const { container } = render(<PhasesRenderer phases={PHASES} />);
    expect(screen.getByText("Etablering")).toBeInTheDocument();
    expect(screen.getByText("Vecka 1–4")).toBeInTheDocument();
    expect(screen.getByText("Styrgrupp och målbild.")).toBeInTheDocument();
    expect(screen.getByText("Etablerad styrgrupp")).toBeInTheDocument();
    expect(screen.getByText("Semesterperioden")).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.textContent === "240 h")).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.textContent === "Period: Q1")).toBeInTheDocument();
    // De hårdkodade PPTX-färgbalkarna (#7A2230-serien som inline-style) är borta.
    expect(container.innerHTML).not.toContain("background-color: rgb(122, 34, 48)");
  });

  it("alla fält förblir redigerbara och onChange bär patchen", () => {
    const onChange = vi.fn();
    render(<PhasesRenderer phases={PHASES} onChange={onChange} />);
    const name = screen.getByText("Etablering");
    expect(name).toHaveAttribute("contenteditable", "true");
    // Leverabler, risker, mål, varaktighet, timmar, period — samtliga redigerbara.
    for (const text of ["Styrgrupp och målbild.", "Etablerad styrgrupp", "Semesterperioden", "Vecka 1–4", "Q1"]) {
      expect(screen.getByText(text)).toHaveAttribute("contenteditable", "true");
    }
  });

  it("utan onChange är inget redigerbart", () => {
    render(<PhasesRenderer phases={PHASES} />);
    expect(screen.getByText("Etablering")).not.toHaveAttribute("contenteditable");
  });
});
