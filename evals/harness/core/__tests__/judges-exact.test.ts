import { describe, it, expect } from "vitest";
import { exactJudge } from "../judges";

describe("exactJudge", () => {
  it("matches equal strings", async () => {
    const r = await exactJudge({ golden: "Stockholm", actual: "Stockholm", field: "client" });
    expect(r.match).toBe(true);
    expect(r.judge).toBe("exact");
  });

  it("does not match different strings", async () => {
    const r = await exactJudge({ golden: "Stockholm", actual: "Göteborg", field: "client" });
    expect(r.match).toBe(false);
  });

  it("trims whitespace before comparing", async () => {
    const r = await exactJudge({ golden: "IT", actual: " IT ", field: "domain" });
    expect(r.match).toBe(true);
  });

  it("compares null and null as match", async () => {
    const r = await exactJudge({ golden: null, actual: null, field: "deadline" });
    expect(r.match).toBe(true);
  });

  it("compares null and value as no-match", async () => {
    const r = await exactJudge({ golden: null, actual: "2026-06-15", field: "deadline" });
    expect(r.match).toBe(false);
  });

  it("compares equal numbers as match", async () => {
    const r = await exactJudge({ golden: 60, actual: 60, field: "weight" });
    expect(r.match).toBe(true);
  });
});
