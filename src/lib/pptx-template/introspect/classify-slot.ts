import { z } from "zod";
import { callClaude } from "@/lib/ai-client";
import { MODELS } from "@/lib/models";
import { CAPABILITY_IDS, type CapabilityId } from "../template-profile";

/**
 * Slot auto-classification (template-upload slice 5). En kundmall är
 * OINSTRUMENTERAD — den har inga `{tokens}`, bara textrutor med kundens
 * exempeltext. Givet en sådan rutas exempeltext + omgivande slide-text föreslår
 * vi vilken content-capability som ska fylla den — en känd specialiserad när
 * texten/kontexten tydligt pekar dit, annars generic-prose — plus en härledd
 * intent, en confidence OCH ett kort svenskt namn för det token som ska
 * injiceras. Detta SEEDAR onboarding-intervjun: high confidence → förvald, low
 * → flaggas för mänsklig bekräftelse.
 *
 * Classification, not writing — uses the matching model role (Sonnet), so no
 * eval gate. See notes/2026-07-02-template-upload-architecture.md.
 */

export const SlotClassificationSchema = z.object({
  capability: z.enum(CAPABILITY_IDS),
  /** Derived purpose of the slot, fed to generic-prose when that's the pick. */
  intent: z.string().min(1),
  /** high only when the sample text/context clearly points at the capability. */
  confidence: z.enum(["high", "low"]),
  /** Short Swedish name for the token to inject, WITHOUT braces, e.g. "Hållbarhet".
   *  1–40 chars, no { } characters. */
  name: z.string().min(1).max(40).regex(/^[^{}]+$/),
});
export type SlotClassification = z.infer<typeof SlotClassificationSchema>;

export interface ForeignSlotInput {
  /** The shape's current sample text (customer's example content). Primary signal.
   *  May be empty for an empty fillable box. */
  shapeText: string;
  /** Static text from the OTHER shapes on the same slide — headings/labels giving
   *  the shape meaning. */
  slideText?: string;
}

// One line per capability so the model maps a label to the right generator.
// Record<CapabilityId, …> so a new capability in CAPABILITY_IDS is a compile
// error until it's described here — the menu can't silently drift out of sync.
const CAPABILITY_MENU: Record<CapabilityId, string> = {
  cover: "anbudsmeta (titel, kund, datum, diarienummer)",
  toc: "automatisk innehållsförteckning",
  understanding: "vår förståelse av uppdraget, i prosa",
  "execution-plan": "genomförandeplan / faser",
  "quality-assurance": "kvalitetssäkringsprocess och kontrollpunkter",
  "team-pricing": "team och pris (tabell)",
  "requirement-matrix": "kravmatris / ska-krav-täckning (tabell)",
  "go-no-go": "go/no-go-bedömning",
  references: "referensuppdrag",
  secrecy: "sekretess / OSL",
  certifications: "certifieringar",
  "generic-prose": "FALLBACK — fri prosa för en sektion som ingen ovanstående passar",
  static: "passthrough utan genererat innehåll (t.ex. ren bildslide)",
};

const CAPABILITY_MENU_TEXT = CAPABILITY_IDS.map(
  (id) => `- ${id}: ${CAPABILITY_MENU[id]}`,
).join("\n");

const SYSTEM_PROMPT = `Du klassificerar en textruta i en uppladdad svensk anbudsmall.
Rutan är OINSTRUMENTERAD: du ser kundens exempeltext i rutan (eller "(tom ruta)"
när den är tom) samt den omgivande texten på sliden (rubriker/etiketter som ger
rutan mening).

Välj den capability ur listan nedan som bäst fyller rutan, utifrån dess
exempeltext och den omgivande texten. Om ingen specialiserad capability tydligt
passar — välj "generic-prose" (fri prosa-fallback). Gissa inte en specialiserad
capability på svaga grunder; det är bättre att falla tillbaka på generic-prose.

ETIKETT-RUTOR: om rutans text bara är en kort etikett eller rubrik som beskriver
en ANNAN rutas innehåll (t.ex. "Diarienummer", "Upphandlande organisation",
"Anbudsdag" intill ett värdefält) ska den klassas "static" — den är formgivning
som redan står i mallen, inte en yta som ska fyllas med genererat innehåll.

Härled en kort intent (syftet med sektionen) på svenska, som styr genereringen.
Sätt confidence "high" ENDAST när exempeltexten/kontexten tydligt pekar på den
valda capabilityn; annars "low" (flaggas för mänsklig bekräftelse i onboardingen).

Föreslå dessutom ett kort svenskt namn för det token som ska injiceras i rutan
(utan klammerparenteser, 1–40 tecken, t.ex. "Hållbarhet"). Namnet blir
platshållaren, så håll det kort och beskrivande.

Capabilities:
${CAPABILITY_MENU_TEXT}

Svara med giltig JSON:
{ "capability": "<id ur listan>", "intent": "<kort syfte>", "confidence": "high" | "low", "name": "<kort svenskt namn utan { }>" }`;

export async function classifyForeignSlot(
  input: ForeignSlotInput,
  ctx?: { userId?: string | null },
): Promise<SlotClassification> {
  const userContent = [
    // Tom ruta är ett giltigt fall (tom ifyllnadsbox) — ge modellen en explicit
    // markör i stället för en blank rad så signalen inte tappas.
    `Exempeltext i rutan: ${input.shapeText.trim() ? input.shapeText : "(tom ruta)"}`,
    input.slideText ? `Omgivande text på sliden:\n${input.slideText}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  return callClaude({
    model: MODELS.matching,
    maxTokens: 1024,
    // Deterministic like extraction: the same template must yield the same slot
    // proposals across onboarding runs.
    temperature: 0,
    system: SYSTEM_PROMPT,
    userContent,
    schema: SlotClassificationSchema,
    label: "slot classification",
    userId: ctx?.userId ?? null,
  });
}
