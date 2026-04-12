# Bid Editor — Design Spec

## Problem

The current PPTX output (pptxgenjs) produces visually unacceptable slides — broken text box placement, amateurish layout, no design quality. Consultants need professional output they can iterate on collaboratively. The current `BidPreview` component only shows truncated previews with a "Regenerate" button — no editing, no visual fidelity.

## Solution

Replace `BidPreview` + `BidSectionCard` with a full Bid Editor that renders `BidSection[]` as styled HTML, supports inline editing, per-section AI chat with format-switching, and exports to PPTX via a template-based engine (python-pptx).

## What stays unchanged

- `BidSection[]` as the core data model
- The entire AI pipeline: planner → validator → generator → `BidSection[]`
- Supabase storage (bids table with sections JSONB column)
- `StyleGuide` type (colors, font, logoUrl) per organization
- API routes: `POST /api/bids`, `GET /api/bids/[id]`, `POST /api/bids/[id]/regenerate/[sectionKey]`

## Architecture

```
AI Pipeline (unchanged)
    → BidSection[] (unchanged, stored in Supabase)
        → Bid Editor (new: HTML rendering + inline edit + AI chat)
        → PPTX Template Engine (new: python-pptx microservice, replaces pptxgenjs)
```

## Phases

The project is split into three independently deliverable phases:

### Phase 1: Bid Editor UI (this spec)

HTML rendering of all section formats with inline editing, drag-and-drop reordering, and save-to-Supabase. Uses existing pptxgenjs export as a temporary bridge.

### Phase 2: Section AI Chat + format switching

Per-section chat sidebar. AI can modify content and switch format (e.g. prose → bullets, or "add a gantt chart here"). Separate spec.

### Phase 3: PPTX Template Engine

Professional `.pptx` template filled via python-pptx microservice. Org settings page (color pickers, logo upload, font selector). Separate spec.

---

## Phase 1 Spec: Bid Editor UI

### Components

**`BidEditor`** — top-level component, replaces `BidPreview`.

Props: `{ bidId: string; initialSections: BidSection[]; initialStatus: string; styleGuide: StyleGuide }`

Layout:
- **Left panel** (200px, collapsible): vertical section list for navigation and drag-to-reorder
- **Center panel** (fluid): full-width rendering of all sections as styled HTML, scrollable document view
- **Right panel** (placeholder for Phase 2): collapsed by default, reserved for AI chat sidebar

**`SectionNav`** — left panel. Renders section titles as a list. Click scrolls to section. Drag-and-drop reorders sections. Shows format icon per section type.

**`SectionRenderer`** — pure component that takes a `BidSection` + `StyleGuide` and returns styled HTML. One sub-renderer per format:

| Format | Renderer | Visual treatment |
|--------|----------|-----------------|
| `cover` | `CoverRenderer` | Full-width colored banner with title, client, date. StyleGuide.primary background. |
| `section-divider` | `DividerRenderer` | Colored strip with section number + title + subtitle. |
| `prose` | `ProseRenderer` | Title + body text. Clean typography. |
| `bullets` | `BulletsRenderer` | Title + styled bullet list with accent-colored markers. |
| `three-column` | `ThreeColumnRenderer` | Three cards side-by-side with icon circle + title + body. |
| `phases` | `PhasesRenderer` | Cards per phase with colored header, activities, deliverables, risks. |
| `gantt` | `GanttRenderer` | Horizontal bar chart with phase durations and milestones. |
| `team` | `TeamRenderer` | Cards per consultant with role, experience, competency tags. |
| `requirement-matrix` | `MatrixRenderer` | Styled table with check/cross icons per consultant per requirement. |
| `references` | `ReferencesRenderer` | Cards with title, client, year, relevance. |
| `placeholder` | `PlaceholderRenderer` | Dashed-border box with instruction text. |

**`EditableText`** — wrapper component for contentEditable fields. Handles focus, blur, debounced onChange. Used inside renderers for editable text fields (titles, prose text, bullet items, etc.).

### Editing behavior

- Text fields in renderers are wrapped in `EditableText`
- On blur or after 1s debounce: component emits `onSectionChange(key, updatedSection)`
- `BidEditor` batches changes and PATCHes to `/api/bids/[id]` (existing endpoint)
- Optimistic update — UI updates immediately, API call in background
- Conflict: last-write-wins (single-user for now)

