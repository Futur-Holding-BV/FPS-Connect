# Meting BANK_01 — bankafschriften en automatisch afletteren

Datum: 20 augustus 2026  
Gemeten commit: `b7f9d61cc5ec9c7b6ae2d6241fa956d94c95dc43`

## Vraag

Welke bouwstenen voor CAMT.053-import, mailboxinname, afletteren,
betaalbatchsluiting, G-rekeningherkenning en AccountView bestaan aantoonbaar al,
en welke onderdelen ontbreken vóór BANK_01?

## Meetwijze

Deze meting is uitgevoerd op de broncode en migratieketen van de gemeten commit.
Er is niet aangenomen dat een kolom, route of proces bestaat wanneer die niet in
de bron of een genummerde migratie kon worden aangewezen. Productiedata en
Microsoft Graph zijn in deze fase niet geraadpleegd.

## 1. Bankrekeningen en koppeling aan de werkmaatschappij

**GEMETEN**

- `werkgever_bankrekeningen` legt `werkgever_id`, IBAN, tenaamstelling en één of
  meer doelen vast (`lib/db/src/schema/hrm.ts:69-80`; migratie
  `0079_werkgever-bankrekeningen.sql:7-16`).
- De doelen zijn `ontvangst`, `crediteuren`, `loon` en `g_rekening`. Per
  werkmaatschappij kan ieder doel maar op één rekening voorkomen door partiële
  unieke indexen (`0080_bankrekening-doel-uniek.sql:5-12`).
- De combinatie werkgever + IBAN is uniek, maar hetzelfde IBAN kan technisch nog
  bij twee verschillende werkgevers voorkomen. Voor een afschrift moet dus
  expliciet worden geëist dat een genormaliseerd IBAN over alle werkgevers exact
  één keer voorkomt.
- `haalOntvangstIban()` gebruikt de rekening met doel `ontvangst` en leest niet
  meer uit het legacy veld `werkgevers.iban`
  (`artifacts/api-server/src/lib/werkgeverIban.ts:1-17`).

**ONTBREEKT**

- Er is geen resolver die een afschrift-IBAN fail-closed aan exact één
  werkmaatschappij koppelt.
- Er is geen importdossier of archiefkoppeling voor een oorspronkelijk
  bankbestand.

## 2. Openstaande posten

**GEMETEN**

- Inkoop- en verkoopfacturen staan samen in `facturen`, onderscheiden door
  `type` (`lib/db/src/schema/facturen.ts:53-75`).
- De betaaltoestand bestaat uit `betaalstatus`, `betaaldatum`,
  `terugkoppeling_op` en `betaald_op`
  (`lib/db/src/schema/facturen.ts:117-142`).
- Een openstaande inkoopfactuur voor de betaalbatch is feitelijk een
  inkoopfactuur die niet is afgekeurd, geen `betaald_op` heeft en waarvan
  `betaalstatus` niet `betaald` is
  (`artifacts/api-server/src/routes/betaalbatch.ts:102-117`).
- Verkoopfacturen hebben geen aparte openstaande-posten-tabel; BANK_01 moet
  dezelfde factuurbron gebruiken en het type plus teken van de bankmutatie
  respecteren.

**ONTBREEKT**

- Er is geen vastgelegde koppeling tussen een bankmutatie en een factuur.
- Er is geen restbedragmodel voor deel- of verzamelbetalingen. Die gevallen
  mogen daarom niet automatisch worden afgeletterd.
- Er is geen werklijst voor onbekende of meervoudig passende betalingen.

## 3. Crediteuren-betaalbatch en SEPA-referenties

**GEMETEN**

- Migratie `0090_betaalbatches.sql:5-36` introduceert batches en regels. De
  huidige batchstatussen zijn `concept`, `bestand_aangemaakt`, `bevestigd` en
  `geannuleerd`.
- De route hercontroleert de facturen onder een transactieslot vóór het aanmaken
  van een batch (`artifacts/api-server/src/routes/betaalbatch.ts:143-201`).
