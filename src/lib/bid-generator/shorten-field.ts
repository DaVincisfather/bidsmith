// Skriver om ett enskilt fälts text till ≤ tak via en injicerad LLM-anropare.
// Ren logik (retry + best-effort) — routen injicerar callLLM som wrappar callClaude
// med MODELS.writingSupport, så logiken kan enhetstestas utan API-anrop.
//
// Beslut (Stefan 2026-07-02): retry 1× med strängare instruktion; om fortfarande
// över taket, behåll bästa (kortaste) försöket — ALDRIG hård trunkering (bevarar mening).

export interface ShortenParams {
  text: string;
  budget: number;
  fieldLabel: string;
}

export interface ShortenResult {
  text: string;
  length: number;
  budget: number;
  withinBudget: boolean;
}

export type ShortenLLM = (opts: { system: string; userContent: string }) => Promise<{
  text: string;
}>;

const SYSTEM =
  "Du är en svensk anbudsredaktör. Korta ner det givna fältets text så att den ryms " +
  "inom teckentaket, utan att tappa innebörd, ton eller fackspråk. Behåll hela meningar " +
  "— hugg aldrig av mitt i en mening. Svara enbart med den omskrivna texten.";

function baseUserContent({ text, budget, fieldLabel }: ShortenParams): string {
  return `Fält: ${fieldLabel}\nTeckentak: högst ${budget} tecken.\n\nText att korta:\n${text}`;
}

/** Kortaste kandidat som ryms; om ingen ryms, kortaste kandidaten (best-effort). */
function pickBest(candidates: string[], budget: number): string {
  const fitting = candidates.filter((c) => c.length <= budget);
  const pool = fitting.length > 0 ? fitting : candidates;
  return pool.reduce((best, c) => (c.length < best.length ? c : best));
}

export async function shortenField(
  params: ShortenParams,
  callLLM: ShortenLLM,
): Promise<ShortenResult> {
  const { budget } = params;
  const first = (await callLLM({ system: SYSTEM, userContent: baseUserContent(params) })).text;

  let text = first;
  if (first.length > budget) {
    const stricter =
      `${baseUserContent(params)}\n\n` +
      `Förra försöket blev ${first.length} tecken — det är för långt. ` +
      `Korta ännu mer och håll dig strikt under ${budget} tecken.`;
    const second = (await callLLM({ system: SYSTEM, userContent: stricter })).text;
    text = pickBest([first, second], budget);
  }

  return { text, length: text.length, budget, withinBudget: text.length <= budget };
}
