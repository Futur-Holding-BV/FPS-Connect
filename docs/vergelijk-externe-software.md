# FPS Connect — Vergelijk met externe software & doorontwikkelplan

**Datum:** 11 juli 2026
**Scope:** Alle hoofdmodules van FPS Connect
**Benchmark:** AFAS (primair — marktleider NL bouw/installatie) + generiek marktstandaard
**Doel:** Geprioriteerd doorontwikkelplan — wat zelf bouwen, wat koppelen

---

## Leeswijzer

| Symbool | Betekenis |
|---|---|
| BOUWEN | Zelf uitbouwen in FPS Connect |
| KOPPELEN | Externe software aansluiten via API/koppeling |
| EXTERN | Bewust buiten scope — extern pakket blijft leidend |
| GEBOUWD | Al aanwezig in FPS Connect |

Prioriteit: **P1** = direct, **P2** = komend half jaar, **P3** = strategische horizon

---

## 1. Brandpreventie & Gebouwbeheer (Core)

> FPS Connect IS hier het product. Dit bestaat nergens anders in deze combinatie.

| Functie | FPS Connect | AFAS | Generiek (Ultimo, Planon) |
|---|---|---|---|
| Gebouwenregistratie | GEBOUWD | Nee | Ja (generiek) |
| Spots / objecten per verdieping | GEBOUWD | Nee | Nee |
| Plattegrond-editor + SVG | GEBOUWD | Nee | Nee |
| Inspecties (oplevering/periodiek) | GEBOUWD | Nee | Beperkt |
| Bibliotheek (toepassingen, labels) | GEBOUWD | Nee | Nee |
| Opleverrapportage + PDF | GEBOUWD | Nee | Nee |
| AI-spotherkenning | GEBOUWD | Nee | Nee |
| Rapportenbibliotheek (V1.5) | GEBOUWD | Nee | Nee |
| Klantportaal (FPS One) | Fase 1 | Nee | Beperkt |

**Advies:** Geen vergelijk nodig — dit is de bestaansreden van FPS Connect. Volledig zelf bouwen en beheren.

**Doorontwikkelen (P1):** FPS One klantportaal afmaken (rapporten, reactietermijnen, document-download).

---

## 2. HRM / Personeel

| Functie | FPS Connect | AFAS HRM | Nmbrs/Visma |
|---|---|---|---|
| Medewerkerregistratie + profiel | GEBOUWD | Ja | Ja |
| Functiehuis (per werkmaatschappij) | GEBOUWD | Ja | Beperkt |
| Opleidingen & certificaten | GEBOUWD | Ja | Ja |
| Bekwaamheidsmatrix | GEBOUWD | Beperkt | Nee |
| Verlof (soorten, saldo, aanvragen) | GEBOUWD | Ja | Ja |
| CAO-kaders (Metaal & Bouw) | GEBOUWD (basis) | Ja (volledig) | Ja |
| Onboarding-flow | GEBOUWD | Ja | Beperkt |
| **CAO-periodieken automatisch** | Nee | Ja | Ja |
| **Verzuimbeheer (ziekte/WVP/UWV)** | Nee | Ja | Ja |
| **Arbeidscontracten digitaal** | Nee | Ja | Ja |
| **Beoordelingscyclus (POP)** | Nee | Ja | Beperkt |
| **Werving & selectie** | Nee | Ja | Nee |
| **UWV-koppeling** | Nee | Ja | Ja |

**Gaps & advies:**

| Gap | Advies | Prioriteit |
|---|---|---|
| CAO-periodieken automatisch (jaarlijkse verhoging, periodieke trede) | **BOUWEN** — CAO-basis is er al, kleine uitbreiding | P1 |
| Arbeidscontract als document (DDS-template) | **BOUWEN** — Document Design System kan dit direct | P1 |
| Verzuimbeheer (ziekmelding, hersteld, WVP-dag-teller) | **BOUWEN** (basis: datum in/uit + WVP-dag-counter) | P2 |
| UWV-koppeling (officieel ziekmelden) | **KOPPELEN** (UWV SBR-koppeling, vereist certificering) | P3 |
| Beoordelingscyclus / POP | **BOUWEN** — V3.0 | P2 |
| Werving & selectie | **KOPPELEN** — bijv. Teamtailor of AFAS Recruitment | P3 |

