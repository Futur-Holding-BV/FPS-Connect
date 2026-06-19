# Project Intelligence Dossier — FPS Connect

_Dit dossier is de technische en functionele single source of truth voor FPS Connect._  
_Bijwerken na elk significant increment._  
_Laatste update: juni 2026_

---

## 1. Architectuur

### Overzicht

FPS Connect is een pnpm-monorepo met drie deployable artifacts en gedeelde libraries.

```
artifacts-monorepo/
├── artifacts/
│   ├── api-server/          → Express 5 REST API (poort 8080)
│   ├── firevault/           → React + Vite web-app (poort 25392)
│   └── monteur-app/         → Expo React Native mobiele app
├── lib/
│   ├── api-spec/            → OpenAPI YAML (source of truth)
│   ├── api-client-react/    → Gegenereerde React Query hooks (Orval)
│   ├── db/                  → Drizzle ORM schema + migraties
│   ├── object-storage-web/  → Bestandsopslag-wrapper (web)
│   └── permissies/          → Bevoegdheden-matrix definities
└── scripts/                 → Hulpscripts (e2e, kwaliteitscheck, seeding)
```

### Routering

Een globale reverse proxy (Replit shared proxy) routeert verkeer op pad:

| Pad | Service |
|---|---|
| `/api/*` | api-server (poort 8080) |
| `/` | firevault (poort 25392) |
| Expo-domein | monteur-app |

### Authenticatie

Eigen sessie-authenticatie — bewust NIET Clerk of Replit Auth (geen verplichte TOTP-MFA-support).

- **Backend:** `express-session` + `connect-pg-simple` (sessies in PostgreSQL)
- **Wachtwoorden:** `bcryptjs`
- **TOTP:** `otplib` v12 (v13 breekt esbuild-bundle door andere exports)
- **QR-code:** `qrcode`
- **Cookie:** `SameSite=None; Secure` + `trust proxy` (Replit-iframe vereist dit)
- **Mobiel:** stateless HMAC bearer token (géén cookies; sessie-middleware wordt omzeild)
- **Publiek:** alleen `/auth/*`, `/healthz`, `/uitnodiging/*`

### Opslag

- **Bestanden:** Replit Object Storage via `@workspace/object-storage-web`
- **Paden:** `/objects/<bestand_type>/<naam>` → via `/api/storage/objects/…`
- **PostgreSQL:** `DATABASE_URL` omgevingsvariabele

### AI-integratie

OpenAI via Replit AI Integrations proxy (`AI_INTEGRATIONS_OPENAI_BASE_URL`).  
Fallback naar directe `OPENAI_API_KEY` als de proxy niet beschikbaar is.

### E-mail

Microsoft 365 via Microsoft Graph API.  
`MAIL_FROM` = zichtbare afzender (alias); `MAIL_MAILBOX` = gedeelde postbus.  
Azure credentials: `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`.

---

## 2. Modules

### Naamgeving

| Naam | Gebruik |
|---|---|
| **FPS Connect** | Interne naam — web-beheeromgeving, navigatie, beheerdersrollen |
| **FPS One** | Klantnaam — klantportaal, klantlogin, e-mails, opleverrapporten |
| **FPS Monteur** | Naam van de mobiele app voor monteurs |

### Module-overzicht

#### V1.0 — Administratief gereed voor uitvoering
**Status:** Gebouwd (100%)  
**Doel:** Basis platform: gebouwen, voorzieningen, inspecties, onderhoud, gebruikers.  
**Schermen:** Dashboard, Gebouwen, Inspecties, Onderhoud, Gebruikers  
**Afhankelijkheden:** geen

#### V1.1 — Rollen & bevoegdheden
**Status:** Gebouwd (100%)  
**Doel:** RBAC via jsonb-kolom bevoegdheden-matrix. Rollen: hoofdbeheerder, gebruiker, klant.  
**Schermen:** Profielen (beheer), Gebruikers (bevoegdheden)  
**Architectuur:** `requireBevoegdheid` middleware; module-ID's in `lib/permissies`; legacy-fallback voor monteur/controleur.

#### V1.2 — Bibliotheek & documentstructuur
**Status:** Gebouwd (100%)  
**Doel:** Centrale kennisbank voor applicaties, toepassingen en documenten.  
**Schermen:** Bibliotheek, Toepassingen, Toepassing-detail, Applicatie-detail  
**DB:** `voorziening_types`, `labels`, `fabrikanten`, `documenten`, `document_applicaties`, `document_toepassingen`  
**AI:** Document-AI analyseert PDF-tekst → extraheert metadata. Koppelvoorstel-AI stelt ontbrekende koppelingen voor.

