## 2026-08-17 — RECHTEN_BOEKHOUDER_01: leesrecht financieel voor de externe boekhouder

- Profiel "Externe boekhouder" (lib/permissies) uitgebreid met leesrecht niveau 1 op financieel en financieel_vertrouwelijk; salarisarchief/salaris_mutaties/boekhouder_portaal ongewijzigd, projecten/offertes/opdrachten blijven dicht.
- Migratie 0074 werkt het systeemprofiel én bestaande accounts met herkomst_profiel_id bij (GREATEST-merge: nooit verlagen, idempotent).
- Route-audit financieel/financieel_vertrouwelijk niveau 1: muterende/exporterende routes opgetild naar niveau 2 (facturen upload-url, POST /facturen, PATCH /facturen/:id, ai-uitlezen, ter-goedkeuring-indienen, historisch-archief Excel-export). Bewuste uitzonderingen op niveau 1: bevestig-inkoop (persoonsgebonden via inkoperId), beoordelen-medewerker (nu ook persoonsgebonden via nieuwe beoordelaarId-guard) en factuur-opmerkingen (dialoog van die flow).

## 2026-08-17 — HERSTEL_MAIL_01: deploy-blokkade, onbestelbare adressen, prod-guard, rijkere faalmail

- **Punt 1 — deploy-blokkade & scanner-paden.** Virus-/YARA-scannerpaden zijn nu env-overschrijfbaar (YARA_RULES_PAD, CLAMAV_BIN, quarantainemap) en `controleerScannerPaden()` logt bij het opstarten luid welke paden ontbreken, inclusief de env-var om ze te zetten. De absolute-pad-import die de deploy brak was al gefixt; de eerstvolgende groene deploy-run is het bewijs.
- **Punt 2 — onbestelbare mailadressen zichtbaar en afhandelbaar.** Contactpersonen dragen `mail_onbestelbaar_op/_reden` in de API; nieuw endpoint `GET /crm/onbestelbaar` (werklijst met organisatienaam). Nieuwe pagina CRM → "Onbestelbare adressen": nieuw adres invullen (wist de status server-side bij adreswijziging) of contact afvoeren. Klantdetail toont een rood label bij gekaatste adressen. Bewijs: `scripts/src/bewijs-onbestelbaar-ui.ts` — 10/10 groen.
- **Punt 3 — bewijsscripts kunnen nooit meer per ongeluk tegen productie draaien.** Nieuwe guard `scripts/src/lib/prodGuard.ts` (hard stoppen zodra het doel naar connect.fps-one.nl wijst; bewuste lees-vrijstelling via PROD_LEZEN_TOEGESTAAN=1), als side-effect-import toegevoegd aan alle 94 bewijs-/verificatie-/metingscripts. Opschonen van achtergebleven testdata: `opruim-bewijsdata`-script (droogdraai standaard, VERWIJDER=1 om echt op te ruimen) + handmatige GitHub Actions-workflow "Opruimen bewijs-testdata (productie)". Dev-omgeving gescand: 0 vondsten.
- **Punt 4 — faalmail vertelt nu wát er brak.** Elke kritieke deploy-stap registreert zijn naam en uitvoer; de faalmail meldt de gefaalde stap, de laatste 15 uitvoerregels én of de productieserver al was aangeraakt (of ongewijzigd doordraait). Testmodus via workflow_dispatch-input `test_faalmail=TEST` (faalt bewust vóór elk servercontact) voor een end-to-end bewijs zonder productie te raken.
## 2026-08-17 — Medewerkerkaart: kopieerbare download-link telefoonapp

- Op elke medewerkerkaart (personeel/detail) staat nu een blok "Telefoonapp" met de publieke installatielink (/app), klikbaar én met kopieerknop (clipboard + prompt-fallback). Zo kan iedereen de download-link direct doorgeven, bv. via WhatsApp.

## 2026-08-17 — Personeel: zoekfilter, eigen/inleen-scheiding, cruciale datums + sidebar-signalen

- Personeelsoverzicht: zoekveld (naam/functie/werkmaatschappij/e-mail); eigen medewerkers alfabetisch, inleners (dienstverband uitzend/inhuur) alfabetisch onder een scheidingslijn "Inleen".
- Nieuw endpoint GET /contract-bewaking/cruciale-datums (personeel:1, afgeleide view): per actieve medewerker de meest urgente deadline — uiterste aanzegdatum (einddatum − 1 maand bij contractduur ≥ 6 mnd, Wet Aanzegging) of einddatum bij tijdelijke contracten, en ZZP-einddatums incl. DBA-duurwaarschuwing (verband ≥ 9 maanden → risico schijnzelfstandigheid).
- Medewerkerkaarten (eigen én inleen) tonen deze cruciale datum: rood met waarschuwingsicoon bij urgentie (≤ 30 dagen of DBA-risico), anders amber; tooltip met volledige reden.
- Sidebar (Personeel-hoofdstuk, personeel:2/hoofdbeheerder — o.a. Jacqueline en René): rood telbadge op het hoofdstuk + directe meldingsregels per dreigende overschrijding; klik navigeert naar de betreffende medewerkerkaart. Verversing elke 5 minuten.

## 2026-08-17 — Personeelsdossier: AI benoemt documenttype i.p.v. 'Overig'

