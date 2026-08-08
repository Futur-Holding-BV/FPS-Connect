# LOON_01 — De loonstroom sluiten: SEPA uit de mail en het boekhouderportaal

**Opdrachtgever:** René Vink · **Datum:** 7 augustus 2026 · **Uitvoerder:** Replit
**Systeem:** FPS Connect (`vinkrene-jpg/fps-one`, branch `main`)
**Volgorde:** kan naast `FACTUUR_02` lopen. Raakt andere modules.

**Verplicht vooraf lezen:** `replit.md` · `docs/ontwikkelfilosofie.md` · `docs/kwaliteitskader.md` · `docs/PRODUCTION_RUNBOOK.md` · `.agents/memory/MEMORY.md`

---

## 1. Uitgangspunt: bouw niets nieuws

Voor de loonstroom bestaat al opvallend veel. **Connect genereert géén SEPA voor lonen** — die worden extern gemaakt en komen binnen. Wat ontbreekt zijn twee schakels tussen bestaande onderdelen.

**Wat er al is (gemeten 7 augustus 2026):**

| Onderdeel | Waar | Wat het doet |
|---|---|---|
| SCAB-mailmodule | `routes/scab-mail.ts` (284 r.) | uitgaande levering aan SCAB; eigen bevoegdheid `scab_mail` 1/2/3; tabellen `scab_mails` en `scab_mail_bijlagen`; filtering op jaar, maand en werkmaatschappij; AI-prompt `SCAB_MAIL_GENERATIE_PROMPT`; per werkgever een `scab_email_adres` en `boekhouder_naam` |
| SEPA-archief | `routes/salarisarchief.ts` | `/sepa-bestanden` met statussen `ontvangen` → `klaar_voor_bank` → `gedownload` → `verwerkt`, downloadroutes, auditlog per statuswijziging |
| Loonstrookjes publiceren | `salarisarchief.ts` | `POST /salarisarchief/documenten/:id/publiceer` en `POST /salarisarchief/batch-publiceer` |
| Medewerkerinzage | `salarisarchief.ts` | `GET /mijn/salarisdocumenten` en download-url |
| Boekhouderportaal | `routes/boekhouder.ts` | bevoegdheid `boekhouder_portaal` 1/2; dashboard telt per werkgever: openstaande salarismutaties, loon-outputbestanden, uploads, ontvangen SEPA-bestanden, SCAB-mails |

**Hoe de loonstroom in werkelijkheid loopt:**

- **FPS Bouw en Renovatie** valt onder CAO Bouw en loopt via **SCAB**. Jacqueline levert op **de 20e** de gewerkte uren, verlof en overige mutaties aan. SCAB stuurt het betaalbestand mét de SEPA **per mail** terug.
- **Voor de overige werkmaatschappijen** maakt de **boekhouder** de SEPA.

---

## 2. Schakel 1 — een binnengekomen SEPA belandt vanzelf in het archief

Nu komt de SEPA van SCAB (of van de boekhouder) per mail binnen en moet iemand hem handmatig in het salarisarchief zetten.

**Te bouwen:** het intake-mechanisme uit `FACTUUR_02` krijgt een extra actiesoort. Herkent de AI in een binnengekomen mail een SEPA-betaalbestand voor lonen, dan wordt dat bestand:

1. opgeslagen als `sepa_bestand` met status **`ontvangen`**;
2. gekoppeld aan de juiste **werkgever/werkmaatschappij** en aan de **periode** (jaar en maand);
3. gekoppeld aan de bronmail, zodat de herkomst altijd terug te vinden is;
4. zichtbaar in het boekhouderdashboard, dat ontvangen SEPA-bestanden al telt.

**Wat níét automatisch mag:** de status van `ontvangen` naar `klaar_voor_bank` zetten. Dat blijft een menselijke handeling — iemand kijkt ernaar en zet hem klaar. Er gaat hier geld weg; er mag geen bestand vanzelf betaalklaar komen te staan.