- Het pain.001-bestand gebruikt batchreferentie `FPS-BATCH-{id}` en per regel
  de eenduidige EndToEndId `FPS-BATCH-{id}-{factuurId}`
  (`artifacts/api-server/src/routes/betaalbatch.ts:217-235`).
- De huidige handmatige bevestiging zet de batch op `bevestigd` en markeert alle
  regels als betaald (`artifacts/api-server/src/routes/betaalbatch.ts:246-276`).
  Het broncommentaar vermeldt expliciet dat deze handeling bestaat omdat een
  CAMT/MT940-terugkoppeling ontbreekt.

**ONTBREEKT**

- De aparte status `uitgevoerd`, die uitsluitend door bankbewijs mag ontstaan.
- Reconciliatiestatus en bankmutatiekoppeling per betaalbatchregel.
- Een controle die de batch pas sluit wanneer iedere regel exact één bewezen
  bankmutatie heeft.

## 4. G-rekeninggegevens

**GEMETEN**

- Een werkgeversrekening kan doel `g_rekening` hebben
  (`lib/db/src/schema/hrm.ts:69-80`).
- Een leverancier kan `g_rekening_van_toepassing`, een G-rekening-IBAN en een
  percentage hebben (`lib/db/src/schema/leveranciers.ts:54-59`).
- Een factuur bevat `g_rekening_van_toepassing`, `g_rekening_bedrag` en
  `normaal_bedrag` (`lib/db/src/schema/facturen.ts:172-179`).
- G-rekeningfacturen worden nu bewust geweigerd voor de betaalbatch, omdat
  verdeelde betaling handwerk is
  (`artifacts/api-server/src/routes/betaalbatch.ts:77-84`).

**ONTBREEKT**

- Bankmutaties kennen nog geen G-rekeningmarkering.
- Er is geen automatische allocatie van twee betalingen over één
  G-rekeningfactuur. BANK_01 mag die daarom alleen herkennen en filterbaar
  maken, niet zonder exact bewijs automatisch verdelen.

## 5. AccountView-keten

**GEMETEN**

- AccountView-configuratie, gekoppelde werkgever/BV en dagboeken staan in
  `accountview_instellingen`
  (`lib/db/src/schema/facturen.ts:21-44`).
- `accountviewExportService.ts` is de gedeelde factuurexportkern. De service
  controleert boekvelden, goedkeuring, BV/administratie, claimt vóór de externe
  call en schrijft een duurzaam exportlog met status en payloadhash.
- De service herstelt een crash na een geslaagde export uit het bestaande log,
  zodat een factuur niet opnieuw extern wordt aangeboden.
- Handmatige, automatische en batchgewijze factuurexport gebruiken dezelfde
  service. Een tweede AccountView-client of losse bankboekingsroute bestaat
  niet en mag niet worden toegevoegd.

**ONTBREEKT**

- Het gedeelde exportlog kan alleen aan `factuur_id` hangen. Voor bankmutaties
  is nog geen claim-/exportregistratie beschikbaar.
- Er is nog geen AccountView-payloadtype voor bankmutaties.

## 6. Microsoft werk-inbox, toegang en synchronisatie

**GEMETEN**

- OAuth-tokens zijn per gebruiker opgeslagen met versleutelde access- en
  refresh-token, scope, verloop en `refresh_mislukt_op`
  (`lib/db/src/schema/werk-inbox.ts:7-25`).
- Mailboxen zijn organisatiebezit, met eigen ACL
  `werk_inbox_mailbox_toegang`; rechten zijn `lezen`, `behandelen` en
  `beheren` (`lib/db/src/schema/werk-inbox.ts:27-62`).
- Mail wordt duurzaam gededupliceerd op mailboxadres + Graph message-id
  (`lib/db/src/schema/werk-inbox.ts:64-107`).
