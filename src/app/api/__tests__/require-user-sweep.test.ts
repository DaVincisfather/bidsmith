// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// Svepet (#103, audit 2026-08-17): ALLA muterande routes ska ge JSON-401 före
// någon DB-/body-åtkomst när sessionen saknas — inte 500 (rå getUserId), inte
// 404 (RLS-nollträff), inte handlerkörning bakom middleware-antagandet.
// En fil för hela svepet: samma mocks, ett fall per route.

const h = vi.hoisted(() => ({ state: { unauthed: true }, serviceTouched: { value: false } }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({}),
}));

// Nås service-klienten före auth har svepet misslyckats — mocken bokför det.
vi.mock("@/lib/supabase", () => ({
  createServiceClient: () => {
    h.serviceTouched.value = true;
    return {};
  },
  fetchConsultantsByIds: vi.fn(),
  EMPTY_GO_NO_GO: {},
  mapConsultantRow: vi.fn(),
  upsertConsultant: vi.fn(),
}));

vi.mock("@/lib/org", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/org")>();
  return {
    ...actual,
    getUserId: async () => {
      if (h.state.unauthed) throw new actual.NotAuthenticatedError();
      return "user-1";
    },
  };
});

// Tunga transitiva imports — laddas aldrig i 401-vägen men måste finnas.
vi.mock("@/lib/bid-generator/run-bid-generation", () => ({ runBidGeneration: vi.fn() }));
vi.mock("@/lib/pptx-template/active-template", () => ({ loadActiveTemplate: vi.fn() }));
vi.mock("@/lib/pptx-template/profile-store", () => ({ loadTemplateProfile: vi.fn() }));
vi.mock("@/lib/pptx-template/template-profile", () => ({
  isForeignProfile: vi.fn(),
  // api-schemas läser rollistan vid modul-load (Zod-enum).
  TABLE_COLUMN_ROLES: ["krav", "uppfyllnad", "referens", "status", "ignorera"],
}));
vi.mock("@/lib/pptx-template/onboarding/foreign-flag", () => ({ foreignTemplatesEnabled: vi.fn() }));
vi.mock("@/lib/org-profile", () => ({ loadActiveProfile: vi.fn() }));
vi.mock("@/lib/rfp-analyzer", () => ({ analyzeRfp: vi.fn() }));
vi.mock("@/lib/consultant-extractor", () => ({ extractConsultant: vi.fn() }));
vi.mock("@/lib/consultant-matcher", () => ({ matchConsultants: vi.fn() }));
vi.mock("@/lib/safe-fetch", () => ({ fetchTedXml: vi.fn() }));

import * as bidsIdRoute from "../bids/[id]/route";
import * as outcomeRoute from "../bids/[id]/outcome/route";
import * as gonogoIdRoute from "../go-no-go/[id]/route";
import * as oppRoute from "../radar/opportunities/[id]/route";
import * as bidsRoute from "../bids/route";
import * as matchesRoute from "../matches/[id]/route";
import * as analyzeRoute from "../analyze/route";
import * as uploadRoute from "../consultants/upload/route";
import * as radarAnalyzeRoute from "../radar/opportunities/[id]/analyze/route";

const VALID_ID = "11111111-1111-1111-1111-111111111111";
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

// Bodyn ska aldrig läsas i 401-vägen — json/formData smäller om den gör det.
function req(): NextRequest {
  return {
    headers: new Headers(),
    json: async () => {
      throw new Error("body must not be read before auth");
    },
    formData: async () => {
      throw new Error("body must not be buffered before auth");
    },
  } as unknown as NextRequest;
}

beforeEach(() => {
  h.state.unauthed = true;
  h.serviceTouched.value = false;
});

const CASES: Array<[string, () => Promise<Response>]> = [
  ["GET /api/bids/[id]", () => bidsIdRoute.GET(req(), ctx(VALID_ID))],
  ["PATCH /api/bids/[id]", () => bidsIdRoute.PATCH(req(), ctx(VALID_ID))],
  ["PATCH /api/bids/[id]/outcome", () => outcomeRoute.PATCH(req(), ctx(VALID_ID))],
  ["PATCH /api/go-no-go/[id]", () => gonogoIdRoute.PATCH(req(), ctx(VALID_ID))],
  ["PATCH /api/radar/opportunities/[id]", () => oppRoute.PATCH(req(), ctx(VALID_ID))],
  ["POST /api/bids", () => bidsRoute.POST(req())],
  ["POST /api/matches/[id]", () => matchesRoute.POST(req(), ctx(VALID_ID))],
  ["POST /api/analyze", () => analyzeRoute.POST(req())],
  ["POST /api/consultants/upload", () => uploadRoute.POST(req())],
  ["POST /api/radar/opportunities/[id]/analyze", () => radarAnalyzeRoute.POST(req(), ctx(VALID_ID))],
];

describe("requireUser-svepet: JSON-401 före body/DB på alla muterande routes", () => {
  for (const [name, call] of CASES) {
    it(`${name} → 401 utan service-klient`, async () => {
      const res = await call();
      expect(res.status, name).toBe(401);
      expect(h.serviceTouched.value, `${name} nådde service-klienten`).toBe(false);
    });
  }
});
