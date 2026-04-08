"use client";

import { useState, useEffect, useCallback } from "react";
import { BidSection } from "@/lib/types";
import { BidSectionCard } from "./bid-section-card";

interface BidPreviewProps {
  bidId: string;
  initialSections: BidSection[];
  initialStatus: string;
}

export function BidPreview({ bidId, initialSections, initialStatus }: BidPreviewProps) {
  const [sections, setSections] = useState<BidSection[]>(initialSections);
  const [status, setStatus] = useState(initialStatus);
  const [regeneratingKey, setRegeneratingKey] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function regenerateSection(sectionKey: string) {
    setRegeneratingKey(sectionKey);
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
      setSections((prev) =>
        prev.map((s) => (s.key === sectionKey ? data.section : s))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setRegeneratingKey(null);
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
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setDownloading(false);
    }
  }

  const isReady = status === "draft" || status === "exported";
  const sectionCount = sections.length;
  const aiSectionCount = sections.filter((s) => s.type === "ai").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Anbud</h3>
        <span className="text-sm text-gray-500">
          {status === "generating"
            ? `Genererar... (${sectionCount} sektioner klara)`
            : `${sectionCount} sektioner (${aiSectionCount} AI-genererade)`}
        </span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {sections.map((section) => (
          <BidSectionCard
            key={section.key}
            section={section}
            onRegenerate={
              section.type === "ai"
                ? () => regenerateSection(section.key)
                : undefined
            }
            regenerating={regeneratingKey === section.key}
          />
        ))}
      </div>

      {status === "generating" && sections.length === 0 && (
        <div className="text-center py-8 text-gray-400 text-sm">
          Genererar anbudssektioner...
        </div>
      )}

      <button
        onClick={downloadPptx}
        disabled={!isReady || downloading}
        className="w-full bg-gray-900 text-white px-4 py-3 rounded-lg text-sm font-medium
                   hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
      >
        {downloading
          ? "Genererar PowerPoint..."
          : status === "exported"
            ? "Ladda ner igen"
            : "Ladda ner PowerPoint"}
      </button>
    </div>
  );
}
