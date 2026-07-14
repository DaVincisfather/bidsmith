/**
 * Deterministic Swedish filler prose for budget calibration (design doc
 * 2026-07-14). Realistic consulting-bid sentence shapes so line-breaking
 * behaves like production text; NO braces (would read as unfilled tokens in
 * the rendered deck) and no markdown. Never shipped to customers — the
 * calibration deck is a measurement artifact.
 */

const SENTENCES = [
  "Vi genomför uppdraget i nära samarbete med beställarens verksamhet och följer överenskommen tidplan.",
  "Arbetet bedrivs iterativt med tydliga avstämningspunkter där prioriteringar förankras löpande.",
  "Leveranserna kvalitetssäkras genom kollegial granskning innan de överlämnas till beställaren.",
  "Teamet har dokumenterad erfarenhet av liknande uppdrag inom offentlig sektor och angränsande områden.",
  "Metoden anpassas efter verksamhetens förutsättningar snarare än efter en standardiserad mall.",
  "Riskerna hanteras genom en levande risklogg som gås igenom vid varje styrgruppsmöte.",
];

/** Exactly `chars` characters of deterministic prose (trim-safe, brace-free). */
export function testProse(chars: number): string {
  if (chars <= 0) return "";
  let out = "";
  let i = 0;
  while (out.length < chars) {
    out += (out.length > 0 ? " " : "") + SENTENCES[i % SENTENCES.length];
    i++;
  }
  out = out.slice(0, chars);
  // No trailing/odd whitespace after the hard cut — a trailing space measures
  // as nothing on the slide and would make the budget lie by one.
  if (out.endsWith(" ")) out = `${out.slice(0, -1)}.`;
  return out;
}

/**
 * A slot's calibration fill: unique `«marker»` prefix (the measurement side
 * maps shape → slot by this marker, so no COM/XML index alignment is needed)
 * followed by prose, at EXACTLY `budget` characters total.
 */
export function fillText(marker: string, budget: number): string {
  const prefix = `«${marker}»`;
  if (budget <= prefix.length + 1) return prefix;
  return `${prefix} ${testProse(budget - prefix.length - 1)}`;
}
