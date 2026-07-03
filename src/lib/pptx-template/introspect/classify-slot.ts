import { z } from "zod";
import { callClaude } from "@/lib/ai-client";
import { MODELS } from "@/lib/models";
import { CAPABILITY_IDS, type CapabilityId } from "../template-profile";

/**
 * Slot auto-classification (template-upload slice 5). Given a placeholder from an
 * uploaded template we don't recognise (identify-slides couldn't match its
 * slide), propose which content capability should fill it — a known specialised
 * one when the label/context clearly points there, else generic-prose — plus a
 * derived intent and a confidence. This SEEDS the onboarding interview: high
 * confidence → pre-selected, low → flagged for the human to confirm.
 *
 * Classification, not writing — uses the matching model role (Sonnet), so no
 * eval gate. See notes/2026-07-02-template-upload-architecture.md.
 */

export const SlotClassificationSchema = z.object({
  capability: z.enum(CAPABILITY_IDS),
  /** Derived purpose of the slot, fed to generic-prose when that's the pick. */
  intent: z.string().min(1),
  /** high only when the placeholder/context clearly points at the capability. */
  confidence: z.enum(["high", "low"]),
});
export type SlotClassification = z.infer<typeof SlotClassificationSchema>;

export interface ForeignSlotInput {
  /** The pptx placeholder token, e.g. "{Hållbarhetsredogörelse}". */
  placeholder: string;
  /** Static (non-placeholder) text on the same slide — headings/labels that give
   *  the placeholder meaning. Optional, but improves classification. */
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

const SYSTEM_PROMPT = `Du klassificerar en platshållare i en uppladdad svensk anbudsmall.

Välj den capability ur listan nedan som bäst fyller platshållaren, utifrån dess
namn och den omgivande texten på sliden. Om ingen specialiserad capability tydligt
passar — välj "generic-prose" (fri prosa-fallback). Gissa inte en specialiserad
capability på svaga grunder; det är bättre att falla tillbaka på generic-prose.

Härled en kort intent (syftet med sektionen) på svenska, som styr genereringen.
Sätt confidence "high" ENDAST när platshållaren/kontexten tydligt pekar på den
valda capabilityn; annars "low" (flaggas för mänsklig bekräftelse i onboardingen).

Capabilities:
${CAPABILITY_MENU_TEXT}

Svara med giltig JSON:
{ "capability": "<id ur listan>", "intent": "<kort syfte>", "confidence": "high" | "low" }`;

export async function classifyForeignSlot(
  input: ForeignSlotInput,
  ctx?: { userId?: string | null },
): Promise<SlotClassification> {
  const userContent = [
    `Platshållare: ${input.placeholder}`,
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