- De Graph-service haalt alle actieve, voor de gebruiker toegankelijke
  mailboxen op, schrijft mails idempotent weg en zet `laatst_gesynct_op`
  (`artifacts/api-server/src/services/werkInboxGraph.ts:619-696`).
- Bijlagen worden met Graph-id, naam, contenttype, grootte en bytes opgehaald
  (`artifacts/api-server/src/services/werkInboxGraph.ts:334-365`).
- De bestaande pipelines hebben elk een eigen verwerkingsclaim op de mail
  (`factuur_verwerkt_op`, `aanvraag_verwerkt_op`, `sepa_verwerkt_op`).
- De bewaker constateert een ontbrekende werkende Microsoft-koppeling of een
  te lang stille mailbox, dedupliceert het alarm 24 uur en stuurt een duurzame
  beheerdersmelding (`artifacts/api-server/src/services/factuurstroomService.ts:852-925`).

**ONTBREEKT**

- Een expliciete mailboxvlag voor bankafschriften.
- Een eigen bankafschriftclaim op mailniveau en duurzame uniciteit op mailbox,
  message-id en attachment-id.
- De bijlagenservice retourneert nu een lege lijst bij ontbrekend token of een
  Graph-fout. Voor bankafschriften moet dit als zichtbare fout eindigen; een
  ontbrekende bron mag niet als “geen bijlagen” worden geïnterpreteerd.
- Er is geen bank-specifiek importfout-/reeks-hiatsignaal.

## 7. Rechten

**GEMETEN**

- Autorisatie is matrixgestuurd in `@workspace/permissies`; routes gebruiken
  `requireBevoegdheid()` en horen geen profielnaam te controleren.
- `Administratie` heeft financieel niveau 4; `Externe boekhouder` heeft
  financieel niveau 1 (`lib/permissies/src/index.ts:426-449`).
- Er bestaat nog geen aparte module/bevoegdheid voor bankafschriftinname en
  afletteren.

**ONTBREEKT**

- Een afzonderlijke matrixsleutel die uitsluitend in de presets Administratie
  en Externe boekhouder wordt toegekend. Zonder die sleutel zou een generiek
  financieel recht te breed zijn.

## 8. CAMT.053, MT940, volledigheid en idempotentie

**GEMETEN**

- `fast-xml-parser` is al een runtime-afhankelijkheid van de API-server.
- De repository bevat pain.001-opbouw en pain.001-looninname, maar geen
  CAMT.053- of MT940-parser.
- `docs/metingen/ADMINISTRATIE_02-meting.md:32-41` en
  `docs/antwoorden/ADMINISTRATIE_02.md:63-71` noemen het ontbreken van
  bankafschriftimport expliciet.

**ONTBREEKT**

- Namespace-onafhankelijke CAMT.053-inname voor meerdere rekeningen,
  afschriften, dagen en transactiedetails.
- Gelabelde legacy-inname van MT940.
- Weigering van DTD/externe entiteiten en een harde bestandslimiet.
- Controle van openingssaldo + mutatiesom = eindsaldo.
- Controle op ontbrekende of dubbele afschriftvolgnummers.
- Bestandshash-idempotentie en harde uniciteit van rekening +
  bankbronreferentie.

## 9. Vastgestelde bouwgrenzen

Op basis van de gemeten toestand gelden voor de bouw:

1. Upload en mailbox roepen exact dezelfde importservice aan.
2. Het hele bestand wordt eerst geparsed en gevalideerd; bij een onbekend of
   dubbelzinnig IBAN wordt niets definitief opgeslagen.
3. CAMT.053 is leidend. MT940 krijgt een zichtbaar legacy-label en geen nieuwe
   functionaliteit mag ervan afhangen.
4. Alleen één kandidaat met exact bedrag én een betrouwbare referentie mag
   automatisch worden afgeletterd.
5. Deelbetalingen, verzamelbetalingen, ontbrekende referenties en meerdere
   kandidaten gaan naar de werklijst.
