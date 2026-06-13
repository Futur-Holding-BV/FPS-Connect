# Roadmap — Geparkeerd

NIET vooruit bouwen. Vastgelegd als toekomstige richting onder de Ontwikkelstop. Zie [`README.md`](./README.md) voor het overzicht en [`replit.md`](../../replit.md) voor de Ontwikkelstop-regel en de drie sporen.

## S.G. Constructies als aparte bibliotheeklaag (vastgelegd, geparkeerd — NIET vooruit bouwen)

Nieuw vastgelegd onderdeel, geparkeerd onder de ontwikkelstop. Naast de bestaande keten Applicatie → Toepassing → Document komt een aparte bibliotheeklaag voor s.g.-constructies: scheidende/bouwkundige constructies, branddeuren en opwaarderingen (een bestaande constructie naar een hogere brandwerendheid brengen). Reden voor een eigen laag: een s.g.-constructie is geen spot-afwerking maar de onderliggende bouwkundige scheiding waarop afwerkingen rusten; de AI stelt deze bewust NIET vast (zie de AI-fotoherkenning-sectie in [`gebouwd.md`](./gebouwd.md)). Datamodel, koppelingen (bv. s.g.-constructie ↔ document/toepassing) en UI worden uitgewerkt bij formeel akkoord op deze fase.

## Biometrisch inloggen mobiele app — vingerafdruk & gezichtsherkenning (vastgelegd, geparkeerd — NIET vooruit bouwen)

Op verzoek van de gebruiker vastgelegd als nieuwe wens, geparkeerd onder de Ontwikkelstop. Biometrisch ontgrendelen (vingerafdruk en gezichtsherkenning) als snelle login in de FPS Monteur-app, bovenop de bestaande authenticatie. Sluit aan op de mobiele monteurflow (V2.0) en wordt pas uitgewerkt ná formeel akkoord en nadat V2.0 is opgepakt.

Kaders/uitgangspunten (uit te werken bij akkoord):
- Biometrie is een aanvulling, geen vervanging: het ontgrendelt een al ingerichte sessie/apparaatkoppeling. De eerste keer inloggen blijft via gebruikersnaam/wachtwoord + verplichte authenticator-app (TOTP).
- Gebruikt het toestel-eigen biometrieslot (Face ID / Touch ID / Android biometrics) via `expo-local-authentication`; biometrische gegevens verlaten het toestel nooit en worden niet op de server opgeslagen.
- Tokens/credentials worden achter het biometrieslot in veilige opslag bewaard (`expo-secure-store` / keychain / keystore), met wachtwoord + TOTP als terugvaloptie.
- Per gebruiker in- en uitschakelbaar; optioneel afdwingbaar via de bevoegdheden-matrix.

## Toolbox & berichten met leesbevestiging (mobiel) — vastgelegd, geparkeerd — NIET vooruit bouwen

Op verzoek van de gebruiker vastgelegd als nieuwe wens, geparkeerd onder de Ontwikkelstop. Een berichten-/communicatiekanaal tussen kantoor en de werkvloer: een projectleider of directeur plaatst (uploadt) toolbox-onderwerpen en berichten in FPS Connect, en de monteur/het personeel leest ze in de FPS Monteur-app en bevestigt actief "gelezen en begrepen". Bedoeld voor toolboxen en soortgelijke eenrichtings-instructies met verplichte bevestiging, en breder voor interacties tussen projectleider/directeur en monteur/personeel.

Sluit aan op de mobiele monteurflow (V2.0) en op de "digitale toolboxen" + "berichten" uit de V3.0 medewerkerapp-visie (zie hieronder). Wordt pas uitgewerkt ná formeel akkoord en nadat V2.0 is opgepakt.

Kaders/uitgangspunten (uit te werken bij akkoord):
- **Beheerzijde (FPS Connect / web):** toolbox-onderwerp of bericht aanmaken met titel, tekst en bijlagen (pdf/foto/video); doelgroep kiezen (individu, functie, project, of iedereen); publiceren.
- **Mobiele zijde (FPS Monteur-app):** de medewerker ziet openstaande toolboxen/berichten, opent en leest ze, en bevestigt expliciet "gelezen en begrepen" (leesbevestiging). De bevestiging legt wie + tijdstempel vast (audittrail); optioneel een digitale handtekening of een korte controlevraag (sluit aan op de V3.0 digitale toolboxen met quizvragen/ondertekening).
- **Opvolging voor management:** overzicht wie wel/niet heeft bevestigd, met signalering en eventueel herinnering; bevestigingen zijn herleidbaar en bewaard.
- **Toegang:** gating via de bevoegdheden-matrix (`lib/permissies`), niet via rol-strings; lezen vs. plaatsen/beheren als aparte bevoegdheid.
- **Afbakening:** start als eenrichtingscommunicatie met verplichte bevestiging; vrije tweerichtings-chat is bewust buiten de eerste opzet en kan later worden afgewogen.