---

## 3. Payroll / Salarisverwerking

| Functie | FPS Connect | AFAS Payroll | Nmbrs/Visma |
|---|---|---|---|
| Loonstrookjes archief (PDF per medewerker) | GEBOUWD | Ja | Ja |
| Self-service medewerker (web + app) | GEBOUWD | Ja (portaal) | Ja |
| SEPA-batch salarisbetalingen | GEBOUWD | Ja | Ja |
| Jaaropgaven archief | GEBOUWD (archief) | Ja + versturing | Ja |
| **Salarisberekening (bruto → netto)** | Nee | Ja | Ja |
| **Automatische loonheffing / premies** | Nee | Ja | Ja |
| **Loonaangifte Belastingdienst (SBR)** | Nee | Ja | Ja |
| **Vakantiegeldreservering automatisch** | Nee | Ja | Ja |
| **Werkgeverskosten-analyse** | Nee | Ja | Ja |

**Fundamenteel advies:** De salarisberekening zelf (bruto → netto, loonheffing, premies, SBR-aangifte) vereist een Belastingdienst-certificering en is te complex om zelf te bouwen. FPS Connect doet de **omgeving** (archief, zelfbediening, SEPA) — de **berekening** blijft extern.

**Model:** Externe payroll-partij (AFAS/Nmbrs/Visma) berekent → exporteert PDF per medewerker → FPS Connect `split-pdf` importeert en distribueert.

| Gap | Advies | Prioriteit |
|---|---|---|
| Jaaropgave-versturing via app + web | **BOUWEN** — archief is er, push-notificatie toevoegen | P1 |
| Vakantiegeld-reservering zichtbaar in HRM | **BOUWEN** — naast verlof, als informatieveld | P2 |
| Koppeling met salarispakket (push PDF) | **KOPPELEN** — API per pakket (AFAS/Nmbrs webhook) | P2 |

---

## 4. Wagenparkbeheer

| Functie | FPS Connect | AFAS | Vimcar/Fleetio |
|---|---|---|---|
| Voertuigregistratie (kenteken, merk) | GEBOUWD | Beperkt | Ja |
| Onderhoud bijhouden | GEBOUWD | Nee | Ja |
| Toewijzing medewerker | GEBOUWD | Nee | Ja |
| Brandstof-import (CSV) | GEBOUWD | Nee | Ja (automatisch) |
| Meldingen (defect, schade) | GEBOUWD | Nee | Ja |
| **APK / keuring-reminders** | Nee | Nee | Ja |
| **Rittenboek (privé vs. zakelijk)** | Nee | Nee | Ja (GPS) |
| **Leasecontract beheren** | Nee | Nee | Ja |
| **GPS-tracking / live-locatie** | Nee | Nee | Ja (hardware) |
| **Tankpas-koppeling (automatisch)** | Nee | Nee | Ja |
| **CO2-rapportage** | Nee | Nee | Ja |
| **Schadeafhandeling (verzekeraar)** | Nee | Nee | Ja |

**Gaps & advies:**

| Gap | Advies | Prioriteit |
|---|---|---|
| APK / keuring / verzekeringsverval-reminders | **BOUWEN** — datum-veld + signalering, structuur identiek aan kalibratie gereedschap | P1 |
| Leasecontract beheren (einddatum, maandbedrag, km-grens) | **BOUWEN** — document-koppeling + alerting | P1 |
| Rittenboek (privé/zakelijk, fiscaal bijtelling) | **BOUWEN** — hoge compliancewaarde, medewerker logt zelf | P2 |
| GPS-tracking | **KOPPELEN** — hardware-afhankelijk (TomTom/Vimcar API) | P3 |
| Tankpas-koppeling automatisch | **KOPPELEN** — per aanbieder (BP, Shell, AS24) | P3 |

---

## 5. Gereedschapbeheer

