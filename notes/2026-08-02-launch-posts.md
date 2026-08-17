# Lanseringsposter — UTKAST för Stefans granskning

*Skrivna 2026-08-02 (Fas 3 i lanseringsplanen). Publiceras av Stefan, inte av assistenten.
Alla sakpåståenden är verifierade mot repot/README; ställen märkta [JUSTERA] är Stefans
röst-/faktaval. Ekan nämns INTE (beslut 2026-07-06: lanseringen är helt fristående).*

**Ordning enligt plan:** LinkedIn (svenska, bygghistoria) → X (engelska, builder-vinkel).
Video bifogas båda; GIF-versionen till X + README. Demosidan (Fas 2) är inte byggd —
"demo i uppföljningspost" är okej enligt planen.

---

## LinkedIn (svenska — bygghistoria, inte produktpitch)

Jag är managementkonsult, inte utvecklare. De senaste månaderna har jag ändå byggt
och släppt ett open source-projekt: **Bidsmith** — en AI-agent som tar en offentlig
upphandling plus era konsultprofiler och smider fram ett strukturerat anbudsutkast
som ni tar rakt in i er egen mall, med de AI-verktyg ni redan använder.

Det började med en välbekant frustration: anbudsarbete är timmar av mekanik — läsa
förfrågningsunderlag, plocka krav, matcha konsulter, skriva samma slags grundtext —
innan det kvalificerade arbetet ens börjar. Det mekaniska går att automatisera.
Omdömet går inte. Så verktyget slutar alltid i ett utkast som en senior konsult
granskar och äger.

Hela bygget är gjort med Claude Code, på kvällar och helger vid sidan av jobbet.
Jag skriver inte koden själv — jag kravställer, granskar och testar, ungefär som
att leda en outtröttlig utvecklare som aldrig blir sur när man ändrar sig. [JUSTERA:
din formulering av arbetssättet]

Tre saker bygget lärt mig om AI på riktigt:

1. **Texten är inte flaskhalsen — förtroendet är.** Störst del av arbetet har
   handlat om bevis: varje krav och varje kompetenspåstående bär ett ordagrant
   citat ur källdokumentet, verifierat mekaniskt mot källan. Kan ett påstående
   inte beläggas stryks det — och når aldrig vare sig matchningen eller anbudstexten.
2. **Mätning slår magkänsla.** När jag blindtestade två modellers anbudstext valde
   jag själv den ena 7 gånger av 8 — medan en AI-domare föredrog den andra nästan
   varje gång. Utan kalibrering mot mänsklig bedömning är en AI-domare bara en
   åsikt till.
3. **Våga döda din egen darling.** Jag byggde en hel motor för att rendera anbud
   direkt i valfri PowerPoint-mall — mallonboarding, layoutmätning, kalibrering.
   Sen insåg jag att sista milen (formateringen) redan löses bättre av verktygen
   alla ändå använder, och bytte till strukturerad Markdown ut. Äg det
   domänspecifika, låt ekosystemet äga resten. [JUSTERA/STRYK efter smak]

Bidsmith är fritt och open source (Apache 2.0). Ingen prismodell, ingen tjänst att
prenumerera på — du kör den själv och betalar bara din egen API-kostnad, ungefär
ett par dollar per anbud.

Repo: https://github.com/DaVincisfather/bidsmith

[Video bifogas]

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
(analysis → matching → go/no-go → full draft → Markdown export) runs ≈ $1.5–2 in API.

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
- [ ] Justera [JUSTERA]-ställena i LinkedIn-utkastet till egen röst
- [ ] LinkedIn-post med video
- [ ] X-post med GIF + tråd
- [x] GIF:en in i README:n — KLAR 2026-08-17 (README-lanseringspolish-PR:en; Stefans
      beslut att ta den FÖRE lansering i stället för som uppföljning)
- [ ] (Senare, valfritt) Show HN när demosidan (Fas 2) finns