## V3.0 — Personeel / Medewerkerportaal (vastgelegd, NIET bouwen voor V2.0 afgerond)

Consolideert de eerdere V2.1 (desktop) en V2.2 (mobiel). NIET bouwen voordat V2.0 (mobiele monteurflow) formeel akkoord is. Mogelijke vervanger van Apployed. De bevoegdheden-matrix in `lib/permissies` wordt uitgebreid met module-ID's `personeel` en `verlof` zodat toegang per gebruiker instelbaar blijft.

Doelgroepen: hoofdbeheerder, beheerder-financien, HRM-adviseur.

Desktop/webapp:
- Medewerkersprofielen (persoonsgegevens, noodcontact, BSN/contractgegevens)
- Contractbeheer (type, uren, looptijd, verlengingen)
- Verlofsaldo en verlofopbouw (automatisch of handmatig)
- Verlofaanvragen — aanvragen, goedkeuren/afwijzen, kalenderoverzicht
- Ziekte en verzuim bijhouden
- Urenoverzichten per medewerker of team
- Documenten (arbeidsovereenkomsten, loonstroken, certificaten)
- Opleidingen en cursussen (bijhouden voortgang en certificaten)
- Gereedschap en materieel beheer per medewerker
- Rapportages (verlofsaldo, verzuimpercentage, urenbezetting)

Mobiel (optionele module in FPS Monteur-app): de app wordt modulair, modules per gebruiker aan- of uitzetten via de bevoegdheden-matrix.
- **Monteurmodule** (V2.0): werk, route, plattegronden, spots, foto's, gereedmelden.
- **Medewerkermodule** (V3.0): eigen profiel, verlof aanvragen, verlofsaldo bekijken, uren invullen, weekplanning inzien, eigen gereedschap bekijken, instructies/cursussen afronden.

### HRM-module FPS Groep — volledige uitwerking van V3.0 (vastgelegd, toekomstige richting — NIET bouwen)

Strategische ontwerpopdracht, vastgelegd als toekomstige richting. Valt onder de Ontwikkelstop en de V3.0-regel (NIET bouwen vóór formeel akkoord en vóór V2.0 is afgerond). Dit is de grote visie achter V3.0: geen losse personeelsadministratie maar een geïntegreerde HRM-module die de medewerker over de volledige loopbaan begeleidt (sollicitatie → opleiding → inzetbaarheid → beoordeling → doorgroei → uitstroom).

**Scope (FPS Groep-breed):** FPS Bouw, FPS Brandpreventie, FPS Onderhoud en toekomstige werkmaatschappijen zoals Fuegro. Volledig integreerbaar met planning, projecten, opleidingen, kwaliteitsborging en de mobiele medewerkersapp.

**Doelgroepen:** monteurs brandpreventie (CAO Metaal & Techniek), timmermannen bouw (CAO Bouw & Infra), kantoorpersoneel (CAO Metaal & Techniek), projectleiders, werkvoorbereiders, directie, HRM, externe inhuur, uitzendkrachten, leerlingen/BBL.

**Hoofdmodules:**
1. **Personeelsdossiers** — per medewerker: persoons- en contactgegevens, contracten, functie, salarisgegevens, werkmaatschappij, CAO-indeling, documenten (identiteitsbewijzen, rijbewijs, verklaringen), verzuimgegevens, historie.
2. **Functiehuis** — per werkmaatschappij. FPS Bouw: timmerman, voorman, uitvoerder, projectleider. FPS Brandpreventie: monteur, applicateur, voorman, projectleider. Kantoor: administratie, werkvoorbereiding, calculatie, HRM, financieel, directie. Per functie: taken, verantwoordelijkheden, competenties, opleidingsvereisten, doorgroeipad.
3. **Opleidingen & certificeringen** — VCA, BHV, hoogwerker, rolsteiger, veilig werken, producttrainingen, interne opleidingen, toolboxen. Automatische signalering van verlopen certificaten/opleidingen en verplichte herhalingen.
4. **Bekwaamheidsmatrix** — per medewerker registreren welke werkzaamheden, producten, inspecties en zelfstandige projecten zijn toegestaan, met bekwaamheidsniveaus (voorbeeld Hilti-applicaties: niet bevoegd / onder begeleiding / zelfstandig / specialist / trainer).
5. **Beoordeling & ontwikkeling** — functionerings- en beoordelingsgesprekken, persoonlijke doelstellingen, ontwikkelplannen, competentiebeoordelingen, opleidingsadviezen.
6. **Planning & inzetbaarheid** — koppeling met de projectplanning (beschikbaarheid, vakanties, verlof, ziekte, opleidingen, certificeringen). Het systeem voorkomt inzet van medewerkers zonder de juiste bevoegdheden.
7. **Werving & selectie** — vacatures, sollicitaties, gesprekken, beoordelingen, contractvoorstellen, onboarding.
8. **Fuegro-integratie** — leerlingen, uitzendkrachten, externe monteurs, opleidingstrajecten, uitlenen van personeel.

