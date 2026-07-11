# FPS Connect — Vergelijk met externe software & doorontwikkelplan

**Datum:** 11 juli 2026
**Scope:** Alle hoofdmodules van FPS Connect
**Benchmark:** AFAS (primair — marktleider NL bouw/installatie) + ENK, IBIS, Nmbrs, Visma, Fleetio, ToolSense, Ultimo, Steps/BuildSmart
**Doel:** Geprioriteerd doorontwikkelplan — wat zelf bouwen, wat koppelen

---

## Leeswijzer

| Symbool | Betekenis |
|---|---|
| GEBOUWD | Al aanwezig en werkend in FPS Connect |
| GEDEELTELIJK | Basis aanwezig, verdieping ontbreekt |
| BOUWEN | Zelf uitbouwen in FPS Connect |
| KOPPELEN | Externe software aansluiten via API/koppeling |
| EXTERN | Bewust buiten scope — extern pakket blijft leidend |

Prioriteit: **P1** = komende 3 maanden | **P2** = komend halfjaar | **P3** = strategische horizon

---

## 1. Brandpreventie & Gebouwbeheer (Core)

> FPS Connect IS hier het product. Dit bestaat nergens anders in deze combinatie voor de brandpreventie-sector.

| Functie | FPS Connect | AFAS | Generiek (Ultimo, Planon) |
|---|---|---|---|
| Gebouwenregistratie | GEBOUWD | Nee | Ja (generiek) |
| Spots / objecten per verdieping | GEBOUWD | Nee | Nee |
| Plattegrond-editor + SVG | GEBOUWD | Nee | Nee |
| Inspecties (oplevering/periodiek) | GEBOUWD | Nee | Beperkt |
| Bibliotheek (toepassingen, labels, fabrikanten) | GEBOUWD | Nee | Nee |
| Opleverrapportage + PDF | GEBOUWD | Nee | Nee |
| Rapportenbibliotheek + reactietermijnen | GEBOUWD | Nee | Nee |
| AI-spotherkenning + validatie | GEBOUWD | Nee | Nee |
| Samengestelde constructies (S.G.) | Gepland | Nee | Nee |
| Klantportaal (FPS One) | Fase 1 | Nee | Beperkt |

**Advies:** Volledig zelf bouwen en beheren. FPS One klantportaal afmaken is P1 (rapporten, reactietermijnen, document-download voor klanten).

---

## 2. Financieel / Factuurstroom

### 2a. Wat al gebouwd is in FPS Connect

| Functie | Status | Opmerking |
|---|---|---|
| Inkoopfacturen registreren + AI-scan | GEBOUWD | OCR + AI-extractie |
| Verkoopfacturen (losse facturen) | GEBOUWD | type=verkoop, standalone |
| Creditnota's | GEBOUWD | subtype=creditnota |
| Prijsafwijking-factuur | GEBOUWD | subtype=prijsafwijking |
| BTW-codes (21% / 9% / verlegd / 0%) | GEBOUWD | btw_code field + UI |
| BTW-verlegd | GEBOUWD | als btw_code waarde "verlegd" |
| G-rekening (depot bouwnijverheid) | GEBOUWD | g_rekening_van_toepassing + g_rekening_bedrag |
| Betalingstermijn (in dagen) | GEBOUWD | betalingstermijn_dagen in OpenAPI |
| Ons kenmerk / uw kenmerk | GEBOUWD | beide velden in OpenAPI |
| Factuurdatum + vervaldatum | GEBOUWD | beide velden |
| Inkoopbonnen + goedkeuringsmotor | GEBOUWD | inclusief escalatie en e-mail |
| SEPA-betalingen genereren | GEBOUWD | batch-export |
| AccountView-koppeling (handmatig) | GEBOUWD | export naar dagboek |
| Regie (voorwaarden, tarieven, materialen) | GEBOUWD | volledig DB + API + web |
| CSV-export goedkeuringsoverzicht | GEBOUWD | server-side, alle filters |

### 2b. Wat ontbreekt t.o.v. AFAS / marktstandaard

