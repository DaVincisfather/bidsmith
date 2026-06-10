import { describe, it, expect } from "vitest";
import {
  buildReferenceSection,
  REFERENCE_PLACEHOLDER_COUNT,
} from "../deterministic/reference";

describe("buildReferenceSection", () => {
  it("returns a deterministic reference-v2 section with placeholder slots", () => {
    const s = buildReferenceSection();
    expect(s.type).toBe("data");
    expect(s.key).toBe("reference-v2");
    if (!s.content) throw new Error("content missing");
    if (s.content.format !== "reference-v2") throw new Error("format mismatch");
    expect(s.content.references).toHaveLength(REFERENCE_PLACEHOLDER_COUNT);
  });

  it("fills every field with a non-empty placeholder (no empty strings in PPTX)", () => {
    const s = buildReferenceSection();
    if (s.content?.format !== "reference-v2") throw new Error("format mismatch");
    for (const r of s.content.references) {
      expect(r.clientName).toBeTruthy();
      expect(r.contextLine).toBeTruthy();
      expect(r.organisation).toBeTruthy();
      expect(r.startDate).toBeTruthy();
      expect(r.endDate).toBeTruthy();
      expect(r.scope).toBeTruthy();
      expect(r.contact.name).toBeTruthy();
      expect(r.contact.titlePhoneEmail).toBeTruthy();
      expect(r.roleAndDelivery).toBeTruthy();
      expect(r.result).toBeTruthy();
    }
  });

  it("returns distinct reference objects so editing one slot doesn't leak into the other", () => {
    const s = buildReferenceSection();
    if (s.content?.format !== "reference-v2") throw new Error("format mismatch");
    const [a, b] = s.content.references;
    expect(a).not.toBe(b);
    expect(a.contact).not.toBe(b.contact);
  });
});
