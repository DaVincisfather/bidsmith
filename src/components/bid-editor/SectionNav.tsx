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

const FORMAT_ICONS: Record<string, string> = {
  cover: "\u25A0",
  "section-divider": "\u2500",
  prose: "\u00B6",
  bullets: "\u2022",
  "three-column": "\u2261",
  phases: "\u25B6",
  gantt: "\u2502",
  team: "\u263A",
  "requirement-matrix": "\u2611",
  references: "\u2606",
  placeholder: "\u25A1",
};

interface SectionNavProps {
  sections: BidSection[];
  activeSectionKey: string | null;
  onSectionClick: (key: string) => void;
  onReorder: (sections: BidSection[]) => void;
  onRemoveSection: (key: string) => void;
}

function SortableItem({
  section,
  isActive,
  onClick,
  onRemove,
}: {
  section: BidSection;
  isActive: boolean;
  onClick: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: section.key,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const icon = (section.content && FORMAT_ICONS[section.content.format]) ?? "\u25CB";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer group transition-colors ${
        isActive ? "bg-paper-2 font-medium" : "hover:bg-paper-2"
      }`}
      onClick={onClick}
    >
      <span
        {...attributes}
        {...listeners}
        className="cursor-grab text-ink-mute hover:text-ink-soft"
        title="Dra för att flytta"
      >
        &#x2630;
      </span>
      <span className="text-ink-mute text-xs w-4 text-center">{icon}</span>
      <span className="truncate flex-1">{section.title}</span>
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

export function SectionNav({
  sections,
  activeSectionKey,
  onSectionClick,
  onReorder,
  onRemoveSection,
}: SectionNavProps) {
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sections.findIndex((s) => s.key === active.id);
    const newIndex = sections.findIndex((s) => s.key === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove(sections, oldIndex, newIndex));
  }

  return (
    <nav className="space-y-0.5">
      <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sections.map((s) => s.key)} strategy={verticalListSortingStrategy}>
          {sections.map((section) => (
            <SortableItem
              key={section.key}
              section={section}
              isActive={activeSectionKey === section.key}
              onClick={() => onSectionClick(section.key)}
              onRemove={() => onRemoveSection(section.key)}
            />
          ))}
        </SortableContext>
      </DndContext>
    </nav>
  );
}
