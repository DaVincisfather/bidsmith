import type { RfpAnalysis } from "@/lib/types";
import type { MasterContext } from "@/lib/pptx-template/types";

interface BuildMasterContextInput {
  analysis: RfpAnalysis;
  now: Date;
  /** Avsändarens företagsnamn ur aktiv org-profil. Tomt när ingen profil finns
   *  → footer {Bolagsnamn} + cover blir blanka, som tidigare. */
  companyName?: string;
}

export function buildMasterContext(
  input: BuildMasterContextInput,
): MasterContext {
  return {
    companyName: input.companyName ?? "",
    clientName: input.analysis.client,
    bidName: input.analysis.title,
    // diaryNumber is optional on RfpAnalysis — default to empty string when absent
    diaryNumber: input.analysis.diaryNumber ?? "",
    bidDate: new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(input.now),
  };
}
