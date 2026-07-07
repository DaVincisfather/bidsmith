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

// FAST schema for the batch (slide + re-ask) calls — one array element per
// placeholder, NOT one dynamic object key per placeholder. Live measurements
// (bid 02255bf3-19b7-455d-9cbf-7492dc4bc8da) showed the dynamic-key form pushed
// the structured-outputs grammar past a compile ceiling: even ~12 optional keys
// with long Swedish placeholders ("{Upphandlande organisation}") drew
// NON-retryable 400s — "Schema is too complex." / "Grammar compilation timed
// out." — each after hanging ~185 s. A fixed schema has CONSTANT grammar
// complexity regardless of the template's placeholder names, so it compiles.
//
// BONUS: because the schema is identical for EVERY batch call, its
// `output_config.format` prefix is byte-identical across calls — so the prompt
// cache CAN share that prefix between slide/re-ask calls. (The CLAUDE.md gotcha
// "different schemas never share cache" cut the other way: dynamic per-slide
// keys guaranteed a distinct schema per call and thus a cache miss every time.)
//
// No .min(1) on `text`: the "skriv kortare" rule invites "", and blank must
// degrade to a per-slot re-ask (via sectionsFromRecord's trim gate), not fail
// the whole batch client-side and burn 3 paid retries. A dropped placeholder is
// simply an absent array element — same per-slot re-ask path.
export const GenericProseSectionsSchema = z.object({
  sections: z.array(
    z.object({
      placeholder: z.string(),
      text: z.string(),
    }),
  ),
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

// Max placeholders per batch call. The fixed sections-array schema removed the
// grammar-compilation ceiling that dynamic per-slot keys hit (see
// GenericProseSectionsSchema), so this cap is NO LONGER about schema complexity.
// It stays because attention dilution survives the schema change: a single call
// asked to write 20–30 sections nondeterministically leaves some blank (F6), and
// the cap also bounds prompt size (each placeholder adds a slot line + a JSON
// example element). So a slide's slots are still chunked ≤12 per call
// (orchestration in generate-from-profile.ts).
export const MAX_KEYS_PER_CALL = 12;

// A sibling's intent in the coherence list is context, not a writing brief —
// ~80 chars says what the neighbour covers without the sibling block outgrowing
// the actual work list on a 30-slot slide.
const SIBLING_INTENT_MAX = 80;
function siblingLine(s: GenericProseSlot): string {
  const intent = s.intent || "(ej angivet)";
  const short =
    intent.length > SIBLING_INTENT_MAX ? `${intent.slice(0, SIBLING_INTENT_MAX)}…` : intent;
  return `- "${s.placeholder}": ${short}`;
}

// System prompt for a chunk of a slide's generic-prose slots: lists the chunk's
// slots (placeholder + intent + optional budget) and asks for ONE coherent JSON
// object keyed by placeholder. `siblings` (the slide's OTHER slots, filled by
// other chunk-calls) are named with a truncated intent as coherence context only
// — a bare placeholder name gives the coherence instruction nothing to work
// with — so a chunked slide still reads as one whole. This is what collapses
// ~169 per-slot calls to ~12 per-slide calls (F1 timeout fix,
// notes/2026-07-06-per-slide-generation-plan.md), now chunked
// ≤MAX_KEYS_PER_CALL to survive the API's optional-schema limit.
function slideSystemPrompt(
  slots: GenericProseSlot[],
  siblings: GenericProseSlot[] = [],
): string {
  const slotLines = slots
    .map((s) => {
      const intent = s.intent || "(ej angivet — härled från platshållaren och kontexten)";
      const budget = s.budgetChars ? ` (håll dig inom ca ${s.budgetChars} tecken)` : "";
      return `- "${s.placeholder}": ${intent}${budget}`;
    })
    .join("\n");
  const jsonLines = slots
    .map(
      (s) =>
        `    { "placeholder": "${s.placeholder}", "text": "sammanhängande prosa (\\n\\n mellan stycken)" }`,
    )
    .join(",\n");
  // Empty when the slide fits one chunk → prompt is byte-identical to before.
  const siblingBlock =
    siblings.length > 0
      ? `Övriga sektioner på samma slide (skriv dem INTE här — de fylls i andra anrop — men håll din text koherent med dem):
${siblings.map(siblingLine).join("\n")}
`
      : "";
  return `Du skriver flera sektioner till EN slide i ett svenskt konsultanbud. Sektionerna sitter på
samma slide och ska hänga ihop till en sammanhållen helhet — inte fristående öar. Undvik att
upprepa samma poäng mellan sektionerna.

Sektioner att skriva (ett element i "sections" per sektion):
${slotLines}
${siblingBlock}
${PROSE_VOICE}

Svara med giltig JSON. Fältet "sections" ska ha EXAKT ett element per sektion ovan — inga extra,
inga utelämnade — och varje "placeholder" ska vara EXAKT som angiven (inklusive klamrar):
{
  "sections": [
${jsonLines}
  ]
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
 * Per-CHUNK batch: ONE Sonnet call fills a chunk (≤MAX_KEYS_PER_CALL) of a slide's
 * generic-prose slots. The FIXED sections-array schema (GenericProseSectionsSchema)
 * lets the model write the slots as a coherent whole while the response still maps
 * back to one BidSection per slot — same key/title/placeholder shape as
 * buildGenericProseSection. `siblings` names the slide's other slots (filled by
 * sibling chunk-calls, intent truncated) as coherence context only; they're prompt
 * text, never schema, so the schema is byte-identical on every call.
 *
 * Because the schema is identical across ALL batch calls, its output_config prefix
 * is shared and the prompt cache CAN hit between calls (see
 * GenericProseSectionsSchema). Returns a section only for placeholders with
 * non-empty text; an empty (or omitted) array element is left to the caller to
 * record as a failed SLOT, so one blank answer doesn't sink the chunk. A rejected
 * call — including truncated/invalid JSON, where callClaude throws after its
 * retries — fails the WHOLE chunk (per-slide maxTokens heuristic is a backlogged
 * residual).
 */
export async function buildGenericProseSlideSections(
  slots: GenericProseSlot[],
  ctx: BidContext,
  siblings: GenericProseSlot[] = [],
): Promise<BidSection[]> {
  // Guard the key ceiling HERE, not only in the orchestrator's chunking: the cap
  // no longer guards schema complexity (the fixed schema removed that), but it
  // still bounds prompt size and attention dilution, so a future call site that
  // skips the chunking should fail loud and free before the paid call.
  if (slots.length > MAX_KEYS_PER_CALL) {
    throw new Error(
      `buildGenericProseSlideSections: ${slots.length} slots > MAX_KEYS_PER_CALL (${MAX_KEYS_PER_CALL}) — chunka anropet; ett anrop med för många fält späder ut modellens uppmärksamhet och sväller prompten`,
    );
  }

  const parsed = await callClaude({
    // Same role/effort/budget as the per-slot bundle: Sonnet 5, not Opus — a
    // foreign template can carry 30+ unknown slots and that cost lands on the user.
    model: MODELS.writingGeneric,
    maxTokens: 32000,
    system: slideSystemPrompt(slots, siblings),
    cachedContext: formatContext(ctx),
    userContent: "Generera JSON-payloaden enligt systeminstruktionerna.",
    // Fixed schema (not dynamic keys) → constant grammar complexity + a shared
    // output_config cache prefix across calls. See GenericProseSectionsSchema.
    schema: GenericProseSectionsSchema,
    label: "generic-prose slide bundle",
    effort: "high",
    userId: ctx.userId,
    bidId: ctx.bidId,
  });

  return sectionsFromRecord(recordFromSections(parsed), slots);
}

/** Collapses the fixed-schema `{ sections: [...] }` response into a
 *  placeholder→text Record so the existing sectionsFromRecord/got-has machinery
 *  works unchanged. First element for a placeholder wins (duplicates dropped);
 *  placeholders the model invented that no slot asked for simply sit unused in the
 *  Record — sectionsFromRecord only reads the requested slots, so unknowns are
 *  dropped without a log. `sections` is guaranteed in BOTH output modes —
 *  parseAndValidate runs schema.safeParse even with BIDSMITH_STRUCTURED_OUTPUTS=off
 *  — so the `?? []` below is pure belt-and-braces, never load-bearing. */
function recordFromSections(parsed: z.infer<typeof GenericProseSectionsSchema>): Record<string, string> {
  const record: Record<string, string> = {};
  for (const { placeholder, text } of parsed.sections ?? []) {
    if (!(placeholder in record)) record[placeholder] = text;
  }
  return record;
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
    .map(
      (t) =>
        `    { "placeholder": "${t.slot.placeholder}", "text": "sammanhängande prosa (\\n\\n mellan stycken)" }`,
    )
    .join(",\n");
  // "Skriv allt" och PROSE_VOICE:s "hitta inte på" får inte krocka: tunt underlag
  // ska ge KORT källtrogen text, inte utfyllnad — annars maskerar re-asken genuint
  // omöjliga slots med hallucinerad kundtext (routine-fynd PR #72).
  return `Ett tidigare försök lämnade följande sektioner till ett svenskt konsultanbud TOMMA. Skriv
dem nu — skriv VARJE fält. Om underlaget är tunt för ett fält: skriv kort och källtroget
(2–3 meningar om det som faktiskt finns i förfrågan/teamkontexten) hellre än utfyllt —
men lämna det inte tomt.

Sektioner att fylla (ett element i "sections" per sektion; slide-numret anger var sektionen hör hemma):
${slotLines}

${PROSE_VOICE}

Svara med giltig JSON. Fältet "sections" ska ha EXAKT ett element per sektion ovan — inga extra,
inga utelämnade — och varje "placeholder" ska vara EXAKT som angiven (inklusive klamrar):
{
  "sections": [
${jsonLines}
  ]
}`;
}

/**
 * Batched RE-ASK for slots that came back empty across the whole first wave —
 * ONE Sonnet call over ONLY the empty placeholders (pattern precedent:
 * evidence-guard's single batched re-quote). Concentrating the model on just the
 * misses avoids the attention-dilution that leaves 1–9 of a slide's 20–30 keys
 * blank per run (the export lottery, F6). Same role/effort/budget, the SAME fixed
 * sections-array schema, and the same response→section mapping as
 * buildGenericProseSlideSections, under a distinct cost label — the shared schema
 * means this call's cache prefix matches the slide calls'. Returns a section only
 * for placeholders now non-empty; whatever is still blank is left to the caller to
 * record as a failed SLOT. A rejected call throws — the caller degrades that to
 * per-slot failures without touching the wave-1 sections.
 */
export async function buildGenericProseReaskSections(
  targets: GenericProseReaskTarget[],
  ctx: BidContext,
): Promise<BidSection[]> {
  // Same key-ceiling guard as the slide batch: the re-ask gathers targets across
  // the whole first wave, so an unchunked call site here is the LIKELIER way to
  // fire an oversized prompt. Throw before the paid call.
  if (targets.length > MAX_KEYS_PER_CALL) {
    throw new Error(
      `buildGenericProseReaskSections: ${targets.length} targets > MAX_KEYS_PER_CALL (${MAX_KEYS_PER_CALL}) — chunka anropet; ett anrop med för många fält späder ut modellens uppmärksamhet och sväller prompten`,
    );
  }

  const parsed = await callClaude({
    model: MODELS.writingGeneric,
    maxTokens: 32000,
    system: reaskSystemPrompt(targets),
    cachedContext: formatContext(ctx),
    userContent: "Generera JSON-payloaden enligt systeminstruktionerna.",
    // Same fixed schema as the slide batch (see GenericProseSectionsSchema) — a
    // still-empty or dropped element degrades to a per-slot failure, and the
    // shared schema keeps the cache prefix identical across all batch calls.
    schema: GenericProseSectionsSchema,
    label: "generic-prose re-ask",
    effort: "high",
    userId: ctx.userId,
    bidId: ctx.bidId,
  });

  return sectionsFromRecord(
    recordFromSections(parsed),
    targets.map((t) => t.slot),
  );
}
