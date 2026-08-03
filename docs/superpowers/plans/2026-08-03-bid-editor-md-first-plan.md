# Bid Editor MD-first — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Riv PPTX-arvet ur bid-editorn (budgetar/overflow/slides/strukturbadge/shorten), visa förväntade kapitel från genereringsstart med per-bundle-progress, och baka in en formatoberoende nedströms-instruktion i MD-exporten.

**Architecture:** Strukturerad sektionsdata förblir sanningskällan; editorn blir en enda dokumentvy (kapitelnav + renderers). Förväntade kapitel härleds ur `RUNTIME_MANDATORY_SECTIONS`; genereringen persisterar sektioner per bundle via en serialiserad kö (persistSection är read-modify-write). MD-preamblen är en statisk HTML-kommentar i `bidToMarkdown`.

**Tech Stack:** Next.js 16 (App Router), TypeScript strikt, Tailwind v4, vitest + @testing-library/react (**fireEvent, ALDRIG user-event**), Supabase.

**Spec:** `docs/superpowers/specs/2026-08-03-bid-editor-md-first-design.md` (läs den först).

## Global Constraints

- Worktree: `C:\Users\stefa\projects\bidsmith-editormd`, branch `feat/bid-editor-md-first`. Kör ALLT (npm, git) via PowerShell, inte bash.
- Kod/kommentarer/commits på engelska; UI-copy på svenska. Conventional commits.
- `git add` med EXPLICITA paths — aldrig `git add -A` eller `git add .`.
- TypeScript strikt — inga `any` utan motiverad kommentar. Filer under ~300 rader.
- Surgical changes: rör bara det uppgiften kräver; städa orphans dina ändringar skapar, rör inte pre-existing dead code.
- Genereringens INNEHÅLL (prompter, modeller, budget-retry) får inte ändras — bara NÄR sektioner persisteras (Task 5). Ingen eval-grind krävs.
- `tsc` + testsvit fångar INTE Nexts page/route-export-typvakt — Task 7 kör riktigt `npx next build`.
- PPTX-motorn, `export/route.ts` (pptx), onboarding-wizarden, `with-budget-retry.ts`, `verify-budgets.ts`: RÖRS INTE.

---

### Task 1: Slimma BidEditor till en dokumentvy + banta page.tsx

**Files:**
- Modify: `src/components/bid-editor/BidEditor.tsx` (helskriv om — 425 → ~150 rader)
- Modify: `src/app/bids/[id]/page.tsx`
- Delete: `src/components/bid-editor/OverflowChecklist.tsx`, `src/components/bid-editor/__tests__/OverflowChecklist.test.tsx`, `src/components/bid-editor/SlideNav.tsx`, `src/components/bid-editor/__tests__/SlideNav.test.tsx`, `src/components/bid-editor/SlideGroupedSections.tsx`, `src/components/bid-editor/__tests__/SlideGroupedSections.test.tsx`, `src/components/bid-editor/StructureEvalBadge.tsx`, `src/lib/bid-editor/slot-meta.ts` (ingen egen testfil finns — verifierat)
- Test: `src/components/bid-editor/__tests__/BidEditor.test.tsx` (NY)

**Interfaces:**
- Consumes: `SectionNav` (oförändrad), `SectionRenderer` (budgets-prop är optional — skickas inte längre; strippas helt i Task 2), `failedUnitLabel`/`FailedUnit` från `@/lib/bundle-labels`, `ForgeLoader`.
- Produces: `BidEditorProps` = `{ bidId: string; analysisId: string | null; initialSections: BidSection[]; initialStatus: string; styleGuide: StyleGuide; initialFailedBundles: FailedUnit[]; initialGenerationError: string | null }`. Task 4 bygger vidare på denna komponent.

- [ ] **Step 1: Skriv failande test**

Skapa `src/components/bid-editor/__tests__/BidEditor.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { BidEditor } from "../BidEditor";
import type { BidSection, StyleGuide } from "@/lib/types";

const style: StyleGuide = {
  colors: {
    primary: "#7A2230", primaryLight: "#9A3340", secondary: "#BE969A",
    secondaryLight: "#E0CFD1", accent: "#7A2230", dark: "#14120E",
    light: "#F3EFE7", muted: "#8A847A",
  },
  font: "Calibri",
  logoUrl: "",
};

function proseSection(key: string, title: string, text: string): BidSection {
  return {
    type: "ai", key, title, generatedAt: "2026-08-03T00:00:00Z",
    content: { format: "generic-prose", placeholder: `{${key}}`, text },
  };
}

const teamSection: BidSection = {
  type: "ai", key: "team", title: "Team och pris", generatedAt: "2026-08-03T00:00:00Z",
  content: {
    format: "team-pricing",
    members: [{ name: "Anna", role: "PL", omfattningPct: 50, timmar: 100, timpris: null, total: null }],
    summary: { totalTimmar: 100, totalPris: null },
  },
};

function renderEditor(overrides: Partial<Parameters<typeof BidEditor>[0]> = {}) {
  return render(
    <BidEditor
      bidId="00000000-0000-0000-0000-000000000001"
      analysisId={null}
      initialSections={[proseSection("intro", "Inledning", "Vi är en konsultfirma.")]}
      initialStatus="draft"
      styleGuide={style}
      initialFailedBundles={[]}
      initialGenerationError={null}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BidEditor (dokumentvyn)", () => {
  it("renderar kapitel i nav och innehåll, utan PPTX-arv", () => {
    renderEditor();
    // Kapitlet syns (nav + innehåll)
    expect(screen.getAllByText("Inledning").length).toBeGreaterThan(0);
    expect(screen.getByText("Vi är en konsultfirma.")).toBeInTheDocument();
    // PPTX-arvet är borta
    expect(screen.queryByText(/Mallens hälsorapport/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Slides/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Struktur/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("char-counter")).not.toBeInTheDocument();
  });

  it("visar exportknappen när status är draft", () => {
    renderEditor();
    expect(screen.getByRole("button", { name: /Exportera anbud \(Markdown\)/ })).toBeInTheDocument();
  });

  it("varnar när timpris saknas i team-sektionen", () => {
    renderEditor({ initialSections: [teamSection] });
    expect(screen.getByText(/Fyll i timpriser/)).toBeInTheDocument();
  });

  it("visar misslyckade bundles som varning", () => {
    renderEditor({ initialFailedBundles: [{ bundle: "phases", error: "boom" }] });
    expect(screen.getByText(/kunde\s+inte genereras/)).toBeInTheDocument();
    expect(screen.getByText(/Faser/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Kör testet — ska FAILA**

Kör: `npx vitest run src/components/bid-editor/__tests__/BidEditor.test.tsx`
Förväntat: FAIL — BidEditor kräver idag `budgets`/`fieldSlides`/`slotMeta` m.fl. props (typfel/render-krasch).

- [ ] **Step 3: Skriv om BidEditor.tsx**

Ersätt HELA `src/components/bid-editor/BidEditor.tsx` med:

```tsx
"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { BidSection, StyleGuide } from "@/lib/types";
import { failedUnitLabel, type FailedUnit } from "@/lib/bundle-labels";
import { SectionNav } from "./SectionNav";
import { SectionRenderer } from "./renderers";
import { ForgeLoader } from "../ForgeLoader";