6. `bevestigd` blijft de oude handmatige toestand; alleen volledig bankbewijs
   zet een batch op `uitgevoerd`.
7. Microsoft-token-, Exchange- en verwerkingsfouten blijven zichtbaar op de
   oorspronkelijke mail en gaan door de bestaande duurzame signaleringsketen.
8. AccountView-uitvoer wordt als nieuw brontype aan de bestaande gedeelde
   exportkern gekoppeld; er komt geen parallelle client.

## Fase-0-conclusie vóór de bouw

De benodigde bronnen voor werkgeversrekeningen, facturen, betaalbatch,
G-rekeninggegevens, Microsoft-synchronisatie, ACL, stilstandbewaking en
AccountView bestaan aantoonbaar. Een afschriftmodel, veilige CAMT/MT940-parser,
volledigheidscontrole, duurzame bronidentiteit, aflettermotor, werklijst,
batchstatus `uitgevoerd`, bankrechten en gebruikersscherm ontbreken volledig.
De uitgangssituatie bevestigt daarmee dat BANK_01 nieuw gebouwd moet worden
boven op — en niet naast — de bestaande financiële en Microsoft-ketens.

## 10. Bouwresultaat

De bouw is uitgevoerd binnen de hierboven vastgestelde grenzen:

- De additieve migraties `0110_bankafschriften.sql`,
  `0122_accountview-bankdagboek.sql` en
  `0123_bankafschrift-crashherstel.sql` leggen importdossiers, archieven,
  afschriften, bankmutaties, voorstellen, audit, mailboxclaims,
  betaalbatchbewijs en AccountView-claims vast. De actuele driftcontrole telt
  5.538 verwachte objecten en meldt geen drift.
- `bankafschriftImportService.ts` is de enige import- en aflettermotor voor
  upload en mailbox. De service valideert het hele bestand vóór definitieve
  databaseopslag, resolveert elk IBAN globaal naar exact één
  werkgever-bankrekening, archiveert de oorspronkelijke bytes per betrokken
  werkmaatschappij en gebruikt centen voor saldo- en bedragvergelijkingen.
- `camt053Parser.ts` verwerkt namespace-onafhankelijk meerdere statements,
  rekeningen, dagen en transactiedetails. DTD/entities, te grote bestanden,
  saldofouten en transacties zonder betrouwbare bankreferentie worden
  geweigerd. Rekening-, balans-, entry- en transactiedetailvaluta moeten
  expliciet EUR zijn; bedragen worden alleen als volledig decimaal met maximaal
  twee decimalen geaccepteerd en de richting moet exact `CRDT` of `DBIT` zijn.
  Er vindt geen impliciete valutaconversie of tolerant `parseFloat`-pad plaats.
  Bij één transactiedetail moet het detailbedrag exact gelijk zijn aan het
  omhullende `Ntry`-bedrag; bij meerdere details moet hun som exact aansluiten.
  Alle statement- en importtotalen worden met `BigInt` berekend en bedragen plus
  mutatiesommen moeten binnen het bereik van de bestaande `numeric(14,2)`-kolommen
  vallen; er is geen stille afronding boven `Number.MAX_SAFE_INTEGER`.
  `mt940Parser.ts` handhaaft dezelfde EUR-poort en is uitsluitend bereikbaar als
  zichtbaar gelabelde legacy-terugval.
- Bestandshashes zijn uniek. Bankmutaties zijn daarnaast hard uniek op
  bankrekening + bankreferentie. Objectarchieven krijgen per importpoging een
  unieke sleutel, zodat de cleanup van een verliezende gelijktijdige
  hash-import nooit het archief van de winnaar kan verwijderen.
- De reekscontrole draait transactioneel onder een advisory lock per
  bankrekening. Nieuwe statements worden samen met de bestaande chronologie
  beoordeeld op voorganger én opvolger. Een saldoaansluitingsfout blokkeert het
  hele bestand; een volgnummer-/datumhiaat blijft zichtbaar en mailt duurzaam.
  Een historische backfill kan het hiaat van een reeds opgeslagen opvolger
  aantoonbaar sluiten.
