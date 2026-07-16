# Varv 5 — 0/5 PASS

_2026-07-16T15:45:55.254Z · commit `db53601`_

## Anbud

| Fixture | Anbud | Status | Fails | Gross | Dup | Tecken | Breaches |
|---|---|---|---|---|---|---|---|
| styrmodell | Styrmodell — RetailTech (dc1893b7-88e1-46dc-ac5b-c46fe8f05dc8) | FAIL | 0 | 5 | 0 | 8256 | gross-overflow |
| bemanning | Bemanning — Göteborgs stad (776995aa-b552-46de-8dc9-389efe312655) | FAIL | 0 | 5 | 0 | 8524 | gross-overflow |
| dataplattform | Dataplattform — Region Sörmland (ba5eeedc-39da-464b-b9b7-0fb9c4422620) | FAIL | 0 | 5 | 1 | 8555 | gross-overflow, duplicates |
| strategi-nic | Strategiutveckling — NIC (6ef4efd9-900d-417b-8576-69c9a6ceaae6) | FAIL | 0 | 2 | 0 | 8443 | gross-overflow |
| organisationsoversyn | Organisationsöversyn — Mellansvenska (f371ce73-2606-4212-8a8c-4c612f6c84a0) | FAIL | 0 | 3 | 0 | 8782 | gross-overflow |

## Delta (vs. föregående varv)

- failFindings: -9 ▼
- grossOverflows: -40 ▼
- dupPairs: 0 –
- passed: 0 –

## Kostnad

Kostnad: $2.62 detta varv · $14.61 ack. av $50 tak.

## Exkluderade malldefekter

Inga exkluderade malldefekter.

## Exkluderade grova overflow (malldefekt inom baseline-toleransen)

- [styrmodell] slide 1 Text 0: 68.4pt (baseline 68.4pt)
- [bemanning] slide 1 Text 0: 68.4pt (baseline 68.4pt)
- [dataplattform] slide 1 Text 0: 68.4pt (baseline 68.4pt)
- [strategi-nic] slide 1 Text 0: 68.4pt (baseline 68.4pt)
- [organisationsoversyn] slide 1 Text 0: 68.4pt (baseline 68.4pt)
- [organisationsoversyn] slide 6 Text 2: 41.4pt (baseline 124.2pt)
- [organisationsoversyn] slide 6 Text 3: 41.4pt (baseline 165.6pt)
- [organisationsoversyn] slide 6 Text 4: 41.4pt (baseline 103.5pt)
