// @vitest-environment node
import { describe, it, expect } from "vitest";
import { deriveColors, LAYOUT, PHASE_BAR_COLORS } from "../pptx/constants";

const testColors = {
  primary: "#1A2B4A",
  primaryLight: "#2D4A7A",
  secondary: "#E8913A",
  secondaryLight: "#F4B76E",
  accent: "#2E8B57",
  dark: "#1A1A1A",
  light: "#F5F5F0",
  muted: "#6B7280",
};

describe("deriveColors", () => {
  it("produces a headerBg lighter than primary", () => {
    const derived = deriveColors(testColors);
    // headerBg should be a 6-char hex string
    expect(derived.headerBg).toMatch(/^[0-9A-Fa-f]{6}$/);
    // It should be lighter than primary (higher sum of RGB)
    const parseHex = (h: string) => [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
    const primarySum = parseHex("1A2B4A").reduce((a, b) => a + b, 0);
    const headerSum = parseHex(derived.headerBg).reduce((a, b) => a + b, 0);
    expect(headerSum).toBeGreaterThan(primarySum);
  });

  it("returns 5 phase bar colors", () => {
    expect(PHASE_BAR_COLORS).toHaveLength(5);
    for (const color of PHASE_BAR_COLORS) {
      expect(color).toMatch(/^[0-9A-Fa-f]{6}$/);
    }
  });
});

describe("LAYOUT", () => {
  it("defines slide dimensions", () => {
    expect(LAYOUT.slideW).toBeGreaterThan(0);
    expect(LAYOUT.slideH).toBeGreaterThan(0);
    expect(LAYOUT.headerH).toBeGreaterThan(0);
    expect(LAYOUT.footerH).toBeGreaterThan(0);
    expect(LAYOUT.sidebarW).toBeGreaterThan(0);
    expect(LAYOUT.contentX).toBeGreaterThan(LAYOUT.sidebarW);
  });
});
