# PPTX Renderer v2 — Visual Polish Design Spec

**Date:** 2026-04-09
**Status:** Draft
**Depends on:** M2 bid generation (merged to master)

## Problem

Current PPTX output is functionally correct but visually flat: plain text on white backgrounds, no consistent layout grid, no header/footer, no visual hierarchy. It doesn't match the quality of real winning bids (anbud 2, anbud 3 used as reference).

## Design Goals

1. **Professional and pedagogical** — the reader should immediately understand structure and hierarchy
2. **Visually polished** — gradient accents, colored panels, icons, Gantt charts — not just text
3. **Branded** — uses the organization's StyleGuide colors throughout
4. **Robust** — handles overflow (team 4+, long text, many phases) via pagination

## Reference Material

Analyzed two real bids in `data/real anonymiserad/referensfiler/`:
- **anbud 2 anon.pptx** — won bid. Dark header bands, two-column layouts, accent lines, Gantt chart with month columns, phase detail slides with activities/deliverables/risks.
- **anbud 3.pptx** — Eskilstuna. Phase number circles, hours badges, three-column layouts, progress indicators (numbered dots), footer with reference number.

## 8 Slide Types

### 1. Cover

- Full-slide layout, no header/footer
- Light gradient background using `primaryLight` → `light` from StyleGuide
- Left side: accent line + "ANBUD" label + title + client + date
- Right side: logo placeholder (bottom-right)
- Geometric decorative elements: subtle diagonal shape, dot pattern, thin accent lines
- Bottom accent bar: gradient `primary` → `primaryLight`
- Left edge: 8px sidebar in `primary` gradient

### 2. Section Divider

- Light background (`light`)
- Left sidebar accent (8px, `primary` gradient)
- Large faded section number in background (4% opacity of `primary`)
- "Avsnitt 02" label with `accent` color + letter-spacing
- Section title in `primary`, large (28pt)
- Subtitle in `muted`
- Bottom accent bar

### 3. Content — Two Column

- **Master elements:** sidebar, header band, accent line, footer (see Common Elements below)
- Left column: main content with icon-boxes next to sub-headings
- Right column: colored panel (`light` background, border) with deliverables/supplementary info
- Icon-boxes: 28px square with light gradient background, geometric icon inside
- Bullet style: small colored dots (4px, `accent` color)

### 4. Content — Three Column

- **Master elements:** sidebar, header band, accent line, footer
- Three equal panels with rounded corners and border
- Each panel has a colored top-bar (5px) in distinct color (e.g., `accent`, `secondaryLight`, `primaryLight`)
- Each panel has an initial-icon (28px, gradient background matching top-bar color)
- Panel title + body text

**New type needed:** `BidSectionContent` union gets a new variant:
```typescript
| { format: "three-column"; columns: { title: string; icon: string; body: string; color: string }[] }
```

### 5. Phase Detail

- **Master elements:** sidebar, header band (with modifications), accent line, footer
- Header modifications:
  - Phase number in circle (40px, `accent` gradient, with shadow)
  - Phase title
  - Period (right-aligned, muted)
  - Hours badge (pill shape, light orange background with border)
- Content area:
  - Left: numbered activities (01, 02, 03...) with icon-box
  - Right top: deliverables panel (light background, green dots)
  - Right bottom: risk panel (warm orange background, left border in `accent`, warning icon)
- Progress indicator at bottom: connected dots showing current phase (active = `accent` gradient, inactive = light gray)

**New fields needed in `ExecutionPhase`:**
```typescript
interface ExecutionPhase {
  name: string;
  objective: string;
  activities: string[];
  deliverables: string[];
  duration: string;
  risks?: string[];          // NEW
  hoursEstimate?: number;    // NEW — for badge display
  period?: string;           // NEW — e.g. "Mars 2026"
}
```

### 6. Gantt / Timeline

- **Master elements:** sidebar, header band, accent line, footer
- Metadata bar below header: period, volume, breaks (light background, border)
- Month column headers: gradient background using `primaryLight`, `primary` text
- Inactive months (breaks): gray gradient
- Phase rows: label (right-aligned, 20% width) + bar area with grid lines
  - Each phase gets a distinct gradient color from a fixed palette
  - Bar shows hours inside (white text, bold)
  - Bar has subtle shadow
- Milestone markers: diamond shapes (rotated square) in `accent` gradient below timeline
- Grid lines: 10% intervals, light gray

**Data mapping:** Uses `phases` from the existing phases section. Duration needs to be parseable to calculate bar width and position. Milestones are extracted from deliverables.

### 7. Team Cards

- **Master elements:** sidebar, header band, accent line, footer
- Cards in a row (max 3 per slide, paginate at 4+)
- Each card:
  - Subtle header gradient at top
  - Initials avatar (48px circle, gradient — rotating through `primary`, `accent`, `secondary`)
  - Name (bold), role (accent color)
  - Horizontal divider line
  - Experience summary text
  - Competency tags (pill shapes, light gradient background)
- Card has rounded corners, light border, white background

### 8. Requirement Matrix

- **Master elements:** sidebar, header band, accent line, footer
- Table with zebra-striping (alternating `light` / white rows)
- Header row: `primary` background, white text
- Check/cross marks: green (`accent`) / red with slightly larger font
- Priority column: "Ska" in bold `primary`, "Bör" in muted
- Same logic as current implementation, just restyled

## Common Elements (Slide Master)

Applied to all slides except Cover:

