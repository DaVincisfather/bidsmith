"use client";

import { useId } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BidSection } from "@/lib/types";
import type { FailedUnit } from "@/lib/bundle-labels";
import { buildChapterList } from "@/lib/bid-editor/expected-chapters";
import { ForgeLoader } from "../ForgeLoader";

// Kapiteldashboarden ur den godkända mockupen (C-varianten): numrerade rader
// med statusprick, N/M-räknare och avvikelsenoter DIREKT UNDER listan (Stefans
// justering 2026-08-14). Ersätter SectionNav + GeneratingChapterList som yta;
// omordning/borttagning (dnd-kit) och generering-tillstånden bevaras.
//
// Statusmodellen är ärlig och härledbar (spec 2026-08-14): klar (●) /
// avvikelse (◐ med not) / genereras. Mockupens "ej granskad" byggs medvetet
// inte — granskningsspårning vore en ny feature, inte omstyling.

type RowStatus = "ok" | "warn" | "pending" | "failed";

interface Row {
  key: string;
  title: string;
  status: RowStatus;
  note?: string;
  section?: BidSection;
}

interface ChapterDashboardProps {
  sections: BidSection[];
  failedBundles: FailedUnit[];
  status: string;
  activeSectionKey: string | null;
  onSectionClick: (key: string) => void;
  onReorder: (sections: BidSection[]) => void;
  onRemoveSection: (key: string) => void;
}

/** Mekaniskt detekterbar avvikelse för en landad sektion, eller null. */
function sectionDeviation(section: BidSection): string | null {
  const content = section.content;
  if (content?.format === "team-pricing" && content.members?.some((m) => m.timpris === null)) {
    return "timpris saknas";
  }
  return null;
}

function buildRows(
  sections: BidSection[],
  failedBundles: FailedUnit[],
  status: string,
): Row[] {
  if (status === "generating") {
    return buildChapterList(sections, failedBundles).map((item) => ({
      key: item.key,
      title: item.title,
      status: item.state === "landed" ? "ok" : item.state,
      note: item.state === "failed" ? "kunde inte genereras" : undefined,
      section: item.section,
    }));
  }

  // Färdigt anbud: sektionerna i ANVÄNDARENS ordning (omordningen får inte
  // skrivas över av v2-kanonordningen). ENDAST failade bundles appendas som
  // avvikelserader — ett kapitel som "saknas" utan failad bundle är antingen
  // medvetet borttaget av användaren (supportad handling, ska inte flaggas)
  // eller ett foreign-anbud vars format aldrig var v2-bundet.
  const rows: Row[] = sections.map((s) => {
    const note = sectionDeviation(s);
    return {
      key: s.key,
      title: s.title,
      status: note ? "warn" : "ok",
      note: note ?? undefined,
      section: s,
    };
  });
  for (const item of buildChapterList(sections, failedBundles)) {
    if (item.state !== "failed") continue;
    rows.push({
      key: item.key,
      title: item.title,
      status: "warn",
      note: "kunde inte genereras",
    });
  }
  return rows;
}

const GLYPH: Record<RowStatus, { char: string; cls: string }> = {
  ok: { char: "●", cls: "text-emerald-700" },
  warn: { char: "◐", cls: "text-flag" },
  pending: { char: "…", cls: "text-ink-mute" },
  failed: { char: "✕", cls: "text-red-600" },
};

function SortableRow({
  row,
  index,
  isActive,
  onClick,
  onRemove,
}: {
  row: Row;
  index: number;
  isActive: boolean;
  onClick: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: row.key,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      className={`group flex items-center gap-2 px-3.5 py-1.5 text-[13px] cursor-pointer border-l-2 transition-colors ${
        isActive
          ? "border-accent bg-accent-soft text-ink font-medium"
          : "border-transparent text-ink-soft hover:bg-paper"
      }`}
    >
      <span
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="cursor-grab text-transparent group-hover:text-ink-mute transition-colors text-xs"
        title="Dra för att flytta"
      >
        &#x2630;
      </span>
      <RowBody row={row} index={index} />
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="opacity-0 group-hover:opacity-100 text-ink-mute hover:text-red-500 transition-opacity text-xs"
        title="Ta bort"
      >
        &times;
      </button>
    </div>
  );
}