#### V1.3 — Spots & uitvoering
**Status:** Gebouwd (100%)  
**Doel:** Registratie en uitvoering van brandwerende spots op verdiepingsniveau.  
**Schermen:** Voorzieningen, Voorziening-detail, QR-label, Plattegrond-editor  
**DB:** `voorzieningen`, `spot_ai_voorstellen`, `gebouw_toewijzingen`, `clusters`  
**AI:** Spotherkenning via gpt-4o vision (foto voor/na → applicatie, toepassing, fabrikant).  
**Restpunten:** legacy WBDBO/WRD-velden niet verwijderd (DB-compatibiliteit)

#### DMS / Documentenbibliotheek
**Status:** Gebouwd (100%)  
**Doel:** Documentbeheer met versiebeheer, koppelingen, goedkeuringsflow, bevriezing.  
**Schermen:** Documenten-tab in Bibliotheek, DMS-dashboard, Logboek  
**DB:** `document_koppelingen`, `document_goedkeuringen`, `document_logboek`, `dossier_documenten` (uitgebreid)  
**Bijzonder:** V1.5-bevriezingsdeel vooruit gebouwd — `POST /dossiers/:id/definitief` bevriest documentrevisies.

#### HRM / Personeel (Fase 1-basis)
**Status:** Gebouwd (100%)  
**Doel:** Personeelsbeheer, functiehuis, opleidingen, bekwaamheidsmatrix, verlof.  
**Schermen:** Personeel, Medewerker-detail, HRM-dashboard (mobiel), Opleidingen (mobiel)  
**DB:** `medewerkers`, `werkgevers`, `functies`, `functie_opleidingen`, `opleidingen`, `bekwaamheden`, `verlofsoorten`, `verlofsaldi`, `verlofaanvragen`  
**AI:** Opleidingsvoorstel per functie (gpt-5, mens bevestigt)  
**Geparkeerd:** salarisadministratie, werving & selectie, AI-coaches (V3.0)

#### Dossiermodule (Fase 1-basis)
**Status:** Gebouwd (100%)  
**Doel:** Dossiers per gebouw met statusbeheer (concept → definitief → gearchiveerd).  
**Schermen:** Dossiers  
**DB:** `dossiers`, `dossier_documenten`

#### Offerte Intelligence (Fase 1-basis)
**Status:** Gebouwd (100%)  
**Doel:** Offertes voorbereiden op basis van spots. Geen AI-calculatie, geen automatische verzending.  
**Schermen:** Offertes  
**DB:** `offertes`, `offerte_sjablonen`, `offerte_regels`

#### Planning (week-grid V1)
**Status:** Gebouwd (100%)  
**Doel:** Week-grid planning per monteur met tijdsloten, werknummer en verlof.  
**Schermen:** Planning (/connect/planning) — feature flag `VITE_FEATURE_PLANNING=true`  
**DB:** `planning_items` (incl. `werknummer`, `tijdsloten` JSON, `dag_notities`)

#### Communicatie / Berichten
**Status:** Gebouwd (100%)  
**Doel:** Interne chat — directe en groepsgesprekken met foto/video/bijlage en annotaties.  
**Schermen:** Berichten (web, twee-panel), Gesprekscherm (monteur-app)  
**DB:** `chat_gesprekken`, `chat_deelnemers`, `chat_berichten`  
**Bijzonder:** Ongelezen-badge in sidebar; polling 5s (gesprek) / 10s (lijst) / 30s (nav-badge)

#### Document Design System (visuele basis)
**Status:** Gedeeltelijk gebouwd (70%)  
**Doel:** Gedeelde documentmotor voor klantdocumenten, HRM/juridisch en interne operationele stukken.  
**Schermen:** Documentopmaak (/beheer/documentopmaak)  
**Gepland:** PDF-export, digitale ondertekening, per-werkmaatschappij centraal beheer

#### V1.4 — Opleverrapportage
**Status:** In aanbouw (60%) — formeel akkoord  
**Doel:** Opleverrapport samenstellen, spotselectie, bijlagenpakket, definitief maken.  
**Basis:** Werkend live-rapport in `print.tsx` (bouwt hierop voort, niet opnieuw)  
**Restscope:** Spotselectie per verdieping/cluster, 4 rapporttypes als presets, bijlagenpakket, definitief-maken-flow

#### V1.5 — Rapportenmodule
**Status:** Gepland (0%)  
**Doel:** Centrale rapportenbibliotheek, gepersisteerde definitieve rapporten, reactietermijn.  
**Afhankelijkheid:** Rapport-entiteit in DB, bouwt voort op bevriezingsmechanisme (al gebouwd op dossiers)

---

## 3. Schermen

