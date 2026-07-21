# Backlog: coherence/synthesis-pass (POLISH, ej correctness)

*Noterat 2026-06-04, under demo. Fråga som kom upp: "har vi en delad brief eller ett sammanfogande pass för de parallella agenterna?"*

## TL;DR

Delad brief finns, sammanfogande pass saknas. Att lägga till ett är **polish, inte
correctness** — det gör en redan korrekt bid snyggare att läsa. **Testa det billiga
preventiva greppet först** (kanonisk vokabulär + sektionsavgränsning i `formatContext`).
Bygg det dyra reconciliation-passet bara om det preventiva visar sig otillräckligt.

## Nuläge (verifierat i kod)

- **Delad brief: ja.** Alla 6 bundles får identisk kontext via `formatContext(ctx)`
  (`src/lib/bid-generator/context.ts:16`) — RFP-analys, team-summary med scores, Go/No-Go.
- **Sammanfogande pass: nej.** `generateAllSections` (`src/lib/bid-generator/index.ts:44`)
  kör de 6 bundlarna via `Promise.all` och **konkatenerar** i mallordning (`index.ts:53`).
  Inget pass jämkar ton, dubbletter eller cross-section-konsistens.

## Korrekt etikett: polish, inte correctness

Eval-harnessen fångar **struktur, täckning och hallucination**. Det här passet rör
ingen av dem — det gör en redan korrekt bid enhetligare att läsa. Etiketten måste
följa med punkten, annars riskerar den att konkurrera ut faktiska coverage-luckor.
**Lägre prio än varje correctness-punkt.** Legitimt skäl: höjer upplevd kvalitet,
särskilt i demo. Men det är allt det gör.

## Försök detta FÖRST (billigt, preventivt)

Utöka briefen i `formatContext` med:
- **Kanonisk termlista** — låst vokabulär så sektionerna inte glider i terminologi.
- **Sektionsavgränsning** — "understanding täcker X, phases täcker Y, överlappa inte".

Kostar **noll extra anrop**. Kan plausibelt ta bort ~70% av redundansen preventivt.
Samma disciplin som resten av pipelinen: billigt och preventivt där man kan, dyrt och
reaktivt bara där man måste. Bygg reconciliation-passet nedan bara om detta inte räcker.

## Om det preventiva inte räcker: reconciliation-pass

Sjunde **sekventiell** Opus-runda efter `Promise.all`. Tar hopsatta sektioner, jämkar
röst/ton + tar bort dubbletter mellan understanding/phases/etc.

### Scope-lås (kritiskt)
Får ENDAST ändra ton + ta bort redundans. **Får ej tillföra fakta eller påståenden.**

### Pipeline-ordning är INTE trivial (designkrav, inte "litet ingrepp i index.ts")
Två risker vi redan byggt pipelinen för att undvika återinförs om ordningen är fel:

1. **Hallucination återinförd i sista steget.** Ett fritt "putsa om"-pass kan glida och
   hitta på. Det vore ironiskt att lägga koherens-passet *efter* hallucination-evaluatorn
   och därmed släppa förbi osanningar. → Snäv instruktion (scope-lås ovan) **och kör
   hallucination-checken igen på passets output**, inte bara på de ursprungliga sektionerna.

2. **Overflow återinförd.** Layout-correctorn körde på de enskilda sektionerna. Skriver
   passet om text kan teckenbudgeten spräckas igen. → Passet måste ligga **före eller
   sammanvävt med** overflow-korrigeringen, aldrig efter. Annars putsar man ton och
   spräcker lådorna.

**Ordning:** efter `Promise.all` → före/sammanvävt med overflow-korrigering → följt av
förnyad hallucination-check på output.

### Trade-off
+1 stort token-tungt anrop + en latensrunda. Värt det för demo/upplevd enhetlighet,
men lägre prio än faktiska coverage-luckor. Ev. on/off per kvalitetstier (kopplar till
standard/premium i prismodellen).
