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

// max_tokens är ett hårt tak på TÄNKANDE + svarstext tillsammans. Vid effort
// "max"/"xhigh" tar tänkandet en stor del av budgeten, så ett tak avsett för
// enbart svaret klipper svaret mitt i — det syns som stop_reason "max_tokens"
// på exakt takets värde, vilket läses som ett skenande anrop snarare än som
// trunkering. Fånga felkonfigurationen före anropet, som temperature-vakten.
describe("callClaude — effort mot maxTokens", () => {
  const schema = z.object({ ok: z.boolean() });

  function call(overrides: { effort?: "low" | "medium" | "high" | "xhigh" | "max"; maxTokens: number; model?: string }) {
    return callClaude({
      model: overrides.model ?? "claude-opus-4-8",
      maxTokens: overrides.maxTokens,
      system: "s",
      userContent: "u",
      schema,
      label: "phases bundle",
      ...(overrides.effort ? { effort: overrides.effort } : {}),
    });
  }

  it("vägrar effort max under modellens golv, utan att röra API:t", async () => {
    await expect(call({ effort: "max", maxTokens: 32000 })).rejects.toThrow(/64000/);
    expect(mockStream).not.toHaveBeenCalled();
  });

  it("vägrar effort xhigh på samma grund", async () => {
    await expect(call({ effort: "xhigh", maxTokens: 16000 })).rejects.toThrow(/xhigh/);
    expect(mockStream).not.toHaveBeenCalled();
  });

  it("nämner både labeln och det satta taket så felet går att placera", async () => {
    await expect(call({ effort: "max", maxTokens: 32000 })).rejects.toThrow(
      /phases bundle.*32000/,
    );
  });

  it("släpper igenom hög effort när taket räcker", async () => {
    await expect(call({ effort: "max", maxTokens: 64000 })).rejects.toThrow();
    // Nådde API-anropet (och föll på mockens tomma svar), inte vakten.
    expect(mockStream).toHaveBeenCalled();
  });

  it("lämnar låg och medelhög effort i fred — golvet gäller bara max/xhigh", async () => {
    await expect(call({ effort: "high", maxTokens: 4000 })).rejects.toThrow();
    expect(mockStream).toHaveBeenCalled();
  });

  it("gäller inte modeller utan effort-golv", async () => {
    await expect(
      call({ effort: "max", maxTokens: 2000, model: "claude-haiku-4-5-20251001" }),
    ).rejects.toThrow();
    expect(mockStream).toHaveBeenCalled();
  });
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

describe("callClaude — overloaded-resiliens", () => {
  const schema = z.object({ a: z.number() });
  const baseArgs = {
    maxTokens: 100, system: "sys", userContent: "user",
    label: "test", model: "claude-sonnet-4-6", schema,
  };

  it("ger 529 fem försök istället för tre", async () => {
    vi.useFakeTimers();
    const { APIError } = await import("@anthropic-ai/sdk");
    const overloaded = () => ({
      finalMessage: () =>
        Promise.reject(new (APIError as never as { new (s: number, m: string): Error })(529, "Overloaded")),
    });
    mockCreate
      .mockReturnValueOnce(overloaded())
      .mockReturnValueOnce(overloaded())
      .mockReturnValueOnce(overloaded())
      .mockReturnValueOnce(overloaded())
      .mockReturnValueOnce(streamOf({ content: [{ type: "text", text: '{"a": 1}' }], usage: {} }));

    const promise = callClaude({ ...baseArgs });
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toEqual({ a: 1 });
    expect(mockCreate).toHaveBeenCalledTimes(5);
    vi.useRealTimers();
  });

  it("formatfel efter en 529 ärver inte den utökade budgeten", async () => {
    vi.useFakeTimers();
    const { APIError } = await import("@anthropic-ai/sdk");
    const overloaded = () => ({
      finalMessage: () =>
        Promise.reject(new (APIError as never as { new (s: number, m: string): Error })(529, "Overloaded")),
    });
    // 529 på försök 0, sedan svar utan JSON (formatfel) — budgeten för
    // formatfel är 3, så totalt 3 anrop, inte 5.
    mockCreate
      .mockReturnValueOnce(overloaded())
      .mockReturnValue(streamOf({ content: [{ type: "text", text: "ingen json här" }], usage: {} }));

    const promise = callClaude({ ...baseArgs }).catch((e) => e);
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBeInstanceOf(Error);
    expect(mockCreate).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it("icke-529-fel behåller tre försök", async () => {
    vi.useFakeTimers();
    const { APIError } = await import("@anthropic-ai/sdk");
    const rateLimited = () => ({
      finalMessage: () =>
        Promise.reject(new (APIError as never as { new (s: number, m: string): Error })(429, "rate limited")),
    });
    mockCreate.mockReturnValue(rateLimited());

    const promise = callClaude({ ...baseArgs }).catch((e) => e);
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBeInstanceOf(Error);
    expect(mockCreate).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
});

describe("callClaude — retry-kostnadstak", () => {
  const schema = z.object({ a: z.number() });
  const baseArgs = {
    maxTokens: 100, system: "sys", userContent: "user",
    label: "test", model: "claude-sonnet-4-6", schema,
  };

  it("stoppar formatfel-retries när output-budgeten (maxTokens×2.5) är slut", async () => {
    // Varje formatfel-svar bränner 200 output-tokens; taket är 100×2.5 = 250,
    // så andra försöket (400) passerar taket → inget tredje försök.
    mockCreate.mockReturnValue(streamOf({
      content: [{ type: "text", text: "ingen json" }],
      usage: { output_tokens: 200 },
    }));
    const err = await callClaude({ ...baseArgs }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("billiga formatfel behåller hela retry-budgeten (3 försök)", async () => {
    mockCreate.mockReturnValue(streamOf({
      content: [{ type: "text", text: "ingen json" }],
      usage: { output_tokens: 10 },
    }));
    const err = await callClaude({ ...baseArgs }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(mockCreate).toHaveBeenCalledTimes(3);
  });
});

describe("callClaude — max_tokens-trunkering (härdning)", () => {
  const schema = z.object({ a: z.number() });
  const baseArgs = {
    maxTokens: 100, system: "sys", userContent: "user",
    label: "test", model: "claude-sonnet-4-6", schema,
  };

  it("stop_reason max_tokens: EN retry med fördubblad maxTokens, sedan lyckas", async () => {
    mockCreate
      .mockReturnValueOnce(streamOf({
        content: [{ type: "text", text: '{"a": 1' }], // trunkerad mitt i
        usage: { output_tokens: 100 },
        stop_reason: "max_tokens",
      }))
      .mockReturnValueOnce(streamOf({
        content: [{ type: "text", text: '{"a": 1}' }],
        usage: { output_tokens: 50 },
        stop_reason: "end_turn",
      }));

    const result = await callClaude({ ...baseArgs });
    expect(result).toEqual({ a: 1 });
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect((mockCreate.mock.calls[0][0] as { max_tokens: number }).max_tokens).toBe(100);
    expect((mockCreate.mock.calls[1][0] as { max_tokens: number }).max_tokens).toBe(200);
  });

  it("trunkerad även efter höjning: kastar beskrivande fel, inga fler försök", async () => {
    mockCreate.mockReturnValue(streamOf({
      content: [{ type: "text", text: '{"a": 1' }],
      usage: { output_tokens: 100 },
      stop_reason: "max_tokens",
    }));

    const err = await callClaude({ ...baseArgs }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(
      /test: output trunkerad \(max_tokens 200\) även efter höjning — öka maxTokens eller minska outputen/
    );
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("maxTokens redan vid modellens tak: EN omförsök med SAMMA maxTokens, sedan lyckas", async () => {
    // Ett anrop som redan ligger vid modellens output-tak har inget kvar att
    // höja mot, så omförsöket kör med IDENTISK maxTokens (inte hårdfail direkt,
    // det skulle regressa de stora bundlarna mot fas 0-beteendet).
    // Taket kommer numera ur MODEL_LIMITS i stället för den gamla
    // modelloberoende gissningen 16384 — därav 128000 här.
    mockCreate
      .mockReturnValueOnce(streamOf({
        content: [{ type: "text", text: '{"a": 1' }],
        usage: { output_tokens: 20000 },
        stop_reason: "max_tokens",
      }))
      .mockReturnValueOnce(streamOf({
        content: [{ type: "text", text: '{"a": 1}' }],
        usage: { output_tokens: 500 },
        stop_reason: "end_turn",
      }));

    const result = await callClaude({ ...baseArgs, maxTokens: 128000 });
    expect(result).toEqual({ a: 1 });
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect((mockCreate.mock.calls[0][0] as { max_tokens: number }).max_tokens).toBe(128000);
    expect((mockCreate.mock.calls[1][0] as { max_tokens: number }).max_tokens).toBe(128000);
  });

  it("maxTokens redan vid/över taket: trunkerad även efter omförsöket — kastar beskrivande fel, inga fler försök", async () => {
    mockCreate.mockReturnValue(streamOf({
      content: [{ type: "text", text: '{"a": 1' }],
      usage: { output_tokens: 20000 },
      stop_reason: "max_tokens",
    }));

    const err = await callClaude({ ...baseArgs, maxTokens: 128000 }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(
      /test: output trunkerad \(max_tokens 128000\) även efter omförsök med samma maxTokens — öka maxTokens eller minska outputen/
    );
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("fördubbling klipps vid modellens tak — inte 2×maxTokens rakt av", async () => {
    mockCreate
      .mockReturnValueOnce(streamOf({
        content: [{ type: "text", text: '{"a": 1' }],
        usage: { output_tokens: 10000 },
        stop_reason: "max_tokens",
      }))
      .mockReturnValueOnce(streamOf({
        content: [{ type: "text", text: '{"a": 1}' }],
        usage: { output_tokens: 50 },
        stop_reason: "end_turn",
      }));

    const result = await callClaude({ ...baseArgs, maxTokens: 100000 });
    expect(result).toEqual({ a: 1 });
    // 2×100000 klipps till modellens tak, inte till 200000.
    expect((mockCreate.mock.calls[1][0] as { max_tokens: number }).max_tokens).toBe(128000);
  });

  it("trunkering på sista tillåtna attempt (efter två formatfel): terminalfelet lovar ingen retry", async () => {
    // Intermediärfelet blir terminalt när retry-budgeten redan är förbrukad —
    // texten ska konstatera trunkeringen neutralt, inte säga "försöker igen".
    mockCreate
      .mockReturnValueOnce(streamOf({
        content: [{ type: "text", text: "ingen json" }],
        usage: { output_tokens: 10 },
        stop_reason: "end_turn",
      }))
      .mockReturnValueOnce(streamOf({
        content: [{ type: "text", text: "ingen json" }],
        usage: { output_tokens: 10 },
        stop_reason: "end_turn",
      }))
      .mockReturnValueOnce(streamOf({
        content: [{ type: "text", text: '{"a": 1' }],
        usage: { output_tokens: 100 },
        stop_reason: "max_tokens",
      }));

    const err = await callClaude({ ...baseArgs }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/test: output trunkerad \(max_tokens 100\)/);
    expect((err as Error).message).not.toMatch(/försöker igen|höjer till/);
    expect(mockCreate).toHaveBeenCalledTimes(3);
  });

  it("regression: formatfel utan stop_reason max_tokens beter sig som tidigare (identisk retry)", async () => {
    mockCreate.mockReturnValue(streamOf({
      content: [{ type: "text", text: "ingen json" }],
      usage: { output_tokens: 10 },
      stop_reason: "end_turn",
    }));
    const err = await callClaude({ ...baseArgs }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(mockCreate).toHaveBeenCalledTimes(3);
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

  it("Sonnet 5: strippar temperature och sätter thinking disabled (API:t avvisar temperature med 400)", async () => {
    // Verifierat empiriskt 2026-07-03: "`temperature` is deprecated for this
    // model". Avsikten (mekaniskt/deterministiskt) översätts centralt till
    // thinking: disabled — call sites ska inte känna till modell-quirks.
    mockCreate.mockReturnValue(streamOf({
      content: [{ type: "text", text: '{"a": 1}' }],
      usage: {},
    }));
    await callClaude({ ...baseArgs, model: "claude-sonnet-5", temperature: 0 });
    const params = mockCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(params).not.toHaveProperty("temperature");
    expect(params.thinking).toEqual({ type: "disabled" });
  });

  it("Sonnet 5 utan effort: thinking disabled (återställer kontraktet 'inget effort = ingen reasoning')", async () => {
    // Sonnet 5 defaultar till adaptiv thinking server-side — utan disable äter
    // reasoning-tokens de snäva budgetarna i mekaniska steg (team: 2000).
    mockCreate.mockReturnValue(streamOf({
      content: [{ type: "text", text: '{"a": 1}' }],
      usage: {},
    }));
    await callClaude({ ...baseArgs, model: "claude-sonnet-5" });
    const params = mockCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(params).not.toHaveProperty("temperature");
    expect(params.thinking).toEqual({ type: "disabled" });
  });

  it("Sonnet 5 MED effort: adaptiv thinking, inte disabled", async () => {
    mockCreate.mockReturnValue(streamOf({
      content: [{ type: "text", text: '{"a": 1}' }],
      usage: {},
    }));
    await callClaude({ ...baseArgs, model: "claude-sonnet-5", effort: "high" });
    const params = mockCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(params.thinking).toEqual({ type: "adaptive" });
  });

  it("kastar direkt på effort + temperature — API:t avvisar kombinationen med 400", async () => {
    // Adaptive thinking kräver temperature 1/utelämnad; 400 är inte retrybar
    // så utan vakt hårdfailar varje anrop efter att ha kostat ett försök.
    await expect(
      callClaude({ ...baseArgs, effort: "high", temperature: 0 })
    ).rejects.toThrow(/effort.*temperature|temperature.*effort/i);
    expect(mockCreate).not.toHaveBeenCalled();
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