**Mobiele medewerkersapp** (eigen app per medewerker, als modulaire uitbreiding van de FPS Monteur-app):
- Persoonlijk dashboard: agenda, projecten, werkbonnen, opleidingen, certificaten, verlofsaldo, berichten.
- Mijn projecten: projectinformatie, contactpersonen, werkbonnen, tekeningen, documenten, veiligheidsinformatie.
- Mijn opleidingen: behaalde opleidingen, verlopen certificaten, inschrijven, toolboxen bekijken, digitale toetsen.
- Digitale toolboxen: video, tekst, foto's, quizvragen, digitale ondertekening.
- Verlof & verzuim: verlof aanvragen, verlofhistorie, ziekmelding, herstelmelding.
- Beoordelingen: persoonlijke doelstellingen, ontwikkelpunten, opleidingsadviezen.
- Kennisbank: productinformatie, applicaties, werkinstructies, montagehandleidingen, ETA's, DoP's.

**AI-functionaliteit** (conform de bestaande AI-conventie: AI stelt voor, een mens beslist):
- **AI Persoonlijke Coach** (per medewerker): opleidings-, certificerings-, veiligheids- en loopbaanadvies.
- **AI Projectcoach**: analyseert uitgevoerde werkzaamheden, productiviteit, kwaliteit, foutmeldingen en opleidingsbehoefte.
- **AI Management Dashboard**: inzicht in bezettingsgraad, opleidingsstatus, verloop, verzuim, productiviteit en competentieontwikkeling.

**Strategische doelstelling:** uitgroeien tot een centraal platform voor personeelsontwikkeling, kwaliteitsborging, planning en kennismanagement binnen de volledige FPS Groep.

**Latere aanvulling (vastgelegd):** een bonus- & prestatiemodule (kwartaalbonussen, productiviteit, doorgroei van monteurs) sluit naadloos op deze HRM-module aan en maakt het systeem aantrekkelijker voor medewerkers.

## AI Brandveiligheidsmanager / AI Calculator / Klantmodule (strategische lijn, vastgelegd — toekomstige richting, NIET bouwen)

Strategische roadmaplijn, vastgelegd als toekomstige richting; nog niet bouwen (Ontwikkelstop). Conform de bestaande AI-conventie: AI stelt voor en een mens controleert/bevestigt; de AI verstuurt nooit zelfstandig definitieve offertes.

**Onderdelen:**
- **Klantportaal** — gebouwdossiers, definitieve documenten, werkbonnen en communicatie.
- **Documentenbeheer** — projectdocumentatie, versiebeheer, toegangscontrole, definitieve archivering en klantinformatie.
- **Continuïteitslaag project ↔ onderhoud** — definitieve projectdocumenten vormen de input voor onderhoud, herinspecties en mogelijke onderhoudscontracten.
- **AI-klantverwerking** — verwerkt klantwerkbonnen, foto's en documenten, reageert richting klant binnen afgesproken kaders en maakt werkbonvoorstellen.
- **Zelflerend** — AI leert van spots, oplossingen, uren, materialen, calculaties en offertes.
- **AI-calculatie & offerte** — op basis van spots: voorzieningen voorstellen, risico's benoemen, een interne calculatie maken en later een conceptofferte genereren. Het bestaande FPS-offerteformat is het uitgangspunt voor de offertegenerator. AI mag voorlopig geen definitieve offertes zelfstandig versturen; altijd controle door een medewerker.

**Eigen fasering (losse strategische lijn — eigen labels om botsing met de bestaande roadmapnummering te vermijden).** De bestaande V1.3–V2.0 blijven ongewijzigd leidend. De oorspronkelijk aangedragen V-nummers zijn bewust NIET overgenomen, omdat V1.3 (Spots & uitvoering — momenteel in aanbouw), V1.4 (Opleverrapportage), V1.5 (Rapportenmodule) en V2.0 (Mobiele monteur-app) al iets anders betekenen. Onderstaande stappen verwijzen naar de bestaande fasen waarop ze aansluiten:
- **Stap K1 — Fundament afronden**: huidige inspectie- en documentfunctionaliteit afronden; sluit aan op de bestaande V1.3 (Spots & uitvoering) en V1.4 (Opleverrapportage).
- **Stap K2 — Document Management & Dossierbeheer**: bouwt voort op de bibliotheek (V1.2) en de Rapportenmodule (V1.5).
- **Stap K3 — Klantportaal en gebouwdossiers**: bouwt voort op K2 (definitieve documenten, gebouwdossiers en communicatie).
- **Stap K4 — AI Calculator, AI Offertegenerator en AI Klantmanager**: de AI-laag bovenop K1–K3; sluit aan ná de mobiele flow (V2.0).
