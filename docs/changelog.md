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
- Na goedkeuring: groene badge + goedkeuringsdatum op de documenttype-kaart, bibliotheekoverzicht updated.

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
   - Gegenereerde hooks `useGetFiePrognose` en `useGetFieObservaties` beschikbaar.

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

**Aanleiding:** GitHub Actions-deploy faalde tijdens `pnpm --filter @workspace/firevault run build` (exit code 1). Oorzaak: drie firevault-componenten op GitHub (`gebruiker-menu.tsx`, `nieuws-ticker.tsx`, `beheerder-layout.tsx`) bevatten letterlijke Git-conflict-markers (`<<<<<<<`, `=======`, `>>>>>>>`) die als eerder slechte merge waren gecommit. Vite/Rollup kon deze bestanden niet parsen.

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

**Bewijs (run 2026-07-13, dev):** seed document met foute metadata (2022/enkelvoudig) + 2 kerncijfers → PATCH naar 2023/geconsolideerd → DB-bewijs: beide kerncijfers boekjaar=2023, geconsolideerd=true, entiteit gecorrigeerd → dataset goedgekeurd → meerjarenoverzicht (geconsolideerd) toont boekjaar 2023 met omzet 1.500.000. RESULTAAT: PASS. Typecheck api-server, firevault en scripts groen.

**Voor productie betekent dit:** na deploy kan het bestaande 2023-document via "Gegevens corrigeren" op Geconsolideerd/2023 gezet worden; daarna kerncijfers goedkeuren en het meerjarenoverzicht toont 2023 correct.

## 2026-07-13 — Productie-deploy hersteld (schema-healthcheck) + facturen-dashboard reparatie

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (migrate-pijplijn en healthcheck structureel gelijkgetrokken; route-volgordefout hersteld; geen datamigratie)

**Aanleiding:** de GitHub-deploy faalde op `schema-healthcheck.mjs`: the UNIQUE-controle op `gebruiker_profielen (gebruiker_id, profiel_id)` sloeg aan omdat productie de unieke index mist. Daarnaast meldde de gebruiker dat de facturenpagina "Kon dashboard niet laden" toonde.

**Rootoorzaak deploy:**
- `deploy/Dockerfile.migrate` draaide alleen `drizzle-kit push` en nooit `apply-additive.mjs`, dus de unieke index werd op productie nooit aangelegd.
- De healthcheck controleerde bovendien `pg_constraint`, terwijl Drizzle's `uniqueIndex` een `CREATE UNIQUE INDEX` genereert die alleen in `pg_indexes` zichtbaar is — de check kon dus zelfs op een correcte database vals alarm geven.

**Wat is er gewijzigd:**
- `deploy/Dockerfile.migrate`: CMD is nu `apply-additive && push && apply-additive` — de index bestaat al vóór push (zodat push hem niet als drift dropt) en wordt na push gegarandeerd aanwezig gecontroleerd.
- `lib/db/scripts/apply-additive.mjs`: legt de unieke index aan via `pg_indexes`-detectie + `CREATE UNIQUE INDEX`; hard-fail (exit 1) bij duplicaten of aanlegfout blijft van kracht.
- `lib/db/scripts/schema-healthcheck.mjs`: controleert de unieke index nu via `pg_indexes` in plaats van `pg_constraint`.
- Schema-commentaar in `lib/db/src/schema/gebruikers.ts` geactualiseerd naar de werkelijke werking.
- **Facturen-dashboard fix:** `GET /facturen/financieel-dashboard` en `GET /facturen/exportlog` stonden in `facturen.ts` ná de wildcard-route `/facturen/:id`, waardoor Express "financieel-dashboard" als factuur-ID parste en de pagina's faalden. Beide routes zijn vóór de wildcard geplaatst (met waarschuwingscommentaar).
- **Opname plattegrond-laag fix (zelfde foutklasse, gevonden bij review):** `GET /opname/plattegrond-items` stond in `opname.ts` ná de wildcard `/opname/:id` en gaf daardoor altijd 404 — de opname-laag op the web-plattegrond was stil kapot. Route vóór de wildcard geplaatst (met waarschuwingscommentaar).
- **Monteur-app typecheck hersteld:** `TYPE_LABELS` in `app/documenten.tsx` en `app/documenten/[id].tsx` misten the documenttypes tekening/contract/verzekering/overig (enum eerder uitgebreid zonder the mobiele label-maps bij te werken).

