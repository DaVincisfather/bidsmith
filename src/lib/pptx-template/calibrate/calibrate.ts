import { execFile } from "child_process";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { promisify } from "util";
import type { BidSection } from "@/lib/types";
import { loadTemplate } from "../template-store";
import { loadTemplateProfile, saveTemplateProfile } from "../profile-store";
import { renderFromProfile } from "../render-from-profile";
import { readPptxSlides } from "../introspect/read-pptx";
import type { TemplateProfile } from "../template-profile";
import { fillText } from "./test-prose";
import { planTargets, type CalibrationTarget } from "./plan-targets";
import { finalBudget, initState, step, type SearchState } from "./binary-search";
import { markerOf, verdictFor, type ShapeMeasurement } from "./overflow";
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
  warnings: string[];
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
 * Per-target result from a finished (or maxRounds-exhausted) search state.
 * measured → the shape-level finalBudget is split evenly across the shape's
 * slots; NOT measured → t.initialGuess is ALREADY per-slot (planTargets divides
 * geometric capacity by shareCount), so it is used directly — no second division.
 */
export function buildSlotResult(
  t: CalibrationTarget,
  s: SearchState,
  measured: boolean,
): SlotResult {
  const budget = measured
    ? Math.max(30, Math.floor(finalBudget(s) / t.shareCount / 10) * 10)
    : Math.max(30, Math.floor(t.initialGuess / 10) * 10);
  const warnings: string[] = [];
  if (!measured) warnings.push("marker never measured — geometry fallback");
  // Hit maxRounds before the bracket converged: the budget below is the last
  // proven-fit candidate, not a settled result — surfaced so the CLI can
  // recommend a --max-rounds bump before --write.
  if (measured && !s.done) warnings.push("did not converge within maxRounds — budget is last proven fit");
  // alwaysOverflowed is only meaningful once a state has converged (done) —
  // mid-search / maxRounds-exhausted states are unconverged, not proven-never-fit.
  if (s.done && s.alwaysOverflowed) warnings.push("overflowed at minimum budget — box likely tiny or decorative");
  if (t.geometryMissing && !measured) warnings.push("no geometry either — DEFAULT_GUESS used");
  return {
    token: t.token, budget, rounds: s.rounds,
    method: measured ? ("measured" as const) : ("geometry-fallback" as const),
    shortField: budget <= SHORT_FIELD_MAX_CHARS, warnings,
  };
}

/** Immutable budget patch: results keyed by placeholder, skip-slots untouched. */
export function applyBudgets(profile: TemplateProfile, results: SlotResult[]): TemplateProfile {
  const byToken = new Map(results.map((r) => [r.token, r.budget]));
  return {
    ...profile,
    slides: profile.slides.map((slide) => ({
      ...slide,
      slots: slide.slots.map((slot) => {
        const budget = byToken.get(slot.placeholder);
        return budget === undefined ? slot : { ...slot, budgetChars: budget };
      }),
    })),
  };
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

    const parsed = JSON.parse(await readFile(jsonPath, "utf8")) as { shapes: ShapeMeasurement[] };
    const scales = await readFontScales(await readFile(recalcPath));

    const verdicts = new Map<string, boolean>();
    for (const m of parsed.shapes) {
      const marker = markerOf(m.textPrefix);
      if (!marker) continue;
      seen.add(marker);
      verdicts.set(marker, verdictFor(m, scales.get(marker) ?? null));
    }
    for (const t of targets) {
      const s = states.get(t.token)!;
      if (s.done) continue;
      const v = verdicts.get(t.marker);
      // Not measured this round (marker truncated/shape dropped): freeze on the
      // geometry guess rather than searching blind.
      if (v === undefined) states.set(t.token, { ...s, done: true });
      else states.set(t.token, step(s, v));
    }
    console.log(`round ${round}: ${[...states.values()].filter((s) => s.done).length}/${targets.length} slots converged`);
  }

  const results: SlotResult[] = targets.map((t) =>
    buildSlotResult(t, states.get(t.token)!, seen.has(t.marker)),
  );

  if (opts.write) {
    await saveTemplateProfile(applyBudgets(profile, results));
  }
  return {
    templateId, rounds: round, results,
    unresolved: targets.filter((t) => !seen.has(t.marker)).map((t) => t.token),
  };
}
