import type { BidSection } from "@/lib/types";
import type { TemplateProfile } from "@/lib/pptx-template/template-profile";
import {
  MAX_KEYS_PER_CALL,
  buildGenericProseSlideSections,
  buildGenericProseReaskSections,
  buildGenericProseShortenSections,
  isEnforceableKicker,
  type GenericProseSlot,
  type GenericProseReaskTarget,
  type GenericProseShortenTarget,
} from "./bundles/generic-prose";
import type { BidContext } from "./context";
import { effectiveBudget } from "./budget-rules";

export type { BidContext } from "./context";

/**
 * Profile-driven generation (template-upload slice 5b) — the counterpart to
 * generateAllSections for FOREIGN templates. Their stored profile maps every
 * fillable slot to generic-prose (see onboarding/propose-injection-plan.ts), so
 * there are no specialised bundles to run: we generate one prose section per
 * generic-prose slot instead. renderFromProfile then matches each section back
 * to its placeholder. Routing between this and generateAllSections is the
 * isAllGenericProfile discriminator (template-profile.ts).
 *
 * See notes/2026-07-02-template-upload-architecture.md.
 */

// One paid Sonnet call per CHUNK (was one per slot, then one per slide). A real
// customer template (Radrum: 169 confirmed slots) fired ~169 calls ≈ 8–10 min →
// past Vercel's 300 s ceiling → bid failed "Generation timed out". Batching per
// slide collapses that to ~12 calls; key-chunking (≤MAX_KEYS_PER_CALL) then splits
// a wide slide across a few calls so the API doesn't reject its optional schema
// (see generic-prose.ts). Still cap in-flight CALLS so a wide deck can't fire
// every call at once → 429s that exhaust retries and sink the (partly paid) batch
// — the #52-review lesson, same rationale as the classify-slot chunking.
//
// F5 (wall-clock): 3 gave ~5,9 min for 12 slides > Vercel's 300 s; 6 measured
// 345 s on the Radrum green run (wave 1 ~230 s across two waves + a SERIAL
// re-ask that needed one retry). 12 puts a typical template's entire first wave
// in flight at once — wall ≈ slowest single call (~90–120 s measured) + re-ask
// tail, inside the ceiling even with a retry. Effort/maxTokens stay put —
// quality before speed. Chunking adds calls only for 12+-slot slides, so a
// typical deck's call count is unchanged.
const SLIDE_CONCURRENCY = 12;

// One AI call's generation targets: a chunk (≤MAX_KEYS_PER_CALL) of a slide's
// generic-prose slots, plus that slide's OTHER slots as coherence context
// (placeholder + intent; empty when the slide fits in one chunk).
interface CallJob {
  source: number;
  slots: GenericProseSlot[];
  siblings: GenericProseSlot[];
}

// ≤MAX_KEYS_PER_CALL chunks for the batch waves (re-ask, shorten) — both gather
// targets across the whole deck, so both must key-chunk before calling.
function chunkByCallCeiling<T>(items: T[]): T[][] {
  const chunks: T[][] = [];
  for (let k = 0; k < items.length; k += MAX_KEYS_PER_CALL) {
    chunks.push(items.slice(k, k + MAX_KEYS_PER_CALL));
  }
  return chunks;
}

// Runs `run` over `items` in waves of SLIDE_CONCURRENCY under Promise.allSettled,
// so one call rejecting never rejects its wave-mates. Shared by the wave-1 chunk
// calls and the re-ask chunk calls — the concurrency cap now bounds in-flight
// CALLS, not slides.
async function runInWaves(
  count: number,
  run: (index: number) => Promise<BidSection[]>,
): Promise<PromiseSettledResult<BidSection[]>[]> {
  const settled: PromiseSettledResult<BidSection[]>[] = [];
  for (let i = 0; i < count; i += SLIDE_CONCURRENCY) {
    const wave = Array.from({ length: Math.min(SLIDE_CONCURRENCY, count - i) }, (_, j) =>
      run(i + j),
    );
    settled.push(...(await Promise.allSettled(wave)));
  }
  return settled;
}

export interface FailedSection {
  /** The placeholder the failed slot would have filled (stable identifier). */
  placeholder: string;
  error: string;
}

export interface GenerateFromProfileResult {
  sections: BidSection[];
  // Slots whose generation rejected. Empty on full success. When non-empty,
  // `sections` still holds the slots that succeeded — one failed slot must not
  // discard the (already billed) prose that came back for the others. Mirrors
  // generateAllSections' failedBundles contract.
  failedSections: FailedSection[];
}