| Route | Component | Omgeving | Functie | Live data |
|---|---|---|---|---|
| `/` | BeheerderDashboard / MonteurDashboard | Connect | Dashboard met statistieken | Ja |
| `/gebouwen` | Gebouwen | Connect | Lijst gebouwen met zoekfunctie | Ja |
| `/gebouwen/:id` | GebouwDetail | Connect | Gebouwkaart (3 segmenten: tabs) | Ja |
| `/gebouwen/:id/plattegrond/:verdiepingId` | Plattegrond | Connect | SVG-plattegrond editor | Ja |
| `/gebouwen/:id/print` | GebouwPrint | Connect | Live opleverrapport (print/PDF) | Ja |
| `/voorzieningen` | Voorzieningen | Connect | Spotoverzicht met filters | Ja |
| `/voorzieningen/nieuw` | VoorzieningNieuw | Connect | Spot aanmaken (foto → AI → bevestig) | Ja |
| `/voorzieningen/:id` | VoorzieningDetail | Connect | Spotdetail + AI-review | Ja |
| `/voorzieningen/:id/qr` | VoorzieningQr | Connect | QR-code label | Ja |
| `/inspecties` | Inspecties | Connect | Inspectieoverzicht | Ja |
| `/inspecties/:id` | InspectieDetail | Connect | Inspectie details | Ja |
| `/onderhoud` | Onderhoud | Connect | Werkorders | Ja |
| `/connect/planning` | ConnectPlanning | Connect (CWU) | Week-grid planning per monteur | Ja |
| `/connect/calculatie` | ConnectCalculatie | Connect (CWU) | Calculatiemodule (pilot: uit) | Ja |
| `/modules/calculatie` | ModulesCalculatie | Connect | Uitgebreide calculatie | Ja |
| `/berichten` | BerichtenPagina | Communicatie | Chat — directe en groepsgesprekken | Ja |
| `/personeel` | PersoneelPagina | Organisatie | HRM — medewerkers, functies, verlof | Ja |
| `/personeel/:id` | MedewerkerDetailPagina | Organisatie | Medewerker profiel + bekwaamheden + verlof | Ja |
| `/gereedschappen` | GereedschappenPagina | Organisatie | Gereedschapbeheer | Ja |
| `/gereedschappen/:id` | GereedschapDetailPagina | Organisatie | Gereedschap detail | Ja |
| `/uren` | UrenPagina | Organisatie | Urenregistratie | Ja |
| `/weekstaten` | WeekstatenPagina | Organisatie | Weekstaten indienen/goedkeuren | Ja |
| `/rapporten` | RapportenPagina | Organisatie | Rapportenmodule (V1.5) | Ja |
| `/dossiers` | DossiersPagina | Organisatie | Projectdossiers | Ja |
| `/offertes` | OffertesPagina | Organisatie | Offertebeheer (voorbereiding) | Ja |
| `/crm` | CrmKlanten | Organisatie | Relatiebeheer (Fase 1) | Ja |
| `/crm/:id` | CrmKlantDetail | Organisatie | Klant/relatie details | Ja |
| `/abonnementen` | Abonnementen | Connect | Abonnementenbeheer | Ja |
| `/one/dashboard` | OneDashboard | FPS One | Klantportaal dashboard | Ja |
| `/beheer/bibliotheek` | Bibliotheek | Beheer | Centrale bibliotheek + documenten + AI | Ja |
| `/beheer/toepassingen` | ToepassingenBeheer | Beheer | Toepassingen catalogus | Ja |
| `/beheer/profielen` | ProfielenBeheer | Beheer | Autorisatieprofielen | Ja |
| `/beheer/documentopmaak` | DocumentopmaakBeheer | Beheer | Document Design System | Ja |
| `/beheer/mail` | MailBeheer | Beheer | SMTP / Microsoft 365 instellingen | Ja |
| `/beheer/backup` | BackupBeheer | Beheer | Systeem backups | Ja |
| `/beheer/login-pogingen` | LoginPogingen | Beheer | Beveiligingslogboek | Ja |
| `/beheer/ontwikkelstatus` | OntwikkelstatusPagina | Beheer | Module-beoordelingen sign-off | Ja |
| `/beheer/projectstatus` | ProjectstatusPagina | Beheer | Dit dossier als dashboard | Ja |
| `/hall-of-fame` | HallOfFamePagina | Connect | Gamification / prestaties | Ja |
| `/gebruikers` | Gebruikers | Beheer | Gebruikersbeheer | Ja |

---

## 4. Database

### Schema-bestanden

