import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCallClaude = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai-client", () => ({
  callClaude: mockCallClaude,
}));

import { SYSTEM_PROMPT, extractConsultant } from "@/lib/consultant-extractor";
import { ConsultantExtractionSchema } from "@/lib/ai-schemas";

describe("consultant-extractor prompt", () => {
  it("instruerar att språkkunskaper extraheras som kompetens", () => {
    // Promptar är data: testet låser kontraktet att språk inte tappas bort —
    // fas 0 visade att coverage-judgen annars inte kan belägga språkkrav.
    expect(SYSTEM_PROMPT).toMatch(/[Ss]pråk/);
  });

  it("bär KÄLLCITAT-regeln för kompetenser/referenser men narrowar 'rimlig bedömning' till level/years/summary", () => {
    expect(SYSTEM_PROMPT).toContain("evidence");
    expect(SYSTEM_PROMPT).toMatch(/ordagrant|ordagran/i);
    // Narrowingen: bedömningsregeln ska explicit gälla bara level/yearsExperience/summary.
    expect(SYSTEM_PROMPT).toMatch(/rimlig bedömning/i);
    expect(SYSTEM_PROMPT).toMatch(/level, yearsExperience och summary/);
  });
});

// CV-text där kompetens- och referenscitaten nedan finns ordagrant.
const CV =
  "Anna Svensson är senior konsult. Kompetenser: digital transformation och molnmigration. " +
  "Uppdrag: Stockholms stad 2019-2024, ledde molnmigration för 12 förvaltningar.";

function profile(competencies: unknown[], references: unknown[]) {
  return {
    name: "Anna Svensson",
    level: "senior",
    yearsExperience: 12,
    summary: "s",
    competencies,
    references,
  };
}

const verifiedComp = () => ({
  competency: "digital transformation",
  category: "domain",
  evidence: "digital transformation och molnmigration",
});
const fabricatedComp = () => ({
  competency: "Kubernetes",
  category: "technical",
  evidence: "expert på Kubernetes och Go",
});
const verifiedRef = () => ({
  title: "Stockholms stad",
  description: "molnmigration",
  year: 2020,
  sector: "public",
  evidence: "ledde molnmigration för 12 förvaltningar",
});
const fabricatedRef = () => ({
  title: "Region X",
  description: "AI-projekt",
  year: 2021,
  sector: "public",
  evidence: "ansvarig för nationellt AI-program på Region X",
});

describe("extractConsultant", () => {
  beforeEach(() => mockCallClaude.mockReset());

  it("kör med temperature 0 — samma CV ska ge samma profil", async () => {
    mockCallClaude.mockResolvedValueOnce(profile([], []));
    await extractConsultant("CV-text");
    expect(mockCallClaude.mock.calls[0][0].temperature).toBe(0);
  });

  it("wrappar CV:t i <underlag> och skickar distinkt label", async () => {
    mockCallClaude.mockResolvedValueOnce(profile([], []));
    await extractConsultant("hemligt CV", null, "eval:zero-halluc-cv");
    const args = mockCallClaude.mock.calls[0][0];
    expect(args.userContent).toContain("<underlag>\nhemligt CV\n</underlag>");
    expect(args.label).toBe("eval:zero-halluc-cv");
  });

  it("verifierar allt direkt → inget re-citat-anrop", async () => {
    mockCallClaude.mockResolvedValueOnce(profile([verifiedComp()], [verifiedRef()]));
    const result = await extractConsultant(CV);
    expect(mockCallClaude).toHaveBeenCalledOnce();
    expect(result.competencies[0].evidence).toBe("digital transformation och molnmigration");
    expect(result.references[0].evidence).toBe("ledde molnmigration för 12 förvaltningar");
  });

  it("reparerar en overifierbar kompetens via ETT re-citat-anrop", async () => {
    mockCallClaude.mockResolvedValueOnce(profile([fabricatedComp()], []));
    mockCallClaude.mockResolvedValueOnce({
      quotes: [{ index: 0, evidence: "digital transformation och molnmigration" }],
    });
    const result = await extractConsultant(CV);
    expect(mockCallClaude).toHaveBeenCalledTimes(2);
    expect(result.competencies[0].evidence).toBe("digital transformation och molnmigration");
  });

  it("flaggar en overifierbar referens (evidence undefined, posten behålls)", async () => {
    mockCallClaude.mockResolvedValueOnce(profile([verifiedComp()], [fabricatedRef()]));
    mockCallClaude.mockResolvedValueOnce({ quotes: [{ index: 1, evidence: null }] });
    const result = await extractConsultant(CV);
    expect(result.references).toHaveLength(1);
    expect(result.references[0].evidence).toBeUndefined();
    // Kompetensens verifierade citat är orört.
    expect(result.competencies[0].evidence).toBe("digital transformation och molnmigration");
  });

  it("kompetenser OCH referenser i EN batchad re-citat-omgång (index 0 = komp, 1 = ref)", async () => {
    mockCallClaude.mockResolvedValueOnce(profile([fabricatedComp()], [fabricatedRef()]));
    mockCallClaude.mockResolvedValueOnce({
      quotes: [
        { index: 0, evidence: "digital transformation och molnmigration" },
        { index: 1, evidence: null },
      ],
    });
    const result = await extractConsultant(CV);
    // ETT enda re-citat-anrop täcker båda kinds.
    expect(mockCallClaude).toHaveBeenCalledTimes(2);
    const requoteArgs = mockCallClaude.mock.calls[1][0];
    expect(requoteArgs.userContent).toContain("[0] Kubernetes");
    expect(requoteArgs.userContent).toContain("[1] Region X: AI-projekt");
    expect(result.competencies[0].evidence).toBe("digital transformation och molnmigration");
    expect(result.references[0].evidence).toBeUndefined();
  });
});

describe("ConsultantExtractionSchema — degenererat svar", () => {
  it("avvisar ett CV utan en enda kompetens (competencies.min(1))", () => {
    const raw = {
      name: "X",
      level: "junior",
      yearsExperience: 1,
      summary: "s",
      competencies: [],
      references: [],
    };
    expect(ConsultantExtractionSchema.safeParse(raw).success).toBe(false);
  });
});
