// Pure profile-level defect logic (onboarding-measure design 2026-07-19).
// The overflow-eval keeps its own frozen copy of the signature predicate
// (src/lib/overflow-eval/gates.ts) — eval behavior must not change.
import type { Finding } from "./types";
import { isAllGenericProfile, type TemplateDefect, type TemplateProfile } from "../template-profile";

export function defectKey(d: Pick<TemplateDefect, "slide" | "checkId" | "shape">): string {
  return `${d.slide}|${d.checkId}|${d.shape}`;
}

/** First-wins dedupe on the signature — original-scan entries take precedence
 *  when the instrumented scan re-finds the same shape (bootstrap order). */
export function dedupeDefects<T extends Pick<TemplateDefect, "slide" | "checkId" | "shape">>(defects: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const d of defects) {
    const key = defectKey(d);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}

/** Operator guidance per check class. `detail` is the measured fact
 *  ("text 43.2pt > box 26pt") — always included so the suggestion stays
 *  anchored to data. Swedish: this is wizard/CLI copy. */
export function defectSuggestion(checkId: string, detail: string): string {
  const base: Record<string, string> = {
    "outside-slide": "Boxen går utanför sliden redan i tom mall — flytta upp eller förminska den i mallen",
    "vertical-overflow": "Boxens statiska innehåll ryms inte i boxhöjden — förhöj eller bredda boxen i mallen",
    "gross-overflow": "Boxen overflowar grovt redan utan genererat innehåll — se över boxens storlek i mallen",
    "horizontal-clip": "Text klipps i sidled i tom mall — bredda boxen eller aktivera radbrytning i mallen",
    "single-line-break": "Enradsbox radbryter redan i tom mall — bredda boxen i mallen",
    "autofit-shrink": "Autofit krymper texten kraftigt redan i tom mall — förstora boxen i mallen",
    deadspace: "Stor tom yta i boxen — överväg att förminska den i mallen",
  };
  const advice = base[checkId] ?? "Granska boxen i mallen";
  return `${advice}, eller acceptera defekten (${detail}).`;
}

export function mergeDefectAccepts(
  previous: TemplateDefect[] | undefined,
  next: TemplateDefect[],
): TemplateDefect[] {
  const accepted = new Set((previous ?? []).filter((d) => d.status === "accepted").map(defectKey));
  return next.map((d) => (accepted.has(defectKey(d)) ? { ...d, status: "accepted" as const } : d));
}

export function acceptDefect(
  defects: TemplateDefect[],
  sig: Pick<TemplateDefect, "slide" | "checkId" | "shape">,
): { ok: true; defects: TemplateDefect[] } | { ok: false; error: string } {
  const key = defectKey(sig);
  if (!defects.some((d) => defectKey(d) === key)) {
    return { ok: false, error: `okänd defektsignatur: slide ${sig.slide} ${sig.checkId} ${sig.shape}` };
  }
  return {
    ok: true,
    defects: defects.map((d) => (defectKey(d) === key ? { ...d, status: "accepted" as const } : d)),
  };
}

/** A gross-overflow defect (eval-side geometry predicate) manifests in
 *  deck:scan as a vertical-overflow finding on the same shape. */
function checkMatches(defectCheckId: string, findingCheckId: string): boolean {
  return defectCheckId === findingCheckId
    || (defectCheckId === "gross-overflow" && findingCheckId === "vertical-overflow");
}

export function annotateKnownDefects(findings: Finding[], defects: TemplateDefect[]): Finding[] {
  const accepted = defects.filter((d) => d.status === "accepted");
  return findings.map((f) => {
    const hit = accepted.find(
      (d) => d.slide === f.slide && d.shape === f.shape && checkMatches(d.checkId, f.checkId),
    );
    if (!hit) return f;
    return { ...f, severity: "INFO" as const, detail: `känd malldefekt: ${f.detail}` };
  });
}

/** Activation gate (design: HARD). Non-foreign profiles always pass — the
 *  bundled template never carries measurement. Swedish: operator-facing copy. */
export function activationBlockReason(profile: TemplateProfile): string | null {
  if (!isAllGenericProfile(profile)) return null;
  if (profile.measurement?.status !== "complete") {
    return "mallen är inte mätt — kör npm run onboarding:measure -- <templateId> --write och försök igen";
  }
  const open = (profile.knownDefects ?? []).filter((d) => d.status === "open").length;
  if (open > 0) {
    return `${open} malldefekt(er) väntar på ställningstagande i hälsorapporten — fixa i mallen eller acceptera`;
  }
  return null;
}
