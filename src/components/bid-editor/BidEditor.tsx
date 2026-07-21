"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import { BidSection, StyleGuide } from "@/lib/types";
import type { StructureEvalSummary } from "@/lib/eval/bid-structure";
import type { FieldBudgets, OverflowFlag } from "@/lib/pptx-template/budget-types";
import { verifyFieldBudgets } from "@/lib/pptx-template/verify-budgets";
import { failedUnitLabel, type FailedUnit } from "@/lib/bundle-labels";
import { SectionNav } from "./SectionNav";
import { SectionRenderer } from "./renderers";
import { StructureEvalBadge } from "./StructureEvalBadge";
import { OverflowChecklist } from "./OverflowChecklist";
import { getFieldValue, setFieldValue, findOverflowSection } from "@/lib/bid-editor/field-path";
import { groupSectionsBySlide, type SlotMeta } from "@/lib/bid-editor/slot-meta";
import { SlideNav } from "./SlideNav";
import { SlideGroupedSections } from "./SlideGroupedSections";
import { ForgeLoader } from "../ForgeLoader";

interface BidEditorProps {
  bidId: string;
  /** The analysis this bid was generated from — powers the back / change-team
   *  navigation. null for legacy bids without a linked analysis. */
  analysisId: string | null;
  initialSections: BidSection[];
  initialStatus: string;
  initialStructureEval: StructureEvalSummary | null;
  styleGuide: StyleGuide;
  budgets: FieldBudgets;
  fieldSlides: Record<string, number>;
  initialOverflowFlags: OverflowFlag[];
  initialFailedBundles: FailedUnit[];
  initialGenerationError: string | null;
  /** Slot-metadata från mallprofilen (onboardade mallar) — null för inbyggda
   *  mallens anbud ⇒ dagens platta sektionsvy. */
  slotMeta: SlotMeta | null;
  /** Anbudets mall — länkar till mallens hälsorapport för onboardade mallar
   *  (slotMeta ≠ null). null för legacy-anbud utan template_id. */
  templateId: string | null;
}

