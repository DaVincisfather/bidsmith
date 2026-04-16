import { describe, it, expect } from "vitest";
import { loadFixtureFromString, loadFixturesFromDir } from "../fixture-loader";
import { AnalyzerFixtureSchema } from "../fixtures";
import path from "path";
import fs from "fs/promises";
import os from "os";

describe("loadFixtureFromString", () => {
  it("parses valid YAML and validates against schema", () => {
    const yaml = `
id: test-1
rfp_text: "En RFP"
golden:
  title: "T"
  client: "C"
  deadline: null
  summary: "S"
  domain: "IT"
  requirements: []
  evaluationCriteria: []
  requiredCompetencies: []
  estimatedScope: "E"
  redFlags: []
`;
    const fixture = loadFixtureFromString(yaml, AnalyzerFixtureSchema, "test-1.yaml");
    expect(fixture.id).toBe("test-1");
    expect(fixture.golden.title).toBe("T");
  });

  it("throws with filename + message on invalid schema", () => {
    const yaml = `id: test\nrfp_text: "R"\ngolden: {}`;
    expect(() => loadFixtureFromString(yaml, AnalyzerFixtureSchema, "bad.yaml")).toThrow(/bad.yaml/);
  });

  it("throws with filename on malformed YAML", () => {
    const yaml = `id: : test\n`;
    expect(() => loadFixtureFromString(yaml, AnalyzerFixtureSchema, "broken.yaml")).toThrow(/broken.yaml/);
  });
});

describe("loadFixturesFromDir", () => {
  it("loads all *.yaml files in dir, skipping .gitkeep", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "eval-"));
    const good = `
id: tmp-1
rfp_text: "R"
golden:
  title: "T"
  client: "C"
  deadline: null
  summary: "S"
  domain: "IT"
  requirements: []
  evaluationCriteria: []
  requiredCompetencies: []
  estimatedScope: "E"
  redFlags: []
`;
    await fs.writeFile(path.join(tmp, "a.yaml"), good);
    await fs.writeFile(path.join(tmp, "b.yaml"), good.replace("tmp-1", "tmp-2"));
    await fs.writeFile(path.join(tmp, ".gitkeep"), "");

    const fixtures = await loadFixturesFromDir(tmp, AnalyzerFixtureSchema);
    expect(fixtures.map(f => f.id).sort()).toEqual(["tmp-1", "tmp-2"]);

    await fs.rm(tmp, { recursive: true });
  });
});
