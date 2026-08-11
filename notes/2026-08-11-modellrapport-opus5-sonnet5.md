# Modellrapport: Opus 5 och Sonnet 5

*Underlag för Stefans beslut. Skriven 2026-08-11 kväll, allt verifierat mot
platform.claude.com samma kväll. Beslutspunkterna längst ned är formulerade så att
de går att avfärda lika snabbt som att godkänna.*

---

## 1. Vad evals kostar

Basen är fas 1-körningen (`evals/results-bid-model-comparison.md`), som är den enda
riktiga mätpunkten vi har: 12 anbud per modell, Opus 4.8 landade på **$6,12 totalt /
$0,51 per anbud**, Fable 5 på $15,14 / $1,262. Judgen (Sonnet 4-6, 60 par med
positionsbyte) är försumbar i sammanhanget, ~$1–2.

| Körning | Vad den svarar på | Uppskattad kostnad |
|---|---|---|
| Opus 4.8 vs **Opus 5** | Ska skrivrollen byta modell? | **~$15–16** |
| Opus 4.8 vs **Sonnet 5** | Räcker Sonnet för anbudstext? | **~$10–11** |
| **Trevägs:** 4.8@max, 4.8@high, Opus 5@high | Både effort-frågan (#107) OCH modellfrågan | **~$18–20** |

Uppskattningarna bygger på: Opus 5 kostar **exakt samma per token som Opus 4.8**
($5/$25 — samma tier, inget pristillägg), men skriver längre som default, så jag
lägger på 20–30 % tokenvolym. Sonnet 5 är $2/$10 men har en ny tokenizer som ger
~30 % fler tokens för samma text, netto ~1,9× billigare än Opus snarare än 2,5×.

**Trevägskörningen är den bästa affären.** Den kostar ~$3 mer än en ren
modelljämförelse och stänger då även #107:s eval-grind i samma svep, i stället för
att vi betalar för två separata körningar.

### Det som faktiskt är dyrt är inte pengarna

Fas 1 slog fast att **LLM-judgen har en belagd stilbias**: den gav Fable 50–1, du gav
Opus 7–1 i blindo. Beslutsregeln blev därför att judge-tally inte får beslutsvikt utan
mänsklig blindgranskning.

Det betyder att ingen av körningarna ovan *ger ett svar*. De producerar par som **du**
måste blindgranska. Kostnaden i dollar är en rundningspost; kostnaden i din tid är den
verkliga, och den är samma oavsett vilken körning vi väljer. Fas 1 tog 10 par.

---

## 2. Opus 5 — personlighet och prompting

Anthropic har en egen guide per modell sedan Opus 4.8-släppet. Sammanfattat, med
fokus på det som rör oss:

**Vad den är bra på.** Svår agentisk kodning: flerfilsfeatures, större refaktoreringar,
hela features end-to-end. Den lämnar inte stubbar eller platshållare, och presterar
bäst när den får hela uppgiftsspecifikationen på en gång och lämnas att köra.
Kodgranskning har både hög precision och recall. `low` och `medium` effort är
ovanligt starka — Anthropic rekommenderar dem uttryckligen som *primär*
kostnadskontroll, i stället för som en nödlösning.

**Fyra beteenden som kräver prompt-motmedel:**

1. **Den verifierar sig själv utan att bli tillsagd.** Instruktioner som "dubbelkolla
   ditt svar" eller "lägg till ett verifieringssteg" gör den *sämre* — de staplas
   ovanpå beteende den redan har och kostar tokens utan kvalitetsvinst. Anthropic
   säger rakt ut: ta bort dem.
   *Vår status: bundle-prompterna innehåller inga sådana instruktioner. Ingen åtgärd.*
2. **Den skriver längre.** Både svar till användaren och filer den lägger på disk.
   Och — viktigt — **effort styr inte svarslängden**, bara tankevolymen. Vill man ha
   kortare svar måste man be om det i prompten.
   *Relevans för oss: budgetreglerna (`budgetChars`) är byggda för att kapa längd
   mekaniskt. De fortsätter fungera, men modellen kommer trycka mot dem hårdare.*
3. **Den kan vidga uppgiften.** Lägger till steg som inte efterfrågats.
4. **Den delegerar gärna till subagenter** och **narrerar sina egna självkorrigeringar**
   mer än tidigare modeller. Bägge är irrelevanta för vår genereringspipeline (vi kör
   enkla bundle-anrop utan subagenter), men relevanta för hur *jag* jobbar i repot.

**API-skillnader att känna till:** tänkande är på som default (att utelämna
`thinking` betyder inte längre "inget tänkande"), och det går inte att stänga av vid
effort `xhigh`/`max`. Vår kod sätter alltid effort explicit på skrivbundlarna, så
inget av detta biter på oss.

---

## 3. Sonnet 5 — personlighet och prompting

**Vi kör redan Sonnet 5 på fem roller** sedan 2026-07-03: extraction, matching,
gonogo, writingSupport, writingGeneric. Bytet gjordes som en enradsändring utan
promptrevision, vilket var rätt enligt grind-policyn — men guiden pekar ut ett par
saker vi aldrig anpassade.

**Mer bokstavlig instruktionsföljning.** Sonnet 5 generaliserar inte en instruktion
från ett fall till ett annat och gissar sig inte till önskemål som inte uttrycks. Det
är en fördel för strukturerad extraktion och pipelines — alltså precis våra roller —
men det betyder att en instruktion som ska gälla brett måste säga det explicit
("gäller varje sektion, inte bara den första").

**Mer agentisk.** Når efter verktyg oftare och kör självverifieringsloopar. Gäller
inte våra rena JSON-steg.

**Bättre lägesuppdateringar** — ställningar som "sammanfatta var tredje verktygsanrop"
kan tas bort. Vi har inga.

**Effort-mappning vid migrering:** Sonnet 5 på `medium` ≈ Sonnet 4.6 på `high`; Sonnet
5 på `high` ≈ 4.6 på `max`. Våra Sonnet-roller sätter inte effort alls, vilket ger
`high` som default — alltså en nivå högre än vi hade före bytet, utan att någon
beslutat det.

### Ett fynd som rör en garanti vi tror att vi har

`CLAUDE.md` påstår: *"Extraction (Sonnet 5) körs med temperature 0 sedan fas 1 — samma
underlag ska ge samma kravlista."*

**Det stämmer inte längre.** `consultant-extractor.ts:89` sätter visserligen
`temperature: 0`, men Sonnet 5 avvisar sampling-parametrar med 400, så `ai-client.ts`
strippar den centralt (`NO_SAMPLING_MODELS`). Koden är alltså korrekt och kommenterad —
`ai-schemas.ts` och `evidence-guard.ts` noterar båda att "Sonnet 5 saknar
temperature-styrning" — men **CLAUDE.md utlovar fortfarande en reproducerbarhet vi inte
har.** Samma underlag kan ge olika kravlistor mellan körningar.

Det är inte nödvändigtvis fel att vi tappat den; det är fel att dokumentationen säger
att vi har den. Rättat i denna PR.

---

## 4. Beslutspunkter

**A. Kör trevägsevalen (~$18–20).** Stänger #107:s grind och svarar på Opus 5-frågan
i samma körning. Kräver din blindgranskning av ~10 par efteråt, annars är resultatet
inte beslutsgrundande.
→ *Min rekommendation: ja. Marginalkostnaden mot att bara stänga #107 är ~$3.*

**B. Byt writing till Opus 5 om evalen och din blindgranskning pekar åt det hållet.**
Kostar inget extra per token. Nu en radändring i `models.ts` — prisrad och
kapabilitetsrad finns redan.
→ *Rekommendation: avvakta A. Fas 1 visade att "nyare modell" inte är ett skäl i sig.*

**C. Sätt effort explicit på Sonnet-rollerna.** De ärver `high` sedan bytet i juli utan
att någon valt det. `medium` motsvarar det vi hade på 4.6 och skulle sänka kostnad och
latens på fem roller.
→ *Rekommendation: ja, men som egen liten PR med smoke — inte i evalen. Det rör inte
writing-rollen, så ingen eval krävs enligt policyn.*

**D. Prompt-audit av Sonnet-rollernas prompter mot literalismen.**
→ *Rekommendation: nej, inte nu. Ingen belagd skada — lägg som backlog-post tills något
faktiskt beter sig fel.*

---

## Källor

- [Prompting Claude Opus 5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5)
- [Prompting Claude Sonnet 5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5)
- [Effort](https://platform.claude.com/docs/en/build-with-claude/effort)
- [Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [Models overview](https://platform.claude.com/docs/en/about-claude/models/overview)