| Functie | FPS Connect | AFAS | ToolSense/iSHARE |
|---|---|---|---|
| Gereedschap registreren (foto, serienr.) | GEBOUWD | Nee | Ja |
| Bruikleen-registratie | GEBOUWD | Nee | Ja |
| Meldingen (defect, vermissing) | GEBOUWD | Nee | Ja |
| AI-foto-analyse | GEBOUWD | Nee | Nee |
| **Kalibratiedatum / ijkdatum (NEN3140)** | Nee | Nee | Ja |
| **Keuring-schema (CE, NEN3140)** | Nee | Nee | Ja |
| **QR-code mobiel scannen (uitlenen)** | Nee | Nee | Ja |
| **Reparatiehistorie per stuk** | Nee | Nee | Ja |
| **Inspectierapport gereedschap** | Nee | Nee | Ja |
| **Verbruiksmaterialen (bits, folie)** | Nee | Nee | Beperkt |

**Gaps & advies:**

| Gap | Advies | Prioriteit |
|---|---|---|
| Kalibratiedatum + keuring NEN3140 (elektra-gereedschap) | **BOUWEN** — compliance-must voor brandpreventie-monteurs | P1 |
| Keuring-reminders (NEN3140-check vervaldatum) | **BOUWEN** — signalering identiek aan wagenpark APK | P1 |
| QR-code scannen mobiel (bruikleen) | **BOUWEN** — Expo-camera is er al | P2 |
| Reparatiehistorie | **BOUWEN** — uitbreiding op meldingen | P2 |
| Verbruiksmaterialen (magazijn-koppeling) | **BOUWEN** — aansluiten op bestaande magazijn-module | P2 |

---

## 6. Calculatie

| Functie | FPS Connect | AFAS | Steps/BuildSmart |
|---|---|---|---|
| Offerte (regels, opslagen, preview) | GEBOUWD | Ja | Ja |
| Normtijden-bibliotheek | GEBOUWD | Ja | Ja |
| Werkbegroting (offerte → opdracht) | GEBOUWD | Ja | Ja |
| Opslagen AK/risico/winst | GEBOUWD | Ja | Ja |
| **Nacalculatie (uren vs. begroting)** | Basis | Ja | Ja |
| **Materiaalprijs-database** | Nee | Ja | Ja |
| **Leveranciers-prijs-koppeling** | Nee | Nee | Beperkt |
| **Projectbegroting vs. werkelijk** | Nee | Ja | Ja |
| **Resultatenanalyse per project** | Nee | Ja | Ja |
| **Inkoopprijs vs. verkoopprijs-analyse** | Nee | Ja | Ja |

**Gaps & advies:**

| Gap | Advies | Prioriteit |
|---|---|---|
| Nacalculatie arbeidsproductiviteit (uren-koppeling) | **BOUWEN** — uren-module is er, koppeling toevoegen | P1 |
| Projectbegroting vs. werkelijk (dashboard) | **BOUWEN** — fase 2 kernfunctie | P2 |
| Materiaalprijs-database bijhouden | **BOUWEN** — handmatig beheer voldoende voor start | P2 |
| Leveranciers-prijs-koppeling (Technische Unie API) | **KOPPELEN** — fase 2 | P3 |

---

## 7. CRM

| Functie | FPS Connect | AFAS CRM | HubSpot/Exact |
|---|---|---|---|
| Contacten & organisaties | GEBOUWD | Ja | Ja |
| Projectkansen | GEBOUWD | Ja | Ja |
| Concurrenten registreren | GEBOUWD | Nee | Nee |
| Marktintelligentie | GEBOUWD | Nee | Beperkt |
| Offertes gekoppeld aan relatie | GEBOUWD | Ja | Ja |
| **Pipeline-forecast (gewogen kansen)** | Nee | Ja | Ja |
| **Activiteitenhistorie (bel/mail/bezoek)** | Nee | Ja | Ja |
| **Outlook-koppeling (e-mail loggen)** | Nee | Ja (betaald) | Ja |
| **NPS / klanttevredenheid** | Nee | Nee | Ja |
| **Takenlijst per relatie** | Nee | Ja | Ja |
| **Segmentatie & doelgroepen** | Nee | Ja | Ja |
| **Marketingcampagnes** | Nee | Beperkt | Ja |