**Bij twijfel:** kan de werkgever of de periode niet met zekerheid bepaald worden, dan wordt het bestand wél opgeslagen maar als onvolledig gemarkeerd, en verschijnt het als gebeurtenis. Nooit een gok.

---

## 3. Schakel 2 — goedgekeurd verlof en declaraties naar de boekhouder

De boekhouder moet kunnen zien wat René heeft goedgekeurd, om het te verwerken op de loonstrookjes. Openstaande salarismutaties staan al in zijn dashboard; **goedgekeurd verlof en goedgekeurde declaraties niet.**

**Te bouwen:** breid het bestaande boekhouderdashboard en de bijbehorende overzichten uit met:

- **goedgekeurde declaraties** — `POST /declaraties/:id/goedkeuren` bestaat al; de goedgekeurde declaraties zijn alleen niet ontsloten naar het portaal;
- **goedgekeurde verlofaanvragen** — zoek eerst op waar verlof is ondergebracht; ga niet uit van een bestandsnaam.

Per regel toont het portaal minimaal: medewerker, periode, soort, bedrag of aantal uren, datum van goedkeuring en door wie.

**Belangrijk: de boekhouder ziet alleen wat is goedgekeurd.** Concepten, afgewezen aanvragen en nog te beoordelen posten blijven buiten zijn portaal.

**Voorkom dubbele verwerking:** een verlofpost of declaratie die de boekhouder heeft verwerkt, wordt als verwerkt gemarkeerd en verdwijnt uit zijn openstaande lijst. Zonder die markering verwerkt hij dezelfde declaratie de volgende maand opnieuw.

---

## 4. Toegang van de boekhouder

De boekhouder krijgt een eigen inlog, strak afgebakend via het bestaande bevoegdhedenmodel — **geen aparte constructie, geen gedeeld account.**

Hij mag:
- zijn portaal zien met openstaande mutaties, goedgekeurd verlof en goedgekeurde declaraties;
- SEPA-bestanden en loonoutput uploaden;
- loonstrookjes publiceren naar de medewerkeromgeving.

Hij mag **niet**: facturen zien, projecten zien, offertes zien, of iets buiten de loonadministratie. Controleer expliciet dat zijn bevoegdheid hem daar ook werkelijk buiten houdt — niet alleen dat de menu-items verborgen zijn.

---

## 5. Acceptatie — in gewone taal

1. Komt er een mail binnen van SCAB met een SEPA-bestand, dan staat dat bestand vanzelf in het salarisarchief, bij de juiste werkmaatschappij en periode.
2. Dat bestand staat op "ontvangen" — niet vanzelf op "klaar voor bank".
3. Vanaf het bestand kan ik terug naar de mail waar hij vandaan kwam.
4. De boekhouder ziet in zijn portaal welke verlofaanvragen en declaraties ik heb goedgekeurd, met medewerker, periode en bedrag.
5. Wat hij heeft verwerkt, verdwijnt uit zijn openstaande lijst en komt niet terug.
6. De boekhouder kan een loonstrookje publiceren en de medewerker ziet het in zijn eigen omgeving.
7. De boekhouder kan nergens bij facturen, projecten of offertes — ook niet door een adres in te typen.

**Bewijs bij oplevering:** een echte SCAB-mail met bijlage die correct is opgenomen, een goedgekeurde declaratie die in het boekhouderportaal verschijnt en na verwerking verdwijnt, en een poging van een boekhouderaccount om een factuurpagina te openen die correct wordt geweigerd. Plus commit-SHA, GitHub main-SHA, actieve productie-SHA.

## 6. Wat niet mag

- Geen SEPA-generatie voor lonen. Die bestanden komen extern binnen.
- Geen tweede SEPA-tabel of tweede statusreeks naast `sepa_bestanden`.
- Geen tweede publicatiemechanisme naast het bestaande.
- Geen automatische overgang naar `klaar_voor_bank`.
- Geen aanname over werkgever of periode bij twijfel.
- Niet melden dat het klaar is op grond van een geslaagde build of typecheck.
