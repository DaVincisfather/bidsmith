# Offert

## Molnmigrering för RetailNord AB

**Anbudsgivare:** TechBridge Consulting AB
**Organisationsnummer:** 556712-5678
**Kontaktperson:** Henrik Larsson, Partner & Cloud Practice Lead
**Telefon:** +46 70 222 33 44
**E-post:** henrik.larsson@techbridge.example.com
**Datum:** 2024-08-14
**Referens:** RN-IT-2024-089

---

## Försättsblad

TechBridge Consulting AB lämnar härmed offert på RetailNord ABs förfrågan om konsulttjänster för molnmigrering (referens RN-IT-2024-089).

TechBridge är ett specialiserat IT-konsultbolag med 35 konsulter, varav 20 är dedikerade till molntransformation. Vi har genomfört mer än 40 fullskaliga molnmigreringar under de senaste fem åren, med ett starkt fokus på retail, e-handel och logistik. Vi förstår att en molnmigrering i er skala inte bara är ett tekniskt projekt — det är ett affärskritiskt program som kräver noggrann planering, minimal verksamhetsstörning och en tydlig plan för din interna organisations förmåga att ta över och förvalta den nya miljön.

---

## 1. Vår förståelse av uppdraget

RetailNord befinner sig i en situation som vi känner igen väl: ett datacenter som passerat sin tekniska livslängd, en mix av legacy- och moderna system, och ett avtal som tickar ned. Det skapar en naturlig drivkraft för förändring, men också en risk för att driva för fort och skapa teknisk skuld i molnet.

Vår erfarenhet säger att de vanligaste fallgroparna är:
1. Att migrera legacy-system rakt av ("lift and shift") utan att ta tillfället i akt att modernisera
2. Att underskatta integrationskomplexiteten — i ert fall ett WMS med troligen många systemintegrationer
3. Att glömma driftsorganisationen — tekniken är bara halva jobbet

Vår approach för RetailNord är att kombinera pragmatism (snabba vinster med lägre risk) med strategisk modernisering där det ger störst nytta.

---

## 2. Metod och genomförandeplan

### Fas 1 — Nulägesanalys och migreringsstrategi (6 veckor)

**Systeminventering:** Vi genomför en strukturerad inventering av alla system, servrar, databaser och integrationer. Vi använder Azure Migrate för automatiserad discovery av on-premise-miljön.

**7R-analys:** Varje system klassificeras enligt 7R-modellen (Rehost, Replatform, Repurchase, Refactor, Retire, Retain, Relocate). WMS-systemet är det vi identifierat som den högsta risken och det kräver en dedikerad analys.

**Arkitekturdesign:** Vi designar Azure Landing Zone baserat på Microsoft Cloud Adoption Framework, anpassad för RetailNords krav på säkerhet, skalbarhet och kostnadsoptimering.

**Leverans:** Migreringsplan, arkitekturdokument, riskregister, prioriteringsmatris.

### Fas 2 — Plattformsetablering och migrering (9 månader)

**Etapp 2a — Azure-plattform (4 veckor):** Etablering av Landing Zone, governance, säkerhetsbaseline (Microsoft Defender for Cloud), nätverksarkitektur och CI/CD-foundation (Azure DevOps).

**Etapp 2b — Icke-kritiska system (3 månader):** Rehost av interna filhanteringssystem, sekundära applikationer och dev/test-miljöer. Syftar till att bygga erfarenhet och validera plattformen.

**Etapp 2c — BI och datawarehouse (2 månader):** Migrering av SQL Server-miljö till Azure SQL och Synapse Analytics. Etablering av ny BI-pipeline med minimal driftsavbrott.

**Etapp 2d — E-handelsplattformen (3 månader):** Containerisering av .NET-applikationen med Azure Kubernetes Service (AKS). Blå-grön driftsättning för zero-downtime-migrering. Kritisk etapp med höga krav på prestanda och tillgänglighet.

**Etapp 2e — WMS-migrering (2 månader, parallell):** Rehost av Java-applikationen till Azure VM med optimering. Grundlig integrationstestning mot ERP och övriga system.

### Fas 3 — Stabilisering och handover (6 veckor)

- Performance baseline och optimering
- FinOps-genomgång och kostnadsoptimering
- Kompetensutveckling för intern IT (workshops)
- Driftsdokumentation och runbooks
- Eskaleringsmodell och supportavtal

---

## 3. Organisation och bemanning

### Jonas Eriksson — Lösningsarkitekt och projektledare

Jonas leder projektet med ansvar för teknisk arkitektur och leveransansvar. 15 års erfarenhet av enterprise IT med fokus på molnarkitektur och systemmigreringar. Azure Solutions Architect Expert och AWS Certified. Se bifogat CV (Bilaga 1).

