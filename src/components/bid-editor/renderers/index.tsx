"use client";

import { BidSection, BidSectionContent, StyleGuide } from "@/lib/types";
import type { FieldBudgets } from "@/lib/pptx-template/budget-types";
import { CoverRenderer } from "./CoverRenderer";

type TeamPricingContent = Extract<BidSectionContent, { format: "team-pricing" }>;

function recalcTeamSummary(members: TeamPricingContent["members"]): { totalTimmar: number; totalPris: number | null } {
  const totalTimmar = members.reduce((acc, m) => acc + m.timmar, 0);
  const totals = members.map((m) => m.total);
  const hasNull = totals.includes(null);
  const totalPris = hasNull ? null : (totals as number[]).reduce((a, b) => a + b, 0);
  return { totalTimmar, totalPris };
}

import { PhasesRenderer } from "./PhasesRenderer";
import { UnderstandingRenderer } from "./UnderstandingRenderer";
import { QualityAssuranceRenderer } from "./QualityAssuranceRenderer";
import { TeamPricingRenderer } from "./TeamPricingRenderer";
import { RequirementMatrixV2Renderer } from "./RequirementMatrixV2Renderer";
import { ReferenceV2Renderer } from "./ReferenceV2Renderer";
import { ConfidentialityRenderer } from "./ConfidentialityRenderer";
import { CertificationsRenderer } from "./CertificationsRenderer";

interface SectionRendererProps {
  section: BidSection;
  style: StyleGuide;
  onSectionChange?: (updated: BidSection) => void;
  budgets?: FieldBudgets;
  /** Slot-metadata för generic-prose (profil-drivna anbud): intent-etikett +
   *  teckenräknare mot budgetChars. Utan meta = dagens beteende exakt. */
  meta?: { intent: string; budgetChars?: number };
}

export function SectionRenderer({ section, style, onSectionChange, budgets, meta }: SectionRendererProps) {
  const content = section.content;

  function setContent(next: BidSectionContent) {
    if (!onSectionChange) return;
    onSectionChange({ ...section, content: next });
  }

  function updateContent(patch: Partial<BidSectionContent>) {
    if (!onSectionChange || !content) return;
    onSectionChange({ ...section, content: { ...content, ...patch } as BidSectionContent });
  }

  if (!content) {
    return <div className="text-amber-600 text-xs italic">Sektion saknar content</div>;
  }

  switch (content.format) {
    case "cover":
      return (
        <CoverRenderer
          title={content.title}
          client={content.client}
          date={content.date}
          onFieldChange={onSectionChange ? (field, value) => {
            updateContent({ [field]: value });
          } : undefined}
        />
      );
    case "phases":
      return (
        <PhasesRenderer
          phases={content.phases}
          style={style}
          onChange={onSectionChange ? (phases) => updateContent({ phases }) : undefined}
          budgets={budgets}
        />
      );
    case "understanding-current":
    case "understanding-assignment":
    case "understanding-vision":
      return (
        <UnderstandingRenderer
          title={section.title}
          content={content}
          style={style}
          onChange={onSectionChange ? setContent : undefined}
        />
      );
    case "quality-assurance":
      return (
        <QualityAssuranceRenderer
          title={section.title}
          content={content}
          style={style}
          onChange={onSectionChange ? setContent : undefined}
          budgets={budgets}
        />
      );
    case "team-pricing":
      return (
        <TeamPricingRenderer
          title={section.title}
          content={content}
          style={style}
          onTimprisChange={onSectionChange ? (idx, timpris) => {
            const members = content.members.map((m, i) => {
              if (i !== idx) return m;
              const total = timpris === null ? null : timpris * m.timmar;
              return { ...m, timpris, total };
            });
            updateContent({ members, summary: recalcTeamSummary(members) });
          } : undefined}
          onMemberFieldChange={onSectionChange ? (idx, field, value) => {
            const members = content.members.map((m, i) => {
              if (i !== idx) return m;
              if (field === "name" || field === "role") {
                return { ...m, [field]: value };
              }
              const num = Number(value);
              if (!Number.isFinite(num)) return m;
              if (field === "timmar") {
                const total = m.timpris === null ? null : m.timpris * num;
                return { ...m, timmar: num, total };
              }
              return { ...m, omfattningPct: num };
            });
            updateContent({ members, summary: recalcTeamSummary(members) });
          } : undefined}
        />
      );
    case "requirement-matrix-v2":
      return (
        <RequirementMatrixV2Renderer
          title={section.title}
          content={content}
          style={style}
          onChange={onSectionChange ? setContent : undefined}
        />
      );
    case "reference-v2":
      return (
        <ReferenceV2Renderer
          title={section.title}
          content={content}
          style={style}
          onChange={onSectionChange ? setContent : undefined}
        />
      );
    case "confidentiality":
      return (
        <ConfidentialityRenderer
          title={section.title}
          content={content}
          style={style}
          onChange={onSectionChange ? setContent : undefined}
        />
      );
    case "certifications":
      return (
        <CertificationsRenderer
          title={section.title}
          content={content}
          style={style}
          onChange={onSectionChange ? setContent : undefined}
          budgets={budgets}
        />
      );
    case "generic-prose": {
      // Fallback prose for a non-specialised slot (template-upload slice 4).
      // With meta (profile-driven bids): intent label + char counter vs budget.
      const intent = meta?.intent.trim();
      const label = intent ? intent : content.placeholder;
      const over =
        meta?.budgetChars !== undefined && content.text.length > meta.budgetChars;
      return (
        <div className="space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-xs text-neutral-500">{label}</div>
            {meta?.budgetChars !== undefined && (
              <div className={`text-[10px] tabular-nums ${over ? "text-red-600 font-medium" : "text-neutral-400"}`}>
                {content.text.length}/{meta.budgetChars}
              </div>
            )}
          </div>
          <textarea
            className={`w-full min-h-[8rem] rounded border p-2 text-sm ${over ? "border-red-400" : "border-neutral-300"}`}
            value={content.text}
            readOnly={!onSectionChange}
            onChange={onSectionChange ? (e) => updateContent({ text: e.target.value }) : undefined}
          />
        </div>
      );
    }
    default: {
      const _exhaustive: never = content;
      return <div className="text-red-500 text-sm">Unknown format: {JSON.stringify(_exhaustive)}</div>;
    }
  }
}

export {
  CoverRenderer,
  PhasesRenderer,
  UnderstandingRenderer,
  QualityAssuranceRenderer,
  TeamPricingRenderer,
  RequirementMatrixV2Renderer,
  ReferenceV2Renderer,
  ConfidentialityRenderer,
  CertificationsRenderer,
};