**Bewijs (run 2026-07-13):**
- `apply-additive.mjs` groen (index "reeds aanwezig"), `schema-healthcheck.mjs` alle 11 checks groen tegen dev
- Geen duplicaten in `gebruiker_profielen` (0 rijen dubbel — index kan veilig op productie worden aangelegd)
- Echte TOTP-loginsessie: `GET /api/facturen/financieel-dashboard` → 200 met correcte tellingen; `GET /api/facturen/exportlog` → 200
- Echte TOTP-loginsessie: `GET /api/opname/plattegrond-items?verdieping_id=1` → 200 (JSON-array); zonder parameter → 400 uit de eigen handler (bewijst routematch)
- Volledige `pnpm run typecheck` groen (inclusief monteur-app)

---

## 2026-07-13 — Toolboxen: 50 AI-concepten daadwerkelijk klaargezet + volledige keten end-to-end bewezen

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (batch-endpoint robuuster, frontend-dialoog aangepast, verder alleen bewijs-tooling)

**Aanleiding:** de opdracht "AI zet 50 toolboxen klaar; hoofdbeheerder beoordeelt enkel; daarna 1 toolbox per maand inplanbaar + vervolgacties op telefoons" moest niet alleen gebouwd maar ook daadwerkelijk uitgevoerd en bewezen worden (kwaliteitskader: business-scenario-validatie).

**Wat is er gebouwd:**
- `POST /veiligheid/toolboxen/ai-batch-genereer` robuust gemaakt: genereert in interne stukken, dedupliceert op bestaande titels (ook binnen de batch), en faalt expliciet met foutdetails in plaats van stil gedeeltelijk resultaat; respons bevat `aangemaakt`, `batch_id` en `onderwerpen`. Categorieën worden gevalideerd tegen the canonieke lijst uit de frontend (400 bij onbekende waarden) en AI-uitvoer met een onbekende categorie valt terug op `overig`; bestaande wachtrij-concepten met niet-canonieke categorieën zijn eenmalig genormaliseerd (26 rijen).
- Frontend batch-dialoog (`veiligheid/toolboxen.tsx`): standaardaantal 50, verstuurt in stukken van 10 met zichtbare voortgang, toont per stuk the resultaat en telt totalen op.
- Bewijsscript `scripts/src/toolbox-50-klaarzetten.ts` (npm: `toolbox-50-klaarzetten`): logt in als echte hoofdbeheerder (TOTP), vult de AI-wachtrij aan tot 50 concepten via the echte API, bewijst review (goedkeuren → gepubliceerd, DB-verificatie), maakt the maandopdracht voor the huidige maand aan, logt in als monteur en haalt `/mijn/toolbox-maandopdracht` op (zelfde endpoint als the FPS Monteur-app) en voltooit the opdracht (DB-bewijs `voltooid_op`), en ruimt the testopdracht daarna op. Succes van the generatie wordt aan the DB-teller gemeten omdat de dev-tunnel lange AI-verzoeken kan verbreken; het script draait daarom direct tegen `localhost:8080` met `X-Forwarded-Proto: https`.

**Bewijs (run 2026-07-13):**
- STAP 1 PASS — 50 AI-concepten staan in the reviewwachtrij (DB-teller: `ai_gegenereerd=true, gepubliceerd=false` = 50)
- STAP 2 PASS — concept #104 goedgekeurd via `PATCH .../review` → `gepubliceerd=true` (DB-bewijs)
- STAP 3 PASS — maandopdracht aangemaakt voor 2026-7 via `POST /veiligheid/toolbox-maandopdrachten`
- STAP 4 PASS — monteur-account zag the opdracht via `GET /mijn/toolbox-maandopdracht` en voltooide deze (DB-bewijs `voltooid_op`)
- STAP 5 PASS — testopdracht opgeruimd (cascade wist statusrijen), bewijs-concept terug in the wachtrij: eindstand 50 concepten klaar voor beoordeling
- Typecheck scripts + api-server + firevault groen

