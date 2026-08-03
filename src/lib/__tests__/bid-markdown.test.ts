import { describe, expect, it } from "vitest";
import { bidToMarkdown } from "@/lib/bid-markdown";
import { BidSection } from "@/lib/types";

function section(key: string, title: string, content: BidSection["content"]): BidSection {
  return { type: "ai", key, title, content, generatedAt: "2026-08-03T00:00:00Z" };
}

describe("bidToMarkdown", () => {
  it("renders the cover as document H1 with client and date, no duplicate heading", () => {
    const md = bidToMarkdown([
      section("cover", "Framsida", {
        format: "cover",
        title: "Optimering av bemanning",
        client: "Vikstads kommun",
        date: "2026-08-02",
      }),
    ]);
    expect(md).toContain("# Optimering av bemanning");
    // One metadata line — separate label lines would soft-wrap into one paragraph.
    expect(md).toContain("**Till:** Vikstads kommun · **Datum:** 2026-08-02");
    // Blank line between H1 and metadata (paragraph boundary).
    expect(md).toContain("# Optimering av bemanning\n\n**Till:**");
    expect(md).not.toContain("## Framsida");
  });

  it("renders phases with meta line, lists and optional risks", () => {
    const md = bidToMarkdown([
      section("phases", "Genomförande", {
        format: "phases",
        phases: [
          {
            name: "Fas 1: Kartläggning",
            objective: "Skapa en nulägesbild.",
            activities: ["Intervjuer", "Datainsamling"],
            deliverables: ["Nulägesrapport"],
            duration: "8 v",
            period: "M1-M3",
            hoursEstimate: 85,
            decisions: ["Godkänna nulägesbild"],
            risks: ["Begränsad datatillgång"],
            shortDescription: "Nulägesbild",
          },
        ],
      }),
    ]);
    expect(md).toContain("## Genomförande");
    expect(md).toContain("### Fas 1: Kartläggning (M1-M3 · 8 v · 85 h)");
    expect(md).toContain("**Aktiviteter:**\n- Intervjuer\n- Datainsamling");
    // Blank line between a list's last item and the next label — without it,
    // CommonMark swallows the label into the list item as lazy continuation.
    expect(md).toContain("- Datainsamling\n\n**Leveranser:**");
    expect(md).toContain("- Nulägesrapport\n\n**Beslut vid faslut:**");
    expect(md).toContain("**Beslut vid faslut:**\n- Godkänna nulägesbild");
    expect(md).toContain("**Risker:**\n- Begränsad datatillgång");
  });

  it("separates understanding-current label paragraphs with blank lines", () => {
    const md = bidToMarkdown([
      section("understanding-current", "Kunden idag", {
        format: "understanding-current",
        organisation: "Vikstads kommun.",
        system: "Timecare nämns.",
        processer: "Drift och uthyrning.",
        smärtpunkter: ["Ingen samlad nulägesbild"],
      }),
    ]);
    expect(md).toContain("**Organisation:** Vikstads kommun.\n\n**System:** Timecare nämns.");
    expect(md).toContain("**Processer:** Drift och uthyrning.\n\n**Smärtpunkter:**");
  });

  it("renders reference fields as a bullet list so they do not merge into one paragraph", () => {
    const md = bidToMarkdown([
      section("reference-v2", "Referensuppdrag", {
        format: "reference-v2",
        references: [
          {
            clientName: "Göteborgs stad",
            contextLine: "Bemanningsoptimering",
            organisation: "Idrottsförvaltningen",
            startDate: "01/2023",
            endDate: "12/2023",
            scope: "Tre faser",
            contact: { name: "N N", titlePhoneEmail: "Titel · tel · epost" },
            roleAndDelivery: "Analys och verktyg",
            result: "Beslutad bemanningsplan",
          },
        ],
      }),
    ]);
    expect(md).toContain("### Göteborgs stad — Bemanningsoptimering");
    expect(md).toContain("- **Organisation:** Idrottsförvaltningen\n- **Period:** 01/2023 – 12/2023");
    expect(md).toContain("- **Resultat:** Beslutad bemanningsplan");
  });

  it("renders requirement matrix rows with per-consultant coverage", () => {
    const md = bidToMarkdown([
      section("requirement-matrix-v2", "Kravmatris", {
        format: "requirement-matrix-v2",
        rows: [
          {
            requirement: "Erfarenhet av bemanningsoptimering",
            hurUppfylls: "Jonas och Anna har direkt erfarenhet.",
            referens: "Bemanningsoptimering, Göteborgs stad",
            coverage: [
              { consultantName: "Anna Lindström", status: "JA", evidence: "Uppdraget i Göteborg" },
              { consultantName: "Erik Johansson", status: "DELVIS", evidence: "Budgetmodeller" },
            ],
          },
        ],
      }),
    ]);
    expect(md).toContain("### 1. Erfarenhet av bemanningsoptimering");
    expect(md).toContain("- Anna Lindström: **JA** — Uppdraget i Göteborg");
    expect(md).toContain("- Erik Johansson: **DELVIS** — Budgetmodeller");
  });

  it("renders team pricing as a table with em-dash for unset prices", () => {
    const md = bidToMarkdown([
      section("team-pricing", "Team och pris", {
        format: "team-pricing",
        members: [
          { name: "Anna Lindström", role: "Uppdragsansvarig", omfattningPct: 40, timpris: null, timmar: 150, total: null },
        ],
        summary: { totalTimmar: 150, totalPris: null },
      }),
    ]);
    expect(md).toContain("| Konsult | Roll | Omfattning | Timmar | Timpris (SEK) | Totalt (SEK) |");
    expect(md).toContain("| Anna Lindström | Uppdragsansvarig | 40 % | 150 | — | — |");
    expect(md).toContain("**Summa:** 150 timmar");
  });

  it("renders generic-prose sections as plain paragraphs under the section title", () => {
    const md = bidToMarkdown([
      section("slot-3", "Om oss", {
        format: "generic-prose",
        placeholder: "om_oss",
        text: "Vi är en konsultfirma.",
      }),
    ]);
    expect(md).toContain("## Om oss");
    expect(md).toContain("Vi är en konsultfirma.");
  });

  it("skips sections without content and separates sections with rules", () => {
    const md = bidToMarkdown([
      section("cover", "Framsida", { format: "cover", title: "T", client: "K", date: "D" }),
      { type: "placeholder", key: "tbd", title: "Kommer senare", generatedAt: "2026-08-03T00:00:00Z" },
      section("slot-1", "Om oss", { format: "generic-prose", placeholder: "p", text: "Text." }),
    ]);
    expect(md).not.toContain("Kommer senare");
    expect(md).toContain("\n\n---\n\n");
  });

  it("escapes pipes in team table cells", () => {
    const md = bidToMarkdown([
      section("team-pricing", "Team", {
        format: "team-pricing",
        members: [
          { name: "A | B", role: "Roll", omfattningPct: 10, timpris: 1000, timmar: 10, total: 10000 },
        ],
      }),
    ]);
    expect(md).toContain("| A \\| B | Roll |");
  });
});

describe("BID_MD_PREAMBLE", () => {
  const md = bidToMarkdown([
    section("cover", "Framsida", {
      format: "cover", title: "Titel", client: "Kund", date: "2026-08-03",
    }),
  ]);

  it("opens the export as a valid HTML comment, H1 right after", () => {
    expect(md.startsWith("<!--\n")).toBe(true);
    const closeIdx = md.indexOf("-->");
    expect(closeIdx).toBeGreaterThan(0);
    // Exactly one comment terminator — free text with --> would truncate it.
    expect(md.indexOf("-->", closeIdx + 3)).toBe(-1);
    expect(md.slice(closeIdx + 3).trimStart().startsWith("# Titel")).toBe(true);
  });

  it("carries the three instruction parts", () => {
    expect(md).toContain("DOKUMENTETS SEMANTIK");
    expect(md).toContain("FAKTA ÄR LÅSTA");
    expect(md).toContain("FORMATANPASSNING");
  });
});
