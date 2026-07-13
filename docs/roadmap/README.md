# Roadmap — FPS Brandpreventie

## Ontwikkelstop & status (juli 2026)

**Ontwikkelstop opgeheven (13 juni 2026).** De gebruiker heeft de Ontwikkelstop expliciet opgeheven en gevraagd de volledige openstaande roadmap te bouwen; per-fase formeel akkoord vooraf is niet meer vereist. De enige harde eis is zorgvuldig en beoordeelbaar bouwen: elk increment wordt als één op zichzelf staande, terugdraaibare checkpoint opgeleverd, zodat een increment dat architecturaal negatief uitpakt afzonderlijk teruggerold kan worden.

**Bouwvolgorde (vastgesteld op afhankelijkheden):** Document Design System (visuele basis) → V1.4 Opleverrapportage → V1.5 Rapportenmodule → S.G. Constructies → V2.0 mobiel → biometrie/toolbox → V3.0/CRM/klantportaal → strategische AI-lijn.

**Uitzondering met formeel akkoord:** de Fase 1-basis van het parallelle spoor (HRM/Personeel, Dossiermodule, Offerte Intelligence) is bewust vooruit gebouwd; de diepere uitwerking ervan blijft geparkeerd (geen AI-logica, geen automatische offerteverzending, geen salarisadministratie). Verlof (opname/opbouw/saldo's + CAO-kaders) is op expliciet verzoek wél meegenomen in de HRM Fase 1-basis.

**Volgorde-wijziging (vastgelegd):** V1.1 Rollen & bevoegdheden (gebouwd) → V1.2 Bibliotheekherstructurering → V1.3 Spots & uitvoering → V1.4 Opleverrapportage → V1.5 Rapportenmodule. De eerdere V2.1/V2.2 zijn samengevoegd tot V3.0. Calculatie moet in een geïsoleerde omgeving worden doorontwikkeld (raakt kostprijzen, tarieven, marges).

---

## Sporen

### Gebouwd

- **V1.0** — Administratief gereed voor uitvoering
- **V1.1** — Rollen & bevoegdheden
- **V1.2** — Bibliotheek & documentstructuur (applicaties, toepassingen, documenten, ETA's, koppelingen, versiebeheer)
- **V1.3** — Spots & uitvoering — spotflow web+mobiel, plattegrond SVG-editor + mobiele renderer, scheidingen, toewijzingen, voorbereide spots, clusters + serie plaatsen; restpunten zijn verfijning/gebruiksvriendelijkheid
- **DMS / Documentenbibliotheek** — detail/logboek, polymorfe koppelingen, duplicaatdetectie (sha256 + fuzzy), goedkeuringsflow, signaleringen, DMS-dashboard, audittrail, downloadlogging, read-only mobiele documentenweergave. Inclusief het V1.5-bevriezingsdeel op dossiers (`POST /dossiers/:id/definitief`)
- **AI Spotherkenning met zelflerende correcties** en **AI Bibliotheekvalidatie** — AI stelt voor, mens bevestigt, AI keurt nooit zelfstandig juridisch goed
- **V1.4** — Opleverrapportage (8 juli 2026) — acht rapporttypes als sectie-presets, afvinkbare secties, spotselectie per verdieping/cluster/individueel, bijlagenbundel-PDF, gepersisteerde `opleverrapporten`-entiteit met "definitief maken" + documentbevriezing
- **Governance & Approval Engine** — kernmotor + pilot inkoopbon (10 juli 2026) — generieke goedkeuringsmotor (beleidsregels + aanvragen als state machine); beheerscherm `/beheer/goedkeuringsbeleid`

Detail: [gebouwd.md](./gebouwd.md)

### Actief

- **V1.5** — Rapportenmodule — grotendeels gebouwd (gepersisteerde definitieve rapporten + bevriezing via V1.4; centrale rapportenbibliotheek met statusfilter + zoekfunctie; reactietermijn-statusmachine met vier zichtbare statussen); restscope: koppeling naar CRM/onderhoud/klantportaal
- **Document Design System** — modulebrede documentmotor: drie templatefamilies (A klantdocumenten, B HRM/juridisch, C interne operationele), per-werkmaatschappij centraal beheer, versiebeheer + PDF + latere digitale ondertekening. Visuele basis gebouwd (13 juni 2026); versiebeheer Document Studio-modellen gebouwd (8 juli 2026). Detail: [document-design-system.md](./document-design-system.md)
- **Update-voorblad bij login** — ontwerp + datamodel klaar (8 juli 2026), **nog geen formeel akkoord, NIET bouwen**. Detail: [update-voorblad-login.md](./update-voorblad-login.md)

Detail: [actief.md](./actief.md)

### Parallel spoor

Fase 1-basis gebouwd met formeel akkoord; diepere uitwerking blijft geparkeerd.

- **HRM / Personeel** — medewerkers, functiehuis, opleidingen/certificaten (onderscheid opleiding vs. cursus, rijke velden, functie-koppeling via M2M), bekwaamheidsmatrix, verlofsoorten + verlofsaldo's + verlofaanvragen + onboarding. AI-uitzondering: stelt per functie passende opleidingen voor (mens accepteert). Gating via bevoegdheden-matrix, niet via rol-strings. BUITEN scope: salarisadministratie, AI-personeelsadvies, werving, beoordeling, ziekte/verzuim, volledige mobiele self-service
- **Dossiermodule** — dossiers per gebouw met status concept → definitief → gearchiveerd
- **Offerte Intelligence** — ALLEEN voorbereiding (regels uit spots, sjablonen); GEEN AI-calculatie, GEEN automatische verzending

Detail: [parallel-spoor.md](./parallel-spoor.md)

### Geparkeerd — NIET vooruit bouwen

- **V2.0** — Mobiele monteur-app (mijn werk, gebouwen, plattegronden, spots, foto's, offline synchronisatie, routeplanning); biometrisch inloggen als optionele snelle ontgrendeling
- **Toolbox & berichten met leesbevestiging (mobiel)** — leunt op V2.0/V3.0
- **V3.0** — Personeel / Medewerkerportaal, uitgebouwd tot HRM-module voor de volledige FPS Groep (verlof, uren, gereedschap, opleidingen, contracten, bekwaamheidsmatrix, werving, mobiele medewerkersapp, AI-coaches)
- **AI Brandveiligheidsmanager / AI Calculator / Klantmodule** — strategische lijn: klantportaal, documentbeheer, continuïteitslaag project↔onderhoud en AI-calculatie/offerte/klantmanager
- **S.G. Constructies** — herzien: GEEN aparte bibliotheeklaag, maar samengestelde-constructie spottype binnen Spots + constructietemplates in de Bibliotheek; meetwaarde/brandwerendheid afgeleid, niet handmatig
- **CRM-module** — bredere CRM; bewust achtergesteld op V1.5; bestaande scaffold niet verder uitbouwen
- **AI-uitbreidingen** — confidence-drempel "controle nodig" bij lage zekerheid, periodieke documentcontrole, matcher uitbreiden
- **Fase 2 — Bedrijfsbesturing, calculatie & managementinformatie** — strategische horizon NÁ de huidige Connect-roadmap; geen bouwopdracht. Detail: [fase-2-bedrijfsbesturing.md](./fase-2-bedrijfsbesturing.md)
- **Adaptive Workspace Engine** — centrale, lerende UI-personalisatie; pas ná V1.5/DDS. Detail: [adaptive-workspace-engine.md](./adaptive-workspace-engine.md)

Detail: [geparkeerd.md](./geparkeerd.md)
