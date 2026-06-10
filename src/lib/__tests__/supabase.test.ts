import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchConsultantsByIds } from "@/lib/supabase";

function stubClient(rows: Record<string, unknown>[]): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        in: async () => ({ data: rows, error: null }),
      }),
    }),
  } as unknown as SupabaseClient;
}

const row = (id: string): Record<string, unknown> => ({
  id,
  name: "Anna",
  level: "senior",
  years_experience: 10,
  summary: null,
  consultant_competencies: [],
  consultant_references: [],
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
});

describe("fetchConsultantsByIds", () => {
  it("returns mapped consultants when every id is found", async () => {
    const consultants = await fetchConsultantsByIds(stubClient([row("a"), row("b")]), ["a", "b"]);
    expect(consultants).toHaveLength(2);
    expect(consultants[0].name).toBe("Anna");
  });

  it("throws naming the missing ids instead of silently shrinking the team", async () => {
    await expect(
      fetchConsultantsByIds(stubClient([row("a")]), ["a", "b", "c"]),
    ).rejects.toThrow("Consultants not found: b, c");
  });

  it("tolerates duplicate ids that resolve to the same row", async () => {
    const consultants = await fetchConsultantsByIds(stubClient([row("a")]), ["a", "a"]);
    expect(consultants).toHaveLength(1);
  });

  it("throws when nothing is found at all", async () => {
    await expect(fetchConsultantsByIds(stubClient([]), ["a"])).rejects.toThrow(
      "Could not fetch consultants",
    );
  });
});
