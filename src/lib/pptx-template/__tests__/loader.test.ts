// @vitest-environment node
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { renderTemplate, applicatorFor } from "../loader";
import type { BidSection } from "../../types";

const minimalSections: BidSection[] = [
  {
    type: "data",
    key: "cover",
    title: "Cover",
    generatedAt: "2026-04-19",
    content: {
      format: "cover",
      title: "Testanbud",
      client: "TestKund",
      date: "2026-04-19",
    },
  },
];

/**
 * pptx-automizer appends new slides to the archive rather than overwriting
 * existing ones — the removed slides are only unlisted in presentation.xml.
 * The cover slide we add is therefore NOT at ppt/slides/slide1.xml but at the
 * last slide number.  We scan all slide XMLs so the test is index-agnostic.
 */
async function getAllSlideXml(zip: JSZip): Promise<string[]> {
  const entries = Object.keys(zip.files).filter((f) =>
    /^ppt\/slides\/slide\d+\.xml$/.test(f),
  );
  return Promise.all(entries.map((e) => zip.file(e)!.async("text")));
}

describe("renderTemplate — cover only", () => {
  it("replaces cover placeholders on the cover slide", async () => {
    const buf = await renderTemplate("anbudsmall-v2", minimalSections, {
      companyName: "TestCo AB",
      clientName: "TestKund",
      diaryNumber: "TST-2026-0001",
      bidName: "Testanbud",
      bidDate: "2026-04-19",
    });

    const zip = await JSZip.loadAsync(buf);
    const allSlides = await getAllSlideXml(zip);

    // The cover slide (added by our applicator) must have all placeholders replaced.
    // We find it by presence of the replacement values.
    const coverSlide = allSlides.find((s) => s.includes("TestCo AB"));
    expect(coverSlide).toBeDefined();

    const slide1 = coverSlide!;

    expect(slide1).toContain("TestCo AB");
    expect(slide1).not.toContain("{Bolagsnamn}");

    expect(slide1).toContain("Testanbud");
    expect(slide1).not.toContain("{Upphandlingens namn}");

    expect(slide1).toContain("2026-04-19");
    expect(slide1).not.toContain("{Anbudsdatum}");

    expect(slide1).not.toContain("{Kundnamn}");
  });
});

describe("applicatorFor — fail-loud", () => {
  it("throws on an unknown slide type", () => {
    expect(() =>
      applicatorFor(
        // @ts-expect-error — deliberately invalid type to test fail-loud path
        { source: 99, type: "unknown-type" },
        {
          sections: [],
          master: {
            companyName: "",
            clientName: "",
            diaryNumber: "",
            bidName: "",
            bidDate: "",
          },
          slideNum: 1,
          totalSlides: 1,
          sourceSlide: 99,
        },
      ),
    ).toThrow(/unknown slide type/i);
  });
});