### What is editable per format

| Format | Editable fields |
|--------|----------------|
| `cover` | title, client, date |
| `section-divider` | title, subtitle |
| `prose` | title, text |
| `bullets` | title, individual items (add/remove/reorder) |
| `three-column` | column titles, column bodies |
| `phases` | phase names, objectives, activities, deliverables, durations, risks |
| `gantt` | Not directly editable (derived from phases data) |
| `team` | member roles, relevantExperience, keyCompetencies |
| `requirement-matrix` | Not directly editable (derived from data) |
| `references` | title, client, year, description, relevance |
| `placeholder` | instruction text |

### Section management

- **Add section**: button at bottom of section list. Opens a picker with available formats. Creates a new `BidSection` with empty/default content.
- **Remove section**: delete button per section (with confirmation for AI-generated sections).
- **Reorder**: drag-and-drop in the left panel. Updates array order, saves to Supabase.

### Drag-and-drop

Use `@dnd-kit/core` (already common in Next.js projects, zero-config). Reorder updates the `sections` array index and saves.

### Visual design principles

- Sections render as a continuous document (like Google Docs / Notion), not isolated cards
- `StyleGuide` colors applied throughout: primary for headers/dividers, secondary for accents, accent for highlights
- Clean typography: font from StyleGuide, generous whitespace, max-width ~800px for readability
- Section boundaries marked by subtle dividers or spacing, not heavy borders
- The editor view should approximate (not pixel-match) how the final PPTX will look

### API changes

**Modified endpoint:**
- `PATCH /api/bids/[id]` — accept `{ sections: BidSection[] }` to save full section array (exists, may need to accept partial updates)

**No new endpoints for Phase 1.** Regenerate endpoint already exists.

### Files

**New:**
- `src/components/bid-editor/BidEditor.tsx` — top-level editor component
- `src/components/bid-editor/SectionNav.tsx` — left panel navigation
- `src/components/bid-editor/EditableText.tsx` — contentEditable wrapper
- `src/components/bid-editor/renderers/CoverRenderer.tsx`
- `src/components/bid-editor/renderers/DividerRenderer.tsx`
- `src/components/bid-editor/renderers/ProseRenderer.tsx`
- `src/components/bid-editor/renderers/BulletsRenderer.tsx`
- `src/components/bid-editor/renderers/ThreeColumnRenderer.tsx`
- `src/components/bid-editor/renderers/PhasesRenderer.tsx`
- `src/components/bid-editor/renderers/GanttRenderer.tsx`
- `src/components/bid-editor/renderers/TeamRenderer.tsx`
- `src/components/bid-editor/renderers/MatrixRenderer.tsx`
- `src/components/bid-editor/renderers/ReferencesRenderer.tsx`
- `src/components/bid-editor/renderers/PlaceholderRenderer.tsx`
- `src/components/bid-editor/renderers/index.ts` — barrel export + `renderSection` dispatcher

**New route:**
- `src/app/bids/[id]/page.tsx` — dedicated bid editor page, fetches bid + org style guide, renders `BidEditor`

**Modified:**
- `src/app/api/bids/[id]/route.ts` — ensure PATCH accepts full sections array
- `src/components/analysis-match-section.tsx` — "Visa anbud" link points to `/bids/[id]` instead of inline preview

**Removed (after Phase 1 is complete):**
- `src/components/bid-preview.tsx`
- `src/components/bid-section-card.tsx`

### Dependencies

- `@dnd-kit/core` + `@dnd-kit/sortable` — drag-and-drop
- No other new dependencies. All rendering is plain React + Tailwind.

### Testing

- Unit tests per renderer: given a `BidSection` + `StyleGuide`, renders expected HTML structure
- Integration test: `BidEditor` renders all section types, editing a text field fires `onSectionChange`
- Manual test: load a bid with all section types, visually verify rendering, edit text, verify save

### Out of scope (Phase 1)

- AI chat sidebar (Phase 2)
- Format switching via AI (Phase 2)
- PPTX template engine (Phase 3)
- Org settings page (Phase 3)
- Multi-user collaboration / real-time sync
- Undo/redo
- Image upload
- Custom CSS or advanced theming
