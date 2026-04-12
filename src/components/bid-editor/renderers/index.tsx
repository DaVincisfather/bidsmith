"use client";

import { BidSection, StyleGuide } from "@/lib/types";
import { CoverRenderer } from "./CoverRenderer";
import { DividerRenderer } from "./DividerRenderer";
import { PlaceholderRenderer } from "./PlaceholderRenderer";
import { ProseRenderer } from "./ProseRenderer";
import { BulletsRenderer } from "./BulletsRenderer";
import { ThreeColumnRenderer } from "./ThreeColumnRenderer";
import { PhasesRenderer } from "./PhasesRenderer";
import { GanttRenderer } from "./GanttRenderer";
import { TeamRenderer } from "./TeamRenderer";
import { MatrixRenderer } from "./MatrixRenderer";
import { ReferencesRenderer } from "./ReferencesRenderer";

interface SectionRendererProps {
  section: BidSection;
  style: StyleGuide;
  onSectionChange?: (updated: BidSection) => void;
}

export function SectionRenderer({ section, style, onSectionChange }: SectionRendererProps) {
  const content = section.content;

  function updateContent(patch: Partial<typeof content>) {
    if (!onSectionChange) return;
    onSectionChange({ ...section, content: { ...content, ...patch } as typeof content });
  }

  switch (content.format) {
    case "cover":
      return (
        <CoverRenderer
          title={content.title}
          client={content.client}
          date={content.date}
          style={style}
          onFieldChange={onSectionChange ? (field, value) => {
            updateContent({ [field]: value });
          } : undefined}
        />
      );

    case "section-divider":
      return (
        <DividerRenderer
          sectionNumber={content.sectionNumber}
          title={section.title}
          subtitle={content.subtitle}
          style={style}
          onFieldChange={onSectionChange ? (field, value) => {
            if (field === "title") onSectionChange({ ...section, title: value });
            else updateContent({ [field]: value });
          } : undefined}
        />
      );

    case "prose":
      return (
        <ProseRenderer
          title={section.title}
          text={content.text}
          style={style}
          onFieldChange={onSectionChange ? (field, value) => {
            if (field === "title") onSectionChange({ ...section, title: value });
            else updateContent({ text: value });
          } : undefined}
        />
      );

    case "bullets":
      return (
        <BulletsRenderer
          title={section.title}
          items={content.items}
          style={style}
          onFieldChange={onSectionChange ? (field, value) => {
            if (field === "title") onSectionChange({ ...section, title: value });
          } : undefined}
          onItemChange={onSectionChange ? (index, value) => {
            const items = [...content.items];
            items[index] = value;
            updateContent({ items });
          } : undefined}
          onItemAdd={onSectionChange ? () => {
            updateContent({ items: [...content.items, "Ny punkt"] });
          } : undefined}
          onItemRemove={onSectionChange ? (index) => {
            const items = content.items.filter((_, i) => i !== index);
            updateContent({ items });
          } : undefined}
        />
      );

    case "three-column":
      return (
        <ThreeColumnRenderer
          title={section.title}
          columns={content.columns}
          style={style}
          onColumnChange={onSectionChange ? (index, field, value) => {
            const columns = content.columns.map((col, i) =>
              i === index ? { ...col, [field]: value } : col
            );
            updateContent({ columns });
          } : undefined}
        />
      );

    case "phases":
      return (
        <PhasesRenderer
          phases={content.phases}
          style={style}
          onPhaseFieldChange={onSectionChange ? (phaseIndex, field, value) => {
            const phases = content.phases.map((p, i) =>
              i === phaseIndex ? { ...p, [field]: value } : p
            );
            updateContent({ phases });
          } : undefined}
        />
      );

    case "gantt":
      return (
        <GanttRenderer
          title={section.title}
          phases={content.phases}
          milestones={content.milestones}
          style={style}
        />
      );

    case "team":
      return (
        <TeamRenderer
          members={content.members}
          style={style}
          onMemberFieldChange={onSectionChange ? (index, field, value) => {
            const members = content.members.map((m, i) =>
              i === index ? { ...m, [field]: value } : m
            );
            updateContent({ members });
          } : undefined}
        />
      );

    case "requirement-matrix":
      return (
        <MatrixRenderer
          title={section.title}
          rows={content.rows}
          consultantNames={content.consultantNames}
          style={style}
        />
      );

    case "references":
      return (
        <ReferencesRenderer
          title={section.title}
          references={content.references}
          style={style}
          onReferenceFieldChange={onSectionChange ? (index, field, value) => {
            const references = content.references.map((r, i) =>
              i === index ? { ...r, [field]: value } : r
            );
            updateContent({ references });
          } : undefined}
        />
      );

    case "placeholder":
      return (
        <PlaceholderRenderer
          title={section.title}
          instruction={content.instruction}
          style={style}
          onFieldChange={onSectionChange ? (field, value) => {
            updateContent({ [field]: value });
          } : undefined}
        />
      );

    default: {
      const _exhaustive: never = content;
      return <div className="text-red-500 text-sm">Unknown format: {JSON.stringify(_exhaustive)}</div>;
    }
  }
}

export {
  CoverRenderer,
  DividerRenderer,
  PlaceholderRenderer,
  ProseRenderer,
  BulletsRenderer,
  ThreeColumnRenderer,
  PhasesRenderer,
  GanttRenderer,
  TeamRenderer,
  MatrixRenderer,
  ReferencesRenderer,
};
