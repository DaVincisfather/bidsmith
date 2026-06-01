"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { BidSection, StyleGuide } from "@/lib/types";
import type { StructureEvalSummary } from "@/lib/eval/bid-structure";
import type { FieldBudgets, OverflowFlag } from "@/lib/pptx-template/budget-types";
import { verifyFieldBudgets } from "@/lib/pptx-template/verify-budgets";
import { SectionNav } from "./SectionNav";
import { SectionRenderer } from "./renderers";
import { StructureEvalBadge } from "./StructureEvalBadge";
import { OverflowChecklist } from "./OverflowChecklist";

interface BidEditorProps {
  bidId: string;
  initialSections: BidSection[];
  initialStatus: string;
  initialStructureEval: StructureEvalSummary | null;
  styleGuide: StyleGuide;
  budgets: FieldBudgets;
  initialOverflowFlags: OverflowFlag[];
}

export function BidEditor({
  bidId,
  initialSections,
  initialStatus,
  initialStructureEval,
  styleGuide,
  budgets,
  initialOverflowFlags,
}: BidEditorProps) {
  const [sections, setSections] = useState<BidSection[]>(initialSections);
  const [status, setStatus] = useState(initialStatus);
  const [structureEval, setStructureEval] = useState<StructureEvalSummary | null>(initialStructureEval);
  const [overflowFlags, setOverflowFlags] = useState<OverflowFlag[]>(initialOverflowFlags);
  const [activeSectionKey, setActiveSectionKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Walk all sections, run each section's content through verifyFieldBudgets.
  // Each section has its own data shape (phases / quality / etc.); verifyFieldBudgets
  // resolves only the budget paths that match — other paths return zero leaves silently.
  const recomputeOverflowFlags = useCallback(
    (updated: BidSection[]): OverflowFlag[] => {
      const seen = new Set<string>();
      const allFlags: OverflowFlag[] = [];
      for (const section of updated) {
        if (!section.content) continue;
        const { overflows } = verifyFieldBudgets(section.content, budgets);
        for (const o of overflows) {
          // Dedup if multiple sections share a fieldPath (e.g. duplicate phases sections)
          const key = `${o.slide}-${o.fieldPath}`;
          if (seen.has(key)) continue;
          seen.add(key);
          allFlags.push(o);
        }
      }
      return allFlags;
    },
    [budgets],
  );

  // Poll while generating
  const poll = useCallback(async () => {
    const res = await fetch(`/api/bids/${bidId}`);
    if (!res.ok) return;
    const data = await res.json();
    setSections(data.sections ?? []);
    setStatus(data.status);
    setStructureEval(data.structureEval ?? null);
    setOverflowFlags(data.overflowFlags ?? []);
  }, [bidId]);

  useEffect(() => {
    if (status !== "generating") return;
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [status, poll]);

  // Auto-save sections + overflow flags to Supabase
  const saveSections = useCallback(
    async (updated: BidSection[], flags: OverflowFlag[]) => {
      setSaving(true);
      try {
        const res = await fetch(`/api/bids/${bidId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sections: updated, overflowFlags: flags }),
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

  function debouncedSave(updated: BidSection[], flags: OverflowFlag[]) {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => saveSections(updated, flags), 1500);
  }

  function handleSectionChange(key: string, updated: BidSection) {
    const next = sections.map((s) => (s.key === key ? updated : s));
    setSections(next);
    const newFlags = recomputeOverflowFlags(next);
    setOverflowFlags(newFlags);
    debouncedSave(next, newFlags);
  }

  function handleReorder(reordered: BidSection[]) {
    setSections(reordered);
    // Reorder doesn't change content lengths — keep current flags.
    debouncedSave(reordered, overflowFlags);
  }

  function handleRemoveSection(key: string) {
    const next = sections.filter((s) => s.key !== key);
    setSections(next);
    // Recompute so flags pointing at the deleted section's fields disappear.
    const newFlags = recomputeOverflowFlags(next);
    setOverflowFlags(newFlags);
    debouncedSave(next, newFlags);
  }

  function onJumpToField(flag: OverflowFlag) {
    const el = document.querySelector(`[data-field-path="${flag.fieldPath}"]`);
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus();
    }
  }

  function scrollToSection(key: string) {
    setActiveSectionKey(key);
    sectionRefs.current[key]?.scrollIntoView({ behavior: "smooth", block: "start" });
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
  const needsTimpris = sections.some(
    (s) => s.content?.format === "team-pricing"
      && s.content.members?.some((m) => m.timpris === null)
  );

  return (
    <div className="flex h-[calc(100vh-57px)]">
      {/* Left panel — navigation */}
      <aside className="w-56 shrink-0 border-r border-rule overflow-y-auto p-3">
        <div className="mb-3 space-y-2">
          <StructureEvalBadge eval={structureEval} />
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-mono font-bold uppercase tracking-wide text-ink-mute">Sektioner</h2>
            <span className="text-[10px] text-ink-mute">{sections.length}</span>
          </div>
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
      <main className="flex-1 overflow-y-auto bg-paper-2">
        <div className="max-w-3xl mx-auto py-8 px-6 space-y-8">
          {needsTimpris && (
            <div className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <span role="img" aria-label="varning">⚠</span> Fyll i timpriser i Team-sektionen innan export.
            </div>
          )}

          {status === "generating" && sections.length === 0 && (
            <div className="text-center py-16 text-ink-mute text-sm">
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
                budgets={budgets}
              />
            </div>
          ))}

          {/* Footer actions */}
          {isReady && (
            <div className="pt-4 border-t border-rule">
              <button
                onClick={downloadPptx}
                disabled={downloading}
                className="w-full bg-ink text-white px-4 py-3 rounded-lg text-sm font-medium
                           hover:bg-accent-ink disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {downloading ? "Exporterar..." : "Ladda ner PowerPoint"}
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

      {/* Right panel — pre-export overflow checklist (OverflowChecklist owns its own aside + styling) */}
      <div className="shrink-0 p-4">
        <OverflowChecklist flags={overflowFlags} onJumpToField={onJumpToField} />
      </div>
    </div>
  );
}
