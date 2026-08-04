import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    rows: {} as Record<string, unknown[]>,
  };
  return { state };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () =>
              Promise.resolve({ data: h.state.rows[table] ?? [], error: null }),
          }),
        }),
      }),
    }),
  }),
}));

import { loadFlowState } from "../flow-state";

const RESULT = { recommendation: "go" } as never;

beforeEach(() => {
  h.state.rows = {};
});

describe("loadFlowState", () => {
  it("returns all-null flow when nothing exists (fresh analysis)", async () => {
    const flow = await loadFlowState("a-1");
    expect(flow).toEqual({ match: null, assessment: null, bid: null });
  });

  it("maps match, assessment and bid rows to flow state", async () => {
    h.state.rows = {
      matches: [{ id: "m-1", team_proposal: [{ consultantId: "c-1" }] }],
      go_no_go_assessments: [
        { id: "g-1", team_consultant_ids: ["c-1"], result: RESULT, decision: "go" },
      ],
      bids: [{ id: "b-1", status: "draft", exported_at: null, failed_bundles: [] }],
    };
    const flow = await loadFlowState("a-1");
    expect(flow.match?.id).toBe("m-1");
    expect(flow.assessment).toEqual({
      id: "g-1", teamConsultantIds: ["c-1"], result: RESULT, decision: "go",
    });
    expect(flow.bid).toEqual({
      id: "b-1", status: "draft", exportedAt: null, hasFailures: false,
    });
  });

  it("flags failures and preserves exportedAt", async () => {
    h.state.rows = {
      bids: [{
        id: "b-1", status: "exported",
        exported_at: "2026-08-01T10:00:00Z", failed_bundles: [{ bundle: "phases" }],
      }],
    };
    const flow = await loadFlowState("a-1");
    expect(flow.bid?.exportedAt).toBe("2026-08-01T10:00:00Z");
    expect(flow.bid?.hasFailures).toBe(true);
  });

  it("normalises null decision and null team ids", async () => {
    h.state.rows = {
      go_no_go_assessments: [
        { id: "g-1", team_consultant_ids: null, result: RESULT, decision: null },
      ],
    };
    const flow = await loadFlowState("a-1");
    expect(flow.assessment?.teamConsultantIds).toEqual([]);
    expect(flow.assessment?.decision).toBeNull();
  });
});
