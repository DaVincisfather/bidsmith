import { describe, it, expect } from "vitest";
import { formatConsoleReport, writeJsonReport } from "../reporter";
import type { EvalRun } from "../types";
import fs from "fs/promises";
import path from "path";
import os from "os";

const run: EvalRun = {
  module: "analyzer",
  timestamp: "2026-04-16T14:30:00.000Z",
  fixtures: [
    {
      fixtureId: "ted-it",
      judgments: [],
      metrics: { "requirements.f1": 0.92, "client": 1.0 },
    },
    {
      fixtureId: "ted-hr",
      judgments: [],
      metrics: { "requirements.f1": 0.60, "client": 1.0 },
    },
    {
      fixtureId: "ted-broken",
      judgments: [],
      metrics: {},
      error: "malformed golden",
    },
  ],
  aggregate: { "requirements.f1.mean": 0.76, "client.mean": 1.0 },
};

const thresholds = {
  analyzer: {
    "requirements.f1": { green: 0.85, yellow: 0.70 },
    "client": { green: 1.0, yellow: 1.0 },
  },
  matcher: {},
  "bid-generator": {},
};

describe("formatConsoleReport", () => {
  it("includes module name, each fixture id, and aggregate", () => {
    const out = formatConsoleReport(run, thresholds);
    expect(out).toContain("analyzer");
    expect(out).toContain("ted-it");
    expect(out).toContain("ted-hr");
    expect(out).toContain("requirements.f1");
    expect(out).toContain("0.92");
  });

  it("flags errored fixtures", () => {
    const out = formatConsoleReport(run, thresholds);
    expect(out).toContain("ted-broken");
    expect(out).toContain("ERROR");
    expect(out).toContain("malformed golden");
  });

  it("marks metrics as PASS/WARN/FAIL based on thresholds", () => {
    const out = formatConsoleReport(run, thresholds);
    // 0.92 >= 0.85 green → PASS
    expect(out).toMatch(/PASS.*0\.92/);
    // 0.60 < 0.70 yellow → FAIL
    expect(out).toMatch(/FAIL.*0\.60/);
  });

  it("labels an informational metric INFO, never FAIL, regardless of value", () => {
    const infoRun: EvalRun = {
      module: "bid-generator",
      timestamp: "2026-07-01T00:00:00.000Z",
      fixtures: [
        { fixtureId: "chalmers", judgments: [], metrics: { "coverage.recall": 0.15, "structure.pass": 1.0 } },
      ],
      aggregate: { "coverage.recall.mean": 0.15, "structure.pass.mean": 1.0 },
    };
    const infoThresholds = {
      analyzer: {},
      matcher: {},
      "bid-generator": {
        "coverage.recall": { green: 0.90, yellow: 0.75, informational: true },
        "structure.pass": { green: 1.0, yellow: 1.0 },
      },
    };
    const out = formatConsoleReport(infoRun, infoThresholds);
    // low coverage is reported as INFO, not a FAIL that re-triggers the gate panic
    expect(out).toMatch(/INFO.*coverage\.recall.*0\.15/);
    expect(out).not.toMatch(/FAIL.*coverage\.recall/);
    // structure stays a real gate
    expect(out).toMatch(/PASS.*structure\.pass/);
  });
});

describe("writeJsonReport", () => {
  it("writes run object to file and returns path", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "eval-runs-"));
    const filePath = await writeJsonReport(run, tmp);

    expect(filePath).toMatch(/analyzer.*\.json$/);
    const content = JSON.parse(await fs.readFile(filePath, "utf-8"));
    expect(content.module).toBe("analyzer");
    expect(content.fixtures).toHaveLength(3);

    await fs.rm(tmp, { recursive: true });
  });
});
