import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { extractJson, callClaude } from "@/lib/ai-client";
import { logAiCall } from "@/lib/ai-call-logger";

vi.mock("@/lib/ai-call-logger", () => ({
  logAiCall: vi.fn().mockResolvedValue(undefined),
}));

const mockStream = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  class Anthropic {
    messages = { stream: mockStream };
  }
  return { default: Anthropic, APIError };
});

// Mimic the subset of MessageStream used by callClaude — only finalMessage().
function streamOf(message: unknown) {
  return { finalMessage: () => Promise.resolve(message) };
}

// Alias for clarity in tests — our create-style mock now returns a stream.
const mockCreate = mockStream;
mockCreate.mockImplementation((..._args: unknown[]) => streamOf(undefined));

beforeEach(() => {
  mockStream.mockReset();
  mockStream.mockImplementation((..._args: unknown[]) => streamOf(undefined));
  vi.mocked(logAiCall).mockClear();
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

describe("callClaude — temperature passthrough", () => {
  const schema = z.object({ a: z.number() });
  const baseArgs = {
    maxTokens: 100,
    system: "sys",
    userContent: "user",
    label: "test",
    model: "claude-haiku-4-5-20251001",
    schema,
  };

  it("skickar temperature till API:t när satt (judgar kräver 0 för determinism)", async () => {
    mockCreate.mockReturnValue(streamOf({
      content: [{ type: "text", text: '{"a": 1}' }],
      usage: {},
    }));
    await callClaude({ ...baseArgs, temperature: 0 });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0 })
    );
  });

  it("utelämnar temperature när inte satt", async () => {
    mockCreate.mockReturnValue(streamOf({
      content: [{ type: "text", text: '{"a": 1}' }],
      usage: {},
    }));
    await callClaude({ ...baseArgs });
    const callArg = mockCreate.mock.calls[0][0] as Record<string, unknown>;
    expect("temperature" in callArg).toBe(false);
  });
});

describe("callClaude — validation error formatting", () => {
  const baseArgs = {
    maxTokens: 1000,
    system: "sys",
    userContent: "user",
    label: "test",
    model: "claude-sonnet-4-6",
  };

  it("includes the received value and path in the error message", async () => {
    const schema = z.object({
      items: z.array(z.object({ priority: z.enum(["a", "b"]) })),
    });
    mockCreate.mockReturnValue(streamOf({
      content: [
        {
          type: "text",
          text: '{"items": [{"priority": "a"}, {"priority": "nope"}]}',
        },
      ],
    }));

    await expect(callClaude({ ...baseArgs, schema })).rejects.toThrow(
      /items\.1\.priority.*nope/
    );
  });

  it("re-prompts on a schema-invalid response and succeeds on retry", async () => {
    const schema = z.object({ answer: z.string() });
    mockCreate
      .mockReturnValueOnce(streamOf({
        content: [{ type: "text", text: '{"answer": 123}' }], // wrong type
      }))
      .mockReturnValueOnce(streamOf({
        content: [{ type: "text", text: '{"answer": "ok"}' }], // valid
      }));

    const result = await callClaude({ ...baseArgs, schema });

    expect(result).toEqual({ answer: "ok" });
    expect(mockCreate).toHaveBeenCalledTimes(2);
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
    mockCreate.mockReturnValue(streamOf({
      content: [
        { type: "thinking", thinking: "reasoning...", signature: "sig" },
        { type: "text", text: '{"answer": "ok"}' },
      ],
    }));

    const result = await callClaude({
      ...baseArgs,
      model: "claude-opus-4-7",
      effort: "max",
    });

    expect(result).toEqual({ answer: "ok" });
  });

  it("wires effort to thinking + output_config in the request", async () => {
    mockCreate.mockReturnValue(streamOf({
      content: [{ type: "text", text: '{"answer": "ok"}' }],
    }));

    await callClaude({ ...baseArgs, model: "claude-opus-4-7", effort: "high" });

    const payload = mockCreate.mock.calls[0][0];
    expect(payload.thinking).toEqual({ type: "adaptive" });
    // output_config bär numera även format — asserta effort-nyckeln, inte exakt objekt.
    expect(payload.output_config.effort).toBe("high");
  });

  it("omits thinking + output_config.effort when effort is not set", async () => {
    mockCreate.mockReturnValue(streamOf({
      content: [{ type: "text", text: '{"answer": "ok"}' }],
    }));

    await callClaude({ ...baseArgs, model: "claude-sonnet-4-6" });

    const payload = mockCreate.mock.calls[0][0];
    expect(payload.thinking).toBeUndefined();
    // output_config skickas numera alltid (format) — men utan effort-nyckel.
    expect(payload.output_config?.effort).toBeUndefined();
  });
});

