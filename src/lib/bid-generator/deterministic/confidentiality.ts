import type { RfpAnalysis, BidSection } from "@/lib/types";

export function buildConfidentialitySection(analysis: RfpAnalysis): BidSection {
  return {
    type: "data",
    key: "confidentiality",
    title: "Sekretess",
    content: {
      format: "confidentiality",
      oslReference: analysis.oslReference ?? "",
      secrecyRows: analysis.secrecyRows,
    },
    generatedAt: new Date().toISOString(),
  };
}
