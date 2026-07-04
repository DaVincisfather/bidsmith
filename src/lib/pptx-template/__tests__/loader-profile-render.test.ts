// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { TemplateManifest } from "../manifest-types";
import type { TemplateProfile } from "../template-profile";
import type { LoadedTemplate } from "../template-store";
import type { BidSection } from "../../types";
import type { MasterContext } from "../types";

// The env-flag render path returns early via renderFromProfile — mock it (and the
// two profile sources) so we can assert WHICH profile it renders with, without a
// real pptx. #49: the flag path must load the PERSISTED profile, not derive one.
const renderFromProfile = vi.fn((..._a: unknown[]) => Promise.resolve(Buffer.from("pptx")));
const manifestToProfile = vi.fn();
const loadTemplateProfile = vi.fn();

vi.mock("../render-from-profile", () => ({
  renderFromProfile: (...a: unknown[]) => renderFromProfile(...a),
}));
vi.mock("../manifest-to-profile", () => ({
  manifestToProfile: (...a: unknown[]) => manifestToProfile(...a),
}));
vi.mock("../profile-store", () => ({
  loadTemplateProfile: (...a: unknown[]) => loadTemplateProfile(...a),
}));

import { renderTemplate } from "../loader";

const tpl: Pick<LoadedTemplate, "manifest" | "templateFile"> & { id?: string } = {
  id: "tpl-foreign",
  manifest: { name: "kundmall", slides: [] } as unknown as TemplateManifest,
  templateFile: "/tmp/kundmall.pptx",
};
const sections: BidSection[] = [];
const master: MasterContext = {
  companyName: "", clientName: "", diaryNumber: "", bidName: "", bidDate: "",
};

const storedProfile: TemplateProfile = {
  profileVersion: 1,
  templateId: "tpl-foreign",
  name: "kundmall",
  version: 1,
  slides: [{ source: 1, capability: "generic-prose", slots: [] }],
};

beforeEach(() => {
  renderFromProfile.mockClear();
  manifestToProfile.mockReset();
  loadTemplateProfile.mockReset();
  process.env.BIDSMITH_PROFILE_RENDER = "1";
});
afterEach(() => {
  delete process.env.BIDSMITH_PROFILE_RENDER;
});

describe("renderTemplate env-flag path — persisted profile (#49)", () => {
  it("renders with the STORED profile, not a manifest-derived one", async () => {
    loadTemplateProfile.mockResolvedValue(storedProfile);

    await renderTemplate(tpl, sections, master);

    expect(loadTemplateProfile).toHaveBeenCalledWith("tpl-foreign");
    expect(manifestToProfile).not.toHaveBeenCalled();
    expect(renderFromProfile).toHaveBeenCalledWith(tpl, storedProfile, sections, master);
  });

  it("falls back to the manifest-derived profile when none is stored (bundled template)", async () => {
    loadTemplateProfile.mockResolvedValue(null);
    const derived = { ...storedProfile, name: "derived" };
    manifestToProfile.mockReturnValue(derived);

    await renderTemplate(tpl, sections, master);

    expect(manifestToProfile).toHaveBeenCalledWith(tpl.manifest, { templateId: "tpl-foreign" });
    expect(renderFromProfile).toHaveBeenCalledWith(tpl, derived, sections, master);
  });
});
