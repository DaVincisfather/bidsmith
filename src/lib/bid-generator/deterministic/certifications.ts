import type { BidSection } from "@/lib/types";

// Template slide 17 hardcodes the three ISO card titles (ISO 9001 / 27001 / 14001).
// We only need to supply number + validUntil. A future workspace_settings field
// will let the workspace override these; until then the company fills them in
// post-generation in the bid-editor or PPT directly.
export function buildCertificationsSection(): BidSection {
  return {
    type: "data",
    key: "certifications",
    title: "Certifieringar",
    content: {
      format: "certifications",
      certs: [
        { number: "Fyll i certifikatnummer", validUntil: "—" },
        { number: "Fyll i certifikatnummer", validUntil: "—" },
        { number: "Fyll i certifikatnummer", validUntil: "—" },
      ],
    },
    generatedAt: new Date().toISOString(),
  };
}