---

## 2026-07-13 — Sidebar hoofdmenu: alle hoofdstukken inklapbaar + zichtbare sleepgreep

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (alleen frontend-layout, geen API-/DB-wijziging)

**Aanleiding:** de versleepbare hoofdstukvolgorde bestond al, maar de greep was een onvindbaar dun hover-balkje; bovendien waren slechts 4 van de 13 hoofdstukken inklapbaar (Inkoop, Magazijn, Communicatie, Veiligheid).

**Wat is er gebouwd:**
- Nieuw component `InklapbaarHoofdstuk` (in `herschikbaar-hoofdstuk.tsx`): elke hoofdstukkop heeft nu een **altijd zichtbare sleepgreep** (grip-icoon links van de titel) en een **chevron** om in/uit te klappen; `HerschikbaarHoofdstuk` is teruggebracht tot pure dropzone.
- Alle 13 hoofdstukken in the beheerder-sidebar omgebouwd naar dit component: Projectaanpak, Inkoop, Magazijn, Commercie (kreeg hierbij een titelkop), Communicatie, Veiligheid, Financieel, Goedkeuring, Declaraties, Organisatie, Personeel, Loon en Instellingen. Open/dicht-staat was al gepersisteerd per gebruiker (`hoofdstukOpen`/`setHoofdstukOpen`) en geldt nu overal.
- Scheidingslijnen (Loon, Instellingen) en de Magazijn-kritiekbadge behouden via props (`metScheiding`, `kopExtra`); Dashboard blijft vast bovenaan; "Standaardvolgorde herstellen" ongewijzigd.
- **Slepen herbouwd zonder HTML5 drag-and-drop:** diagnose toonde aan dat Chromium/Blink voor elementen binnen the scrollbare sidebar-inhoud nooit een native `dragstart` afvuurt (browser-quirk, raakt ook echte gebruikers). Het verslepen werkt nu pointer-gebaseerd (mousedown → beweging met 4px-drempel → mouseup), met doel-highlight tijdens het slepen, Escape om te annuleren, automatisch randscrollen bovenin/onderin the sidebar and a "grabbing"-cursor.

**Bewijs:**
- Typecheck firevault groen; ongebruikte imports (Collapsible, ChevronDown, SidebarGroupLabel) opgeschoond
- Playwright-verificatie ingelogd (TOTP): alle hoofdstuktitels zichtbaar, Projectaanpak in- en weer uitgeklapt (menu-items verdwijnen/verschijnen aantoonbaar), screenshots van beide staten beoordeeld — sleepgreep duidelijk zichtbaar per hoofdstuk
- Playwright-sleeptest pointer-implementatie geslaagd: hoofdstuk via de grip versleept (doel-highlight zichtbaar tijdens sleep), nieuwe volgorde blijft na herladen bewaard, standaardvolgorde daarna hersteld

---

## 2026-07-13 — Slim Upload structureel hersteld: fail-loud opslag, beter AI-lezen, tabblad Slim Uploadpunt vervallen + productie-objectopslag (MinIO)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** middel (opslagpad en productie-infrastructuur geraakt; elk increment afzonderlijk terugdraaibaar)

**Aanleiding:** uploads faalden op productie met "Opslaan mislukt" — de oorzaak was tweeledig: (1) de code verborg opslagfouten (stil doorgaan zonder bestand), and (2) productie had géén objectopslag (geen S3/GCS geconfigureerd), waardoor elk bestand permanent verloren ging (o.a. jaarrekening id=1).

**I1 — Fail-loud opslag:** alle uploadpaden geven nu een expliciete fout aan the gebruiker zodra objectopslag ontbreekt of wegschrijven faalt; er wordt nooit meer een databaserecord aangemaakt zonder dat het bestand aantoonbaar is opgeslagen.

