import type { RfpAnalysis, BidSection } from "@/lib/types";

export function buildCoverSection(analysis: RfpAnalysis): BidSection {
  return {
    type: "data",
    key: "cover",
    title: "Framsida",
    content: {
      format: "cover",
      title: analysis.title,
      client: analysis.client,
      date: new Date().toISOString().split("T")[0],
    },
    generatedAt: new Date().toISOString(),
  };
}