- De documentclassificatie kent nu binnen personeelsdocumenten alle dossiertypen: functiebeschrijving, identiteitsbewijs/paspoort/verblijfsvergunning/rijbewijs, VCA/BHV/EHBO-certificaat, diploma, loonstrook, NAW-formulier, geheimhoudingsverklaring en AOW-verklaring (naast CV en arbeidscontract). Deterministisch vangnet voor functiebeschrijvingen toegevoegd.
- Bij upload in het personeelsdossier zet de achtergrondanalyse het documenttype automatisch wanneer het nog 'overig' is en de AI een bekend type herkent (whitelist, fail-closed; 'arbeidscontract' genormaliseerd naar het canonieke 'contract'). Een handmatig gekozen specifiek type wordt nooit overschreven.
- Nieuw endpoint POST /medewerkers/:id/documenten/heranalyse + knop "Automatisch benoemen" op de Documenten-tab (zichtbaar zodra er 'overig'-documenten staan) om bestaande documenten alsnog te benoemen.
- Frontend: nieuwe kopjes/labels Functiebeschrijving en AOW-verklaring; legacy-typen (arbeidscontract, id_bewijs, rijbewijs_scan) vallen nu onder het juiste kopje en tellen mee in de dossiervolledigheid.

## 2026-08-17 — Deploybewaking adaptief + dubbele typecheck uit het api-image

- Tijdbewaking in deploy.yml meldt niet langer op een vaste grens van 8 minuten (die bij vrijwel elke uitrol werd overschreden — 16 identieke mails op één dag), maar alleen bij een verslechtering: wanneer de uitrol meer dan de helft langer duurt dan de mediaan van de laatste tien geslaagde uitrollen (via de GitHub API), en hoogstens één tijdmelding per dag (datummarker `/opt/fps-one/.deploy-tijdmelding-datum` op de VPS). De schijfbewaking is ongewijzigd.
- Oorzaak van de trage uitrol weggenomen: deploy/Dockerfile.api draaide `typecheck:libs` en de api-server-typecheck opnieuw ín het image, terwijl de workflow die vooraf al volledig op de runner draait. Via build-arg `TYPECHECK_IN_IMAGE` (doorgegeven vanuit deploy.yml → deploy-production.sh → compose) draait de typecheck in het image alleen nog bij een NOODFIX-uitrol, waar de controle vooraf bewust wordt overgeslagen. Buiten de pipeline blijft de default veilig aan. Overslaan is bewezen veilig: esbuild bundelt rechtstreeks vanuit `src/` (alle @workspace-packages exporteren TypeScript-bron).

## 2026-08-17 — Smoketest-serviceaccount voor de post-deploy controle

- Nieuw beheerscript `pnpm --filter @workspace/db run smoketest-account` (lib/db/scripts/smoketest-account.mjs): maakt idempotent het vaste smoketest-account `smoketest@fps-brandpreventie.nl` aan (wachtwoord uit omgevingsvariabele `SMOKETEST_PASSWORD`, minimaal 16 tekens — staat nooit in de repo). Draaibaar op de productieserver via de bestaande migrate-container.
- Nieuwe kolom `gebruikers.twee_factor_vrijgesteld` (migratie 0073): de loginroute geeft een vrijgesteld account direct een volledige sessie (`{status:"ingelogd"}`), omdat de smoketest geen TOTP-stap kan doorlopen. De vlag is uitsluitend via het beheerscript of directe SQL te zetten, nooit via UI of API.
- Rol in de sessie wordt nu bij élke login gezet (`req.session.rol`): de governance-engine blokkeerde kritieke acties (zoals gebouw verwijderen) anders óók voor hoofdbeheerders omdat de rol in cookie-sessies nooit werd gevuld.
- Het account krijgt rol hoofdbeheerder (vereist door de governance-engine voor de verwijder-check) met een minimale bevoegdheden-matrix (gebruikers:1, gebouwen:4) als documentatie van wat de smoketest werkelijk gebruikt. Alle 15 smoketest-checks zijn in de ontwikkelomgeving end-to-end bewezen (login 200, lijsten 200, gebouw aanmaken/bijwerken/verwijderen 200/200/204).

## 2026-08-17 — Werk-inbox-teller ook op hoofdstuknaam Communicatie

- Het rode rondje met het aantal ongelezen werk-inbox-mails is nu ook zichtbaar op de hoofdstuknaam "Communicatie" in de sidebar (net als bij Goedkeuring en Declaraties), zodat je het aantal ziet zonder het hoofdstuk te openen. Het hoofdstukrondje telt ongelezen chatberichten en ongelezen, niet-afgehandelde werk-inbox-mails samen.
- Nieuw lichtgewicht endpoint `GET /api/werk-inbox/telling` (alleen database, gescoped op de mailboxen waar de gebruiker toegang toe heeft) voedt de teller; het Werk-inbox-item in het uitklapmenu toont hetzelfde rondje.

## 2026-08-17 — Offerte-aanvraag (e-mail) verplaatst van Offertes naar Projecten

- De knop "Offerte-aanvraag (e-mail)" stond op de Offertes-pagina; een aanvraag maakt echter een nieuw project (gebouw + offerte + opname) aan en hoort dus bij Projecten. De knop heet nu "Nieuwe aanvraag (e-mail)" en staat op het projectenoverzicht naast "Nieuw gebouw" (alleen beheerders); de wizard zelf is ongewijzigd.
- De knop op de Offertes-pagina is verwijderd.

## 2026-08-17 — Factuurafdruk: ketenkenmerk erop, betalingskenmerk herleidbaar, geen afdruk zonder fiscaal nummer

