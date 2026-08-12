import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const h = vi.hoisted(() => {
  const state = {
    assessments: [] as { id: string; team_consultant_ids: string[] }[],
    analysisRow: { analysis: { title: "RFP" } } as unknown,
    matchRows: [{ team_proposal: [] }] as { team_proposal: unknown[] }[],
    bids: [] as unknown[],
    bidsSelectQueue: null as unknown[][] | null,
    consultants: [{ id: "c-add" }] as unknown[],
    evalResult: { winProbability: 55 } as unknown,
    evalError: null as Error | null,
    evalCalls: [] as unknown[][],
    fetchCalls: [] as string[][],
    inserted: [] as Record<string, unknown>[],
    insertError: null as { message: string } | null,
    deletedFrom: [] as string[],
    deleteFilters: [] as { table: string; filters: [string, string, unknown][] }[],
    unauthed: false,
  };
  return { state };
});

vi.mock("@/lib/supabase", () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      select: () => {
        if (table === "analyses") {
          return { eq: () => ({ single: () => Promise.resolve({ data: h.state.analysisRow, error: null }) }) };
        }
        if (table === "matches") {
          return { eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: h.state.matchRows, error: null }) }) }) };
        }
        if (table === "go_no_go_assessments") {
          return { eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: h.state.assessments, error: null }) }) }) };
        }
        // bids
        return {
          eq: () =>
            Promise.resolve({
              data: h.state.bidsSelectQueue?.length ? h.state.bidsSelectQueue.shift() : h.state.bids,
              error: null,
            }),
        };
      },
      insert: (payload: Record<string, unknown>) => {
        h.state.inserted.push(payload);
        return {
          select: () => ({
            single: () =>
              Promise.resolve(
                h.state.insertError
                  ? { data: null, error: h.state.insertError }
                  : { data: { id: "new-assessment-id" }, error: null },
              ),
          }),
        };
      },
      delete: () => {
        const filters: [string, string, unknown][] = [];
        const chain = {
          eq: (c: string, v: unknown) => { filters.push(["eq", c, v]); return chain; },
          is: (c: string, v: unknown) => { filters.push(["is", c, v]); return chain; },
          neq: (c: string, v: unknown) => { filters.push(["neq", c, v]); return chain; },
          then: (resolve: (v: { error: null }) => void) => {
            h.state.deletedFrom.push(table);
            h.state.deleteFilters.push({ table, filters });
            resolve({ error: null });
          },
        };
        return chain;
      },
    }),
  }),
  fetchConsultantsByIds: async (_sb: unknown, ids: string[]) => {
    h.state.fetchCalls.push(ids);
    return h.state.consultants;
  },
}));