**Gaps & advies:**

| Gap | Advies | Prioriteit |
|---|---|---|
| Pipeline-forecast (kansen × sluitkans × waarde) | **BOUWEN** — uitbreiding op projectkansen | P1 |
| Activiteitenlog (telefoontje/bezoek/mail handmatig) | **BOUWEN** — simpel, hoge dagelijkse gebruikswaarde | P1 |
| Takenlijst per relatie / follow-up datum | **BOUWEN** — herinnering-systeem | P2 |
| NPS na oplevering (automatisch uitsturen) | **BOUWEN** — koppelen aan opleverrapport | P2 |
| Outlook-koppeling (automatisch loggen) | **KOPPELEN** — Microsoft Graph API | P2 |
| Marketingcampagnes | **KOPPELEN** — Mailchimp/ActiveCampaign | P3 |

---

## 8. Financieel / Factuurstroom

| Functie | FPS Connect | AFAS Financieel | AccountView |
|---|---|---|---|
| Inkoopfacturen registreren | GEBOUWD | Ja | Ja |
| Verkoopfacturen | GEBOUWD | Ja | Ja |
| Creditnota's | GEBOUWD | Ja | Ja |
| Inkoopbonnen + goedkeuringsmotor | GEBOUWD | Ja (basis) | Nee |
| SEPA-betalingen genereren | GEBOUWD | Ja | Ja |
| Koppeling AccountView | GEBOUWD | N.v.t. | N.v.t. |
| **Grootboek / BTW-aangifte** | Nee | Ja | Ja |
| **Bankafschriften inlezen (automatisch matchen)** | Nee | Ja | Ja |
| **Debiteurbeheer (aanmaningen)** | Nee | Ja | Beperkt |
| **Projectcontrol (budget vs. werkelijk)** | Nee | Ja | Nee |

**Fundamenteel advies:** Grootboek, BTW en bank blijven in AccountView. FPS Connect beheert de **operationele factuurstroom** (inkoop → goedkeuring → betaling → doorboeken).

| Gap | Advies | Prioriteit |
|---|---|---|
| Debiteurbeheer — aanmaningsflow (1e/2e/3e sommatie) | **BOUWEN** — koppelen aan verkoopfacturen | P2 |
| Projectcontrol (begroting vs. werkelijk per project) | **BOUWEN** — fase 2, kernfunctie bedrijfsbesturing | P2 |
| AccountView-koppeling automatiseren (push bij goedkeuring) | **BOUWEN** — eenrichtings-push is al gedeeltelijk aanwezig | P1 |

---

## 9. Planning & Capaciteit

| Functie | FPS Connect | AFAS Planning | Specialist (Snelstart/PTC) |
|---|---|---|---|
| Werkorders aanmaken en toewijzen | GEBOUWD | Ja | Ja |
| Capaciteitsplanning medewerkers | GEBOUWD (basis) | Ja | Ja |
| Werkdag-module monteur (mobiel) | GEBOUWD | Nee | Nee |
| **Grafische planningboard (drag & drop)** | Nee | Ja | Ja |
| **Overbelasting-signalering** | Nee | Ja | Ja |
| **Reisplanning / routeoptimalisatie** | Nee | Nee | Beperkt |

| Gap | Advies | Prioriteit |
|---|---|---|
| Grafische planningboard (week/maand, drag & drop) | **BOUWEN** — fase 2 | P2 |
| Overbelasting-signalering (medewerker ingepland > capaciteit) | **BOUWEN** — uitbreiding op capaciteitsplanning | P2 |
| Routeoptimalisatie (volgorde bezoeken) | **KOPPELEN** — Google Maps / HERE Routing API | P3 |

---

## 10. Documentbeheer (DMS)

| Functie | FPS Connect | AFAS DMS | SharePoint |
|---|---|---|---|
| Documenten uploaden met versiebeheer | GEBOUWD | Ja (beperkt) | Ja |
| Goedkeuringsflow | GEBOUWD | Beperkt | Ja |
| Dossiers (bevriezing, definitief) | GEBOUWD | Nee | Nee |
| Document Intelligence (AI classificatie) | GEBOUWD | Nee | Nee |
| Polymorfe koppelingen (gebouw/klant/dossier) | GEBOUWD | Nee | Nee |
| Audittrail & downloadlogging | GEBOUWD | Nee | Beperkt |
| **Digitale handtekening (contracten)** | Nee | Nee | Via DocuSign |
| **OCR / automatisch invullen metadata** | Nee | Nee | Beperkt |

