import { describe, it, expect } from "vitest";
import type { SlideShapes } from "../../introspect/read-pptx";
import { isForeignPptx } from "../detect-foreign";

function slide(tokens: string[]): SlideShapes {
  return { source: 1, shapes: [], tokens, images: { placed: 0, placeholders: 0 } } as unknown as SlideShapes;
}

describe("isForeignPptx", () => {
  it("tokenlös mall är foreign", () => {
    expect(isForeignPptx([slide([]), slide([])])).toBe(true);
  });
  it("en enda token → INTE foreign (delvis instrumenterad går dagens 422-väg)", () => {
    expect(isForeignPptx([slide([]), slide(["{Namn}"])])).toBe(false);
  });
});