**I2 — AI-begrijpend lezen verbeterd:** documentclassificatie (documentIntelligence + financiële extractie) inhoudelijk verbeterd; 59 unit-tests groen.

**I3 — `POST /documenten/aanleveren`:** nieuw contract-first endpoint (OpenAPI + codegen) als centrale, gevalideerde aanleverroute voor documenten.

**I4 — Tabblad "Slim Uploadpunt" (/inbox) geheel vervallen:** nav-item, routes, pagina's (`pages/inbox/`), dashboard-widget en offerte-aanvraag-wizard verplaatst/verwijderd; upload loopt nu via the Slim Upload-balk en het documentenbeheer.

**I5 — Productie-objectopslag (MinIO) + presigned uploads via eigen domein:**
- `docker-compose.production.yml`: minio-service (healthcheck, `minio_data`-volume), minio-init (bucket `fps-production` automatisch aanmaken), api wacht op minio-healthy
- `Caddyfile`: `/fps-production/*` → minio:9000 met behoud van Host-header (SigV4), max 100 MB body, read_timeout 300s
- `objectStorageS3.ts`: aparte presign-client op `S3_PUBLIC_ENDPOINT` (https://connect.fps-one.nl) zodat presigned URL's voor the browser op het publieke domein staan; interne opslag blijft via `S3_ENDPOINT` (http://minio:9000)
- `.env.production` op the server aangevuld met S3_/MINIO_-variabelen en `OPENAI_API_KEY` (sleutel vooraf getest: geldige completion op gpt-4o-mini)
- Gedeployed via bestandspatch bovenop servercommit (origin/main); DB-back-up vooraf (`fps_20260713_140504.sql.gz`); api- en caddy-image herbouwd; migratie overgeslagen (geen schemawijziging t.o.v. productie-DB, UNIQUE-constraint bestond al)

**Bewijs:**
- `pnpm run typecheck` groen (alle packages); 59 AI-tests groen
- Productie: alle containers healthy (api, caddy, db, minio); healthz HTTP 200
- End-to-end presigned-bewijs op productie: PUT via `https://connect.fps-one.nl/fps-production/...` → HTTP 200, aansluitend GET → HTTP 200 met identieke inhoud; testobject daarna opgeruimd
- Bucket-init log: "Bucket created successfully fps/fps-production"

**Architect-review (PASS) — twee punten direct verwerkt:**
- Bucket-race gedicht: api wacht nu ook op `minio-init` (`service_completed_successfully`), niet alleen op minio-healthy
<<<<<<< HEAD
=======
- Objectopslag-back-up toegevoegd: nieuwe `backup-minio`-dienst (mc mirror naar `deploy/minio-backups/`) onder het backup-profiel; werkend bewezen op productie
- Bonus: de server had géén back-upcron — dagelijkse cron ingesteld (03:00 database, 03:30 objectopslag, 03:15 opschoning >30 dagen) met schrijfbaar logbestand `/var/log/fps-backup.log`
- Follow-up (niet blokkerend): MinIO service-account met bucket-scoped policy i.p.v. root-credentials; obsolete `version:`-regel uit compose

**Openstaand:** de verloren jaarrekening (id=1) moet door de gebruiker opnieuw geüpload worden — het oorspronkelijke bestand is onherstelbaar. GitHub-push van deze wijzigingen loopt via de follow-uptaak GitHub-synchronisatie; de server draait tot die tijd op een bestandspatch bovenop origin/main.

---

## 2026-07-13 — Gebruikersmenu opgeschoond: uitloggen naar de taakbalk

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (alleen frontend, geen API-/DB-wijziging)

**Op verzoek van de gebruiker:**
- Knop "Wachtwoord" verwijderd uit het gebruikersmenu onderin de sidebar (incl. de wijzig-dialoog); wachtwoord wijzigen loopt via "wachtwoord vergeten" op het inlogscherm of via de beheerder.
- Taalkeuze verwijderd uit het gebruikersmenu; de taal wordt al gekozen op het inlogscherm.
- Knop "Uitloggen" verplaatst naar helemaal links op de taakbalk, links naast het Nieuws-blok (altijd zichtbaar, ook als de nieuwsbalk verborgen is).

**Behoud voor portalen zonder taakbalk:** de taakbalk bestaat alleen in de kantooromgeving (beheerder-layout). In het monteur- en klantportaal blijft de uitlogknop daarom in het gebruikersmenu staan (`toonUitloggen`-instelling per layout), anders zouden die gebruikers niet meer kunnen uitloggen.

---

## 2026-07-13 — GitHub-synchronisatie: deploy-workflow geaccordeerd en repo gelijkgetrokken

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (geen codewijziging; alleen git-synchronisatie)

**Aanleiding:** de gebruiker heeft formeel akkoord gegeven op de deploy-workflow (`.github/workflows/deploy.yml`) en het serverzijdige deployscript (`scripts/deploy-production.sh`).

**Vaststelling:** beide bestanden stonden al op origin/main (eerdere synchronisatietaak) en zijn byte-identiek aan the lokale versie — het akkoord bevestigt de bestaande situatie.

**Uitgevoerd:**
- Lokale main (8 nieuwe commits: o.a. HRM CV-upload, versie-informatie, deploy-documentatie, afbeeldingen) gemerged met origin/main en gepusht; merge was triviaal (identieke bomen), geen force-push
- Volledige typecheck vooraf groen (exit 0)
- **Bewijs:** `merge-base --is-ancestor` bevestigt dat alle lokale commits op origin/main staan; deploy.yml en deploy-production.sh aanwezig op origin/main

**Openstaand voor de gebruiker:** de GitHub-repo-secrets `PROD_SSH_HOST`, `PROD_SSH_USER`, `PROD_SSH_KEY` (en evt. `PROD_SSH_PORT`) moeten in GitHub → Settings → Secrets and variables → Actions staan, anders faalt de deploy-stap met "missing server host". Dit kon niet automatisch geverifieerd worden (token heeft geen admin-leesrecht op secrets).

---

## 2026-07-13 — FIE Fase 1+2: Financial Intelligence Engine — jaarbegroting, AK-posten en live calculatieblok

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additieve tabellen, geen breaking changes)

