import { z } from "zod";
import { callClaude } from "@/lib/ai-client";
import { MODELS } from "@/lib/models";
import type { BidSection } from "@/lib/types";
import { formatContext, type BidContext } from "../context";

/**
 * Generic-prose bundle (template-upload slice 4) — the fallback generator for a
 * template slot we have no specialised bundle for. Given the slot's derived
 * `intent` + the bid context + an optional character budget, it writes source-
 * faithful prose. This is what makes arbitrary uploaded templates renderable:
 * known sections keep their specialised bundles; everything else falls here.
 *
 * Isolated mechanism only — NOT yet wired into generateAllSections. The
 * orchestrator becomes profile-aware once onboarding produces a real foreign
 * profile to drive it (slice 5). See
 * notes/2026-07-02-template-upload-architecture.md.
 */

export const GenericProseBundleSchema = z.object({
  text: z.string().min(1),
});

export interface GenericProseSlot {
  /** The pptx placeholder this prose fills, e.g. "{Hållbarhetsredogörelse}". */
  placeholder: string;
  /** Derived/confirmed purpose of the slot — the only section-specific steering
   *  the generic generator gets. */
  intent: string;
  /** Character budget from the slot geometry, when known. */
  budgetChars?: number;
}

// Shared voice + source-fidelity contract — identical for the per-slot fallback
// and the per-slide batch, so the slide variant reuses (not reinvents) the tone
// and the hard no-hallucination rule.
const PROSE_VOICE = `Skriv som en erfaren konsult — inte som en AI. Undvik överdrivna adjektiv, abstrakta floskler,
markdown-formatering och upprepade parallella strukturer. Variera meningslängd. Konkret och direkt.

KÄLLMATERIAL-TROHET (HÅRD REGEL):
Skriv ENDAST baserat på vad som faktiskt står i RFP:n och teamkontexten. Hitta INTE på siffror,
organisationsdetaljer, historik eller åtaganden som inte finns i källmaterialet. Om underlaget är
tunt — skriv kortare istället för att fylla ut.`;

function systemPrompt(slot: GenericProseSlot): string {
  const budgetLine = slot.budgetChars
    ? `\nLÄNGD: håll dig inom ca ${slot.budgetChars} tecken. Hellre kortare och korrekt än utfyllt.`
    : "";
  return `Du skriver en sektion till ett svenskt konsultanbud.

Sektionens syfte: ${slot.intent || "(ej angivet — härled från platshållaren och kontexten)"}.

${PROSE_VOICE}${budgetLine}

Svara med giltig JSON:
{
  "text": "sammanhängande prosa i ett eller flera stycken (\\n\\n mellan stycken)"
}`;
}

// System prompt for a whole SLIDE at once: lists every generic-prose slot on the
// slide (placeholder + intent + optional budget) and asks for ONE coherent JSON
// object keyed by placeholder. This is what collapses ~169 per-slot calls to
// ~12 per-slide calls (F1 timeout fix, notes/2026-07-06-per-slide-generation-plan.md).
function slideSystemPrompt(slots: GenericProseSlot[]): string {
  const slotLines = slots
    .map((s) => {
      const intent = s.intent || "(ej angivet — härled från platshållaren och kontexten)";
      const budget = s.budgetChars ? ` (håll dig inom ca ${s.budgetChars} tecken)` : "";
      return `- "${s.placeholder}": ${intent}${budget}`;
    })
    .join("\n");
  const jsonLines = slots
    .map((s) => `  "${s.placeholder}": "sammanhängande prosa (\\n\\n mellan stycken)"`)
    .join(",\n");
  return `Du skriver flera sektioner till EN slide i ett svenskt konsultanbud. Sektionerna sitter på
samma slide och ska hänga ihop till en sammanhållen helhet — inte fristående öar. Undvik att
upprepa samma poäng mellan sektionerna.

Sektioner att skriva (en per nyckel i svaret):
${slotLines}

${PROSE_VOICE}

Svara med giltig JSON med EXAKT dessa nycklar (en sträng per sektion):
{
${jsonLines}
}`;
}

export async function buildGenericProseSection(
  slot: GenericProseSlot,
  ctx: BidContext,
): Promise<BidSection> {
  const parsed = await callClaude({
    // Egen roll (inte MODELS.writing): fallbacken kör Sonnet 5 — en främmande
    // mall kan ha 30+ okända slots per anbud, Opus-pris där bärs av användaren.
    model: MODELS.writingGeneric,
    maxTokens: 32000,
    system: systemPrompt(slot),
    cachedContext: formatContext(ctx),
    userContent: "Generera JSON-payloaden enligt systeminstruktionerna.",
    schema: GenericProseBundleSchema,
    label: "generic-prose bundle",
    // "high", inte "max": fallback-prosa på Sonnet 5 — max är benäget till
    // overthinking, och vid 30+ okända slots per anbud är det reell
    // användarkostnad (routine-review #53).
    effort: "high",
    userId: ctx.userId,
    bidId: ctx.bidId,
  });

  return {
    type: "ai",
    key: `generic-prose:${slot.placeholder}`,
    title: slot.intent || slot.placeholder,
    content: {
      format: "generic-prose",
      placeholder: slot.placeholder,
      text: parsed.text,
    },
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Per-SLIDE batch: ONE Sonnet call fills every generic-prose slot on a slide.
 * A dynamic schema (one required string key per placeholder) lets the model
 * write the slots as a coherent whole while the response still maps back to one
 * BidSection per slot — same key/title/placeholder shape as buildGenericProseSection.
 *
 * Distinct schemas per slide never share cache — expected and fine at ~12 calls
 * (see CLAUDE.md). Returns a section only for placeholders present in the
 * response; a dropped key (truncation past the required schema) is left to the
 * caller to record as a failed slot, so one missing key doesn't sink the slide.
 */
export async function buildGenericProseSlideSections(
  slots: GenericProseSlot[],
  ctx: BidContext,
): Promise<BidSection[]> {
  const shape: Record<string, z.ZodString> = {};
  for (const slot of slots) shape[slot.placeholder] = z.string().min(1);
  const schema = z.object(shape);

  const parsed = await callClaude({
    // Same role/effort/budget as the per-slot bundle: Sonnet 5, not Opus — a
    // foreign template can carry 30+ unknown slots and that cost lands on the user.
    model: MODELS.writingGeneric,
    maxTokens: 32000,
    system: slideSystemPrompt(slots),
    cachedContext: formatContext(ctx),
    userContent: "Generera JSON-payloaden enligt systeminstruktionerna.",
    schema,
    label: "generic-prose slide bundle",
    effort: "high",
    userId: ctx.userId,
    bidId: ctx.bidId,
  });

  const record = parsed as Record<string, unknown>;
  const generatedAt = new Date().toISOString();
  const sections: BidSection[] = [];
  for (const slot of slots) {
    const text = record[slot.placeholder];
    if (typeof text !== "string" || text.length === 0) continue;
    sections.push({
      type: "ai",
      key: `generic-prose:${slot.placeholder}`,
      title: slot.intent || slot.placeholder,
      content: {
        format: "generic-prose",
        placeholder: slot.placeholder,
        text,
      },
      generatedAt,
    });
  }
  return sections;
}
