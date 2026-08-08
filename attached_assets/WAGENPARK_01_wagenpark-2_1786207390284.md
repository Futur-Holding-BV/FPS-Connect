# WAGENPARK_01 — Mijn auto, papieren met vervaldatum, en de gaten dichten

**Opdracht voor Replit · 8 augustus 2026 · gemeten op `5479d8b` (`main`)**

---

## 1. Wat er al staat — niet opnieuw bouwen

Gemeten in de code, zodat hier niets dubbel ontstaat:

| Onderdeel | Stand |
|---|---|
| `routes/wagenpark.ts` (748 r.) + `routes/wagenpark-meldingen.ts` (713 r.) | compleet |
| Melden vanuit de app | `monteur-app/app/voertuig-melding.tsx` (580 r.) — schadelocatie, storingtype, foto's, offline concept, duplicaatcontrole |
| Doorzetten naar de garage | `POST /wagenpark/meldingen/:id/doorzetten-garage` — verstuurt echt mail |
| Traxgo | `lib/fleet-provider/traxgo.ts` (178 r.) + `POST /wagenpark/sync` |
| Koppeling monteur↔auto | `voertuigen.chauffeur_id` |
| Elf tabellen | voertuigen · onderhoud · kosten · ritten · sync_log · brandstof · meldingen · kwartaalcontrole · push_tokens · avg_logboek |

**Deze opdracht voegt toe en repareert; hij herbouwt niets van bovenstaande.**

Buiten scope, bewust: de dagelijkse controle op rijden buiten werktijd. Dat vraagt eerst een privacytoets (AVG, rittenregistratie van personeel) en een koppeling met de werkplanning. Aparte opdracht.

---

## 2. Papieren bij de auto — Jacqueline stelt zelf in

### 2.1 Het gat, gemeten

`document_koppelingen` heeft een database-`check` die alleen deze doeltypes toestaat:

```
gebouw · klant · offerte · dossier · voorziening · opdracht
```

`voertuig` ontbreekt. Autopapieren kunnen dus niet aan een auto gekoppeld worden. Bij het wagenpark bestaat alleen `foto_paden` op een melding.

### 2.2 Wat gebouwd wordt

1. **`voertuig` toevoegen aan de toegestane doeltypes** van `document_koppelingen`, via een genummerde migratie (de check zit in de database, niet alleen in de code).
2. **Een documentensectie op de voertuigpagina**: uploaden, lijst, openen, verwijderen. Meerdere documenten per auto.
3. **Per document een soort en een vervaldatum**, beide door Jacqueline zelf in te stellen — geen door de ontwikkelaar vastgezette lijst:
   - een beheerscherm waarin zij **documentsoorten** aanmaakt (naam, en per soort: heeft dit een vervaldatum ja/nee, en hoeveel dagen van tevoren wil ze gewaarschuwd worden)
   - bij het uploaden kiest ze de soort en vult ze de vervaldatum in als de soort er een heeft
   - een vaste startset wordt éénmalig aangemaakt zodat het scherm niet leeg begint: kentekenbewijs · verzekeringspolis · groene kaart · leasecontract · onderhoudscontract · schaderapport · keuringsrapport · tankpas/laadpas. **Deze set is bewerkbaar en verwijderbaar** — het is een startpunt, geen ingebakken lijst
4. **Vervaldatums worden bewaakt.** Nadert een datum binnen de door haar ingestelde termijn, dan ontstaat er een signaal. Zie §5 voor waar dat terechtkomt.

### 2.3 Wat níét

Geen tweede documentenmodule. De bestaande `documenten`-tabel en de uploadweg worden hergebruikt. Blijkt bij de bouw dat die tabel zich niet leent voor autopapieren omdat hij vol productdocumentatievelden staat (`fabrikant`, `en_norm`, `rapportnummer`, `getest_voor`), **meld dat dan terug vóór er iets nieuws naast wordt gezet** — dat is een besluit van René, geen ontwerpvrijheid.

---

## 3. "Mijn auto" in de monteur-app

Een nieuw scherm, bereikbaar vanuit het radiaalmenu, dat de auto toont die via `chauffeur_id` aan de ingelogde monteur hangt.

**Wat erop staat:**
- merk, type, kenteken, foto
- km-stand met de datum waarop die voor het laatst is bijgewerkt
- APK-datum, met een duidelijke markering als die binnen 60 dagen verloopt
- eerstvolgend onderhoud (op km of datum, wat het eerst komt)
- zijn eigen openstaande meldingen met status — inclusief "doorgezet naar garage", zodat hij ziet dat er iets mee gebeurt
- de knop "Melding maken", die naar het bestaande `voertuig-melding`-scherm gaat

**Harde eisen:**
- Hangt er geen auto aan de monteur, dan toont het scherm dat rustig ("er is nog geen auto aan je gekoppeld") en niet een foutmelding of een leeg scherm.
- Een monteur ziet **uitsluitend** zijn eigen auto en zijn eigen meldingen. Niet het wagenpark, niet de kosten, niet de ritten. Dit wordt afgedwongen in de gegevensvraag op de server, niet door de app iets te verbergen.
- Werkt offline op de laatst opgehaalde gegevens, in lijn met de bestaande `context/offline`.
- Geen papieren op dit scherm. De documenten uit §2 zijn kantoorwerk.

---

## 4. De elektrische bus

Er komt een elektrische bus in het wagenpark. Nu gaat alles uit van brandstof: `brandstof_importen`, `brandstof_regels`, en onderhoud op km-interval.

