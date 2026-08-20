# SCHULD_01 — De overige openstaande P1-punten

**Opdrachtgever:** René Vink · **Datum:** 7 augustus 2026 · **Uitvoerder:** Replit
**Systeem:** FPS Connect (`vinkrene-jpg/fps-one`, branch `main`)
**Basis:** `docs/technische-schuld.md` (3 juli 2026), alle twintig P1-punten opnieuw geverifieerd tegen de code op 7 augustus 2026.

**Verplicht vooraf lezen:** `replit.md` · `docs/ontwikkelfilosofie.md` · `docs/kwaliteitskader.md` · `docs/PRODUCTION_RUNBOOK.md` · `.agents/memory/MEMORY.md`

---

## 1. Eerst: acht punten zijn al opgelost

Werk deze **niet** opnieuw uit. Geverifieerd tegen de huidige code:

| Punt | Was | Nu |
|---|---|---|
| 1 | index op `voorzieningen.gebouw_id` | `voorzieningen_gebouw_idx` bestaat |
| 2 | index op `activiteiten.gebouw_id` + tijdstip | `activiteiten_gebouw_tijdstip_idx` bestaat |
| 3 | index op `inspecties.gebouw_id` + type | `inspecties_gebouw_type_idx` bestaat |
| 4 | index op `onderhoud` + status + deadline | `onderhoud_gebouw_status_deadline_idx` bestaat |
| 5 | index op `chat_berichten.gesprek_id` | `chat_berichten_gesprek_aangemaakt_idx` bestaat |
| 6 | index op `document_koppelingen` | `document_koppelingen_doel_idx` bestaat |
| 14 | dossierbevriezing niet atomair | draait nu in `db.transaction()` |
| 87/88/98 | migratiehistorie | **aparte opdracht `SCHEMA_01`** |

**Werk `docs/technische-schuld.md` bij** zodat deze punten als opgelost gemarkeerd staan met datum. Een schulddocument dat niet klopt kost meer tijd dan het bespaart.

---

## 2. Wat nog echt open staat

### Blok A — Snelheidsremmen (punten 24 en 25)

**24 — Geen begrenzing op `/auth/*`.** Er is nergens een snelheidsrem op de inlogroutes. Iemand kan onbeperkt TOTP-codes proberen tegen een account. Opvallend: de installatieroute (`routes/installatie.ts`) hééft er wel een — het patroon bestaat dus al in huis, alleen niet op de plek waar het het meest telt.

Bouw: begrenzing per IP-adres én per account, met een oplopende wachttijd. Een geslaagde inlog wist de teller. Een geblokkeerde poging wordt gelogd, zodat zichtbaar is dát er geprobeerd wordt.

**25 — Geen begrenzing op de AI-routes.** Nu de mailstromen erbij komen, gaat dit van theoretisch naar echt: elke onbegrensde aanroep kost geld. Bouw een begrenzing per gebruiker per tijdseenheid, en een dagplafond over het geheel. Wordt het plafond geraakt, dan een duidelijke melding — geen stille fout.

### Blok B — Foutafhandeling (punten 21 en 36)

**36 — Er is geen centrale foutafhandeling.** `app.ts` heeft geen afsluitende foutafhandelaar.

**21 — Daardoor lekken databasefouten naar buiten.** Bij ongeveer twintig routes komen tabel- en kolomnamen mee in het antwoord aan de browser. Dat is precies de informatie waarmee iemand een aanval opbouwt.

Deze twee zijn één ingreep: **één centrale foutafhandelaar** die elke onverwachte fout opvangt, volledig logt aan de serverkant, en naar buiten alleen een neutrale melding met een verwijzingscode teruggeeft. Die code komt ook in het log, zodat een gebruiker hem kan doorgeven en jij hem terugvindt.

### Blok C — Transacties (punten 13, 15, 16)

Slechts 16 van de 112 routebestanden gebruiken transacties. Waar één handeling meerdere tabellen wijzigt, kan de helft slagen en de helft mislukken.

