# SNAGSTREAM_ARCHIEF_01 — dubbele uploads, zoeken en gebouwenlijst

**Datum:** 19 augustus 2026  
**Gemeten op werkboom vanaf commit:** `8866ec14389e6b32c2dd79ac4a9b66bfe6328320`  
**Meting:** `docs/metingen/SNAGSTREAM_ARCHIEF_01-meting.md`

## Antwoord

De drie gevraagde uitbreidingen zijn gebouwd en end-to-end bewezen.

### 1. Een rapport wordt maar één keer opgeslagen

- De browser berekent vóór opslag een SHA-256-vingerafdruk van de volledige
  bestandsinhoud en vraagt eerst aan de server of die inhoud al bekend is.
- Bij een exacte dubbel wordt geen nieuwe upload-URL aangevraagd en wordt geen
  tweede object of rapport opgeslagen. Het bestaande rapport opent met de
  oorspronkelijke uploaddatum en uploader.
- Dezelfde bestandsnaam met andere inhoud geeft een expliciet keuzescherm met de
  bestaande rapporten: **Dit is een vergissing** of **Ander rapport uploaden**.
  Ook een naamconflict dat pas tijdens een gelijktijdige upload ontstaat, komt in
  ditzelfde keuzescherm terecht.
- De server vertrouwt de browserhash niet blind. Een kortlevend uploadtoken is
  gebonden aan gebruiker, bestandsnaam, grootte, hash en objectpad. Bij
  voltooien controleert de server MIME-type, `%PDF-`-signatuur, grootte en
  SHA-256 opnieuw.
- Tijdelijke of mislukte uploads worden na dertig minuten opgeruimd. De opruimer
  draait bij serverstart en iedere vijftien minuten. Een tijdelijke opslagfout
  bewaart poging, tijdstip en fout voor retry; de rij verdwijnt pas na bewezen
  verwijdering of wanneer het object aantoonbaar al ontbreekt.
- Nieuwe PDF's staan onder de exclusieve opslagprefix
  `/objects/snagstream/` én krijgen pas na de beveiligde uploadtokenketen het
  serverveld `opslag_beheerd=true`. Alleen als zowel dit eigenaarschapsbewijs als
  de prefix klopt, mag de module een object verwijderen. Migratie 0104 zet
  bestaande rapporten fail-closed op `false`. Zo kan een oud, vrij
  client-supplied pad nooit een bestand van een andere module laten verwijderen.
- Bestaande rapporten zonder hash worden bij openen van het archief idempotent
  aangevuld. Bestaande hashdubbelen verschijnen in een zichtbare opruimlijst.
  Verwijderen ruimt zowel rapport als opgeslagen PDF op.

### 2. Eén zoekingang over rapporten en snags

Het archief zoekt server-side in:

- bestandsnaam;
- opdrachtgever;
- projectnaam;
- gebouwnaam;
- snagnummer;
- ruimte;
- verdieping;
- snagomschrijving.

Een snagtreffer toont rapport, snagcontext en PDF-pagina. De link opent direct
`/snagstream/:rapportId#snag-:snagId`; het detail scrolt naar de betreffende
snag. Er zijn filters op gebouw, rapportjaar en status.

### 3. Gebouwenoverzicht en ongekoppeld werk

Boven de rapportlijst staat een archiefoverzicht per gebouw met:

- aantal rapporten;
- datum van het recentste rapport;
- aantal snags.

Een gebouwkaart filtert direct naar de rapporten van dat gebouw. De groep
**Nog niet gekoppeld** staat bovenaan. Vanuit die groep kan een rapport direct
aan een gebouw worden gekoppeld.

## Gemeten module, route en bevoegdheid

De opdracht noemde geen aparte module of nieuwe route. De bestaande code is
daarom leidend gebleven:

| Onderdeel | Gemeten keuze |
|---|---|
| Webroute | bestaande `/snagstream` en `/snagstream/:id` |
| API | bestaande Snagstream-router onder `/api/snagstream/...` |
| Module | bestaande module `gebouwen`; er is geen nieuw recht toegevoegd |
| Lezen | `requireBevoegdheid("gebouwen", 1)` |
| Uploaden, koppelen, backfill, AI, overnemen en verwijderen | `requireBevoegdheid("gebouwen", 2)` |

**Geconstateerde afwijking in de oude code:** de bestaande middleware toetste
alleen het moduleniveau en scope-te Snagstream-rapporten niet op
gebouwtoewijzing. Dat is niet stil behouden. Alle lees- en schrijfpaden gebruiken
nu aanvullend de bestaande `effectieveContext`/`magBijGebouw`-scope. Een beperkt
account ziet toegewezen gebouwen en, fail-closed, alleen eigen ongekoppelde
uploads. Een organisatiebrede lijst van ongekoppelde stukken zou anders via
Snagstream alsnog gegevens buiten de gebouwscope tonen.

Ook de definitieve hashcontrole blijft globaal om één opslagkopie per inhoud af
te dwingen. Als de bestaande inhoud buiten de gebouwscope valt, krijgt de
aanvrager alleen een generieke 409 zonder rapportmetadata, bestandsnaam,
opslagpad of gebouwgegevens. De tijdelijke kopie wordt wel veilig opgeruimd.

## Bedrijfsworkflow

1. Kies PDF en eventueel gebouw.
2. Connect berekent de inhoudshash en controleert vóór opslag.
3. Exact bestaand: open het bestaande rapport; er wordt niets opgeslagen.
4. Zelfde naam/andere inhoud: vergelijk en kies bewust.
5. Nieuw: beveiligde tijdelijke upload, servercontrole en één archiefrecord.
6. Zoek later op rapportgegevens of inhoud van een snag.
7. Koppel ongekoppeld werk vanuit de bovenste archiefgroep.
8. Ruim historische dubbelen op via de zichtbare dubbelgroep; PDF en record
   worden samen verwijderd.

## Gemeten versus aangenomen

**Gemeten**

- Gerichte Playwright-test groen: tokenbinding, exacte dubbel, naamconflict en
  retry, snagzoeken met pagina, gebouwaggregatie, echte opslagcleanup
  (`GET 200 → DELETE 204 → GET 404`) en idempotent opruimen van een al ontbrekend
  object.
- Verificatiescript: **12/12** groen en bewijsdata volledig teruggedraaid.
- Volledige workspace-typecheck, migratieketen, schema-drift en
  migratiehernoemingscontrole groen.
- Handmatige browserdoorloop groen voor de uploaddialoog, duplicate-toast,
  naamconflictkeuze, zoekresultaat en directe snaglink.
- Ontwikkeldatabase na cleanup: 0 rapporten, 0 ontbrekende hashes,
  0 dubbelgroepen, 0 pending uploads en 0 open opruimretries.
- Onafhankelijke architectuur-/securityreview: **READY**, geen resterende
  blocker binnen deze scope.

**Aangenomen / niet als productiefeit gemeten**

- Er waren in de ontwikkeldata geen historische rapporten om werkelijk te
  backfillen; het backfill- en dubbelgroeppad is met geïsoleerde bewijsdata
  getest.
- De draaiende ontwikkelopslag is end-to-end getest. Dezelfde verwijderinterface
  is ook voor de S3/MinIO-backend geïmplementeerd en typechecked, maar er is in
  deze taak geen productie-uitrol of productie-object verwijderd.
