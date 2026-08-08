# Antwoorden en bevindingen — NUMMER_01 (ENK-kenmerkketen)

## 8 augustus 2026 · gebouwd en bewezen op dev

**Opdracht:** de ENK-kenmerknummerketen G→M→C→O met inkoop (O…/I…, G…/I…) en facturen (O…/F… + fiscaal nummer per BV), volgens `attached_assets/NUMMER_01_kenmerknummers-2_1786175837356.md`.

### Wat is gebouwd

- **Doorlopende reeksen via DB-sequences** (`seq_nummer_g/m/c/o/i` + `factuurnummer_tellers` per BV) — nooit max+1; parallel aanmaken kan geen dubbele nummers opleveren (GEMETEN, punt D hieronder).
- **Kenmerk wordt altijd berekend** uit de actuele verwijzingen (`api-server/src/lib/kenmerk.ts`) en beweegt dus mee als bijv. een calculatie naar een ander gebouw verhuist. Alleen bij versturen/definitief maken wordt de berekende waarde als bevroren momentopname bij het document opgeslagen (offerte bij verzenden, factuur bij definitief, inkoopbon-versies in `inkoop_versies`).
- **BV-prefix** komt van `werkgevers.kenmerk_prefix` via gebouw→werkgever (bijv. `BP-G156/C590/O405`). Geen jaartallen in nummers.
- **Gebouwen:** nieuw gebouw krijgt automatisch het volgende G-werknummer; handmatig invoeren blijft mogelijk voor bestaande externe nummers (besluit 7).
- **Kopiëren vs. herzien:** offertes en calculaties kopiëren met een **nieuw** nummer (`POST /calculaties/:id/kopieer`, `POST /offertes/:id/kopieer`; kopie = concept, `gekopieerd_van_id` wijst terug). Inkoop krijgt **letter-herzieningen**: wijziging op een verzonden bon/order = `I088` → `I088a` met snapshot van de oude versie.
- **Verzonden offertes zijn server-side alleen-lezen** (409 op alle mutatieroutes), niet alleen in de UI.
- **Facturen (§4.6):** F-volgnummer per offerte bij aanmaken (F001, F002, … onder advisory-lock); het **fiscale factuurnummer per BV** wordt pas bij `POST /facturen/:id/definitief` uitgegeven — een concept verbruikt dus nooit een fiscaal nummer. Zonder bepaalbare BV: 422 met uitleg.
- **Voorraadinkoop (besluit 10):** magazijnorders trekken uit **dezelfde I-reeks** als projectbonnen; kenmerk hangt aan het magazijn-gebouw (`G002/I089`). Legacy `INK-jaar-…`-nummer blijft als weergaveveld bestaan.
- **UI:** kenmerk als niet-bewerkbare badge op calculatie-detail, offerte-studio en magazijn-inkooporders; API exposeert `nummer`/`kenmerk` op opnames, calculaties, offertes, bonnen, orders en facturen.

### Bewijs (GEMETEN, dev 8 aug — `scripts/src/bewijs-nummer01-kenmerkketen.ts`, alle punten groen)

- **A** — nieuw gebouw kreeg automatisch een G-nummer uit de sequence, zonder jaartal; tweede gebouw kreeg een ander nummer.
- **B** — opname exposeert het M-nummer.
- **C** — calculatie-kenmerk `BP-G…/C…` wordt berekend en **beweegt mee** bij gebouwwissel.
- **D** — 5 parallel aangemaakte calculaties → 5 unieke C-nummers.
- **E** — offerte-kenmerk `BP-G…/C…/O…`; kopie kreeg nieuw O-nummer als concept, origineel ongewijzigd.
- **F** — verzonden offerte: PATCH → 409; bevroren kenmerk blijft staan ook na gebouwwissel van de onderliggende calculatie.
- **G** — projectbon `O…/I…`; wijziging op verzonden bon → herziening `…a` + snapshot in `inkoop_versies`.
- **H** — voorraadinkoop trekt uit dezelfde I-reeks; kenmerk `G…/I…` aan het magazijn-gebouw.
- **I** — twee parallelle verkoopfacturen onder één offerte → exact F001+F002; definitief → fiscaal nummer `00001` per BV; concepten verhogen de fiscale teller niet; tweede keer definitief → 409.

### Koerscorrectie die je moet weten (BESLUIT NODIG: geen — al doorgevoerd, wel ter kennisname)

De offerte- en opdracht-koppeling `calculatie_id` verwees in de praktijk naar de **calculatiemodule** (`mod_calc_headers`), niet naar de oude `calculaties`-tabel. Migratie 0018 heeft de FK omgehangen en de C-reeks (`nummer`, `gekopieerd_van_id`, `verzonden_op`) op `mod_calc_headers` gezet — beide tabellen delen dezelfde `seq_nummer_c`, dus C-nummers blijven één doorlopende reeks.

### Actiepunt voor de accountant (AANGENOMEN)

Het fiscale factuurnummer per BV start bij `00001` (opgemaakt als 5 cijfers). Als een BV al een bestaande fiscale reeks heeft (uit het oude pakket), moet de teller in `factuurnummer_tellers` eenmalig op het laatst gebruikte nummer worden gezet vóór de eerste definitieve factuur. Dit is bewust niet gegokt.

### Architect-review verwerkt

- Fiscale invariant gesloten: het fiscale factuurnummer van een verkoopfactuur kan **niet** via aanmaken of de generieke PATCH worden gezet of gewijzigd (409); alleen `/definitief` geeft het uit.
- Dubbel-definitief-race gedicht: row-lock + hercheck ín de transactie, zodat twee gelijktijdige verzoeken nooit twee tellernummers verbruiken.
- Offerte verzenden is nu atomair (snapshot + bevriezing + statusovergang in één transactie onder advisory-lock).
- Herzieningen van projectbonnen én magazijnorders lopen transactioneel met row-lock (geen dubbele letters of dubbele snapshots; unieke constraint op `inkoop_versies` als vangnet).
- Ook `/magazijn/inkooporders/:id/verstuur` en `/ontvang` stonden op het verkeerde prefix — rechtgezet.

### Restpunten

- ~~E-mailverzending van offertes zelf is niet opnieuw e2e getest (mail-kanaal)~~ — **afgevinkt (8 aug 2026, task #835):** `scripts/src/bewijs-nummer01-verzendmail.ts` verstuurt een testoferte via het echte verzendpad (POST `/offertes/:id/verzenden` → Microsoft Graph, gedeelde postbus) naar een intern testadres. Bewezen: Graph accepteert de mail (succes-rij in `mail_logboek`, soort=offerte, geen foutcategorie), offerte op `verzonden`, kenmerk bevroren (gebouwwissel verandert het niet; PATCH → 409) en de publieke portaallink werkt. Kanttekening: het app-token heeft alleen `Mail.Send` (geen `Mail.Read`), dus de inbox-aankomst is bewezen op het niveau van Graph-acceptatie + logboek — de mailbox zelf is niet programmatisch uitleesbaar.
- Bugfix meegenomen: de magazijn-inkooporderroutes stonden op `/inkooporders` terwijl de API-spec en frontend `/magazijn/inkooporders` verwachten — routes rechtgezet.
- Herstel meegenomen: een eerdere revert had `routes/auth.ts` naar een kapotte oude staat teruggezet (o.a. 2FA-flows); de correcte pre-revert-versie is teruggehaald.
