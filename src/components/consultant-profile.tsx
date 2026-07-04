"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { hasAnyEvidence, badgeState } from "@/lib/evidence-badge";
import { KallaChip, FlaggedPill, TrustReceipt } from "@/components/kalla-chip";
import { SourceViewer } from "@/components/source-viewer";

interface Competency {
  id: string;
  competency: string;
  category: string;
  // Verifierat CV-citat (migration 009). Passthrough-fält: osynligt i editorn
  // (källa-badge är separat roadmap-punkt), men måste ridas med i PUT-payloaden
  // så en redigering inte tappar det persisterade citatet. Rutten re-verifierar.
  evidence?: string;
}

interface Reference {
  id: string;
  title: string;
  description: string;
  year: number;
  sector: string;
  evidence?: string;
}

interface ConsultantData {
  id: string;
  name: string;
  level: string;
  years_experience: number | null;
  summary: string | null;
  consultant_competencies: Competency[];
  consultant_references: Reference[];
}

interface ConsultantProfileProps {
  consultant: ConsultantData;
}

const LEVEL_LABELS: Record<string, string> = {
  junior: "Junior",
  intermediate: "Medel",
  senior: "Senior",
  expert: "Expert",
};

const CATEGORY_LABELS: Record<string, string> = {
  technical: "Teknisk",
  domain: "Domän",
  methodology: "Metodik",
  certification: "Certifiering",
};

