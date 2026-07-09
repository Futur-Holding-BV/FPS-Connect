# Diagnose-methodologie: bewijs versus inferentie

Referentiedocument voor alle toekomstige storingsonderzoeken (login-problemen, "het werkt niet in productie", ontbrekende data, enz.). Aanleiding: het authenticatie-onderzoek van juli 2026, waarin een conclusie als feit werd gepresenteerd terwijl het een gevolgtrekking was.

## Wat er misging (casus juli 2026)

**Gepresenteerde conclusie:** "De inlogpoging heeft de productieserver nooit bereikt."

**Waarop die gebaseerd was:**
1. Deployment-logs toonden niets na de shutdown van 5 juli.
2. Geen rij in de productietabel `login_pogingen` voor het betreffende account.

**De redeneerfout:** "geen spoor in twee kanalen" werd behandeld als bewijs van "geen request". Dat is een *inferentie* (afgeleide verklaring), geen *meting* — en die werd zonder voorbehoud als feit gerapporteerd. Op het moment van de conclusie was niet geverifieerd:

- of de logpijplijn van een autoscale-deployment (die naar nul schaalt en per request kort opstart) binnenkomende requests betrouwbaar registreert — dat bleek later wél zo te zijn, maar dat was toen een onbewezen aanname;
- welke requestpaden de server bereiken **zonder** een `login_pogingen`-rij achter te laten: een 429 van de rate-limiter (max 10 pogingen per 15 min per IP), een 400 bij ontbrekende velden, of een 500 vóór het registratiepunt;
- dat pre-serverfouten (DNS, TLS, CORS, client-side "Failed to fetch", verkeerde URL) *nergens* serverzijdig een spoor achterlaten — afwezigheid van een spoor onderscheidt die scenario's dus niet van "nooit geprobeerd".

**De diepere fout:** de eigenlijke oorzaak lag een laag verder terug. Het account bleek nooit een wachtwoord te hebben gehad, omdat de bewerkdialoog het ingevulde wachtwoord stilzwijgend niet meestuurde (frontend-bug, gefixt op 9 juli 2026). Door te fixeren op "bereikte het request de server?" kreeg de vraag "waarom zou zelfs een perfect aangekomen request falen?" te weinig gewicht — terwijl het signaal (`heeft_wachtwoord = FALSE`) er al lag.

## Regels voor toekomstige diagnoses

1. **Label elke uitspraak.** Gemeten feit ("healthz gaf 200 in 8,3s") of inferentie ("dus het request is nooit aangekomen"). Inferenties altijd met de aanname erbij die ze dragend maakt.
2. **Afwezigheid van bewijs telt pas na een positieve controle.** Voordat "het kanaal toont niets" iets betekent: injecteer zelf een bekend signaal (testrequest, testrij) en bevestig dat het kanaal dat signaal toont. Pas daarna mag stilte in dat kanaal als bewijs worden gewogen — en dan nog alleen binnen de gecontroleerde dekking en retentie.
3. **Benoem de dekking van elk kanaal.** Welke codepaden schrijven er NIET naartoe? Voor `login_pogingen`: 429 (rate-limit), 400 (validatie vooraf), 5xx vóór registratie. Voor request-logs: alles wat Express nooit bereikt. Een kanaal zonder gedocumenteerde dekking is een indicatie, geen bewijs.
4. **Reproduceer end-to-end waar mogelijk.** Eén zelf uitgevoerde reproductie (request → respons → databaserij) weegt zwaarder dan elke hoeveelheid passief loglezen.
5. **Werk hypothese-gedreven.** Meerdere verklaringen naast elkaar, per verklaring benoemen welk bewijs die zou falsificeren, en pas concluderen wanneer één verklaring overblijft. Nooit één plausibele inferentie als eindconclusie presenteren omdat het onderzoek daar toevallig stopte.
6. **Volg de causale keten tot de bron.** Als onderweg een afwijking wordt gevonden (zoals een account zonder wachtwoordhash), eerst verklaren hoe die afwijking is ontstaan voordat het onderzoek zich vernauwt tot één transportvraag.

## Standaard-controlepunten bij login-/productieonderzoek

- Productie-URL en status via de deployment-info opvragen (nooit uit env-variabelen van de ontwikkelomgeving afleiden).
- Positieve controle: zelf een herkenbaar testrequest sturen (bijv. `__agent_...@example.invalid`) en bevestigen dat logregel én databaserij verschijnen.
- Productie-database alleen read-only bevragen; schemadrift tussen dev en prod expliciet controleren (kolommen kunnen in prod ontbreken zolang niet opnieuw gepubliceerd is).
- Rate-limiter meenemen in de interpretatie: na 10 pogingen per 15 min per IP komt er wél een logregel maar géén `login_pogingen`-rij.
