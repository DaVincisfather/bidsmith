// Mekanisk evidens-verifierare för noll-hallucinationsloopen.
//
// Kärnidé: extraktionen tvingar varje krav att bära ett ORDAGRANT källcitat
// (RfpRequirementSchema.evidence, min(1)). Här sträng-matchar vi citatet mot
// källdokumentet. En träff = citatet finns bevisligen i källan → kravet är
// förankrat. En miss = citatet är antingen utelämnat eller uppdiktat.
//
// Varför INGEN LLM-domare: en sträng-containment är deterministisk och har inget
// kalibreringsproblem — inga gränsfall som flippar mellan körningar, ingen
// modell-stilbias. Den dödar HELA klassen fabricerade citat. (Kvarvarande risk:
// modellen citerar ÄKTA men irrelevant text — den relevansen spot-checkas av
// människa på den gröna slutkörningen, se notes/2026-07-03-zero-hallucination-loop.md.)

export interface EvidenceMiss {
  fixtureId: string;
  requirementText: string;
  /** Modellens citat. undefined = modellen utelämnade fältet helt. */
  evidence: string | undefined;
  /** "missing" = inget citat gavs; "not-found" = citat gavs men fanns ej i källan. */
  reason: "missing" | "not-found";
}

/** Minsta form vi behöver ur ett RfpRequirement för verifieringen. */
export interface VerifiableRequirement {
  category?: string;
  description: string;
  evidence?: string;
}

// Normalisering. Varje steg motiveras av en KONKRET källa till ofarliga avvikelser
// mellan ett citat och källtexten — vi tolererar dem, men INGET som ändrar innehåll.
export function normalizeForEvidence(text: string): string {
  return (
    text
      // Mjuka bindestreck (U+00AD): PDF-avstavning stoppar in dem mitt i ord.
      // Modellen kopierar ofta ordet utan det (eller tvärtom) — ta bort i båda.
      .replace(/­/g, "")
      // Typografiska tecken från Word: kröktacitat och långa tankstreck. Modellen
      // återger dem ofta som raka ASCII-varianter (eller vice versa). Normalisera
      // BÅDA riktningar till ASCII så innehållet — inte glyfvalet — avgör matchen.
      .replace(/[‘’‚‛]/g, "'") // ' ' ‚ ‛ → '
      .replace(/[“”„‟]/g, '"') // " " „ ‟ → "
      .replace(/[–—‒−]/g, "-")  // – — ‒ − → -
      // Alla whitespace-körningar (inkl. radbrytningar/tabbar) → ett mellanslag.
      // PDF-extraktion bryter rader mitt i meningar; ett citat kan ha ett mellanslag
      // där källan har en radbrytning. Kollaps gör dem jämförbara.
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Verifierar att varje krav bär ett citat som ORDAGRANT (efter normalisering)
 * återfinns i källdokumentet. Ren funktion — inga sidoeffekter, inga API-anrop.
 *
 * Matchningen är normaliseringstolerant (whitespace/avstavning/typografi) men
 * innehållssträng: efter normalisering görs CASE-KÄNSLIG substring-containment.
 * Case-känsligheten är avsiktlig — "Krav" vs "krav" är en innehållsskillnad som
 * en ordagrann-citat-regel ska fånga.
 */
export function verifyEvidence(
  fixtureId: string,
  sourceText: string,
  requirements: VerifiableRequirement[]
): EvidenceMiss[] {
  const normalizedSource = normalizeForEvidence(sourceText);
  const misses: EvidenceMiss[] = [];

  for (const req of requirements) {
    const requirementText = req.category
      ? `${req.category}: ${req.description}`
      : req.description;

    // Tomt/whitespace-only citat räknas som utelämnat — schemat borde ha fångat
    // det (min(1)), men verifieraren ska vara robust även mot rå/oschemad input.
    if (req.evidence === undefined || req.evidence.trim() === "") {
      misses.push({
        fixtureId,
        requirementText,
        evidence: req.evidence,
        reason: "missing",
      });
      continue;
    }

    const normalizedEvidence = normalizeForEvidence(req.evidence);
    if (!normalizedSource.includes(normalizedEvidence)) {
      misses.push({
        fixtureId,
        requirementText,
        evidence: req.evidence,
        reason: "not-found",
      });
    }
  }

  return misses;
}
