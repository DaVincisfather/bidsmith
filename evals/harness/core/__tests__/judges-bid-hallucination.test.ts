import { describe, it, expect, vi, beforeEach } from "vitest";
import { bidHallucinationJudge } from "../judges";
import * as aiClient from "@/lib/ai-client";

vi.mock("@/lib/ai-client");

describe("bidHallucinationJudge", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns match=true when no unsupported claims", async () => {
    vi.mocked(aiClient.callClaude).mockResolvedValueOnce({
      claims: [
        { claim: "Anna has 10 years experience", supported: true, evidence: "CV: 2014-2024" },
      ],
    });
    const result = await bidHallucinationJudge({
      bidText: "Anna has 10 years experience.",
      sourceMaterial: "Anna CV: 2014-2024 ...",
      allowlist: [],
    });
    expect(result.match).toBe(true);
    expect(result.field).toBe("hallucination");
  });

  it("returns match=false when an unsupported claim found", async () => {
    vi.mocked(aiClient.callClaude).mockResolvedValueOnce({
      claims: [
        { claim: "Anna has 10 years experience", supported: true, evidence: "CV" },
        { claim: "Anna has worked for NASA", supported: false, evidence: "not in CV" },
      ],
    });
    const result = await bidHallucinationJudge({
      bidText: "...",
      sourceMaterial: "...",
      allowlist: [],
    });
    expect(result.match).toBe(false);
    expect(result.evidence).toContain("Anna has worked for NASA");
  });

  it("treats allowlist substring as supported", async () => {
    vi.mocked(aiClient.callClaude).mockResolvedValueOnce({
      claims: [
        { claim: "Företaget har ISO 27001-certifiering", supported: false, evidence: "not in source" },
      ],
    });
    const result = await bidHallucinationJudge({
      bidText: "...",
      sourceMaterial: "...",
      allowlist: ["ISO 27001"],
    });
    expect(result.match).toBe(true);
  });

  it("returns match=false with error on callClaude failure", async () => {
    vi.mocked(aiClient.callClaude).mockRejectedValueOnce(new Error("rate limit"));
    const result = await bidHallucinationJudge({
      bidText: "...",
      sourceMaterial: "...",
      allowlist: [],
    });
    expect(result.match).toBe(false);
    expect(result.error).toContain("rate limit");
  });
});