| Functie | FPS | AFAS | Exact/Twinfield |
|---|---|---|---|
| **Verdeelsleutel G-rekening** (automatisch berekenen welk bedrag naar G-rekening vs. courante rekening) | Nee | Ja | Ja |
| **Aanmaningsflow** (1e/2e/3e herinnering per vervaldatum) | Nee | Ja | Ja |
| **Incasso** (SEPA direct debit mandaten) | Nee | Ja | Beperkt |
| **Briefpapier-template factuur** (DDS letterhead met logo, adres, behandelaar, handtekening directeur, kenmerk) | Nee | Ja | Ja |
| **Behandelaar op factuur** (medewerker die factuur opstelt) | Nee | Ja | Ja |
| **Directeur-ondertekening op factuur** | Nee | Ja | Ja |
| **Projectcontrol** (begroting vs. werkelijk per project) | Nee | Ja | Nee |
| **Bankafschriften inlezen / automatisch matchen** | Nee | Ja | Ja |
| **BTW-aangifte / grootboek** | Nee (extern) | Ja | Ja |
| **Debiteurbeheer rapportage** (openstaande posten per klant) | Nee | Ja | Ja |
| **AccountView-push automatisch** (bij goedkeuring direct doorboeken) | Gedeeltelijk | N.v.t. | N.v.t. |

**Gaps & advies — financieel:**

| Gap | Advies | Prioriteit |
|---|---|---|
| Verdeelsleutel G-rekening (UI: % of bedrag → automatisch opsplitsen) | **BOUWEN** — g_rekening_bedrag is er, UI-logica toevoegen | P1 |
| Briefpapier-template factuur (DDS FamilieA uitbreiden) | **BOUWEN** — DDS-engine is er, factuurlay-out toevoegen | P1 |
| Behandelaar + directeur-handtekening op factuurtemplate | **BOUWEN** — werkgever.handtekening_url is er, behandelaar-veld toevoegen | P1 |
| Aanmaningsflow (1e/2e/3e herinnering per vervaldatum) | **BOUWEN** — uitbreiding op verkoopfacturen | P2 |
| AccountView-push automatisch bij goedkeuring | **BOUWEN** — eenrichtings-push aanwezig, automatiseren | P1 |
| Incasso (SEPA direct debit, mandaten beheren) | **BOUWEN** — uitbreiding op SEPA-module | P2 |
| Debiteurbeheer-overzicht (openstaande posten) | **BOUWEN** — koppeling verkoopfacturen + vervaldatum-filtering | P2 |
| Bankafschriften inlezen | **KOPPELEN** — Twinfield/AccountView (extern blijft leidend) | P3 |
| Grootboek / BTW-aangifte | **EXTERN** — AccountView blijft leidend | — |

---

## 3. HRM / Personeel

### 3a. Wat al gebouwd is in FPS Connect

| Functie | Status |
|---|---|
| Medewerkerregistratie + profiel | GEBOUWD |
| Functiehuis (per werkmaatschappij, office vs. veld) | GEBOUWD |
| Opleidingen & certificaten (niveau, opleider, kosten, M2M) | GEBOUWD |
| Bekwaamheidsmatrix (per categorie/niveau) | GEBOUWD |
| Verlof (soorten, saldo, aanvragen, goedkeuren/afwijzen) | GEBOUWD |
| CAO-kaders (Metaal & Techniek, Bouw & Infra — voorselectie op werkmaatschappij) | GEBOUWD |
| Onboarding-flow (CAO, verlofuren, aanvangsdatum) | GEBOUWD |
| AI-opleidingsvoorstel per functie | GEBOUWD |
| Loonstrookjes archief + self-service (web + app) | GEBOUWD |
| SEPA salarisbetalingen | GEBOUWD |

### 3b. Vergelijk met AFAS HRM / Nmbrs / Visma

