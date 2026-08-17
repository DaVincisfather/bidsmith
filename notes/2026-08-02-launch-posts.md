# Lanseringsposter — UTKAST för Stefans granskning

*Skrivna 2026-08-02 (Fas 3 i lanseringsplanen). Publiceras av Stefan, inte av assistenten.
Alla sakpåståenden är verifierade mot repot/README; ställen märkta [JUSTERA] är Stefans
röst-/faktaval. Ekan nämns INTE (beslut 2026-07-06: lanseringen är helt fristående).*

**Ordning enligt plan:** LinkedIn (svenska, bygghistoria) → X (engelska, builder-vinkel).
Video bifogas båda; GIF-versionen till X + README. Demosidan (Fas 2) är inte byggd —
"demo i uppföljningspost" är okej enligt planen.

---

## LinkedIn (svenska — bygghistoria, inte produktpitch)

*SLUTVERSION 2026-08-17, Stefans röst (omskriven från grundutkastet i session med
Claude; aforismerna/fetstils-rubrikerna strukna på Stefans direktiv — LinkedIn
renderar ändå inte markdown). Schemaläggs 2026-08-18 07:30. Repo-länk i brödtexten
(Stefans val, räckviddsstraffet accepterat). Video: `bidsmith-launch-draft.mp4`
(82,5 s, MED ljudspår — INTE bidsmith-video.mp4 som är det tysta mastret).*

Jag är managementkonsult, inte utvecklare. Under våren och sommaren har jag ändå
byggt Bidsmith — en produkt driven av agentisk AI som stöttar konsultfirmor i att
förstå offentliga upphandlingar, matcha dem mot era konsultprofiler och ta fram ett
strukturerat anbudsutkast som ni sedan använder i era egna anbudsmallar och
AI-verktyg.

Hela bygget är gjort med Claude Code, på kvällar och helger, mellan blöjbyten och
att torka spyfläckar. Jag har inte skrivit koden själv — jag kravställer,
orkestrerar och testar produkten mot vad jag tror att andra konsulter vill ha.

Tre saker bygget har lärt mig om AI:

1. Att nyttja AI på ett bra sätt är svårare än man tror. Det kräver bra kontext
   kring modellen, det kräver specifika områden där modellen är bra, och det kräver
   god intuition hos människan som orkestrerar AI:n om när man riskerar att hamna
   snett.

2. Mätning slår magkänsla. Eftersom det här får klassas som något vibe-kodat har
   jag lutat mig hårt mot testning och validering av utfall där jag inte förstår
   tekniken. Ett exempel: när jag blindtestade två modellers anbudstext valde en
   AI-domare Fable nästan varje gång — medan mina egna blindtester valde Opus
   7 gånger av 8. Utan kalibrering mot mänsklig bedömning är en AI-domare bara en
   åsikt till.

3. Våga döda din egen darling. Jag byggde en hel motor för att rendera anbud
   direkt i valfri PowerPoint-mall — mallonboarding, layoutmätning, kalibrering.
   Sen insåg jag att sista milen (formateringen) redan löses bättre av verktygen
   alla ändå använder, och bytte till strukturerad Markdown ut. Äg det
   domänspecifika, låt ekosystemet äga resten.

Bidsmith är fritt och open source (Apache 2.0). Ingen prismodell, ingen tjänst att
prenumerera på — du kör den själv och betalar bara din egen API-kostnad, ungefär
en dollar per anbud.

Nyfiken på att testa? Jag hjälper gärna till med uppsättningen — skriv i DM. Vill
ni att jag hostar åt er är det lite mer komplicerat, men det går säkert att lösa om
ni verkligen vill.

Repo: https://github.com/DaVincisfather/bidsmith

[Video bifogas: bidsmith-launch-draft.mp4]

---

## X (engelska — builder-vinkel: modellstrategi + eval-harness)

**Huvudpost:**

I'm a management consultant, not a developer. Over the past few months I built and
open-sourced Bidsmith — an AI agent that turns a public tender + your consultant
CVs into a structured, evidence-backed proposal draft you can pipe into any
template or tool.

Built entirely with Claude Code. Free, Apache 2.0.

What I learned about building agentic pipelines 🧵

**Tråd:**

1/ Pipeline design: every step gets the *compressed output* of the previous step,
never the raw documents. Keeps prompts tight and cost predictable — a full tender
(analysis → matching → go/no-go → full draft → Markdown export) runs ≈ $1 in API.

2/ Model strategy is per role, not per app: Sonnet for extraction and matching
(mechanical JSON work), Opus where the bid is won or lost (writing). One model
registry in code — no hardcoded model strings.

3/ The LLM-judge trap: I blind-tested two models' proposal text. Humans picked one
7–1. An LLM judge picked the *other* — 50–1. Style bias is real. Never give an LLM
judge decision weight without calibrating it against human-labeled pairs.

4/ Hallucination control that actually holds: the schema forces every extracted
claim to carry a verbatim quote from the source doc, verified by mechanical string
matching (no second model grading the first). Unbacked claims get stripped and
quarantined from every downstream AI input.

5/ Evals as gates, not vibes: an offline eval harness with synthetic fixtures ships
in the repo, so you can run the whole pipeline without any real tender data.

6/ Kill your darlings: I built a full engine that renders bids into arbitrary
PowerPoint templates — template onboarding, layout measurement, calibration loops.
Then I cut it. The formatting last mile is already solved by the tools people use
daily; the output is structured Markdown instead. Own the domain-specific work,
let the ecosystem own the rest.

Repo: https://github.com/DaVincisfather/bidsmith

[GIF/video i huvudposten]

---

## Publiceringschecklista

- [x] Videon klar (**v8.1**, 82,5 s, omfilmad 2026-08-16/17 mot nya UI:t: go/no-go-sidan,
      editor-omdesignen, rail-flikarna med seedade utfall; nedsaktad efter pacing-feedback.
      Klippt programmatiskt — rigg + finaler i `bidsmith-video/tmp/videocut/`, arkiverad i
      `bidsmith-brand/launch-arkiv/v8-2026-08-17/`. 15s-GIF 3,2 MB, X-klar. OBS: go/no-go-
      frysens overlay säger "Uppskattad vinstchans — och motiveringen i klartext" — inte
      spann-copyn "+4–7 % med ett byte", eftersom v8-tagningens bedömning inte föreslog
      något teambyte och copyn måste vara sann mot bilden.)
- [x] Justera [JUSTERA]-ställena i LinkedIn-utkastet till egen röst — KLAR 2026-08-17
      (Stefans omskrivning i session: personlig ton, aforismer strukna, DM-erbjudande
      tillagt; sakpåståenden omverifierade — $1/anbud per nya README:n, blindtest
      7/8 Opus + AI-domare Fable per evals/results-bid-model-comparison.md)
- [ ] LinkedIn-post med video — SCHEMALAGD till 2026-08-18 07:30 (Stefans plan)
- [ ] X-post med GIF + tråd
- [x] GIF:en in i README:n — KLAR 2026-08-17 (README-lanseringspolish-PR:en; Stefans
      beslut att ta den FÖRE lansering i stället för som uppföljning)
- [ ] (Senare, valfritt) Show HN när demosidan (Fas 2) finns