- Creditmutaties matchen verkoopfacturen; debetmutaties matchen
  inkoopfacturen en `FPS-BATCH-{batchId}-{factuurId}`. Alleen één exacte
  combinatie van betrouwbare referentie en volledig bedrag wordt automatisch
  verwerkt. Deel-, verzamel-, referentieloze of meervoudige gevallen blijven
  met gerangschikte redenen op de werklijst.
- Een volledig door bankmutaties bewezen betaalbatch wordt transactioneel
  `uitgevoerd`. De bestaande handmatige bevestiging blijft bewust de oudere
  toestand `bevestigd` en kan vanuit de legacyflow facturen als betaald
  markeren, maar krijgt op zichzelf geen `uitgevoerd_import_id` en geldt dus
  niet als BANK_01-bankbewijs. Als een later afschrift daarna wél alle
  batchregels exact bewijst, promoveert de batch pas op dat moment naar
  `uitgevoerd`.
- G-rekeningmutaties zijn herkenbaar en filterbaar vanuit eigen rekeningdoel,
  tegenrekening en bestaande factuur-/leverancierscontext.
- Alleen mailboxen met de expliciete bankafschriftvlag worden verwerkt.
  Graph-bijlagen gaan door dezelfde importmotor als uploads. Claims zijn uniek
  op mailbox + bericht + bijlage en hebben token/lease-crashherstel. Een
  geldige duplicate wordt niet opnieuw geïmporteerd; een actieve claim maakt
  de mail niet voortijdig gereed; een permanente invoerfout, gemengde
  ongeldige bijlage of Graph-/toegangsfout blijft op de oorspronkelijke mail
  zichtbaar en roept de bestaande duurzame faalmeldingsroute aan.
- Bankmutaties gebruiken de bestaande AccountView-client, instellingen,
  werkgevercontrole, exportlogs en faalmail. Alleen het expliciete bankdagboek
  is geldig; er is geen inkoop-/verkoopdagboekfallback. Een verlopen externe
  claim wordt nooit automatisch opnieuw verzonden maar wordt `onzeker`.
  Administratie moet na controle expliciet óf een bestaand AccountView-ID
  bevestigen óf de mutatie gemotiveerd vrijgeven voor één nieuwe poging.
- De matrixmodule `bankafschriften` geeft uitsluitend de bestaande presets
  Administratie en Externe boekhouder toegang. API-routes gebruiken de
  effectieve matrixbevoegdheid; de webinterface verbergt menu en scherm zonder
  recht en bevat geen profiel- of rolnaamcontrole.

## 11. Reproduceerbaar bewijs

Uitgevoerd op 20 augustus 2026 tegen de developmentdatabase:

1. `pnpm exec vitest run artifacts/api-server/src/lib/bankafschriftParser.test.ts artifacts/api-server/src/services/bankafschriftImportService.test.ts artifacts/api-server/src/services/bankafschriftMailboxService.test.ts`
   — **167/167 groen**. De privacyvrije fixtures dekken ING, Rabobank en ABN
   AMRO, CAMT.053, MT940-legacy, meerdere statements/rekeningen,
   DTD/entities, 10-MiB-grens, saldo en betrouwbare bronreferenties. Aanvullende
   adversarial tests bewijzen weigering van niet-EUR rekening-, balans-, entry-
   en transactiedetailvaluta, numerieke voorvoegsels met rommel,
   exponentnotatie, te veel decimalen en ontbrekende of onbekende
   credit-/debetindicaties. Ook een afwijkend enkel transactiedetail en een
   afwijkende som van meerdere transactiedetails worden fail-closed geweigerd.
   CAMT en MT940 bevatten daarnaast een adversarial reeks waarvan de exacte
   mutatiesom 2 cent is, maar een gewone `number`-som foutief 1 cent oplevert.
   De gedeelde DB-decimaaltests dekken de positieve en negatieve
   `numeric(14,2)`-grens en weigeren niet-canonieke invoer.
