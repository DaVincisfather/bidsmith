import { describe, it, expect } from "vitest";
import { loadConsultantPool, getConsultantsByIds } from "../consultant-pool";
import path from "path";

const POOL_PATH = path.resolve(__dirname, "../../../fixtures/consultants/synthetic-pool.yaml");

describe("loadConsultantPool", () => {
  it("loads and validates the pool", async () => {
    const pool = await loadConsultantPool(POOL_PATH);
    expect(pool.length).toBeGreaterThanOrEqual(3);
    expect(pool.find((c) => c.id === "anna_svensson")).toBeDefined();
  });
});

describe("getConsultantsByIds", () => {
  it("returns consultants in request order", async () => {
    const pool = await loadConsultantPool(POOL_PATH);
    const selected = getConsultantsByIds(pool, ["bertil_larsson", "anna_svensson"]);
    expect(selected.map((c) => c.id)).toEqual(["bertil_larsson", "anna_svensson"]);
  });

  it("throws on unknown id", async () => {
    const pool = await loadConsultantPool(POOL_PATH);
    expect(() => getConsultantsByIds(pool, ["does_not_exist"])).toThrow(/does_not_exist/);
  });
});