| Gap | Advies | Prioriteit |
|---|---|---|
| Digitale handtekening (arbeidscontracten, offertes) | **KOPPELEN** — DocuSign of iSignThis API | P2 |
| OCR metadata-extractie bij upload | **BOUWEN** — AI-laag (Document Intelligence uitbreiden) | P2 |

---

## Samenvatting: Prioriteiten doorontwikkelplan

### P1 — Direct (komende 3 maanden)

| Module | Wat bouwen |
|---|---|
| HRM | CAO-periodieken automatisch (jaarlijkse verhoging, trede-ophoging) |
| HRM | Arbeidscontract via Document Design System (template + digitale versturing) |
| Wagenparkbeheer | APK / keuring / verzekering-reminders |
| Wagenparkbeheer | Leasecontract beheren (einddatum, km-grens, maandbedrag) |
| Gereedschappen | Kalibratiedatum + NEN3140 keuring-reminders |
| Calculatie | Nacalculatie — uren vs. begroting koppelen |
| CRM | Pipeline-forecast (kansen × sluitkans) |
| CRM | Activiteitenlog per relatie (bel/bezoek/mail handmatig) |
| Financieel | AccountView-push automatiseren bij goedkeuring |
| Payroll | Jaaropgave push-notificatie (web + app) |

### P2 — Komend halfjaar

| Module | Wat bouwen | Wat koppelen |
|---|---|---|
| HRM | Verzuimregistratie (ziekmelding, WVP-dag-teller) | UWV-koppeling |
| HRM | Beoordelingscyclus / POP | — |
| Wagenpark | Rittenboek (privé vs. zakelijk, fiscale bijtelling) | GPS (TomTom/Vimcar) |
| Gereedschappen | QR-code mobiel scannen + reparatiehistorie | — |
| Gereedschappen | Verbruiksmaterialen (magazijn-koppeling) | — |
| CRM | Takenlijst + follow-up per relatie | Outlook (Microsoft Graph) |
| CRM | NPS na oplevering (koppelen aan opleverrapport) | — |
| Financieel | Debiteurbeheer + aanmaningsflow | — |
| Financieel | Projectcontrol (begroting vs. werkelijk) | — |
| Planning | Grafische planningboard (drag & drop) | — |
| DMS | Digitale handtekening | DocuSign / iSignThis |
| Payroll | Salarispakket-koppeling (push PDF naar FPS) | AFAS/Nmbrs webhook |

### P3 — Strategische horizon (Fase 2+)

| Module | Advies |
|---|---|
| Payroll | Salarisberekening blijft extern — nooit zelf bouwen (Belastingdienst-certificering) |
| Wagenpark | Tankpas-koppeling (BP/Shell API) |
| CRM | Marketingcampagnes (Mailchimp) |
| Calculatie | Leveranciersprijs-koppeling (Technische Unie API) |
| Planning | Routeoptimalisatie (Google Maps / HERE) |
| Werving | Koppelen aan Teamtailor of AFAS Recruitment |

---

## Bewuste niet-bouwen (extern blijft leidend)

| Functie | Reden |
|---|---|
| Salarisberekening (bruto→netto) | Belastingdienst-certificering vereist |
| BTW-aangifte / grootboek | AccountView is leidend |
| Bankafschriften inlezen | AccountView / Twinfield |
| GPS-tracking wagenpark | Hardware-afhankelijk |
| Marketingcampagnes | Te generiek — Mailchimp/ActiveCampaign beter |
| Werving & selectie | Te gespecialiseerd — apart pakket |
| UWV officieel ziekmelden | Certificering + juridische complexiteit |

---

*Document bijgewerkt: 11 juli 2026. Gebaseerd op AFAS als primaire benchmark (NL bouw/installatie) + generieke marktstandaard.*