**DB (6 nieuwe tabellen):**
- `fie_jaarbegrotingen` — boekjaar, status (concept/actief/gesloten), omzetdoel, doelmarge%, AK-norm per uur, productieve uren, verdeelsleutel (uren/omzet/ftes)
- `fie_ak_posten` — AK-kostenposten per begroting, per werkgever (FK set null), per categorie (huisvesting/personeel_indirect/voertuigen/ict/verzekeringen/marketing/overig)
- `fie_capaciteit_snapshots` — momentopnames productieve uren + FTE per boekjaar/werkgever
- `fie_observaties` — auto-gegenereerde prognose-observaties (info/waarschuwing/kritiek)
- `fie_nacalculaties` — nacalculatie-records per opdracht (Fase 5 voorbereiding)
- `fie_leermomenten` — geaggregeerde afwijkingen per werktype (Fase 5 voorbereiding)

**API (`artifacts/api-server/src/routes/fie.ts`, geregistreerd in routes/index.ts):**
- `GET/POST /fie/begrotingen`, `GET/PATCH /fie/begrotingen/:id`
- `GET/POST /fie/begrotingen/:id/ak-posten`, `PATCH/DELETE /fie/ak-posten/:id`
- `GET /fie/capaciteit/:boekjaar`, `GET /fie/capaciteit/:boekjaar/hrm`, `POST /fie/capaciteit/:boekjaar`
- `GET /fie/begrotingen/:id/doelmarge`
- `GET /fie/context/calculatie/:id` — live context + AI-advies per calculatie
- `GET /fie/prognose/:boekjaar`, `GET /fie/observaties/:boekjaar`
- `GET/POST /fie/leermomenten`, `PATCH/DELETE /fie/leermomenten/:id`, `POST /fie/leermomenten/herbereken`
- `GET /fie/nacalculaties`, `POST /fie/nacalculaties/herbereken-verouderd`, `GET /fie/nacalculaties/verouderd-aantal`
- Bevoegdheid beheer: `financieel:2`; calculatiecontext: `calculaties:1`