export function ConsultantProfile({ consultant }: ConsultantProfileProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(consultant.name);
  const [level, setLevel] = useState(consultant.level);
  const [summary, setSummary] = useState(consultant.summary || "");
  const [saving, setSaving] = useState(false);
  // Ett aktivt citat i taget öppnar källvyn (slide-over) med hela CV:t markerat.
  const [activeQuote, setActiveQuote] = useState<string | null>(null);
  const router = useRouter();

  // Källvyn hämtar hela raw_cv_text med citaten markerade (server-side, bakom klick).
  const sourceUrl = `/api/consultants/${consultant.id}/source-view`;

  // Legacy-grind per konsult: bär varken kompetens eller referens evidens är profilen
  // skapad före evidens-featuren — visa då inga dots/chips alls.
  const allEvidenceItems = [
    ...consultant.consultant_competencies,
    ...consultant.consultant_references,
  ];
  const showBadges = hasAnyEvidence(allEvidenceItems);

  async function handleSave() {
    setSaving(true);
    try {
      const response = await fetch(`/api/consultants/${consultant.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          level,
          summary,
          yearsExperience: consultant.years_experience,
          // evidence rids med oförändrat (passthrough): oredigerade posters citat
          // ska överleva round-trippen. Nya poster som saknar citat skickar undefined.
          competencies: consultant.consultant_competencies.map((c) => ({
            competency: c.competency,
            category: c.category,
            evidence: c.evidence,
          })),
          references: consultant.consultant_references.map((r) => ({
            title: r.title,
            description: r.description,
            year: r.year,
            sector: r.sector,
            evidence: r.evidence,
          })),
        }),
      });

      if (!response.ok) throw new Error("Save failed");

      setEditing(false);
      router.refresh();
    } catch {
      alert("Kunde inte spara. Försök igen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          {editing ? (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-2xl font-bold border-b border-rule focus:outline-none focus:border-accent"
            />
          ) : (
            <h1 className="text-2xl font-bold">{consultant.name}</h1>
          )}
          <div className="flex items-center gap-3 mt-2">
            {editing ? (
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="border border-rule rounded px-2 py-1 text-sm"
              >
                <option value="junior">Junior</option>
                <option value="intermediate">Medel</option>
                <option value="senior">Senior</option>
                <option value="expert">Expert</option>
              </select>
            ) : (
              <span className="text-sm text-ink-mute">
                {LEVEL_LABELS[consultant.level] || consultant.level}
              </span>
            )}
            {consultant.years_experience && (
              <span className="text-sm text-ink-mute">
                {consultant.years_experience} års erfarenhet
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-ink text-white px-4 py-1.5 rounded text-sm hover:bg-accent-ink disabled:bg-paper-2"
              >
                {saving ? "Sparar..." : "Spara"}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="border border-rule px-4 py-1.5 rounded text-sm hover:bg-paper-2"
              >
                Avbryt
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="border border-rule px-4 py-1.5 rounded text-sm hover:bg-paper-2"
            >
              Redigera
            </button>
          )}
        </div>
      </div>

      {/* Summary */}
      <section>
        <h2 className="text-lg font-display font-normal mb-2">Sammanfattning</h2>
        {editing ? (
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={3}
            className="w-full border border-rule rounded p-3 text-sm focus:outline-none focus:border-accent"
          />
        ) : (
          <p className="text-ink-soft">{consultant.summary || "Ingen sammanfattning"}</p>
        )}
      </section>

      {/* Competencies */}
      <section>
        <h2 className="text-lg font-display font-normal mb-3">Kompetenser</h2>
        {/* Trust-receipt: belagda påståenden (kompetenser + uppdrag) i CV-källan. */}
        <TrustReceipt items={allEvidenceItems} />
        <div className="flex flex-wrap gap-2">
          {consultant.consultant_competencies.map((c) => {
            const state = badgeState(c.evidence, showBadges);
            const label = (
              <>
                {c.competency}
                <span className="text-blue-400 ml-1 text-xs">
                  ({CATEGORY_LABELS[c.category] || c.category})
                </span>
              </>
            );
            // Legacy / ingen evidens-feature: original-chippen orörd.
            if (state === "none") {
              return (
                <span
                  key={c.id}
                  className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm"
                >
                  {label}
                </span>
              );
            }
            // Dot före namnet: burgundy = belagd, amber = flaggad. Färgen är
            // aria-hidden — sr-only-texten bär distinktionen för skärmläsare
            // och färgblinda (WCAG 1.4.1, routine-fynd #59).
            const dot = (
              <>
                <span
                  aria-hidden="true"
                  className={`inline-block h-1.5 w-1.5 rounded-full ${state === "kalla" ? "bg-accent" : "bg-flag"}`}
                />
                <span className="sr-only">
                  {state === "kalla" ? "(belagd i CV)" : "(obelagd)"}
                </span>
              </>
            );
            // Flaggad kompetens: dot men inte klickbar — inget citat att visa.
            if (state === "flagged") {
              return (
                <span
                  key={c.id}
                  className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm"
                >
                  {dot}
                  {label}
                </span>
              );
            }
            // Belagd (grundad) kompetens: klickbar chip som öppnar källvyn på citatet.
            return (
              <button
                key={c.id}
                type="button"
                aria-label={`Visa källa: ${c.competency}`}
                onClick={() => setActiveQuote(c.evidence!)}
                className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm transition hover:brightness-95"
              >
                {dot}
                {label}
              </button>
            );
          })}
        </div>
      </section>

      {/* References */}
      <section>
        <h2 className="text-lg font-display font-normal mb-3">Uppdrag</h2>
        <div className="space-y-3">
          {consultant.consultant_references.map((r) => (
            <div key={r.id} className="p-4 bg-paper-2 rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium">{r.title}</span>
                <div className="flex items-center gap-2 text-xs text-ink-mute">
                  <span>{r.year}</span>
                  <span className={r.sector === "public" ? "text-blue-500" : "text-ink-mute"}>
                    {r.sector === "public" ? "Offentlig" : "Privat"}
                  </span>
                </div>
              </div>
              <p className="text-sm text-ink-soft">{r.description}</p>
              {badgeState(r.evidence, showBadges) === "kalla" && (
                <div className="mt-1.5">
                  <KallaChip quote={r.evidence!} label={r.title} onShowSource={setActiveQuote} />
                </div>
              )}
              {badgeState(r.evidence, showBadges) === "flagged" && (
                <div className="mt-1.5">
                  <FlaggedPill />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <SourceViewer
        open={activeQuote !== null}
        url={sourceUrl}
        quote={activeQuote}
        title={consultant.name}
        onClose={() => setActiveQuote(null)}
      />
    </div>
  );
}
