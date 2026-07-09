"use client";

import { useState, useEffect, useCallback } from "react";
import { OpportunityRow } from "./OpportunityRow";

type Filter = "relevant" | "all" | "dismissed";

interface Opportunity {
  id: string;
  title: string;
  buyer: string | null;
  deadline: string | null;
  estimated_value: number | null;
  relevance_score: number | null;
  relevance_reasoning: string | null;
  status: string;
  analysis_id: string | null;
  ted_url: string | null;
  fetched_at: string;
}

export function OpportunityList() {
  const [allOpportunities, setAllOpportunities] = useState<Opportunity[]>([]);
  const [filter, setFilter] = useState<Filter>("relevant");
  const [loading, setLoading] = useState(true);

  const fetchOpportunities = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/radar/opportunities");
    const data = (await res.json()).opportunities ?? [];
    setAllOpportunities(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- baselined at CI introduction
    fetchOpportunities();
  }, [fetchOpportunities]);

  const opportunities = allOpportunities.filter((o) => {
    if (filter === "relevant") return (o.relevance_score ?? 0) >= 50 && o.status !== "dismissed";
    if (filter === "dismissed") return o.status === "dismissed";
    return o.status !== "dismissed";
  });

  const handleDismiss = async (id: string) => {
    await fetch(`/api/radar/opportunities/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "dismissed" }),
    });
    setAllOpportunities((prev) =>
      prev.map((o) => (o.id === id ? { ...o, status: "dismissed" } : o))
    );
  };

  const handleAnalyze = async (id: string) => {
    setAllOpportunities((prev) =>
      prev.map((o) => (o.id === id ? { ...o, status: "analyzing" } : o))
    );
    const res = await fetch(`/api/radar/opportunities/${id}/analyze`, { method: "POST" });
    const data = await res.json();
    if (data.analysisId) {
      setAllOpportunities((prev) =>
        prev.map((o) => o.id === id ? { ...o, status: "analyzed", analysis_id: data.analysisId } : o)
      );
    }
  };

  const counts = {
    all: allOpportunities.filter((o) => o.status !== "dismissed").length,
    relevant: allOpportunities.filter((o) => (o.relevance_score ?? 0) >= 50 && o.status !== "dismissed").length,
    dismissed: allOpportunities.filter((o) => o.status === "dismissed").length,
  };

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: "relevant", label: "Relevanta", count: counts.relevant },
    { key: "all", label: "Alla", count: counts.all },
    { key: "dismissed", label: "Avfärdade", count: counts.dismissed },
  ];

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`text-xs px-3 py-1 rounded-full ${
              filter === tab.key ? "bg-accent text-paper" : "bg-paper-2 text-ink-soft"
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>
      {loading ? (
        <div className="text-sm text-ink-mute py-8 text-center">Laddar...</div>
      ) : opportunities.length === 0 ? (
        <div className="text-sm text-ink-mute py-8 text-center">Inga upphandlingar att visa.</div>
      ) : (
        <div className="border border-rule rounded-lg overflow-hidden">
          {opportunities.map((opp) => (
            <OpportunityRow
              key={opp.id}
              id={opp.id}
              title={opp.title}
              buyer={opp.buyer}
              deadline={opp.deadline}
              estimatedValue={opp.estimated_value}
              relevanceScore={opp.relevance_score}
              status={opp.status}
              analysisId={opp.analysis_id}
              tedUrl={opp.ted_url}
              onDismiss={handleDismiss}
              onAnalyze={handleAnalyze}
            />
          ))}
        </div>
      )}
    </div>
  );
}
