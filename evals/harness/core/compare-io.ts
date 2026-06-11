// evals/harness/core/compare-io.ts
// Delad dump-läsning och par-byggnad för jämförelserunnern OCH rapportskriptet —
// blindgranskningen måste döma EXAKT samma par/texter som judge-tallyn, så
// logiken får inte finnas i två kopior som kan glida isär.
import fs from "fs/promises";
import path from "path";
import type { BidSection } from "@/lib/types";
import { renderSectionText, WRITING_SECTION_KEYS } from "./compare-core";
import type { ComparePair } from "./compare-report";

export interface CompareDump {
  model: string;
  fixtureId: string;
  rep: number;
  startedAt: string;
  finishedAt: string;
  overflowCount?: number;
  sections: BidSection[];
}

// Sorterade filnamn — readdir-ordning är plattformsberoende och par-id:n i
// blindgranskningen måste vara reproducerbara mellan körningar och maskiner.
export async function readDumps(model: string): Promise<Map<string, CompareDump>> {
  const dir = path.resolve("evals/runs/compare", model);
  const out = new Map<string, CompareDump>();
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  for (const f of files) {
    try {
      out.set(f, JSON.parse(await fs.readFile(path.join(dir, f), "utf-8")));
    } catch (e) {
      // Trunkerad dump (dödat barn mitt i skrivning) ska peka ut filen,
      // inte krascha hela fasen anonymt.
      throw new Error(`Korrupt dump ${model}/${f} — radera och kör om barnet (${e})`);
    }
  }
  return out;
}

export function collectComparePairs(
  dumpsA: Map<string, CompareDump>,
  dumpsB: Map<string, CompareDump>,
  onSkip?: (message: string) => void,
): ComparePair[] {
  const pairs: ComparePair[] = [];
  for (const [file, a] of dumpsA) {
    const b = dumpsB.get(file);
    if (!b) {
      onSkip?.(`Hoppar ${file} — dump saknas hos ${dumpsB.values().next().value?.model ?? "modell B"} (kör om det barnet)`);
      continue;
    }
    for (const key of WRITING_SECTION_KEYS) {
      const secA = a.sections.find((s) => s.key === key);
      const secB = b.sections.find((s) => s.key === key);
      if (!secA || !secB) {
        onSkip?.(`Hoppar ${file}/${key} — sektion saknas (kontrollera 529-hål)`);
        continue;
      }
      pairs.push({
        pairFile: file,
        sectionType: key,
        textA: renderSectionText(secA),
        textB: renderSectionText(secB),
      });
    }
  }
  return pairs;
}
