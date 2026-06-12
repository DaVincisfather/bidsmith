// evals/harness/core/compare-report.ts
// Rena renderingsfunktioner för jämförelserapporten och blindgranskningsunderlaget.
import type { WinTally } from "./compare-core";

export interface ComparePair {
  pairFile: string;
  // Vilken upphandling utkasten svarar mot — granskaren bedömer konkretion
  // mot uppdraget, inte i vakuum. Avslöjar inget om modellordningen.
  fixtureId: string;
  sectionType: string;
  textA: string;
  textB: string;
}

export interface BlindPair {
  id: string;
  fixtureId: string;
  sectionType: string;
  utkast1: string;
  utkast2: string;
  facit: { ordning: "A-först" | "B-först"; pairFile: string };
}

// mulberry32 — minimal deterministisk PRNG (6 rader). Math.random duger inte:
// blindgranskningens urval och ordning måste gå att reproducera från seed.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickBlindPairs(pairs: ComparePair[], n: number, seed: number): BlindPair[] {
  const rand = mulberry32(seed);
  // Fisher-Yates på en kopia — deterministiskt urval av n par.
  const shuffled = [...pairs];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, n).map((p, idx) => {
    const aForst = rand() < 0.5;
    return {
      id: `par-${idx + 1}`,
      fixtureId: p.fixtureId,
      sectionType: p.sectionType,
      utkast1: aForst ? p.textA : p.textB,
      utkast2: aForst ? p.textB : p.textA,
      facit: { ordning: aForst ? "A-först" : "B-först", pairFile: p.pairFile },
    };
  });
}

// Parsar den ifyllda blind-review.md. Rader på formen:
// | par-3 | <ffu> | phases | 2 |
// Vinnarcellen måste vara EXAKT 1/2/oavgjort (case-okänsligt) — en utsmyckad
// markering ("2 (knapp)", "12") blir en VARNING, aldrig en tyst röst eller
// tyst unscored: rättningen avgör ett modellbeslut.
export interface ParsedBlindReview {
  marks: Array<{ id: string; mark: "1" | "2" | "oavgjort" }>;
  invalid: Array<{ id: string; raw: string }>;
}

export function parseBlindReviewMarks(md: string): ParsedBlindReview {
  const marks: ParsedBlindReview["marks"] = [];
  const invalid: ParsedBlindReview["invalid"] = [];
  for (const line of md.split("\n")) {
    // [^|]* per cell — `.*` kunde sluka pipes och läsa fel cell som vinnare.
    const row = line.match(/^\|\s*(par-\d+)\s*\|[^|]*\|[^|]*\|([^|]*)\|\s*$/);
    if (!row) continue;
    const cell = row[2].trim();
    if (cell === "") continue;
    if (/^(1|2|oavgjort)$/i.test(cell)) {
      marks.push({ id: row[1], mark: cell.toLowerCase() as "1" | "2" | "oavgjort" });
    } else {
      invalid.push({ id: row[1], raw: cell });
    }
  }
  return { marks, invalid };
}

export interface BlindScore {
  a: number;
  b: number;
  tie: number;
  unscored: number;
}

// Översätter utkastval (1/2) till modelltermer (A/B) via facit-ordningen —
// "A-först" betyder utkast 1 = modell A.
export function scoreBlindReview(
  marks: Array<{ id: string; mark: "1" | "2" | "oavgjort" }>,
  facit: Array<{ id: string; facit: { ordning: "A-först" | "B-först"; pairFile: string } }>,
): BlindScore {
  // Dubbletter och föräldralösa id:n är redigeringsfel som måste upp till ytan —
  // tyst sista-raden-vinner kan vända ett modellbeslut.
  const seen = new Set<string>();
  const facitIds = new Set(facit.map((f) => f.id));
  for (const m of marks) {
    if (seen.has(m.id)) throw new Error(`Dubblettmarkering för ${m.id} — rätta tabellen`);
    seen.add(m.id);
    if (!facitIds.has(m.id)) throw new Error(`Markering för ${m.id} saknar motsvarighet i facit`);
  }
  const byId = new Map(marks.map((m) => [m.id, m.mark]));
  const score: BlindScore = { a: 0, b: 0, tie: 0, unscored: 0 };
  for (const f of facit) {
    const mark = byId.get(f.id);
    if (!mark) {
      score.unscored++;
      continue;
    }
    if (mark === "oavgjort") {
      score.tie++;
      continue;
    }
    const valdeForsta = mark === "1";
    const aForst = f.facit.ordning === "A-först";
    if (valdeForsta === aForst) score.a++;
    else score.b++;
  }
  return score;
}

export interface ModelCost {
  model: string;
  totalUsd: number;
  perBid: number;
}

export function renderReportMd(input: {
  modelA: string;
  modelB: string;
  tally: WinTally;
  costs: ModelCost[];
}): string {
  const lines: string[] = [
    `# Jämförelse: ${input.modelA} (A) vs ${input.modelB} (B)`,
    "",
    "## Vinstandelar per sektionstyp (parvis blind judge, positionsbyte)",
    "",
    "| Sektionstyp | A | B | Oavgjort | A-andel exkl. tie | B-andel exkl. tie |",
    "|---|---|---|---|---|---|",
  ];
  for (const [sectionType, t] of Object.entries(input.tally)) {
    const decided = t.a + t.b;
    const aShare = decided > 0 ? (t.a / decided).toFixed(2) : "—";
    const bShare = decided > 0 ? (t.b / decided).toFixed(2) : "—";
    lines.push(`| ${sectionType} | ${t.a} | ${t.b} | ${t.tie} | ${aShare} | ${bShare} |`);
  }
  lines.push("", "## Kostnad per modell", "", "| Modell | Totalt (USD) | Per anbud (USD) |", "|---|---|---|");
  for (const c of input.costs) {
    lines.push(`| ${c.model} | ${c.totalUsd} | ${c.perBid} |`);
  }
  lines.push(
    "",
    "## Beslut",
    "",
    "_Fylls i efter Stefans blindgranskning (Task 17). Beslutsregel: byt skrivmodell",
    "endast vid samstämmig signal från judge-tally OCH mänsklig blindgranskning;",
    "spretigt utfall = behåll Opus._",
    "",
  );
  return lines.join("\n");
}
