## 2026-07-13 — Wagenparkmeldingen: kwartaalcontrole, schade & storing (Taak #615)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief; nieuwe tabellen/routes)

**Mobiele wagenpark-module (FPS Monteur-app):**
- **Nieuwe startscherm-snelkoppeling:** "Mijn Voertuig" (zichtbaar voor iedereen met een actieve auto-toewijzing).
- **Kwartaalcontrole:** stap-voor-stap checklist (vloeistoffen, banden, verlichting, km-stand). Verplichting om bij afwijkingen foto's toe te voegen.
- **Schademelding:** formulier met datum, omschrijving en AI-ondersteunde foto-upload (herkent voertuigonderdelen en schade-ernst).
- **Storingsmelding:** direct doorgeven van dashboardlampjes of mechanische gebreken.
- **Offline support:** meldingen worden lokaal opgeslagen in de sync-wachtrij als er geen bereik is in de bus.

**Kantoor-beheer (firevault):**
- **Centraal dashboard:** `/wagenpark/meldingen` met filters op type, status (open/garage/afgehandeld) en medewerker.
- **Voertuig-historie:** nieuwe tab "Meldingen" op the voertuigdetailpagina toont alle historische kwartaalcontroles en schades van dat specifieke kenteken.
- **Status-workflow:** beheerder kan meldingen doorzetten naar "Garage", inclusief PDF-export van de schadefoto's voor de verzekeraar.

**Techniek & Notificaties:**
- **Push-notificaties:** integratie met Expo Notification Service. Gebruikers krijgen een herinnering als de kwartaalcontrole >90 dagen geleden is.
- **DB-schema:** nieuwe tabellen `wagenpark_meldingen` (polymorf), `wagenpark_kwartaalcontrole` en `push_tokens`.
- **API-server:** nieuwe routes onder `/wagenpark/...` met Zod-validatie en `requireBevoegdheid("wagenpark", 1)`.

## 2026-07-13 — Governance & Approval Engine: escalatie-bewaking dashboard (prioriteit, deadline, doorklik, handmatige trigger, vervanger UI)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief; geen bestaande logica gewijzigd)

**Goedkeuringsdashboard — uitbreiding:**
- Twee nieuwe kolommen toegevoegd aan de aanvragentabel: **Prioriteit** (Kritiek/Hoog/Normaal, afgeleid van escalatiestatus) en **Deadline** (deadline_op uit beleidsregel, rood bij verlopen termijn).
- **Doorklik naar onderliggend document**: pijl-knop per rij navigeert direct naar het bijbehorende document (factuur, offerte, verlof, contract). Typen zonder directe detailpagina (inspectie, opleverrapport) tonen geen knop.
- **Bewaking uitvoeren**-knop (zichtbaar voor niveau-4): triggert de deterministische escalatie-/herinneringsbewaking direct via `POST /api/goedkeuring/bewaking/uitvoeren` — handig voor business scenario verificatie zonder op de uurlijkse run te wachten.

**Beleidsregelformulier — vervanger bij afwezigheid:**
- Dropdown `vervanger_gebruiker_id` toegevoegd aan het beleidsregel-dialoogvenster, direct na de goedkeurder-gebruiker. De bewaking gebruikt de vervanger als fallback als de aangewezen goedkeurder niet gevonden wordt.

**Backend:**
- `verwerkOpenAanvragen()` geëxporteerd uit `goedkeuringBewaking.ts` (was onbereikbaar).
- Nieuw endpoint `POST /goedkeuring/bewaking/uitvoeren` (niveau 4): roept `verwerkOpenAanvragen()` aan en retourneert het aantal verwerkte aanvragen + een Nederlandse toelichting.

**Typecheck:** api-server en firevault beide schoon.

## 2026-07-13 — Governance: facturatie & inkoop volledig geïntegreerd (afwijzing, export-gate, beleidsscherm-hints)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief op bestaande engine; geen schemawijziging)

**Afwijzing factuur → automatische terugplaatsing:**
- `OBJECT_DIRECTE_AFWIJZING` record toegevoegd in `goedkeuring-engine.ts` voor alle 4 financiële documenttypes (verkoop_factuur, inkoop_factuur, creditnota, prijsafwijking).
- Nieuwe `pasObjectStatusAfwijzenToe()` functie: zet the factuur na governance-afwijzing automatisch terug naar status `controle_nodig` zodat de indiener de afwijzingsreden in de GoedkeuringWidget ziet, the factuur kan herstellen en opnieuw ter goedkeuring indienen.
- Aangeroepen aan het einde van `afwijzen()` in de engine, vóór de return — na de e-mailnotificatie.