| Functie | FPS Connect | AFAS HRM | Nmbrs | Visma |
|---|---|---|---|---|
| Medewerkerregistratie | GEBOUWD | Ja | Ja | Ja |
| Functiehuis | GEBOUWD | Ja | Beperkt | Beperkt |
| Opleidingen & certificaten | GEBOUWD | Ja | Nee | Beperkt |
| Bekwaamheidsmatrix | GEBOUWD | Beperkt | Nee | Nee |
| Verlof + CAO-kaders | GEBOUWD | Ja (volledig) | Ja | Ja |
| **CAO-periodieken automatisch** (jaarlijkse verhoging, trede-ophoging) | Nee | Ja | Ja | Ja |
| **Verzuimbeheer** (ziekmelding, WVP-dag-teller, re-integratieplan) | Nee | Ja | Ja | Ja |
| **Arbeidscontract digitaal** (template, versioning, ondertekening) | Nee | Ja | Ja | Beperkt |
| **Beoordelingscyclus / POP** (functioneringsgesprek, doelen) | Nee | Ja | Nee | Beperkt |
| **Werving & selectie** (vacatures, sollicitanten) | Nee | Ja | Nee | Nee |
| **Arbodienst-koppeling** | Nee | Ja | Beperkt | Nee |
| **UWV-koppeling** (officieel ziekmelden) | Nee | Ja | Ja | Ja |
| **SBR-koppeling Belastingdienst** (loonaangifte) | Nee (extern) | Ja | Ja | Ja |
| **Pensioenfonds-koppeling** (PFZW, BPF Bouw) | Nee | Ja | Ja | Beperkt |
| **Verklaring Omtrent Gedrag (VOG)** bijhouden | Nee | Nee | Nee | Nee |
| **VCA-certificaat** bijhouden + vervalwaarschuwing | GEBOUWD (via opleidingen) | Beperkt | Nee | Nee |
| **BHV / EHBO** registreren + vervalwaarschuwing | GEBOUWD (via opleidingen) | Beperkt | Nee | Nee |
| **NEN3140-bevoegdheid** registreren | GEBOUWD (via bekwaamheid) | Nee | Nee | Nee |

**Gaps & advies — HRM:**

| Gap | Advies | Prioriteit |
|---|---|---|
| CAO-periodieken automatisch (verhoging per datum, trede-ophoging op dienstjaar) | **BOUWEN** — CAO-basis aanwezig, logica toevoegen | P1 |
| Arbeidscontract als DDS-template (B-familie, digitale versturing) | **BOUWEN** — DDS-engine beschikbaar | P1 |
| Verzuimregistratie (ziekmelding, hersteld, WVP-dag-counter, re-integratienotities) | **BOUWEN** — basis: datum in/uit + dag-teller | P2 |
| VOG bijhouden (datum aanvraag, ontvangen, geldig tot) | **BOUWEN** — veld op medewerker + signalering | P2 |
| Beoordelingscyclus / POP | **BOUWEN** — V3.0 | P2 |
| Arbodienst-koppeling | **KOPPELEN** — ArboNed/Zorg van de Zaak API | P3 |
| UWV-koppeling (officieel ziekmelden) | **KOPPELEN** — UWV SBR, certificering vereist | P3 |
| Pensioenfonds-koppeling | **KOPPELEN** — PFZW/BPF Bouw API | P3 |
| Werving & selectie | **KOPPELEN** — Teamtailor / AFAS Recruitment | P3 |

---

## 4. Payroll / Salarisverwerking

| Functie | FPS Connect | AFAS Payroll | Nmbrs | Visma |
|---|---|---|---|---|
| Loonstrookjes archief (PDF-split per medewerker) | GEBOUWD | Ja | Ja | Ja |
| Self-service medewerker (web + app) | GEBOUWD | Ja (portaal) | Ja | Ja |
| SEPA-batch salarisbetalingen | GEBOUWD | Ja | Ja | Ja |
| Jaaropgaven archief | GEBOUWD | Ja + versturing | Ja | Ja |
| **Jaaropgave push-notificatie** (web + app) | Nee | Ja | Ja | Ja |
| **Salarisstrookje digitaal ondertekend ontvangen** | Nee | Ja | Ja | Beperkt |
| **Vakantiegeldreservering** inzicht | Nee | Ja | Ja | Ja |
| **Salarisberekening** (bruto → netto) | Nee (extern) | Ja | Ja | Ja |
| **Loonheffing / premies automatisch** | Nee (extern) | Ja | Ja | Ja |
| **Loonaangifte Belastingdienst** (SBR/Digipoort) | Nee (extern) | Ja | Ja | Ja |
| **Koppeling salarispakket** (push PDF naar FPS) | Nee | N.v.t. | N.v.t. | N.v.t. |

