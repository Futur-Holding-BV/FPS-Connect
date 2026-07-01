# Module-audit FPS Connect — juli 2026

Methodiek: alle routes in App.tsx gekruist met navigatie-items, pagina-bestanden gesampeld op regelaantal + API-hooks-gebruik, stub-patronen gezocht ("nog niet beschikbaar", "in voorbereiding", "binnenkort"). Datum: 2026-07-01.

---

## Samenvatting

| Categorie | Aantal |
|---|---|
| Volledig geïmplementeerde pagina's (route + echte API-koppeling) | ~85 |
| Bevestigde stubs / placeholders | 6 |
| Routes in App.tsx zonder nav-item (detailpagina's, print, legacy) | ~15 |
| Nav-items die naar een stub leiden | 3 |
| "In uitvoering"-badge in nav (clickable, pagina bestaat) | 2 |
| Feature-geflagde routes (calculatie, planning) | 2 |

Conclusie: de overgrote meerderheid van pagina's is **echt geïmplementeerd** met API-hooks en data-koppeling. Er zijn zes bevestigde stubs; de rest van eventuele problemen zit in runtime-fouten (API-mismatches, lege seedings, TypeScript-fouten in specifieke flows) — niet in ontbrekende pagina's.

---

## 1. Bevestigde stubs — pagina's zonder echte functionaliteit

Deze pagina's tonen een placeholder-kaart ("nog niet beschikbaar") of een geplande-functies-preview, **zonder API-aanroepen**.

| Route | Bestand | Zichtbaar in nav? | Reden stub |
|---|---|---|---|
| `/financieel/bedrijfsresultaten` | `financieel/bedrijfsresultaten.tsx` | Ja (Financieel › Bedrijfsresultaten) | Expliciete "nog niet beschikbaar"-kaart; geen hooks |
| `/werk-inbox` | `werk-inbox/index.tsx` | Ja (Communicatie › Werk-inbox) | "E-mailintegratie (M365) niet beschikbaar"; geen hooks |
| `/organisatie/autopark` | `organisatie/autopark.tsx` | Nee (nav linkt naar `/wagenpark`) | "Nog niet beschikbaar"; dit is de oude route — wagenpark.tsx is de echte vervanger |
| `/one/documenten` | `one/documenten.tsx` | Ja (FPS One nav) | Geplande-functies-preview; geen hooks |
| `/one/rapporten` | `one/rapporten.tsx` | Ja (FPS One nav) | Geplande-functies-preview; geen hooks |
| `/one/abonnementen` | `one/abonnementen.tsx` | Ja (FPS One nav) | Toont tariefkaarten statisch; geen hooks |

**Actie:** `bedrijfsresultaten` en `werk-inbox` hebben een nav-item — gebruikers klikken erop en zien een lege pagina. Dit zijn de meest zichtbare stubs die moeten worden gebouwd of verborgen totdat ze klaar zijn.

---

## 2. "In uitvoering"-badges (nav-item zichtbaar, pagina werkt al)

| Route | Status |
|---|---|
| `/rapporten` (Opleverrapportage) | Badge aanwezig, pagina heeft 238 regels + `useListRapporten` — V1.4 in aanbouw |
| `/dossiers` | Badge aanwezig, pagina heeft volledige CRUD + definitief-maken-flow |

---

## 3. Feature-geflagde routes

| Route | Vlag | Standaard pilot |
|---|---|---|
| `/modules/calculatie` | `VITE_FEATURE_CALCULATIE` | Uit — toont "niet beschikbaar in pilot" |
| `/modules/planning` | `VITE_FEATURE_PLANNING` | Aan — zichtbaar |

---

## 4. Volledig geïmplementeerde modules (samenvatting per domein)

### Kern — Projectflow
| Route | Pagina | Staat |
|---|---|---|
| `/gebouwen` | `gebouwen/index.tsx` | Volledig — zoek, filter, 3D-weergave |
| `/gebouwen/:id` | `gebouwen/detail.tsx` | Volledig — 3 segmenten, AI-samenvatting, plattegrond, spots, documenten |
| `/gebouwen/:id/plattegrond/:vid` | `plattegrond.tsx` | Volledig — SVG-editor, spots, scheidingen, clusters |
| `/voorzieningen` | `voorzieningen/index.tsx` | Volledig — filter, status, bulk |
| `/voorzieningen/:id` | niet afzonderlijk gerouted | Via detail.tsx in gebouwcontext |
| `/opname` | `opname/index.tsx` | Volledig |
| `/rapporten` | `rapporten/index.tsx` | In aanbouw (V1.4) — lijst aanwezig, generatie gedeeltelijk |
| `/onderhoud` | `onderhoud/contracten.tsx` + werkbonnen | Volledig — 378 regels |
| `/documenten` | `documenten/index.tsx` → `beheer/documenten-tab.tsx` | Volledig — DMS met SHA-256 duplicaatdetectie, AI, revisies |
| `/dossiers` | `dossiers/index.tsx` | Volledig — concept/definitief/archief |
| `/snagstream` | `snagstream/index.tsx` | Volledig — AI-uitlezen PDF-rapporten |

### CWU (Calculatie, Werkvoorbereiding, Uitvoering)
| Route | Staat |
|---|---|
| `/modules/calculatie` | Volledig (feature-flagged uit in pilot) |
| `/offertes` | Volledig — analytics, spot-naar-offerte conversie |
| `/offertes/:id` | ProposalStudio — volledig |
| `/opdrachten/:id` | Volledig — werkbegroting, nacalculatie, tabs |
| `/werkvoorbereiding` | Volledig |

### Planning
| Route | Staat |
|---|---|
| `/modules/planning` | Volledig (feature-flagged aan) |
| `/modules/planning/afwezigheid` | Volledig |
| `/modules/planning/medewerkers` | Volledig |

### CRM (Commercie)
| Route | Staat |
|---|---|
| `/crm` | Volledig |
| `/crm/organisaties` | Volledig |
| `/crm/projectkansen` | Volledig |
| `/crm/concurrenten` | Volledig — 266 regels |
| `/crm/marktintelligentie` | Volledig — 347 regels |
| `/crm/kennisbibliotheek` | Volledig — 233 regels |

### Communicatie & Veiligheid
| Route | Staat |
|---|---|
| `/berichten` | Volledig — 971 regels, volledig chat-systeem |
| `/inbox` | Volledig — slim uploadpunt met AI-classificatie |
| `/toolbox` | Volledig |
| `/veiligheid/toolboxen` | Volledig |
| `/veiligheid/lmra` | Volledig — 554 regels |
| `/veiligheid/meldingen` | Volledig — 613 regels |
| `/werk-inbox` | **STUB** — zie §1 |

### Financieel
| Route | Staat |
|---|---|
| `/facturen/dashboard` | Volledig |
| `/facturen` | Volledig |
| `/facturen/:id` | Volledig |
| `/facturen/exportlog` | Volledig |
| `/facturen/klaar-voor-export` | Volledig |
| `/financieel/crediteuren` | Volledig |
| `/financieel/onderhanden-werk` | Volledig — 366 regels |
| `/financieel/jaarrekening` | Volledig — `jaarrekening/index.tsx` met `useGetJarrekeningOnderhandenWerk` |
| `/financieel/bedrijfsresultaten` | **STUB** — zie §1 |
| `/sepa-bestanden` | Volledig — 266 regels |

### Loon & Salarisverwerking
| Route | Staat |
|---|---|
| `/salarisarchief` | Volledig — upload PDF/ZIP/XML |
| `/salaris-mutaties` | Volledig — 574 regels |
| `/scab-mail` | Volledig — 490 regels |
| `/loon-output` | Volledig — 198 regels |
| `/boekhouder` | Volledig — portaal voor accountant |
| `/uren` | Volledig — 295 regels |
| `/weekstaten` | Volledig — 403 regels |

### Personeel (HRM Fase 1)
| Route | Staat |
|---|---|
| `/personeel` | Volledig — 30+ hooks, AI-CV-analyse, onboarding |
| `/personeel/:id` | Volledig — profiel, functie, opleidingen, verlof |
| `/personeel/uitboarden` | Volledig |
| `/personeel/verlof` | Volledig |
| `/personeel/jaarplanning` | Volledig — 257 regels |
| `/personeel/capaciteitsplanning` | Volledig — 309 regels |
| `/personeel/jaarafsluiting` | Volledig |
| `/personeel/verlof-instellingen` | Volledig |

### Magazijn (alle sub-pagina's)
| Route | Staat |
|---|---|
| `/magazijn` | Volledig — dashboard |
| `/magazijn/artikelen` | Volledig |
| `/magazijn/artikelen/:id` | Volledig |
| `/magazijn/locaties` | Volledig — 242 regels |
| `/magazijn/voorraad` | Volledig |
| `/magazijn/mutaties` | Volledig |
| `/magazijn/reserveringen` | Volledig — 166 regels |
| `/magazijn/uitgiftes` | Volledig — 201 regels |
| `/magazijn/retouren` | Volledig — 197 regels |

### Organisatie
| Route | Staat |
|---|---|
| `/gereedschappen` | Volledig |
| `/wagenpark` | Volledig — Traxgo-sync, AI-advies |
| `/organisatie/verzekeringen` | Volledig — 621 regels |
| `/organisatie/bedrijfsgegevens` | Volledig |
| `/organisatie/werkmaatschappijen` | Volledig |
| `/organisatie/jaarverslagen` | Volledig — 317 regels |
| `/organisatie/bedrijfsdocumenten` | Volledig — 936 regels |
| `/organisatie/documentopmaak` | Volledig — Document Design System preview |
| `/organisatie/studio` | Volledig — Document Studio met AI |
| `/workflow` | Volledig — workflow designer |
| `/leveranciers` | Volledig — 261 regels |
| `/artikelen` | Volledig — 243 regels |
| `/hall-of-fame` | Volledig — ranglijst met `useGetHallOfFame` |

### Beheer (systeembeheer)
| Route | Staat |
|---|---|
| `/gebruikers` | Volledig — incl. re-invite, rollen, 2FA |
| `/beheer/toepassingen` | Volledig |
| `/beheer/bibliotheek` | Volledig |
| `/beheer/profielen` | Volledig |
| `/beheer/rollen-rechten` | Volledig |
| `/beheer/spotconfiguratie` | Volledig |
| `/beheer/go-live` | Volledig |
| `/beheer/boekhouding` | Volledig — AccountView-koppeling |
| `/beheer/mail` | Volledig |
| `/beheer/backup` | Volledig |
| `/beheer/herstel` | Volledig |
| `/beheer/heatmaps` | Volledig |
| `/beheer/helpdesk` | Volledig |
| `/beheer/feedback` | Volledig |
| `/beheer/privacy` | Volledig |
| `/beheer/ontwikkelstatus` | Volledig |
| `/beheer/login-pogingen` | Volledig |
| `/beheer/gebouwen-archief` | Volledig |

### FPS One (klantportaal)
| Route | Staat |
|---|---|
| `/one/dashboard` | Volledig |
| `/one/gebouwen` | Volledig |
| `/one/documenten` | **STUB** — zie §1 |
| `/one/rapporten` | **STUB** — zie §1 |
| `/one/abonnementen` | **STUB** — zie §1 |

---

## 5. Route-afwijkingen en legacy

| Route | Situatie |
|---|---|
| `/organisatie/autopark` | Oud route, stub-pagina; nav linkt al naar `/wagenpark` — kan verwijderd worden |
| `/connect/hrm`, `/connect/calculatie`, `/connect/planning` | Verouderde redirect-routes — geen nav-item meer |
| `/abonnementen` | Bestaat in App.tsx, gelinkt vanuit instellingen-nav; is een echte pagina (FPS Connect abonnementenbeheer) |

---

## 6. Prioriteitsmatrix voor opvolging

| Prioriteit | Item | Actie |
|---|---|---|
| Hoog | `/financieel/bedrijfsresultaten` — stub zichtbaar in nav | Bouwen of nav-item tijdelijk verbergen |
| Hoog | `/werk-inbox` — stub zichtbaar in nav | M365-integratie bouwen of nav-item verbergen |
| Hoog | V1.4 Opleverrapportage (`/rapporten`) — in aanbouw | Afmaken conform roadmap |
| Middel | FPS One: documenten, rapporten, abonnementen — stubs | Bouwen wanneer FPS One actief wordt |
| Laag | `/organisatie/autopark` — dode legacy route | Verwijderen uit App.tsx |
| Laag | `/connect/hrm` e.a. — verouderde redirects | Verwijderen uit App.tsx |

---

## 7. Niet geauditeerd in deze ronde

De volgende aspecten vallen buiten wat statisch uit de broncode af te lezen is en vragen aparte runtime-verificatie:

- **API-mismatches:** of alle frontend-hooks daadwerkelijk een passend backend-endpoint hebben (OpenAPI-drift)
- **Seeding/lege staat:** of de database voldoende testdata heeft om pagina's zinvol te laten renderen
- **Typecheck-fouten:** bekende pre-existing TS2741 (`enabled`-opties) die de werking niet belemmeren maar rapportage vertroebelen
- **Machtigingsfouten at runtime:** of bevoegdheidscontroles correct doorverlopen voor alle rollen
- **E2E-tests per module:** of specifieke flows (bijv. spot aanmaken, offerte versturen, verlof aanvragen) end-to-end werken

---

_Audit uitgevoerd: 2026-07-01 | Methode: statische code-analyse (routes × nav × pagina-implementaties)_
