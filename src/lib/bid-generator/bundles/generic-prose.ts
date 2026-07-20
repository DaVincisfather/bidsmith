import { z } from "zod";
import { callClaude } from "@/lib/ai-client";
import { MODELS } from "@/lib/models";
import type { BidSection } from "@/lib/types";
import { formatContext, type BidContext } from "../context";
import { isShortBudget, SHORT_FIELD_MAX_CHARS } from "../short-field";

/**
 * Generic-prose bundle (template-upload slice 4) — the fallback generator for a
 * template slot we have no specialised bundle for. Given the slot's derived
 * `intent` + the bid context + an optional character budget, it writes source-
 * faithful prose. This is what makes arbitrary uploaded templates renderable:
 * known sections keep their specialised bundles; everything else falls here.
 * The generate-from-profile orchestrator drives this via the batched
 * slide/re-ask/shorten calls below. See
 * notes/2026-07-02-template-upload-architecture.md.
 */

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
  /** The box holds exactly one line (a kicker): the prompt states the budget
   *  as a hard cap, and generation enforces it mechanically after the fact. */
  singleLine?: boolean;
}

export { SHORT_FIELD_MAX_CHARS };

export function isShortField(slot: GenericProseSlot): boolean {
  return isShortBudget(slot.budgetChars);
}

/** A wide single-line kicker: prose-classed (not a short field) with a known
 *  budget in a one-line box. The EN RAD hard-cap promise in the prompt
 *  (slotLine) and the mechanical shorten pass (generate-from-profile) MUST
 *  agree on this class — one predicate so they can't drift apart. */
export function isEnforceableKicker(
  slot: GenericProseSlot,
): slot is GenericProseSlot & { budgetChars: number } {
  return slot.singleLine === true && slot.budgetChars !== undefined && !isShortField(slot);
}

// Shared voice + source-fidelity contract — identical for the per-slot fallback
// and the per-slide batch, so the slide variant reuses (not reinvents) the tone
// and the hard no-hallucination rule.
const PROSE_VOICE = `Skriv som en erfaren konsult — inte som en AI. Undvik överdrivna adjektiv, abstrakta floskler,
markdown-formatering och upprepade parallella strukturer. Variera meningslängd. Konkret och direkt.

KÄLLMATERIAL-TROHET (HÅRD REGEL):
Skriv ENDAST baserat på vad som faktiskt står i RFP:n och teamkontexten. Hitta INTE på siffror,
organisationsdetaljer, historik eller åtaganden som inte finns i källmaterialet. Om underlaget är
tunt — skriv kortare istället för att fylla ut.

ETT STYCKE (HÅRD REGEL):
Varje sektion skrivs som ETT sammanhängande stycke — inga radbrytningar, inga tomma rader,
inga punktlistor. Textrutorna är kalibrerade för löpande text: varje radbrytning kostar
höjd som inte finns och trycker texten utanför rutan.`;

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