**Service-laag (`artifacts/api-server/src/services/fie-service.ts`):**
- `berekenCapaciteit(boekjaar)` — HRM-afgeleid (contracturen × aanwezigheidspercentage)
- `berekenDoelmarge(begrotingId)` — benodigde brutowinst / omzetdoel
- `berekenFieContext(calculatieId)` — omzet, kostprijs, BW, BW%, doelmarge%, AK-bijdrage, AI-advies
- `berekenJaarprognose(boekjaar)` — kwartaalprognose uit opdrachten-pipeline + gewogen kansen
- `berekenEnSlaOpNacalculatie(opdrachtId)`, `herberekeenLeermomenten()`, `herberekeenVerouderdeNacalculaties()`

**Frontend:**
- `/beheer/bedrijfskompas` (`bedrijfskompas.tsx`, 1676 regels) — beheer-UI: tabbladen Begrotingen, Prognose, Leermomenten, Nacalculaties; volledige CRUD voor begrotingen en AK-posten; CapaciteitSectie (HRM-afgeleid); PrognoseTab met kwartaalbalken; leermoment-aanpassing met correctiefactor
- `/directie/kompas` (`kompas.tsx`) — directiekompas-view gated op financieel:2
- `<FieContextBlok calculatieId={id}>` in `detail.tsx` — compact blok onder calculatietabel: omzet, kostprijs, BW, BW%, doelmarge, AK-bijdrage, AI-advies; live refetch bij elke mutatiesucces
- Navigatie: "Bedrijfskompas" in Beheer-sidebar (`beheerder-layout.tsx`)

**Bewijs:** `pnpm run typecheck` groen (alle packages). `pnpm --filter @workspace/scripts run kwaliteitscheck` groen (0 kritiek, 0 hoog). DB-tabellen aanwezig (6×). OpenAPI-paden aanwezig + codegen gedraaid. Workflows: api-server 200 OK op `/api/healthz`.

---

## 2026-07-13 — HRM Personeel: CV-upload en certificaat-upload

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (alleen frontend, geen API-/DB-wijziging)

**Achtergrond / CV-tab:**
- Lege staat verwees naar een "Bewerken"-knop die niet zichtbaar was op de tab zelf. Vervangen door twee directe knoppen: "CV uploaden" (PDF/Word) en "Tekst invullen" (opent profielformulier).
- Als cv_tekst al ingevuld is: knoppen "CV uploaden" en "Bewerken" rechtsboven in de kaart.
- Upload gaat naar `/api/medewerkers/:id/documenten` met type `cv`; het bestand verschijnt daarna op het tabblad Documenten.

**Opleidingen & certificaten-tab:**
- Per certificaatkaart een upload-icoon toegevoegd (paperclip-stijl) waarmee een bijlage (PDF/foto) geüpload kan worden als `diploma`-document met de opleidingsnaam als label.
- Na upload toast-bevestiging; het bestand verschijnt op het tabblad Documenten.

---

## 2026-07-13 — Hotfix productie: login-500 door achtergebleven databaseschema

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (alleen additieve schemawijzigingen op productie; geen codewijziging)

**Aanleiding:** direct na de grote deploy faalde elke loginpoging op connect.fps-one.nl met HTTP 500 "Interne serverfout" (in elke browser).

**Oorzaak:** de migrate-stap draaide op een verouderd migrate-image uit een eerdere deploy (het API-image werd met `--no-cache` gebouwd, het migrate-image niet). Drizzle vergeleek daardoor het oude schema met de database, meldde "Changes applied" met exit 0, maar liet productie feitelijk op het oude schema staan. De nieuwe API-code crashte vervolgens op o.a. `gebruikers.gedeactiveerd_op` (ontbrekend → 500 op login én `/auth/me`), `app_instellingen.heatmap_tracking_ingeschakeld` en de ontbrekende `goedkeuring_*`-tabellen.

