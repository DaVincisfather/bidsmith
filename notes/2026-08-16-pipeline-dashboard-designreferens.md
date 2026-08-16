# Designreferens: beautifului.dev → pipeline-dashboard-passet

_Bokförd 2026-08-16 (Stefans beslut: "sparas till framtida ux pass"). Källa:
https://www.beautifului.dev/ — design-showcase från Turbo Design Studio, MIT-märkt
men INGEN kod distribueras (inget repo/npm). Användning = låna interaktionsmönstren
och bygga dem själva i Bidsmiths tokens (burgundy/Fraunces/anvil), aldrig deras
utseende rakt av. Designbesluten är Stefans — detta är input till mockup-fasen._

## Starkast träff — pipeline-dashboard-passet (bokfört i #124, körs mot mockup Stefan godkänner)

- **Filter table** — statuschips som filter ("Alla 5 · Att göra 2 · Klara 1") som
  filtrerar tabellen live. Mappar direkt mot arkiv-direktivet: railens listor som en
  yta med chips för Utkast/Inlämnade/Avgjorda i stället för statiska listor med
  dubbletter.
- **Insight cards** — bläddringsbara kort med metrik + liten graf + uppföljningsfråga.
  Mappar mot statistik-/utfallsytan (win-rate över anbud).
- **Records table** — CRM-lik tabell med taggar, senaste händelse och styrke-indikator.
  Möjligt mönster för själva pipen om Stefan vill ha tabell i stället för kort.

**Rekommendation (Claude 2026-08-16):** peka på filter table + insight cards som input
när mockup-fasen startar (samma process som editor-passet: varianter → Stefans syntes
→ godkännande).

## Träffar på redan byggda ytor (ingen bokning — framtida polish-referens)

- **Recommendation card** (förslag + konfidens + Acceptera/Alternativ) ≈ våra
  go/no-go-förbättringskort.
- **Diff table** ≈ apply-swaps före/efter-panel.
- **Context cards** (chunk + källattribution + teckenantal) ≈ källvisarens mönster.

## Ingen motsvarande yta hos oss (ny scope, inte release-spåret)

Command search, chat composer, streaming text.
