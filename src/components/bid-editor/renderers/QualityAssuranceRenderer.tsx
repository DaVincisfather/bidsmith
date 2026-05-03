"use client";
import type { BidSectionContent, StyleGuide } from "@/lib/types";
import type { FieldBudgets } from "@/lib/pptx-template/budget-types";
import { EditableText } from "../EditableText";

type QAContent = Extract<BidSectionContent, { format: "quality-assurance" }>;

export function QualityAssuranceRenderer({
  title,
  content,
  style,
  onChange,
  budgets,
}: {
  title: string;
  content: QAContent;
  style: StyleGuide;
  onChange?: (next: QAContent) => void;
  budgets?: FieldBudgets;
}) {
  const editable = !!onChange;

  return (
    <section className="p-6 text-sm">
      <h2 className="text-xl font-semibold mb-4" style={{ color: style.colors.primary }}>{title}</h2>
      <div className="space-y-4">
        <div>
          <p className="font-medium mb-1">Kvalitetsprocess</p>
          {content.qaProcess.map((p, i) => (
            <div key={i} className="mb-2">
              {editable ? (
                <EditableText
                  value={p}
                  onChange={(v) => onChange!({
                    ...content,
                    qaProcess: content.qaProcess.map((x, j) => j === i ? v : x),
                  })}
                  as="p"
                />
              ) : <p>{p}</p>}
            </div>
          ))}
        </div>

        <div>
          <p className="font-medium">Kvalitetsansvarig</p>
          <div>
            {editable ? (
              <EditableText
                value={content.qualityLead.name}
                onChange={(v) => onChange!({
                  ...content,
                  qualityLead: { ...content.qualityLead, name: v },
                })}
                as="span"
              />
            ) : <span>{content.qualityLead.name}</span>}
            {" — "}
            {editable ? (
              <EditableText
                value={content.qualityLead.roleAndMandate}
                onChange={(v) => onChange!({
                  ...content,
                  qualityLead: { ...content.qualityLead, roleAndMandate: v },
                })}
                as="span"
              />
            ) : <span>{content.qualityLead.roleAndMandate}</span>}
          </div>
          <div className="text-gray-600">
            {editable ? (
              <EditableText
                value={content.qualityLead.contact}
                onChange={(v) => onChange!({
                  ...content,
                  qualityLead: { ...content.qualityLead, contact: v },
                })}
                as="span"
              />
            ) : content.qualityLead.contact}
          </div>
        </div>

        <div>
          <p className="font-medium mb-1">Eskalering</p>
          {editable ? (
            <EditableText
              value={content.escalation.process}
              onChange={(v) => onChange!({
                ...content,
                escalation: { ...content.escalation, process: v },
              })}
              as="p"
            />
          ) : <p>{content.escalation.process}</p>}
          <div className="text-gray-600">
            Rapportering:{" "}
            {editable ? (
              <EditableText
                value={content.escalation.reporting}
                onChange={(v) => onChange!({
                  ...content,
                  escalation: { ...content.escalation, reporting: v },
                })}
                as="span"
              />
            ) : content.escalation.reporting}
          </div>
        </div>

        <div>
          <p className="font-medium mb-1">Avstämningar</p>
          <ul className="list-disc pl-5">
            {content.checkpoints.map((c, i) => (
              <li key={i}>
                {editable ? (
                  <EditableText
                    value={c}
                    onChange={(v) => onChange!({
                      ...content,
                      checkpoints: content.checkpoints.map((x, j) => j === i ? v : x),
                    })}
                    as="span"
                    dataFieldPath={`checkpoints[${i}]`}
                    budget={budgets?.["checkpoints[*]"]}
                  />
                ) : c}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