**AccountView-export governance-gate versterkt:**
- `POST /facturen/:id/export-accountview` controleert nu _expliciet_ op openstaande of vereiste governance-aanvragen. Geeft een duidelijke 422 terug ("Goedkeuring vereist voor AccountView-export") met onderscheid tussen: openstaande aanvraag loopt (wacht op uitkomst) vs. nog niet ingediend (verwijs naar detailpagina). Was al indirect geblokkeerd via `!geaccordeerd`, nu met heldere governance-boodschap inclusief `viaGoedkeuring: true`.

**Beleidsscherm-hints per documenttype:**
- Uitlegsteksten toegevoegd in `goedkeuringsbeleid.tsx` bij het selecteren van een documenttype in het beleidsregel-formulier:
  - `creditnota`: uitleg over lage drempel voor alle creditnota's vs. drempelwaarde voor grote creditbedragen.
  - `prijsafwijking`: uitleg dat bovengrens=0 altijd directeursgoedkeuring afdwingt.
  - `inkoop_factuur` / `verkoop_factuur`: toelichting dat goedkeuring automatisch akkord + klaar_voor_accountview zet; verwijzing naar apart creditnota/prijsafwijking-type.
  - `inkoopbon`: uitleg dat verzenden naar leverancier geblokkeerd blijft tot goedkeuring.

**Wat al gebouwd was (geen wijziging nodig):**
- Kernmotor compleet: `OBJECT_DIRECTE_ACTIE` (goedkeuring → klaar_voor_accountview + geaccordeerd), `OBJECT_WORKFLOW_ACTIE` (inkoopbon → goedgekeurd), GoedkeuringWidget op factuur-detailpagina and inkoopplanning-tab, `POST /facturen/:id/ter-goedkeuring-indienen`, accorderen-gate, inkoopbon-verzenden-gate, beleidsscherm met alle documenttypes.

---

## 2026-07-13 — Governance & Approval Engine: audit beleidswijzigingen, tijdlijn, offerte-koppeling + documenten

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief; geen bestaande endpoints gewijzigd)

**Audit logging beleidswijzigingen:**
- POST/PATCH/DELETE `/goedkeuring/beleidsregels` roepen nu `logAudit()` aan met `oudeWaarde`/`nieuweWaarde`, zodat elke beleidswijziging (aanmaken, aanpassen, verwijderen) volledig herleidbaar is in `audit_log` — inclusief wie de wijziging deed en wat de vorige beleidsversie was.

**Chronologische tijdlijn in GoedkeuringWidget:**
- De `GoedkeuringWidget` toont nu een inklapbare "Tijdlijn (N)"-sectie onder de statusbadge. Per stap: actie-icoon (Ingediend/Goedgekeurd/Afgewezen/Ingetrokken), naam goedkeurder, datum/tijd en reden bij afwijzing. De data was al aanwezig in de API-response (`stappen[]`), maar werd niet getoond; nu wel.

**Roadmap docs bijgewerkt:**
- `docs/roadmap/gebouwd.md`: Governance & Approval Engine sectie volledig herschreven; verwijdering van stale "nog niet gebouwd" (offertes) — de offerte-koppeling, e-mailnotificaties, escalatie-bewaking, tijdlijn en beleidswijzigingsaudit zijn wél gebouwd.

**Deliverables aangemaakt:**
- `docs/goedkeuring-impactanalyse.md` — architectuuroverzicht, state machine, impact per module (inkoopbon/offerte/bevoegdheden/audit), risico-inventarisatie (R01–R05 incl. vier-ogen-bypass en materiële wijziging), aanbevelingen voor toekomstige koppelingen.
- `docs/goedkeuring-bewijsvoering.md` — business scenario bewijsvoering: live DB-schema verificatie (4 tabellen, volledige kolommen), audit_log entries 219+220 als bewijs van inkoopbon end-to-end flow (10 juli 2026), code-trace offerte-koppeling, scenario beleidswijziging audit, DoD-checklijst.