export function BidEditor({
  bidId,
  analysisId,
  initialSections,
  initialStatus,
  initialStructureEval,
  styleGuide,
  budgets,
  fieldSlides,
  initialOverflowFlags,
  initialFailedBundles,
  initialGenerationError,
  slotMeta,
  templateId,
}: BidEditorProps) {
  const [sections, setSections] = useState<BidSection[]>(initialSections);
  const [status, setStatus] = useState(initialStatus);
  const [structureEval, setStructureEval] = useState<StructureEvalSummary | null>(initialStructureEval);
  const [overflowFlags, setOverflowFlags] = useState<OverflowFlag[]>(initialOverflowFlags);
  const [failedBundles, setFailedBundles] = useState<FailedUnit[]>(initialFailedBundles);
  const [generationError, setGenerationError] = useState<string | null>(initialGenerationError);
  const [activeSectionKey, setActiveSectionKey] = useState<string | null>(null);
  const [activeSlide, setActiveSlide] = useState<number | "other" | null>(null);
  const slideRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const grouped = useMemo(
    () => (slotMeta ? groupSectionsBySlide(sections, slotMeta) : null),
    [sections, slotMeta],
  );

  function scrollToSlide(source: number | "other") {
    setActiveSlide(source);
    slideRefs.current[String(source)]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  const [shorteningKey, setShorteningKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);
  // Senaste sections — läses av async onShorten så en samtidig redigering under
  // LLM-anropet inte skrivs över (stale-closure). Håller sig synkad via effekten nedan.
  const sectionsRef = useRef<BidSection[]>(initialSections);
  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);
  // Hindrar dubbel-fire i samma tick (guard-state uppdateras först vid nästa render).
  const shorteningRef = useRef(false);

  // Walk all sections, run each section's content through verifyFieldBudgets.
  // Each section has its own data shape (phases / quality / etc.); verifyFieldBudgets
  // resolves only the budget paths that match — other paths return zero leaves silently.
  const recomputeOverflowFlags = useCallback(
    (updated: BidSection[]): OverflowFlag[] => {
      const seen = new Set<string>();
      const allFlags: OverflowFlag[] = [];
      for (const section of updated) {
        if (!section.content) continue;
        const { overflows } = verifyFieldBudgets(section.content, { budgets, fieldSlides });
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
    [budgets, fieldSlides],
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
    setFailedBundles(data.failedBundles ?? []);
    setGenerationError(data.generationError ?? null);
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
    // sectionsRef (inte closure-`sections`) så async-appliceringar bygger på senaste läget.
    const next = sectionsRef.current.map((s) => (s.key === key ? updated : s));
    sectionsRef.current = next;
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

  // Skriv om ett flaggat fält ≤ tak via /shorten och applicera i rätt sektion.
  async function onShorten(flag: OverflowFlag) {
    if (shorteningRef.current) return; // en i taget (ref => tål dubbel-fire i samma tick)
    // Matcha sektionen som FAKTISKT är över budget (samma val som recomputeOverflowFlags
    // gör vid dedup), inte bara första sektion som råkar ha ett värde på vägen.
    const target = findOverflowSection(sectionsRef.current, flag.fieldPath, flag.budget);
    if (!target) return;
    const text = getFieldValue(target.content, flag.fieldPath) as string;

    shorteningRef.current = true;
    setShorteningKey(`${flag.slide}-${flag.fieldPath}`);
    setError(null);
    try {
      const res = await fetch(`/api/bids/${bidId}/shorten`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, budget: flag.budget, fieldLabel: flag.fieldLabel }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Kortningen misslyckades");
      if (!data || typeof data.text !== "string") throw new Error("Kortningen misslyckades");
      // Applicera mot SENASTE sektionsläget (kan ha ändrats under LLM-anropet) så en
      // samtidig redigering i samma sektion inte skrivs över; byt bara ut detta fält.
      const latest = sectionsRef.current.find((s) => s.key === target.key);
      if (!latest?.content) return;
      const newContent = setFieldValue(latest.content, flag.fieldPath, data.text) as typeof latest.content;
      handleSectionChange(target.key, { ...latest, content: newContent });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kortningen misslyckades");
    } finally {
      shorteningRef.current = false;
      setShorteningKey(null);
    }
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
            <h2 className="text-xs font-mono font-bold uppercase tracking-wide text-ink-mute">{grouped ? "Slides" : "Sektioner"}</h2>
            <span className="text-[10px] text-ink-mute">{grouped ? grouped.slides.length : sections.length}</span>
          </div>
        </div>
        {grouped ? (
          <SlideNav
            groups={grouped.slides}
            otherCount={grouped.other.length}
            activeSlide={activeSlide}
            onSlideClick={scrollToSlide}
          />
        ) : (
          <SectionNav
            sections={sections}
            activeSectionKey={activeSectionKey}
            onSectionClick={scrollToSection}
            onReorder={handleReorder}
            onRemoveSection={handleRemoveSection}
          />
        )}
      </aside>

      {/* Center panel — document view */}
      <main className="flex-1 overflow-y-auto bg-white">
        <div className="max-w-3xl mx-auto py-8 px-6 space-y-8">
          {(analysisId || (slotMeta && templateId)) && (
            <nav className="flex items-center gap-4 text-xs font-mono text-ink-mute">
              {analysisId && (
                <>
                  <Link href={`/analysis/${analysisId}`} className="hover:text-ink transition-colors">
                    ← Tillbaka till analys
                  </Link>
                  <span aria-hidden className="text-rule">|</span>
                  <Link href={`/analysis/${analysisId}#team`} className="hover:text-ink transition-colors">
                    Ändra team
                  </Link>
                </>
              )}
              {slotMeta && templateId && (
                <>
                  {analysisId && <span aria-hidden className="text-rule">|</span>}
                  <Link
                    href={`/installningar/mallar/${templateId}/onboarding`}
                    className="hover:text-ink transition-colors"
                  >
                    Mallens hälsorapport
                  </Link>
                </>
              )}
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

          {grouped && slotMeta ? (
            <SlideGroupedSections
              grouped={grouped}
              slotMeta={slotMeta}
              style={styleGuide}
              onSectionChange={handleSectionChange}
              registerSlideRef={(source, el) => { slideRefs.current[String(source)] = el; }}
              onActivate={setActiveSlide}
            />
          ) : (
            sections.map((section) => (
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
            ))
          )}

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

      {/* Right panel — pre-export overflow checklist (OverflowChecklist owns its own aside + styling).
          Döljs när grouped: fieldPath-checklistan är inert för profil-drivna anbud; räknarna är deras signal. */}
      {!grouped && (
        <div className="shrink-0 p-4">
          <OverflowChecklist
            flags={overflowFlags}
            onJumpToField={onJumpToField}
            onShorten={onShorten}
            shorteningKey={shorteningKey}
          />
        </div>
      )}
    </div>
  );
}
