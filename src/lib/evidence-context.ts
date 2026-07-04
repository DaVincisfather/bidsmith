// Källkontext-lokaliserare för källa-badgen. PROBLEM (produktägar-feedback):
// det utfällda citatet säger ofta EXAKT samma sak som påståendet (extraktionen
// skriver nära-ordagranna beskrivningar; CV-kompetenser citerar kompetensrad-
// raden) → meningslöst. FIX: visa citatet I SITT SAMMANHANG — ±windowChars
// omgivande källtext med citatspannet markerat — så det svarar på "var står det,
// i vilket sammanhang", inte "vad står det".
//
// Kärnutmaning: verifieraren (verify-evidence.ts) matchar på NORMALISERAD text,
// men kontexten måste klippas ur ORIGINALTEXTEN (läsbar, med riktiga radbrytningar
// kollapsade för visning). Vi bygger därför en normaliserad kopia MED en indexkarta
// tillbaka till originaloffset (normalizeWithMap) och lokaliserar citatet med samma
// matchningssemantik som verifieraren (första-tecken-skiftläge + sidbrytnings-gap).
import {
  normalizeForEvidence,
  caseVariants,
  MIN_HALF,
  SEAM_SLACK,
  GAP_WINDOW,
} from "./verify-evidence";

export interface EvidenceContext {
  before: string;
  quote: string;
  after: string;
}

const DEFAULT_WINDOW = 200;

/**
 * Normaliserar exakt som normalizeForEvidence MEN behåller en karta från varje
 * normaliserat tecken till dess startoffset i originaltexten. Stegen speglar
 * verifierarens normalisering (soft hyphen bort, typografi→ASCII, punktglyfer→
 * mellanslag, avstavning vid radslut bort, whitespace-kollaps, trim) — utfört
 * över parallella char/index-arrayer i stället för via regex, så indexkartan
 * följer med. Ett self-consistency-test låser `normalized === normalizeForEvidence`.
 *
 * `origStart` har längd N+1: origStart[i] = originalindex där normaliserat tecken i
 * börjar; origStart[N] = originalLängd (sentinel för slut-på-match).
 */
export function normalizeWithMap(text: string): {
  normalized: string;
  origStart: number[];
} {
  // Steg 1-3: soft hyphen bort, typografi→ASCII, punktglyf→mellanslag (1:1 utom
  // soft hyphen som droppas). Bygg parallella arrayer char/originalindex.
  const c1: string[] = [];
  const i1: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "­") continue; // mjukt bindestreck: droppas
    c1.push(mapChar(c));
    i1.push(i);
  }

  // Steg 4: ta bort avstavningsbindestreck vid radslut — ett "-" följt av en
  // whitespace-körning som innehåller minst ett "\n" (motsvarar /-\s*\r?\n\s*/g).
  const c2: string[] = [];
  const i2: number[] = [];
  for (let j = 0; j < c1.length; j++) {
    if (c1[j] === "-") {
      let k = j + 1;
      let hasNewline = false;
      while (k < c1.length && isWs(c1[k])) {
        if (c1[k] === "\n") hasNewline = true;
        k++;
      }
      if (k > j + 1 && hasNewline) {
        j = k - 1; // hoppa över "-" + hela ws-körningen (loop-++ går till k)
        continue;
      }
    }
    c2.push(c1[j]);
    i2.push(i1[j]);
  }

  // Steg 5: kollapsa whitespace-körningar till ETT mellanslag (behåll körningens
  // startoffset så citatspannet snäpper rätt).
  const c3: string[] = [];
  const i3: number[] = [];
  for (let j = 0; j < c2.length; j++) {
    if (isWs(c2[j])) {
      const runStart = i2[j];
      while (j + 1 < c2.length && isWs(c2[j + 1])) j++;
      c3.push(" ");
      i3.push(runStart);
    } else {
      c3.push(c2[j]);
      i3.push(i2[j]);
    }
  }

  // Steg 6: trim — efter kollaps finns högst ett ledande/avslutande mellanslag.
  let start = 0;
  let end = c3.length;
  if (c3[start] === " ") start++;
  if (end > start && c3[end - 1] === " ") end--;

  const origStart = i3.slice(start, end);
  origStart.push(text.length); // sentinel
  return { normalized: c3.slice(start, end).join(""), origStart };
}

