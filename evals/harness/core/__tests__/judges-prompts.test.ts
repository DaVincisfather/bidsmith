// evals/harness/core/__tests__/judges-prompts.test.ts
import { describe, it, expect } from "vitest";
import { HALLUCINATION_SYSTEM, EQUIV_SYSTEM } from "../judges";

describe("judge-promptar (kalibrering fas 1)", () => {
  it("hallucination-judgen undantar dokumentdatum och teamallokeringar", () => {
    expect(HALLUCINATION_SYSTEM).toMatch(/anbudsdatum|dokumentdatum/i);
    expect(HALLUCINATION_SYSTEM).toMatch(/omfattning|allokering/i);
  });

  it("equiv-judgen tolererar specificerande omformulering", () => {
    // Superseded av den riktade regeln men kontraktet kvarstår: exemplet
    // "Flytande svenska" vs "Flytande svenska i tal och skrift" ska matcha.
    expect(EQUIV_SYSTEM).toMatch(/Flytande svenska i tal och skrift/);
  });

  it("equiv-judgen är riktad: extra innehåll i Faktiskt ok, tappade villkor fäller", () => {
    // Skyddet för ska-kraven: output som SAKNAR golden-villkor får aldrig matcha,
    // men output med FLER bisatser än golden är ingen informationsförlust.
    expect(EQUIV_SYSTEM).toMatch(/FLER|fler (detaljer|bisatser|villkor)/);
    expect(EQUIV_SYSTEM).toMatch(/SAKNAR/);
  });

  it("riktade regeln är scopad till kravlistor — prosafält följer prosaregeln", () => {
    // Run5-regressionen: utan scoping fällde saknade-villkor-regeln summaries
    // som legitimt valt bort detaljer.
    expect(EQUIV_SYSTEM).toMatch(/[Kk]ravlist|listfält|requirements/);
    expect(EQUIV_SYSTEM).toMatch(/gäller (inte|ej) prosafält|prosafält.*undantag|för prosafält gäller istället/i);
  });

  it("equiv-judgen tolererar olika detaljurval i prosafält", () => {
    // Temperatur 0 låste in pedantisk strikthet: två korrekta sammanfattningar
    // av samma uppdrag dömdes olika för att de valde olika detaljer.
    expect(EQUIV_SYSTEM).toMatch(/detaljurval|huvudinnehåll/i);
  });
});