vi.mock("@/lib/go-no-go-evaluator", () => ({
  evaluateGoNoGo: async (...args: unknown[]) => {
    h.state.evalCalls.push(args);
    if (h.state.evalError) throw h.state.evalError;
    return h.state.evalResult;
  },
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
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

import { POST } from "../route";

const ANALYSIS_ID = "11111111-1111-1111-1111-111111111111";
const ASSESSMENT_ID = "22222222-2222-2222-2222-222222222222";
const REMOVE_ID = "33333333-3333-3333-3333-333333333333";
const ADD_ID = "44444444-4444-4444-4444-444444444444";
const KEEP_ID = "55555555-5555-5555-5555-555555555555";

function makeRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function validBody() {
  return { assessmentId: ASSESSMENT_ID, removeId: REMOVE_ID, addId: ADD_ID };
}

beforeEach(() => {
  h.state.assessments = [{ id: ASSESSMENT_ID, team_consultant_ids: [KEEP_ID, REMOVE_ID] }];
  h.state.analysisRow = { analysis: { title: "RFP" } };
  h.state.matchRows = [{ team_proposal: [{ consultantId: ADD_ID, consultantName: "Aram" }] }];
  h.state.bids = [];
  h.state.bidsSelectQueue = null;
  h.state.consultants = [{ id: "c" }];
  h.state.evalResult = { winProbability: 55 };
  h.state.evalError = null;
  h.state.evalCalls = [];
  h.state.fetchCalls = [];
  h.state.inserted = [];
  h.state.insertError = null;
  h.state.deletedFrom = [];
  h.state.deleteFilters = [];
  h.state.unauthed = false;
});

describe("POST /api/analyses/[id]/apply-swap", () => {
  it("swaps the consultant, deletes the draft bid, inserts a new assessment and keeps the old one", async () => {
    h.state.bids = [{ id: "b-1", status: "draft", exported_at: null, created_at: new Date().toISOString() }];
    const res = await POST(makeRequest(validBody()), ctx(ANALYSIS_ID));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe("new-assessment-id");
    // order preserved: remove-slot replaced in place
    expect(h.state.fetchCalls[0]).toEqual([KEEP_ID, ADD_ID]);
    expect(h.state.inserted[0]).toMatchObject({
      analysis_id: ANALYSIS_ID,
      team_consultant_ids: [KEEP_ID, ADD_ID],
    });
    // draft bid deleted with the guarded filters, old assessment NOT deleted
    expect(h.state.deletedFrom).toEqual(["bids"]);
    const bidsDelete = h.state.deleteFilters.find((d) => d.table === "bids");
    expect(bidsDelete?.filters).toContainEqual(["is", "exported_at", null]);
    expect(bidsDelete?.filters).toContainEqual(["neq", "status", "exported"]);
  });

  it("works with no bid yet (nothing to delete is fine)", async () => {
    const res = await POST(makeRequest(validBody()), ctx(ANALYSIS_ID));
    expect(res.status).toBe(200);
  });

  it("401s an unauthenticated call without evaluating or deleting", async () => {
    h.state.unauthed = true;
    const res = await POST(makeRequest(validBody()), ctx(ANALYSIS_ID));
    expect(res.status).toBe(401);
    expect(h.state.evalCalls).toHaveLength(0);
    expect(h.state.deletedFrom).toHaveLength(0);
  });

  it("400s on a malformed analysis id", async () => {
    const res = await POST(makeRequest(validBody()), ctx("not-a-uuid"));
    expect(res.status).toBe(400);
  });

  it("400s on an invalid body", async () => {
    const res = await POST(makeRequest({ assessmentId: ASSESSMENT_ID, removeId: REMOVE_ID }), ctx(ANALYSIS_ID));
    expect(res.status).toBe(400);
  });

  it("404s when the analysis has no assessment", async () => {
    h.state.assessments = [];
    const res = await POST(makeRequest(validBody()), ctx(ANALYSIS_ID));
    expect(res.status).toBe(404);
  });

  it("409s when the assessment id is stale (newer assessment exists)", async () => {
    h.state.assessments = [{ id: "99999999-9999-9999-9999-999999999999", team_consultant_ids: [KEEP_ID, REMOVE_ID] }];
    const res = await POST(makeRequest(validBody()), ctx(ANALYSIS_ID));
    expect(res.status).toBe(409);
    expect(h.state.evalCalls).toHaveLength(0);
  });

  it("409s when removeId is not in the locked team", async () => {
    h.state.assessments = [{ id: ASSESSMENT_ID, team_consultant_ids: [KEEP_ID] }];
    const res = await POST(makeRequest(validBody()), ctx(ANALYSIS_ID));
    expect(res.status).toBe(409);
  });

  it("409s when addId is already in the team", async () => {
    h.state.assessments = [{ id: ASSESSMENT_ID, team_consultant_ids: [REMOVE_ID, ADD_ID] }];
    const res = await POST(makeRequest(validBody()), ctx(ANALYSIS_ID));
    expect(res.status).toBe(409);
  });

  it("409s when the bid is exported (frozen flow), deleting nothing", async () => {
    h.state.bids = [{ id: "b-1", status: "exported", exported_at: "2026-08-01T10:00:00Z", created_at: new Date().toISOString() }];
    const res = await POST(makeRequest(validBody()), ctx(ANALYSIS_ID));
    expect(res.status).toBe(409);
    expect(h.state.deletedFrom).toHaveLength(0);
    expect(h.state.evalCalls).toHaveLength(0);
  });

  it("409s while generation is running", async () => {
    h.state.bids = [{ id: "b-1", status: "generating", exported_at: null, created_at: new Date().toISOString() }];
    const res = await POST(makeRequest(validBody()), ctx(ANALYSIS_ID));
    expect(res.status).toBe(409);
    expect(h.state.deletedFrom).toHaveLength(0);
  });

  it("422s when addId is not in the match pool", async () => {
    h.state.matchRows = [{ team_proposal: [{ consultantId: "other-id", consultantName: "X" }] }];
    const res = await POST(makeRequest(validBody()), ctx(ANALYSIS_ID));
    expect(res.status).toBe(422);
    expect(h.state.evalCalls).toHaveLength(0);
  });

  it("500s when the evaluator fails, WITHOUT deleting the draft bid", async () => {
    h.state.bids = [{ id: "b-1", status: "draft", exported_at: null, created_at: new Date().toISOString() }];
    h.state.evalError = new Error("AI down");
    const res = await POST(makeRequest(validBody()), ctx(ANALYSIS_ID));
    expect(res.status).toBe(500);
    expect(h.state.deletedFrom).toHaveLength(0);
  });

  it("409s when a generation starts during the evaluation window, deleting nothing and inserting nothing", async () => {
    const generatingBidRow = { id: "b-2", status: "generating", exported_at: null, created_at: new Date().toISOString() };
    // First guard (pre-evaluation) sees no bids; the re-check right after
    // evaluateGoNoGo returns sees a bid that started generating mid-flight.
    h.state.bidsSelectQueue = [[], [generatingBidRow]];
    const res = await POST(makeRequest(validBody()), ctx(ANALYSIS_ID));
    expect(res.status).toBe(409);
    expect(h.state.deletedFrom).toHaveLength(0);
    expect(h.state.inserted).toHaveLength(0);
    expect(h.state.evalCalls).toHaveLength(1);
  });

  it("500s when the assessment insert fails", async () => {
    h.state.insertError = { message: "connection lost" };
    const res = await POST(makeRequest(validBody()), ctx(ANALYSIS_ID));
    expect(res.status).toBe(500);
  });
});
