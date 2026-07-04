"use client";

import { useState } from "react";
import Link from "next/link";
import { hasAnyEvidence, badgeState } from "@/lib/evidence-badge";

interface ConsultantRow {
  id: string;
  name: string;
  level: string;
  years_experience: number | null;
  summary: string | null;
  // evidence: verifierat CV-citat (migration 009). Bär dot-badgen på list-chippen
  // (#59 gav dem bara på [id]-profilen — produktägaren "hittade ingen chip" i listan).
  consultant_competencies: Array<{
    competency: string;
    category: string;
    evidence?: string | null;
  }>;
}

interface ConsultantListProps {
  initialData: ConsultantRow[];
}

const LEVEL_LABELS: Record<string, string> = {
  junior: "Junior",
  intermediate: "Medel",
  senior: "Senior",
  expert: "Expert",
};

const LEVEL_COLORS: Record<string, string> = {
  junior: "bg-green-100 text-green-700",
  intermediate: "bg-blue-100 text-blue-700",
  senior: "bg-purple-100 text-purple-700",
  expert: "bg-amber-100 text-amber-700",
};

export function ConsultantList({ initialData }: ConsultantListProps) {
  const [filterLevel, setFilterLevel] = useState<string>("");
  const [filterCompetency, setFilterCompetency] = useState<string>("");

  const filtered = initialData.filter((c) => {
    if (filterLevel && c.level !== filterLevel) return false;
    if (filterCompetency) {
      const match = c.consultant_competencies.some((cc) =>
        cc.competency.toLowerCase().includes(filterCompetency.toLowerCase())
      );
      if (!match) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-3">
        <select
          value={filterLevel}
          onChange={(e) => setFilterLevel(e.target.value)}
          className="border border-rule rounded px-3 py-1.5 text-sm"
        >
          <option value="">Alla nivåer</option>
          <option value="junior">Junior</option>
          <option value="intermediate">Medel</option>
          <option value="senior">Senior</option>
          <option value="expert">Expert</option>
        </select>
        <input
          type="text"
          placeholder="Filtrera kompetens..."
          value={filterCompetency}
          onChange={(e) => setFilterCompetency(e.target.value)}
          className="border border-rule rounded px-3 py-1.5 text-sm flex-1"
        />
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <p className="text-ink-mute text-sm py-8 text-center">
          {initialData.length === 0
            ? "Inga konsulter ännu. Ladda upp CV:n för att börja."
            : "Inga konsulter matchar filtret."}
        </p>
      ) : (
        <div className="border border-rule rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-paper-2">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-ink-soft">Namn</th>
                <th className="text-left px-4 py-2 font-medium text-ink-soft">Nivå</th>
                <th className="text-left px-4 py-2 font-medium text-ink-soft">Kompetenser</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {filtered.map((c) => {
                const listShowsBadges = hasAnyEvidence(c.consultant_competencies);
                return (
                <tr key={c.id} className="hover:bg-paper-2">
                  <td className="px-4 py-3">
                    <Link
                      href={`/consultants/${c.id}`}
                      className="font-medium text-ink hover:underline"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded ${LEVEL_COLORS[c.level] || ""}`}>
                      {LEVEL_LABELS[c.level] || c.level}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {c.consultant_competencies.slice(0, 4).map((cc, i) => {
                        // Legacy-grind per konsult (samma som profilen): bär ingen
                        // kompetens evidens visas inga dots alls. Bara dots i listan —
                        // inga expanderbara citat (densitet).
                        const state = badgeState(cc.evidence, listShowsBadges);
                        return (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 bg-paper-2 text-ink-soft px-2 py-0.5 rounded text-xs"
                          >
                            {state !== "none" && (
                              <>
                                <span
                                  aria-hidden="true"
                                  className={`inline-block h-1.5 w-1.5 rounded-full ${state === "kalla" ? "bg-accent" : "bg-flag"}`}
                                />
                                <span className="sr-only">
                                  {state === "kalla" ? "(belagd i CV)" : "(obelagd)"}
                                </span>
                              </>
                            )}
                            {cc.competency}
                          </span>
                        );
                      })}
                      {c.consultant_competencies.length > 4 && (
                        <span className="text-ink-mute text-xs">
                          +{c.consultant_competencies.length - 4}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