// Typografi + punktglyfer → ASCII (samma teckenklasser som normalizeForEvidence).
function mapChar(c: string): string {
  if ("‘’‚‛".includes(c)) return "'";
  if ("“”„‟".includes(c)) return '"';
  if ("–—‒−".includes(c)) return "-";
  if ("•●▪◦·".includes(c)) return " ";
  return c;
}

// Samma whitespace-begrepp som JS `\s` (som normalizeForEvidences regex använder).
function isWs(c: string): boolean {
  return /\s/.test(c);
}

interface Span {
  start: number;
  end: number;
}

// Sammanhängande träff av hela citatet, med verifierarens första-tecken-varianter.
function findContiguous(source: string, evidence: string): Span | null {
  for (const cand of caseVariants(evidence)) {
    const i = source.indexOf(cand);
    if (i >= 0) return { start: i, end: i + cand.length };
  }
  return null;
}

// Gap-fallback: när hela citatet inte finns sammanhängande (sidbrytnings-skräp mitt
// i) lokaliserar vi den LÄNGSTA halvan — den räcker för att svara "var i dokumentet".
// Speglar gapMatch:s iteration exakt så vi hittar samma skarv verifieraren matchade.
function findLongestHalf(source: string, evidence: string): Span | null {
  for (const cand of caseVariants(evidence)) {
    for (let i = cand.indexOf(" "); i > 0; i = cand.indexOf(" ", i + 1)) {
      for (let pSlack = 0; pSlack <= SEAM_SLACK; pSlack++) {
        const prefix = cand.slice(0, i - pSlack);
        if (prefix.length < MIN_HALF) break;
        const pIdx = source.indexOf(prefix);
        if (pIdx < 0) continue;
        for (let sSlack = 0; sSlack <= SEAM_SLACK; sSlack++) {
          const suffix = cand.slice(i + 1 + sSlack);
          if (suffix.length < MIN_HALF) break;
          const sIdx = source.indexOf(suffix, pIdx + prefix.length);
          if (sIdx >= 0 && sIdx - (pIdx + prefix.length) <= GAP_WINDOW) {
            return prefix.length >= suffix.length
              ? { start: pIdx, end: pIdx + prefix.length }
              : { start: sIdx, end: sIdx + suffix.length };
          }
        }
      }
    }
  }
  return null;
}

/**
 * Lokaliserar citatet i källtexten (samma normalisering som verifieraren) och
 * returnerar ±windowChars kontext, snäppt till ordgränser. null när citatet
 * inte återfinns (ska inte hända för verifierad evidence — defensivt).
 */
export function locateEvidenceContext(
  sourceText: string,
  evidence: string,
  windowChars: number = DEFAULT_WINDOW,
): EvidenceContext | null {
  if (!sourceText || !evidence) return null;
  const { normalized, origStart } = normalizeWithMap(sourceText);
  const normEvidence = normalizeForEvidence(evidence);
  if (normEvidence.length === 0) return null;

  const span =
    findContiguous(normalized, normEvidence) ??
    findLongestHalf(normalized, normEvidence);
  if (!span) return null;

  const startOrig = origStart[span.start];
  const endOrig = origStart[span.end];

  const beforeCut = Math.max(0, startOrig - windowChars);
  const afterCut = Math.min(sourceText.length, endOrig + windowChars);

  return {
    before: snapBefore(sourceText, beforeCut, startOrig),
    quote: clean(sourceText.slice(startOrig, endOrig)),
    after: snapAfter(sourceText, endOrig, afterCut),
  };
}

// Klipp ledande partiellt ord om fönstret skar mitt i ett ord.
function snapBefore(text: string, cut: number, spanStart: number): string {
  let frag = text.slice(cut, spanStart);
  if (cut > 0 && /\S/.test(text[cut - 1])) frag = frag.replace(/^\S+/, "");
  return clean(frag);
}

// Klipp avslutande partiellt ord om fönstret skar mitt i ett ord.
function snapAfter(text: string, spanEnd: number, cut: number): string {
  let frag = text.slice(spanEnd, cut);
  if (cut < text.length && /\S/.test(text[cut])) frag = frag.replace(/\S+$/, "");
  return clean(frag);
}

// Gör ett originalfragment enradigt läsbart: soft hyphen bort, whitespace kollapsad.
function clean(s: string): string {
  return s.replace(/­/g, "").replace(/\s+/g, " ").trim();
}
