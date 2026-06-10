import type { BidSection } from "@/lib/types";

// References are no longer AI-generated. A fabricated reference assignment in
// a legally binding procurement bid is the costliest hallucination in the
// pipeline — the empty template below is filled in by the consultants, who
// pick the actual reference assignments themselves.

// Swedish RFPs typically ask for at least two reference assignments. The
// bid editor can edit reference fields but not add rows, so this constant
// decides how many slots (= PPTX slides) consultants get to fill.
export const REFERENCE_PLACEHOLDER_COUNT = 2;

function emptyReference() {
  return {
    clientName: "Fyll i kundnamn",
    contextLine: "Fyll i kort kontextrad",
    organisation: "Fyll i organisation",
    startDate: "MM/ÅÅÅÅ",
    endDate: "MM/ÅÅÅÅ",
    scope: "Fyll i uppdragets omfattning",
    contact: {
      name: "Fyll i referensperson",
      titlePhoneEmail: "Titel · telefon · e-post",
    },
    roleAndDelivery: "Fyll i roll och leverans",
    result: "Fyll i resultat",
  };
}

export function buildReferenceSection(): BidSection {
  return {
    type: "data",
    key: "reference-v2",
    title: "Referensuppdrag",
    content: {
      format: "reference-v2",
      references: Array.from({ length: REFERENCE_PLACEHOLDER_COUNT }, emptyReference),
    },
    generatedAt: new Date().toISOString(),
  };
}