describe("callClaude — structured outputs", () => {
  const schema = z.object({ a: z.number().min(0) });
  const baseArgs = {
    maxTokens: 1000,
    system: "sys",
    userContent: "user",
    label: "test",
    model: "claude-sonnet-4-6",
  };
  const okResponse = () => streamOf({
    content: [{ type: "text", text: '{"a": 1}' }],
    usage: {},
  });

  it("skickar output_config.format med sanerat JSON Schema", async () => {
    mockCreate.mockReturnValue(okResponse());
    await callClaude({ ...baseArgs, schema });
    const payload = mockCreate.mock.calls[0][0];
    expect(payload.output_config.format.type).toBe("json_schema");
    expect(payload.output_config.format.schema.additionalProperties).toBe(false);
    expect(JSON.stringify(payload.output_config.format.schema)).not.toContain("minimum");
  });

  it("kombinerar format med effort i samma output_config", async () => {
    mockCreate.mockReturnValue(okResponse());
    await callClaude({ ...baseArgs, schema, effort: "high" });
    const payload = mockCreate.mock.calls[0][0];
    expect(payload.output_config.effort).toBe("high");
    expect(payload.output_config.format.type).toBe("json_schema");
    expect(payload.thinking).toEqual({ type: "adaptive" });
  });

  // Städa env-stubbar även när en assertion failar — annars läcker
  // SO=off till efterföljande tester i filen.
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("utelamnar format nar BIDSMITH_STRUCTURED_OUTPUTS=off", async () => {
    vi.stubEnv("BIDSMITH_STRUCTURED_OUTPUTS", "off");
    mockCreate.mockReturnValue(okResponse());
    await callClaude({ ...baseArgs, schema });
    const payload = mockCreate.mock.calls[0][0];
    expect(payload.output_config?.format).toBeUndefined();
  });
});

describe("callClaude — cachedContext", () => {
  const schema = z.object({ a: z.number() });
  const baseArgs = {
    maxTokens: 1000,
    system: "sys",
    userContent: "user",
    label: "test",
    model: "claude-sonnet-4-6",
    schema,
  };
  const okResponse = () => streamOf({
    content: [{ type: "text", text: '{"a": 1}' }],
    usage: {},
  });

  it("renderar system som blockarray med cache_control pa kontextblocket", async () => {
    mockCreate.mockReturnValue(okResponse());
    await callClaude({ ...baseArgs, cachedContext: "STOR DELAD KONTEXT" });
    const payload = mockCreate.mock.calls[0][0];
    expect(payload.system).toEqual([
      {
        type: "text",
        text: "STOR DELAD KONTEXT",
        cache_control: { type: "ephemeral" },
      },
      { type: "text", text: "sys" },
    ]);
  });

  it("behaller system som strang utan cachedContext", async () => {
    mockCreate.mockReturnValue(okResponse());
    await callClaude(baseArgs);
    expect(mockCreate.mock.calls[0][0].system).toBe("sys");
  });
});

describe("callClaude — usage logging", () => {
  const schema = z.object({ answer: z.string() });
  const baseArgs = {
    maxTokens: 1000,
    system: "sys",
    userContent: "user",
    schema,
    label: "test",
    model: "claude-sonnet-4-6",
  };

  it("forwards usage and userId to logAiCall on success", async () => {
    mockCreate.mockReturnValue(streamOf({
      content: [{ type: "text", text: '{"answer": "ok"}' }],
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 10,
        cache_creation_input_tokens: 5,
      },
    }));

    await callClaude({ ...baseArgs, userId: "user-abc" });

    expect(logAiCall).toHaveBeenCalledTimes(1);
    const call = vi.mocked(logAiCall).mock.calls[0][0];
    expect(call.userId).toBe("user-abc");
    expect(call.model).toBe("claude-sonnet-4-6");
    expect(call.label).toBe("test");
    expect(call.inputTokens).toBe(100);
    expect(call.outputTokens).toBe(50);
    expect(call.cacheReadTokens).toBe(10);
    expect(call.cacheCreationTokens).toBe(5);
    expect(call.error).toBeUndefined();
    expect(call.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("logs zero usage when the response omits it", async () => {
    mockCreate.mockReturnValue(streamOf({
      content: [{ type: "text", text: '{"answer": "ok"}' }],
    }));

    await callClaude(baseArgs);

    const call = vi.mocked(logAiCall).mock.calls[0][0];
    expect(call.inputTokens).toBe(0);
    expect(call.outputTokens).toBe(0);
    expect(call.userId).toBeNull();
  });
});