**Uppdragsomfång:** 80% under hela projekttiden.

### Emma Holmberg — Cloud Engineer

Emma ansvarar för plattformsetablering, Infrastructure as Code (Terraform) och CI/CD-pipelines. 6 års erfarenhet, Azure-certifierad. Hon har arbetat med fem liknande migreringsuppdrag.

**Uppdragsomfång:** 100% under Fas 2.

### Henrik Larsson — Senior sponsor och FinOps-rådgivare

Henrik är Partner och ansvarar för kvalitetssäkring och kostnadsoptimering. Han deltar i styrgruppsmöten och nyckelbeslutsmoment.

**Uppdragsomfång:** 15% löpande.

---

## 4. Tidplan

| Aktivitet | Start | Slut |
|-----------|-------|------|
| Projektstart | 2024-10-01 | |
| Systeminventering och 7R-analys | 2024-10-01 | 2024-10-25 |
| Arkitekturdesign och migreringsplan | 2024-10-14 | 2024-11-08 |
| **Fas 1 klar** | | **2024-11-15** |
| Azure Landing Zone etablering | 2024-11-18 | 2024-12-13 |
| Icke-kritiska system migreras | 2024-12-16 | 2025-03-07 |
| BI/DW-migrering | 2025-01-13 | 2025-03-14 |
| E-handelsplattform migreras | 2025-04-01 | 2025-06-27 |
| WMS-migrering | 2025-05-05 | 2025-06-27 |
| Stabilisering och handover | 2025-07-01 | 2025-08-15 |
| **Migrering genomförd** | | **2025-08-15** |

---

## 5. Prissättning

### Timpriser (exkl. moms)

| Konsult | Roll | Timpris |
|---------|------|---------|
| Jonas Eriksson | Lösningsarkitekt / Projektledare | 2 100 kr |
| Emma Holmberg | Cloud Engineer | 1 700 kr |
| Henrik Larsson | Partner / FinOps-rådgivare | 2 600 kr |

### Totalkostnad per fas

| Fas | Timmar | Kostnad (exkl. moms) |
|-----|--------|----------------------|
| Fas 1 — Nulägesanalys och strategi | 160 h | 322 000 kr |
| Fas 2 — Plattform och migrering | 1 840 h | 3 350 000 kr |
| Fas 3 — Stabilisering och handover | 220 h | 402 000 kr |
| **Totalt** | **2 220 h** | **4 074 000 kr** |

**Fast pris exkl. moms: 4 074 000 kronor**

Resor och logi debiteras till självkostnad. Uppskattad kostnad: 25 000 kr.

*Observera: Eventuella Azure-licenskostnader och infrastrukturkostnader tillkommer och ingår inte i offertsumman. Vi inkluderar en FinOps-uppskattning för Azure-drift i Bilaga 4.*

---

## 6. Riskbedömning

| Risk | Sannolikhet | Påverkan | Mitigering |
|------|-------------|----------|------------|
| WMS-migrering mer komplex än beräknat | Medel | Hög | Djupanalys i Fas 1, reserverat buffertutrymme i tidplan |
| Integrationsproblem vid e-handelsmigrering | Låg | Hög | Parallell drift under 4 veckor, rollback-plan |
| Intern IT-kapacitet otillräcklig | Medel | Medel | Kompetensutvecklingsplan ingår i Fas 3 |
| Datamigreringsavvikelser | Låg | Hög | Automatiserade valideringstester vid varje migreringsmoment |

---

## 7. Referenser

### Referensuppdrag 1
**Kund:** Stor nordisk retailkedja (250+ butiker)
**Uppdrag:** Full Azure-migrering inklusive e-handelsplattform och WMS
**Period:** 2023–2024
**Resultat:** Levererat i tid, 30% kostnadsminskning i drift

### Referensuppdrag 2
**Kund:** Medelstort nordiskt logistikbolag
**Uppdrag:** AWS-migrering av affärskritiska system
**Period:** 2022–2023
**Resultat:** Zero-downtime-migrering, 99,7% tillgänglighet efter migrering

### Referensuppdrag 3
**Kund:** Nordisk e-handelsaktör
**Uppdrag:** Azure-plattformsetablering och containerisering
**Period:** 2021–2022
**Resultat:** Skalbarhet för 10x trafik, release-kadensen tredubblad

---

## 8. Bilagor

- Bilaga 1: CV — Jonas Eriksson
- Bilaga 2: CV — Emma Holmberg
- Bilaga 3: CV — Henrik Larsson
- Bilaga 4: FinOps-uppskattning för Azure-driftkostnad
- Bilaga 5: Referensutlåtanden

---

*TechBridge Consulting AB*
*Henrik Larsson, Partner & Cloud Practice Lead*
*Stockholm, 2024-08-14*
