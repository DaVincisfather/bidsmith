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
      // Punktlist-glyfer är list-MARKUP, inte innehåll: PDF-extraktion klistrar
      // dem intill orden ("timmar•genomförts") och modellen utelämnar dem när
      // den citerar listinnehåll (varv 2: alla tre missar var denna klass).
      // Whitespace-kollapsen efteråt jämnar ut resterna. Vanliga list-streck
      // (-, –) normaliseras INTE bort — de är tvetydiga mot innehålls-streck.
      .replace(/[•●▪◦·]/g, " ")
      // RIKTIGA avstavningsbindestreck vid radslut ("erfaren-\nhet"): PDF:er
      // avstavar med vanligt "-" + radbrytning; modellen citerar ordet helt
      // ("erfarenhet"). Ta bort bindestreck+radbrytning. MEDVETEN AVVÄGNING:
      // ett äkta sammansättningsstreck som råkar brytas ("IT-\nkonsult") blir
      // "ITkonsult" och missar mot citatet "IT-konsult" — felar åt säkra hållet
      // (falsk miss, aldrig falsk träff) och klassas som fixturbrus i loopen.
      .replace(/-\s*\r?\n\s*/g, "")
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

    if (!evidenceFoundIn(normalizedSource, normalizeForEvidence(req.evidence))) {
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

// Varv 1-lärdomar (evals/results/…zero-hallucination-loop.md): alla missar var
// KÄLLARTEFAKTER, inte hallucinationer — modellen citerade den logiska texten
// korrekt. Två väl avgränsade lättnader, båda omöjliga att utnyttja för
// fabricerade citat:
//
// 1. Skiftläge på FÖRSTA tecknet: modellen versaliserar citatets början
//    ("Anbudsgivaren…" ur mid-sentence "…anbudsgivaren…"). Presentations-, inte
//    innehållsskillnad. Övriga tecken förblir case-känsliga.
// 2. Sidbrytnings-gap: PDF:er stoppar in sidhuvud/-fot MITT i meningar
//    ("…avgifter till [C 2026-0696 … Sida 7/22] vare sig Skatteverket…").
//    Citatet delas vid ordgränser i två halvor (≥ MIN_HALF tecken var, upp till
//    SEAM_SLACK tecken får offras vid skarven — täcker även PDF-tapp som
//    "kund- och"→"kundoch"); båda halvorna måste finnas ORDAGRANT, i ORDNING,
//    inom GAP_WINDOW tecken. Att fabricera det kräver två långa äkta textsjok
//    intill varandra — dvs. ett äkta citat.
const MIN_HALF = 25;
const SEAM_SLACK = 3;
const GAP_WINDOW = 400;

function evidenceFoundIn(source: string, evidence: string): boolean {
  for (const cand of caseVariants(evidence)) {
    if (source.includes(cand)) return true;
    if (gapMatch(source, cand)) return true;
  }
  return false;
}

function caseVariants(evidence: string): string[] {
  if (evidence.length === 0) return [evidence];
  const lower = evidence[0].toLowerCase() + evidence.slice(1);
  const upper = evidence[0].toUpperCase() + evidence.slice(1);
  return lower === upper ? [evidence] : [evidence, lower, upper];
}

function gapMatch(source: string, evidence: string): boolean {
  // Prova varje ordgräns som skarv. Upp till SEAM_SLACK tecken får offras i
  // VARDERA änden av skarven — prefixslut ("kund-" när källan tappat "- " →
  // "kundoch") och suffixstart (tappade tecken efter sidbrytning).
  for (let i = evidence.indexOf(" "); i > 0; i = evidence.indexOf(" ", i + 1)) {
    for (let pSlack = 0; pSlack <= SEAM_SLACK; pSlack++) {
      const prefix = evidence.slice(0, i - pSlack);
      if (prefix.length < MIN_HALF) break;
      const pIdx = source.indexOf(prefix);
      if (pIdx < 0) continue; // kortare prefix (mer slack) kan ändå finnas
      for (let sSlack = 0; sSlack <= SEAM_SLACK; sSlack++) {
        const suffix = evidence.slice(i + 1 + sSlack);
        if (suffix.length < MIN_HALF) break;
        const sIdx = source.indexOf(suffix, pIdx + prefix.length);
        if (sIdx >= 0 && sIdx - (pIdx + prefix.length) <= GAP_WINDOW) return true;
      }
    }
  }
  return false;
}
