"use client";
import type { BidSectionContent, StyleGuide } from "@/lib/types";
import { EditableText } from "../EditableText";

type UnderstandingContent = Extract<BidSectionContent, { format: `understanding-${string}` }>;

export function UnderstandingRenderer({
  title,
  content,
  style,
  onChange,
}: {
  title: string;
  content: UnderstandingContent;
  style: StyleGuide;
  onChange?: (next: UnderstandingContent) => void;
}) {
  const editable = !!onChange;

  return (
    <section className="p-6">
      <h2 className="text-xl font-semibold mb-4" style={{ color: style.colors.primary }}>{title}</h2>

      {content.format === "understanding-current" && (
        <div className="space-y-2 text-sm">
          <p>
            <span className="font-medium">Organisation: </span>
            {editable ? (
              <EditableText
                value={content.organisation}
                onChange={(v) => onChange!({ ...content, organisation: v })}
                as="span"
              />
            ) : content.organisation}
          </p>
          <p>
            <span className="font-medium">System: </span>
            {editable ? (
              <EditableText
                value={content.system}
                onChange={(v) => onChange!({ ...content, system: v })}
                as="span"
              />
            ) : content.system}
          </p>
          <p>
            <span className="font-medium">Processer: </span>
            {editable ? (
              <EditableText
                value={content.processer}
                onChange={(v) => onChange!({ ...content, processer: v })}
                as="span"
              />
            ) : content.processer}
          </p>
          <div>
            <p className="font-medium">Smärtpunkter:</p>
            <ul className="list-disc pl-5">
              {content.smärtpunkter.map((s, i) => (
                <li key={i}>
                  {editable ? (
                    <EditableText
                      value={s}
                      onChange={(v) => onChange!({
                        ...content,
                        smärtpunkter: content.smärtpunkter.map((x, j) => j === i ? v : x),
                      })}
                      as="span"
                    />
                  ) : s}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {content.format === "understanding-assignment" && (
        <div className="space-y-3 text-sm">
          {content.stycken.map((p, i) => (
            <div key={i}>
              {editable ? (
                <EditableText
                  value={p}
                  onChange={(v) => onChange!({
                    ...content,
                    stycken: content.stycken.map((x, j) => j === i ? v : x),
                  })}
                  as="p"
                />
              ) : <p>{p}</p>}
            </div>
          ))}
        </div>
      )}

      {content.format === "understanding-vision" && (
        <div className="grid grid-cols-2 gap-6 text-sm">
          <div>
            <p className="font-medium mb-2">Utmaningar</p>
            <ul className="list-disc pl-5 space-y-1">
              {content.utmaningar.map((s, i) => (
                <li key={i}>
                  {editable ? (
                    <EditableText
                      value={s}
                      onChange={(v) => onChange!({
                        ...content,
                        utmaningar: content.utmaningar.map((x, j) => j === i ? v : x),
                      })}
                      as="span"
                    />
                  ) : s}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-medium mb-2">Värden</p>
            <ul className="list-disc pl-5 space-y-1">
              {content.värden.map((s, i) => (
                <li key={i}>
                  {editable ? (
                    <EditableText
                      value={s}
                      onChange={(v) => onChange!({
                        ...content,
                        värden: content.värden.map((x, j) => j === i ? v : x),
                      })}
                      as="span"
                    />
                  ) : s}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