| Element | Spec |
|---------|------|
| **Left sidebar** | 8px wide, gradient top→bottom `primary` → `primaryLight` |
| **Header band** | Height: ~14% of slide. Background: medium-strength gradient (stronger than content boxes). Contains accent bar (4px, `accent` gradient) + section title + logo |
| **Accent line** | 3px below header. Gradient: `accent` → `secondaryLight` → transparent |
| **Footer** | 36px height, top border. Left: "Konfidentiellt". Right: page number "X / Y" |
| **Logo** | Right side of header, small, muted color |

### Header Band Color Strategy

The header should be visually distinct from content panels. Use a mid-tone derived from `primary`:
- Mix `primary` with white at ~30-40% opacity as base
- Gradient from slightly darker to slightly lighter (left → right)
- Text stays in `primary` (dark) for readability

In pptxgenjs terms: calculate a mid-tone hex from the StyleGuide's `primary` color by blending toward white.

## Color Palette Usage

From the existing `StyleGuide.colors`:

| Color | Role |
|-------|------|
| `primary` (#1A2B4A) | Sidebar, text headings, avatar backgrounds |
| `primaryLight` (#2D4A7A) | Sidebar gradient end, secondary headings |
| `secondary` (#E8913A) | Same as accent in current scheme |
| `secondaryLight` (#F4B76E) | Gradient endpoints for accent elements |
| `accent` (#2E8B57) | Check marks, deliverable dots, success indicators |
| `dark` (#1A1A1A) | Body text |
| `light` (#F5F5F0) | Panel backgrounds, content box fills |
| `muted` (#6B7280) | Footer text, secondary labels |

**Derived colors (computed at render time):**
- `headerBg`: blend `primary` toward white at 35% → ~#a8b8cc
- `headerBgLight`: blend `primary` toward white at 45% → ~#bcc9d8
- Phase bar colors: fixed palette of 5 gradients (orange, green, blue, purple, red)

## pptxgenjs Constraints

| CSS concept | pptxgenjs equivalent |
|-------------|---------------------|
| Gradient background | Not supported on shapes. Use solid fill. Pick the midpoint color of the intended gradient. |
| Rounded corners | `rectRadius` on shapes (in inches) |
| Shadows | `shadow` property on shapes: `{ type: 'outer', blur: 3, offset: 2, color: '000000', opacity: 0.15 }` |
| Circles | `addShape(pptx.ShapeType.ellipse, ...)` |
| Diamonds | `addShape(pptx.ShapeType.diamond, ...)` |
| Lines | `addShape(pptx.ShapeType.line, ...)` |
| Progress dots connected | Series of ellipses + lines |

## Type Changes

### New `BidSectionContent` variant

```typescript
| { format: "three-column"; columns: { title: string; icon: string; body: string }[] }
```

### Extended `ExecutionPhase`

```typescript
interface ExecutionPhase {
  name: string;
  objective: string;
  activities: string[];
  deliverables: string[];
  duration: string;
  risks?: string[];
  hoursEstimate?: number;
  period?: string;
}
```

### New helper: `StyleGuide` derived colors

```typescript
function deriveColors(style: StyleGuide): {
  headerBg: string;
  headerBgLight: string;
  headerBorder: string;
  phaseColors: string[][];  // [startColor, endColor][] for gantt bars
}
```

## Slide Ordering

The renderer processes sections in order. Expected section sequence in a bid:

1. Cover (format: `cover`)
2. TOC (format: `placeholder` — existing, keep as-is)
3. Section divider: "Uppdragsförståelse"
4. Understanding content (format: `prose` or `three-column`)
5. Value proposition (format: `prose` or `bullets`)
6. Section divider: "Genomförandeplan"
7. Gantt overview (format: `phases` — rendered as Gantt)
8. Phase 1 detail (format: `phases` — rendered as phase-detail slides)
9. Phase 2 detail...
10. Quality/method (format: `prose` or `bullets`)
11. Risk management (format: `bullets`)
12. Team (format: `team`)
13. Requirement matrix (format: `requirement-matrix`)
14. References (format: `references`)
15. Pricing placeholder (format: `placeholder`)

## Pagination Rules

| Slide type | Trigger | Action |
|-----------|---------|--------|
| Team | >3 members | Split into multiple slides, 3 per slide |
| References | >3 references | Split into multiple slides |
| Requirement matrix | >8 rows | Split into continuation slide |
| Prose | Text exceeds content area | Truncate with "..." (AI should respect length limits) |
| Phases | Always | One slide per phase (already the case) |

## Files to Modify

1. **`src/lib/pptx-renderer.ts`** — Complete rewrite of all render functions
2. **`src/lib/types.ts`** — Add `three-column` format, extend `ExecutionPhase`
3. **`src/lib/bid-section-prompts.ts`** — Update prompts to generate risks, hours, period per phase
4. **`src/lib/bid-generator.ts`** — Add three-column section generation, pass new phase fields
5. **`src/lib/ai-schemas.ts`** — Update Zod schemas for new fields
6. **`src/lib/__tests__/pptx-renderer.test.ts`** — Update tests for new slide types

## Out of Scope

- Logo image embedding (requires image upload feature — use text placeholder for now)
- Custom fonts (pptxgenjs uses system fonts — stick with Calibri/Arial)
- Slide transitions/animations
- TOC with clickable links (pptxgenjs limitation)
- Editable template upload (future feature)

## Visual Reference

HTML mockups saved in `.superpowers/brainstorm/` (v2 = polished dark, v3 = light headers).
