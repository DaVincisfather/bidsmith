"use client";
import type { BidSectionContent, StyleGuide } from "@/lib/types";

type QAContent = Extract<BidSectionContent, { format: "quality-assurance" }>;

export function QualityAssuranceRenderer({
  title, content, style,
}: { title: string; content: QAContent; style: StyleGuide }) {
  return (
    <section className="p-6 text-sm">
      <h2 className="text-xl font-semibold mb-4" style={{ color: style.colors.primary }}>{title}</h2>
      <div className="space-y-4">
        <div>
          <p className="font-medium mb-1">Kvalitetsprocess</p>
          {content.qaProcess.map((p, i) => <p key={i} className="mb-2">{p}</p>)}
        </div>
        <div>
          <p className="font-medium">Kvalitetsansvarig</p>
          <p>{content.qualityLead.name} — {content.qualityLead.roleAndMandate}</p>
          <p className="text-gray-600">{content.qualityLead.contact}</p>
        </div>
        <div>
          <p className="font-medium mb-1">Eskalering</p>
          <p>{content.escalation.process}</p>
          <p className="text-gray-600">Rapportering: {content.escalation.reporting}</p>
        </div>
        <div>
          <p className="font-medium mb-1">Avstämningar</p>
          <ul className="list-disc pl-5">
            {content.checkpoints.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </div>
      </div>
    </section>
  );
}
