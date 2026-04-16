import { describe, it, expect } from "vitest";
import { extractJson } from "@/lib/ai-client";

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
