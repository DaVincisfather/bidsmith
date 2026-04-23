import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { extractJson, callClaude } from "@/lib/ai-client";

const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  class Anthropic {
    messages = { create: mockCreate };
  }
  return { default: Anthropic, APIError };
});

beforeEach(() => {
  mockCreate.mockReset();
});

describe("extractJson", () => {
  it("returns null when no object is present", () => {
    expect(extractJson("no json here")).toBeNull();
  });

  it("extracts a plain object", () => {
    expect(extractJson('prefix {"a": 1} suffix')).toBe('{"a": 1}');
  });

  it("prefers fenced code blocks", () => {
    const text = 'before {"wrong": true} after ```json\n{"right": 1}\n```';
    expect(extractJson(text)).toBe('{"right": 1}');
  });

  it("handles nested objects", () => {
    expect(extractJson('{"a": {"b": {"c": 1}}}')).toBe('{"a": {"b": {"c": 1}}}');
  });

  it("ignores braces inside string values", () => {
    const input = '{"msg": "hello } world"}';
    expect(extractJson(input)).toBe(input);
  });

  it("ignores braces inside nested string values", () => {
    const input = '{"outer": {"inner": "a } b"}, "after": "}"}';
    expect(extractJson(input)).toBe(input);
  });

  it("handles escaped quotes inside strings", () => {
    const input = '{"quoted": "he said \\"hi\\" then } left"}';
    expect(extractJson(input)).toBe(input);
  });

  it("handles escaped backslashes", () => {
    const input = '{"path": "c:\\\\x"}';
    expect(extractJson(input)).toBe(input);
  });

  it("returns null for unterminated string", () => {
    expect(extractJson('{"a": "never closed')).toBeNull();
  });
});

describe("callClaude — adaptive thinking handling", () => {
  const schema = z.object({ answer: z.string() });
  const baseArgs = {
    maxTokens: 1000,
    system: "sys",
    userContent: "user",
    schema,
    label: "test",
  };

  it("finds the text block when a thinking block is present first", async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: "thinking", thinking: "reasoning...", signature: "sig" },
        { type: "text", text: '{"answer": "ok"}' },
      ],
    });

    const result = await callClaude({
      ...baseArgs,
      model: "claude-opus-4-7",
      effort: "max",
    });

    expect(result).toEqual({ answer: "ok" });
  });

  it("wires effort to thinking + output_config in the request", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: '{"answer": "ok"}' }],
    });

    await callClaude({ ...baseArgs, model: "claude-opus-4-7", effort: "high" });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        thinking: { type: "adaptive" },
        output_config: { effort: "high" },
      })
    );
  });

  it("omits thinking + output_config when effort is not set", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: '{"answer": "ok"}' }],
    });

    await callClaude({ ...baseArgs, model: "claude-sonnet-4-6" });

    const payload = mockCreate.mock.calls[0][0];
    expect(payload.thinking).toBeUndefined();
    expect(payload.output_config).toBeUndefined();
  });
});
