"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { DraftTable, OnboardingDraft } from "@/lib/pptx-template/onboarding/draft";
import { fastSlideSources } from "@/lib/pptx-template/onboarding/draft-logic";
import type {
  TableColumnRole,
  TemplateDefect,
  TemplateMeasurement,
} from "@/lib/pptx-template/template-profile";
import { SlideWireframe, type SlotDecision } from "./SlideWireframe";
import { SlotPanel } from "./SlotPanel";
import { TablePanel } from "./TablePanel";
import { SummaryView } from "./SummaryView";
import { MeasurementStep } from "./MeasurementStep";
import { HealthReport } from "./HealthReport";

type WizardData = {
  status: "needs_onboarding" | "classifying" | "draft" | "onboarded";
  draft: OnboardingDraft | null;
  error?: string;
  precount?: { slides: number; candidates: number };
  // Bara satta när status === "onboarded" (se GET-routen) — null = ännu inte
  // mätt lokalt (MeasurementStep), TemplateMeasurement = mätpasset klart (HealthReport).
  measurement?: TemplateMeasurement | null;
  knownDefects?: TemplateDefect[] | null;
};

const POLL_MS = 3000;
const MEASURE_POLL_MS = 10000;

export function OnboardingWizard({ templateId }: { templateId: string }) {
  const [data, setData] = useState<WizardData | null>(null);
  const [slideIdx, setSlideIdx] = useState(0); // index i slides-med-kandidater
  const [selectedShape, setSelectedShape] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [uiError, setUiError] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  const refresh = useCallback(async () => {
    // Fetch-reject (nät nere) får inte bli en unhandled rejection — då sätts
    // aldrig uiError och användaren fastnar tyst. refresh sväljer sitt eget fel
    // (satt som uiError) så anropare (complete/pollning) kan await:a utan att
    // kasta; en lyckad complete + failad refresh visar felet men behåller vägen.
    try {
      const res = await fetch(`/api/templates/${templateId}/onboarding`);
      if (res.ok) setData(await res.json());
    } catch {
      setUiError("nätverksfel — försök igen");
    }
  }, [templateId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- baselined at CI introduction
  useEffect(() => { refresh(); }, [refresh]);

  // Polla under klassificering (bid-genereringens klientmönster).
  useEffect(() => {
    if (data?.status !== "classifying") return;
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [data?.status, refresh]);

  // Polla under det lokala mätpasset (COM-mätningen körs utanför appen och
  // tar några minuter) — samma mönster som klassificeringspollen, glesare
  // intervall (MEASURE_POLL_MS) eftersom passet är betydligt längre.
  useEffect(() => {
    if (data?.status !== "onboarded" || data.measurement != null) return;
    const t = setInterval(refresh, MEASURE_POLL_MS);
    return () => clearInterval(t);
  }, [data?.status, data?.measurement, refresh]);

  // Slides som kräver beslut — statiska hoppas över i navigeringen. En slide
  // med bara en tabell (inga p:sp-textrutor, se Task 3-fixturen) har inga
  // shape-kandidater men ska ändå navigeras till (tabellsteget), så en slide
  // räknas som kandidat om den har EN slot-kandidat ELLER en tabell.
  const candidateSlides = useMemo(() => {
    const tables = data?.draft?.tables ?? [];
    return (
      data?.draft?.wireframe.filter(
        (s) => s.shapes.some((sh) => sh.candidate) || tables.some((t) => t.source === s.source),
      ) ?? []
    );
  }, [data?.draft]);
  const slide = candidateSlides[slideIdx] ?? null;

  const slotsOnSlide = useMemo(
    () => (slide ? data!.draft!.slots.filter((s) => s.source === slide.source) : []),
    [slide, data],
  );
  const tablesOnSlide = useMemo(
    () => (slide ? (data?.draft?.tables ?? []).filter((t) => t.source === slide.source) : []),
    [slide, data?.draft],
  );
  // Preliminära geometri-fynd (upload-tidens XML-matte, ingen COM) för sliden
  // som visas — rena informationsrader under wireframen, gate:ar ingenting.
  const screenFindings = useMemo(
    () => (slide ? (data?.draft?.screen ?? []).filter((f) => f.slide === slide.source) : []),
    [slide, data?.draft],
  );
  const selectedSlot =
    slotsOnSlide.find((s) => s.shapeIndex === selectedShape) ?? slotsOnSlide[0] ?? null;

  async function startClassification(force = false) {
    setUiError(null);
    try {
      const res = await fetch(`/api/templates/${templateId}/onboarding/propose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      if (!res.ok) { setUiError((await res.json()).error ?? "kunde inte starta"); return; }
      await refresh();
    } catch {
      setUiError("nätverksfel — försök igen");
    }
  }

  async function decide(input: { decision: "confirmed" | "skipped"; token?: string; intent?: string }) {
    if (!selectedSlot) return;
    setSaving(true);
    setUiError(null);
    try {
      const res = await fetch(`/api/templates/${templateId}/onboarding`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: selectedSlot.source,
          shapeIndex: selectedSlot.shapeIndex,
          ...input,
        }),
      });
      const body = await res.json();
      if (!res.ok) { setUiError(body.error ?? "kunde inte spara beslutet"); return; }
      setData((d) => (d ? { ...d, draft: body.draft } : d));
    } catch {
      // Fetch-reject: beslutet sparades INTE — säg det, annars tror användaren
      // att det gick igenom (optimistisk setData körs aldrig i denna gren).
      setUiError("nätverksfel — försök igen");
    } finally {
      setSaving(false);
    }
  }

  // Fast slide = alla rutor skippade → originaltexten behålls i alla anbud.
  // Ångra sätter pending (tidigare beslut återskapas inte — utkastet minns dem inte).
  async function decideSlide(decision: "skipped" | "pending") {
    if (!slide) return;
    setSaving(true);
    setUiError(null);
    try {
      const res = await fetch(`/api/templates/${templateId}/onboarding`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slide: slide.source, decision }),
      });
      const body = await res.json();
      if (!res.ok) { setUiError(body.error ?? "kunde inte spara beslutet"); return; }
      setData((d) => (d ? { ...d, draft: body.draft } : d));
    } catch {
      setUiError("nätverksfel — försök igen");
    } finally {
      setSaving(false);
    }
  }

  // Tabellbeslut (TablePanels "Bekräfta") — samma fetch/setData-mönster som
  // decide/decideSlide. Ogiltiga kartor (t.ex. två krav-kolumner) 422:as av
  // applyTableDecision (draft-logic) och ytas via uiError, samma väg som allt
  // annat i wizarden.
  async function decideTable(
    table: DraftTable,
    input: { headerRows: number; templateRowIndex: number; columns: TableColumnRole[] },
  ) {
    setSaving(true);
    setUiError(null);
    try {
      const res = await fetch(`/api/templates/${templateId}/onboarding`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table: { source: table.source, frameIndex: table.frameIndex, ...input },
        }),
      });
      const body = await res.json();
      if (!res.ok) { setUiError(body.error ?? "kunde inte spara tabellbeslutet"); return; }
      setData((d) => (d ? { ...d, draft: body.draft } : d));
    } catch {
      setUiError("nätverksfel — försök igen");
    } finally {
      setSaving(false);
    }
  }

  // Accepterar en malldefekt från hälsorapporten — samma fetch/setData-mönster
  // som decide/decideSlide (spara knownDefects direkt från POST-svaret,
  // ingen extra refresh() behövs).
  async function acceptDefect(sig: { slide: number; checkId: string; shape: string }) {
    setSaving(true);
    setUiError(null);
    try {
      const res = await fetch(`/api/templates/${templateId}/defects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sig),
      });
      const body = await res.json();
      if (!res.ok) { setUiError(body.error ?? "kunde inte acceptera defekten"); return; }
      setData((d) => (d ? { ...d, knownDefects: body.knownDefects } : d));
    } catch {
      setUiError("nätverksfel — försök igen");
    } finally {
      setSaving(false);
    }
  }

  // Bulk-varianten: samma endpoint med { all: true } — svaret bär hela den
  // uppdaterade knownDefects-listan precis som per-defekt-accepten.
  async function acceptAllDefects() {
    setSaving(true);
    setUiError(null);
    try {
      const res = await fetch(`/api/templates/${templateId}/defects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const body = await res.json();
      if (!res.ok) { setUiError(body.error ?? "kunde inte acceptera defekterna"); return; }
      setData((d) => (d ? { ...d, knownDefects: body.knownDefects } : d));
    } catch {
      setUiError("nätverksfel — försök igen");
    } finally {
      setSaving(false);
    }
  }

  async function complete() {
    setSaving(true);
    setUiError(null);
    try {
      const res = await fetch(`/api/templates/${templateId}/onboarding/complete`, { method: "POST" });
      if (!res.ok) { setUiError((await res.json()).error ?? "kunde inte slutföra"); return; }
      // Complete lyckades (mallen ÄR onboardad server-side). En failad refresh
      // ska inte se ut som ett complete-fel: refresh sätter sitt eget mildare
      // nätverksfel utan att kasta, så vägen framåt (ladda om sidan) behålls.
      await refresh();
    } catch {
      setUiError("nätverksfel — försök igen");
    } finally {
      setSaving(false);
    }
  }

  if (!data) {
    // uiError måste renderas även här: faller mount-refreshens fetch fastnar vi
    // annars på "Laddar…" i evighet utan att felet syns någonstans.
    return (
      <div className="py-12 space-y-2">
        <p className="text-ink-mute">Laddar…</p>
        {uiError && <p className="text-sm text-red-700">{uiError}</p>}
      </div>
    );
  }

  if (data.status === "needs_onboarding") {
    return (
      <div className="border border-rule rounded-lg p-6 space-y-4 max-w-xl">
        {data.error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
            Klassificeringen misslyckades: {data.error}
          </div>
        )}
        <p className="text-sm text-ink-soft">
          Mallen saknar platshållar-tokens. Bidsmith analyserar varje textruta med AI
          och föreslår vad som ska fyllas var — du bekräftar slide för slide.
        </p>
        {data.precount && (
          <p className="text-sm text-ink-soft">
            {data.precount.slides} slides · {data.precount.candidates} textrutor att
            klassificera. Ungefärlig AI-kostnad: under en dollar. Tar någon minut.
          </p>
        )}
        {uiError && <p className="text-sm text-red-700">{uiError}</p>}
        <button
          type="button"
          onClick={() => startClassification(Boolean(data.error))}
          className="bg-ink text-white py-2.5 px-6 rounded-lg font-medium hover:bg-accent-ink"
        >
          {data.error ? "Försök igen" : "Starta klassificering"}
        </button>
      </div>
    );
  }

  if (data.status === "classifying") {
    return (
      <div className="border border-rule rounded-lg p-6 max-w-xl space-y-3">
        <p className="text-sm font-medium">Klassificerar textrutor…</p>
        <p className="text-sm text-ink-mute">
          Sidan uppdateras automatiskt. Tar det mer än ett par minuter kan du{" "}
          <button type="button" className="underline" onClick={() => startClassification(true)}>
            köra om klassificeringen
          </button>.
        </p>
        {uiError && <p className="text-sm text-red-700">{uiError}</p>}
      </div>
    );
  }

  if (data.status === "onboarded") {
    if (!data.measurement) {
      return <MeasurementStep templateId={templateId} />;
    }
    return (
      <div className="space-y-4">
        <HealthReport
          measurement={data.measurement}
          knownDefects={data.knownDefects ?? []}
          onAccept={acceptDefect}
          onAcceptAll={acceptAllDefects}
          saving={saving}
          uiError={uiError}
        />
        <Link href="/installningar" className="inline-block text-sm font-medium text-accent hover:underline">
          Till Inställningar →
        </Link>
      </div>
    );
  }

  // status === "draft"
  if (!data.draft || candidateSlides.length === 0) {
    return (
      <div className="border border-rule rounded-lg p-6 max-w-xl space-y-4">
        {data.error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
            {data.error}
          </div>
        )}
        <p className="text-sm text-ink-soft">
          Utkast saknas — kör om klassificeringen från startsidan.
        </p>
        <button
          type="button"
          onClick={() => startClassification(true)}
          className="bg-ink text-white py-2.5 px-6 rounded-lg font-medium hover:bg-accent-ink"
        >
          Kör om klassificeringen
        </button>
      </div>
    );
  }

  const confirmed = data.draft.slots.filter((s) => s.decision === "confirmed").length;
  const pending = data.draft.slots.filter((s) => s.decision === "pending").length;

  const slideIsFast =
    slide !== null && fastSlideSources(data.draft.slots).includes(slide.source);

  if (showSummary) {
    return (
      <SummaryView
        slots={data.draft.slots}
        confirmed={confirmed}
        saving={saving}
        uiError={uiError}
        onBack={() => setShowSummary(false)}
        onComplete={complete}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Navigeringsremsa */}
      <div className="flex items-center gap-2 flex-wrap text-sm">
        {candidateSlides.map((s, i) => (
          <button key={s.source} type="button"
            onClick={() => { setSlideIdx(i); setSelectedShape(null); }}
            className={`px-2.5 py-1 rounded border text-xs font-medium ${
              i === slideIdx ? "border-accent text-accent" : "border-rule text-ink-soft hover:border-accent"
            }`}>
            Slide {s.source}
          </button>
        ))}
        <span className="ml-auto text-xs text-ink-mute">
          {confirmed} bekräftade · {pending} kvar att besluta
        </span>
      </div>

      {/* Fast-slide-knappen gäller textrutor (applySlideDecision kräver minst
          en) — en ren tabellslide har inga, så knappen döljs där. */}
      {slotsOnSlide.length > 0 && (
        <div className="flex items-center gap-3">
          {slideIsFast ? (
            <>
              <span className="text-xs text-ink-soft">
                Sliden är markerad som fast — originaltexten behålls i alla anbud.
              </span>
              <button type="button" disabled={saving} onClick={() => decideSlide("pending")}
                className="text-xs underline text-ink-mute hover:text-ink disabled:opacity-50">
                Ångra (rutorna blir obeslutade)
              </button>
            </>
          ) : (
            <button type="button" disabled={saving} onClick={() => decideSlide("skipped")}
              title="Alla rutor på sliden skippas — slidens originaltext behålls oförändrad i varje anbud"
              className="border border-rule py-1.5 px-3 rounded text-xs font-medium hover:border-accent disabled:opacity-50">
              Markera hela sliden som fast
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[1fr_20rem] gap-4">
        <div className="space-y-2">
          <SlideWireframe
            slide={slide!}
            slideSize={data.draft.slideSize}
            selectedShapeIndex={selectedSlot?.shapeIndex ?? null}
            decisions={new Map(slotsOnSlide.map((s) => [s.shapeIndex, s.decision as SlotDecision]))}
            onSelect={setSelectedShape}
            tables={tablesOnSlide}
          />
          {screenFindings.length > 0 && (
            <div className="border border-rule rounded-lg p-3 text-xs text-ink-soft space-y-1">
              <p className="font-medium text-ink-mute uppercase tracking-wide text-[11px]">
                Preliminär geometri-bedömning
              </p>
              <ul className="space-y-1">
                {screenFindings.map((f) => (
                  <li key={`${f.shape}:${f.kind}`}>
                    Ruta {f.shape} —{" "}
                    {f.kind === "static-overflow" ? "statisk overflow" : "trång box"}: {f.detail}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="space-y-3">
          {selectedSlot && (
            <SlotPanel
              key={`${selectedSlot.source}:${selectedSlot.shapeIndex}`}
              slot={selectedSlot}
              onDecide={decide}
              saving={saving}
            />
          )}
          {tablesOnSlide.map((t) => (
            <TablePanel
              key={`table-${t.source}-${t.frameIndex}`}
              table={t}
              onDecide={(input) => decideTable(t, input)}
              saving={saving}
            />
          ))}
          {!selectedSlot && tablesOnSlide.length === 0 && (
            <p className="text-sm text-ink-mute">Välj en markerad ruta i wireframen.</p>
          )}
        </div>
      </div>

      {uiError && <p className="text-sm text-red-700">{uiError}</p>}

      <div className="flex gap-3">
        <button type="button" disabled={slideIdx === 0}
          onClick={() => { setSlideIdx((i) => i - 1); setSelectedShape(null); }}
          className="border border-rule py-2 px-4 rounded font-medium text-sm hover:border-accent disabled:opacity-50">
          ← Föregående
        </button>
        {slideIdx < candidateSlides.length - 1 ? (
          <button type="button"
            onClick={() => { setSlideIdx((i) => i + 1); setSelectedShape(null); }}
            className="bg-ink text-white py-2 px-6 rounded font-medium text-sm hover:bg-accent-ink">
            Nästa slide →
          </button>
        ) : (
          <button type="button" onClick={() => setShowSummary(true)}
            className="bg-ink text-white py-2 px-6 rounded font-medium text-sm hover:bg-accent-ink">
            Till sammanfattningen →
          </button>
        )}
      </div>
    </div>
  );
}
