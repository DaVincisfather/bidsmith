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

// Client-side shape of a failed bundle as returned by GET /api/bids/[id].
export interface FailedBundle {
  bundle: string;
  error: string;
}
