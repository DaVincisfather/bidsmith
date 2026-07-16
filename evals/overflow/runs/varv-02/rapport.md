# Varv 2 — 0/5 PASS

_2026-07-16T08:00:23.644Z · commit `9b81582`_

## Anbud

| Fixture | Anbud | Status | Fails | Gross | Dup | Tecken | Breaches |
|---|---|---|---|---|---|---|---|
| styrmodell | Styrmodell — RetailTech (96494f40-a8d7-4db5-aebe-28c352f50396) | FAIL | 1 | 18 | 0 | 10089 | fail-findings, gross-overflow, min-fill |
| bemanning | Bemanning — Göteborgs stad (b9c5837a-0422-48ca-aa81-5f3c46908078) | FAIL | 3 | 15 | 0 | 9423 | fail-findings, gross-overflow, min-fill |
| dataplattform | Dataplattform — Region Sörmland (b40820c4-f73e-4749-b70f-9a1cbd5713e5) | FAIL | 2 | 18 | 0 | 10488 | fail-findings, gross-overflow, min-fill |
| strategi-nic | Strategiutveckling — NIC (4ad21ffa-f490-4f45-9eb8-a8c03f9e5f3b) | FAIL | 1 | 16 | 2 | 10222 | fail-findings, gross-overflow, duplicates, min-fill |
| organisationsoversyn | Organisationsöversyn — Mellansvenska (d3622176-ebf0-4fed-958a-087f4aded343) | FAIL | 2 | 17 | 1 | 10030 | fail-findings, gross-overflow, duplicates, min-fill |

## Delta (vs. föregående varv)

- failFindings: -3 ▼
- grossOverflows: +6 ▲
- dupPairs: -4 ▼
- passed: 0 –

## Kostnad

Kostnad: $2.57 detta varv · $6.49 ack. av $50 tak.

## Exkluderade malldefekter

- [styrmodell] slide 9 Text 13 (outside-slide): text bottom 817pt / right n/apt vs slide 1440×810pt

## Exkluderade grova overflow (malldefekt inom baseline-toleransen)

- [styrmodell] slide 1 Text 0: 68.4pt (baseline 68.4pt)
- [styrmodell] slide 4 Text 21: 64.8pt (baseline 64.8pt)
- [styrmodell] slide 5 Text 19: 43.2pt (baseline 64.8pt)
- [styrmodell] slide 6 Text 2: 62.1pt (baseline 124.2pt)
- [styrmodell] slide 6 Text 3: 41.4pt (baseline 165.6pt)
- [styrmodell] slide 6 Text 4: 41.4pt (baseline 103.5pt)
- [styrmodell] slide 6 Text 5: 41.4pt (baseline 103.5pt)
- [styrmodell] slide 6 Text 6: 41.4pt (baseline 41.4pt)
- [styrmodell] slide 9 Text 13: 86.4pt (baseline 86.4pt)
- [bemanning] slide 1 Text 0: 68.4pt (baseline 68.4pt)
- [bemanning] slide 4 Text 21: 43.2pt (baseline 64.8pt)
- [bemanning] slide 6 Text 2: 82.8pt (baseline 124.2pt)
- [dataplattform] slide 1 Text 0: 68.4pt (baseline 68.4pt)
- [dataplattform] slide 4 Text 21: 64.8pt (baseline 64.8pt)
- [dataplattform] slide 6 Text 2: 62.1pt (baseline 124.2pt)
- [dataplattform] slide 6 Text 3: 41.4pt (baseline 165.6pt)
- [dataplattform] slide 6 Text 4: 41.4pt (baseline 103.5pt)
- [dataplattform] slide 6 Text 5: 41.4pt (baseline 103.5pt)
- [strategi-nic] slide 1 Text 0: 68.4pt (baseline 68.4pt)
- [strategi-nic] slide 4 Text 21: 43.2pt (baseline 64.8pt)
- [strategi-nic] slide 5 Text 19: 43.2pt (baseline 64.8pt)
- [strategi-nic] slide 6 Text 2: 103.5pt (baseline 124.2pt)
- [strategi-nic] slide 6 Text 3: 62.1pt (baseline 165.6pt)
- [strategi-nic] slide 6 Text 4: 41.4pt (baseline 103.5pt)
- [strategi-nic] slide 6 Text 5: 41.4pt (baseline 103.5pt)
- [strategi-nic] slide 9 Text 13: 64.8pt (baseline 86.4pt)
- [organisationsoversyn] slide 1 Text 0: 68.4pt (baseline 68.4pt)
- [organisationsoversyn] slide 4 Text 21: 64.8pt (baseline 64.8pt)
- [organisationsoversyn] slide 5 Text 19: 43.2pt (baseline 64.8pt)
- [organisationsoversyn] slide 6 Text 2: 103.5pt (baseline 124.2pt)
- [organisationsoversyn] slide 7 Text 53: 64.8pt (baseline 64.8pt)
- [organisationsoversyn] slide 11 Text 55: 43.2pt (baseline 64.8pt)
