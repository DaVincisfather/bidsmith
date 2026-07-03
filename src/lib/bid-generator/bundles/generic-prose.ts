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

function systemPrompt(slot: GenericProseSlot): string {
  const budgetLine = slot.budgetChars
    ? `\nLÄNGD: håll dig inom ca ${slot.budgetChars} tecken. Hellre kortare och korrekt än utfyllt.`
    : "";
  return `Du skriver en sektion till ett svenskt konsultanbud.

Sektionens syfte: ${slot.intent || "(ej angivet — härled från platshållaren och kontexten)"}.

Skriv som en erfaren konsult — inte som en AI. Undvik överdrivna adjektiv, abstrakta floskler,
markdown-formatering och upprepade parallella strukturer. Variera meningslängd. Konkret och direkt.

KÄLLMATERIAL-TROHET (HÅRD REGEL):
Skriv ENDAST baserat på vad som faktiskt står i RFP:n och teamkontexten. Hitta INTE på siffror,
organisationsdetaljer, historik eller åtaganden som inte finns i källmaterialet. Om underlaget är
tunt — skriv kortare istället för att fylla ut.${budgetLine}

Svara med giltig JSON:
{
  "text": "sammanhängande prosa i ett eller flera stycken (\\n\\n mellan stycken)"
}`;
}

export async function buildGenericProseSection(
  slot: GenericProseSlot,
  ctx: BidContext,
): Promise<BidSection> {
  const parsed = await callClaude({
    model: MODELS.writing,
    maxTokens: 32000,
    system: systemPrompt(slot),
    cachedContext: formatContext(ctx),
    userContent: "Generera JSON-payloaden enligt systeminstruktionerna.",
    schema: GenericProseBundleSchema,
    label: "generic-prose bundle",
    effort: "max",
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
