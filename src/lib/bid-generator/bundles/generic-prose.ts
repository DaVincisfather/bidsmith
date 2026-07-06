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
 * A dynamic schema (one optional string key per placeholder) lets the model
 * write the slots as a coherent whole while the response still maps back to one
 * BidSection per slot — same key/title/placeholder shape as buildGenericProseSection.
 *
 * Distinct schemas per slide never share cache — expected and fine at ~12 calls
 * (see CLAUDE.md). Returns a section only for placeholders with non-empty text;
 * an empty string (or missing key) is left to the caller to record as a failed
 * SLOT, so one blank answer doesn't sink the slide. A rejected call — including
 * truncated/invalid JSON, where callClaude throws after its retries — fails the
 * WHOLE slide (per-slide maxTokens heuristic is a backlogged residual).
 */
export async function buildGenericProseSlideSections(
  slots: GenericProseSlot[],
  ctx: BidContext,
): Promise<BidSection[]> {
  // Deliberately no .min(1): minLength strips out of the API schema anyway, so
  // the model CAN return "" — a min-gate would then fail Zod client-side and
  // burn 3 full-price regenerations before sinking ALL the slide's slots. By
  // accepting "" the empty-answer guard below degrades it to a per-slot failure.
  //
  // .optional() for the same reason a level up: on a wide slide the model can
  // OMIT a key entirely, not just answer "". A required z.string() rejects the
  // whole slide client-side and burns 3 full-price retries before sinking ALL 25
  // slots — measured against a real customer template that dropped 2 of 25 keys.
  // Optional lets a missing key pass validation; sectionsFromRecord then produces
  // no section for it and the orchestrator's got-has check routes that one slot
  // into the batched re-ask (→ at worst a per-SLOT failure, never the slide).
  const shape: Record<string, z.ZodOptional<z.ZodString>> = {};
  for (const slot of slots) shape[slot.placeholder] = z.string().optional();
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

  return sectionsFromRecord(parsed as Record<string, unknown>, slots);
}

/** Maps a keyed AI response back to one BidSection per slot, dropping slots the
 *  model answered blank (or omitted) — those are left to the caller to record.
 *  Same section shape as buildGenericProseSection; shared by the slide batch and
 *  the re-ask batch so both map responses identically. This is the SINGLE
 *  empty-decision point: the orchestrator's re-ask collection and its
 *  post-re-ask merge both derive from which sections this produces. */
function sectionsFromRecord(
  record: Record<string, unknown>,
  slots: GenericProseSlot[],
): BidSection[] {
  const generatedAt = new Date().toISOString();
  const sections: BidSection[] = [];
  for (const slot of slots) {
    const text = record[slot.placeholder];
    // Empty answer (the "skriv kortare" rule invites "") or a missing key →
    // produce no section; the orchestrator re-asks / records that slot as
    // failed. Trimmed for DETECTION only — "\n  " is as blank on the slide as
    // "" and must not dodge the re-ask; the stored text stays as the model
    // wrote it (wave-1 sections have never trimmed content).
    if (typeof text !== "string" || text.trim().length === 0) continue;
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

/** A slot that came back empty from wave 1, carried into the re-ask with a note
 *  of which source slide it sat on so the prompt can situate it. */
export interface GenericProseReaskTarget {
  slot: GenericProseSlot;
  /** 1-based source slide the empty slot belongs to (re-ask context line). */
  slideSource: number;
}

// System prompt for the batched RE-ASK: the slots listed here came back empty
// from their first (per-slide) attempt. It lists each one with its intent + the
// slide it belongs to and insists EVERY field be filled with substantial content
// — a focused second pass over only the misses, so 20–30 keys per slide no
// longer dilute the model's attention (F6, notes/2026-07-06-onboarding-…). Same
// no-hallucination contract via PROSE_VOICE.
function reaskSystemPrompt(targets: GenericProseReaskTarget[]): string {
  const slotLines = targets
    .map((t) => {
      const intent =
        t.slot.intent || "(ej angivet — härled från platshållaren och kontexten)";
      const budget = t.slot.budgetChars
        ? ` (håll dig inom ca ${t.slot.budgetChars} tecken)`
        : "";
      return `- "${t.slot.placeholder}" (slide ${t.slideSource}): ${intent}${budget}`;
    })
    .join("\n");
  const jsonLines = targets
    .map((t) => `  "${t.slot.placeholder}": "sammanhängande prosa (\\n\\n mellan stycken)"`)
    .join(",\n");
  // "Skriv allt" och PROSE_VOICE:s "hitta inte på" får inte krocka: tunt underlag
  // ska ge KORT källtrogen text, inte utfyllnad — annars maskerar re-asken genuint
  // omöjliga slots med hallucinerad kundtext (routine-fynd PR #72).
  return `Ett tidigare försök lämnade följande sektioner till ett svenskt konsultanbud TOMMA. Skriv
dem nu — skriv VARJE fält. Om underlaget är tunt för ett fält: skriv kort och källtroget
(2–3 meningar om det som faktiskt finns i förfrågan/teamkontexten) hellre än utfyllt —
men lämna det inte tomt.

Sektioner att fylla (en per nyckel i svaret; slide-numret anger var sektionen hör hemma):
${slotLines}

${PROSE_VOICE}

Svara med giltig JSON med EXAKT dessa nycklar (en sträng per sektion):
{
${jsonLines}
}`;
}

/**
 * Batched RE-ASK for slots that came back empty across the whole first wave —
 * ONE Sonnet call over ONLY the empty placeholders (pattern precedent:
 * evidence-guard's single batched re-quote). Concentrating the model on just the
 * misses avoids the attention-dilution that leaves 1–9 of a slide's 20–30 keys
 * blank per run (the export lottery, F6). Same role/effort/budget and same
 * response→section mapping as buildGenericProseSlideSections, under a distinct
 * cost label. Returns a section only for placeholders now non-empty; whatever is
 * still blank is left to the caller to record as a failed SLOT. A rejected call
 * throws — the caller degrades that to per-slot failures without touching the
 * wave-1 sections.
 */
export async function buildGenericProseReaskSections(
  targets: GenericProseReaskTarget[],
  ctx: BidContext,
): Promise<BidSection[]> {
  // No .min(1) and .optional(), same reasoning as the slide batch: accepting ""
  // OR a dropped key lets a still-empty answer degrade to a per-slot failure
  // instead of rejecting the whole re-ask client-side and burning paid retries.
  // A partial re-ask response must fail only the slots it left out, never the
  // ones it filled.
  const shape: Record<string, z.ZodOptional<z.ZodString>> = {};
  for (const t of targets) shape[t.slot.placeholder] = z.string().optional();
  const schema = z.object(shape);

  const parsed = await callClaude({
    model: MODELS.writingGeneric,
    maxTokens: 32000,
    system: reaskSystemPrompt(targets),
    cachedContext: formatContext(ctx),
    userContent: "Generera JSON-payloaden enligt systeminstruktionerna.",
    schema,
    label: "generic-prose re-ask",
    effort: "high",
    userId: ctx.userId,
    bidId: ctx.bidId,
  });

  return sectionsFromRecord(
    parsed as Record<string, unknown>,
    targets.map((t) => t.slot),
  );
}
