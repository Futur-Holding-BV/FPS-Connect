# BACKUP_01 — Een kopie buiten de machine

**Opdrachtgever:** René Vink · **Datum:** 8 augustus 2026 · **Uitvoerder:** Replit
**Systeem:** FPS Connect (`vinkrene-jpg/fps-one`, branch `main`)

**Verplicht vooraf lezen:** `replit.md` · `docs/ontwikkelfilosofie.md` · `docs/kwaliteitskader.md` · `docs/PRODUCTION_RUNBOOK.md` · `.agents/memory/MEMORY.md`

---

## 1. Wat er nu is — gemeten 8 augustus 2026

Alles draait op één VPS (`connect.fps-one.nl`):

- **database**: PostgreSQL als container `db` — `postgresql://fps:***@db:5432/fps_connect`
- **bestanden**: **MinIO** als container `minio` op diezelfde machine — `S3_ENDPOINT: http://minio:9000`, bucket `fps-connect-bestanden`. Daar staan documenten, foto's, cv's, gescande facturen en salarisdocumenten
- **back-up**: `lib/backupService.ts` voert `pg_dump` uit, comprimeert en **uploadt naar object storage** — dat is dezelfde MinIO op dezelfde machine

**Twee gaten:**

1. **De back-up staat naast het origineel.** Gezocht op offsite, rsync, restic, borg en een tweede S3-bestemming: **geen externe kopie gevonden.** Valt die server uit of raakt hij versleuteld, dan is de back-up mee weg.
2. **Alleen de database wordt geback-upt.** Er is niets dat de MinIO-bucket kopieert. Alle documenten en foto's hangen aan één bucket op één machine, zonder kopie.

Punt 83 uit `SCHULD_01` (alarm bij een mislukte back-up) is gebouwd en blijft nuttig — maar dat dekt *of hij draait*, niet *waar hij staat*.

---

## 2. Wat er komt

**Een kopie buiten de machine, van álles, die aantoonbaar terug te zetten is.**

René heeft een NAS thuis. Dat is een echte externe locatie — ander gebouw, andere stroom, andere verbinding, andere partij. Dat lost het grootste deel op, mits het goed wordt aangesloten.

---

## 3. Het bepalende ontwerpbesluit: halen, niet brengen

**De NAS haalt de back-up op. De VPS stuurt hem niet.**

Zou de VPS naar de NAS pushen, dan heeft die VPS toegangsgegevens voor de NAS. Wie de server overneemt, kan dan ook de back-ups wissen — en dan is een externe kopie alsnog waardeloos. Dat is precies hoe ransomware werkt.

Daarom:

