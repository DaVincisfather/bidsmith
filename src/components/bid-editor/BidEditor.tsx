"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { BidSection, StyleGuide } from "@/lib/types";
import { failedUnitLabel, type FailedUnit } from "@/lib/bundle-labels";
import { buildChapterList } from "@/lib/bid-editor/expected-chapters";
import { ChapterDashboard } from "./ChapterDashboard";
import { EditorTopbar } from "./EditorTopbar";
import { SectionRenderer } from "./renderers";
import { ForgeLoader } from "../ForgeLoader";

interface BidEditorProps {
  bidId: string;
  /** The analysis this bid was generated from — powers the flow steps in the
   *  topbar. null for legacy bids without a linked analysis. */
  analysisId: string | null;
  initialSections: BidSection[];
  initialStatus: string;
  styleGuide: StyleGuide;
  initialFailedBundles: FailedUnit[];
  initialGenerationError: string | null;
  /** true when a go/no-go assessment exists — enables step 2 in the topbar. */
  gonogoEnabled: boolean;
  /** Diarienummer/deadline ur analysen; avsändare ur anbudets pinnade profil.
   *  null döljer respektive fält i topbaren. */
  diaryNumber: string | null;
  deadline: string | null;
  senderName: string | null;
  /** Dokumentnamn i topbaren (analysens client, fallback title). */
  docName: string;
}

export function BidEditor({
  bidId,
  analysisId,
  initialSections,
  initialStatus,
  styleGuide,
  initialFailedBundles,
  initialGenerationError,
  gonogoEnabled,
  diaryNumber,
  deadline,
  senderName,
  docName,
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
  // HH:MM för senast lyckade autosave — topbarens "SPARAD"-text (spec 2026-08-14).
  const [savedAt, setSavedAt] = useState<string | null>(null);
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
  // as they persist. null on finished bids — ChapterDashboard derives its own
  // rows; this list orders the document body's placeholders.
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
        } else {
          setSavedAt(
            new Date().toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" }),
          );
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
        throw new Error(data.error || "Exporten misslyckades");
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

  // Anbudsdatum ur cover-sektionen — topbarens metadata-rad (spec 2026-08-14).
  const coverContent = sections.find((s) => s.content?.format === "cover")?.content;
  const bidDate = coverContent?.format === "cover" ? coverContent.date : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <EditorTopbar
        analysisId={analysisId}
        gonogoEnabled={gonogoEnabled}
        diaryNumber={diaryNumber}
        docName={docName}
        status={status}
        savedAt={savedAt}
        saving={saving}
        downloadingMd={downloadingMd}
        submitting={submitting}
        onExport={downloadMarkdown}
        onSubmit={markSubmitted}
        showExportNudge={exportNudge && status === "draft"}
        senderName={senderName}
        deadline={deadline}
        bidDate={bidDate}
      />
      <div className="flex min-h-0 flex-1">
        {/* Left panel — chapter dashboard */}
        <aside className="w-60 shrink-0 border-r border-rule">
          <ChapterDashboard
            sections={sections}
            failedBundles={failedBundles}
            status={status}
            activeSectionKey={activeSectionKey}
            onSectionClick={scrollToSection}
            onReorder={handleReorder}
            onRemoveSection={handleRemoveSection}
          />
        </aside>

        {/* Center panel — document canvas on paper */}
        <main className="flex-1 overflow-y-auto bg-paper">
          <div className="max-w-3xl mx-auto py-7 px-6 space-y-4">
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

          {displaySections.map((section, i) => (
            <div
              key={section.key}
              ref={(el) => { sectionRefs.current[section.key] = el; }}
              className="group relative rounded-[14px] border border-rule bg-white px-8 py-7 shadow-sm"
              onClick={() => setActiveSectionKey(section.key)}
            >
              {/* Kortets kicker; rubrikunifieringen (Fraunces-h2 i wrappern,
                  renderer-rubrikerna bort) tas i renderer-PR:en (plan steg 5–7). */}
              <span className="mb-2 block font-mono text-[9px] uppercase tracking-widest text-ink-mute">
                Kapitel {String(i).padStart(2, "0")}
              </span>
              <SectionRenderer
                section={section}
                style={styleGuide}
                onSectionChange={isReady ? (updated) => handleSectionChange(section.key, updated) : undefined}
              />
            </div>
          ))}

          {status === "exported" && (
            <p role="status" className="pt-2 text-center text-sm text-ink-mute">
              Anbudet är markerat som inlämnat — utfallet följs upp i pipelinen.
            </p>
          )}
          </div>
        </main>
      </div>
    </div>
  );
}
