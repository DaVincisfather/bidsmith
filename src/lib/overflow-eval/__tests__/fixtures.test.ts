import { mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadFixturesFile, loadFixturesFileForRefreeze, saveFixturesFile } from "../fixtures";
import type { FixturesFile } from "../types";

const VALID: FixturesFile = {
  templateId: "25f9d500-911f-4afb-8fc0-a30f8220c477",
  fixtures: [
    {
      id: "styrmodell",
      label: "Styrmodell — RetailTech",
      analysisId: "a1",
      teamConsultantIds: ["c1"],
      teamProposal: [
        { consultantId: "c1", consultantName: "Konsult Ett", level: "senior", score: 72, reasoning: "" },
      ],
    },
  ],
};

describe("fixtures loader", () => {
  let dir: string;
  let filePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "overflow-fixtures-test-"));
    filePath = path.join(dir, "fixtures.json");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("round-trips a valid file through save + load", async () => {
    await saveFixturesFile(filePath, VALID);
    const loaded = await loadFixturesFile(filePath);
    expect(loaded).toEqual(VALID);
  });

  it("rejects a pre-freeze file (missing teamProposal) with a remediation hint", async () => {
    const legacy = {
      templateId: VALID.templateId,
      fixtures: [{ id: "styrmodell", label: "x", analysisId: "a1", teamConsultantIds: ["c1"] }],
    };
    await writeFile(filePath, JSON.stringify(legacy), "utf8");
    await expect(loadFixturesFile(filePath)).rejects.toThrow(/--proposals-only/);
  });

  it("refreeze loader accepts the same pre-freeze file, defaulting teamProposal to []", async () => {
    const legacy = {
      templateId: VALID.templateId,
      fixtures: [{ id: "styrmodell", label: "x", analysisId: "a1", teamConsultantIds: ["c1"] }],
    };
    await writeFile(filePath, JSON.stringify(legacy), "utf8");
    const loaded = await loadFixturesFileForRefreeze(filePath);
    expect(loaded.fixtures[0].teamProposal).toEqual([]);
  });

  it("rejects malformed proposal rows instead of passing them through", async () => {
    const broken = structuredClone(VALID) as unknown as Record<string, unknown>;
    (broken.fixtures as Array<{ teamProposal: unknown[] }>)[0].teamProposal = [{ consultantId: 42 }];
    await writeFile(filePath, JSON.stringify(broken), "utf8");
    await expect(loadFixturesFile(filePath)).rejects.toThrow(/fixtur-schemat/);
  });
});