Twee zijn bij naam bekend en gaan over geld en rechten — begin daar:

- **15 — `POST /offertes/:id/opdracht`**: statusovergang zonder transactie.
- **16 — verlofaanvraag goedkeuren**: saldomutatie zonder transactie. Een half doorgevoerde goedkeuring betekent een verkeerd verlofsaldo.

**13 — de overige routes:** maak eerst een **inventarisatie** van alle routes die meer dan één tabel wijzigen zonder transactie, met per route wat er misgaat bij een halve mislukking. Lever die lijst op vóórdat er iets wordt aangepast. Dan bepalen we samen de volgorde in plaats van blind twintig routes te verbouwen.

### Blok D — Prestaties (punten 7 en 45)

**7 — Ontbrekende index** op `documenten.entiteit_type` + `entiteit_id`. De andere zes zijn er al; deze is overgeslagen. **Doe deze via de nieuwe migratieweg uit `SCHEMA_01`** — hij is klein en onschuldig, en daarmee de ideale eerste test van die keten.

**45 — N+1 bij het gebouwenoverzicht.** Per gebouw worden drie losse bevragingen gedaan voor klant, partijen en spotaantal. Bij honderd gebouwen zijn dat driehonderd bevragingen voor één scherm. Vervang door bevragingen die de gegevens in één keer ophalen.

### Blok E — Back-ups (punt 83)

**83 — Geen alarm als een back-up faalt.** De dagelijkse back-up kan stilletjes stoppen zonder dat iemand het merkt. Dat merk je pas op het moment dat je hem nodig hebt.

Bouw: na elke back-uppoging een controle op de uitkomst en de bestandsgrootte, en bij een fout of een verdacht kleine uitkomst een melding. **Verifieer ook eenmalig dat de meest recente back-up daadwerkelijk terug te zetten is** — een back-up die niet getest is, is geen back-up.

**Dit punt gaat vooraf aan `SCHEMA_01`**, want die opdracht begint met "eerst een geverifieerde back-up".

---

## 3. Volgorde

1. **83** — back-upalarm en een teruggezette back-up bewijzen. Alles hierna leunt hierop.
2. **24 en 25** — snelheidsremmen. Klein werk, direct effect.
3. **21 en 36** — centrale foutafhandeling. Eén ingreep, twintig routes veiliger.
4. **`SCHEMA_01`** — migratiehistorie, met punt **7** als eerste testmigratie.
5. **15 en 16** — de twee bekende transacties.
6. **13** — inventarisatie opleveren, daarna pas bouwen.
7. **45** — het gebouwenoverzicht.

---

## 4. Acceptatie

Per punt geldt: **een bewijs dat het gedrag werkelijk veranderd is**, niet dat de code is aangepast.

- Bij 24: een reeks foutieve inlogpogingen wordt aantoonbaar geblokkeerd, en dat staat in het log.
- Bij 25: het dagplafond wordt geraakt in een test en levert een nette melding op.
- Bij 21/36: een bewust uitgelokte databasefout levert aan de browserkant géén tabel- of kolomnaam meer op, maar wel een verwijzingscode die in het log terug te vinden is.
- Bij 15/16: een half mislukte handeling laat aantoonbaar niets half doorgevoerd achter.
- Bij 45: het aantal bevragingen voor het gebouwenoverzicht is gemeten vóór en ná.
- Bij 83: een opzettelijk mislukte back-up levert een melding op.

**Werk bij elk afgerond punt `docs/technische-schuld.md` bij** met datum en de manier waarop het is bewezen.

## 5. Wat niet mag

- Niet de acht al opgeloste punten opnieuw uitvoeren.
- Bij punt 13 niet bouwen vóór de inventarisatie is opgeleverd.
- Geen nieuwe parallelle foutafhandeling naast de centrale.
- Niet melden dat het klaar is op grond van een geslaagde build of typecheck.