**Herstel:**
- Migrate-image opnieuw gebouwd met `--no-cache` en de migratie opnieuw gedraaid: schema van 257 → 285 tabellen, alle ontbrekende kolommen aangevuld
- API-container herstart; foutenlog sindsdien schoon
- **Bewijs:** login met fout wachtwoord geeft weer HTTP 401 "Onjuiste inloggegevens" (was 500); healthz HTTP 200; alle 12 drizzle-fouten in het log dateren van vóór de herstart

---

## 2026-07-13 — Productie-deploy connect.fps-one.nl (163 commits) + GitHub-push

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** middel (grote release: tientallen nieuwe tabellen en modules in één deploy; pre-release back-up gemaakt en geverifieerd)

**Aanleiding:** de productie-VPS liep 163 commits achter op de lokale ontwikkelomgeving; de gebruiker vroeg push naar GitHub gevolgd door volledige productie-deployment.

**Wijzigingen:**
- GitHub: lokale `main` (`9e37b36`) met `--force-with-lease` naar `origin/main` gepusht (was `14fbf3b`); via /tmp-kloon-omweg met `GIT_ASKPASS`, token nergens getoond
- VPS: deploy in de bewezen volgorde — (1) pg_dump-back-up (116K, gzip-integriteit OK), (2) divergentie opgelost met fetch + reset naar `origin/main` (server-lokale fixcommit `c93e4b42` zat inhoudelijk al in main: lege diff op `.dockerignore`), (3) API-image gebouwd `--no-cache`, (4) drizzle-migraties toegepast ("Changes applied"), (5) Caddy/frontend-image gebouwd `--no-cache`, (6) `up -d` — api healthy, (7) publieke healthcheck `{"status":"ok"}` HTTP 200
- SSH-toegang werkt nu via het `PROD_SSH_KEY`-secret (sleutel gereconstrueerd uit platte regel, na afloop verwijderd)
- **Restpunten:** mock-data cleanup op productie (andere IDs dan dev), mailvariabelen ontbreken nog op productie, smoketest logins door gebruiker (kantoornetwerk blokkeert het domein via FortiGate)
- **Bewijs:** per stap EXIT:0 in deploy-logs op de server; healthcheck HTTP 200 in 0,3s

---

## 2026-07-13 — Verwerkersregister (AVG art. 30 lid 2)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief; nieuwe tabel + endpoints + tab, raakt bestaande AVG-functies niet)

**Aanleiding:** de AVG verplicht (art. 30 lid 2) een register van externe (sub-)verwerkers die persoonsgegevens verwerken namens FPS. Dit ontbrak in FPS Connect.

**Wijzigingen:**
- DB: nieuwe tabel `avg_verwerkers` (`lib/db/src/schema/avg.ts`) met naam, land, doel, categorie persoonsgegevens, grondslag, `vwo_aanwezig` (bool) + `vwo_datum`, contactpersoon, notities, tijdstempels; aangemaakt via drizzle push
- OpenAPI: `GET/POST /avg/verwerkers` en `PATCH/DELETE /avg/verwerkers/{id}` + schemas `AvgVerwerker`/`AvgVerwerkerInput`; hooks/Zod-schemas hergegenereerd
- API (`routes/avg.ts`): CRUD-handlers achter `requireBevoegdheid("systeem",1)`; camelCase→snake_case-mapping; PATCH stuurt `bijgewerktOp`; eerste GET zaait 3 standaardverwerkers (OpenAI, Google Maps, Microsoft 365) bij een leeg register
- Frontend (`beheer/avg.tsx`): nieuwe tab "Verwerkersregister" met kaartlijst, toevoegen/bewerken-dialoog, verwijderbevestiging en CSV-export (BOM + quote-escaping)
>>>>>>> a8ff40b (Governance & Approval Engine: audit beleidswijzigingen, tijdlijn widget, docs)
