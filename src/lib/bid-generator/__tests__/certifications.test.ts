import { describe, it, expect } from "vitest";
import { buildCertificationsSection } from "../deterministic/certifications";

describe("buildCertificationsSection", () => {
  it("returns 3 ISO defaults with placeholder number and dash-only validUntil", () => {
    const s = buildCertificationsSection();
    if (!s.content) throw new Error("content missing");
    expect(s.content.format).toBe("certifications");
    if (s.content.format !== "certifications") throw new Error("format mismatch");
    expect(s.content.certs).toHaveLength(3);
    expect(s.content.certs[0]).toEqual({
      number: "Fyll i certifikatnummer",
      validUntil: "—",
    });
    expect(s.key).toBe("certifications");
  });
});
