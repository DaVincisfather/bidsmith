import { execFile } from "child_process";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { promisify } from "util";
import type { BidSection } from "@/lib/types";
import { loadTemplate } from "../template-store";
import { loadTemplateProfile, saveTemplateProfile } from "../profile-store";
import { renderFromProfile } from "../render-from-profile";
import { readPptxSlides } from "../introspect/read-pptx";
import type { SlotProfile, TemplateProfile } from "../template-profile";
import { fillText } from "./test-prose";
import { planTargets, type CalibrationTarget } from "./plan-targets";
import { finalBudget, initState, step, type SearchState } from "./binary-search";
import { calibrationVerdict, markerOf } from "../measure/verdicts";
import type { MeasurementFile, CheckId } from "../measure/types";
import { readFontScales } from "./font-scales";
import { SHORT_FIELD_MAX_CHARS } from "@/lib/bid-generator/bundles/generic-prose";

/**
 * Calibration orchestrator (design doc 2026-07-14): renders the instrumented
 * template with per-slot filler prose at a candidate budget, measures overflow
 * via PowerPoint COM (scripts/measure-overflow.ps1), and binary-searches each
 * slot's budget in parallel — every slot advances one step per render round,
 * so the whole deck converges in ~5-7 renders regardless of slot count.
 *
 * calibrateTemplate itself needs PowerPoint COM + Supabase and is exercised
 * live (Task 9), not under vitest; only the pure helpers below are unit-tested.
 */

const execFileAsync = promisify(execFile);
const DEFAULT_MAX_ROUNDS = 8;

export interface SlotResult {
  token: string;
  budget: number;
  rounds: number;
  method: "measured" | "geometry-fallback";
  shortField: boolean;
  /** Geometry fact from the target — persisted to the profile so generation
   *  can enforce single-line slots (kickers) against the scaled ask. */
  singleLine: boolean;
  warnings: string[];
  signals: CheckId[];
}

export interface CalibrationReport {
  templateId: string;
  rounds: number;
  results: SlotResult[];
  /** Markers never found in any measurement — kept on geometry fallback. */
  unresolved: string[];
}

/** One synthetic section per target; a shared shape's candidate is split evenly. */
export function buildCalibrationSections(
  targets: CalibrationTarget[],
  candidates: Map<string, number>,
): BidSection[] {
  const generatedAt = new Date().toISOString();
  return targets.map((t) => {
    const shapeBudget = candidates.get(t.token) ?? t.initialGuess;
    const slotChars = Math.max(1, Math.round(shapeBudget / t.shareCount));
    return {
      type: "ai" as const,
      key: `calibration:${t.token}`,
      title: t.token,
      content: { format: "generic-prose" as const, placeholder: t.token, text: fillText(t.marker, slotChars) },
      generatedAt,
    };
  });
}

/**
 * Honest low-budget rounding. Tens-rounding is presentation sugar for real
 * prose budgets, but below 10 it rounds to 0 — and the old Math.max(30, …)
 * floor then LIED about narrow boxes: a ~3-char label chip got budget 30, the
 * model obediently wrote ~25 chars, and the text letter-stacked through the
 * slide edge (overflow-loop finding A, notes/2026-07-16-overflow-loop-
 * slutrapport.md — 85/137 slots sat at exactly the floor value 30, and the
 * chip subset owned 100 % of the loop's residual FAILs). Small budgets keep
 * their honest value; SHORT_FIELD classification then gives the model
 * "max N tecken: skriv ENDAST värdet" which is exactly right for a chip.
 */
function roundBudget(chars: number): number {
  return chars >= 10 ? Math.floor(chars / 10) * 10 : Math.max(1, Math.round(chars));
}

/**
 * Per-target result from a finished (or maxRounds-exhausted) search state.
 * measured → the shape-level finalBudget is split evenly across the shape's
 * slots; NOT measured → t.initialGuess is ALREADY per-slot (planTargets divides
 * geometric capacity by shareCount), so it is used directly — no second division.
 */