| Bestand | Tabellen | Module |
|---|---|---|
| `gebruikers.ts` | `gebruikers`, `login_pogingen`, `uitnodigingen` | Auth / Gebruikers |
| `gebouwen.ts` | `gebouwen`, `verdiepingen`, `tekeningen`, `gebouw_toewijzingen`, `clusters` | Gebouwen |
| `voorzieningen.ts` | `voorzieningen`, `voorziening_types`, `labels`, `voorziening_labels`, `spot_ai_voorstellen`, `fabrikanten` | Spots / Bibliotheek |
| `documenten.ts` | `documenten`, `document_applicaties`, `document_toepassingen`, `document_koppelingen`, `document_goedkeuringen`, `document_logboek` | DMS / Bibliotheek |
| `inspecties.ts` | `inspecties` | Inspecties |
| `onderhoud.ts` | `werkorders` | Onderhoud |
| `abonnementen.ts` | `abonnementen` | Abonnementen |
| `activiteiten.ts` | `activiteiten` | Live-feed / Activiteitslog |
| `systeem.ts` | `app_instellingen`, `helpdesk_tickets`, `feedback`, `module_beoordelingen` | Systeem / Beheer |
| `crm.ts` | `crm_klanten`, `crm_contactpersonen`, `crm_opdrachten` | CRM |
| `emails.ts` | `gebouw_emails`, `email_bijlagen` | E-mails / DMS |
| `hrm.ts` | `werkgevers`, `medewerkers`, `functies`, `functie_opleidingen`, `opleidingen`, `bekwaamheden`, `verlofsoorten`, `verlofsaldi`, `verlofaanvragen`, `ziekmeldingen` | HRM / Personeel |
| `dossiers.ts` | `dossiers`, `dossier_documenten` | Dossiermodule |
| `offertes.ts` | `offertes`, `offerte_sjablonen`, `offerte_regels` | Offerte Intelligence |
| `mail.ts` | `mail_berichten`, `mail_bijlagen` | E-mail inkomend |
| `calculaties.ts` | `calculaties`, `calculatie_regels` | Calculatie |
| `rapporten.ts` | `rapporten` | Rapportenmodule (V1.5) |
| `toolbox.ts` | `toolbox_berichten`, `toolbox_bevestigingen` | Toolbox |
| `planning.ts` | `planning_items`, `planning_afwezigheid` | Planning |
| `mod-calculatie.ts` | (uitgebreide calculatie tabellen) | Modules / Calculatie |
| `gereedschappen.ts` | `gereedschappen`, `gereedschap_uitleningen` | Gereedschappen |
| `achievements.ts` | `gebruiker_achievements` | Gamification |
| `uren.ts` | `uren_registraties`, `week_staten` | Urenregistratie |
| `chat.ts` | `chat_gesprekken`, `chat_deelnemers`, `chat_berichten` | Communicatie |
| `backups.ts` | `backup_records` | Systeem backups |

### Architectuurregels

- Kolommen: **camelCase** in TypeScript, **snake_case** in API-responses (handmatige mapping in route handlers)
- Enums als **text-kolommen** (geen pgEnum — pgEnum breekt SQL-DDL-workflow)
- Geen `pnpm --filter @workspace/db run push` op TTY — gebruik directe `ALTER TABLE` SQL voor additieve wijzigingen
- Foreign keys: set null of cascade per domein

---

## 5. API-overzicht

### Publieke routes (geen authenticatie)

| Methode | Pad | Doel |
|---|---|---|
| GET | `/healthz` | Health check |
| POST | `/api/auth/login` | Inloggen (e-mail + wachtwoord + TOTP) |
| POST | `/api/auth/logout` | Uitloggen |
| GET | `/api/auth/me` | Huidige sessie ophalen |
| POST | `/api/auth/wachtwoord-reset` | Wachtwoord reset verzoek |
| GET/POST | `/api/uitnodiging/*` | Uitnodigingsflow nieuwe gebruikers |

### Beveiligde routes (vereist sessie of bearer token)

Alle routes hieronder vereisen een geldige sessie (web) of HMAC bearer token (mobiel).

**Gebouwen & Verdiepingen**

| Methode | Pad | Doel |
|---|---|---|
| GET | `/api/gebouwen` | Lijst gebouwen (scoping op rol) |
| POST | `/api/gebouwen` | Nieuw gebouw aanmaken |
| GET | `/api/gebouwen/:id` | Gebouwdetail |
| PATCH | `/api/gebouwen/:id` | Gebouw bewerken |
| GET | `/api/gebouwen/:id/verdiepingen` | Verdiepingen ophalen |
| GET | `/api/gebouwen/:id/kaart` | Google Maps embed-URL (server-side) |
| GET | `/api/gebouwen/:id/volgend-spotnummer` | Auto-increment spotnummer |
| GET | `/api/gebouwen/:id/clusters` | Clusters ophalen |
| POST | `/api/gebouwen/:id/clusters` | Cluster aanmaken |
| GET | `/api/gebouwen/:id/toewijzingen` | Team-toewijzingen |
| POST | `/api/gebouwen/:id/toewijzingen` | Toewijzing toevoegen |
| POST | `/api/gebouwen/:id/opleverrapport` | Rapport opslaan in DMS |
| POST | `/api/gebouwen/ai-analyse` | AI-invullen vanuit tekst |

**Voorzieningen (Spots)**

