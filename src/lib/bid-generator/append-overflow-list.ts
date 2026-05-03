import type { OverflowFlag } from "@/lib/pptx-template/budget-types";

export function appendOverflowList(prompt: string, overflows: OverflowFlag[]): string {
  if (overflows.length === 0) return prompt;

  const lines = overflows.map(
    (o) => `- ${o.fieldLabel}: ${o.length}/${o.budget} tecken — för långt`,
  );

  return `${prompt}

KORRIGERING NÖDVÄNDIG: ditt föregående svar överskred TEXT-LIMITS för dessa fält:
${lines.join("\n")}

Skriv om dem kortare. Komprimera, dela inte. Behåll övrig struktur intakt.`;
}