export function buildSlotResult(
  t: CalibrationTarget,
  s: SearchState,
  measured: boolean,
  frozenAtRound?: number,
  signals: CheckId[] = [],
): SlotResult {
  let budget = measured
    ? roundBudget(finalBudget(s) / t.shareCount)
    : roundBudget(t.initialGuess);
  const warnings: string[] = [];
  if (t.singleLine && t.lineCapChars !== null && budget > t.lineCapChars) {
    budget = roundBudget(t.lineCapChars);
    warnings.push(`single-line box — budget capped at one line (${t.lineCapChars} chars)`);
  }
  if (!measured) warnings.push("marker never measured — geometry fallback");
  // Hit maxRounds before the bracket converged: the budget below is the last
  // proven-fit candidate, not a settled result — surfaced so the CLI can
  // recommend a --max-rounds bump before --write.
  if (measured && !s.done) warnings.push("did not converge within maxRounds — budget is last proven fit");
  // A slot that WAS measured but whose marker fell out mid-search (e.g. a
  // BoundHeight throw made the ps1 skip its shape that round) froze with
  // done: true — it is NOT converged, and its bracket may be wide open in
  // either direction. Own warning instead of the misleading pair below:
  // "overflowed at minimum" would lie (it only overflowed at the frozen
  // candidate), and a fit-only freeze would otherwise stay silent while the
  // budget may be far under true capacity (PR #79 review finding).
  const frozen = measured && frozenAtRound !== undefined;
  if (frozen) {
    warnings.push(
      `marker fell out of measurement in round ${frozenAtRound} — budget is last proven fit (may be underestimated)`,
    );
  }
  // alwaysOverflowed is only meaningful once a state has GENUINELY converged —
  // mid-search / maxRounds-exhausted states are unconverged, and a frozen
  // state's done: true is a stop signal, not convergence.
  if (s.done && s.alwaysOverflowed && !frozen) warnings.push("overflowed at minimum budget — box likely tiny or decorative");
  if (t.geometryMissing && !measured) warnings.push("no geometry either — DEFAULT_GUESS used");
  return {
    token: t.token, budget, rounds: s.rounds,
    method: measured ? ("measured" as const) : ("geometry-fallback" as const),
    shortField: budget <= SHORT_FIELD_MAX_CHARS, singleLine: t.singleLine, warnings, signals,
  };
}

/** Immutable slide/slot walker shared by the profile patchers below. */
function mapSlots(
  profile: TemplateProfile,
  patch: (slot: SlotProfile) => SlotProfile,
): TemplateProfile {
  return {
    ...profile,
    slides: profile.slides.map((slide) => ({ ...slide, slots: slide.slots.map(patch) })),
  };
}

/** The ONE home for the flag representation: true written, false strips the
 *  key (never an explicit false) — both writers must agree or profiles diverge
 *  by which tool last touched them. */
function setSingleLine(slot: SlotProfile, on: boolean): SlotProfile {
  const patched: SlotProfile = { ...slot, singleLine: true };
  if (!on) delete patched.singleLine;
  return patched;
}

/** Immutable budget patch: results keyed by placeholder, skip-slots untouched.
 *  Also persists the single-line fact — generation needs it to enforce kicker
 *  slots. */
export function applyBudgets(profile: TemplateProfile, results: SlotResult[]): TemplateProfile {
  const byToken = new Map(results.map((r) => [r.token, r]));
  return mapSlots(profile, (slot) => {
    const result = byToken.get(slot.placeholder);
    if (result === undefined) return slot;
    return setSingleLine({ ...slot, budgetChars: result.budget }, result.singleLine);
  });
}

/** Immutable single-line patch for the backfill path: sets/strips ONLY the
 *  singleLine flag from geometry-planned targets — budgets never move. Slots
 *  without a target this run are left untouched. */
export function applySingleLineFlags(
  profile: TemplateProfile,
  targets: CalibrationTarget[],
): TemplateProfile {
  const byToken = new Map(targets.map((t) => [t.token, t.singleLine]));
  return mapSlots(profile, (slot) => {
    const singleLine = byToken.get(slot.placeholder);
    return singleLine === undefined ? slot : setSingleLine(slot, singleLine);
  });
}

/** True when the profile has at least one calibratable slot — same filter as
 *  planTargets' fillable set (generic-prose, not skip). A table-only or fully
 *  static profile (draft-logic explicitly allows onboarding with only a
 *  confirmed table, foreign-table-matrix design) has none: the onboarding
 *  measurement pass uses this to skip the calibration step instead of calling
 *  calibrateTemplate, which throws loud on zero targets (see below) — that
 *  throw stays intact for the calibrate:budgets CLI, which has no such
 *  table-only case to tolerate. */
export function hasCalibratableSlots(profile: TemplateProfile): boolean {
  return profile.slides.some((slide) =>
    slide.slots.some((slot) => slot.capability === "generic-prose" && slot.status !== "skip"),
  );
}