| Methode | Pad | Doel |
|---|---|---|
| GET | `/api/voorzieningen` | Spotoverzicht met filters |
| POST | `/api/voorzieningen` | Spot aanmaken |
| GET | `/api/voorzieningen/:id` | Spotdetail |
| PATCH | `/api/voorzieningen/:id` | Spot bewerken |
| POST | `/api/voorzieningen/:id/status` | Statuswijziging |
| DELETE | `/api/voorzieningen/:id` | Spot archiveren |
| POST | `/api/voorzieningen/ai-spotvoorstel` | AI-analyse voor nieuwe spot |
| GET | `/api/voorzieningen/:id/ai-voorstel` | AI-voorstel ophalen |
| POST | `/api/voorzieningen/:id/ai-voorstel` | AI-voorstel persisteren |
| POST | `/api/voorzieningen/:id/ai-controle` | Beheerder bevestigt AI-controle |

**Documenten & DMS**

| Methode | Pad | Doel |
|---|---|---|
| GET | `/api/documenten` | Documentenlijst met filters |
| POST | `/api/documenten` | Document uploaden |
| GET | `/api/documenten/:id` | Documentdetail |
| PATCH | `/api/documenten/:id` | Status/koppelingen wijzigen |
| GET | `/api/documenten/:id/download` | Download (logt actie, redirect) |
| POST | `/api/documenten/ai-analyse` | AI-analyse van PDF-tekst |
| POST | `/api/documenten/ai-koppelvoorstellen` | AI-koppelvoorstellen bibliotheek |
| POST | `/api/documenten/controleer-duplicaat` | Hash + fuzzy duplicaatcheck |
| GET | `/api/documenten/signaleringen` | Verlopen/binnenkort/ter-goedkeuring |

**HRM / Personeel**

| Methode | Pad | Doel |
|---|---|---|
| GET | `/api/medewerkers` | Medewerkerslijst |
| POST | `/api/medewerkers` | Medewerker aanmaken/onboarden |
| GET/PATCH | `/api/medewerkers/:id` | Medewerker details/bewerken |
| GET | `/api/functies` | Functiehuis |
| POST | `/api/functies/:id/opleidingen-voorstel` | AI-opleidingsvoorstel per functie |
| GET | `/api/verlofaanvragen` | Verlofaanvragen lijst |
| POST | `/api/verlofaanvragen` | Verlofaanvraag indienen |
| PATCH | `/api/verlofaanvragen/:id` | Goedkeuren/afwijzen verlof |
| GET | `/api/hrm/cao-opties` | Beschikbare CAO's ophalen |
| GET | `/api/hrm/stats` | HRM-statistieken dashboard |

**Chat / Communicatie**

| Methode | Pad | Doel |
|---|---|---|
| GET | `/api/chat/gesprekken` | Gesprekkenlijst (incl. ongelezen teller) |
| POST | `/api/chat/gesprekken` | Gesprek aanmaken (direct/groep) |
| GET | `/api/chat/gesprekken/:id` | Gesprekdetail |
| GET | `/api/chat/gesprekken/:id/berichten` | Berichtenlijst |
| POST | `/api/chat/gesprekken/:id/berichten` | Bericht versturen |
| POST | `/api/chat/gesprekken/:id/gelezen` | Markeer als gelezen |
| GET | `/api/chat/gebruikers` | Selecteerbare gebruikers voor nieuw gesprek |

**Planning**

| Methode | Pad | Doel |
|---|---|---|
| GET | `/api/modules/planning/items` | Planning-items ophalen (weekfilter) |
| POST | `/api/modules/planning/items` | Planning-item aanmaken |
| PATCH | `/api/modules/planning/items/:id` | Planning-item bewerken |
| DELETE | `/api/modules/planning/items/:id` | Planning-item verwijderen |
| GET/POST | `/api/modules/planning/afwezigheid` | Afwezigheid (verlof/ziek) |

**Dashboard**

| Methode | Pad | Doel |
|---|---|---|
| GET | `/api/dashboard/stats` | Tellers: gebouwen, spots, inspecties |
| GET | `/api/dashboard/status-verdeling` | Statusverdeling spots |
| GET | `/api/dashboard/vervaldagen` | Komende vervaldatums |
| GET | `/api/dashboard/recente-activiteit` | Live activiteitsfeed |

---

## 6. AI-componenten

| Service | Bestand | Model | Doel | Mens bevestigt |
|---|---|---|---|---|
| Document-AI | `services/document-ai.ts` | gpt-5-mini | PDF-tekst analyseren: fabrikant, documenttype, EN-norm, revisie | Ja |
| Bibliotheekvalidatie | `services/document-ai.ts` | gpt-5-mini | Ontbrekende Document↔Toepassing-koppelingen voorstellen | Ja |
| Spot-AI Vision | `services/spot-ai.ts` | gpt-5 (vision) | Foto voor/na: oriëntatie, applicatie, toepassing, fabrikant | Ja |
| Gebouw-AI | `services/gebouw-ai.ts` | gpt-5 + gpt-5-mini | Satellietbeelden, tekeningen analyseren; adres/type/verdiepingen extraheren | Ja |
| E-mail-AI | `services/email-ai.ts` | gpt-5-mini | E-mails samenvatten, NAW extraheren, relevantie beoordelen | Nee (lezen) |
| Opleiding-AI | `services/opleiding-ai.ts` | gpt-5 | Passende opleidingen/cursussen voorstellen per functie | Ja |
| Calculatie-AI | `routes/calculaties.ts` | gpt-5 | Begrotingsregels voorstellen op basis van spots | Ja |
| Toolbox-AI | `routes/toolbox.ts` | gpt-4o-mini | Berichten classificeren als "blijvend belangrijk" | Nee |

