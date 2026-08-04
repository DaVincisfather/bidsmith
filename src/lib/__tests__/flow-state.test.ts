import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    rows: {} as Record<string, unknown[]>,
    errors: {} as Record<string, { message: string } | null>,
    calls: [] as { table: string; eq: [string, unknown]; order: [string, { ascending: boolean }]; limit: number }[],
  };
  return { state };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => ({
      select: () => ({
        eq: (...eqArgs: [string, unknown]) => ({
          order: (...orderArgs: [string, { ascending: boolean }]) => ({
            limit: (n: number) => {
              h.state.calls.push({ table, eq: eqArgs, order: orderArgs, limit: n });
              return Promise.resolve({
                data: h.state.rows[table] ?? [],
                error: h.state.errors[table] ?? null,
              });
            },
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
  h.state.errors = {};
  h.state.calls = [];
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

  it("asks each table for the latest row only (analysis-scoped, created_at desc, limit 1)", async () => {
    await loadFlowState("a-42");
    expect(h.state.calls).toHaveLength(3);
    for (const call of h.state.calls) {
      expect(call.eq).toEqual(["analysis_id", "a-42"]);
      expect(call.order).toEqual(["created_at", { ascending: false }]);
      expect(call.limit).toBe(1);
    }
    expect(h.state.calls.map((c) => c.table).sort()).toEqual([
      "bids", "go_no_go_assessments", "matches",
    ]);
  });

  it("throws with table context when a query fails instead of masking it as 'not started'", async () => {
    h.state.errors = { bids: { message: "permission denied" } };
    await expect(loadFlowState("a-1")).rejects.toThrow(
      /bids query failed: permission denied/,
    );
  });
});
