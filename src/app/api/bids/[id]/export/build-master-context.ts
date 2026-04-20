import type { RfpAnalysis } from "@/lib/types";
import type { MasterContext } from "@/lib/pptx-template/types";

interface BuildMasterContextInput {
  analysis: RfpAnalysis;
  organizationName: string;
  now: Date;
}

export function buildMasterContext(
  input: BuildMasterContextInput,
): MasterContext {
  return {
    companyName: input.organizationName,
    clientName: input.analysis.client,
    bidName: input.analysis.title,
    // diaryNumber is optional on RfpAnalysis — default to empty string when absent
    diaryNumber: input.analysis.diaryNumber ?? "",
    bidDate: input.now.toISOString().split("T")[0],
  };
}