- Het ketenkenmerk (bv. O405/F002) staat nu als "Ons kenmerk" op de factuurafdruk naast het fiscale factuurnummer. Het fiscale nummer alleen is niet herleidbaar: de drie BV's hebben elk een eigen reeks die bij hetzelfde getal begint; het ketenkenmerk hangt via de offerte aan gebouw en BV.
- De betalingsinstructie vraagt nu om vermelding van "factuurnummer / ketenkenmerk" zodat het bankafschrift eenduidig naar één administratie wijst.
- Een factuur zonder fiscaal factuurnummer is niet meer afdrukbaar: in plaats van de eerdere terugval op FACT-<intern id> toont de printpagina een duidelijke blokkade ("eerst definitief maken") en start het afdrukken niet.

## 2026-08-17 — Geüploade offerte-aanvraag e-mails (.eml) worden weer als aanvraag herkend

- Probleem: een geüploade offerte-aanvraag (bv. "De Aak 71 — plafonds brandwerend maken") belandde bij documenten in plaats van het aanvraagproces te starten. Oorzaak: bij .eml/.msg-bestanden las de documentclassificatie de rauwe bytes — de eerste duizenden tekens zijn mailheaders/DKIM-handtekeningen, waardoor de AI alleen ruis zag en het bestand als algemeen document indeelde.
- Fix: e-mailbestanden worden nu écht geparsed (onderwerp, afzender, inhoud, bijlagenamen) vóór classificatie, ook als de browser een generiek MIME-type meestuurt. De De Aak-mail classificeert nu als "aanvraag" (vertrouwen: hoog), waardoor de slimme upload direct de stap "Offerte-aanvraag verwerken" toont die het aanvraagproces start.
- Regressietests toegevoegd voor .eml-extractie (herkenning op extensie én MIME-type).

## 2026-08-17 — Uniek volgkenmerk prominent bovenaan alle Projectaanpak-detailpagina's

- Nieuw gedeeld kop-element (KenmerkKop) dat het automatisch berekende ketenkenmerk (bv. BP-G156/C590/O405) duidelijk bovenaan toont — hetzelfde kenmerk dat op de uitgaande documenten (offerte, factuur) staat.
- Toegevoegd op: gebouw-detail ([PFX-]G…), calculatie-detail ([PFX-]G…/C…), offerte-studio (…/O…), opdracht-detail (keten via de offerte), opname-detail ([PFX-]G…/M…), magazijn-inkooporder (G…/I…) en factuur-detail (O…/F…).
- Calculatie: de interne CALC-referentie (CALC-2026-…) staat niet langer prominent in de paginakop — die is een intern registratienummer en niet het nummer dat op de offerte komt; hij blijft zichtbaar als "Ref:" in de gegevensstrip. Het ketenkenmerk (…/C…) dat doorloopt in het offertekenmerk staat nu vooraan.
- API: gebouw-, opdracht- en opname-detailresponses geven nu ook het berekende kenmerk terug (nieuwe helper voor de M-reeks).

## 2026-08-17 — Paginabreedte begrensd op brede schermen (Externen + 7 andere pagina's)

- Externen werd paginabreed getrokken waardoor tekst en knoppen tegen de rechterrand stonden; de pagina is nu begrensd op dezelfde maximale breedte als de rest (max-w-6xl, gecentreerd).
- Zelfde correctie doorgevoerd op: Capaciteitsplanning, Jaarafsluiting, Jaarplanning, Uitboarden, Verlof-instellingen, Werving-detail en Beeldbank — de enige pagina's die de breedtebegrenzing nog misten.

## 2026-08-17 — MOBIEL_01: onderbalk-ruimte, wijkende zwevende knop en tabelpatroon Organisaties

- Onderbalk (Uitloggen/NIEUWS) dekt de laatste kaart niet meer af: pagina-onderruimte rekent nu balkhoogte + veilig gebied van de telefoon mee (viewport-fit=cover, env(safe-area-inset-bottom)); gemeten 31px vrije ruimte op 402px.
- Zwevende ondersteuningsknop schuift tijdens scrollen rechts uit beeld (doorklikbaar uit) en keert kort na het stoppen terug; hij staat ook boven het veilige gebied.
- Overzicht Organisaties is nu één echte tabel voor alle breedtes (MOBIEL_01-tabelpatroon): zes kolommen op desktop; op telefoon blijven Organisatie en Relatie staan en stapelen type/locatie/contact ónder de naam in de eerste cel. Rij-klik opent het dossier.
- Bewijs: Playwright-metingen + screenshots op 402×874 en 1280×900 met gevulde demo-organisaties (na afloop opgeruimd).

## 2026-08-17 — Onzinjaartallen in personeelsdatums geweigerd én geheeld

- Gemeld defect: personeelsdossier toonde "Uit dienst per 14 jul 82026" — een onzinjaartal dat via dossier-analyse/invoer ongehinderd in de tekstkolom belandde.
- API valideert nu alle datumvelden van het medewerkerprofiel (in/uit dienst, geboortedatum, rijbewijs/VCA/EHBO/BHV-verval) op echte kalenderdatum JJJJ-MM-DD met jaartal 1900–2100; anders 422 met veldnamen (aanmaken, wijzigen én offboarden).
- Validator is gedeeld (lib/datumSaniteit) en dekt álle schrijfpaden: HRM-routes, onboarding, doorvoer van goedgekeurde AI-voorstellen én de medewerker-import (fail-closed).
- Migraties 0071 + 0072 wissen bestaande onzinwaarden en kalenderongeldige datums (NULL = onbekend); draaien via de deploy ook op productie.
- Bewijs: API-run — onzinjaar op POST en PATCH → 422, geldige datum → 201.

