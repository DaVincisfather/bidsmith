// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

// Offline route-test för PUT /api/consultants/[id]. INGA API-anrop: verifieringen
// av evidens är ren sträng-matchning (verify-evidence.ts) och Supabase är mockad.
//
// Mock-ytan skiljer sig från profiles.test.ts eftersom rutten läser tabellen
// `consultants` i TRE olika former: (1) update...select("id") → array för
// hittad-kontrollen, (2) select("raw_cv_text") → CV-texten att re-verifiera mot,
// (3) select(API) → slutsvaret. Builder:n grenar på det för att svara rätt.

let rawCvText: string | null;
const inserted: Record<string, unknown[]> = {};

const VALID_UUID = "11111111-1111-1111-1111-111111111111";

function makeBuilder(table: string) {
  let isUpdate = false;
  let selectArg: string | undefined;
  const chain: Record<string, unknown> = {};
  const ret = () => chain;
  chain.select = (arg?: string) => {
    selectArg = arg;
    return chain;
  };
  chain.eq = ret;
  chain.order = ret;
  chain.limit = ret;
  chain.delete = ret;
  chain.update = () => {
    isUpdate = true;
    return chain;
  };
  chain.insert = (rows: unknown) => {
    (inserted[table] ??= []).push(rows);
    return chain;
  };

  const result = () => {
    if (table === "consultants") {
      if (isUpdate) {
        // update().select("id") → hittad-kontrollen förväntar en rad-array.
        return Promise.resolve({ data: [{ id: VALID_UUID }], error: null });
      }
      if (selectArg === "raw_cv_text") {
        return Promise.resolve({ data: { raw_cv_text: rawCvText }, error: null });
      }
      // Slut-select (CONSULTANT_API_SELECT) → serialiserat svar.
      return Promise.resolve({
        data: { id: VALID_UUID, name: "Anna Andersson" },
        error: null,
      });
    }
    // Barn-tabeller: delete/insert bryr sig bara om att inte fela.
    return Promise.resolve({ data: null, error: null });
  };
  chain.single = result;
  chain.maybeSingle = result;
  chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
    result().then(onF, onR);
  return chain;
}

const client = { from: (table: string) => makeBuilder(table) };

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.resolve(client),
}));

import { PUT } from "@/app/api/consultants/[id]/route";

// CV-text som citaten re-verifieras mot. Citatet "erfarenhet av upphandling"
// finns ordagrant här → ska överleva; "expert på blockkedjeteknik" gör det inte.
const CV_TEXT =
  "Anna har lång erfarenhet av upphandling och avtalsrätt inom offentlig sektor. " +
  "Hon ledde införandet av ett nytt ärendehanteringssystem hos en kommun.";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function putReq(body: unknown): Request {
  return new Request(`http://t/api/consultants/${VALID_UUID}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function baseBody(competencies: unknown[]) {
  return {
    name: "Anna Andersson",
    level: "senior",
    yearsExperience: 8,
    summary: "Erfaren upphandlingskonsult.",
    competencies,
  };
}

// Plocka ut den enda insert:ens rad-array för kompetenser.
function insertedCompetencies(): Array<{ evidence: string | null }> {
  const call = inserted.consultant_competencies?.[0];
  return call as Array<{ evidence: string | null }>;
}

beforeEach(() => {
  vi.clearAllMocks();
  rawCvText = CV_TEXT;
  for (const k of Object.keys(inserted)) delete inserted[k];
});

describe("PUT /api/consultants/[id] — evidens re-verifieras vid redigering", () => {
  it("400 vid ogiltigt uuid", async () => {
    const res = await PUT(
      putReq(baseBody([{ competency: "Upphandling", category: "domain" }])) as never,
      ctx("bad-uuid"),
    );
    expect(res.status).toBe(400);
  });

  it("verifierat citat överlever round-trippen (persisteras som text)", async () => {
    const res = await PUT(
      putReq(
        baseBody([
          {
            competency: "Offentlig upphandling",
            category: "domain",
            evidence: "erfarenhet av upphandling",
          },
        ]),
      ) as never,
      ctx(VALID_UUID),
    );
    expect(res.status).toBe(200);
    expect(insertedCompetencies()[0].evidence).toBe("erfarenhet av upphandling");
  });

  it("fabricerat citat (finns ej i CV) blir null", async () => {
    const res = await PUT(
      putReq(
        baseBody([
          {
            competency: "Blockkedja",
            category: "technical",
            evidence: "expert på blockkedjeteknik sedan 2010",
          },
        ]),
      ) as never,
      ctx(VALID_UUID),
    );
    expect(res.status).toBe(200);
    expect(insertedCompetencies()[0].evidence).toBeNull();
  });

  it("frånvarande citat (nytt manuellt tillagt) blir null", async () => {
    const res = await PUT(
      putReq(baseBody([{ competency: "Ledarskap", category: "methodology" }])) as never,
      ctx(VALID_UUID),
    );
    expect(res.status).toBe(200);
    expect(insertedCompetencies()[0].evidence).toBeNull();
  });

  it("ingen raw_cv_text på raden → allt blir null även för äkta-liknande citat", async () => {
    rawCvText = null;
    const res = await PUT(
      putReq(
        baseBody([
          {
            competency: "Offentlig upphandling",
            category: "domain",
            evidence: "erfarenhet av upphandling",
          },
        ]),
      ) as never,
      ctx(VALID_UUID),
    );
    expect(res.status).toBe(200);
    expect(insertedCompetencies()[0].evidence).toBeNull();
  });

  it("blandat: verifierat behålls, fabricerat nollas i samma batch", async () => {
    const res = await PUT(
      putReq(
        baseBody([
          {
            competency: "Offentlig upphandling",
            category: "domain",
            evidence: "erfarenhet av upphandling",
          },
          {
            competency: "Blockkedja",
            category: "technical",
            evidence: "påhittat citat som inte finns",
          },
        ]),
      ) as never,
      ctx(VALID_UUID),
    );
    expect(res.status).toBe(200);
    const rows = insertedCompetencies();
    expect(rows[0].evidence).toBe("erfarenhet av upphandling");
    expect(rows[1].evidence).toBeNull();
  });

  it("referens-citat re-verifieras på samma sätt", async () => {
    const res = await PUT(
      putReq({
        name: "Anna Andersson",
        level: "senior",
        yearsExperience: 8,
        summary: "Erfaren.",
        references: [
          {
            title: "Systeminförande",
            description: "Ledde projekt",
            year: 2022,
            sector: "public",
            evidence: "ett nytt ärendehanteringssystem hos en kommun",
          },
          {
            title: "Påhittat",
            description: "Finns ej",
            year: 2021,
            sector: "private",
            evidence: "levererade en rymdraket till Mars",
          },
        ],
      }) as never,
      ctx(VALID_UUID),
    );
    expect(res.status).toBe(200);
    const rows = inserted.consultant_references?.[0] as Array<{
      evidence: string | null;
    }>;
    expect(rows[0].evidence).toBe("ett nytt ärendehanteringssystem hos en kommun");
    expect(rows[1].evidence).toBeNull();
  });
});