interface BidEditorProps {
  bidId: string;
  /** The analysis this bid was generated from — powers the back / change-team
   *  navigation. null for legacy bids without a linked analysis. */
  analysisId: string | null;
  initialSections: BidSection[];
  initialStatus: string;
  styleGuide: StyleGuide;
  initialFailedBundles: FailedUnit[];
  initialGenerationError: string | null;
}

export function BidEditor({
  bidId,
  analysisId,
  initialSections,
  initialStatus,
  styleGuide,
  initialFailedBundles,
  initialGenerationError,
}: BidEditorProps) {
  const [sections, setSections] = useState<BidSection[]>(initialSections);
  const [status, setStatus] = useState(initialStatus);
  const [failedBundles, setFailedBundles] = useState<FailedUnit[]>(initialFailedBundles);
  const [generationError, setGenerationError] = useState<string | null>(initialGenerationError);
  const [activeSectionKey, setActiveSectionKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [downloadingMd, setDownloadingMd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);
  // Latest sections — read by async flows so a concurrent edit isn't
  // overwritten (stale-closure). Kept in sync via the effect below.
  const sectionsRef = useRef<BidSection[]>(initialSections);
  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);

  // Poll while generating
  const poll = useCallback(async () => {
    const res = await fetch(`/api/bids/${bidId}`);
    if (!res.ok) return;
    const data = await res.json();
    setSections(data.sections ?? []);
    setStatus(data.status);
    setFailedBundles(data.failedBundles ?? []);
    setGenerationError(data.generationError ?? null);
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
    // sectionsRef (not closure `sections`) so async appliers build on latest state.
    const next = sectionsRef.current.map((s) => (s.key === key ? updated : s));
    sectionsRef.current = next;
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

  async function downloadMarkdown() {
    setDownloadingMd(true);
    setError(null);
    try {
      const res = await fetch(`/api/bids/${bidId}/export-md`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `anbud-${bidId.substring(0, 8)}.md`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus("exported");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export misslyckades");
    } finally {
      setDownloadingMd(false);
    }
  }

  const isReady = status === "draft" || status === "exported";
  const needsTimpris = sections.some(
    (s) => s.content?.format === "team-pricing"
      && s.content.members?.some((m) => m.timpris === null)
  );

  return (
    <div className="flex h-[calc(100vh-57px)]">
      {/* Left panel — chapter navigation */}
      <aside className="w-56 shrink-0 border-r border-rule overflow-y-auto p-3">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-mono font-bold uppercase tracking-wide text-ink-mute">Kapitel</h2>
          <span className="text-[10px] text-ink-mute">{sections.length}</span>
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
      <main className="flex-1 overflow-y-auto bg-white">
        <div className="max-w-3xl mx-auto py-8 px-6 space-y-8">
          {analysisId && (
            <nav className="flex items-center gap-4 text-xs font-mono text-ink-mute">
              <Link href={`/analysis/${analysisId}`} className="hover:text-ink transition-colors">
                ← Tillbaka till analys
              </Link>
              <span aria-hidden className="text-rule">|</span>
              <Link href={`/analysis/${analysisId}#team`} className="hover:text-ink transition-colors">
                Ändra team
              </Link>
            </nav>
          )}

          {needsTimpris && (
            <div className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <span role="img" aria-label="varning">⚠</span> Fyll i timpriser i Team-sektionen innan export.
            </div>
          )}

          {status === "generating" && sections.length === 0 && (
            <div className="py-16 flex justify-center">
              <ForgeLoader size={64} />
            </div>
          )}

          {status === "failed" && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
              Genereringen misslyckades{generationError ? `: ${generationError}` : ""}.
              Gå tillbaka till analysen och kör anbudsgenereringen igen.
            </div>
          )}

          {status !== "generating" && status !== "failed" && failedBundles.length > 0 && (
            <div className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {failedBundles.length === 1 ? "En sektion" : `${failedBundles.length} sektioner`} kunde
              inte genereras:{" "}
              {failedBundles.map(failedUnitLabel).join(", ")}.
              Utkastet är ofullständigt.
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
            </div>
          ))}

          {/* Footer actions */}
          {isReady && (
            <div className="pt-4 border-t border-rule">
              <button
                onClick={downloadMarkdown}
                disabled={downloadingMd}
                className="w-full bg-ink text-white px-4 py-3 rounded-lg text-sm font-medium
                           hover:bg-accent-ink disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {downloadingMd ? "Exporterar..." : "Exportera anbud (Markdown)"}
              </button>
            </div>
          )}
        </div>

        {/* Saving indicator */}
        {saving && (
          <div className="fixed bottom-4 right-4 bg-ink text-white text-xs px-3 py-1.5 rounded-full">
            Sparar...
          </div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Banta page.tsx**

Ersätt HELA `src/app/bids/[id]/page.tsx` med:

```tsx
import { createClient } from "@/lib/supabase/server";
import { BidEditor } from "@/components/bid-editor/BidEditor";
import { BidSection, StyleGuide } from "@/lib/types";
import type { FailedUnit } from "@/lib/bundle-labels";
import { notFound } from "next/navigation";

const DEFAULT_STYLE_GUIDE: StyleGuide = {
  colors: {
    primary: "#7A2230",
    primaryLight: "#9A3340",
    secondary: "#BE969A",
    secondaryLight: "#E0CFD1",
    accent: "#7A2230",
    dark: "#14120E",
    light: "#F3EFE7",
    muted: "#8A847A",
  },
  font: "Calibri",
  logoUrl: "",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BidEditorPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: bid, error } = await supabase
    .from("bids")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !bid) {
    notFound();
  }

  // Fetch the workspace style guide (single-row table). Falls back to the
  // built-in default until a workspace uploads its own template/styling.
  const { data: workspace } = await supabase
    .from("workspace_settings")
    .select("style_guide")
    .limit(1)
    .maybeSingle();

  const styleGuide: StyleGuide =
    (workspace?.style_guide as StyleGuide) ?? DEFAULT_STYLE_GUIDE;

  return (
    <BidEditor
      bidId={bid.id}
      analysisId={(bid.analysis_id as string | null) ?? null}
      initialSections={bid.sections as BidSection[]}
      initialStatus={bid.status}
      styleGuide={styleGuide}
      initialFailedBundles={(bid.failed_bundles as FailedUnit[]) ?? []}
      initialGenerationError={(bid.generation_error as string | null) ?? null}
    />
  );
}
```

OBS: `initialFailedBundles` typas nu som `FailedUnit[]` från `@/lib/bundle-labels`
(page.tsx importerade tidigare `FailedBundle` därifrån — unionstypen är den ärliga,
kolumnen bär båda formerna).

- [ ] **Step 5: Radera de döda filerna**

```powershell
git rm src/components/bid-editor/OverflowChecklist.tsx src/components/bid-editor/__tests__/OverflowChecklist.test.tsx src/components/bid-editor/SlideNav.tsx src/components/bid-editor/__tests__/SlideNav.test.tsx src/components/bid-editor/SlideGroupedSections.tsx src/components/bid-editor/__tests__/SlideGroupedSections.test.tsx src/components/bid-editor/StructureEvalBadge.tsx src/lib/bid-editor/slot-meta.ts
```

- [ ] **Step 6: Kör test + typecheck**

Kör: `npx vitest run src/components/bid-editor/ && npx tsc --noEmit`
Förväntat: BidEditor.test.tsx PASS. `generic-prose-meta.test.tsx` och `EditableText.test.tsx` ska också passera (renderers rörs först i Task 2 — deras optionella props finns kvar). tsc rent. Om tsc klagar på oanvända imports i kvarvarande filer: städa exakt de raderna.

- [ ] **Step 7: Commit**

```powershell
git add src/components/bid-editor/BidEditor.tsx src/app/bids/[id]/page.tsx src/components/bid-editor/__tests__/BidEditor.test.tsx
git commit -m "feat: slim bid editor to single document view, drop PPTX-era UI"
```

(`git rm` i Step 5 har redan stageat raderingarna.)

---

### Task 2: Strippa budget-/meta-props ur renderers och EditableText

**Files:**
- Modify: `src/components/bid-editor/renderers/index.tsx`, `src/components/bid-editor/renderers/PhasesRenderer.tsx`, `src/components/bid-editor/renderers/QualityAssuranceRenderer.tsx`, `src/components/bid-editor/renderers/CertificationsRenderer.tsx`, `src/components/bid-editor/EditableText.tsx`
- Modify: `src/components/bid-editor/__tests__/EditableText.test.tsx` (ta bort budget-/räknar-fall)
- Delete: `src/components/bid-editor/__tests__/generic-prose-meta.test.tsx` (testar `meta`-propen som dör)

**Interfaces:**
- Produces: `SectionRendererProps` = `{ section: BidSection; style: StyleGuide; onSectionChange?: (updated: BidSection) => void }` (inga `budgets`, ingen `meta`). `EditableTextProps` utan `budget`/`dataFieldPath`.

- [ ] **Step 1: Uppdatera EditableText-testet så budget-fallen försvinner**

Öppna `src/components/bid-editor/__tests__/EditableText.test.tsx`. Ta bort varje `it`-fall som refererar `budget` eller `char-counter` (testid). Lägg till ett fall som låser den nya ytan:

```tsx
it("renders no char counter wrapper", () => {
  render(<EditableText value="text" onChange={() => {}} />);
  expect(screen.queryByTestId("char-counter")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Kör testet — ska PASSA redan (budget är optional), raderade fall borta**

Kör: `npx vitest run src/components/bid-editor/__tests__/EditableText.test.tsx`
Förväntat: PASS.

- [ ] **Step 3: Strippa EditableText**

I `src/components/bid-editor/EditableText.tsx`: ta bort `budget`- och `dataFieldPath`-props ur interfacet och destruktureringen, ta bort `length`-state + `setLength`-anropen, ta bort `data-field-path={dataFieldPath}`-attributet, och ta bort hela räknar-/wrapper-blocket (raderna från `// No wrapper when there's no counter...` till slutet) så funktionen alltid returnerar `tagElement` direkt. Behåll debounce-/blur-logiken exakt som den är.

- [ ] **Step 4: Strippa renderers**

1. `renderers/index.tsx`: ta bort `budgets`- och `meta`-props ur `SectionRendererProps` + destruktureringen, ta bort `import type { FieldBudgets }`, ta bort `budgets={budgets}` i phases/quality/certifications-anropen. Ersätt `generic-prose`-caset med:

```tsx
    case "generic-prose":
      // Fallback prose for a non-specialised slot (template-upload slice 4).
      return (
        <div className="space-y-1">
          <div className="text-xs text-neutral-500">{content.placeholder}</div>
          <textarea
            className="w-full min-h-[8rem] rounded border p-2 text-sm border-neutral-300"
            value={content.text}
            readOnly={!onSectionChange}
            onChange={onSectionChange ? (e) => updateContent({ text: e.target.value }) : undefined}
          />
        </div>
      );
```

2. I `PhasesRenderer.tsx`, `QualityAssuranceRenderer.tsx`, `CertificationsRenderer.tsx`: ta bort `budgets`-propen ur interface + destrukturering, ta bort `import type { FieldBudgets }`, och ta bort varje `budget={budgets?.[...]}`-rad ur EditableText-anropen. Sök med `budget=` i varje fil så ingen missas. Ta även bort ev. `dataFieldPath=`-props (sök `dataFieldPath`).

- [ ] **Step 5: Radera meta-testet + kör**

```powershell
git rm src/components/bid-editor/__tests__/generic-prose-meta.test.tsx
```

Kör: `npx vitest run src/components/bid-editor/ && npx tsc --noEmit`
Förväntat: PASS + rent. Om andra tester passar `budgets=`/`meta=` till SectionRenderer: ta bort de argumenten (propen finns inte längre — tsc pekar ut exakta ställen).

- [ ] **Step 6: Commit**

```powershell
git add src/components/bid-editor/renderers/index.tsx src/components/bid-editor/renderers/PhasesRenderer.tsx src/components/bid-editor/renderers/QualityAssuranceRenderer.tsx src/components/bid-editor/renderers/CertificationsRenderer.tsx src/components/bid-editor/EditableText.tsx src/components/bid-editor/__tests__/EditableText.test.tsx
git commit -m "refactor: strip budget/meta props and char counters from renderers"
```

---

### Task 3: API-städ — shorten bort, PATCH/GET bantade, field-path bort

**Files:**
- Delete: `src/app/api/bids/[id]/shorten/route.ts`, `src/lib/bid-editor/field-path.ts`, `src/lib/bid-editor/__tests__/field-path.test.ts`
- Modify: `src/lib/api-schemas.ts` (BidPatchSchema), `src/app/api/bids/[id]/route.ts` (GET + PATCH)

**Interfaces:**
- Produces: `BidPatchSchema` accepterar `{ outcome?, sections? }` (inget `overflowFlags`). GET-svaret innehåller INTE `structureEval`/`overflowFlags`.
- Consumes: inget från Task 1–2.

- [ ] **Step 1: Skriv failande schema-test**

Hitta befintlig testfil för api-schemas (`Get-ChildItem src/lib -Recurse -Filter "*api-schemas*"` — finns `src/lib/__tests__/api-schemas.test.ts` läggs fallet där, annars skapa den filen):

```ts
import { describe, it, expect } from "vitest";
import { BidPatchSchema } from "@/lib/api-schemas";

describe("BidPatchSchema (MD-first)", () => {
  it("rejects overflowFlags-only payloads — the field is gone", () => {
    const parsed = BidPatchSchema.safeParse({ overflowFlags: [] });
    expect(parsed.success).toBe(false);
  });

  it("accepts sections-only payloads", () => {
    const parsed = BidPatchSchema.safeParse({ sections: [] });
    expect(parsed.success).toBe(true);
  });
});
```

- [ ] **Step 2: Kör — första fallet ska FAILA** (overflowFlags accepteras idag)

Kör: `npx vitest run src/lib/__tests__/api-schemas.test.ts`

- [ ] **Step 3: Banta schemat + routen**

`src/lib/api-schemas.ts` — BidPatchSchema blir:

```ts
export const BidPatchSchema = z
  .object({
    outcome: z.enum(["won", "lost", "no-bid"]).optional(),
    // .max caps the JSONB row size against an oversized client payload; a real
    // deck is well under this (our template is 17 slides).
    sections: z.array(z.unknown()).max(500).optional(),
  })
  .refine(
    (v) => v.outcome !== undefined || v.sections !== undefined,
    { message: "No valid fields to update" },
  );
```

Om `OverflowFlagSchema` nu blir oanvänd i filen (verifiera med `Select-String -Path src -Pattern "OverflowFlagSchema" -Recurse`): ta bort den — orphan skapad av denna ändring. Om den har andra konsumenter: låt stå.

`src/app/api/bids/[id]/route.ts`: i GET-svaret, ta bort raderna `structureEval: data.structure_eval,` och `overflowFlags: data.overflow_flags ?? [],`. I PATCH: ta bort `overflowFlags` ur destruktureringen och `if (overflowFlags !== undefined) updates.overflow_flags = overflowFlags;`.

- [ ] **Step 4: Radera shorten + field-path**

```powershell
git rm src/app/api/bids/[id]/shorten/route.ts src/lib/bid-editor/field-path.ts src/lib/bid-editor/__tests__/field-path.test.ts
```

(Verifierat: enda kvarvarande konsument av field-path var gamla BidEditor, raderad i Task 1. Kontrollera ändå: `Select-String -Path src -Pattern "field-path" -Recurse` ska bara träffa raderade paths.)

- [ ] **Step 5: Kör svit + typecheck**

Kör: `npx vitest run src/lib src/app && npx tsc --noEmit`
Förväntat: PASS + rent. Route-tester som asserterar `structureEval`/`overflowFlags` i GET-svar eller PATCH:ar overflowFlags: uppdatera dem till nya ytan (ta bort de assertions/payload-fälten).

- [ ] **Step 6: Commit**

```powershell
git add src/lib/api-schemas.ts src/app/api/bids/[id]/route.ts src/lib/__tests__/api-schemas.test.ts
git commit -m "refactor: drop shorten route, overflowFlags and structureEval from bid API"
```

---

### Task 4: Förväntade kapitel från genereringsstart

**Files:**
- Create: `src/lib/bid-editor/expected-chapters.ts`
- Create: `src/lib/bid-editor/__tests__/expected-chapters.test.ts`
- Create: `src/components/bid-editor/GeneratingChapterList.tsx`
- Modify: `src/components/bid-editor/BidEditor.tsx` (generering-läget)
- Test: utöka `src/components/bid-editor/__tests__/BidEditor.test.tsx`

**Interfaces:**
- Consumes: `RUNTIME_MANDATORY_SECTIONS` från `@/lib/eval/bid-structure`, `FailedUnit` från `@/lib/bundle-labels`, `BidEditorProps` från Task 1.
- Produces: `buildChapterList(sections: BidSection[], failedUnits: FailedUnit[]): ChapterItem[]` där `ChapterItem = { key: string; title: string; state: "landed" | "pending" | "failed"; section?: BidSection }`. `GeneratingChapterList({ items: ChapterItem[] })`.

- [ ] **Step 1: Skriv failande test för buildChapterList**

`src/lib/bid-editor/__tests__/expected-chapters.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildChapterList } from "@/lib/bid-editor/expected-chapters";
import type { BidSection } from "@/lib/types";

function landed(key: string, format: string, title: string): BidSection {
  return {
    type: "ai", key, title, generatedAt: "2026-08-03T00:00:00Z",
    // @ts-expect-error — minimal content shape; only format is read here
    content: { format },
  };
}

describe("buildChapterList", () => {
  it("shows all 11 expected chapters as pending when nothing has landed", () => {
    const items = buildChapterList([], []);
    expect(items).toHaveLength(11);
    expect(items.every((i) => i.state === "pending")).toBe(true);
    expect(items[0].title).toBe("Framsida");
  });

  it("replaces a pending chapter with the landed section (actual title) in plan order", () => {
    const items = buildChapterList([landed("phases-1", "phases", "Vårt genomförande")], []);
    const phases = items.find((i) => i.key === "phases-1");
    expect(phases?.state).toBe("landed");
    expect(phases?.title).toBe("Vårt genomförande");
    // Plan order: phases sits after the three understanding chapters (index 4).
    expect(items.indexOf(phases!)).toBe(4);
  });

  it("marks a failed bundle's chapters as failed", () => {
    const items = buildChapterList([], [{ bundle: "understanding", error: "boom" }]);
    const failed = items.filter((i) => i.state === "failed");
    expect(failed.map((i) => i.key)).toEqual([
      "expected:understanding-current",
      "expected:understanding-assignment",
      "expected:understanding-vision",
    ]);
  });

  it("appends sections with unexpected formats last (foreign/generic bids)", () => {
    const items = buildChapterList([landed("slot-1", "generic-prose", "Om oss")], []);
    expect(items[items.length - 1]).toMatchObject({ key: "slot-1", state: "landed" });
    expect(items).toHaveLength(12);
  });
});
```

- [ ] **Step 2: Kör — FAIL** (modulen finns inte)

Kör: `npx vitest run src/lib/bid-editor/__tests__/expected-chapters.test.ts`

- [ ] **Step 3: Implementera expected-chapters.ts**

```ts
import { RUNTIME_MANDATORY_SECTIONS } from "@/lib/eval/bid-structure";
import type { BidSection } from "@/lib/types";
import type { FailedUnit } from "@/lib/bundle-labels";

// Wait-state labels + owning bundle per mandatory v2 format. Titles are
// placeholders — once a section lands, its actual title is shown instead.
// "deterministic" units are built synchronously and never fail as a bundle.
const FORMAT_META: Record<string, { title: string; bundle: string }> = {
  cover: { title: "Framsida", bundle: "deterministic" },
  "understanding-current": { title: "Nuläge", bundle: "understanding" },
  "understanding-assignment": { title: "Uppdraget", bundle: "understanding" },
  "understanding-vision": { title: "Utmaningar och värde", bundle: "understanding" },
  phases: { title: "Genomförande", bundle: "phases" },
  "quality-assurance": { title: "Kvalitetssäkring", bundle: "quality" },
  "requirement-matrix-v2": { title: "Kravuppfyllnad", bundle: "requirement-matrix" },
  "team-pricing": { title: "Team och pris", bundle: "team" },
  "reference-v2": { title: "Referenser", bundle: "deterministic" },
  confidentiality: { title: "Sekretess", bundle: "deterministic" },
  certifications: { title: "Certifieringar", bundle: "deterministic" },
};

export type ChapterState = "landed" | "pending" | "failed";

export interface ChapterItem {
  /** section.key for landed chapters; `expected:${format}` for the rest. */
  key: string;
  title: string;
  state: ChapterState;
  section?: BidSection;
}

/**
 * Union of landed sections and expected chapters, in v2 document order.
 * Only meaningful while a bundle-path bid is generating; profile-path bids
 * (arbitrary generic-prose formats) fall through to landed-only entries.
 */
export function buildChapterList(
  sections: BidSection[],
  failedUnits: FailedUnit[],
): ChapterItem[] {
  const failedBundles = new Set(
    failedUnits
      .filter((f): f is Extract<FailedUnit, { bundle: string }> => "bundle" in f)
      .map((f) => f.bundle),
  );

  const byFormat = new Map<string, BidSection[]>();
  const extras: BidSection[] = [];
  for (const s of sections) {
    const format = s.content?.format;
    if (format && format in FORMAT_META) {
      const list = byFormat.get(format) ?? [];
      list.push(s);
      byFormat.set(format, list);
    } else {
      extras.push(s);
    }
  }

  const items: ChapterItem[] = [];
  for (const format of RUNTIME_MANDATORY_SECTIONS) {
    const landedSections = byFormat.get(format);
    if (landedSections) {
      for (const s of landedSections) {
        items.push({ key: s.key, title: s.title, state: "landed", section: s });
      }
      continue;
    }
    const meta = FORMAT_META[format];
    items.push({
      key: `expected:${format}`,
      title: meta.title,
      state: failedBundles.has(meta.bundle) ? "failed" : "pending",
    });
  }
  for (const s of extras) {
    items.push({ key: s.key, title: s.title, state: "landed", section: s });
  }
  return items;
}
```

- [ ] **Step 4: Kör — PASS**

Kör: `npx vitest run src/lib/bid-editor/__tests__/expected-chapters.test.ts`

- [ ] **Step 5: Skapa GeneratingChapterList + koppla in i BidEditor**

`src/components/bid-editor/GeneratingChapterList.tsx`:

```tsx
"use client";

import type { ChapterItem } from "@/lib/bid-editor/expected-chapters";

const STATE_STYLES: Record<ChapterItem["state"], string> = {
  landed: "text-ink",
  pending: "text-ink-mute italic",
  failed: "text-red-600 line-through",
};

const STATE_ICONS: Record<ChapterItem["state"], string> = {
  landed: "\u2713",
  pending: "\u2026",
  failed: "\u2715",
};

/** Read-only chapter list shown while a bid is generating: the full expected
 *  structure up front, entries flipping pending → landed as sections persist.
 *  Reorder/remove live in SectionNav and only make sense on a finished draft. */
export function GeneratingChapterList({ items }: { items: ChapterItem[] }) {
  return (
    <nav aria-label="Kapitel under generering" className="space-y-0.5">
      {items.map((item) => (
        <div
          key={item.key}
          className={`flex items-center gap-2 px-3 py-2 text-sm rounded ${STATE_STYLES[item.state]}`}
        >
          <span className="text-xs w-4 text-center" aria-hidden>{STATE_ICONS[item.state]}</span>
          <span className="truncate flex-1">{item.title}</span>
        </div>
      ))}
    </nav>
  );
}
```

I `BidEditor.tsx`:

1. Nya imports: `import { useMemo } from "react"` (utöka befintlig react-import), `import { buildChapterList } from "@/lib/bid-editor/expected-chapters";`, `import { GeneratingChapterList } from "./GeneratingChapterList";`
2. Efter `sectionsRef`-effekten:

```tsx
  // While generating: full expected structure up front, sections slotting in
  // as they persist. null on finished bids — SectionNav owns that state.
  const chapterList = useMemo(
    () => (status === "generating" ? buildChapterList(sections, failedBundles) : null),
    [status, sections, failedBundles],
  );
  const displaySections = chapterList
    ? chapterList.flatMap((c) => (c.section ? [c.section] : []))
    : sections;
```

3. I aside-panelen: rubrikraden visar `{chapterList ? chapterList.length : sections.length}` och nav-blocket blir:

```tsx
        {chapterList ? (
          <GeneratingChapterList items={chapterList} />
        ) : (
          <SectionNav
            sections={sections}
            activeSectionKey={activeSectionKey}
            onSectionClick={scrollToSection}
            onReorder={handleReorder}
            onRemoveSection={handleRemoveSection}
          />
        )}
```

4. Centerpanelen mappar `displaySections` i stället för `sections` (persist-ordningen under generering är settle-ordning; chapterList ger dokumentordning).
5. ForgeLoader-villkoret oförändrat (`status === "generating" && sections.length === 0`).

- [ ] **Step 6: Utöka BidEditor-testet**

Lägg i `BidEditor.test.tsx`:

```tsx
  it("visar förväntade kapitel som väntande under generering", () => {
    renderEditor({ initialSections: [], initialStatus: "generating" });
    expect(screen.getByText("Framsida")).toBeInTheDocument();
    expect(screen.getByText("Kravuppfyllnad")).toBeInTheDocument();
    expect(screen.getByLabelText("Kapitel under generering")).toBeInTheDocument();
  });

  it("markerar fallerad bundles kapitel under generering", () => {
    renderEditor({
      initialSections: [],
      initialStatus: "generating",
      initialFailedBundles: [{ bundle: "phases", error: "boom" }],
    });
    expect(screen.getByText("Genomförande")).toHaveClass("truncate");
  });
```

(Det andra fallets styling-assert: verifiera att förälder-diven har `text-red-600` via `closest("div")` om `toHaveClass`-vägen inte biter — lås beteendet "failed-state renderas distinkt", inte exakta klassnamn om det blir skört.)

- [ ] **Step 7: Kör + typecheck**

Kör: `npx vitest run src/components/bid-editor src/lib/bid-editor && npx tsc --noEmit`
Förväntat: PASS + rent.

- [ ] **Step 8: Commit**

```powershell
git add src/lib/bid-editor/expected-chapters.ts src/lib/bid-editor/__tests__/expected-chapters.test.ts src/components/bid-editor/GeneratingChapterList.tsx src/components/bid-editor/BidEditor.tsx src/components/bid-editor/__tests__/BidEditor.test.tsx
git commit -m "feat: expected chapter list with live per-chapter state during generation"
```

---

### Task 5: Per-bundle-persist + strukturjudgen bort ur runtime

**Files:**
- Modify: `src/lib/bid-generator/index.ts` (generateAllSections)
- Modify: `src/lib/bid-generator/run-bid-generation.ts`
- Test: `src/lib/bid-generator/__tests__/orchestrator.test.ts` (utöka), `src/lib/bid-generator/__tests__/run-bid-generation.test.ts` (uppdatera)

**Interfaces:**
- Produces: `generateAllSections(ctx, manifest, onSectionComplete?, onUnitFailed?: (failure: FailedBundle) => void | Promise<void>)`. Alla callbacks anropas SERIALISERAT (aldrig samtidigt) och är flushade innan funktionen returnerar.
- Constraint: bundle-anropen (`build*Bundle(ctx, plan, retryBudget)`), retry-budgeten och resultataggregeringen får inte ändras — bara callback-tajmingen.

- [ ] **Step 1: Skriv failande orchestrator-test**

Lägg i `orchestrator.test.ts` (återanvänd befintliga mocks/`mockSection`):

```ts
  it("persists each bundle's sections as it settles, not after all complete", async () => {
    const persisted: string[] = [];
    const onSectionComplete = vi.fn(async (s: BidSection) => { persisted.push(s.key); });

    // team resolves immediately; understanding hangs until released.
    let releaseUnderstanding!: () => void;
    vi.mocked(buildUnderstandingBundle).mockImplementation(
      () => new Promise((resolve) => {
        releaseUnderstanding = () => resolve({
          sections: [mockSection("understanding-current", "understanding-current")],
          overflowFlags: [],
        });
      }),
    );

    const resultPromise = generateAllSections(baseCtx, manifest, onSectionComplete);
    // Give the fast bundles a macrotask to settle and persist.
    await new Promise((r) => setTimeout(r, 0));
    expect(persisted).toContain("team-pricing");
    expect(persisted).not.toContain("understanding-current");

    releaseUnderstanding();
    await resultPromise;
    expect(persisted).toContain("understanding-current");
  });

  it("reports a failed bundle via onUnitFailed while others persist", async () => {
    const failures: string[] = [];
    vi.mocked(buildPhasesBundle).mockRejectedValue(new Error("boom"));

    const result = await generateAllSections(baseCtx, manifest, undefined, async (f) => {
      failures.push(f.bundle);
    });
    expect(failures).toEqual(["phases"]);
    expect(result.failedBundles).toEqual([{ bundle: "phases", error: "boom" }]);
  });

  it("never runs two persist callbacks concurrently", async () => {
    let active = 0;
    let maxActive = 0;
    const onSectionComplete = vi.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 1));
      active -= 1;
    });
    await generateAllSections(baseCtx, manifest, onSectionComplete);
    expect(maxActive).toBe(1);
    // 4 deterministic + 7 bundle sections in the default mocks.
    expect(onSectionComplete).toHaveBeenCalledTimes(11);
  });
```

(Justera 11-siffran mot beforeEach-mockarnas faktiska sektionsantal: 4 deterministiska + understanding 3 + phases 1 + quality 1 + matrix 1 + team 1 = 11 om mockarna ser ut som idag — räkna i filen.)

- [ ] **Step 2: Kör — FAIL** (persist sker idag efter allSettled; onUnitFailed finns inte)

Kör: `npx vitest run src/lib/bid-generator/__tests__/orchestrator.test.ts`

- [ ] **Step 3: Implementera i generateAllSections**

I `src/lib/bid-generator/index.ts`: lägg till fjärde parametern `onUnitFailed?: (failure: FailedBundle) => void | Promise<void>` och ersätt blocket från `const settled = await Promise.allSettled([...])` till och med den gamla `if (onSectionComplete) { ... }`-loopen med:

```ts
  // Serialized side-effect queue: persistSection upstream is read-modify-write
  // on the bid row, so callbacks must never run concurrently. Entries swallow
  // their own errors — a failed progress write must not fail the generation
  // (the final ordered write in run-bid-generation is the source of truth).
  let queue: Promise<void> = Promise.resolve();
  const enqueue = (work: () => Promise<void>) => {
    queue = queue.then(work).catch((err) => {
      console.error("incremental persist failed (final write recovers):", err);
    });
  };
  const persistSections = (secs: BidSection[]) => {
    if (!onSectionComplete) return;
    enqueue(async () => {
      for (const s of secs) await onSectionComplete(s);
    });
  };

  // Deterministic sections are ready now — persist up front so the editor's
  // chapter list shows them landed from the first poll. Intermediate DB order
  // is settle order; the final write reasserts document order.
  persistSections([cover, reference, confidentiality, certifications]);

  const instrumented = (
    p: Promise<{ sections: BidSection[]; overflowFlags: OverflowFlag[] }>,
    label: (typeof BUNDLE_LABELS)[number],
  ) =>
    p.then(
      (r) => {
        persistSections(r.sections);
        return r;
      },
      (err: unknown) => {
        if (onUnitFailed) {
          enqueue(async () => {
            await onUnitFailed({
              bundle: label,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }
        throw err;
      },
    );

  const settled = await Promise.allSettled([
    instrumented(buildUnderstandingBundle(ctx, plan, retryBudget), "understanding"),
    instrumented(buildPhasesBundle(ctx, plan, retryBudget), "phases"),
    instrumented(buildQualityBundle(ctx, plan, retryBudget), "quality"),
    instrumented(buildRequirementMatrixBundle(ctx, plan, retryBudget), "requirement-matrix"),
    instrumented(buildTeamBundle(ctx, plan, retryBudget), "team"),
  ]);
  await queue; // flush progress writes before returning
```

Behåll `bundleResults`/`failedBundles`-aggregeringen och `sections`-sammansättningen EXAKT som idag (instrumented kastar om felet, så allSettled-formen är oförändrad). Uppdatera funktionens doc-kommentar ("onSectionComplete is invoked sequentially...") till det nya kontraktet.

- [ ] **Step 4: run-bid-generation — persistFailedUnit + judge bort**

I `src/lib/bid-generator/run-bid-generation.ts`:

1. Efter `persistSection`, lägg till:

```ts
  // Incremental failure marking: lets the editor's chapter list flag a failed
  // bundle's chapters mid-generation. Serialized by generateAllSections' queue
  // (never concurrent with persistSection). Final write overwrites with the
  // complete list.
  const persistFailedUnit = async (failure: FailedBundle) => {
    const { data: currentBid } = await supabase
      .from("bids")
      .select("failed_bundles")
      .eq("id", bidId)
      .single();
    const current = (currentBid?.failed_bundles as FailedBundle[]) ?? [];
    await supabase
      .from("bids")
      .update({ failed_bundles: [...current, failure] })
      .eq("id", bidId);
  };
```

2. Bundle-vägens anrop blir `generateAllSections(ctx, template.manifest, persistSection, persistFailedUnit)`.
3. Ta bort: importen av `judgeBidStructure, buildStructureEvalSummary, RUNTIME_MANDATORY_SECTIONS` från `@/lib/eval/bid-structure`, hela `let structureEval ... }`-blocket (rad ~164–173), `structure_eval: structureEval,` ur slut-uppdateringen, `let onProfilePath = false;` + `onProfilePath = true;`-raderna OM inget annat läser dem (verifiera med sök i filen — de fanns enbart för judge-grinden), samt strukturjude-kommentaren ovanför (rad ~62–66).

- [ ] **Step 5: Uppdatera run-bid-generation-testerna**

Kör: `npx vitest run src/lib/bid-generator/`
FAIL-kandidater: tester som asserterar `structure_eval` i slut-uppdateringen eller mockar judge-modulen. Ta bort de förväntningarna/mockarna. Alla övriga ska passera. Sedan: PASS.

- [ ] **Step 6: Typecheck + commit**

Kör: `npx tsc --noEmit` — rent.

```powershell
git add src/lib/bid-generator/index.ts src/lib/bid-generator/run-bid-generation.ts src/lib/bid-generator/__tests__/orchestrator.test.ts src/lib/bid-generator/__tests__/run-bid-generation.test.ts
git commit -m "feat: per-bundle section persist via serialized queue; drop runtime structure judge"
```

(Om fler testfiler ändrades i Step 5: lägg till deras exakta paths i add-kommandot.)

---

### Task 6: MD-preamble — nedströms-instruktionen

**Files:**
- Modify: `src/lib/bid-markdown.ts`
- Test: `src/lib/__tests__/bid-markdown.test.ts` (utöka)

**Interfaces:**
- Produces: `export const BID_MD_PREAMBLE: string` + `bidToMarkdown` vars retur inleds med preamblen följd av tom rad.

- [ ] **Step 1: Skriv failande test**

Lägg i `src/lib/__tests__/bid-markdown.test.ts` (återanvänd `section`-helpern):

```ts
describe("BID_MD_PREAMBLE", () => {
  const md = bidToMarkdown([
    section("cover", "Framsida", {
      format: "cover", title: "Titel", client: "Kund", date: "2026-08-03",
    }),
  ]);

  it("opens the export as a valid HTML comment, H1 right after", () => {
    expect(md.startsWith("<!--\n")).toBe(true);
    const closeIdx = md.indexOf("-->");
    expect(closeIdx).toBeGreaterThan(0);
    // Exactly one comment terminator — free text with --> would truncate it.
    expect(md.indexOf("-->", closeIdx + 3)).toBe(-1);
    expect(md.slice(closeIdx + 3).trimStart().startsWith("# Titel")).toBe(true);
  });

  it("carries the three instruction parts", () => {
    expect(md).toContain("DOKUMENTETS SEMANTIK");
    expect(md).toContain("FAKTA ÄR LÅSTA");
    expect(md).toContain("FORMATANPASSNING");
  });
});
```

Importera `BID_MD_PREAMBLE` behövs inte i testet — det låser beteendet via exporten.

- [ ] **Step 2: Kör — FAIL**

Kör: `npx vitest run src/lib/__tests__/bid-markdown.test.ts`

- [ ] **Step 3: Implementera**

Överst i `src/lib/bid-markdown.ts` (efter imports):

```ts
// Downstream-AI instruction, prepended to every export as an HTML comment:
// invisible when the file is rendered or converted (clean deliverable for
// human eyes), fully readable for any AI given the raw text. Format-agnostic
// by design (Stefan 2026-08-03): the conditional branches let the downstream
// AI meet the user's own format choice — no setting, no export-time picker.
// MUST NOT contain "-->" anywhere in its body (would terminate the comment).
export const BID_MD_PREAMBLE = `<!--
INSTRUKTION TILL AI-ASSISTENTEN SOM BEARBETAR DETTA DOKUMENT

Detta är ett anbudsutkast genererat av Bidsmith. Människan du hjälper ska
omvandla det till sitt slutformat (Word-dokument, presentation eller annat).

DOKUMENTETS SEMANTIK
- "# " är anbudets titel; "## " är kapitel; "---" avgränsar kapitel.
- Kapitelordningen är anbudets avsedda ordning — bevara den.
- Tabeller är data (team, pris): de ska förbli tabeller i slutformatet.
- Punktlistor är uppräkningar, inte utfyllnad.

FAKTA ÄR LÅSTA
Namn, priser, timmar, procentsatser, datum, referenser, citat, kravsvar och
certifikat får omformuleras språkligt men aldrig ändras, kompletteras eller
"förbättras". Hitta aldrig på innehåll som inte finns i dokumentet. Vid
osäkerhet: behåll originalformuleringen ordagrant.

FORMATANPASSNING
- Textdokument (t.ex. Word): behåll rubrikhierarkin som rubriknivåer/styles.
- Presentation (t.ex. PowerPoint): ett "## "-kapitel motsvarar en sektion om
  en eller flera slides; kondensera prosa till punkter utan att ändra
  sakinnehåll.
- Annat verktyg: bevara struktur och fakta; formen är fri.
-->`;
```

Sista raden i `bidToMarkdown` ändras från
`return parts.join("\n\n---\n\n") + "\n";` till
`return BID_MD_PREAMBLE + "\n\n" + parts.join("\n\n---\n\n") + "\n";`

- [ ] **Step 4: Kör hela bid-markdown-sviten — PASS**

Kör: `npx vitest run src/lib/__tests__/bid-markdown.test.ts`
Befintliga fall använder `toContain` (ordningsokänsliga) och ska passera orörda. Kör även export-md-routens tester: `npx vitest run "src/app/api/bids/[id]/export-md/__tests__"` — PASS (asserterar `toContain`, inte filstart; verifierat i planfasen).

- [ ] **Step 5: Commit**

```powershell
git add src/lib/bid-markdown.ts src/lib/__tests__/bid-markdown.test.ts
git commit -m "feat: embed downstream-AI instruction preamble in markdown export"
```

---

### Task 7: Slutgrindar + visuell verifiering + ROADMAP

**Files:**
- Modify: `notes/ROADMAP.md`

- [ ] **Step 1: Full svit + lint + typecheck**

Kör: `npm test` → alla gröna. `npm run lint` → rent. `npx tsc --noEmit` → rent. Visa outputen.

- [ ] **Step 2: Riktigt next build**

Kör: `npx next build`
Förväntat: exit 0. (Fångar page/route-export-typvakten som tsc missar — page.tsx + route.ts ändrades. OBS: kräver att node_modules INTE är en junction — worktreen fick egen `npm ci` vid setup.)

- [ ] **Step 3: Visuell verifiering mot dev-servern**

1. Starta `npm run dev` i worktreen (annan port om 3000 är upptagen av main-worktreens server: `npm run dev -- -p 3002`).
2. Öppna ett befintligt anbud (`/bids/<id>` — id finns i dashboarden) och verifiera mot spec-kriterium 3: kapitelnav, inline-redigering + "Sparar..."-indikatorn, INGA räknare/overflow-panel/slides/hälsorapport-länk/badge.
3. Generera ett NYTT anbud (via en analys → anbudsgenerering) och verifiera kriterium 1: full kapitellista från start, kapitel flippar väntande→klar löpande under genereringen (inte i en skur på slutet).
4. Exportera MD, öppna filen: preamblen först, renderar rent i MD-preview (preamblen osynlig), innehållet komplett.
5. Screenshots på (2) och (3) för Stefans granskning.

- [ ] **Step 4: Uppdatera ROADMAP.md**

Lägg överst i `_Senast uppdaterad`-historiken (befintligt mönster): editor-omtänket levererat — dokumentvy (PPTX-arvet rivet ur editorn), förväntade kapitel med per-bundle-persist, MD-preamble, strukturjudgen ur runtime (RÄTTELSE: mekanisk kontroll, $0 — borttagen som död konsument, inte kostnad). Bocka av backlog-posterna som stängts: "BidEditor.tsx saknar helt testfil" (#97-follow-up 2) och editor-slimningens follow-up (2) "extrahera flat/grupperad-branchen" (löst genom att branchen försvann). Spec/plan-pekare: `docs/superpowers/specs|plans/2026-08-03-bid-editor-md-first-*`.

- [ ] **Step 5: Commit**

```powershell
git add notes/ROADMAP.md
git commit -m "docs: roadmap — bid editor MD-first rethink delivered"
```

- [ ] **Step 6: PR**

Pusha till remoten `bidsmith` (INTE origin): `git push -u bidsmith feat/bid-editor-md-first`, öppna PR mot `main` med spec-sammanfattningen. **Vänta in PR-review-routinens kommentar före squash-merge** (aktiv på bidsmith, triggar på nya PR:er).

---

## Self-review (utförd vid planskrivning)

- **Spec-täckning:** §1 → Task 1–3; §2 → Task 4–5; §3 → Task 6; §4 → test-steg i varje task + Task 7; §5 → Global Constraints (rörs-inte-listan). Kriterium 1–7 → Task 7 verifierar.
- **Medvetet utanför:** GET-mutations-flippen i export-md (egen backlog-post #101), markdown-escaping av AI-fritext (backlog #100), delade readiness-guards (backlog #100).
- **Typkonsistens:** `FailedUnit` (client, bundle-labels) vs `FailedBundle` (server, bid-generator) hålls isär per befintligt mönster; `ChapterItem`/`buildChapterList` konsekventa mellan Task 4-stegen; `onUnitFailed` tar serverns `FailedBundle`.
