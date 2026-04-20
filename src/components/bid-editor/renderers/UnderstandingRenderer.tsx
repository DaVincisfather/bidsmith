"use client";
import type { BidSectionContent, StyleGuide } from "@/lib/types";

type UnderstandingContent = Extract<BidSectionContent, { format: `understanding-${string}` }>;

export function UnderstandingRenderer({
  title,
  content,
  style,
}: {
  title: string;
  content: UnderstandingContent;
  style: StyleGuide;
}) {
  return (
    <section className="p-6">
      <h2 className="text-xl font-semibold mb-4" style={{ color: style.colors.primary }}>{title}</h2>
      {content.format === "understanding-current" && (
        <div className="space-y-2 text-sm">
          <p><span className="font-medium">Organisation:</span> {content.organisation}</p>
          <p><span className="font-medium">System:</span> {content.system}</p>
          <p><span className="font-medium">Processer:</span> {content.processer}</p>
          <div>
            <p className="font-medium">Smärtpunkter:</p>
            <ul className="list-disc pl-5">
              {content.smärtpunkter.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
        </div>
      )}
      {content.format === "understanding-assignment" && (
        <div className="space-y-3 text-sm">
          {content.stycken.map((p, i) => <p key={i}>{p}</p>)}
        </div>
      )}
      {content.format === "understanding-vision" && (
        <div className="grid grid-cols-2 gap-6 text-sm">
          <div>
            <p className="font-medium mb-2">Utmaningar</p>
            <ul className="list-disc pl-5 space-y-1">
              {content.utmaningar.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
          <div>
            <p className="font-medium mb-2">Värden</p>
            <ul className="list-disc pl-5 space-y-1">
              {content.värden.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