## 2026-07-13 — Document Studio: Connect-integratie (templates in modules)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief; bestaande DocumentFrame-opmaak is fallback)

**Wat is er geverifieerd en afgerond (taak #620):**

Alle vijf stappen zijn aantoonbaar geïmplementeerd en typecheck-schoon:

1. **Template-resolver API** — `GET /studio/modellen/actief?werkgever_id=&document_type=` en bulk `GET /studio/werkgevers/:id/modellen/actief` bestaan in `studio.ts` en zijn gegenereerd in `api-client-react`.
2. **Shared hook** — `useActiefStudioModel(werkgeverId, documentType)` in `artifacts/firevault/src/hooks/use-actief-studio-model.ts`; gebruikt `useListActieveDocumentStudioModellen` (bulk, één call per werkgever), retourneert `null` bij geen actief model zodat modules veilig terugvallen.
3. **Offertes integratie** — `offertes/print.tsx` past logo-positie, primaire kleur en voettekst uit de goedgekeurde template toe; toont groene "Opmaak: Model 0" badge. Verzonden offertes pinnen het model via `offerte.studio_model_id` (model blijft vast ook na huisstijlwijziging).
4. **Opleverrapporten integratie** — `gebouwen/print.tsx` past `studioAccentKleur`, `studioVoettekst` en `studioLogoPositie` toe op het coverblad; toont dezelfde "Opmaak: Model 0" badge in de topbar.
5. **Studio-pagina gebruiksoverzicht** — `DOCUMENT_TYPE_MODULES`-mapping in `studio.tsx` toont per goedgekeurd template als badge-lijst welke modules het actief gebruiken ("Actief in: Offertes").

Typecheck: firevault en api-server beide schoon.

---

## 2026-07-13 — Proposal Studio: voltooiing kern (editor, AI, PDF, versiediff, sectielijst)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (puur additieve front-end uitbreiding op bestaande Fase 1-basis)

**Wat is gedaan:**
- `SECTIE_TYPEN` uitgebreid van 8 naar 25 typen: Cover, Over FPS, Aanleiding, Huidige situatie, Inspectievindingen, Aanbevolen oplossing, Technische toelichting, Gebruikte producten, Uitvoeringsmethode, Kwaliteitsborging, Certificaten, Garantie, Onderhoudsadvies, Optioneel werk, Prijsoverzicht, Bijlagen, Ondertekeningspagina (+ bestaande typen)
- `BIJLAGE_TYPEN` vervangen door 10 correcte categorieën uit het taakvereiste: ETA, DoP, Certificaat, Productblad, Foto, Inspectierapport, Tekening, Planning, Garantiedocument, Referentieproject, Overig
- **html2canvas-pro PDF export** toegevoegd: "PDF opslaan"-knop in de Controletab capturet de inline OffertePremiumPreview via `html2canvas-pro` (oklch-safe) en slaat op als genummerd PDF-bestand via `jsPDF` (meerdere pagina's)
- **Versiediff/vergelijk**: "Vergelijk"-knop op elk versiekaartje + "Vergelijk" knop in de versie-header opent een dialoog met side-by-side sectie-inhoud (rood=oud, groen=nieuw, gewijzigd gemarkeerd); valt terug op samenvatting-vergelijking als snapshot ontbreekt
- **"Studio openen"-knop** op elke offertekaart in de offertenlijst (naast de bestaande "Uit spots"-knop)
- Typecheck: alle 5 workspace-packages schoon

---

## 2026-07-13 — Document Studio: AI template-generatie & Model 0

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief, geen bestaande logica gewijzigd)

**Wat is er gebouwd (taak #619):**

Backend (`artifacts/api-server/src/routes/studio.ts`):
- `POST /studio/modellen/:id/genereer` — AI genereert een Connect-template JSON op basis van het referentiedocument (PDF-tekst via pdf-parse) en werkgever-branding (kleur, voettekst). Strikte Zod-schema-validatie op de AI-output; valt bij ongeldige JSON terug op 503.
- `POST /studio/modellen/:id/bijstuur` — verfijnt het bestaande concept-template via een vrije bijstuur-instructie. Overschrijft de huidige concept-JSON; geen versieboom in deze fase.
- `POST /studio/modellen/:id/goedkeuren` — zet status op `goedgekeurd`, archiveert het vorige actieve model in dezelfde transactie, registreert goedkeurder en tijdstip, schrijft activiteitslog. Race-beschermd via partial-unique-index (23505 → 409).

Frontend (`artifacts/firevault/src/components/documentopmaak/StudioTemplatePreview.tsx`):
- Zelfstandige A4-preview-component die de `connect_template_json` (familie A/B/C, koptekst, kleurschema, secties, voettekst) rendert via `DocumentFrame`. Defensieve normalisatie: ongeldige/ontbrekende velden worden stilzwijgend gevuld.

UI (`artifacts/firevault/src/pages/organisatie/studio.tsx`):
- Per documenttype-kaart: "Genereer met AI"-knop (of "Template verfijnen"/"Template bekijken" afhankelijk van status).
- Generatiedialoog: live preview links (StudioTemplatePreview), bijstuur-paneel rechts, bijstuur-geschiedenis, "Verfijnen"-knop, "Goedkeuren als Model 0"-knop met bevestigingsdialoog.
- Na goedkeuring: groene badge + goedkeuringsdatum op the documenttype-kaart, bibliotheekoverzicht updated.

OpenAPI + codegen: alle studio-endpoints gedefinieerd, hooks gegenereerd (`useGenereerStudioTemplate`, `useBijstuurStudioTemplate`, `useGoedkeurenStudioTemplate`).

Typecheck: volledig groen (alle packages).

---

## 2026-07-13 — FIE Fase 3: Continue jaarbedrijfsprognose + AI-observaties (verificatie & oplevering)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (geen schema-wijziging; additieve feature)

**Wat is opgeleverd (FIE Fase 3):**

De volledige continue jaarbedrijfsprognose is geimplementeerd en geverifieerd:

1. **Prognose-service** (`artifacts/api-server/src/services/fie-service.ts`):
   - `berekenJaarprognose(boekjaar)` berekent bevestigde omzet (100%), gewogen pipeline (concept 20%/verzonden 40%/bekeken 60%), OHW-restwaarde, AK-dekkingsgraad, break-even en kwartaalverdeling.
   - `leesPrognoseObservaties(boekjaar)` leest gepersisteerde observaties terug inclusief impact/advies/betrouwbaarheidsscore uit `OBSERVATIE_META`.

2. **AI-observaties engine** (ingebouwd in `berekenJaarprognose`):
   - 5 observatietypen: `omzet_risico`, `break_even_risico`, `ak_onderdekking`, `lege_pipeline`, `geen_begroting`.
   - Observaties worden bij elke prognose-aanroep gepersisteerd in `fie_observaties` (boekjaar, type, ernst, omschrijving, waarde, drempelwaarde, afwijking_pct).

3. **API routes** (`artifacts/api-server/src/routes/fie.ts`):
   - `GET /fie/prognose/:boekjaar` — berekent en retourneert volledige prognose + kwartaalverdeling + observaties.
   - `GET /fie/observaties/:boekjaar` — retourneert gepersisteerde observaties verrijkt met impact/advies/betrouwbaarheidsscore.
   - Beide routes beveiligd via `requireBevoegdheid("financieel", 2)`.

4. **OpenAPI spec + codegen** (`lib/api-spec/openapi.yaml`):
   - Schemas `FieJaarprognose`, `FiePrognoseObservatie`, `FieKwartaalPrognose`, `FieObservatiesResponse` volledig gedefinieerd.
   - Gegenereerde hooks `useGetFiePrognose` and `useGetFieObservaties` beschikbaar.

5. **Frontend** (`artifacts/firevault/src/pages/beheer/bedrijfskompas.tsx`):
   - `PrognoseTab` component (regel 580–827): 8 KPI-tiles, coverage-balk, kwartaalverdeling met begroting-overlay, observatielijst (live + historisch), toelichting.
   - Tab "Prognose" wired in `BegrotingDetail` als zesde tabblad (regel 928, 1158–1161).

6. **DB-schema** (`lib/db/src/schema/fie.ts`): `fieObservatiesTable` aanwezig en gepusht.

**Verificatie:**
- `pnpm run typecheck` — groen (0 fouten).
- DB-tabel `fie_observaties` bevestigd aanwezig met alle kolommen.
- Workflows API-server + firevault draaien.

---

## 2026-07-13 — Fix Docker-build-blokkade: conflict-markers verwijderd uit firevault-componenten

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (geen logica gewijzigd)

**Aanleiding:** GitHub Actions-deploy faalde tijdens `pnpm --filter @workspace/firevault run build` (exit code 1). Oorzaak: drie firevault-componenten op GitHub (`gebruiker-menu.tsx`, `nieuws-ticker.tsx`, `beheerder-layout.tsx`) bevatten letterlijke Git-conflict-markers die als eerder slechte merge waren gecommit. Vite/Rollup kon deze bestanden niet parsen.

**Herstelstap:**
1. Lokale workspace-versies (zonder conflict-markers) opgehaald en vergeleken met GitHub.
2. Commits uit GitHub-main die lokaal ontbraken gemerged in `/tmp-push-kloon`.
3. Drie gecorrigeerde bestanden via GitHub Contents API direct op `main` gepusht (aparte commit per bestand, sha's: `dac18dd2a942`, `b4398cf4316e`, `51a8f6476c5d`).
4. GitHub Actions triggert opnieuw; Docker-build gebruikt nu schone TSX-bronnen.

**Getroffen bestanden (alleen GitHub-zijde gecorrigeerd):**
- `artifacts/firevault/src/components/gebruiker-menu.tsx` (18 conflict-markers verwijderd)
- `artifacts/firevault/src/components/nieuws-ticker.tsx` (9 conflict-markers verwijderd)
- `artifacts/firevault/src/layouts/beheerder-layout.tsx` (3 conflict-markers verwijderd)

---

## 2026-07-13 — Functiehuis: bevoegdheidsprofielen gekoppeld aan Administratie- en Project-functies

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief DB-record + koppelingen; geen schema-wijziging)

**Aanleiding:** de 4 functies "Algemene Administratie" (FPS Bouw/Brandpreventie) en "Project Administratie" / "Project administratie" (FPS Bouw/Brandpreventie) hadden geen `profiel_id` gekoppeld. Bevoegdheden moesten daardoor altijd handmatig per persoon worden ingesteld.

**Wat is er gewijzigd (DB-operaties):**

- **Nieuw preset aangemaakt:** profiel "Administratie" (id=12, systeem=true) met bevoegdheden exact uit de PRESETS-definitie in `lib/permissies/src/index.ts`:
  - financieel: 4, goedkeuring: 3, declaraties: 4, rapportages: 3, dossiers: 3
  - personeel: 2, crm: 2, gebouwen: 2, onderhoud: 2, financieel_vertrouwelijk: 2, salarisarchief: 2
  - offertes: 1, planning: 1, inspecties: 1 (rest: 0)

- **Profielkoppelingen gelegd:**
  - "Algemene Administratie" (FPS Bouw, id=9) → Administratie (id=12)
  - "Algemene Administratie" (FPS Brandpreventie, id=11) → Administratie (id=12)
  - "Project administratie" (FPS Bouw, id=8) → Project-admin (id=3)
  - "Project Administratie" (FPS Brandpreventie, id=10) → Project-admin (id=3)

**Effect:** een nieuwe medewerker met aanstelling in een van deze 4 functies krijgt automatisch de bijbehorende bevoegdheden afgeleid — geen handmatige instelling meer nodig. Bestaande accounts zijn niet geraakt (tabel `medewerker_aanstellingen` had nog geen koppelingen met deze functies).

**Bewijs:** DB-verificatie — alle 4 functies tonen nu correct profiel + niveaus; geen medewerkers getroffen (lege medewerkers-kolom bevestigt puur forward-only impact).

## 2026-07-13 — CAO-keuze dialog: opties per CAO correct gemaakt (Metaal & Techniek vs. Bouw & Infra)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (alleen frontend, geen schema/API-wijziging)

**Aanleiding:** de CAO-keuze dialog toonde voor alle medewerkers dezelfde opties uit de CAO Bouw & Infra (Tijdspaarfonds-varianten), ongeacht welke CAO de medewerker daadwerkelijk valt. Jacqueline (FPS Bouw → CAO Metaal & Techniek) kreeg Bouw-opties te zien. De fondsnaam-placeholder luidde altijd "bijv. Bouw & Infra Spaarfonds" ook voor Metaal & Techniek.

**Wat is er gewijzigd (`artifacts/firevault/src/pages/personeel/detail.tsx`):**

- **Type-dropdown is nu CAO-afhankelijk:**
  - *Metaal & Techniek:* Vakantiegeld + PLB-budget (Persoonlijk Leefstijlbudget) — geen "Gereedschapsgeld" (niet van toepassing in M&T)
  - *Bouw & Infra:* Vakantiegeld + Gereedschapsgeld + Spaarfonds (ongewijzigd)
- **Keuze-opties per type zijn nu CAO-afhankelijk:**
  - *M&T Vakantiegeld:* Uitbetalen (standaard, in mei) / Omzetten in verlofuren / Storting aanvullend pensioen (PMT)
  - *M&T PLB-budget:* Uitbetalen in december / Extra verlofuren kopen / Bijdrage pensioen (PMT)
  - *Bouw Vakantiegeld:* 55% uitbetaald + 45% spaarfonds / 100% spaarfonds / 100% uitbetaald (ongewijzigd)
  - *Bouw Gereedschapsgeld:* Geldbedrag / Natura (ongewijzigd)
- **Fondsnaam-placeholder is CAO-afhankelijk:**
  - M&T: "bijv. PMT Pensioenfonds Metaal & Techniek"
  - Bouw: "bijv. Bouw & Infra Spaarfonds" (ongewijzigd)
- **Lege-staat hint** toont nu ook een toepasselijke tekst voor Metaal & Techniek
- **Weergave van bestaande keuzes:** keuzeLabel-map uitgebreid met M&T-waarden (uitbetalen / verlof_kopen / pensioen); "spaarfonds"-type wordt voor M&T weergegeven als "PLB-budget"
- Fondsnaam-veld verdwijnt bij M&T Vakantiegeld (niet relevant); blijft zichtbaar bij spaarfonds/PLB-budget en bij Bouw-vakantiegeld

**Werkmaatschappij → CAO mapping (ongewijzigd, ter referentie):**
- FPS Brandpreventie / FPS Bouw / FPS Onderhoud → Metaal & Techniek
- FPS Bouw & Renovatie → Bouw & Infra

**Bewijs:** typecheck firevault groen; geen backend/OpenAPI-wijzigingen nodig (keuze wordt als vrije tekst opgeslagen, type-enum ongewijzigd).

## 2026-07-13 — AI-kwaliteit structureel hersteld: classificatie-engine + productie-enablement

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (env-wijziging + verbeterde heuristiek; geen schema- of API-wijziging)

**Aanleiding:** gebruiker uploadde een arbeidscontract ("contract onbepaalde tijd.pdf") dat ten onrechte naar CRM werd geclassificeerd. Analyse wees uit dat dit geval symptomatisch is voor een bredere structurele oorzaak.

**Rootoorzaak (drieledig, bevestigd via productie-DB en SSH-onderzoek):**

1. **AI staat op productie volledig uit** (`CONNECT_AI_ENABLED=false` in `.env.production`). De echte Document Intelligence-AI heeft op productie nog nooit gedraaid; alle classificaties werden gedaan door de heuristische noodoplossing die alleen op trefwoorden in de bestandsnaam zoekt. De OpenAI-sleutel op the server is geldig en was ongebruikt.

2. **Vision-terugval werkt niet op productie**: bij gescande PDF's (nauwelijks leesbare tekst) zet de engine de eerste pagina om naar een afbeelding voor AI-beeldanalyse — maar `pdftoppm` (uit `poppler-utils`) ontbrak in het productie-Docker-image. Gescande documenten zijn op productie dus per definitie onleesbaar geweest.

3. **Heuristische volgorde fout**: het generieke woord "contract" matcht eerder dan "onbepaalde tijd" (personeelsdocument-kenmerk) omdat `personeelsdocument`-sleutelwoorden de bestandsnaam-fallback niet domineerden over het generieke `contract`-trefwoord.

**Wat is er gewijzigd:**

- **Productie: AI ingeschakeld** — `CONNECT_AI_ENABLED=true` in `/opt/fps-one/deploy/.env.production`; API-container direct herstart. AI-voorstel rollen & rechten werkt hierdoor ook direct weer.
- `artifacts/api-server/Dockerfile` — `poppler-utils` toegevoegd aan het finale image-stage: gescande PDF's kunnen nu via AI-vision worden geanalyseerd.
- `artifacts/api-server/src/lib/documentIntelligence.ts` — drie verbeteringen in de heuristische noodoplossing (actief wanneer AI onbereikbaar is):
  - `personeelsdocument` staat nu bewust **vóór** `contract` in de sleutelwoordtabel; nieuwe arbeidscontract-signalen toegevoegd: "onbepaalde tijd", "bepaalde tijd", "proeftijd", "arbeidsvoorwaarden", "dienstverband", "salaris", "functieomschrijving".
  - Het generieke woord "contract" is verwijderd uit de contract-categorie (alleen "overeenkomst" en "sla " blijven); hierdoor wint "arbeidscontract" → HRM altijd van "contract" → CRM.
  - Drempel voor "heeft bruikbare tekst" verlaagd van 80 naar 20 tekens: zelfs een korte koptekst of stempel helpt al bij de classificatie.
  - Foutmelding bij lage betrouwbaarheid is nu neutraal ("controleer de bestemming voor opslaan") in plaats van stellig.

**Bewijs:**
- `CONNECT_AI_ENABLED=true` bevestigd via `docker exec deploy-api-1 sh -c 'echo [$CONNECT_AI_ENABLED]'` → `[true]`
- AI-voorstel Rollen & Rechten (screenshot gebruiker) werkt na herstart
- Heuristische volgorde: `heuristischClassificeerInhoud("contract onbepaalde tijd.pdf", ...)` matcht nu op "onbepaalde tijd" → `personeelsdocument` → HRM (was: "contract" → CRM)
- Typecheck api-server groen

## 2026-07-13 — Jaarrekeningen: metadatacorrectie met cascade naar meerjarenoverzicht + jaargroepering

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief; geen schema- of OpenAPI-wijziging, contract ondersteunde de velden al)

**Aanleiding:** gebruikersmelding uit productie: een jaarrekening 2023 ("FPS 2023 Geconsolideeerd-def.pdf") stond als "Enkelvoudig" geclassificeerd en de data leek niet bruikbaar voor het meerjarenoverzicht — "een jaarrekening van 2023 moet geplaatst worden bij 2023".

**Rootoorzaak (drieledig):**
- Het document is destijds geüpload vóór het typo-tolerante "geconsolideerd"-vangnet (dat herkent "Geconsolideeerd" met tikfout inmiddels wel); de foute classificatie bleef staan.
- De pagina Jaarrekeningen bood géén mogelijkheid om boekjaar/entiteit/soort te corrigeren — de PATCH-API ondersteunde die velden al, maar de UI niet.
- De PATCH-route cascadeerde metadata-wijzigingen niet naar de gedenormaliseerde kerncijfers (entiteit/boekjaar/geconsolideerd), terwijl het meerjarenoverzicht precies die kolommen leest. Een correctie zou het overzicht dus nooit bereiken.

**Wat is er gewijzigd:**
- `artifacts/api-server/src/routes/financieel-jaarrekeningen.ts`: PATCH cascadeert wijzigingen in entiteit/boekjaar/subtype nu naar álle kerncijfers van het document (incl. auditlogregel "Kerncijfers meegetrokken naar …").
- `artifacts/firevault/src/pages/financieel/jaarrekeningen/index.tsx`: nieuwe knop "Gegevens corrigeren" in het detailpaneel (boekjaar/entiteit/soort jaarrekening, met validatie 1990–2100); documentenlijst nu gegroepeerd per boekjaar (recentste bovenaan, "Boekjaar onbekend" onderaan).
- `artifacts/firevault/src/pages/financieel/meerjarenoverzicht/index.tsx`: lege-staat legt nu uit dat de schakelaar "Geconsolideerd" bepaalt welke jaarrekeningen meetellen.
- `scripts/src/verificatie-jaarrekening-cascade.ts`: nieuw herbruikbaar verificatiescript dat het volledige businessscenario end-to-end bewijst.
- **Na architect-review aangescherpt:** alle schrijfacties van de PATCH (documentupdate, dataset-statuscascade, metadatacascade, auditlog) zitten nu in één databasetransactie — een fout halverwege kan de gedenormaliseerde kerncijferkolommen niet meer van het document laten afwijken. Ook wordt de opslaglocatie nu correct herberekend wanneer het boekjaar wordt leeggemaakt (was: bleef op het oude jaar staan).