// Slot line, shared by slideSystemPrompt and reaskSystemPrompt: a short field
// (budgetChars <= SHORT_FIELD_MAX_CHARS) is a VALUE, not prose — the model must
// write the bare value or "" when the source lacks it, never apology prose
// (routine-fynd 2026-07-07: {Diarienummer} came back with 130 chars of prose
// instead of a diary number). Prose slots keep the plain intent+budget line.
// `suffix` lets the re-ask insert its "(slide N)" annotation right after the
// placeholder, before the colon, without duplicating the branching logic.
function slotLine(s: GenericProseSlot, suffix = ""): string {
  const intent = s.intent || "(ej angivet — härled från platshållaren och kontexten)";
  if (isShortField(s)) {
    return `- "${s.placeholder}"${suffix}: ${intent} — KORTFÄLT (max ${s.budgetChars} tecken): skriv ENDAST värdet (t.ex. ett namn, datum eller nummer), ALDRIG meningar eller förklaringar. Saknas uppgiften i underlaget: lämna tomt ("").`;
  }
  // A wide single-line kicker: any wrap overflows, so the budget is a hard cap
  // — the soft "ca"-ask reads as negotiable and the model overshoots ~1.1-1.25x
  // (overflow-loop finding, notes/2026-07-16-overflow-loop-slutrapport.md).
  if (isEnforceableKicker(s)) {
    return `- "${s.placeholder}"${suffix}: ${intent} — EN RAD (hård gräns, max ${s.budgetChars} tecken): en kort kärnfras utan radbrytning; överskrid ALDRIG ${s.budgetChars} tecken.`;
  }
  const budget = s.budgetChars ? ` (håll dig inom ca ${s.budgetChars} tecken)` : "";
  return `- "${s.placeholder}"${suffix}: ${intent}${budget}`;
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
  const slotLines = slots.map((s) => slotLine(s)).join("\n");
  const jsonLines = slots
    .map(
      (s) =>
        `    { "placeholder": "${s.placeholder}", "text": "sammanhängande prosa i ETT stycke, utan radbrytningar" }`,
    )
    .join(",\n");
  // Empty when the slide fits one chunk → prompt is byte-identical to before.
  const siblingBlock =
    siblings.length > 0
      ? `Övriga sektioner på samma slide (skriv dem INTE här — de fylls i andra anrop — men håll din text koherent med dem):
${siblings.map(siblingLine).join("\n")}
`
      : "";
  // Only when this prompt covers 2+ sections (this chunk's slots + its
  // siblings) — nine near-identical "Om oss" paragraphs on one slide is a
  // distinct failure from timeout/blank (routine-fynd 2026-07-07): siblings
  // don't divide the work unless told to. A single-section prompt has no
  // sibling to divide work with, so the block would be dead weight — and
  // omitting it keeps that prompt byte-identical to before this change.
  const divisionBlock =
    slots.length + siblings.length > 1
      ? `Sektioner med LIKNANDE syfte ska KOMPLETTERA varandra, inte upprepa: ge varje
sektion en EGEN tydlig vinkel (t.ex. historik, arbetssätt, värdegrund) och upprepa ingen mening
eller poäng mellan sektionerna.
`
      : "";
  return `Du skriver flera sektioner till EN slide i ett svenskt konsultanbud. Sektionerna sitter på
samma slide och ska hänga ihop till en sammanhållen helhet — inte fristående öar. Undvik att
upprepa samma poäng mellan sektionerna.

Sektioner att skriva (ett element i "sections" per sektion):
${slotLines}
${siblingBlock}${divisionBlock}
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
 * Per-CHUNK batch: ONE Sonnet call fills a chunk (≤MAX_KEYS_PER_CALL) of a slide's
 * generic-prose slots. The FIXED sections-array schema (GenericProseSectionsSchema)
 * lets the model write the slots as a coherent whole while the response still maps
 * back to one BidSection per slot (generic-prose format, key `generic-prose:{...}`).
 * `siblings` names the slide's other slots (filled by
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
  return callProseBatch(
    {
      fnName: "buildGenericProseSlideSections",
      system: slideSystemPrompt(slots, siblings),
      label: "generic-prose slide bundle",
      maxTokens: 32000,
      effort: "high",
      withBidContext: true,
    },
    slots,
    ctx,
  );
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
 *  Shared by the slide batch and
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
    // for a PROSE slot, produce no section; the orchestrator re-asks / records
    // that slot as failed. Trimmed for DETECTION only — "\n  " is as blank on
    // the slide as "" and must not dodge the re-ask; the stored text stays as
    // the model wrote it (wave-1 sections have never trimmed content).
    const blank = typeof text !== "string" || text.trim().length === 0;
    if (blank && !isShortField(slot)) continue;
    sections.push({
      type: "ai",
      key: `generic-prose:${slot.placeholder}`,
      title: slot.intent || slot.placeholder,
      content: {
        format: "generic-prose",
        placeholder: slot.placeholder,
        // Blank short field: emit "" so the applicator blanks the token
        // instead of leaving a raw {placeholder} visible, and the orchestrator
        // neither re-asks nor fails it — empty IS the correct answer for a
        // short field the source material doesn't cover (design doc 2026-07-14).
        text: blank ? "" : (text as string),
      },
      generatedAt,
    });
  }
  return sections;
}

// Shared scaffold for every batched generic-prose call (slide bundle, re-ask,
// shorten): the key-ceiling guard, the callClaude invocation with the FIXED
// sections-array schema, and the response→section mapping. Centralizing this is
// what actually guarantees the "same schema ⇒ shared output_config cache
// prefix" property the builders' comments rely on — previously held only by
// copy-discipline across three near-identical bodies. Writing passes ship the
// bid context + effort "high"; mechanical passes omit both (see
// buildGenericProseShortenSections for why).
interface ProseBatchCall {
  /** Caller name for the guard's error message. */
  fnName: string;
  system: string;
  label: string;
  maxTokens: number;
  /** Omitted ⇒ no effort param sent (thinking off) — for mechanical passes. */
  effort?: "high";
  /** Writing passes ship formatContext(ctx) as the cached system block. */
  withBidContext: boolean;
}

async function callProseBatch(
  call: ProseBatchCall,
  slots: GenericProseSlot[],
  ctx: BidContext,
): Promise<BidSection[]> {
  // Guard the key ceiling HERE, not only in the orchestrator's chunking: the cap
  // no longer guards schema complexity (the fixed schema removed that), but it
  // still bounds prompt size and attention dilution, so a call site that skips
  // the chunking fails loud and free BEFORE the paid call.
  if (slots.length > MAX_KEYS_PER_CALL) {
    throw new Error(
      `${call.fnName}: ${slots.length} slots > MAX_KEYS_PER_CALL (${MAX_KEYS_PER_CALL}) — chunka anropet; ett anrop med för många fält späder ut modellens uppmärksamhet och sväller prompten`,
    );
  }

  const parsed = await callClaude({
    // Same role for every batch pass: Sonnet 5, not Opus — a foreign template
    // can carry 30+ unknown slots and that cost lands on the user.
    model: MODELS.writingGeneric,
    maxTokens: call.maxTokens,
    system: call.system,
    ...(call.withBidContext ? { cachedContext: formatContext(ctx) } : {}),
    userContent: "Generera JSON-payloaden enligt systeminstruktionerna.",
    // Fixed schema (not dynamic keys) → constant grammar complexity + a shared
    // output_config cache prefix across calls. See GenericProseSectionsSchema.
    schema: GenericProseSectionsSchema,
    label: call.label,
    ...(call.effort !== undefined ? { effort: call.effort } : {}),
    userId: ctx.userId,
    bidId: ctx.bidId,
  });

  return sectionsFromRecord(recordFromSections(parsed), slots);
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
    .map((t) => slotLine(t.slot, ` (slide ${t.slideSource})`))
    .join("\n");
  const jsonLines = targets
    .map(
      (t) =>
        `    { "placeholder": "${t.slot.placeholder}", "text": "sammanhängande prosa i ETT stycke, utan radbrytningar" }`,
    )
    .join(",\n");
  // "Skriv allt" och PROSE_VOICE:s "hitta inte på" får inte krocka: tunt underlag
  // ska ge KORT källtrogen text, inte utfyllnad — annars maskerar re-asken genuint
  // omöjliga slots med hallucinerad kundtext (routine-fynd PR #72). KORTFÄLT-raden
  // (slotLine) ber redan om tomt-vid-saknad, men "skriv VARJE fält" nedan är en
  // generell demand — undantaget säger uttryckligen att den inte gäller KORTFÄLT.
  // Only stated when the batch actually contains a KORTFÄLT target — an all-prose
  // re-ask has nothing to except, and the sentence would be dead weight (and
  // would break byte-identity with the pre-branch prompt for that common case).
  const exceptionLine = targets.some((t) => isShortField(t.slot))
    ? " Undantag: rader märkta KORTFÄLT får lämnas tomma när uppgiften saknas."
    : "";
  return `Ett tidigare försök lämnade följande sektioner till ett svenskt konsultanbud TOMMA. Skriv
dem nu — skriv VARJE fält. Om underlaget är tunt för ett fält: skriv kort och källtroget
(2–3 meningar om det som faktiskt finns i förfrågan/teamkontexten) hellre än utfyllt —
men lämna det inte tomt.${exceptionLine}

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
  return callProseBatch(
    {
      fnName: "buildGenericProseReaskSections",
      system: reaskSystemPrompt(targets),
      label: "generic-prose re-ask",
      maxTokens: 32000,
      effort: "high",
      withBidContext: true,
    },
    targets.map((t) => t.slot),
    ctx,
  );
}

