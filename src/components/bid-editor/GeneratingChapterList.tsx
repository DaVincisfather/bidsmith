"use client";

import type { ChapterItem } from "@/lib/bid-editor/expected-chapters";

const STATE_STYLES: Record<ChapterItem["state"], string> = {
  landed: "text-ink",
  pending: "text-ink-mute italic",
  failed: "text-red-600 line-through",
};

const STATE_ICONS: Record<ChapterItem["state"], string> = {
  landed: "✓",
  pending: "…",
  failed: "✕",
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
