import type { BidSection } from "@/lib/types";

/** Total generated prose volume across all generic-prose sections. */
export function totalProseChars(sections: BidSection[]): number {
  let total = 0;
  for (const section of sections) {
    const content = section.content;
    if (content && content.format === "generic-prose") total += content.text.length;
  }
  return total;
}