/**
 * Generates a BidSection for every generic-prose slot across the profile's
 * slides, batched per SLIDE and then key-chunked (≤MAX_KEYS_PER_CALL per call) —
 * one AI call fills a slide (or a chunk of a wide slide) as a coherent whole;
 * a chunk names its slide's other slots as context so the whole slide still
 * reads together. Slots with status "skip" and non-generic-prose capabilities
 * (static passthrough slides) produce nothing; a slide with no generic-prose
 * slots produces no call.
 *
 * Runs the chunk calls in waves under Promise.allSettled: one call REJECTING
 * (including truncated/invalid JSON — callClaude throws after its retries) fails
 * only THAT chunk's slots (recorded in `failedSections`) while the slide's other
 * chunks and every other slide survive. A call that succeeds but returns an
 * empty string (or drops a key) for a slot does NOT fail it outright: those
 * empties are collected across ALL calls and retried in batched re-ask calls,
 * themselves key-chunked ≤MAX_KEYS_PER_CALL (F6 — a call with many required keys
 * nondeterministically leaves some blank; a focused second pass over only the
 * misses fills them, killing the export lottery). Only slots still empty after
 * the re-ask — or a re-ask chunk's slots if that call rejects — land in
 * `failedSections`. onSectionComplete is invoked sequentially over the produced
 * sections, awaited per call — same contract as generateAllSections.
 */
