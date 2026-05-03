// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  loadBudgets,
  clearBudgetCache,
  TemplateConfigMissingError,
  InvalidBudgetSchemaError,
} from "../budget-loader";

const mockSingle = vi.fn();
const mockEq = vi.fn(() => ({ single: mockSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.resolve({ from: mockFrom }),
}));

beforeEach(() => {
  clearBudgetCache();
  mockSingle.mockReset();
  mockEq.mockClear();
  mockSelect.mockClear();
  mockFrom.mockClear();
});

describe("loadBudgets", () => {
  it("loads and parses budgets for a template", async () => {
    mockSingle.mockResolvedValue({
      data: { budgets: { title: 80, body: 400 } },
      error: null,
    });

    const budgets = await loadBudgets("anbudsmall-v2");

    expect(budgets).toEqual({ title: 80, body: 400 });
    expect(mockFrom).toHaveBeenCalledWith("template_configs");
    expect(mockSelect).toHaveBeenCalledWith("budgets");
    expect(mockEq).toHaveBeenCalledWith("name", "anbudsmall-v2");
  });

  it("returns cached value on second call (no extra DB hit)", async () => {
    mockSingle.mockResolvedValue({
      data: { budgets: { title: 80 } },
      error: null,
    });

    await loadBudgets("anbudsmall-v2");
    await loadBudgets("anbudsmall-v2");

    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it("throws TemplateConfigMissingError when row is missing (PGRST116)", async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: "PGRST116", message: "no rows" },
    });

    await expect(loadBudgets("missing-template")).rejects.toBeInstanceOf(
      TemplateConfigMissingError,
    );
    await expect(loadBudgets("missing-template")).rejects.toThrow(/missing-template/);
  });

  it("throws plain Error (not TemplateConfigMissingError) on transient Supabase failure", async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: "PGRST301", message: "rate limit exceeded" },
    });

    await expect(loadBudgets("anbudsmall-v2")).rejects.not.toBeInstanceOf(
      TemplateConfigMissingError,
    );
    await expect(loadBudgets("anbudsmall-v2")).rejects.toThrow(/rate limit exceeded/);
  });

  it("throws InvalidBudgetSchemaError when budgets payload is malformed", async () => {
    mockSingle.mockResolvedValue({
      data: { budgets: { title: -5, body: "not-a-number" } },
      error: null,
    });

    await expect(loadBudgets("bad-template")).rejects.toBeInstanceOf(
      InvalidBudgetSchemaError,
    );
  });

  it("clearBudgetCache(name) only clears the named entry", async () => {
    mockSingle.mockResolvedValue({
      data: { budgets: { title: 80 } },
      error: null,
    });

    await loadBudgets("template-a");
    await loadBudgets("template-b");
    expect(mockFrom).toHaveBeenCalledTimes(2);

    clearBudgetCache("template-a");

    await loadBudgets("template-a"); // should re-fetch
    await loadBudgets("template-b"); // should still be cached

    expect(mockFrom).toHaveBeenCalledTimes(3);
  });
});