export async function calibrateTemplate(
  templateId: string,
  opts: { write: boolean; maxRounds?: number; workDir?: string },
): Promise<CalibrationReport> {
  const maxRounds = opts.maxRounds ?? DEFAULT_MAX_ROUNDS;
  const workDir = opts.workDir ?? path.resolve("tmp", "calibrate", templateId);
  await mkdir(workDir, { recursive: true });

  const tpl = await loadTemplate(templateId);
  const profile = await loadTemplateProfile(templateId);
  if (!profile) throw new Error(`template ${templateId} has no stored profile — onboard it first`);

  const instrumented = await readFile(tpl.templateFile);
  const slides = await readPptxSlides(instrumented);
  const targets = planTargets(slides, profile);
  if (targets.length === 0) throw new Error("no calibratable generic-prose slots in profile");

  // One state per TOKEN, but each state tracks the whole SHAPE's fill:
  // buildCalibrationSections divides the candidate by shareCount before filling,
  // and initialGuess is per-slot (planTargets divides capacity by shareCount),
  // so the seed multiplies it back up to a shape budget. On multi-token shapes
  // only the FIRST token's marker leads the shape's text (markerOf anchors to
  // the text start), so 2nd..Nth tokens are never measured — they freeze on the
  // geometry fallback by design (buildSlotResult uses their per-slot guess).
  const states = new Map<string, SearchState>();
  for (const t of targets) states.set(t.token, initState(t.initialGuess * t.shareCount));

  const master = { companyName: "Kalibrering", clientName: "Kalibrering", bidName: "Kalibrering", diaryNumber: "", bidDate: new Date().toISOString().slice(0, 10) };
  const seen = new Set<string>();
  // Tokens frozen because their marker vanished from a round's measurement
  // (round number recorded for the report). Never-seen tokens also land here
  // (frozen round 1) but report as geometry-fallback, not frozen — see
  // buildSlotResult.
  const frozenAt = new Map<string, number>();
  // Union of every check signal observed for a marker across all rounds —
  // shows WHICH check drove the eventual budget, not just that it overflowed.
  const signalsByMarker = new Map<string, Set<CheckId>>();
  let round = 0;

  while (round < maxRounds && [...states.values()].some((s) => !s.done)) {
    round++;
    const candidates = new Map([...states].map(([token, s]) => [token, s.candidate]));
    const sections = buildCalibrationSections(targets, candidates);
    const deck = await renderFromProfile(tpl, profile, sections, master);
    const deckPath = path.join(workDir, `round-${round}.pptx`);
    const jsonPath = path.join(workDir, `round-${round}.json`);
    const recalcPath = path.join(workDir, `round-${round}-recalc.pptx`);
    await writeFile(deckPath, deck);

    await execFileAsync("pwsh", ["-NoProfile", "-File", path.resolve("scripts", "measure-overflow.ps1"),
      "-Pptx", deckPath, "-OutJson", jsonPath, "-RecalcOut", recalcPath]);

    const parsed = JSON.parse(await readFile(jsonPath, "utf8")) as MeasurementFile;
    const scales = await readFontScales(await readFile(recalcPath));

    const verdicts = new Map<string, boolean>();
    for (const m of parsed.shapes) {
      const marker = markerOf(m.textPrefix);
      if (!marker) continue;
      seen.add(marker);
      const v = calibrationVerdict(m, scales.get(marker) ?? null, parsed.slideWidthPt, parsed.slideHeightPt);
      verdicts.set(marker, v.overBudget);
      if (v.signals.length > 0) {
        const acc = signalsByMarker.get(marker) ?? new Set<CheckId>();
        for (const s of v.signals) acc.add(s);
        signalsByMarker.set(marker, acc);
      }
    }
    for (const t of targets) {
      const s = states.get(t.token)!;
      if (s.done) continue;
      const v = verdicts.get(t.marker);
      // Not measured this round (marker truncated/shape dropped): freeze on the
      // geometry guess rather than searching blind.
      if (v === undefined) {
        states.set(t.token, { ...s, done: true });
        frozenAt.set(t.token, round);
      } else {
        states.set(t.token, step(s, v));
      }
    }
    console.log(`round ${round}: ${[...states.values()].filter((s) => s.done).length}/${targets.length} slots converged`);
  }

  const results: SlotResult[] = targets.map((t) =>
    buildSlotResult(t, states.get(t.token)!, seen.has(t.marker), frozenAt.get(t.token), [...(signalsByMarker.get(t.marker) ?? [])]),
  );

  if (opts.write) {
    await saveTemplateProfile(applyBudgets(profile, results));
  }
  return {
    templateId, rounds: round, results,
    unresolved: targets.filter((t) => !seen.has(t.marker)).map((t) => t.token),
  };
}
