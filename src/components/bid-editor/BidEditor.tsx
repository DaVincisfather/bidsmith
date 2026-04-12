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
