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
