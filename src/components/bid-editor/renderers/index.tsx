"use client";

import { BidSection, BidSectionContent, StyleGuide } from "@/lib/types";
import { CoverRenderer } from "./CoverRenderer";
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
}

export function SectionRenderer({ section, style, onSectionChange }: SectionRendererProps) {
  const content = section.content;

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
          onPhaseFieldChange={onSectionChange ? (phaseIndex, field, value) => {
            const phases = content.phases.map((p, i) =>
              i === phaseIndex ? { ...p, [field]: value } : p
            );
            updateContent({ phases });
          } : undefined}
        />
      );
    case "understanding-current":
    case "understanding-assignment":
    case "understanding-vision":
      return <UnderstandingRenderer title={section.title} content={content} style={style} />;
    case "quality-assurance":
      return <QualityAssuranceRenderer title={section.title} content={content} style={style} />;
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
            const totalTimmar = members.reduce((acc, m) => acc + m.timmar, 0);
            const totals = members.map((m) => m.total);
            const hasNull = totals.includes(null);
            const totalPris = hasNull ? null : (totals as number[]).reduce((a, b) => a + b, 0);
            updateContent({ members, summary: { totalTimmar, totalPris } });
          } : undefined}
        />
      );
    case "requirement-matrix-v2":
      return <RequirementMatrixV2Renderer title={section.title} content={content} style={style} />;
    case "reference-v2":
      return <ReferenceV2Renderer title={section.title} content={content} style={style} />;
    case "confidentiality":
      return <ConfidentialityRenderer title={section.title} content={content} style={style} />;
    case "certifications":
      return <CertificationsRenderer title={section.title} content={content} style={style} />;
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