Minimaal in deze opdracht:
- een veld **aandrijving** op het voertuig (`diesel` · `benzine` · `elektrisch` · `hybride`), zodat elektrisch als zodanig herkenbaar is
- laadkosten kunnen worden vastgelegd — voeg `laden` toe als categorie bij `wagenpark_kosten` naast de bestaande brandstof
- bij een elektrisch voertuig worden brandstofvelden en -meldingen **niet getoond** in plaats van leeg getoond

Niet in deze opdracht: laadpasimport, verbruiksanalyse, actieradius. Meld wat daarvoor nodig zou zijn.

---

## 5. Meldingen komen bij Jacqueline aan

**Correctie op de eerste versie van deze opdracht.** De dagelijkse bewakingsloop uit `WERKBAK_01` **bestaat al**: `lib/bewakingsloop.ts` (626 r.), gestart bij opstart via `planDagelijkseBewakingsloop()` in `index.ts` r.83. De voeder `voedVerloopdatums()` (r.207) verwerkt **APK, verzekering en lease van voertuigen al**, met een venster van 30 dagen, en levert die af op de werkbak. Dat hoeft dus niet gebouwd te worden.

Wat er nog wél moet:

1. **De documentvervaldatums uit §2 als bron toevoegen** aan `voedVerloopdatums()` of als eigen voeder in dezelfde loop. Hergebruik `syncBron`; **geen nieuwe planner, geen nieuwe meldingentabel.**
2. **Onderhoudsinterval op km-basis en bandenwissel** zitten nog niet in de loop — die komen alleen uit `GET /wagenpark/ai-advies`, dat opgehaald moet worden. Toevoegen als bron.
3. **Ontvanger is de beheerder van het wagenpark**, niet een vast e-mailadres in de code. Er zit al een `toegewezen_beheerder_id` in het schema — gebruik dat, en is het leeg, val dan terug op wie recht `wagenpark` niveau 3 of hoger heeft. Meld hoe `voedVerloopdatums` de ontvanger nu bepaalt en of dat hiermee overeenkomt.
4. **De Traxgo-sync gaat nog niet vanzelf.** Gemeten: in `bewakingsloop.ts` komt geen enkele verwijzing naar de sync of de fleet-provider voor. `POST /wagenpark/sync` draait dus alleen op aanroep. Hang hem aan dezelfde loop. Draait hij een etmaal niet, dan is dát een werkbak-item — dat mechanisme bestaat al in de loop.

---

## 6. Twee reparaties

### 6.1 De garagemail is fire-and-forget

In `doorzetten-garage` wordt de status op `doorgezet_garage` gezet en de mail daarna verstuurd met alleen een waarschuwing bij mislukken. Jacqueline denkt dan dat de garage het weet.

Herstel: de status wordt pas `doorgezet_garage` als het versturen is gelukt. Mislukt het, dan blijft de melding open, komt er een duidelijke terugkoppeling in beeld, en verschijnt hij als signaal.

Daarbij: **een vaste garage per voertuig** (naam en e-mailadres), zodat het adres niet elke keer wordt ingetypt. Het blijft overschrijfbaar per melding.

### 6.2 Kenteken invullen vult de rest aan

Nu worden merk, type, bouwjaar, kleur en chassisnummer met de hand ingevoerd. De RDW publiceert deze gegevens als open data.

- bij het invoeren van een kenteken worden merk, handelsbenaming, voertuigsoort, kleur, datum eerste toelating en **APK-vervaldatum** opgehaald en als voorstel ingevuld
- alles blijft **overschrijfbaar** — het is invulhulp, geen waarheid
- lukt het ophalen niet, dan wordt het formulier gewoon handmatig ingevuld met een nette melding; het aanmaken mag hier nooit op stuklopen
- zichtbaar bij het voertuig dat de gegevens uit de RDW komen en op welke datum

---

## 7. Wat bewust niet in deze opdracht zit

- **AI-advies over de technische staat en het afstoten van een auto.** Dat kan pas als onderhoudsfacturen automatisch aan een voertuig gekoppeld worden, en die koppeling bestaat niet: `wagenpark_kosten` heeft alleen een losse `factuur_document_id` zonder relatie. Dit hoort bij de factuurstroom en wordt een eigen opdracht. Wat hier wél gebeurt: een **kostenoverzicht per auto per jaar** met totaal per categorie, zodat het cijfer er straks is om op te adviseren.
- De controle op rijden buiten werktijd (§1).
- Laadpas- en verbruiksanalyse voor elektrisch (§4).

---

## 8. Acceptatie

Met vermelding van commit-SHA, GitHub `main`-SHA en productie-SHA:

1. Jacqueline maakt een eigen documentsoort aan met een vervaldatum en een waarschuwingstermijn, koppelt een document aan een voertuig, en het staat op de voertuigpagina. Toon beide schermen.
2. Een document met een vervaldatum binnen de termijn levert een signaal op dat **bij de beheerder aankomt**. Toon het signaal én waar het terechtkwam.
3. Een monteur logt in op de app en ziet zijn eigen auto met km-stand, APK en zijn meldingen. Een tweede monteur ziet die van hém. Toon beide.
4. Een monteur zonder gekoppelde auto krijgt de rustige melding, geen fout.
5. Een monteur die het adres van een andere auto rechtstreeks aanroept, krijgt niets terug.
6. Een kenteken invoeren vult merk, type en APK-datum in. Toon een echt kenteken uit het eigen wagenpark en wat de RDW teruggaf.
7. Een elektrisch voertuig aanmaken: brandstofvelden zijn afwezig, `laden` is beschikbaar als kostencategorie.
8. Doorzetten naar de garage met een onbereikbaar e-mailadres: de status blijft open en er verschijnt een signaal. Daarna met een geldig adres: status wordt `doorgezet_garage`.
9. `POST /wagenpark/sync` draait aantoonbaar vanzelf. Toon de sync-log met een regel die niemand handmatig gestart heeft.
