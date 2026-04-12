# Bid Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current card-based `BidPreview` with a full HTML bid editor — styled section renderers, inline contentEditable editing, drag-and-drop reorder, and auto-save to Supabase.

**Architecture:** Each `BidSectionContent` format gets a dedicated React renderer that produces styled HTML driven by `StyleGuide` colors. An `EditableText` wrapper handles contentEditable + debounced save. `BidEditor` orchestrates state, auto-save, and hosts a left-side `SectionNav` for navigation/reorder. A new `/bids/[id]` page replaces the inline `BidPreview`.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS 4, @dnd-kit/core + @dnd-kit/sortable, Vitest, Supabase.

**Spec:** `docs/superpowers/specs/2026-04-12-bid-editor-design.md` — read this if any task is ambiguous.

---

## File structure

**New files:**
- `src/components/bid-editor/EditableText.tsx` — contentEditable wrapper with debounced onChange
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
- `src/components/bid-editor/renderers/index.ts` — barrel export + `SectionRenderer` dispatcher
- `src/components/bid-editor/SectionNav.tsx` — left panel navigation + drag-and-drop reorder
- `src/components/bid-editor/BidEditor.tsx` — top-level orchestrator
- `src/app/bids/[id]/page.tsx` — server component page that fetches bid and renders editor
- `src/lib/__tests__/renderers.test.tsx` — unit tests for renderers

**Modified files:**
- `src/app/api/bids/[id]/route.ts` — extend PATCH to accept `{ sections: BidSection[] }`
- `src/components/analysis-match-section.tsx` — replace inline `BidPreview` with link to `/bids/[id]`

---

## Task 1: Install @dnd-kit and scaffold directories

**Files:**
- Modify: `package.json`
- Create: `src/components/bid-editor/renderers/` (directory)

- [ ] **Step 1: Install dnd-kit**

```bash
cd C:\Users\stefa\projects\agentic-dealflow
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

- [ ] **Step 2: Verify installation**

Run: `node -e "require('@dnd-kit/core'); console.log('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install @dnd-kit for drag-and-drop"
```

---

## Task 2: EditableText component

**Files:**
- Create: `src/components/bid-editor/EditableText.tsx`

- [ ] **Step 1: Create the EditableText component**

This is a contentEditable wrapper that debounces changes and calls `onChange` with the new text.

```tsx
// src/components/bid-editor/EditableText.tsx
"use client";

import { useRef, useEffect, useCallback } from "react";

interface EditableTextProps {
  value: string;
  onChange: (value: string) => void;
  as?: "p" | "h2" | "h3" | "h4" | "span" | "li";
  className?: string;
  placeholder?: string;
}

