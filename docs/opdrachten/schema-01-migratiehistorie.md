# SCHEMA_01 — Migratiehistorie herstellen

**Opdrachtgever:** René Vink · **Datum:** 7 augustus 2026 · **Uitvoerder:** Replit
**Systeem:** FPS Connect (`vinkrene-jpg/fps-one`, branch `main`)
**Lost op:** punten 87, 88 en 98 uit `docs/technische-schuld.md` — samen de zwaarste openstaande post.

**Verplicht vooraf lezen:** `replit.md` · `docs/ontwikkelfilosofie.md` · `docs/kwaliteitskader.md` · `docs/PRODUCTION_RUNBOOK.md` · `.agents/memory/MEMORY.md`

---

## 1. Waarom dit de zwaarste post is

Dit is geen theoretisch risico. Het heeft de productie al meerdere keren platgelegd. In het overdrachtsdocument staat het letterlijk: **de productielogin is meerdere keren uitgevallen doordat schema-afhankelijke code werd uitgerold vóórdat de bijbehorende migratie had gedraaid** — bij `moet_wachtwoord_wijzigen`, `medewerker_status` en `wizard_voortgang`.

**Gemeten op 7 augustus 2026:**

| Wat | Bevinding |
|---|---|
| Migratiebestanden in de repo | **vier**: `facturen-subtype.sql`, `magazijn-accountview-export.sql`, `pim-fase-a.sql`, `vge-guidance-context.sql` |
| Hoe het schema wordt bijgewerkt | `drizzle-kit push` (`lib/db/package.json`) — een ontwikkelgereedschap dat het schema aanpast tot het overeenkomt, zónder een spoor van wát er veranderd is |
| Schemamomentopname | **geen** `schema.sql` in de repo |
| Vangnet | `schema-healthcheck.mjs` draait ná de migratie en controleert of kritieke kolommen bestaan |

Vier migratiebestanden voor een systeem met meer dan honderd routebestanden betekent: **de geschiedenis van je database bestaat niet.** Er is geen manier om te zien welke wijziging wanneer is doorgevoerd, geen manier om een wijziging terug te draaien, en geen manier om vast te stellen of de productiedatabase nog overeenkomt met wat de code verwacht.

`drizzle-kit push` is bedoeld voor een ontwikkelmachine waar je de database gewoon weggooit als er iets misgaat. Op een productiesysteem met echte bedrijfsgegevens is het het verkeerde gereedschap: het kan stilzwijgend kolommen aanpassen of laten vallen zonder dat iemand ziet dat het gebeurd is.

**Eerlijk erbij:** het deployscript is op dit punt al zorgvuldiger dan gemiddeld — het bouwt het migratie-image vers, draait de migratie, en verifieert het schema daarna met een leescontrole. Die zorgvuldigheid is precies waarom het nu meestal goed gaat. Maar het vangnet zit ná de handeling; er is geen spoor vooraf.

---

## 2. Wat er gebouwd wordt

### 2.1 Een schemamomentopname vastleggen

Genereer uit de **productiedatabase** een volledige `schema.sql` — alle tabellen, kolommen, typen, indexen, verwijzingen en beperkingen — en leg die vast in de repo als `lib/db/schema.sql`.

Dit is het nulpunt. Vanaf nu is te zien wat er werkelijk in productie staat, en is elke afwijking zichtbaar.

**Belangrijk:** genereer hem uit productie, niet uit de ontwikkeldatabase. Wijken die twee af, dan is dát de eerste bevinding en moet die gemeld worden vóórdat er iets anders gebeurt.

### 2.2 Overstappen op genummerde migraties

Vanaf nu krijgt elke schemawijziging een eigen genummerd bestand in `lib/db/src/migrations/`, met:

- een oplopend nummer en een beschrijvende naam;
- de wijziging zelf;
- een korte toelichting bovenaan: wat verandert er en waarom.