2. `pnpm --filter @workspace/api-server run verificatie-bank01` —
   **GESLAAGD**. De echte ketenproef bewijst:
   - één CAMT-bestand met twee rekeningen, twee dagen en twee
     werkmaatschappijarchieven;
   - duplicate upload = nul nieuwe afschriften/mutaties;
   - onbekend én dubbelzinnig IBAN = volledige weigering;
   - interne saldofout en onjuiste aansluiting op een bestaande opvolger =
     volledige weigering;
    - een niet-EUR-bestand met verder exact passende factuur- en
      betaalbatchreferenties wordt vóór opslag geweigerd; factuur, batch en
      batchregel blijven aantoonbaar ongewijzigd;
    - een transactiedetail van €500 onder een afwijkend `Ntry`-bedrag wordt
      vóór opslag geweigerd en kan de exact passende €500-factuur niet afletteren;
    - 182 elkaar opheffende grensbedragen plus een exact passende betaling worden
      met `BigInt` gecontroleerd; een 1-cent-afgerond vals eindsaldo wordt vóór
      opslag geweigerd en kan de factuur niet afletteren;
    - een handmatig verkoopvoorstel en een handmatig betaalbatchvoorstel verwerken
      positieve en negatieve DB-decimalen exact en transactioneel;
   - volgnummerhiaat, duurzame melding en sluiting door historische backfill;
   - exacte verkoop-, inkoop- en betaalbatchmatch, twee ambigue voorstellen,
     G-rekeningmarkering en audit;
   - batch `uitgevoerd` door volledig bankbewijs naast een onaangeraakte
     handmatig `bevestigd` batch, plus promotie van `bevestigd` naar
     `uitgevoerd` zodra een later afschrift alle regels bewijst;
   - Graph-bijlage via dezelfde importmotor, message/attachment-deduplicatie,
     lease-overname, permanente foutclaim en zichtbare Graph-403;
   - AccountView-weigering vóór aflettering, idempotent geslaagd-logherstel en
     `onzeker`-crashherstel met beide expliciete gebruikerskeuzes.
3. `pnpm --filter @workspace/api-server run typecheck` en
   `pnpm --filter @workspace/firevault run typecheck` — **groen**.
4. `pnpm --filter @workspace/db run drift-check` — **geen drift**.
5. API- en Firevault-workflows zijn na de laatste codewijziging schoon
   herstart. De API bouwt en luistert op poort 8080; Vite start zonder
   BANK_01-runtime- of browserconsolefouten.
6. De Playwright-browserproef is **PASS**:
   - een bevoegd testprofiel ziet Financieel → Bankafschriften en bereikt de
     werkruimte;
   - CAMT.053 staat als primaire upload en MT940 als `Legacy fallback`;
   - mutatie-, status-, IBAN- en G-rekeningfilters verschijnen eenmaal;
   - een disposable mutatie met AccountView-status `onzeker` houdt beide
     acties dicht zonder controletoelichting, laat vrijgeven pas daarna toe en
     eist aanvullend een boekings-ID voor bevestigen;
   - een profiel zonder `bankafschriften:1` ziet het bankafschriftmenu niet en
     krijgt op de rechtstreekse mutatie-API aantoonbaar HTTP 403.
7. De onafhankelijke architectuur-eindreview is **PASS** zonder resterende
   blokkerende bevindingen. De review heeft expliciet mailboxlease-eigendom,
   AccountView-transportonzekerheid, historische reeks/backfill,
   objectarchief-races en `bevestigd` → `uitgevoerd` uitsluitend na volledig
   bankbewijs herbeoordeeld.

De ketenproef gebruikt unieke tijdelijke data en verwijdert na afloop
importen, archiefobjecten, claims, bewijsfacturen, batches, mailboxmails en
faalmail-wachtrijregels.
