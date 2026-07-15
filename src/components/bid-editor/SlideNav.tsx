"use client";

import type { SlideGroup } from "@/lib/bid-editor/slot-meta";

/** Slide-navigering för profil-drivna (onboardade) anbud — ersätter SectionNav
 *  där: rutor är platshållar-bundna, så omordning/borttagning finns inte. */
interface SlideNavProps {
  groups: SlideGroup[];
  otherCount: number;
  activeSlide: number | "other" | null;
  onSlideClick: (source: number | "other") => void;
}

function itemClass(active: boolean): string {
  return `w-full text-left flex items-center gap-2 px-3 py-2 text-sm rounded transition-colors ${
    active ? "bg-paper-2 font-medium" : "hover:bg-paper-2"
  }`;
}

export function SlideNav({ groups, otherCount, activeSlide, onSlideClick }: SlideNavProps) {
  return (
    <nav className="space-y-0.5">
      {groups.map((g) => (
        <button key={g.source} type="button" onClick={() => onSlideClick(g.source)}
          className={itemClass(activeSlide === g.source)}>
          <span className="truncate flex-1">Slide {g.source}</span>
          <span className="text-[10px] text-ink-mute">
            {g.sections.length} {g.sections.length === 1 ? "ruta" : "rutor"}
          </span>
        </button>
      ))}
      {otherCount > 0 && (
        <button type="button" onClick={() => onSlideClick("other")}
          className={itemClass(activeSlide === "other")}>
          <span className="truncate flex-1">Övriga rutor</span>
          <span className="text-[10px] text-ink-mute">{otherCount}</span>
        </button>
      )}
    </nav>
  );
}