**Fundamenteel advies:** Salarisberekening, loonheffing en Belastingdienst-aangifte blijven bij extern pakket (AFAS/Nmbrs/Visma). FPS Connect beheert de omgeving: archief, zelfbediening, SEPA-uitbetaling.

| Gap | Advies | Prioriteit |
|---|---|---|
| Jaaropgave push-notificatie bij beschikbaar stellen | **BOUWEN** — archief is er, notificatie toevoegen | P1 |
| Koppeling salarispakket (webhook → PDF-split automatisch) | **KOPPELEN** — AFAS/Nmbrs webhook of SFTP-integratie | P2 |
| Vakantiegeld-saldo inzichtelijk op medewerkerkaart | **BOUWEN** — informatieveld, geen berekening | P2 |

---

## 5. Wagenparkbeheer

| Functie | FPS Connect | AFAS | Vimcar | Fleetio |
|---|---|---|---|---|
| Voertuigregistratie (kenteken, merk, model) | GEBOUWD | Beperkt | Ja | Ja |
| Onderhoud bijhouden | GEBOUWD | Nee | Ja | Ja |
| Toewijzing medewerker | GEBOUWD | Nee | Ja | Ja |
| Brandstof-import (CSV) | GEBOUWD | Nee | Ja (auto) | Ja |
| Meldingen (defect, schade) | GEBOUWD | Nee | Ja | Ja |
| **APK-datum / keuringsverval** | Nee | Nee | Ja | Ja |
| **Verzekeringsverval** | Nee | Nee | Ja | Ja |
| **Groene-kaart / kentekenbewijs** bijhouden | Nee | Nee | Ja | Ja |
| **Leasecontract** (einddatum, km-grens, maandbedrag, leasemaatschappij) | Nee | Nee | Ja | Ja |
| **Rittenboek** (privé vs. zakelijk, fiscaal bijtelling) | Nee | Nee | Ja (GPS) | Ja (GPS) |
| **Brandstofkosten per voertuig** (rapportage) | Beperkt | Nee | Ja | Ja |
| **Schade-registratie** (foto's, verzekeraar, eigen risico) | Nee | Nee | Ja | Ja |
| **GPS-tracking / live-locatie** | Nee | Nee | Ja (hardware) | Ja (hardware) |
| **Tankpas-koppeling automatisch** (BP, Shell, AS24) | Nee | Nee | Ja | Ja |
| **CO2-rapportage** | Nee | Nee | Ja | Ja |
| **Bandenwissel-registratie** (winter/zomer) | Nee | Nee | Beperkt | Ja |

**Gaps & advies — wagenpark:**

| Gap | Advies | Prioriteit |
|---|---|---|
| APK / keuring / verzekeringsverval-reminders | **BOUWEN** — datum-veld + signalering, zelfde structuur als kalibratie gereedschap | P1 |
| Leasecontract (einddatum, km-grens, maandbedrag) | **BOUWEN** — document-koppeling + alerting | P1 |
| Schade-registratie (foto, beschrijving, verzekeraar, status) | **BOUWEN** — uitbreiding op meldingen-structuur | P1 |
| Rittenboek (privé vs. zakelijk, fiscale bijtelling medewerker) | **BOUWEN** — medewerker logt rittten, fiscale export | P2 |
| Brandstofkosten-rapportage per voertuig / per maand | **BOUWEN** — CSV-import is er, aggregatie toevoegen | P2 |
| Bandenwissel-registratie (datum, km-stand, type) | **BOUWEN** — uitbreiding op onderhoud | P2 |
| GPS-tracking | **KOPPELEN** — hardware-afhankelijk (TomTom/Vimcar API) | P3 |
| Tankpas-koppeling automatisch | **KOPPELEN** — per aanbieder (BP, Shell, AS24) | P3 |

---

## 6. Gereedschapbeheer

### Benchmarks: ToolSense, Makita Tool Cloud, iSHARE, Rentman, Hilti ON!Track

| Functie | FPS Connect | AFAS | ToolSense | Hilti ON!Track |
|---|---|---|---|---|
| Gereedschap registreren (foto, serienr.) | GEBOUWD | Nee | Ja | Ja |
| Bruikleen-registratie (wie heeft wat) | GEBOUWD | Nee | Ja | Ja |
| Meldingen (defect, vermissing) | GEBOUWD | Nee | Ja | Ja |
| AI-foto-analyse bij toevoegen | GEBOUWD | Nee | Nee | Nee |
| **Kalibratiedatum / ijkdatum** | Nee | Nee | Ja | Ja |
| **NEN3140-keuring** (elektra-gereedschap, vervaldatum) | Nee | Nee | Ja | Ja |
| **CE-keuring / KEUR** bijhouden | Nee | Nee | Ja | Ja |
| **Keuring-schema** (jaarlijks/halfjaarlijks per categorie) | Nee | Nee | Ja | Ja |
| **QR-code / barcode scannen** (mobiel uitlenen) | Nee | Nee | Ja | Ja |
| **Reparatiehistorie** per stuk | Nee | Nee | Ja | Ja |
| **Inspectierapport** gereedschap (PDF) | Nee | Nee | Ja | Beperkt |
| **Verbruiksmaterialen** (bits, koronetten, folie) | Nee | Nee | Beperkt | Nee |
| **Gereedschapsverzekering** (claim bij diefstal/schade) | Nee | Nee | Beperkt | Nee |
| **Categorie-beheer** (hand/elektrisch/meetapparatuur/persoonlijk) | GEBOUWD | Nee | Ja | Ja |
| **Depot / buslocatie** (welk gereedschap op welke bus/locatie) | Nee | Nee | Ja | Ja |
| **Geplande onderhoudsbeurt** (km of tijd-gebaseerd) | Nee | Nee | Ja | Ja |

**Gaps & advies — gereedschappen:**

| Gap | Advies | Prioriteit |
|---|---|---|
| Kalibratiedatum + NEN3140 keuringsverval-datum | **BOUWEN** — compliance-must voor elektra-gereedschap bij brandpreventie | P1 |
| Keuring-reminders (NEN3140-check datum, CE-keuring) | **BOUWEN** — signalering identiek aan wagenpark APK | P1 |
| QR-code mobiel scannen (Expo-camera beschikbaar) | **BOUWEN** — scan → directe bruikleen-registratie | P2 |
| Reparatiehistorie per stuk | **BOUWEN** — uitbreiding op meldingen (defect → gerepareerd → kosten) | P2 |
| Depot / buslocatie-koppeling | **BOUWEN** — wagenpark-koppeling (gereedschap op bus X) | P2 |
| Verbruiksmaterialen (magazijn-koppeling) | **BOUWEN** — aansluiten op bestaande magazijn-module | P2 |
| Inspectierapport gereedschap (PDF) | **BOUWEN** — DDS-template C-familie | P2 |
| Geplande onderhoudsbeurt | **BOUWEN** — uitbreiding op onderhoud-module | P3 |

---

## 7. Calculatie

### Benchmarks: ENK, IBIS, Steps, BuildSmart, Aardbei, PTC Opiplus

| Functie | FPS Connect | AFAS | ENK | IBIS |
|---|---|---|---|---|
| Offerte (regels, opslagen, preview) | GEBOUWD | Ja | Ja | Ja |
| Normtijden-bibliotheek | GEBOUWD | Beperkt | Ja | Ja |
| Werkbegroting (offerte → opdracht) | GEBOUWD | Ja | Ja | Ja |
| Opslagen (AK, risico, winst — configureerbaar) | GEBOUWD | Ja | Ja | Ja |
| Offerte-sjablonen | GEBOUWD | Ja | Ja | Ja |
| **Normtijden-database (landelijk NEN)** | Nee | Nee | Ja | Ja |
| **Materiaalprijs-database** (actueel per leverancier) | Nee | Beperkt | Ja | Ja |
| **Nacalculatie** (uren vs. begroot, automatisch) | Gedeeltelijk | Ja | Ja | Ja |
| **Arbeidsproductiviteit-analyse** (norm vs. werkelijk) | Nee | Ja | Ja | Ja |
| **Projectbegroting vs. werkelijk** (projectcontrol) | Nee | Ja | Ja | Ja |
| **Resultatenanalyse** (marge per project) | Nee | Ja | Ja | Ja |
| **Inkoopprijs vs. verkoopprijs-analyse** | Nee | Ja | Beperkt | Ja |
| **Onderaannemer-calculatie** (inclusief gunningen) | Nee | Ja | Ja | Ja |
| **Revisie-calculatie** (versioning per offerte) | GEBOUWD (via offerte-versiebeheer) | Ja | Ja | Ja |
| **Leveranciersprijs-koppeling** (Technische Unie / Brink) | Nee | Nee | Ja | Ja |
| **STABU/CROW-koppeling** (bestekken) | Nee | Nee | Ja | Ja |
| **Intern werktarief vs. extern tarief** | GEBOUWD (via normtijden/uurtarief) | Ja | Ja | Ja |
| **Regie-afrekening factuur** (uren + materiaal → factuur) | GEBOUWD (regie-module) | Ja | Ja | Ja |

**ENK specifiek:** calculatiesoftware voor installatiebedrijven, sterk in normtijden-database (NEN-gebonden) en arbeidsproductiviteit. Koppelt aan AFAS voor boekhouding.

**IBIS specifiek:** breed werkvoorbereidingspakket (bouw/installatie), sterk in bestek-koppeling (STABU/UAV-gc), onderaannemer-gunning, nacalculatie. Wordt veel gebruikt bij grotere installatiebedrijven.

**Gaps & advies — calculatie:**

| Gap | Advies | Prioriteit |
|---|---|---|
| Nacalculatie koppeling (uren-module → begroting automatisch) | **BOUWEN** — uren-module aanwezig, koppeling toevoegen | P1 |
| Arbeidsproductiviteit-overzicht (norm-uren vs. bestede uren) | **BOUWEN** — uitbreiding nacalculatie | P2 |
| Projectbegroting vs. werkelijk dashboard | **BOUWEN** — fase 2 kernfunctie bedrijfsbesturing | P2 |
| Materiaalprijs-database (handmatig beheer initieel) | **BOUWEN** — beheerscherm voor standaard materiaalprijzen | P2 |
| Resultatenanalyse (marge per project, portfolio) | **BOUWEN** — uitbreiding op nacalculatie | P2 |
| Leveranciersprijs-koppeling (Technische Unie API) | **KOPPELEN** — fase 2+ | P3 |
| STABU/CROW-koppeling | **KOPPELEN** — voor grotere projecten | P3 |

---

## 8. CRM

| Functie | FPS Connect | AFAS CRM | HubSpot | Exact CRM |
|---|---|---|---|---|
| Contacten & organisaties | GEBOUWD | Ja | Ja | Ja |
| Projectkansen | GEBOUWD | Ja | Ja | Ja |
| Concurrenten registreren | GEBOUWD | Nee | Nee | Nee |
| Marktintelligentie | GEBOUWD | Nee | Beperkt | Nee |
| Offertes gekoppeld aan relatie | GEBOUWD | Ja | Ja | Ja |
| **Pipeline-forecast** (gewogen kansen, totaalwaarde) | Nee | Ja | Ja | Ja |
| **Activiteitenlog** (bel/bezoek/mail handmatig) | Nee | Ja | Ja | Ja |
| **Takenlijst per relatie** (follow-up, herinnering) | Nee | Ja | Ja | Ja |
| **Outlook-koppeling** (e-mail automatisch loggen) | Nee | Ja (betaald) | Ja | Beperkt |
| **NPS / klanttevredenheid** (na oplevering) | Nee | Nee | Ja | Nee |
| **Segmentatie** (doelgroepen, filter op type/regio) | Nee | Ja | Ja | Ja |
| **Relatiehistorie** (volledig dossier per klant) | Gedeeltelijk | Ja | Ja | Ja |
| **Klantportaal-koppeling** | Gedeeltelijk | Nee | Nee | Nee |
| **Marketingcampagnes** | Nee | Beperkt | Ja | Nee |

**Gaps & advies — CRM:**

| Gap | Advies | Prioriteit |
|---|---|---|
| Pipeline-forecast (kansen × sluitkans × waarde, grafisch) | **BOUWEN** — uitbreiding op projectkansen | P1 |
| Activiteitenlog per relatie (bel/bezoek/mail handmatig) | **BOUWEN** — simpel, hoge dagelijkse gebruikswaarde | P1 |
| Takenlijst per relatie + follow-up datum/reminder | **BOUWEN** — herinneringsnotificatie | P2 |
| NPS na oplevering (automatisch na definitief rapport) | **BOUWEN** — koppelen aan opleverrapport-status | P2 |
| Outlook/e-mail koppeling (automatisch loggen) | **KOPPELEN** — Microsoft Graph API | P2 |
| Marketingcampagnes | **KOPPELEN** — Mailchimp / ActiveCampaign | P3 |

---

## 9. Planning & Capaciteit

| Functie | FPS Connect | AFAS | Snelstart | PTC Opiplus |
|---|---|---|---|---|
| Werkorders aanmaken en toewijzen | GEBOUWD | Ja | Ja | Ja |
| Capaciteitsplanning medewerkers | GEBOUWD (basis) | Ja | Ja | Ja |
| Werkdag-module monteur (mobiel) | GEBOUWD | Nee | Nee | Nee |
| **Grafische planningboard** (dag/week/maand, drag & drop) | Nee | Ja | Ja | Ja |
| **Overbelasting-signalering** (ingepland > capaciteit) | Nee | Ja | Ja | Ja |
| **Reisplanning / routeoptimalisatie** | Nee | Nee | Beperkt | Ja |
| **Bezettingsgraad-rapportage** | Nee | Ja | Ja | Ja |

**Gaps & advies:**

| Gap | Advies | Prioriteit |
|---|---|---|
| Grafische planningboard (week/maand, drag & drop) | **BOUWEN** — fase 2 | P2 |
| Overbelasting-signalering | **BOUWEN** — uitbreiding capaciteitsplanning | P2 |
| Routeoptimalisatie (volgorde bezoeken op dag) | **KOPPELEN** — Google Maps / HERE Routing API | P3 |

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
| **Document Design System** (templates A/B/C, werkgever-branding) | GEDEELTELIJK | Nee | Nee |
| **Factuur-briefpapier template** (DDS FamilieA, letterhead) | Nee | Ja | N.v.t. |
| **Arbeidscontract-template** (DDS FamilieB) | Nee | Ja | N.v.t. |
| **Digitale handtekening** (klant ondertekent online) | Nee | Nee | Via DocuSign |
| **OCR metadata-extractie bij upload** | GEBOUWD (via Document Intelligence) | Nee | Beperkt |

**Gaps & advies:**

| Gap | Advies | Prioriteit |
|---|---|---|
| Factuur-briefpapier template (DDS FamilieA: logo, adres, behandelaar, handtekening directeur, ons/uw kenmerk, betalingstermijn) | **BOUWEN** — DDS-engine beschikbaar, template toevoegen | P1 |
| Arbeidscontract-template (DDS FamilieB) | **BOUWEN** — DDS FamilieB uitbreiden | P1 |
| Digitale handtekening (klant ondertekent offerte/contract online) | **KOPPELEN** — DocuSign of iSignThis API | P2 |

---

## Samenvatting: Geprioriteerd doorontwikkelplan

### P1 — Komende 3 maanden (hoog impact, lage inspanning)

| Nr | Module | Wat bouwen |
|---|---|---|
| 1 | Financieel | Briefpapier-template factuur (DDS: logo, adres, behandelaar, handtekening directeur, ons/uw kenmerk, betalingstermijn) |
| 2 | Financieel | Verdeelsleutel G-rekening UI (% of bedrag → auto-opsplitsen) |
| 3 | Financieel | AccountView-push automatisch bij goedkeuring |
| 4 | HRM | CAO-periodieken automatisch (jaarlijkse verhoging, trede-ophoging) |
| 5 | HRM | Arbeidscontract-template (DDS FamilieB) |
| 6 | Wagenpark | APK / keuring / verzekeringsverval-reminders |
| 7 | Wagenpark | Leasecontract (einddatum, km-grens, maandbedrag) |
| 8 | Wagenpark | Schade-registratie (foto, verzekeraar, status) |
| 9 | Gereedschappen | Kalibratiedatum + NEN3140 keuringsverval-signalering |
| 10 | Calculatie | Nacalculatie uren-koppeling (uren vs. begroot automatisch) |
| 11 | CRM | Pipeline-forecast (kansen × sluitkans × waarde) |
| 12 | CRM | Activiteitenlog per relatie |
| 13 | Payroll | Jaaropgave push-notificatie (web + app) |
| 14 | Brandpreventie | FPS One klantportaal (rapporten, reactietermijnen) |

### P2 — Komend halfjaar

| Module | Wat bouwen | Wat koppelen |
|---|---|---|
| Financieel | Aanmaningsflow (1e/2e/3e herinnering) | — |
| Financieel | Incasso (SEPA direct debit) | — |
| Financieel | Debiteurbeheer-overzicht | — |
| HRM | Verzuimregistratie (ziekmelding, WVP-dag-teller) | Arbodienst-koppeling |
| HRM | VOG bijhouden + vervalwaarschuwing | — |
| HRM | Beoordelingscyclus / POP | — |
| Wagenpark | Rittenboek (privé vs. zakelijk, bijtelling) | GPS (Vimcar/TomTom) |
| Wagenpark | Brandstofkosten-rapportage | — |
| Wagenpark | Bandenwissel-registratie | — |
| Gereedschappen | QR-code mobiel scannen + bruikleen | — |
| Gereedschappen | Reparatiehistorie + depot/bus-koppeling | — |
| Gereedschappen | Verbruiksmaterialen + inspectierapport | — |
| Calculatie | Projectbegroting vs. werkelijk + margeanalyse | — |
| Calculatie | Materiaalprijs-database (handmatig beheer) | — |
| CRM | Takenlijst + follow-up per relatie | Outlook (Microsoft Graph) |
| CRM | NPS na oplevering | — |
| Planning | Grafische planningboard (drag & drop) | — |
| DMS | Digitale handtekening | DocuSign / iSignThis |
| Payroll | Salarispakket-koppeling | AFAS/Nmbrs webhook |

### P3 — Strategische horizon (Fase 2+)

| Module | Advies |
|---|---|
| Wagenpark | Tankpas-koppeling (BP/Shell API) |
| CRM | Marketingcampagnes (Mailchimp) |
| Calculatie | Leveranciersprijs-koppeling (Technische Unie) + STABU/CROW |
| Planning | Routeoptimalisatie (Google Maps / HERE) |
| HRM | UWV-koppeling, pensioenfonds-koppeling |
| HRM | Werving & selectie (Teamtailor) |

---

## Bewuste niet-bouwen (extern blijft leidend)

| Functie | Reden |
|---|---|
| Salarisberekening (bruto→netto, loonheffing) | Belastingdienst-certificering vereist |
| Loonaangifte SBR / Digipoort | Certificering + aansprakelijkheid |
| BTW-aangifte / grootboek | AccountView leidend |
| Bankafschriften inlezen / automatisch matchen | AccountView / Twinfield |
| GPS-tracking wagenpark | Hardware-afhankelijk |
| Marketingcampagnes | Te generiek — Mailchimp beter |
| Werving & selectie | Te gespecialiseerd — Teamtailor/AFAS |
| UWV officieel ziekmelden | Certificering + juridische complexiteit |

---

*Document bijgewerkt: 11 juli 2026. Benchmarks: AFAS (primair), ENK, IBIS, Nmbrs, Visma, Vimcar, Fleetio, ToolSense, Hilti ON!Track, Steps/BuildSmart.*
