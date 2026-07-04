# CV-fixtures — noll-hallucinationsloop (fas B)

Rå konsult-CV:n som löptext + golden-antal kompetenser. Konsumeras av
`npm run eval:zero-halluc -- --target=cv`, som kör `extractConsultant` och
verifierar att varje extraherad kompetens/referens bär ett citat som finns
ORDAGRANT i `cv_text` (input-grounding).

**Fixtures är SYNTETISKA — ingen PII.** De genereras (operatörskört, BETALT) med
`tsx evals/scripts/generate-cv-fixtures.ts` ur identiteterna i
`evals/fixtures/consultants/synthetic-pool.yaml`. Namn/bolag/uppdrag är påhittade.

Schema: `CvFixtureSchema` i `evals/harness/core/fixtures.ts`
(`{ id, cv_text, golden: { competency_count } }`).
