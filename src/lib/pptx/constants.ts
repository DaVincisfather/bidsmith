import { StyleGuide } from "../types";

// LAYOUT_WIDE = 13.33" × 7.5"
export const LAYOUT = {
  slideW: 13.33,
  slideH: 7.5,
  sidebarW: 0.1,         // ~8px
  headerH: 1.05,         // ~14% of 7.5
  accentLineH: 0.04,     // ~3px
  footerH: 0.38,         // ~36px
  marginL: 0.6,          // left margin (after sidebar)
  marginR: 0.45,
  marginT: 0.35,         // below accent line
  contentX: 0.6,         // = sidebarW + padding
  contentW: 12.28,       // slideW - contentX - marginR
  contentY: 1.44,        // headerH + accentLineH + marginT
  contentH: 5.68,        // slideH - contentY - footerH
} as const;

// Fixed palette for Gantt phase bars (no gradient in pptxgenjs — use solid midpoint)
export const PHASE_BAR_COLORS = [
  "E8913A", // orange
  "2E8B57", // green
  "2D4A7A", // blue
  "7C3AED", // purple
  "DC2626", // red
];

// Blend a hex color toward white by a given factor (0 = original, 1 = white)
function blendToWhite(hex: string, factor: number): string {
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const blend = (c: number) => Math.round(c + (255 - c) * factor);
  return [blend(r), blend(g), blend(b)]
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToRgb(hex: string): string {
  return hex.replace("#", "");
}

export interface DerivedColors {
  headerBg: string;
  headerBgLight: string;
  headerBorder: string;
}

export function deriveColors(colors: StyleGuide["colors"]): DerivedColors {
  const primary = hexToRgb(colors.primary);
  return {
    headerBg: blendToWhite(primary, 0.55),
    headerBgLight: blendToWhite(primary, 0.65),
    headerBorder: blendToWhite(primary, 0.45),
  };
}