export async function generateSectionsFromProfile(
  profile: TemplateProfile,
  ctx: BidContext,
  onSectionComplete?: (section: BidSection) => void | Promise<void>,
): Promise<GenerateFromProfileResult> {
  // Group generation targets per slide, then key-chunk each slide into calls of
  // ≤MAX_KEYS_PER_CALL so the API doesn't reject a wide slide's optional schema.
  // Static slides carry no generic-prose slots; skip-status slots are
  // intentionally left blank; a slide left with no targets fires no call.
  const jobs: CallJob[] = [];
  for (const slide of profile.slides) {
    const slots: GenericProseSlot[] = [];
    for (const slot of slide.slots) {
      if (slot.capability !== "generic-prose") continue;
      if (slot.status === "skip") continue;
      const budget = effectiveBudget(slot.budgetChars);
      slots.push({
        placeholder: slot.placeholder,
        intent: slot.intent,
        ...(budget !== undefined ? { budgetChars: budget } : {}),
        ...(slot.singleLine ? { singleLine: true } : {}),
      });
    }
    if (slots.length === 0) continue;
    for (let k = 0; k < slots.length; k += MAX_KEYS_PER_CALL) {
      const chunkSlots = slots.slice(k, k + MAX_KEYS_PER_CALL);
      const chunkKeys = new Set(chunkSlots.map((s) => s.placeholder));
      // Siblings = the slide's other slots (empty when the slide is one chunk, so
      // its prompt is unchanged). Passed as coherence context, not schema keys —
      // the prompt lists their placeholder + truncated intent.
      const siblings = slots.filter((s) => !chunkKeys.has(s.placeholder));
      jobs.push({ source: slide.source, slots: chunkSlots, siblings });
    }
  }

  const sections: BidSection[] = [];
  const failedSections: FailedSection[] = [];
  // Slots that came back empty/missing from a FULFILLED chunk call, gathered
  // across every call for the batched re-ask below (F6). A REJECTED chunk is a
  // different failure (truncation/invalid JSON) and goes straight to
  // failedSections — re-asking a call that couldn't parse buys nothing.
  const reaskTargets: GenericProseReaskTarget[] = [];

  const placeholdersOf = (produced: BidSection[]) =>
    new Set(
      produced
        .map((s) => (s.content?.format === "generic-prose" ? s.content.placeholder : null))
        .filter((p): p is string => p !== null),
    );

  const waveResults = await runInWaves(jobs.length, (idx) =>
    buildGenericProseSlideSections(jobs[idx].slots, ctx, jobs[idx].siblings),
  );
  waveResults.forEach((result, idx) => {
    const job = jobs[idx];
    if (result.status === "fulfilled") {
      const produced = result.value;
      sections.push(...produced);
      // A chunk call can succeed yet answer "" for a slot (the schema allows it —
      // see buildGenericProseSlideSections) or, defensively, drop a key. Collect
      // that slot for the batched re-ask rather than failing it now. NOTE: real
      // truncation makes callClaude throw → the reject branch below.
      const got = placeholdersOf(produced);
      for (const slot of job.slots) {
        if (!got.has(slot.placeholder)) {
          reaskTargets.push({ slot, slideSource: job.source });
        }
      }
    } else {
      // Whole CHUNK rejected → its slots failed; the slide's other chunks and
      // every other slide survive.
      const reason = result.reason;
      const message = reason instanceof Error ? reason.message : String(reason);
      for (const slot of job.slots) {
        failedSections.push({ placeholder: slot.placeholder, error: message });
      }
    }
  });

  // F6 batched re-ask: re-ask the empty slots (pattern precedent: evidence-guard's
  // batched re-quote), itself key-chunked ≤MAX_KEYS_PER_CALL since it can gather
  // many targets across the whole first wave. The chunks run under the same
  // runInWaves/allSettled path as wave 1 — least code, and it isolates re-ask
  // chunks from each other so one rejecting doesn't fell the others. Each chunk
  // fills what it can; a slot still empty afterwards — or a whole chunk's slots
  // if that call rejects — becomes a failedSection, never touching wave-1 sections.
  if (reaskTargets.length > 0) {
    const reaskChunks = chunkByCallCeiling(reaskTargets);
    const reaskResults = await runInWaves(reaskChunks.length, (idx) =>
      buildGenericProseReaskSections(reaskChunks[idx], ctx),
    );
    reaskResults.forEach((result, idx) => {
      const targets = reaskChunks[idx];
      if (result.status === "fulfilled") {
        const refilled = result.value;
        sections.push(...refilled);
        const got = placeholdersOf(refilled);
        for (const { slot } of targets) {
          if (!got.has(slot.placeholder)) {
            failedSections.push({
              placeholder: slot.placeholder,
              error: "tomt eller saknat även efter re-ask",
            });
          }
        }
      } else {
        const reason = result.reason;
        const message = reason instanceof Error ? reason.message : String(reason);
        for (const { slot } of targets) {
          failedSections.push({ placeholder: slot.placeholder, error: message });
        }
      }
    });
  }

  // Kicker-enforcement (design 2026-07-19): single-line prose slots whose text
  // exceeds the SCALED ask (the number the prompt asked for — 129 chars within
  // raw budget 140 still wrapped, smoke 2/slide 11) get ONE batched mechanical
  // shorten pass. Short fields are excluded (value-or-empty rule owns them).
  // Merge is shorter-wins: a blank/longer/rejected answer keeps the wave text,
  // and this pass NEVER records failedSections — worst case is today's output.
  const sectionIndex = new Map<string, number>();
  sections.forEach((s, i) => {
    if (s.content?.format === "generic-prose") sectionIndex.set(s.content.placeholder, i);
  });
  const shortenTargets: GenericProseShortenTarget[] = [];
  for (const job of jobs) {
    for (const slot of job.slots) {
      if (!isEnforceableKicker(slot)) continue;
      const idx = sectionIndex.get(slot.placeholder);
      if (idx === undefined) continue;
      const content = sections[idx].content;
      if (content?.format === "generic-prose" && content.text.length > slot.budgetChars) {
        shortenTargets.push({ slot, currentText: content.text });
      }
    }
  }
  if (shortenTargets.length > 0) {
    const shortenChunks = chunkByCallCeiling(shortenTargets);
    const shortenResults = await runInWaves(shortenChunks.length, (idx) =>
      buildGenericProseShortenSections(shortenChunks[idx], ctx),
    );
    shortenResults.forEach((result) => {
      // Rejected shorten chunk → keep the wave text for its slots, silently.
      if (result.status !== "fulfilled") return;
      for (const shortened of result.value) {
        if (shortened.content?.format !== "generic-prose") continue;
        const idx = sectionIndex.get(shortened.content.placeholder);
        if (idx === undefined) continue;
        const current = sections[idx].content;
        if (current?.format !== "generic-prose") continue;
        const newText = shortened.content.text;
        if (newText.trim().length === 0 || newText.length >= current.text.length) continue;
        sections[idx] = {
          ...sections[idx],
          content: { ...current, text: newText },
        };
      }
    });
  }

  if (onSectionComplete) {
    for (const s of sections) {
      await onSectionComplete(s);
    }
  }

  return { sections, failedSections };
}
