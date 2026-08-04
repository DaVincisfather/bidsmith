// Serialize a bid's sections to a self-contained Markdown document — the
// template-free export path. Pure function over BidSection[]: no DB, no
// template engine, no layout constraints. Section order = document order.
import { BidSection, BidSectionContent } from "@/lib/types";

// Downstream-AI instruction, prepended to every export as an HTML comment:
// invisible when the file is rendered or converted (clean deliverable for
// human eyes), fully readable for any AI given the raw text. Format-agnostic
// by design (Stefan 2026-08-03): the conditional branches let the downstream
// AI meet the user's own format choice — no setting, no export-time picker.
// MUST NOT contain "-->" anywhere in its body (would terminate the comment).
export const BID_MD_PREAMBLE = `<!--
INSTRUKTION TILL AI-ASSISTENTEN SOM BEARBETAR DETTA DOKUMENT

Detta är ett anbudsutkast genererat av Bidsmith. Människan du hjälper ska
omvandla det till sitt slutformat (Word-dokument, presentation eller annat).

DOKUMENTETS SEMANTIK
- "# " är anbudets titel; "## " är kapitel; "---" avgränsar kapitel.
- Kapitelordningen är anbudets avsedda ordning — bevara den.
- Tabeller är data (team, pris): de ska förbli tabeller i slutformatet.
- Punktlistor är uppräkningar, inte utfyllnad.

FAKTA ÄR LÅSTA
Namn, priser, timmar, procentsatser, datum, referenser, citat, kravsvar och
certifikat får omformuleras språkligt men aldrig ändras, kompletteras eller
"förbättras". Hitta aldrig på innehåll som inte finns i dokumentet. Vid
osäkerhet: behåll originalformuleringen ordagrant.

FORMATANPASSNING
- Textdokument (t.ex. Word): behåll rubrikhierarkin som rubriknivåer/styles.
- Presentation (t.ex. PowerPoint): ett "## "-kapitel motsvarar en sektion om
  en eller flera slides; kondensera prosa till punkter utan att ändra
  sakinnehåll.
- Annat verktyg: bevara struktur och fakta; formen är fri.
-->`;

// "" entries are deliberate blank-line separators — only null (conditional
// blocks) is filtered. Dropping "" would glue paragraphs/labels together,
// which CommonMark renders as one run-on paragraph (routine finding, PR #100).
function lines(...parts: Array<string | null>): string {
  return parts.filter((p): p is string => p !== null).join("\n");
}

function bullets(items: string[]): string | null {
  if (items.length === 0) return null;
  return items.map((i) => `- ${i}`).join("\n");
}

/** Escape pipes so free text can't break table rows. */
function cell(text: string): string {
  return text.replace(/\|/g, "\\|");
}

function coverMd(c: Extract<BidSectionContent, { format: "cover" }>): string {
  // One line: consecutive label lines would soft-wrap into a single paragraph.
  return lines(`# ${c.title}`, "", `**Till:** ${c.client} · **Datum:** ${c.date}`);
}

function phasesMd(c: Extract<BidSectionContent, { format: "phases" }>): string {
  const blocks = c.phases.map((p) => {
    const meta = [p.period, p.duration, p.hoursEstimate !== undefined ? `${p.hoursEstimate} h` : null]
      .filter(Boolean)
      .join(" · ");
    return lines(
      `### ${p.name}${meta ? ` (${meta})` : ""}`,
      "",
      p.objective,
      "",
      "**Aktiviteter:**",
      bullets(p.activities),
      "",
      "**Leveranser:**",
      bullets(p.deliverables),
      p.decisions && p.decisions.length > 0 ? lines("", "**Beslut vid faslut:**", bullets(p.decisions)) : null,
      p.risks && p.risks.length > 0 ? lines("", "**Risker:**", bullets(p.risks)) : null,
    );
  });
  return blocks.join("\n\n");
}

function matrixMd(c: Extract<BidSectionContent, { format: "requirement-matrix-v2" }>): string {
  const blocks = c.rows.map((row, i) => {
    const coverage = row.coverage.map(
      (cov) => `- ${cov.consultantName}: **${cov.status}** — ${cov.evidence}`,
    );
    return lines(
      `### ${i + 1}. ${row.requirement}`,
      "",
      row.hurUppfylls,
      "",
      `**Referens:** ${row.referens}`,
      coverage.length > 0 ? lines("", "**Täckning per konsult:**", coverage.join("\n")) : null,
    );
  });
  return blocks.join("\n\n");
}