function RowBody({ row, index }: { row: Row; index: number }) {
  const glyph = GLYPH[row.status];
  // Väntande kapitel får en snurrande mini-indikator i stället för statiskt
  // "…" — Stefans smoke-fynd 2026-08-14: kravmatrisen tuggar länge och en
  // stillastående rad läses som att genereringen buggat ur.
  const indicator =
    row.status === "pending" ? (
      <span
        aria-hidden
        data-testid="chapter-spinner"
        className="h-3 w-3 shrink-0 animate-spin rounded-full border-[1.5px] border-ink-mute/60 border-t-transparent"
      />
    ) : (
      <span aria-hidden className={`text-[10px] ${glyph.cls}`}>
        {glyph.char}
      </span>
    );
  return (
    <>
      <span className="font-mono text-[9px] text-ink-mute w-4 shrink-0">
        {String(index).padStart(2, "0")}
      </span>
      <span
        className={`truncate flex-1 ${
          row.status === "failed" ? "text-red-600 line-through" : ""
        } ${row.status === "pending" ? "text-ink-mute" : ""}`}
      >
        {row.title}
      </span>
      {indicator}
    </>
  );
}

export function ChapterDashboard({
  sections,
  failedBundles,
  status,
  activeSectionKey,
  onSectionClick,
  onReorder,
  onRemoveSection,
}: ChapterDashboardProps) {
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const generating = status === "generating";
  const rows = buildRows(sections, failedBundles, status);
  const doneCount = rows.filter((r) => r.status === "ok").length;
  const deviations = rows.filter((r) => r.note);
  const sortableKeys = new Set(sections.map((s) => s.key));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sections.findIndex((s) => s.key === active.id);
    const newIndex = sections.findIndex((s) => s.key === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove(sections, oldIndex, newIndex));
  }

  return (
    <nav
      aria-label={generating ? "Kapitel under generering" : "Kapitel"}
      className="flex h-full flex-col overflow-y-auto bg-white"
    >
      <div className="flex items-center justify-between border-b border-rule px-3.5 py-2.5">
        <span className="font-mono text-[10px] uppercase tracking-widest text-ink-mute">Kapitel</span>
        <span className="font-mono text-[10px] font-bold text-accent">
          {doneCount}/{rows.length} KLARA
        </span>
      </div>
      <div className="py-1">
        {generating ? (
          rows.map((row, i) => (
            <div
              key={row.key}
              onClick={row.section ? () => onSectionClick(row.key) : undefined}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-[13px] border-l-2 ${
                activeSectionKey === row.key
                  ? "border-accent bg-accent-soft text-ink font-medium"
                  : "border-transparent text-ink-soft"
              } ${row.section ? "cursor-pointer hover:bg-paper" : ""}`}
            >
              <span aria-hidden className="w-3" />
              <RowBody row={row} index={i} />
            </div>
          ))
        ) : (
          <DndContext
            id={dndId}
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sections.map((s) => s.key)}
              strategy={verticalListSortingStrategy}
            >
              {rows.map((row, i) =>
                sortableKeys.has(row.key) ? (
                  <SortableRow
                    key={row.key}
                    row={row}
                    index={i}
                    isActive={activeSectionKey === row.key}
                    onClick={() => onSectionClick(row.key)}
                    onRemove={() => onRemoveSection(row.key)}
                  />
                ) : (
                  <div
                    key={row.key}
                    className="flex items-center gap-2 px-3.5 py-1.5 text-[13px] border-l-2 border-transparent text-ink-mute"
                  >
                    <span aria-hidden className="w-3" />
                    <RowBody row={row} index={i} />
                  </div>
                ),
              )}
            </SortableContext>
          </DndContext>
        )}
      </div>
      {generating && (
        <div className="mx-3.5 mb-3 mt-2 flex justify-center border-t border-rule pt-4">
          {/* Global liveness under listan (Stefans smoke-fynd 2026-08-14):
              mittens ForgeLoader försvinner när första kapitlen landat, och
              en lista med enbart väntande rader läses som hängd. */}
          <ForgeLoader size={40} />
        </div>
      )}
      {deviations.length > 0 && (
        <div className="mx-3.5 mb-3 mt-1 border-t border-rule pt-2 font-mono text-[9px] leading-relaxed text-ink-mute">
          {deviations.map((d) => (
            <div key={d.key}>
              ◐ {d.title}: {d.note}
            </div>
          ))}
        </div>
      )}
    </nav>
  );
}