### AI-kleurconventie

- **GEEL** (amber-100/700, Sparkles-icoon) = AI-voorstel/aangevuld; bewerkbaar
- **NEUTRAAL** (variant secondary, text-muted-foreground) = geaccepteerd/bevestigd

### AI-principe

AI stelt voor, mens beslist. AI koppelt/keurt nooit zelfstandig iets juridisch goed.  
Leerset-correcties (spot-AI) worden als few-shot voorbeelden teruggekoppeld.

---

## 7. Functionaliteiten

### Gebouwd

- Gebouwenregistratie met verdiepingen, tekeningen, 3D CSS-weergave, zoekfunctie
- Spotregistratie (10+ types) met statuslevenscyclus, QR-code, auto-objectnummer
- Plattegrond SVG-editor: spots plaatsen/verplaatsen, scheidingen tekenen, zoom/pan
- Toewijzingen: teamleden aan gebouwen koppelen met projectrol
- Clusters & serie plaatsen (web); mobiel plaatst één-voor-één
- AI-spotherkenning: foto voor/na → applicatie, toepassing, fabrikant (leerset)
- AI-spotcontrole: beheerder bevestigt afwijkende monteurkeuze (rode ring in plattegrond)
- Bibliotheek: applicaties, toepassingen, documenten (ETA/rapport/certificaat/DoP)
- Versiebeheer documenten: revisies, status, koppelingen, goedkeuringsflow
- AI-documentanalyse + AI-koppelvoorstel
- Inspecties: oplevering, periodiek, jaarlijks, herstel
- Onderhoud: werkorders met prioriteit, deadline, toewijzing
- Dossiers per gebouw: concept → definitief → gearchiveerd
- Dossierbevriezing: definitief dossier bevriest documentrevisies
- HRM Fase 1: medewerkers, functiehuis, opleidingen, bekwaamheidsmatrix, verlof+saldi
- HRM onboarding: bestaand gebruikersaccount in één klik onboarden als medewerker
- AI-opleidingsvoorstel per functie (mens accepteert individueel)
- Urenregistratie + weekstaten indienen/goedkeuren
- Planning: week-grid per monteur, tijdsloten, werknummer, verlof
- Offerte Intelligence: offertes voorbereiden uit spots (geen AI-calculatie)
- Communicatie: chat (direct/groep), foto-editor met annotaties, bijlages, polling
- E-mail inkomend: IMAP-parse, AI-samenvatting, relevantie-scoring, projectkoppeling
- Live opleverrapport (`print.tsx`): voorblad, spots, plattegrond, e-mails, PDF
- Document Design System: herbruikbare documentcomponenten, documentopmaak-preview
- Gebruikersbeheer: rollen, bevoegdheden-matrix, profielen
- CRM Fase 1: klanten, contactpersonen, opdrachten
- Abonnementen: 3 pakketten (Basis/Beheer/Volledig)
- Gamification: achievements, Hall of Fame
- Gereedschapbeheer met uitleen-registratie
- Toolbox: berichten aanmaken en classifceren (web); mobiel: lezen
- Backups: geautomatiseerde database-exports
- FPS One klantportaal: dashboard, gebouwen, documenten (read-only)
- Google Maps embed (server-side, API-key verborgen)
- Microsoft 365 e-mailverzending

### In aanbouw

- V1.4 Opleverrapportage: spotselectie per verdieping/cluster, 4 rapporttypes, bijlagenpakket, definitief-maken
- Document Design System: PDF-export, digitale ondertekening, per-werkmaatschappij branding

### Gepland

- V1.5 Rapportenmodule: gepersisteerde rapporten, reactietermijn, centrale bibliotheek

### Geparkeerd (formeel akkoord vereist)

- V2.0 Mobiele monteurflow volledig (offline sync, routeplanning)
- Biometrisch inloggen monteur-app
- Toolbox met leesbevestiging (audittrail)
- V3.0 HRM volledig (salarisadministratie, werving, AI-coaches)
- CRM volledig (uitgebouwde klantmodule)
- S.G. Constructies (samengesteld spottype + constructietemplates)
- Fase 2 Bedrijfsbesturing (calculatie, projectcontrol, AccountView-koppeling)
- AI-uitbreidingen (confidence-drempel, periodieke documentcontrole)

---

## 8. Roadmap

### Gereed