- de NAS start de verbinding volgens een schema (bijvoorbeeld dagelijks 's nachts);
- de VPS krijgt **geen enkel toegangsgegeven voor de NAS**;
- het account waarmee de NAS de VPS benadert heeft **alleen leesrechten**;
- op de NAS zelf kan de VPS niets verwijderen.

**Als de NAS de kant is die het initiatief neemt, is dit deels een instelling op de NAS en geen code.** Replit levert daarom wat aan de VPS-kant nodig is: een leesrekening, een vast pad, en een controleerbare inhoudsopgave. Wat er op de NAS ingesteld moet worden, wordt beschreven — niet gebouwd.

---

## 4. Wat er in de kopie zit

1. **De databasedump** — bestaat al.
2. **De volledige MinIO-bucket** `fps-connect-bestanden` — dit ontbreekt nu volledig.
3. **De configuratie**: `docker-compose.production.yml`, de omgevingsvariabelen **zonder de geheimen zelf**, en de migratiestand.

**De geheimen (wachtwoorden, sleutels, client secrets) horen niet in de back-up.** Die worden apart bewaard, buiten dit mechanisme. Een back-up die ook de sleutels bevat, maakt van elke gestolen kopie een volledige overname.

**Vermeld in het bewijs hoe groot de eerste volledige kopie is.** Bij een thuisverbinding kan de eerste overdracht lang duren; daarna is het aanvullend.

---

## 5. Bewaartermijnen

- **dagelijks**, veertien dagen bewaard;
- **wekelijks**, drie maanden bewaard;
- **maandelijks**, een jaar bewaard.

Reden voor die staffel: schade wordt vaak pas na weken ontdekt. Alleen de back-up van gisteren hebben helpt niet als het vorige maand is misgegaan.

---

## 6. Versleuteling

De kopie bevat personeelsgegevens, salarisdocumenten en cv's.

- **versleuteld tijdens het overzetten** en **versleuteld op de NAS**;
- de sleutel wordt **niet op de VPS** bewaard;
- de NAS is niet vanaf internet bereikbaar, of alleen via een beveiligde verbinding.

Dit is geen extra: zonder versleuteling verplaats je persoonsgegevens naar een woonhuis en is een gestolen NAS een datalek.

---

## 7. Bewaking

Het bestaande alarm uit `SCHULD_01` punt 83 wordt uitgebreid:

- een melding als er **geen** kopie is binnengekomen binnen 36 uur;
- een melding als de kopie **verdacht klein** is ten opzichte van de vorige;
- de laatst geslaagde kopie met datum en omvang zichtbaar op één plek.

**Een stille back-up die stopt is erger dan geen back-up** — dan denk je dat je gedekt bent.

---

## 8. Het bewijs is een herstel, geen back-up

**Deze opdracht is niet af als er een kopie staat. Hij is af als er een aantoonbaar is teruggezet.**

Zet in een lege omgeving terug: de database, de bestanden, en start de applicatie. Toon aan dat een document uit de teruggezette bucket te openen is en dat de applicatie werkt.

**Meet en meld hoe lang dat duurde.** Dat getal is het antwoord op de vraag hoeveel dagen je bedrijf stilligt als het misgaat — en dat is het enige getal dat er hier werkelijk toe doet.

---

## 9. Wat René zelf moet regelen

- toegang tot de NAS: een gebruiker, een pad, en een verbinding vanaf de NAS naar de VPS;
- de sleutel voor de versleuteling, **buiten de VPS bewaard**;
- en de vraag of de VPS-provider zelf snapshots maakt — dat is niet uit de code af te lezen en verandert het beeld.

---

## 10. Wat er ondanks de NAS blijft staan

**De NAS staat bij René thuis.** Bij brand, waterschade of inbraak ben je zowel de NAS als het overzicht kwijt — en die risico's staan los van de VPS, maar ze zijn niet nul.

Voor het bedrijf dat René overdraagbaar wil houden, is een back-up in het huis van de directeur bovendien persoonsafhankelijk: precies wat hij wil afbouwen.

**Voorstel, ter beoordeling en niet in deze opdracht te bouwen:** naast de NAS één goedkope bucket bij een externe aanbieder, alleen voor de maandelijkse kopie. Dat kost enkele euro's per maand en dekt het geval waarin zowel de VPS als het huis wegvalt.

---

## 11. Acceptatie

1. Er staat dagelijks een kopie op de NAS, van database én bestanden.
2. De VPS heeft geen toegangsgegevens voor de NAS.
3. Het account waarmee de NAS de VPS benadert kan alleen lezen.
4. De kopie is versleuteld, en de sleutel staat niet op de VPS.
5. Er zijn dagelijkse, wekelijkse en maandelijkse kopieën volgens de staffel.
6. Blijft een kopie uit of is hij verdacht klein, dan krijg ik een melding.
7. **Een volledige herstelproef is uitgevoerd en de tijd die het kostte is gemeld.**
8. De geheimen zitten niet in de back-up.

**Bewijs bij oplevering:** het log van de herstelproef, met de duur, de omvang van de kopie, en een schermafdruk van de teruggezette applicatie met een geopend document uit de herstelde bestandsopslag.

## 12. Wat niet mag

- Geen push vanaf de VPS naar de NAS.
- Geen back-up zonder de bestanden.
- Geen onversleutelde kopie met personeelsgegevens.
- Geen geheimen in de back-up.
- Geen oplevering zonder uitgevoerde herstelproef.
- Niet melden dat het klaar is op grond van een geslaagde build of typecheck.

---

## Antwoorden en bevindingen in de repo

Antwoorden op vragen uit deze opdracht komen **niet alleen in de chat** maar worden vastgelegd in de repo:

- **vragen en bevindingen** → `docs/antwoorden/BACKUP_01.md`
- **metingen** → `docs/metingen/BACKUP_01_<onderwerp>.md`

Elk antwoord vermeldt: datum · commit-SHA waarop gemeten is · de vraag · het antwoord · en expliciet wat **gemeten** is en wat **aangenomen**. Is er een besluit van René nodig, schrijf dat als zodanig op — niet zelf invullen en doorbouwen.
