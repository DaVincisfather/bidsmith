"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import { BidSection, StyleGuide } from "@/lib/types";
import { failedUnitLabel, type FailedUnit } from "@/lib/bundle-labels";
import { buildChapterList } from "@/lib/bid-editor/expected-chapters";
import { SectionNav } from "./SectionNav";
import { GeneratingChapterList } from "./GeneratingChapterList";
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
  const [submitting, setSubmitting] = useState(false);
  // Visas efter lyckad export: exporten flippar inte längre status
  // (inlämningssplitten 2026-08-14) — nudgen pekar på den explicita knappen.
  const [exportNudge, setExportNudge] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);
  // Latest sections — read by async flows so a concurrent edit isn't
  // overwritten (stale-closure). Kept in sync via the effect below.
  const sectionsRef = useRef<BidSection[]>(initialSections);
  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);

  // While generating: full expected structure up front, sections slotting in
  // as they persist. null on finished bids — SectionNav owns that state.
  const chapterList = useMemo(
    () => (status === "generating" ? buildChapterList(sections, failedBundles) : null),
    [status, sections, failedBundles],
  );
  const displaySections = chapterList
    ? chapterList.flatMap((c) => (c.section ? [c.section] : []))
    : sections;
  const isReady = status === "draft" || status === "exported";

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
      const res = await fetch(`/api/bids/${bidId}/export-md`, { method: "POST" });
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
      if (status === "draft") setExportNudge(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export misslyckades");
    } finally {
      setDownloadingMd(false);
    }
  }

  async function markSubmitted() {
    if (
      !window.confirm(
        "Markera anbudet som inlämnat? Teamet låses och det går inte att ångra — utfallet följs upp i pipelinen.",
      )
    ) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/bids/${bidId}/submit`, { method: "POST" });
      const data = await res.json();
      // En annan flik hann markera — adoptera det nya läget i stället för att
      // visa ett fel för något som redan är i det tillstånd användaren ville nå
      // (routine-fynd #116).
      const alreadySubmitted =
        res.status === 409 &&
        typeof data.error === "string" &&
        data.error.includes("redan markerat");
      if (!res.ok && !alreadySubmitted) {
        throw new Error(data.error || "Kunde inte markera anbudet som inlämnat");
      }
      setStatus("exported");
      setExportNudge(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte markera anbudet som inlämnat");
    } finally {
      setSubmitting(false);
    }
  }

  const needsTimpris = sections.some(
    (s) => s.content?.format === "team-pricing"
      && s.content.members?.some((m) => m.timpris === null)
  );

  return (
    <div className="flex min-h-0 flex-1">
      {/* Left panel — chapter navigation */}
      <aside className="w-56 shrink-0 border-r border-rule overflow-y-auto p-3">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-mono font-bold uppercase tracking-wide text-ink-mute">Kapitel</h2>
          <span className="text-[10px] text-ink-mute">{chapterList ? chapterList.length : sections.length}</span>
        </div>
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
              <Link href={`/analysis/${analysisId}/go-no-go`} className="hover:text-ink transition-colors">
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
              Gå till Go/No-Go-steget och generera om anbudet.
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

          {displaySections.map((section) => (
            <div
              key={section.key}
              ref={(el) => { sectionRefs.current[section.key] = el; }}
              className="group relative"
              onClick={() => setActiveSectionKey(section.key)}
            >
              <SectionRenderer
                section={section}
                style={styleGuide}
                onSectionChange={isReady ? (updated) => handleSectionChange(section.key, updated) : undefined}
              />
            </div>
          ))}

          {/* Footer actions */}
          {isReady && (
            <div className="pt-4 border-t border-rule space-y-3">
              <button
                onClick={downloadMarkdown}
                disabled={downloadingMd}
                className="w-full bg-ink text-white px-4 py-3 rounded-lg text-sm font-medium
                           hover:bg-accent-ink disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {downloadingMd ? "Exporterar..." : "Exportera anbud (Markdown)"}
              </button>

              {status === "draft" ? (
                <>
                  {exportNudge && (
                    <p role="status" className="text-sm text-ink-mute">
                      Filen är nedladdad. När anbudet har lämnats in — markera det som inlämnat
                      så följs utfallet upp.
                    </p>
                  )}
                  <button
                    onClick={markSubmitted}
                    disabled={submitting}
                    className="w-full border border-rule px-4 py-3 rounded-lg text-sm font-medium
                               text-ink hover:border-accent-ink hover:text-accent-ink
                               disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {submitting ? "Markerar..." : "Markera som inlämnad"}
                  </button>
                </>
              ) : (
                <p role="status" className="text-sm text-ink-mute text-center">
                  Anbudet är markerat som inlämnat — utfallet följs upp i pipelinen.
                </p>
              )}
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