## 2026-08-17 — Eigen modules "Social media" en "Merk" in de bevoegdheden-matrix (#1037/#1038)

- Social en Merk (merkenkast + beeldbank) zijn losgekoppeld van het CRM-recht, zelfde aanpak als Marketing.
- Module **social**: niveau 3 = opstellen/klaarzetten (preset Commercieel), niveau 4 = plaatsen en koppelingen beheren (preset Directie). Verder niemand.
- Module **merk**: niveau 1 = zoeken/downloaden (presets Calculatie, Administratie, Projectleider — voor logo's en projectfoto's in offertes, brieven en rapportages), niveau 3 = ook uploaden (presets Commercieel en Directie). Veldprofielen krijgen niets.
- Huisstijl beheren blijft onder organisatiebeheer; de merkenkast toont die gegevens alleen.
- Migratie 0070 is alleen-verhogend en idempotent; handmatige profielen blijven op 0 (fail-closed).
- API-routes en sidebar/paginagating omgezet naar de nieuwe modules.
- Bewijs (#1038): `scripts/src/bewijs-module-rechten-1038.ts` — 21 checks tegen de echte API met wegwerpgebruikers per preset (marketing/social/merk, incl. weigeringen), alle geslaagd.

## 2026-08-17 — Naam "FPS Connect" beter zichtbaar in navigatie en welkomstpagina

- Het volledige logo-plaatje (met kleine, onleesbare "FPS Connect"-tekst en wit blok) is vervangen door een vrijstaand schild-icoon (transparante achtergrond, `assets/logo-fps-schild.png`) met daarnaast de naam "FPS Connect" als echte tekst — scherp op elk formaat en leesbaar in licht én donker schema.
- Doorgevoerd op: sidebar-header beheerderlayout, mobiele topbalk en het linkerpaneel van de welkomstpagina.
- Bewijs: Playwright-screenshots licht/donker van welkomstpagina en planning-sidebar.

## 2026-08-17 — Werkmaatschappij-keuzelijsten live uit de werkgevers-API

- Het planning-filter en alle HRM-dropdowns (onboarding, medewerkerdetail, functiebeheer) tonen nu álle actieve werkmaatschappijen uit de database — de vanmorgen aangemaakte FPS Bouw en Renovatie verschijnt direct, zonder codewijziging bij een volgende nieuwe BV.
- Nieuwe hook `useWerkmaatschappijen()` in `lib/werkmaatschappijen.ts`: namen én CAO-voorselectie komen uit GET /werkgevers (werkgevers.cao is bron van waarheid); de statische lijst is alleen nog fallback tijdens het laden. Gedragscorrectie: FPS Bouw selecteert nu Bouw & Infra voor (stond hardcoded op Metaal & Techniek, DB zei Bouw & Infra).
- Bewijs: `scripts/src/bewijs-planning-wm-filter.ts` (Playwright) — dropdown toont alle 4 werkmaatschappijen incl. FPS Bouw en Renovatie.
- Controle overige acties na aanmaken werkmaatschappij: rij + CAO + actief staan goed in DB; gesignaleerde gaten (hardcoded FPS-branding in offerte-/mailroutes, leeg kenmerk_prefix, geen automatische mailafzender/social-provisioning) apart gerapporteerd.

## 2026-08-17 — Deploy-blokkade opgelost: absoluut Replit-pad in verificatiescript

- Acht mislukte uitrollen op rij (sinds #346) kwamen door één regel: `scripts/src/verificatie-storage-links.ts` importeerde `@google-cloud/storage` via het absolute pad `/home/runner/workspace/artifacts/api-server/node_modules/...`, dat op de GitHub-runner niet bestaat.
- Fix: normale import van `@google-cloud/storage`, toegevoegd als afhankelijkheid van het scripts-pakket. Regel voortaan: nooit werkruimte-absolute paden in code die op main komt.
- Gecontroleerd op meer voorkomens: broncode van scripts/lib is schoon; `/home/runner/workspace`-paden bestaan verder alleen in Replit-only shellscripts (freshclam) en in api-server-services met env-override (ClamAV/YARA/quarantaine) — bestaand gedrag, buiten deze fix gelaten.
- CI + "Deploy naar productie" op commit 8ec7917 zijn weer groen.

## 2026-08-17 — Eigen module "Marketing" in de rechtenmatrix (MARKETING_02)

- Marketing (doelgroepen, sjablonen, campagnes) is losgekoppeld van de CRM-module en heeft nu een eigen module `marketing` in de bevoegdheden-matrix (akkoord René): niveau 3 = beheren + proefverzenden, niveau 4 = campagnes écht verzenden en stoppen.
- Presets: Commercieel krijgt marketing 3; Directie krijgt marketing 4 (expliciete keuze René). Overige presets en handmatige profielen blijven op 0 (fail-closed); toekennen kan via Rollen & Rechten.
- Migratie `0069_marketing-module.sql` tilt systeem-presets én daaruit afgeleide gebruikers mee (alleen-verhogend, idempotent).
- Backend `marketing.ts` gate't nu op `marketing` 3/4; toestemming-beheer op contactpersonen blijft bewust onder `crm` 2. Sidebar-link en verzendknoppen volgen de nieuwe module.

## 2026-08-17 — KLEURACCENT_01: hoofdstukkleur doorgetrokken in het werkscherm

- **Uitvoering:** UI-verfijning firevault (NAV_01/KLEURACCENT_01) | **Kwaliteit:** hoog | **Risico:** laag (alleen CSS + twee data-attributen; tokens ongewijzigd)

De hoofdstukkleur is nu overal in het werkscherm zichtbaar, zodat je aan het beeld ziet in welk deel van Connect je werkt: het actieve tabblad onderstreept in de hoofdstukkleur, kaarten en panelen krijgen een zachte hoofdstuk-tint in de rand, pictogrammen in kaartkoppen kleuren mee, en de actieve staat van schakelknoppen krijgt een licht hoofdstuk-vlak met randlijn. Alles app-breed via CSS op de bestaande [data-hoofdstuk]-container — geen wijzigingen per scherm, geen kleurwaarden in schermen, en routes zonder hoofdstuk (dashboard, instellingen) blijven accentloos.

Geborgd: primaire actieknoppen behouden hun eigen kleur; waarschuwings-/fout-/succeskleuren winnen altijd van het accent (de kaartrand-regel staat bewust op specificiteit nul); tekst staat nooit op een verzadigd gekleurd vlak (WCAG AA). Licht én donker schema geverifieerd met schermafdrukken (scripts/src/kleuraccent-screenshot.ts). Los daarvan geconstateerd (bestaand, niet door deze wijziging): kaartkoppen op de gebouwpagina zijn in donker schema te dof — apart op te pakken.

## 2026-08-17 — "Wie is online" rechtsboven toont nu álle actieve collega's, ook na een serverherstart

- **Uitvoering:** defect-fix api-server (aanwezigheids-tracker) | **Kwaliteit:** hoog | **Risico:** laag (zelfde 5-minutenvenster; alleen de bron verplaatst)

De online-indicator rechtsboven hield de aanwezigheid alleen in het servergeheugen bij: na elke herstart of nieuwe deploy was de lijst leeg en verschenen collega's pas weer zodra ze zelf iets aanklikten. Daardoor leek vaak maar één iemand (of niemand) online terwijl er meer mensen ingelogd waren.

De aanwezigheid wordt nu (gedebounced, max. één schrijfactie per minuut per gebruiker) in de database bijgehouden (gebruikers.laatst_online, dat al bij het inloggen werd gezet) en de lijst komt rechtstreeks uit de database: iedereen die de afgelopen 5 minuten actief was, exclusief jezelf en gearchiveerde accounts, alfabetisch. De lijst overleeft daarmee herstarts en klopt ook met meerdere serverprocessen.

Bewijs: `scripts/src/verificatie-online-gebruikers.ts` — een collega die alleen in de database als actief geregistreerd staat (dus zonder enige activiteit in het huidige serverproces) verschijnt in de lijst, de aanvrager zelf nooit, en na 10 minuten inactiviteit verdwijnt de collega weer.

## 2026-08-17 — Hoofdstuk-accent prominenter + gekleurd merkteken bij de paginatitel

- **Uitvoering:** UI-verfijning firevault (NAV_01) | **Kwaliteit:** hoog | **Risico:** zeer laag (alleen opmaak; tokens ongewijzigd)

Op verzoek van René is het hoofdstuk-accent op de werkpagina's prominenter gemaakt: de accentlijn boven de pagina is dikker (2px → 4px) en de paginatitel krijgt nu een gekleurd merkteken (afgeronde balk) in dezelfde hoofdstukkleur. Het merkteken is opt-in per titel (`data-paginatitel`, ~187 werkpagina's getagd) en werkt alleen binnen de pagina-inhoud — geportalde dialogen en geneste document-previews blijven onaangeroerd. Kleuren komen ongewijzigd uit de bestaande `--hoofdstuk-*`-tokens (@workspace/ontwerp), dus licht/donker schema en de AA-contrastmetingen blijven gelden.

## 2026-08-17 — Defect: dode /api/storage/files-downloadlinks omgezet naar de bestaande beveiligde route

- **Uitvoering:** defect-fix in api-server + firevault (migratie 0068) | **Kwaliteit:** hoog | **Risico:** laag (alleen link-opbouw en datamigratie; geen ACL- of routewijziging)

Links met `/api/storage/files?path=...` kwamen nergens uit: die route heeft nooit bestaan (routes/storage.ts kent alleen public-objects, objects en thumbnails). Alle generatoren zijn omgezet naar de bestaande, beveiligde route `/api/storage/objects/<subPath>` — dezelfde toegangscontrole (inloggen + gebouw- en document-ACL) als de merkenkast/beeldbank (MERK_01) — via een nieuwe gedeelde helper `lib/storageObjectsUrl.ts`.

Omgezette plekken: factuurstroom (factuur-PDF, dagelijks gebruikt), werkgeverslogo-pad (raakt calculatieprint + merkenkast), mandagstaat-bijlage, offerte-sectiefoto's, aanvraagstroom-mailbijlagen, snagstream-rapport-AI-download en de firevault-schermen facturen-detail en visual-library. Reeds opgeslagen dode links in facturen, werkgevers, aanvraag_voorstellen, offerte_secties zijn met migratie 0068 herschreven; lezers (werkgever-logo-pad, factuur-uitlezen, snagstream) accepteren het historische formaat ook nog.

Bewijs: `scripts/src/verificatie-storage-links.ts` — per plek een echt bestand geopend via de nieuwe link (200 + byte-identiek), anonieme toegang geweigerd (401) en een databasescan die bevestigt dat geen enkele opgeslagen link meer naar het dode formaat wijst.

## 2026-08-17 — Gerichte arbeidscontract-extractie: uitlezen, overnemen en automatische bewaking

- **Uitvoering:** uitbreiding personeel/HRM (migratie 0066) | **Kwaliteit:** hoog | **Risico:** laag (bestaande analyse-route herbouwd op gedeelde service; additieve kolommen)

Een gescand arbeidscontract wordt niet langer alleen samengevat: de AI leest nu gericht alle contractvelden uit (werkmaatschappij, werknemersnaam, functie, datum in dienst, bepaalde/onbepaalde tijd, einddatum, proeftijd, uren per week incl. min-max bij nul-uren, salaris mét eenheid, CAO, opzeg- én aanzegtermijn, reiskostenvergoeding, concurrentie- en relatiebeding). Elk veld draagt een vindplaats (pagina + letterlijk citaat); zonder vindplaats blijft het veld bewust leeg (fail-closed — de AI gokt nooit).

- **Contract uitlezen (AI)** op het contractentabblad van de medewerker: dialog met alle velden vooringevuld, vindplaats-citaten eronder, alles corrigeerbaar. **Overnemen in dossier** maakt met één handeling een arbeidsovereenkomst aan — nooit stil.
- Einddatum + contracttype landen daarmee direct in de bestaande **contractbewaking** (120/90/75/60/30-dagen-signaleringen + aanzegging slaan automatisch aan).
- Nieuwe contractvelden (salariseenheid, uren min/max, opzeg-/aanzegtermijn, reiskosten, bedingen) zichtbaar in het contractdetail en beschikbaar in de contract-bewaking-API.
- **Slim upload** herkent een arbeidscontract nu als subtype en stelt automatisch de juiste **medewerker + documenttype** voor (deterministische naam-match, bij twijfel geen voorstel; geel AI-voorstel, gebruiker bevestigt).

Bewijs: `scripts/src/verificatie-contract-extractie.ts` — synthetisch contract → 14/14 velden correct mét vindplaats, fail-closed-invariant intact, overname → 60-dagen-signalering, slim-upload-voorstel correct.

## 2026-08-17 — Merkenkast & Beeldbank (MERK_01): huisstijl en beeldmateriaal centraal vindbaar

- **Uitvoering:** nieuwe module (migratie 0065) | **Kwaliteit:** hoog | **Risico:** laag-midden (nieuwe leesroutes + één nieuwe tabel; automatische bronnen blijven onaangeroerd)

Twee nieuwe pagina's onder Commercie (beide vanaf crm-niveau 3):

1. **Merkenkast (`/crm/merkenkast`).** Per werkmaatschappij alle merkgegevens op één plek: logo-varianten (kleur/wit/zwart/liggend/vierkant/transparant), merkkleuren (kopieerbaar), lettertype, korte/lange bedrijfsomschrijving en zakelijke gegevens. De **werkgever-huisstijl is de enige bron** — beheer gebeurt op de bestaande huisstijlpagina (Organisatie → Documentopmaak, uitgebreid met logo-varianten, extra kleuren en teksten). Download per onderdeel of als **compleet merkpakket (zip)** met `merkgegevens.txt/json`; ontbrekende bestanden worden in het pakket expliciet benoemd, nooit stil overgeslagen.
2. **Beeldbank (`/crm/beeldbank`).** Eén zoekingang over al het eigen beeldmateriaal, live geaggregeerd uit vier bronnen (geen kopieën): spotfoto's per fase (opname/uitvoering/oplevering), opnamefoto's, inspectiefoto's en handmatige uploads. Filteren op bron, fase, gebouw, werksoort en periode + vrij zoeken; per foto gebouw, werksoort, wanneer en wie. Bulk-download als zip (max 200) met selectie in het fotoraster. Handmatig uploaden kan met gebouw-/opdrachtkoppeling; automatische bronnen hebben bewust géén gegokte opdracht-koppeling (gemeld bij scoping).
3. **Toegang fail-closed.** Alles achter crm 3; de gebouw-ACL (beperkte veldgebruikers) wordt zowel in de lijst als opnieuw per foto in de bulk-download afgedwongen; buiten-toegang of ontbrekende bestanden staan met naam in `OVERGESLAGEN.txt`.

Na architect-review aangescherpt: (a) download-URLs wijzen nu naar de bestaande, gebouw-ACL-afgedwongen storage-route (`/api/storage/objects/…`) — het eerder gebruikte `/api/storage/files?path=…`-patroon blijkt als route niet te bestaan; (b) handmatig uploaden is fail-closed: beperkte veldgebruikers kunnen alleen binnen hun toegewezen gebouwen registreren (403), gebouw/opdracht-referenties worden gevalideerd (400); (c) de storage-ACL herleidt nu ook inspectiefoto's en beeldbank-uploads naar hun gebouw.

Bewijs: `scripts/src/verificatie-merk01.ts` — 37/37 groen via https-sessie: 401/403-afscherming, huisstijlvelden PATCH→merkenkast, merkpakket-zip incl. ontbrekend-melding, aggregatie van alle vier bronnen met filters, gebouw-ACL voor beperkte veldgebruiker (lezen én uploaden; gebouw B onzichtbaar), echte afhandeling van de download-URL en bulk-zip met ACL-herafdwinging + OVERGESLAGEN-melding.


## 2026-08-17 — AVG-afscherming: bredere lek-audit afgerond, drie lekken gedicht (taak #1008)

Alle directe reads op medewerkersTable buiten de centrale HRM-mappers zijn geïnventariseerd (docs/avg-afscherming-beleid.md, incl. beleidsgrens: naam blijft zichtbaar; interne loon-/wettelijke verwerking mag door; API/UI-disclosure van contact/NAW/geboortedata niet). Drie plekken konden bij een afgeschermde oud-medewerker (m.n. actief=true met verstreken uit_dienst_per) nog afgeschermde velden lekken en filteren nu op afgeschermd_op IS NULL: de planning-selector /modules/planning/medewerkers (gaf e-mail/telefoon terug), de kalender-verjaardagen en de moments-verjaardagservice (geboortedatum-gebruik). Na review óók de self-scoped route /mijn/privacy-gegevens gedicht: een afgeschermde oud-medewerker kan nog een actief account hebben; e-mail/telefoon/mobiel gaan dan ook naar de eigen gebruiker als null terug. IDOR-check bevestigd: /gebruikers/:id geeft niet-beheerders geen e-mail/telefoon (mapGebruikerPubliek). Bewijs uitgebreid: scripts/src/bewijs-offboard-uitsluiting.ts — 22/22 groen (incl. IDOR-check, planning-selector-, kalenderverjaardag- én self-scoped-privacy-uitsluiting bij het actief=true-randgeval).
## 2026-08-17 — Bestelbonnen en mandagstaten draaien nu in de goedgekeurde huisstijl uit

Documenten die tot nu toe altijd de vaste FPS-oranje kleur (#F23B0D) gebruikten, nemen nu de accentkleur op uit het goedgekeurde Document Studio-model van de werkmaatschappij. Zonder goedgekeurd model valt alles terug op de standaard DDS-kleur.

- **Mandagstaat-PDF (server-side):** `genereerMandagstaat()` in `lib/mandagstaat.ts` leidt de werkgever af uit de medewerkers op de mandagstaat, vraagt het actieve Studio-model op via `haalActiefStudioKleur()` en geeft de kleur door aan `tekenPdf()` als `accentKleur`. De PDF-kop (bedrijfsnaam) kleurt nu in de huisstijlkleur van de goedgekeurde werkmaatschappij.
- **Bestelbon-e-mail (POST /magazijn/bestelbonnen):** accepteert nu optioneel `werkgever_id` in de body. Bij een geldig werkgever-id wordt het actieve bestelbon-Studio-model opgezocht; de e-mailkop gebruikt de primaire kleur én de naam van de werkmaatschappij als afzender.
- **Inkooporder-e-mail (POST /magazijn/inkooporders/:id/verstuur):** leidt de werkgever server-side af via de sessiegebruiker (medewerker-werkgever-koppeling). Past het actieve bestelbon-Studio-model toe op kop, kleur en afsluiting; html-opmaak opgewaardeerd naar hetzelfde responsive blok als de overige transactionele mails.
## 2026-08-17 — Kies per salarismutatie wat er in de SCAB-mail meegaat

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

Beheerders kunnen nu per salarismutatie aanvinken welke mutaties in de SCAB-mail worden opgenomen. Bij opslaan regenereert de server de volledige mailtekst (aanhef + regellijst + ondertekening) op basis van de gekozen subset; de snapshot (`mutatie_ids`) en mailtekst worden altijd samen bijgewerkt. Verzenden raakt uitsluitend declaraties uit de definitieve snapshot (bestaand gedrag).

**Wijzigingen:**
- `artifacts/api-server/src/routes/scab-mail.ts`: PATCH-handler valideert fail-closed (niet-integer element → 400 voor héél verzoek), dedupliceert IDs, controleert scope (wm+periode) en regenereert de mailtekst server-side. `GET /scab-mails/:id/mutaties` geeft alle periode-mutaties terug met `in_snapshot`-vlag.
- `artifacts/api-server/src/lib/scabMailHelpers.ts` (nieuw): geëxporteerde pure helpers `genereerDeterministischeBody`, `eersteOngeldigeElement`, `dedupliceerId` — te unit-testen zonder DB-afhankelijkheid.
- `artifacts/firevault/src/pages/scab-mail/index.tsx`: bewerken-dialog toont `MutatieKeuzePanel` met per-mutatie checkboxes; bij selectiewijziging stuurt de client alleen `mutatie_ids`, niet de handmatige tekst.
- `lib/api-spec/openapi.yaml`: `ScabMail.mutatie_ids`, `ScabMailPatch.mutatie_ids`, schema `ScabMailMutatieKeuze` en endpoint `GET /scab-mails/{id}/mutaties` toegevoegd.
- `artifacts/api-server/src/__tests__/scab-mail-patch.test.ts` (nieuw): 20 unit tests voor de type-validatie, deduplicatie en body-generator (groen, geen DB-mock nodig).


## 2026-08-17 — Kies per salarismutatie wat er in de SCAB-mail meegaat (#984)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

Bij het genereren of bewerken van een concept-SCAB-mail (loonperiodebrief aan de accountant) kan de beheerder nu per salarismutatie aanvinken of die mutatie meegenomen wordt. De server valideert alle aangevinkte IDs fail-closed tegen werkmaatschappij en periode, dedupliceert ze en regenereert de volledige mailtekst deterministisch — inclusief aanhef en ondertekening. De snapshot (`mutatie_ids` in `scab_mails`) en de mailtekst worden altijd samen bijgewerkt. Verzenden verwerkt alleen de declaraties uit de definitieve snapshot (bestaand gedrag ongewijzigd).

- **Backend:** `PATCH /scab-mails/:id` accepteert `mutatie_ids: number[]`; server toetst elke ID tegen eigen data en retourneert 400 bij type-fout of buiten-scope ID. Nieuwe helper-module `scabMailHelpers.ts` extraheert `genereerDeterministischeBody`, `eersteOngeldigeElement` en `dedupliceerId` als pure functies. Nieuw endpoint `GET /scab-mails/:id/mutaties` retourneert alle mutaties in de periode met `in_snapshot`-vlag per rij.
- **Frontend (`firevault`):** `MutatieKeuzePanel` met checkboxes, "alles aan/uit"-knoppen en nieuw-badge. Bij selectiewijziging stuurt de client uitsluitend `mutatie_ids`; de mailtekst wordt herladen na bevestiging.
- **Migratie 0055:** `scab_mails.mutatie_ids` (integer[]) al aanwezig; de nieuwe veldkolom `medewerkers.afgeschermd_op` (migratie 0058) is toegevoegd aan de Drizzle-schema-definitie en de gecompileerde lib-declaraties zijn herbouwd.
- **Tests:** 20 unit-tests voor de pure helpers + 12 route-level integratietests (404, 409, type-fout ×3, buiten-scope, deduplicatie, lege selectie, geldige selectie, GET mutaties ×2). Architect-review: geslaagd na fix van stale lib/db dist en routering-correctie in integratietests.

## 2026-08-17 — Basislaag eigen gegevens in de webapp + besluit geen iOS-build

- **Besluit vastgelegd (taak #886):** geen iOS-build en geen Apple Developer-account; iPhone-gebruikers werken in de webapp. Zie docs/besluit-geen-ios-build.md; docs/monteur-app-apk.md bijgewerkt (iOS-actiepunt vervallen).
- **Mijn gegevens (webapp):** nieuw vast zijbalk-hoofdstuk voor iedere ingelogde medewerker, ongeacht profiel: Mijn uren (bestaand urenscherm, backend scoopt op eigen medewerker), Mijn declaraties (/mijn/declaraties, nieuw), Mijn verlof (/mijn/verlof, nieuw: saldo + aanvragen + nieuwe aanvraag), Mijn loonstroken (bestaande pagina /mijn/salarisdocumenten, nu vindbaar). Modulerechten blijven onverkort gelden voor andermans gegevens.
- **Zijbalk-audit:** Urenregistratie/Weekstaten (UI personeel:1, backend alleen-inloggen) waren de enige verborgen-eigen-gegevens mismatches; declaraties-modulepagina en verlofoverzicht/salarisarchief kloppen met de backend. Gemeld: uren-pagina gebruikt heeftNiveau("uren",1) terwijl backend personeel:1/2 hanteert (niet stilzwijgend aangepast).
- Bewijs: scripts/src/bewijs-mijn-gegevens-basislaag.ts — 16/16 groen. Lib-fixes: lib/db en lib/api-client-react dist herbouwd na merge-drift (stale compiled declarations). Firevault-imports scab-mail/index.tsx: dubbele useState, ontbrekende ListChecks en useGetScabMailsIdMutaties toegevoegd. — 16/16 groen (rechtenloos account bereikt alle eigen-gegevens-routes incl. volledige concept-levenscyclus declaratie: aanmaken, detail, bewerken, indienen, verwijderen; module-lijsten blijven 403). Declaratie-detail: concept-acties nu eigenaarschap-gebaseerd (conform backend) i.p.v. declaraties:2; terugknop context-bewust. Architect-review: PASS.


## 2026-08-17 — VORM_01 fase 6 afgerond met bewijsschermen mét gevulde gegevens (#1025)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

De veiliggestelde tak `vorm01-fase6-wip` is verzoend met main. Analyse toonde dat vrijwel de hele fase-6-inhoud al op main stond (F6-eindcommit); het enige resterende unieke werk was de tokenisatiepas van het Mijn auto-scherm (ruimte-tokens, tekstStijl(), Ladenstaat i.p.v. ActivityIndicator). Die is overgenomen mét de F6-eindconventies (success/warningForeground, logo-vlak kleuren.light.card, UpdateBanner behouden). WIP-rommel (dist-bewijs-output, keten01-e2e-screenshots) is bewust niet meegenomen.

- **Security-fix (review):** POST/PATCH `/social/berichten` accepteerden een `campagne_id` onder alleen crm:3; campagne koppelen/wijzigen/ontkoppelen vereist nu server-side marketing:3 (hoofdbeheerder uitgezonderd) plus validatie dat de campagne bestaat. 9 route-level tests (crm-only vs marketing) groen.
- **Fix:** Mijn auto had geen `bezigLaden`-guard, waardoor een koude deep-link de token-herstel-race verloor (→ /login → /menu). Guard toegevoegd conform het vaste patroon.
- **Bewijs (gevulde gegevens, eis René):** `scripts/src/vorm01-testdata.ts` zaait nu ook een testvoertuig (VORM-01-B, chauffeur = e2e-account); `vorm01-schermafdrukken.ts` neemt het scherm mijn-auto mee. Schermafdrukken in docs/metingen/vorm01/na: mijn-werk toont 7 VORM01-spots in 2 gebouwen met statusmerken en onderregels; mijn-auto toont het gekoppelde voertuig met kenteken, km-stand en meldingen-sectie. Typecheck monteur-app + scripts groen.