| Fase | Omschrijving | Afgerond |
|---|---|---|
| V1.0 | Administratief gereed voor uitvoering | 2025 |
| V1.1 | Rollen & bevoegdheden | 2025 |
| V1.2 | Bibliotheek & documentstructuur | 2025 |
| V1.3 | Spots & uitvoering | 2025/2026 |
| DMS | Documentenbibliotheek + dossierbevriezing | 2026 |
| AI | Spotherkenning + Bibliotheekvalidatie | 2026 |
| HRM | Personeel Fase 1-basis | 2026 |
| Dossiers | Dossiermodule Fase 1-basis | 2026 |
| Offertes | Offerte Intelligence Fase 1-basis | 2026 |
| Planning | Week-grid V1 | juni 2026 |
| Chat | Communicatie / Berichten | juni 2026 |
| DDS | Document Design System visuele basis | juni 2026 |

### In ontwikkeling

| Fase | Omschrijving | Blokkade |
|---|---|---|
| V1.4 | Opleverrapportage (60% gereed) | Spotselectie + bijlagenpakket nog te bouwen |
| DDS | Document Design System verdieping | PDF-export + ondertekening |

### Gepland

| Fase | Omschrijving | Afhankelijkheid |
|---|---|---|
| V1.5 | Rapportenmodule | Rapport-entiteit in DB; bouwt op dossierbevriezing |

### Toekomst (geparkeerd)

| Fase | Blokkade |
|---|---|
| V2.0 Mobiel | Wacht op formeel akkoord |
| S.G. Constructies | Wacht op formeel akkoord |
| V3.0 HRM volledig | Na V2.0 |
| CRM volledig | Na V1.5 |
| Fase 2 Bedrijfsbesturing | Strategische horizon, niet op korte termijn |

---

## 9. Openstaande punten

### Technische schuld

- Legacy WBDBO/WRD/classificatie-kolommen bestaan nog in DB en prop-types maar worden niet meer weergegeven (bewust niet droppen — legacy-compatibiliteit)
- `labels.testrapportId` deprecated (opgegaan in documenten); blijft als fallback
- Pre-existing TS7030-fouten in `api-server` (planning-module.ts regels 133, 194, 230, 319, 349) — pre-existing, geen regressie
- CRM scaffold (`pages/crm/`) minimaal uitgebouwd; bewust niet verder uitbouwen

### Beveiligingspunten

- `otplib` vastzetten op v12 (v13 breekt esbuild-bundle) — jaarlijks herbeoordelen
- Sessie-cookie `SameSite=None` vereist HTTPS; lokaal via `http://localhost:80` werkt Secure-cookie niet
- Microsoft Graph e-mail: upstream foutteksten worden geredigeerd vóór log/response (privacy)
- `pnpm audit` via kwaliteitscheck-script; periodiek uitvoeren

### Ontbrekende onderdelen

- Spotselectie per verdieping/cluster in opleverrapportage (V1.4 restscope)
- Rapporttypes als presets (V1.4)
- Bijlagenpakket samenstellen (V1.4)
- Definitief-maken flow: overgang naar gepersisteerde rapport-entiteit (V1.4 → V1.5)
- Reactietermijn en opleverstatus (V1.5)

### Optimalisaties

- Polling-strategie voor berichten (nu setInterval; WebSockets of SSE later)
- PDF-plattegrondrender: kwaliteitsverlies bij sterk inzoomen op detailrijke tekeningen
- Spotnummer-collision bij veel gelijktijdige sync (server-retry aanwezig)

---

## 10. Teststatus

| Testtype | Status | Locatie |
|---|---|---|
| E2E menu-navigatie | Aanwezig | `scripts/src/e2e-monteur-ci.ts`, workflow `e2e-menu` |
| TOTP-login timing | Geborgd | `e2e-totp-timing.md` (next-window code genereren) |
| Typecheck | Volledig schoon | `pnpm run typecheck` |
| Kwaliteitscheck | Script aanwezig | `pnpm --filter @workspace/scripts run kwaliteitscheck` |
| Beveiligingsscan | Script aanwezig | `pnpm --filter @workspace/scripts run security-scan` |
| Unit tests | Geen formele unit tests | — |
| Handmatige acceptatietest | Na elk increment | Via Replit preview |

**Playwright:** vereist Nix-chromium (`which chromium` als `executablePath`).  
**E2E-account:** vast testaccount via `scripts/e2e-monteur-testaccount`.

---

## 11. Besluitenlogboek