/** A single-line (kicker) slot whose wave text exceeded the scaled ask, carried
 *  into the mechanical shorten pass with the text to compress. The slot's
 *  budgetChars is the SCALED ask (effectiveBudget) — the hard cap. */
export interface GenericProseShortenTarget {
  slot: GenericProseSlot;
  currentText: string;
}

// System prompt for the batched SHORTEN pass (kicker-enforcement, design
// 2026-07-19): every listed slot is a single-line box whose text wraps — the
// task is compression of the given text, not new writing. Hard cap at the
// scaled ask; whole phrases only (same no-mid-sentence rule as shorten-field);
// no new facts — the wave text is the only source.
function shortenSystemPrompt(targets: GenericProseShortenTarget[]): string {
  const slotLines = targets
    .map(
      (t) =>
        `${slotLine(t.slot)}\n  NUVARANDE TEXT (${t.currentText.length} tecken — för lång): ${t.currentText}`,
    )
    .join("\n");
  const jsonLines = targets
    .map(
      (t) =>
        `    { "placeholder": "${t.slot.placeholder}", "text": "komprimerad enradstext inom maxgränsen" }`,
    )
    .join(",\n");
  return `Följande enradsrubriker i ett svenskt konsultanbud är för långa för sina textrutor —
texten radbryts och trycks utanför rutan. Komprimera VARJE text till högst sitt angivna
maxantal tecken. Behåll kärnbudskapet, stryk hellre bisatser och utfyllnad. Hela fraser —
hugg aldrig av mitt i en mening. Inga nya fakta: texten nedan är enda källan.

Rubriker att korta:
${slotLines}

Svara med giltig JSON. Fältet "sections" ska ha EXAKT ett element per rubrik ovan — inga extra,
inga utelämnade — och varje "placeholder" ska vara EXAKT som angiven (inklusive klamrar):
{
  "sections": [
${jsonLines}
  ]
}`;
}

/**
 * Batched mechanical SHORTEN for single-line slots over the scaled ask (kicker-
 * enforcement). Same fixed schema, chunk ceiling, and response→section mapping
 * as the other batch calls, under its own cost label. Returns sections only for
 * placeholders answered non-blank — the caller applies its merge policy
 * (shorter-wins, originals kept otherwise) and NEVER records failures from this
 * pass: a rejected call degrades to keeping the wave text.
 */
export async function buildGenericProseShortenSections(
  targets: GenericProseShortenTarget[],
  ctx: BidContext,
): Promise<BidSection[]> {
  // Mechanical compression, not writing — mirror shorten-field's cost profile:
  // no effort (thinking off), a tight output cap (≤12 kickers is well under 4k
  // tokens, while 32000 would put the format-retry budget at ~80k output
  // tokens), and no bid context — the prompt forbids new facts, so shipping
  // the context buys nothing.
  return callProseBatch(
    {
      fnName: "buildGenericProseShortenSections",
      system: shortenSystemPrompt(targets),
      label: "generic-prose shorten",
      maxTokens: 4000,
      withBidContext: false,
    },
    targets.map((t) => t.slot),
    ctx,
  );
}