export function EditableText({
  value,
  onChange,
  as: Tag = "p",
  className = "",
  placeholder = "",
}: EditableTextProps) {
  const ref = useRef<HTMLElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null);
  const lastValueRef = useRef(value);

  // Sync external value changes (e.g. AI regeneration) into the DOM
  useEffect(() => {
    if (ref.current && value !== lastValueRef.current) {
      ref.current.textContent = value;
      lastValueRef.current = value;
    }
  }, [value]);

  const handleInput = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      const text = ref.current?.textContent ?? "";
      if (text !== lastValueRef.current) {
        lastValueRef.current = text;
        onChange(text);
      }
    }, 1000);
  }, [onChange]);

  const handleBlur = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const text = ref.current?.textContent ?? "";
    if (text !== lastValueRef.current) {
      lastValueRef.current = text;
      onChange(text);
    }
  }, [onChange]);

  return (
    <Tag
      ref={ref as React.RefObject<never>}
      contentEditable
      suppressContentEditableWarning
      onInput={handleInput}
      onBlur={handleBlur}
      className={`outline-none focus:ring-2 focus:ring-blue-200 focus:ring-offset-1 rounded px-0.5 -mx-0.5 ${className}`}
      data-placeholder={placeholder}
    >
      {value}
    </Tag>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/bid-editor/EditableText.tsx
git commit -m "feat(bid-editor): add EditableText contentEditable wrapper"
```

---

## Task 3: Read-only renderers — Cover, Divider, Placeholder

These three are data-driven (no AI content) and have the simplest visual treatment. We build them first as read-only, then add editing in a later task.

**Files:**
- Create: `src/components/bid-editor/renderers/CoverRenderer.tsx`
- Create: `src/components/bid-editor/renderers/DividerRenderer.tsx`
- Create: `src/components/bid-editor/renderers/PlaceholderRenderer.tsx`

- [ ] **Step 1: Create CoverRenderer**

```tsx
// src/components/bid-editor/renderers/CoverRenderer.tsx
"use client";

import { StyleGuide } from "@/lib/types";
import { EditableText } from "../EditableText";

interface CoverRendererProps {
  title: string;
  client: string;
  date: string;
  style: StyleGuide;
  onFieldChange?: (field: "title" | "client" | "date", value: string) => void;
}

export function CoverRenderer({ title, client, date, style, onFieldChange }: CoverRendererProps) {
  const c = style.colors;

  return (
    <div
      className="relative overflow-hidden rounded-lg py-16 px-12"
      style={{ backgroundColor: c.primary }}
    >
      {/* Decorative accent bar */}
      <div
        className="absolute top-0 left-0 w-full h-1"
        style={{ backgroundColor: c.secondary }}
      />

      <p
        className="text-xs font-bold tracking-[0.3em] uppercase mb-6"
        style={{ color: c.secondaryLight }}
      >
        ANBUD
      </p>

      {onFieldChange ? (
        <EditableText
          value={title}
          onChange={(v) => onFieldChange("title", v)}
          as="h2"
          className="text-3xl font-bold leading-tight mb-8 text-white"
        />
      ) : (
        <h2 className="text-3xl font-bold leading-tight mb-8 text-white">{title}</h2>
      )}

      <div className="w-16 h-0.5 mb-6" style={{ backgroundColor: c.muted }} />

      {onFieldChange ? (
        <>
          <EditableText
            value={client}
            onChange={(v) => onFieldChange("client", v)}
            as="p"
            className="text-lg text-white/80 mb-2"
          />
          <EditableText
            value={date}
            onChange={(v) => onFieldChange("date", v)}
            as="p"
            className="text-sm text-white/60"
          />
        </>
      ) : (
        <>
          <p className="text-lg text-white/80 mb-2">{client}</p>
          <p className="text-sm text-white/60">{date}</p>
        </>
      )}

      {/* Bottom accent */}
      <div
        className="absolute bottom-0 left-0 w-1/2 h-1"
        style={{ backgroundColor: c.secondary }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create DividerRenderer**

```tsx
// src/components/bid-editor/renderers/DividerRenderer.tsx
"use client";

import { StyleGuide } from "@/lib/types";
import { EditableText } from "../EditableText";

interface DividerRendererProps {
  sectionNumber: number;
  title: string;
  subtitle: string;
  style: StyleGuide;
  onFieldChange?: (field: "title" | "subtitle", value: string) => void;
}

export function DividerRenderer({ sectionNumber, title, subtitle, style, onFieldChange }: DividerRendererProps) {
  const c = style.colors;

  return (
    <div
      className="rounded-lg py-10 px-12 flex items-center gap-8"
      style={{ backgroundColor: c.primaryLight }}
    >
      <span
        className="text-5xl font-bold shrink-0"
        style={{ color: c.secondary }}
      >
        {String(sectionNumber).padStart(2, "0")}
      </span>
      <div>
        {onFieldChange ? (
          <>
            <EditableText
              value={title}
              onChange={(v) => onFieldChange("title", v)}
              as="h3"
              className="text-xl font-bold text-white"
            />
            <EditableText
              value={subtitle}
              onChange={(v) => onFieldChange("subtitle", v)}
              as="p"
              className="text-sm text-white/70 mt-1"
            />
          </>
        ) : (
          <>
            <h3 className="text-xl font-bold text-white">{title}</h3>
            <p className="text-sm text-white/70 mt-1">{subtitle}</p>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create PlaceholderRenderer**

```tsx
// src/components/bid-editor/renderers/PlaceholderRenderer.tsx
"use client";

import { StyleGuide } from "@/lib/types";
import { EditableText } from "../EditableText";

interface PlaceholderRendererProps {
  title: string;
  instruction: string;
  style: StyleGuide;
  onFieldChange?: (field: "instruction", value: string) => void;
}

export function PlaceholderRenderer({ title, instruction, style, onFieldChange }: PlaceholderRendererProps) {
  return (
    <div className="border-2 border-dashed border-gray-300 rounded-lg p-8">
      <h3 className="text-lg font-semibold text-gray-400 mb-2">{title}</h3>
      {onFieldChange ? (
        <EditableText
          value={instruction}
          onChange={(v) => onFieldChange("instruction", v)}
          as="p"
          className="text-sm text-gray-400 italic"
        />
      ) : (
        <p className="text-sm text-gray-400 italic">{instruction}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/bid-editor/renderers/CoverRenderer.tsx src/components/bid-editor/renderers/DividerRenderer.tsx src/components/bid-editor/renderers/PlaceholderRenderer.tsx
git commit -m "feat(bid-editor): add Cover, Divider, Placeholder renderers"
```

---

## Task 4: Content renderers — Prose, Bullets, ThreeColumn

**Files:**
- Create: `src/components/bid-editor/renderers/ProseRenderer.tsx`
- Create: `src/components/bid-editor/renderers/BulletsRenderer.tsx`
- Create: `src/components/bid-editor/renderers/ThreeColumnRenderer.tsx`

- [ ] **Step 1: Create ProseRenderer**

```tsx
// src/components/bid-editor/renderers/ProseRenderer.tsx
"use client";

import { StyleGuide } from "@/lib/types";
import { EditableText } from "../EditableText";

interface ProseRendererProps {
  title: string;
  text: string;
  style: StyleGuide;
  onFieldChange?: (field: "title" | "text", value: string) => void;
}

export function ProseRenderer({ title, text, style, onFieldChange }: ProseRendererProps) {
  const c = style.colors;

  return (
    <div className="py-2">
      {onFieldChange ? (
        <>
          <EditableText
            value={title}
            onChange={(v) => onFieldChange("title", v)}
            as="h3"
            className="text-xl font-bold mb-4"
            style={{ color: c.primary }}
          />
          <EditableText
            value={text}
            onChange={(v) => onFieldChange("text", v)}
            as="p"
            className="text-base leading-7 text-gray-700 whitespace-pre-wrap"
          />
        </>
      ) : (
        <>
          <h3 className="text-xl font-bold mb-4" style={{ color: c.primary }}>{title}</h3>
          <p className="text-base leading-7 text-gray-700 whitespace-pre-wrap">{text}</p>
        </>
      )}
    </div>
  );
}
```

Note: The `EditableText` component's `as` prop renders an HTML element. The `style` JSX prop on `EditableText` won't work because `EditableText` doesn't forward it. Fix: add `style?: React.CSSProperties` to `EditableText`.

- [ ] **Step 2: Add style prop to EditableText**

Open `src/components/bid-editor/EditableText.tsx` and add `style?: React.CSSProperties` to the props interface and forward it to the rendered element:

```tsx
// In the interface, add:
  style?: React.CSSProperties;

// In the JSX, add style={style} to the Tag:
    <Tag
      ref={ref as React.RefObject<never>}
      contentEditable
      suppressContentEditableWarning
      onInput={handleInput}
      onBlur={handleBlur}
      className={`outline-none focus:ring-2 focus:ring-blue-200 focus:ring-offset-1 rounded px-0.5 -mx-0.5 ${className}`}
      style={style}
      data-placeholder={placeholder}
    >
      {value}
    </Tag>
```

- [ ] **Step 3: Create BulletsRenderer**

```tsx
// src/components/bid-editor/renderers/BulletsRenderer.tsx
"use client";

import { StyleGuide } from "@/lib/types";
import { EditableText } from "../EditableText";

interface BulletsRendererProps {
  title: string;
  items: string[];
  style: StyleGuide;
  onFieldChange?: (field: "title", value: string) => void;
  onItemChange?: (index: number, value: string) => void;
  onItemAdd?: () => void;
  onItemRemove?: (index: number) => void;
}

export function BulletsRenderer({
  title,
  items,
  style,
  onFieldChange,
  onItemChange,
  onItemAdd,
  onItemRemove,
}: BulletsRendererProps) {
  const c = style.colors;

  return (
    <div className="py-2">
      {onFieldChange ? (
        <EditableText
          value={title}
          onChange={(v) => onFieldChange("title", v)}
          as="h3"
          className="text-xl font-bold mb-4"
          style={{ color: c.primary }}
        />
      ) : (
        <h3 className="text-xl font-bold mb-4" style={{ color: c.primary }}>{title}</h3>
      )}

      <ul className="space-y-3">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-3 group">
            <span
              className="mt-2 w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: c.secondary }}
            />
            {onItemChange ? (
              <EditableText
                value={item}
                onChange={(v) => onItemChange(i, v)}
                as="span"
                className="text-base leading-7 text-gray-700 flex-1"
              />
            ) : (
              <span className="text-base leading-7 text-gray-700">{item}</span>
            )}
            {onItemRemove && (
              <button
                onClick={() => onItemRemove(i)}
                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 text-sm transition-opacity"
              >
                &times;
              </button>
            )}
          </li>
        ))}
      </ul>

      {onItemAdd && (
        <button
          onClick={onItemAdd}
          className="mt-3 text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          + Ny punkt
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create ThreeColumnRenderer**

```tsx
// src/components/bid-editor/renderers/ThreeColumnRenderer.tsx
"use client";

import { StyleGuide } from "@/lib/types";
import { EditableText } from "../EditableText";

interface Column {
  title: string;
  icon: string;
  body: string;
}

interface ThreeColumnRendererProps {
  title: string;
  columns: Column[];
  style: StyleGuide;
  onColumnChange?: (index: number, field: "title" | "body", value: string) => void;
}

export function ThreeColumnRenderer({
  title,
  columns,
  style,
  onColumnChange,
}: ThreeColumnRendererProps) {
  const c = style.colors;

  return (
    <div className="py-2">
      <h3 className="text-xl font-bold mb-6" style={{ color: c.primary }}>{title}</h3>
      <div className="grid grid-cols-3 gap-6">
        {columns.map((col, i) => (
          <div key={i} className="rounded-lg border border-gray-200 p-6">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm mb-4"
              style={{ backgroundColor: c.secondary }}
            >
              {col.icon}
            </div>
            {onColumnChange ? (
              <>
                <EditableText
                  value={col.title}
                  onChange={(v) => onColumnChange(i, "title", v)}
                  as="h4"
                  className="font-semibold text-gray-900 mb-2"
                />
                <EditableText
                  value={col.body}
                  onChange={(v) => onColumnChange(i, "body", v)}
                  as="p"
                  className="text-sm text-gray-600 leading-relaxed"
                />
              </>
            ) : (
              <>
                <h4 className="font-semibold text-gray-900 mb-2">{col.title}</h4>
                <p className="text-sm text-gray-600 leading-relaxed">{col.body}</p>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/bid-editor/renderers/ProseRenderer.tsx src/components/bid-editor/renderers/BulletsRenderer.tsx src/components/bid-editor/renderers/ThreeColumnRenderer.tsx src/components/bid-editor/EditableText.tsx
git commit -m "feat(bid-editor): add Prose, Bullets, ThreeColumn renderers"
```

---

## Task 5: Data renderers — Phases, Gantt, Team, Matrix, References

**Files:**
- Create: `src/components/bid-editor/renderers/PhasesRenderer.tsx`
- Create: `src/components/bid-editor/renderers/GanttRenderer.tsx`
- Create: `src/components/bid-editor/renderers/TeamRenderer.tsx`
- Create: `src/components/bid-editor/renderers/MatrixRenderer.tsx`
- Create: `src/components/bid-editor/renderers/ReferencesRenderer.tsx`

- [ ] **Step 1: Create PhasesRenderer**

```tsx
// src/components/bid-editor/renderers/PhasesRenderer.tsx
"use client";

import { ExecutionPhase, StyleGuide } from "@/lib/types";
import { EditableText } from "../EditableText";

const PHASE_COLORS = ["#E8913A", "#2E8B57", "#2D4A7A", "#7C3AED", "#DC2626"];

interface PhasesRendererProps {
  phases: ExecutionPhase[];
  style: StyleGuide;
  onPhaseFieldChange?: (phaseIndex: number, field: keyof ExecutionPhase, value: string) => void;
}

export function PhasesRenderer({ phases, style, onPhaseFieldChange }: PhasesRendererProps) {
  const c = style.colors;

  return (
    <div className="py-2 space-y-4">
      {phases.map((phase, i) => {
        const barColor = PHASE_COLORS[i % PHASE_COLORS.length];
        return (
          <div key={i} className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-6 py-3 flex items-center gap-3" style={{ backgroundColor: barColor }}>
              {onPhaseFieldChange ? (
                <EditableText
                  value={phase.name}
                  onChange={(v) => onPhaseFieldChange(i, "name", v)}
                  as="h4"
                  className="font-bold text-white text-sm"
                />
              ) : (
                <h4 className="font-bold text-white text-sm">{phase.name}</h4>
              )}
              {phase.duration && (
                <span className="ml-auto text-xs text-white/80 shrink-0">{phase.duration}</span>
              )}
            </div>
            <div className="px-6 py-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-semibold text-gray-500 text-xs uppercase tracking-wide mb-1">Mål</p>
                {onPhaseFieldChange ? (
                  <EditableText
                    value={phase.objective}
                    onChange={(v) => onPhaseFieldChange(i, "objective", v)}
                    as="p"
                    className="text-gray-700"
                  />
                ) : (
                  <p className="text-gray-700">{phase.objective}</p>
                )}
              </div>
              <div>
                <p className="font-semibold text-gray-500 text-xs uppercase tracking-wide mb-1">Leverabler</p>
                <ul className="space-y-1">
                  {phase.deliverables.map((d, j) => (
                    <li key={j} className="flex items-start gap-2 text-gray-700">
                      <span style={{ color: barColor }}>&#10003;</span> {d}
                    </li>
                  ))}
                </ul>
              </div>
              {phase.risks && phase.risks.length > 0 && (
                <div className="col-span-2">
                  <p className="font-semibold text-gray-500 text-xs uppercase tracking-wide mb-1">Risker</p>
                  <ul className="space-y-1">
                    {phase.risks.map((r, j) => (
                      <li key={j} className="flex items-start gap-2 text-gray-600 text-xs">
                        <span className="text-red-400">&#9888;</span> {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {phase.hoursEstimate && (
                <div className="col-span-2 text-xs text-gray-400">
                  Uppskattade timmar: {phase.hoursEstimate}h
                  {phase.period && <> &middot; {phase.period}</>}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Create GanttRenderer**

```tsx
// src/components/bid-editor/renderers/GanttRenderer.tsx
"use client";

import { ExecutionPhase, StyleGuide } from "@/lib/types";

const PHASE_COLORS = ["#E8913A", "#2E8B57", "#2D4A7A", "#7C3AED", "#DC2626"];

interface Milestone {
  label: string;
  afterPhase: number;
}

interface GanttRendererProps {
  title: string;
  phases: ExecutionPhase[];
  milestones?: Milestone[];
  style: StyleGuide;
}

export function GanttRenderer({ title, phases, milestones = [], style }: GanttRendererProps) {
  const c = style.colors;

  // Parse durations as rough week counts for bar widths
  function parseWeeks(duration: string): number {
    const m = duration.match(/(\d+)/);
    if (!m) return 4;
    const n = parseInt(m[1], 10);
    if (/månad|month/i.test(duration)) return n * 4;
    return n;
  }

  const weekCounts = phases.map((p) => parseWeeks(p.duration));
  const totalWeeks = weekCounts.reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="py-2">
      <h3 className="text-xl font-bold mb-6" style={{ color: c.primary }}>{title}</h3>
      <div className="space-y-2">
        {phases.map((phase, i) => {
          const startWeek = weekCounts.slice(0, i).reduce((a, b) => a + b, 0);
          const leftPct = (startWeek / totalWeeks) * 100;
          const widthPct = (weekCounts[i] / totalWeeks) * 100;
          const barColor = PHASE_COLORS[i % PHASE_COLORS.length];

          const milestoneHere = milestones.find((m) => m.afterPhase === i + 1);

          return (
            <div key={i} className="flex items-center gap-3">
              <span className="text-xs text-gray-500 w-40 shrink-0 truncate">{phase.name}</span>
              <div className="flex-1 relative h-7 bg-gray-100 rounded">
                <div
                  className="absolute top-0 h-full rounded flex items-center px-2"
                  style={{
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    backgroundColor: barColor,
                  }}
                >
                  <span className="text-[10px] text-white font-medium truncate">{phase.duration}</span>
                </div>
                {milestoneHere && (
                  <div
                    className="absolute top-0 h-full flex items-center"
                    style={{ left: `${leftPct + widthPct}%` }}
                  >
                    <div className="w-3 h-3 rotate-45 -ml-1.5" style={{ backgroundColor: c.secondary }} />
                    <span className="text-[9px] text-gray-500 ml-1 whitespace-nowrap">{milestoneHere.label}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create TeamRenderer**

```tsx
// src/components/bid-editor/renderers/TeamRenderer.tsx
"use client";

import { TeamPresentation, StyleGuide } from "@/lib/types";
import { EditableText } from "../EditableText";

interface TeamRendererProps {
  members: TeamPresentation[];
  style: StyleGuide;
  onMemberFieldChange?: (index: number, field: "role" | "relevantExperience", value: string) => void;
}

export function TeamRenderer({ members, style, onMemberFieldChange }: TeamRendererProps) {
  const c = style.colors;

  return (
    <div className="py-2 grid grid-cols-2 gap-4">
      {members.map((member, i) => (
        <div key={i} className="rounded-lg border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
              style={{ backgroundColor: c.primary }}
            >
              {member.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
            </div>
            <div>
              <p className="font-semibold text-gray-900">{member.name}</p>
              {onMemberFieldChange ? (
                <EditableText
                  value={member.role}
                  onChange={(v) => onMemberFieldChange(i, "role", v)}
                  as="p"
                  className="text-sm"
                  style={{ color: c.secondary }}
                />
              ) : (
                <p className="text-sm" style={{ color: c.secondary }}>{member.role}</p>
              )}
            </div>
          </div>
          {onMemberFieldChange ? (
            <EditableText
              value={member.relevantExperience}
              onChange={(v) => onMemberFieldChange(i, "relevantExperience", v)}
              as="p"
              className="text-sm text-gray-600 mb-3"
            />
          ) : (
            <p className="text-sm text-gray-600 mb-3">{member.relevantExperience}</p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {member.keyCompetencies.map((comp, j) => (
              <span
                key={j}
                className="text-xs px-2 py-0.5 rounded-full"
                style={{ backgroundColor: c.light, color: c.primary }}
              >
                {comp}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create MatrixRenderer**

```tsx
// src/components/bid-editor/renderers/MatrixRenderer.tsx
"use client";

import { RequirementRow, StyleGuide } from "@/lib/types";

interface MatrixRendererProps {
  rows: RequirementRow[];
  consultantNames: Record<string, string>;
  style: StyleGuide;
}

export function MatrixRenderer({ rows, consultantNames, style }: MatrixRendererProps) {
  const c = style.colors;
  const consultantIds = Object.keys(consultantNames);

  const priorityLabel: Record<string, string> = {
    must: "Skall",
    should: "Bör",
    "nice-to-have": "Meriterande",
  };

  const priorityColor: Record<string, string> = {
    must: c.primary,
    should: c.secondary,
    "nice-to-have": c.muted,
  };

  return (
    <div className="py-2 overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="text-left py-2 px-3 font-semibold text-gray-500 border-b-2" style={{ borderColor: c.primary }}>
              Krav
            </th>
            <th className="text-center py-2 px-3 font-semibold text-gray-500 border-b-2 w-24" style={{ borderColor: c.primary }}>
              Prioritet
            </th>
            {consultantIds.map((id) => (
              <th
                key={id}
                className="text-center py-2 px-3 font-semibold border-b-2 w-28"
                style={{ color: c.primary, borderColor: c.primary }}
              >
                {consultantNames[id]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? "bg-gray-50/50" : ""}>
              <td className="py-2 px-3 text-gray-700">{row.requirement}</td>
              <td className="py-2 px-3 text-center">
                <span
                  className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: priorityColor[row.priority] }}
                >
                  {priorityLabel[row.priority] ?? row.priority}
                </span>
              </td>
              {consultantIds.map((id) => (
                <td key={id} className="py-2 px-3 text-center text-lg">
                  {row.coverage[id] ? (
                    <span style={{ color: c.accent }}>&#10003;</span>
                  ) : (
                    <span className="text-gray-300">&mdash;</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 5: Create ReferencesRenderer**

```tsx
// src/components/bid-editor/renderers/ReferencesRenderer.tsx
"use client";

import { BidReference, StyleGuide } from "@/lib/types";
import { EditableText } from "../EditableText";

interface ReferencesRendererProps {
  references: BidReference[];
  style: StyleGuide;
  onReferenceFieldChange?: (index: number, field: "title" | "description" | "relevance", value: string) => void;
}

export function ReferencesRenderer({ references, style, onReferenceFieldChange }: ReferencesRendererProps) {
  const c = style.colors;

  return (
    <div className="py-2 space-y-4">
      {references.map((ref, i) => (
        <div key={i} className="rounded-lg border border-gray-200 p-5">
          <div className="flex items-start justify-between mb-2">
            {onReferenceFieldChange ? (
              <EditableText
                value={ref.title}
                onChange={(v) => onReferenceFieldChange(i, "title", v)}
                as="h4"
                className="font-semibold text-gray-900"
              />
            ) : (
              <h4 className="font-semibold text-gray-900">{ref.title}</h4>
            )}
            <span className="text-sm shrink-0 ml-4" style={{ color: c.muted }}>
              {ref.client}, {ref.year}
            </span>
          </div>
          {onReferenceFieldChange ? (
            <>
              <EditableText
                value={ref.description}
                onChange={(v) => onReferenceFieldChange(i, "description", v)}
                as="p"
                className="text-sm text-gray-600 mb-2"
              />
              <EditableText
                value={ref.relevance}
                onChange={(v) => onReferenceFieldChange(i, "relevance", v)}
                as="p"
                className="text-sm italic"
                style={{ color: c.accent }}
              />
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600 mb-2">{ref.description}</p>
              <p className="text-sm italic" style={{ color: c.accent }}>{ref.relevance}</p>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/bid-editor/renderers/PhasesRenderer.tsx src/components/bid-editor/renderers/GanttRenderer.tsx src/components/bid-editor/renderers/TeamRenderer.tsx src/components/bid-editor/renderers/MatrixRenderer.tsx src/components/bid-editor/renderers/ReferencesRenderer.tsx
git commit -m "feat(bid-editor): add Phases, Gantt, Team, Matrix, References renderers"
```

---

## Task 6: SectionRenderer dispatcher + barrel export

**Files:**
- Create: `src/components/bid-editor/renderers/index.ts`

- [ ] **Step 1: Create barrel export with SectionRenderer**

```tsx
// src/components/bid-editor/renderers/index.ts
"use client";

import { BidSection, StyleGuide } from "@/lib/types";
import { CoverRenderer } from "./CoverRenderer";
import { DividerRenderer } from "./DividerRenderer";
import { PlaceholderRenderer } from "./PlaceholderRenderer";
import { ProseRenderer } from "./ProseRenderer";
import { BulletsRenderer } from "./BulletsRenderer";
import { ThreeColumnRenderer } from "./ThreeColumnRenderer";
import { PhasesRenderer } from "./PhasesRenderer";
import { GanttRenderer } from "./GanttRenderer";
import { TeamRenderer } from "./TeamRenderer";
import { MatrixRenderer } from "./MatrixRenderer";
import { ReferencesRenderer } from "./ReferencesRenderer";

interface SectionRendererProps {
  section: BidSection;
  style: StyleGuide;
  onSectionChange?: (updated: BidSection) => void;
}

export function SectionRenderer({ section, style, onSectionChange }: SectionRendererProps) {
  const content = section.content;

  function updateContent(patch: Partial<typeof content>) {
    if (!onSectionChange) return;
    onSectionChange({ ...section, content: { ...content, ...patch } as typeof content });
  }

  switch (content.format) {
    case "cover":
      return (
        <CoverRenderer
          title={content.title}
          client={content.client}
          date={content.date}
          style={style}
          onFieldChange={onSectionChange ? (field, value) => {
            updateContent({ [field]: value });
          } : undefined}
        />
      );

    case "section-divider":
      return (
        <DividerRenderer
          sectionNumber={content.sectionNumber}
          title={section.title}
          subtitle={content.subtitle}
          style={style}
          onFieldChange={onSectionChange ? (field, value) => {
            if (field === "title") onSectionChange({ ...section, title: value });
            else updateContent({ [field]: value });
          } : undefined}
        />
      );

    case "prose":
      return (
        <ProseRenderer
          title={section.title}
          text={content.text}
          style={style}
          onFieldChange={onSectionChange ? (field, value) => {
            if (field === "title") onSectionChange({ ...section, title: value });
            else updateContent({ text: value });
          } : undefined}
        />
      );

    case "bullets":
      return (
        <BulletsRenderer
          title={section.title}
          items={content.items}
          style={style}
          onFieldChange={onSectionChange ? (field, value) => {
            if (field === "title") onSectionChange({ ...section, title: value });
          } : undefined}
          onItemChange={onSectionChange ? (index, value) => {
            const items = [...content.items];
            items[index] = value;
            updateContent({ items });
          } : undefined}
          onItemAdd={onSectionChange ? () => {
            updateContent({ items: [...content.items, "Ny punkt"] });
          } : undefined}
          onItemRemove={onSectionChange ? (index) => {
            const items = content.items.filter((_, i) => i !== index);
            updateContent({ items });
          } : undefined}
        />
      );

    case "three-column":
      return (
        <ThreeColumnRenderer
          title={section.title}
          columns={content.columns}
          style={style}
          onColumnChange={onSectionChange ? (index, field, value) => {
            const columns = content.columns.map((col, i) =>
              i === index ? { ...col, [field]: value } : col
            );
            updateContent({ columns });
          } : undefined}
        />
      );

    case "phases":
      return (
        <PhasesRenderer
          phases={content.phases}
          style={style}
          onPhaseFieldChange={onSectionChange ? (phaseIndex, field, value) => {
            const phases = content.phases.map((p, i) =>
              i === phaseIndex ? { ...p, [field]: value } : p
            );
            updateContent({ phases });
          } : undefined}
        />
      );

    case "gantt":
      return (
        <GanttRenderer
          title={section.title}
          phases={content.phases}
          milestones={content.milestones}
          style={style}
        />
      );

    case "team":
      return (
        <TeamRenderer
          members={content.members}
          style={style}
          onMemberFieldChange={onSectionChange ? (index, field, value) => {
            const members = content.members.map((m, i) =>
              i === index ? { ...m, [field]: value } : m
            );
            updateContent({ members });
          } : undefined}
        />
      );

    case "requirement-matrix":
      return (
        <MatrixRenderer
          rows={content.rows}
          consultantNames={content.consultantNames}
          style={style}
        />
      );

    case "references":
      return (
        <ReferencesRenderer
          references={content.references}
          style={style}
          onReferenceFieldChange={onSectionChange ? (index, field, value) => {
            const references = content.references.map((r, i) =>
              i === index ? { ...r, [field]: value } : r
            );
            updateContent({ references });
          } : undefined}
        />
      );

    case "placeholder":
      return (
        <PlaceholderRenderer
          title={section.title}
          instruction={content.instruction}
          style={style}
          onFieldChange={onSectionChange ? (field, value) => {
            updateContent({ [field]: value });
          } : undefined}
        />
      );

    default: {
      const _exhaustive: never = content;
      return <div className="text-red-500 text-sm">Unknown format: {JSON.stringify(_exhaustive)}</div>;
    }
  }
}

export {
  CoverRenderer,
  DividerRenderer,
  PlaceholderRenderer,
  ProseRenderer,
  BulletsRenderer,
  ThreeColumnRenderer,
  PhasesRenderer,
  GanttRenderer,
  TeamRenderer,
  MatrixRenderer,
  ReferencesRenderer,
};
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/bid-editor/renderers/index.ts
git commit -m "feat(bid-editor): add SectionRenderer dispatcher with exhaustiveness guard"
```

---

## Task 7: SectionNav with drag-and-drop

**Files:**
- Create: `src/components/bid-editor/SectionNav.tsx`

- [ ] **Step 1: Create SectionNav**

```tsx
// src/components/bid-editor/SectionNav.tsx
"use client";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BidSection } from "@/lib/types";

const FORMAT_ICONS: Record<string, string> = {
  cover: "\u25A0",
  "section-divider": "\u2500",
  prose: "\u00B6",
  bullets: "\u2022",
  "three-column": "\u2261",
  phases: "\u25B6",
  gantt: "\u2502",
  team: "\u263A",
  "requirement-matrix": "\u2611",
  references: "\u2606",
  placeholder: "\u25A1",
};

interface SectionNavProps {
  sections: BidSection[];
  activeSectionKey: string | null;
  onSectionClick: (key: string) => void;
  onReorder: (sections: BidSection[]) => void;
  onRemoveSection: (key: string) => void;
}

function SortableItem({
  section,
  isActive,
  onClick,
  onRemove,
}: {
  section: BidSection;
  isActive: boolean;
  onClick: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: section.key,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const icon = FORMAT_ICONS[section.content.format] ?? "\u25CB";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer group transition-colors ${
        isActive ? "bg-gray-100 font-medium" : "hover:bg-gray-50"
      }`}
      onClick={onClick}
    >
      <span
        {...attributes}
        {...listeners}
        className="cursor-grab text-gray-400 hover:text-gray-600"
        title="Dra för att flytta"
      >
        &#x2630;
      </span>
      <span className="text-gray-400 text-xs w-4 text-center">{icon}</span>
      <span className="truncate flex-1">{section.title}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity text-xs"
        title="Ta bort"
      >
        &times;
      </button>
    </div>
  );
}

export function SectionNav({
  sections,
  activeSectionKey,
  onSectionClick,
  onReorder,
  onRemoveSection,
}: SectionNavProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sections.findIndex((s) => s.key === active.id);
    const newIndex = sections.findIndex((s) => s.key === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove(sections, oldIndex, newIndex));
  }

  return (
    <nav className="space-y-0.5">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sections.map((s) => s.key)} strategy={verticalListSortingStrategy}>
          {sections.map((section) => (
            <SortableItem
              key={section.key}
              section={section}
              isActive={activeSectionKey === section.key}
              onClick={() => onSectionClick(section.key)}
              onRemove={() => onRemoveSection(section.key)}
            />
          ))}
        </SortableContext>
      </DndContext>
    </nav>
  );
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/bid-editor/SectionNav.tsx
git commit -m "feat(bid-editor): add SectionNav with drag-and-drop reorder"
```

---

## Task 8: BidEditor orchestrator component

**Files:**
- Create: `src/components/bid-editor/BidEditor.tsx`

- [ ] **Step 1: Create BidEditor**

```tsx
// src/components/bid-editor/BidEditor.tsx
"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { BidSection, StyleGuide } from "@/lib/types";
import { SectionNav } from "./SectionNav";
import { SectionRenderer } from "./renderers";

interface BidEditorProps {
  bidId: string;
  initialSections: BidSection[];
  initialStatus: string;
  styleGuide: StyleGuide;
}

export function BidEditor({ bidId, initialSections, initialStatus, styleGuide }: BidEditorProps) {
  const [sections, setSections] = useState<BidSection[]>(initialSections);
  const [status, setStatus] = useState(initialStatus);
  const [activeSectionKey, setActiveSectionKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Poll while generating
  const poll = useCallback(async () => {
    const res = await fetch(`/api/bids/${bidId}`);
    if (!res.ok) return;
    const data = await res.json();
    setSections(data.sections ?? []);
    setStatus(data.status);
  }, [bidId]);

  useEffect(() => {
    if (status !== "generating") return;
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [status, poll]);

  // Auto-save sections to Supabase
  const saveSections = useCallback(
    async (updated: BidSection[]) => {
      setSaving(true);
      try {
        const res = await fetch(`/api/bids/${bidId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sections: updated }),
        });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Kunde inte spara");
        }
      } catch {
        setError("Nätverksfel vid sparning");
      } finally {
        setSaving(false);
      }
    },
    [bidId]
  );

  function debouncedSave(updated: BidSection[]) {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => saveSections(updated), 1500);
  }

  function handleSectionChange(key: string, updated: BidSection) {
    const next = sections.map((s) => (s.key === key ? updated : s));
    setSections(next);
    debouncedSave(next);
  }

  function handleReorder(reordered: BidSection[]) {
    setSections(reordered);
    debouncedSave(reordered);
  }

  function handleRemoveSection(key: string) {
    const next = sections.filter((s) => s.key !== key);
    setSections(next);
    debouncedSave(next);
  }

  function scrollToSection(key: string) {
    setActiveSectionKey(key);
    sectionRefs.current[key]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleRegenerate(sectionKey: string) {
    setError(null);
    try {
      const res = await fetch(`/api/bids/${bidId}/regenerate/${sectionKey}`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Regeneration failed");
      }
      const data = await res.json();
      setSections((prev) => prev.map((s) => (s.key === sectionKey ? data.section : s)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Regenerering misslyckades");
    }
  }

  async function downloadPptx() {
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch(`/api/bids/${bidId}/export`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `anbud-${bidId.substring(0, 8)}.pptx`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus("exported");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export misslyckades");
    } finally {
      setDownloading(false);
    }
  }

  const isReady = status === "draft" || status === "exported";

  return (
    <div className="flex h-[calc(100vh-57px)]">
      {/* Left panel — navigation */}
      <aside className="w-56 shrink-0 border-r border-gray-200 overflow-y-auto p-3">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400">Sektioner</h2>
          <span className="text-[10px] text-gray-400">{sections.length}</span>
        </div>
        <SectionNav
          sections={sections}
          activeSectionKey={activeSectionKey}
          onSectionClick={scrollToSection}
          onReorder={handleReorder}
          onRemoveSection={handleRemoveSection}
        />
      </aside>

      {/* Center panel — document view */}
      <main className="flex-1 overflow-y-auto bg-gray-50">
        <div className="max-w-3xl mx-auto py-8 px-6 space-y-8">
          {status === "generating" && sections.length === 0 && (
            <div className="text-center py-16 text-gray-400 text-sm">
              Genererar anbudssektioner...
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
              {error}
              <button onClick={() => setError(null)} className="ml-2 underline">
                Stäng
              </button>
            </div>
          )}

          {sections.map((section) => (
            <div
              key={section.key}
              ref={(el) => { sectionRefs.current[section.key] = el; }}
              className="group relative"
              onClick={() => setActiveSectionKey(section.key)}
            >
              <SectionRenderer
                section={section}
                style={styleGuide}
                onSectionChange={(updated) => handleSectionChange(section.key, updated)}
              />

              {/* Section toolbar — visible on hover */}
              {section.type === "ai" && (
                <div className="absolute -top-2 right-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                  <button
                    onClick={() => handleRegenerate(section.key)}
                    className="text-xs bg-white border border-gray-200 text-gray-500 hover:text-gray-800 px-2 py-1 rounded shadow-sm"
                  >
                    Regenerera
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* Footer actions */}
          {isReady && (
            <div className="pt-4 border-t border-gray-200">
              <button
                onClick={downloadPptx}
                disabled={downloading}
                className="w-full bg-gray-900 text-white px-4 py-3 rounded-lg text-sm font-medium
                           hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {downloading ? "Exporterar..." : "Ladda ner PowerPoint"}
              </button>
            </div>
          )}
        </div>

        {/* Saving indicator */}
        {saving && (
          <div className="fixed bottom-4 right-4 bg-gray-900 text-white text-xs px-3 py-1.5 rounded-full">
            Sparar...
          </div>
        )}
      </main>

      {/* Right panel — placeholder for Phase 2 AI chat */}
      {/* <aside className="w-80 shrink-0 border-l border-gray-200" /> */}
    </div>
  );
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/bid-editor/BidEditor.tsx
git commit -m "feat(bid-editor): add BidEditor orchestrator with auto-save and toolbar"
```

---

## Task 9: Extend PATCH /api/bids/[id] to accept sections

**Files:**
- Modify: `src/app/api/bids/[id]/route.ts`

- [ ] **Step 1: Update the PATCH handler**

In `src/app/api/bids/[id]/route.ts`, modify the PATCH handler to accept `{ sections?: BidSection[], outcome?: string }`:

Replace the current PATCH handler body (from `const body = await request.json();` through the end of the function) with:

```typescript
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const body = await request.json();
  const { outcome, sections } = body as { outcome?: string; sections?: unknown[] };

  const supabase = createServiceClient();

  const updates: Record<string, unknown> = {};

  if (outcome) {
    if (!["won", "lost", "no-bid"].includes(outcome)) {
      return NextResponse.json(
        { error: "outcome must be 'won', 'lost', or 'no-bid'" },
        { status: 400 }
      );
    }
    updates.outcome = outcome;
  }

  if (sections) {
    if (!Array.isArray(sections)) {
      return NextResponse.json(
        { error: "sections must be an array" },
        { status: 400 }
      );
    }
    updates.sections = sections;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("bids")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Bid not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    id: data.id,
    sections: data.sections,
    outcome: data.outcome,
    status: data.status,
  });
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/bids/[id]/route.ts
git commit -m "feat(bid-editor): extend PATCH /api/bids/[id] to accept sections array"
```

---

## Task 10: Create /bids/[id] page

**Files:**
- Create: `src/app/bids/[id]/page.tsx`

- [ ] **Step 1: Create the bid editor page**

```tsx
// src/app/bids/[id]/page.tsx
import { createServiceClient } from "@/lib/supabase";
import { BidEditor } from "@/components/bid-editor/BidEditor";
import { BidSection, StyleGuide } from "@/lib/types";
import { notFound } from "next/navigation";

const DEFAULT_STYLE_GUIDE: StyleGuide = {
  colors: {
    primary: "#1A2B4A",
    primaryLight: "#2D4A7A",
    secondary: "#E8913A",
    secondaryLight: "#F4B76E",
    accent: "#2E8B57",
    dark: "#1A1A1A",
    light: "#F5F5F0",
    muted: "#6B7280",
  },
  font: "Calibri",
  logoUrl: "",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BidEditorPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: bid, error } = await supabase
    .from("bids")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !bid) {
    notFound();
  }

  // Fetch organization style guide
  const { data: org } = await supabase
    .from("organizations")
    .select("style_guide")
    .eq("id", bid.organization_id)
    .single();

  const styleGuide: StyleGuide = (org?.style_guide as StyleGuide) ?? DEFAULT_STYLE_GUIDE;

  return (
    <BidEditor
      bidId={bid.id}
      initialSections={bid.sections as BidSection[]}
      initialStatus={bid.status}
      styleGuide={styleGuide}
    />
  );
}
```

- [ ] **Step 2: Verify the page loads by checking compilation**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/bids/[id]/page.tsx
git commit -m "feat(bid-editor): add /bids/[id] page with server-side data fetching"
```

---

## Task 11: Wire up navigation from analysis page

**Files:**
- Modify: `src/components/analysis-match-section.tsx`

- [ ] **Step 1: Replace inline BidPreview with a link to /bids/[id]**

In `src/components/analysis-match-section.tsx`, replace the `BidPreview` rendering block (lines 249-255) and the `BidPreview` import. Change:

```tsx
// OLD import at top:
import { BidPreview } from "./bid-preview";

// NEW import at top:
import Link from "next/link";
```

Remove the `BidSection` import from `@/lib/types` (it was only used by BidPreview). Remove state variables `bidSections` and `bidStatus` since they're no longer needed.

Then replace the JSX block that renders BidPreview:

```tsx
// OLD (lines 249-255):
          {bidId && !bidLoading && (
            <BidPreview
              bidId={bidId}
              initialSections={bidSections}
              initialStatus={bidStatus}
            />
          )}

// NEW:
          {bidId && !bidLoading && (
            <Link
              href={`/bids/${bidId}`}
              className="block w-full text-center bg-gray-900 text-white px-4 py-3 rounded-lg text-sm font-medium
                         hover:bg-gray-800 transition-colors"
            >
              Öppna anbudsredigerare
            </Link>
          )}
```

Also remove the unused state:

```tsx
// Remove these lines:
  const [bidSections, setBidSections] = useState<BidSection[]>([]);
  const [bidStatus, setBidStatus] = useState<string>("generating");

// And in proceedToBid, remove:
      setBidSections(data.sections ?? []);
      setBidStatus(data.status);
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/analysis-match-section.tsx
git commit -m "feat(bid-editor): link to /bids/[id] instead of inline BidPreview"
```

---

## Task 12: Renderer unit tests

**Files:**
- Create: `src/lib/__tests__/renderers.test.tsx`

- [ ] **Step 1: Write renderer tests**

```tsx
// src/lib/__tests__/renderers.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { SectionRenderer } from "@/components/bid-editor/renderers";
import { BidSection, StyleGuide } from "@/lib/types";

// Check if @testing-library/react is available — if not, skip to step 2
// to install it first.

const testStyle: StyleGuide = {
  colors: {
    primary: "#1A2B4A",
    primaryLight: "#2D4A7A",
    secondary: "#E8913A",
    secondaryLight: "#F4B76E",
    accent: "#2E8B57",
    dark: "#1A1A1A",
    light: "#F5F5F0",
    muted: "#6B7280",
  },
  font: "Calibri",
  logoUrl: "",
};

describe("SectionRenderer", () => {
  it("renders cover format", () => {
    const section: BidSection = {
      type: "data",
      key: "cover",
      title: "Framsida",
      content: { format: "cover", title: "Test Bid", client: "Kund AB", date: "2026-04-12" },
      generatedAt: "2026-04-12",
    };
    render(<SectionRenderer section={section} style={testStyle} />);
    expect(screen.getByText("Test Bid")).toBeDefined();
    expect(screen.getByText("Kund AB")).toBeDefined();
    expect(screen.getByText("ANBUD")).toBeDefined();
  });

  it("renders prose format", () => {
    const section: BidSection = {
      type: "ai",
      key: "understanding",
      title: "Uppdragsförståelse",
      content: { format: "prose", text: "Vi förstår ert behov." },
      generatedAt: "2026-04-12",
    };
    render(<SectionRenderer section={section} style={testStyle} />);
    expect(screen.getByText("Uppdragsförståelse")).toBeDefined();
    expect(screen.getByText("Vi förstår ert behov.")).toBeDefined();
  });

  it("renders bullets format", () => {
    const section: BidSection = {
      type: "ai",
      key: "value",
      title: "Värde",
      content: { format: "bullets", items: ["Punkt 1", "Punkt 2", "Punkt 3"] },
      generatedAt: "2026-04-12",
    };
    render(<SectionRenderer section={section} style={testStyle} />);
    expect(screen.getByText("Punkt 1")).toBeDefined();
    expect(screen.getByText("Punkt 3")).toBeDefined();
  });

  it("renders team format", () => {
    const section: BidSection = {
      type: "ai",
      key: "team",
      title: "Team",
      content: {
        format: "team",
        members: [
          {
            consultantId: "c1",
            name: "Anna Svensson",
            role: "Projektledare",
            relevantExperience: "12 år",
            keyCompetencies: ["PM", "Agil"],
          },
        ],
      },
      generatedAt: "2026-04-12",
    };
    render(<SectionRenderer section={section} style={testStyle} />);
    expect(screen.getByText("Anna Svensson")).toBeDefined();
    expect(screen.getByText("Projektledare")).toBeDefined();
    expect(screen.getByText("PM")).toBeDefined();
  });

  it("renders placeholder format", () => {
    const section: BidSection = {
      type: "placeholder",
      key: "pricing",
      title: "Pris",
      content: { format: "placeholder", instruction: "Fyll i pris." },
      generatedAt: "2026-04-12",
    };
    render(<SectionRenderer section={section} style={testStyle} />);
    expect(screen.getByText("Pris")).toBeDefined();
    expect(screen.getByText("Fyll i pris.")).toBeDefined();
  });

  it("renders section-divider format", () => {
    const section: BidSection = {
      type: "data",
      key: "divider-1",
      title: "Genomförande",
      content: { format: "section-divider", sectionNumber: 2, subtitle: "Metod och plan" },
      generatedAt: "2026-04-12",
    };
    render(<SectionRenderer section={section} style={testStyle} />);
    expect(screen.getByText("02")).toBeDefined();
    expect(screen.getByText("Metod och plan")).toBeDefined();
  });

  it("renders requirement-matrix format", () => {
    const section: BidSection = {
      type: "data",
      key: "req",
      title: "Krav",
      content: {
        format: "requirement-matrix",
        rows: [
          { requirement: "Erfarenhet", priority: "must", coverage: { c1: true } },
        ],
        consultantNames: { c1: "Anna" },
      },
      generatedAt: "2026-04-12",
    };
    render(<SectionRenderer section={section} style={testStyle} />);
    expect(screen.getByText("Erfarenhet")).toBeDefined();
    expect(screen.getByText("Anna")).toBeDefined();
  });
});
```

- [ ] **Step 2: Install @testing-library/react if needed**

```bash
npm install -D @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run src/lib/__tests__/renderers.test.tsx`
Expected: All 7 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/__tests__/renderers.test.tsx package.json package-lock.json
git commit -m "test(bid-editor): add SectionRenderer unit tests for all formats"
```

---

## Task 13: Manual smoke test and cleanup

**Files:**
- No file changes — manual verification and optional cleanup.

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (existing + new renderer tests).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Start dev server and manual test**

Run: `npm run dev`

Manual checklist:
1. Navigate to an existing analysis that has a generated bid
2. Click "Öppna anbudsredigerare" — should navigate to `/bids/[id]`
3. Verify all section types render with styled HTML
4. Click on text → verify contentEditable is active
5. Edit text → wait 1.5s → verify "Sparar..." indicator appears
6. Refresh page → verify edits persisted
7. Drag a section in the left nav → verify reorder + save
8. Click "Regenerera" on an AI section → verify new content appears
9. Click "Ladda ner PowerPoint" → verify PPTX downloads

- [ ] **Step 4: Commit any fixes needed**

If manual testing reveals issues, fix them and commit:

```bash
git add -A
git commit -m "fix(bid-editor): address issues found in manual smoke test"
```