`drizzle-kit push` verdwijnt uit het deployproces. Het script `push` mag blijven bestaan voor lokaal ontwikkelwerk, maar wordt in het deployscript vervangen door het toepassen van de migratiebestanden.

**Er komt een tabel bij die bijhoudt welke migraties zijn uitgevoerd**, met tijdstip. Dan is bij elke storing binnen tien seconden te zien of een migratie wel of niet gedraaid heeft — precies de vraag die bij de drie eerdere uitvallen niet te beantwoorden was.

### 2.3 De vier bestaande migratiebestanden inpassen

De vier bestaande bestanden krijgen een nummer en worden als reeds uitgevoerd gemarkeerd in de nieuwe tabel. Ze worden **niet** opnieuw gedraaid.

### 2.4 Een controle bij elke deploy

Vóór de migratie draait: klopt de huidige database met de laatst bekende migratiestand? Zo nee, stoppen en melden — niet doorgaan en hopen.

Ná de migratie blijft de bestaande `schema-healthcheck` gewoon draaien. Die vervangt niets, hij komt erbij.

### 2.5 Afwijking productie versus schema zichtbaar maken

Bouw een controle die de productiedatabase vergelijkt met `schema.sql` en verschillen meldt. Draai die bij elke deploy en meld het resultaat.

Dit is de directe bescherming tegen wat er drie keer is gebeurd: code die een kolom verwacht die er niet is.

---

## 3. Volgorde — dit is het gevaarlijkste deel van deze opdracht

Deze opdracht raakt het mechanisme dat de database wijzigt. Gaat dat mis, dan is de productie onbereikbaar.

1. **Eerst een verse back-up van de productiedatabase**, en aantoonbaar controleren dat die terug te zetten is. Niet aannemen dat de dagelijkse back-up werkt — punt 83 uit hetzelfde schulddocument meldt dat er geen alarm is als die stilletjes faalt.
2. Momentopname genereren en vastleggen. **Nog niets wijzigen.**
3. Migratietabel aanmaken en de vier bestaande bestanden als uitgevoerd markeren.
4. Deployscript omzetten.
5. Als eerste echte test: een kleine, onschuldige wijziging via de nieuwe weg — bijvoorbeeld de ontbrekende index uit punt 7 van het schulddocument (`documenten.entiteit_type` + `entiteit_id`). Die is nuttig, klein, en bewijst dat de keten werkt.

---

## 4. Acceptatie

1. Er staat een `schema.sql` in de repo die aantoonbaar uit productie is gegenereerd.
2. Er is een tabel die bijhoudt welke migraties zijn uitgevoerd, met tijdstip, en de vier bestaande staan erin als uitgevoerd.
3. `drizzle-kit push` komt niet meer voor in het deployproces.
4. Bij een deploy zie ik in de log: welke migraties er zijn gedraaid, of het schema overeenkomt, en of er verschillen zijn.
5. De testwijziging uit stap 5 is via de nieuwe weg doorgevoerd en de index bestaat aantoonbaar in productie.
6. Draai ik dezelfde deploy nog een keer, dan wordt er niets opnieuw gemigreerd.

**Bewijs bij oplevering:** de deploy-log van de testwijziging, een uitdraai van de migratietabel, het verschil tussen productie en `schema.sql` (leeg of verklaard), plus commit-SHA, GitHub main-SHA en actieve productie-SHA.

## 5. Wat niet mag

- Niet beginnen zonder een geverifieerde back-up.
- Geen bestaande gegevens aanraken. Deze opdracht wijzigt de structuur van het migratieproces, niet de inhoud van de database.
- Geen migratie die kolommen laat vallen. Verwijderen gebeurt in een aparte, expliciete opdracht.
- De bestaande `schema-healthcheck` niet vervangen — die blijft, als tweede vangnet.
- Niet melden dat het klaar is op grond van een geslaagde build of typecheck.
