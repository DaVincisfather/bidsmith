import fs from "fs/promises";
import path from "path";
import type { EvalRun } from "./types";
import { categorize, type Thresholds } from "./thresholds";

function statusLabel(category: "green" | "yellow" | "red" | "info" | "unknown"): string {
  switch (category) {
    case "green": return "PASS";
    case "yellow": return "WARN";
    case "red": return "FAIL";
    case "info": return "INFO";
    case "unknown": return "—";
  }
}

export function formatConsoleReport(run: EvalRun, thresholds: Thresholds): string {
  const lines: string[] = [];
  const moduleKey = run.module as keyof Thresholds;
  const moduleThresholds = thresholds[moduleKey] ?? {};

  lines.push("");
  lines.push(`=== ${run.module} eval — ${run.timestamp} ===`);
  if (run.mode) lines.push(`mode: ${run.mode}`);
  lines.push("");

  for (const fx of run.fixtures) {
    if (fx.error) {
      lines.push(`  ERROR  ${fx.fixtureId}  (${fx.error})`);
      continue;
    }
    lines.push(`  ${fx.fixtureId}`);
    for (const [key, val] of Object.entries(fx.metrics)) {
      const category = categorize(val, moduleThresholds[key]);
      lines.push(`    ${statusLabel(category).padEnd(5)}  ${key.padEnd(30)}  ${val.toFixed(2)}`);
    }
  }

  lines.push("");
  lines.push("Aggregate:");
  for (const [key, val] of Object.entries(run.aggregate)) {
    const baseKey = key.replace(/\.mean$/, "");
    const category = categorize(val, moduleThresholds[baseKey]);
    lines.push(`  ${statusLabel(category).padEnd(5)}  ${key.padEnd(30)}  ${val.toFixed(2)}`);
  }

  const errored = run.fixtures.filter((f) => f.error).length;
  lines.push("");
  lines.push(`Fixtures: ${run.fixtures.length} total, ${run.fixtures.length - errored} ok, ${errored} errored`);
  lines.push("");

  return lines.join("\n");
}

export async function writeJsonReport(run: EvalRun, runsDir: string): Promise<string> {
  await fs.mkdir(runsDir, { recursive: true });
  const stamp = run.timestamp.replace(/[:.]/g, "-").replace(/Z$/, "");
  const filename = `${stamp}-${run.module}${run.mode ? `-${run.mode}` : ""}.json`;
  const filePath = path.join(runsDir, filename);
  await fs.writeFile(filePath, JSON.stringify(run, null, 2), "utf-8");
  return filePath;
}
