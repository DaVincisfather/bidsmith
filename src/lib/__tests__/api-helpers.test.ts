import { describe, it, expect } from "vitest";
import { z } from "zod";
import { parseBody, parseUuidParam } from "@/lib/api-helpers";

const TestSchema = z.object({
  name: z.string().min(1),
  age: z.number().int().min(0),
});

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("parseBody", () => {
  it("returns ok: true with parsed data when body matches schema", async () => {
    const result = await parseBody(makeRequest({ name: "Alice", age: 30 }), TestSchema);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ name: "Alice", age: 30 });
    }
  });

  it("strips unknown keys not in schema", async () => {
    const result = await parseBody(
      makeRequest({ name: "Alice", age: 30, extra: "ignored" }),
      TestSchema
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ name: "Alice", age: 30 });
    }
  });

  it("returns 400 NextResponse when JSON is malformed", async () => {
    const result = await parseBody(makeRequest("not-valid-json{"), TestSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      const json = await result.response.json();
      expect(json.error).toMatch(/invalid json/i);
    }
  });

  it("returns 400 with field-level message when schema validation fails", async () => {
    const result = await parseBody(makeRequest({ name: "", age: -1 }), TestSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      const json = await result.response.json();
      expect(json.error).toBeTruthy();
      expect(Array.isArray(json.issues)).toBe(true);
      expect(json.issues.length).toBeGreaterThan(0);
    }
  });

  it("returns 400 when body is missing required fields", async () => {
    const result = await parseBody(makeRequest({}), TestSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
    }
  });
});

describe("parseUuidParam", () => {
  it("accepts a valid UUID (case-insensitive)", () => {
    const lower = parseUuidParam("123e4567-e89b-12d3-a456-426614174000");
    expect(lower.ok).toBe(true);
    if (lower.ok) expect(lower.data).toBe("123e4567-e89b-12d3-a456-426614174000");

    const upper = parseUuidParam("123E4567-E89B-12D3-A456-426614174000");
    expect(upper.ok).toBe(true);
  });

  it("rejects non-UUID strings with a 400 that names the param", async () => {
    for (const bad of ["abc", "123", "../etc/passwd", "123e4567e89b12d3a456426614174000", ""]) {
      const result = parseUuidParam(bad, "bid id");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response.status).toBe(400);
        const json = await result.response.json();
        expect(json.error).toContain("bid id");
      }
    }
  });
});
