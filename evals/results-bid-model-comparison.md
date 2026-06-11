# Jämförelse: claude-opus-4-8 (A) vs claude-fable-5 (B)

## Vinstandelar per sektionstyp (parvis blind judge, positionsbyte)

| Sektionstyp | A | B | Oavgjort | A-andel exkl. tie | B-andel exkl. tie |
|---|---|---|---|---|---|
| understanding-current | 0 | 10 | 2 | 0.00 | 1.00 |
| understanding-assignment | 0 | 11 | 1 | 0.00 | 1.00 |
| understanding-vision | 0 | 11 | 1 | 0.00 | 1.00 |
| quality-assurance | 0 | 9 | 3 | 0.00 | 1.00 |
| phases | 1 | 9 | 0 | 0.10 | 0.90 |

## Kostnad per modell

| Modell | Totalt (USD) | Per anbud (USD) |
|---|---|---|
| claude-opus-4-8 | 6.12 | 0.51 |
| claude-fable-5 | 15.14 | 1.262 |

## Beslut

_Fylls i efter Stefans blindgranskning (Task 17). Beslutsregel: byt skrivmodell
endast vid samstämmig signal från judge-tally OCH mänsklig blindgranskning;
spretigt utfall = behåll Opus._
