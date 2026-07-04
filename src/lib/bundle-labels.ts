// Human-readable Swedish names for the AI bundles, used by the
// partial-generation warnings in the match section and the bid editor.
export const BUNDLE_LABELS_SV: Record<string, string> = {
  understanding: "Förståelse",
  phases: "Faser",
  quality: "Kvalitetssäkring",
  "requirement-matrix": "Kravmatris",
  team: "Team & pris",
  reference: "Referenser",
};

// Client-side shape of a failed generation unit as returned by GET /api/bids/[id].
// Our template fails per BUNDLE; a foreign template (profile path) fails per SLOT
// (placeholder). The failed_bundles jsonb column carries both shapes.
export interface FailedBundle {
  bundle: string;
  error: string;
}
export interface FailedSlot {
  placeholder: string;
  error: string;
}
export type FailedUnit = FailedBundle | FailedSlot;

/** Human-readable name for a failed unit — the Swedish bundle label, or the
 *  placeholder with braces stripped for a foreign-template slot. Routine-fynd
 *  #68: the editor read `f.bundle` on a FailedSlot and rendered empty names
 *  ("2 sektioner kunde inte genereras: , ."). */
export function failedUnitLabel(f: FailedUnit): string {
  if ("bundle" in f) return BUNDLE_LABELS_SV[f.bundle] ?? f.bundle;
  return f.placeholder.replace(/^\{|\}$/g, "");
}