function teamMd(c: Extract<BidSectionContent, { format: "team-pricing" }>): string {
  const header = "| Konsult | Roll | Omfattning | Timmar | Timpris (SEK) | Totalt (SEK) |";
  const sep = "|---|---|---|---|---|---|";
  const rows = c.members.map(
    (m) =>
      `| ${cell(m.name)} | ${cell(m.role)} | ${m.omfattningPct} % | ${m.timmar} | ${m.timpris ?? "—"} | ${m.total ?? "—"} |`,
  );
  const summary = c.summary
    ? `\n**Summa:** ${c.summary.totalTimmar} timmar${c.summary.totalPris !== null ? ` · ${c.summary.totalPris} SEK exkl. moms` : ""}`
    : null;
  return lines(header, sep, ...rows, summary);
}

function referencesMd(c: Extract<BidSectionContent, { format: "reference-v2" }>): string {
  // Bullet list, not bare label lines — those would soft-wrap into one paragraph.
  const blocks = c.references.map((r) =>
    lines(
      `### ${r.clientName} — ${r.contextLine}`,
      "",
      `- **Organisation:** ${r.organisation}`,
      `- **Period:** ${r.startDate} – ${r.endDate}`,
      `- **Omfattning:** ${r.scope}`,
      `- **Roll och leverans:** ${r.roleAndDelivery}`,
      `- **Resultat:** ${r.result}`,
      `- **Referensperson:** ${r.contact.name} (${r.contact.titlePhoneEmail})`,
    ),
  );
  return blocks.join("\n\n");
}

function sectionBody(content: BidSectionContent): string {
  switch (content.format) {
    case "cover":
      return coverMd(content);
    case "understanding-current":
      return lines(
        `**Organisation:** ${content.organisation}`,
        "",
        `**System:** ${content.system}`,
        "",
        `**Processer:** ${content.processer}`,
        "",
        "**Smärtpunkter:**",
        bullets(content.smärtpunkter),
      );
    case "understanding-assignment":
      return content.stycken.join("\n\n");
    case "understanding-vision":
      return lines(
        "**Identifierade utmaningar:**",
        bullets(content.utmaningar),
        "",
        "**Värde utöver ska-kraven:**",
        bullets(content.värden),
      );
    case "phases":
      return phasesMd(content);
    case "quality-assurance":
      return lines(
        content.qaProcess.join("\n\n"),
        "",
        `**Ansvarig kvalitetsledare:** ${content.qualityLead.name} — ${content.qualityLead.roleAndMandate} (${content.qualityLead.contact})`,
        "",
        `**Eskalering:** ${content.escalation.process}`,
        "",
        `**Rapportering:** ${content.escalation.reporting}`,
        "",
        "**Avstämningspunkter:**",
        bullets(content.checkpoints),
      );
    case "requirement-matrix-v2":
      return matrixMd(content);
    case "team-pricing":
      return teamMd(content);
    case "reference-v2":
      return referencesMd(content);
    case "confidentiality":
      return lines(
        content.oslReference,
        content.secrecyRows.length > 0
          ? lines(
              "",
              "**Sekretessbegäran:**",
              content.secrecyRows
                .map((r) => `- ${r.reference} — ${r.scope}: ${r.justification}`)
                .join("\n"),
            )
          : null,
      );
    case "certifications":
      return content.certs
        .map((cert) =>
          [cert.name, cert.description, `Certifikatnummer: ${cert.number}`, `Giltigt t.o.m: ${cert.validUntil}`]
            .filter(Boolean)
            .join(" · "),
        )
        .map((line) => `- ${line}`)
        .join("\n");
    case "generic-prose":
      return content.text;
  }
}

export function bidToMarkdown(sections: BidSection[]): string {
  const parts: string[] = [];
  for (const section of sections) {
    if (!section.content) continue; // placeholder sections carry nothing exportable
    const body = sectionBody(section.content);
    // The cover renders its own H1 — no duplicate section heading on top.
    parts.push(section.content.format === "cover" ? body : lines(`## ${section.title}`, "", body));
  }
  return BID_MD_PREAMBLE + "\n\n" + parts.join("\n\n---\n\n") + "\n";
}
