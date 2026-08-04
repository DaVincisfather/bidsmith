import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { BidEditor } from "../BidEditor";
import type { BidSection, StyleGuide } from "@/lib/types";

const style: StyleGuide = {
  colors: {
    primary: "#7A2230", primaryLight: "#9A3340", secondary: "#BE969A",
    secondaryLight: "#E0CFD1", accent: "#7A2230", dark: "#14120E",
    light: "#F3EFE7", muted: "#8A847A",
  },
  font: "Calibri",
  logoUrl: "",
};

function proseSection(key: string, title: string, text: string): BidSection {
  return {
    type: "ai", key, title, generatedAt: "2026-08-03T00:00:00Z",
    content: { format: "generic-prose", placeholder: `{${key}}`, text },
  };
}

const teamSection: BidSection = {
  type: "ai", key: "team", title: "Team och pris", generatedAt: "2026-08-03T00:00:00Z",
  content: {
    format: "team-pricing",
    members: [{ name: "Anna", role: "PL", omfattningPct: 50, timmar: 100, timpris: null, total: null }],
    summary: { totalTimmar: 100, totalPris: null },
  },
};

function renderEditor(overrides: Partial<Parameters<typeof BidEditor>[0]> = {}) {
  return render(
    <BidEditor
      bidId="00000000-0000-0000-0000-000000000001"
      analysisId={null}
      initialSections={[proseSection("intro", "Inledning", "Vi är en konsultfirma.")]}
      initialStatus="draft"
      styleGuide={style}
      initialFailedBundles={[]}
      initialGenerationError={null}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BidEditor (dokumentvyn)", () => {
  it("renderar kapitel i nav och innehåll, utan PPTX-arv", () => {
    renderEditor();
    // Kapitlet syns (nav + innehåll)
    expect(screen.getAllByText("Inledning").length).toBeGreaterThan(0);
    expect(screen.getByText("Vi är en konsultfirma.")).toBeInTheDocument();
    // PPTX-arvet är borta
    expect(screen.queryByText(/Mallens hälsorapport/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Slides/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Struktur/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("char-counter")).not.toBeInTheDocument();
  });

  it("visar exportknappen när status är draft", () => {
    renderEditor();
    expect(screen.getByRole("button", { name: /Exportera anbud \(Markdown\)/ })).toBeInTheDocument();
  });

  it("varnar när timpris saknas i team-sektionen", () => {
    renderEditor({ initialSections: [teamSection] });
    expect(screen.getByText(/Fyll i timpriser/)).toBeInTheDocument();
  });

  it("visar misslyckade bundles som varning", () => {
    renderEditor({ initialFailedBundles: [{ bundle: "phases", error: "boom" }] });
    expect(screen.getByText(/kunde\s+inte genereras/)).toBeInTheDocument();
    expect(screen.getByText(/Faser/)).toBeInTheDocument();
  });

  it("visar förväntade kapitel som väntande under generering", () => {
    renderEditor({ initialSections: [], initialStatus: "generating" });
    expect(screen.getByText("Framsida")).toBeInTheDocument();
    expect(screen.getByText("Kravuppfyllnad")).toBeInTheDocument();
    expect(screen.getByLabelText("Kapitel under generering")).toBeInTheDocument();
  });

  it("markerar fallerad bundles kapitel under generering", () => {
    renderEditor({
      initialSections: [],
      initialStatus: "generating",
      initialFailedBundles: [{ bundle: "phases", error: "boom" }],
    });
    const item = screen.getByText("Genomförande");
    expect(item.closest("div")).toHaveClass("text-red-600", "line-through");
  });

  it("låser en landad sektion för redigering medan generering pågår (stale autosave kan trunkera anbudet)", () => {
    renderEditor({
      initialSections: [proseSection("intro", "Inledning", "Vi är en konsultfirma.")],
      initialStatus: "generating",
    });
    const textarea = screen.getByDisplayValue("Vi är en konsultfirma.");
    expect(textarea).toHaveAttribute("readonly");
  });

  it("tillåter redigering av samma sektion när status är draft", () => {
    renderEditor({
      initialSections: [proseSection("intro", "Inledning", "Vi är en konsultfirma.")],
      initialStatus: "draft",
    });
    const textarea = screen.getByDisplayValue("Vi är en konsultfirma.");
    expect(textarea).not.toHaveAttribute("readonly");
  });
});
