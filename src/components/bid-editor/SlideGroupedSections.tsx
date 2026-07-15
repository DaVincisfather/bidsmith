"use client";

import type { BidSection, StyleGuide } from "@/lib/types";
import type { GroupedSections, SlotMeta } from "@/lib/bid-editor/slot-meta";
import { SectionRenderer } from "./renderers";

/** Grupperad huvudvy för profil-drivna anbud: prosa-rutor under sliderubriker i
 *  mallens ordning; kortfält är redan bortfiltrerade (groupSectionsBySlide);
 *  sektioner utan profil-träff visas synligt sist — aldrig tyst dolda. */
interface SlideGroupedSectionsProps {
  grouped: GroupedSections;
  /** Måste vara samma meta-objekt som genererade `grouped` — BidEditor garanterar detta via ett gemensamt useMemo. */
  slotMeta: SlotMeta;
  style: StyleGuide;
  onSectionChange: (key: string, updated: BidSection) => void;
  registerSlideRef: (source: number | "other", el: HTMLDivElement | null) => void;
  onActivate: (source: number | "other") => void;
}

function groupHeading(text: string) {
  return (
    <h3 className="text-xs font-mono font-bold uppercase tracking-wide text-ink-mute border-b border-rule pb-1">
      {text}
    </h3>
  );
}

export function SlideGroupedSections({
  grouped, slotMeta, style, onSectionChange, registerSlideRef, onActivate,
}: SlideGroupedSectionsProps) {
  return (
    <>
      {grouped.slides.map((group) => (
        <div key={group.source} ref={(el) => registerSlideRef(group.source, el)}
          className="space-y-4" onClick={() => onActivate(group.source)}>
          {groupHeading(
            `Slide ${group.source} · ${group.sections.length} ${group.sections.length === 1 ? "ruta" : "rutor"}`,
          )}
          {group.sections.map((section) => {
            const m = section.content?.format === "generic-prose"
              ? slotMeta[section.content.placeholder]
              : undefined;
            return (
              <SectionRenderer key={section.key} section={section} style={style}
                meta={m ? { intent: m.intent, budgetChars: m.budgetChars } : undefined}
                onSectionChange={(updated) => onSectionChange(section.key, updated)} />
            );
          })}
        </div>
      ))}
      {grouped.other.length > 0 && (
        <div ref={(el) => registerSlideRef("other", el)} className="space-y-4"
          onClick={() => onActivate("other")}>
          {groupHeading(`Övriga rutor · ${grouped.other.length}`)}
          {grouped.other.map((section) => (
            <SectionRenderer key={section.key} section={section} style={style}
              onSectionChange={(updated) => onSectionChange(section.key, updated)} />
          ))}
        </div>
      )}
    </>
  );
}