| Datum | Besluit | Reden |
|---|---|---|
| 2025 | Eigen sessie-auth i.p.v. Clerk/Replit Auth | Verplichte TOTP-MFA niet beschikbaar in beheerde auth-diensten |
| 2025 | `otplib` vastzetten op v12 | v13 heeft andere API (geen `authenticator`-export), breekt esbuild-bundle |
| 2025 | Contract-first API: OpenAPI eerst, dan codegen | Typeveiligheid en enkelvoudige bron van waarheid voor API-contract |
| 2025 | Enums als text-kolommen, niet pgEnum | pgEnum breekt SQL-DDL-workflow bij additieve wijzigingen |
| 2025 | Geen `db push` op TTY — directe ALTER SQL | `pnpm db push` faalt non-interactief; additieve kolommen via directe SQL |
| 2025 | Paden: camelCase TS, snake_case API | Drizzle-conventie; handmatige mapping in route handlers |
| 2026 | Sessie-middleware omzeilen voor mobiel bearer pad | connect-pg-simple schrijft per request een sessie-rij → onbeperkte groei DB |
| 2026 | DMS-bevriezingsdeel (V1.5) vooruit gebouwd op dossiers | Bevriezingsmechanisme bewezen op dossier-entiteit; in V1.5 toepassen op rapport-entiteit |
| 2026 | HRM verlof meegenomen in Fase 1-basis | Expliciete gebruikerswens — afwijking van oorspronkelijke afbakening |
| 2026 | AI-opleidingsvoorstel als afgebakende AI-uitzondering | Alleen voorstellen; mens bevestigt; geen AI-personeelsadvies/-coaching |
| 2026 | Ontwikkelstop opgeheven | Gebruiker akkoord: volledige openstaande roadmap bouwen; per increment beoordeelbaar |
| 2026 | Google Maps API-key server-side houden | API-key niet blootstellen in frontend; server geeft embed-URL terug |
| 2026 | `html2canvas-pro` i.p.v. `html2canvas 1.4.1` | Klassieke html2canvas kan oklch()-kleuren (Tailwind v4) niet parsen |
| 2026 | `SameSite=None; Secure` + `trust proxy` voor sessie-cookie | Replit-iframe vereist dit; zonder trust proxy werkt Secure-cookie niet |

---

## 12. Gereedheidsdashboard

### FPS Connect — Totaalgereedheid: ~82%

| Onderdeel | Gereedheid | Toelichting |
|---|---|---|
| Gebouwenbeheer | 100% | Volledig gebouwd |
| Spots & Plattegronden | 100% | Volledig gebouwd; kleine verfijningspunten open |
| Bibliotheek & Documenten | 100% | Incl. DMS, versiebeheer, bevriezing |
| AI-componenten | 90% | Spotherkenning, documentanalyse, gebouw-AI gebouwd; confidence-drempel geparkeerd |
| Inspecties | 100% | Volledig gebouwd |
| Onderhoud | 100% | Volledig gebouwd |
| Planning (CWU) | 100% | Week-grid V1 gebouwd |
| Calculatie (CWU) | 20% | Scaffold aanwezig; module uitgeschakeld in pilot |
| Offerte Intelligence | 60% | Fase 1-basis; AI-calculatie geparkeerd |
| Communicatie | 100% | Chat volledig gebouwd |
| HRM / Personeel | 80% | Fase 1-basis volledig; V3.0 (salarisadm., werving) geparkeerd |
| Dossiermodule | 80% | Fase 1-basis + bevriezing gebouwd; V1.5 rapportenmodule gepland |
| Opleverrapportage (V1.4) | 60% | Live rapport gebouwd; spotselectie/presets/bijlagenpakket open |
| Rapportenmodule (V1.5) | 0% | Gepland; afhankelijk van V1.4 afronding |
| Document Design System | 70% | Visuele basis gebouwd; PDF/ondertekening gepland |
| CRM | 30% | Fase 1-scaffold; bewust achtergesteld op V1.5 |
| FPS One (Klantportaal) | 50% | Basis dashboard + read-only; CRM-koppeling geparkeerd |
| Rollen & Beveiliging | 95% | TOTP, RBAC, audit-log; biometrisch geparkeerd |
| Mobiele app (monteur) | 70% | Spotflow, plattegrond, HRM read-only gebouwd; offline/routeplanning geparkeerd |

### FPS Monteur — Mobiele app

| Onderdeel | Gereedheid | Toelichting |
|---|---|---|
| Gebouwen + Spots lezen | 100% | Volledig |
| Spot aanmaken + AI-flow | 100% | Foto voor/na → AI → bevestig |
| Plattegrond (mobiel) | 100% | WebView-renderer; scheidingen zichtbaar |
| Chat / Berichten | 100% | Direct + groep |
| HRM read-only | 100% | Dashboard, opleidingen, kennisbank |
| Documenten lezen | 100% | PDF-viewer hergebruikt |
| Offline synchronisatie | 0% | Geparkeerd (V2.0) |
| Biometrisch inloggen | 0% | Geparkeerd |
| Routeplanning | 0% | Geparkeerd (V2.0) |

---

_Dit dossier geldt voor FPS Connect (dit Replit-project). Wanneer Sparki en FPS Planner naast FPS Connect bestaan, krijgt elk project zijn eigen dossier. Een overkoepelend dossier voor de volledige softwareomgeving kan daarna worden aangemaakt._
