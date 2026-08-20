# WVB_01 — Werkvoorbereiding als stroom

**Opdrachtgever:** René Vink · **Datum:** 8 augustus 2026 · **Uitvoerder:** Replit
**Systeem:** FPS Connect (`vinkrene-jpg/fps-one`, branch `main`)
**Gaat vooraf aan:** `INKOOP_01`. De werkvoorbereiding bepaalt wát er nodig is en wannéér; de inkoop vult dat in.

**Verplicht vooraf lezen:** `replit.md` · `docs/ontwikkelfilosofie.md` · `docs/kwaliteitskader.md` · `docs/PRODUCTION_RUNBOOK.md` · `.agents/memory/MEMORY.md`

---

## 1. Wat het moet worden

De werkvoorbereiding moet **één stroom** worden met keuzeopties onderweg, in plaats van twaalf tabbladen waarin iemand moet weten waar hij moet zijn.

**Gemeten op 8 augustus 2026:** een opdracht heeft nu twaalf tabbladen — `werkbegroting` · `inkoopplanning` · `inkoopcoach` · `onderaanneming` · `uitvoeringsplanning` · `materiaal` · `nacalculatie` · `planning` · `ai` · `ai-regisseur` · `uitvoering` · `oplevering`. Daar zit zichtbare dubbeling in: `planning` naast `uitvoeringsplanning`, `ai` naast `ai-regisseur`, `inkoopplanning` naast `inkoopcoach`.

**Ruben doet 80% van de werkvoorbereiding en inkoop.** Wat hier niet in de stroom komt, blijft persoonsafhankelijk.

---

## 2. Eerst inventariseren, dan pas bouwen

**Lever eerst een tabel op** met de twaalf tabbladen: wat elk tabblad doet, welke gegevens het toont, wie het gebruikt, en waar het overlapt met een ander tabblad. Benoem expliciet wat dood is.

Bouw pas daarna. Dit voorkomt dat er een dertiende weg bij komt naast twaalf bestaande — het patroon dat bij de medewerker-onboarding drie consolidatierondes in drie dagen kostte.

---

## 3. De stroom

### Stap 1 — Soort opdracht

De eerste keuze bepaalt de rest van de route:

| Soort | Route |
|---|---|
| **Vaste prijs** | calculatie → offerte → werkbegroting → uitvoering |
| **Regie** | regievoorwaarden en tarieven → direct uitvoering → nacalculatie |

**Bij regie wordt de calculatie en de offerte overgeslagen, maar nooit de opdracht.** Die moet bestaan, want het werknummer erin is waarop gefactureerd wordt — en `FACTUUR_02` wijst een factuur zonder bekende opdracht af.

**Hergebruik de bestaande regiemodule.** `routes/regie.ts` en `regie_voorwaarden` bestaan al, met materiaalopslag, materieelopslag, transport- en voorrijkosten, toeslagen voor avond, weekend en spoed, en betaaltermijn. Bouw geen tweede.

**Eén toevoeging: `regie_tarieven` kent nu alleen een uurtarief per functiegroep.** René spreekt met klanten ook **dagdeeltarieven** af. Voeg dat toe als eigen tariefsoort — niet als "een dagdeel is vier uur", want dan komt wat er in het systeem staat niet overeen met wat er is afgesproken.

### Stap 2 — Wat er gedaan moet worden

**De calculatie is leidend, niet de spots.** Een spot ontstaat alleen als er een opname is geweest, en soms is dat maar een steekproef met een paar spots. Werkbegroting en planning rusten dus op de **calculatieregels**.

Dit is bindend: bouw geen planning per spot. Dat werkt niet zodra een opname een steekproef was.

### Stap 3 — Wat er nodig is en wanneer

Per calculatieregel de materiaalbehoefte, met een **nodig-op-datum**. Die datum is het scharnierpunt van de hele keten: hij stuurt de inkoop (`INKOOP_01`) en hij is wat de monteur wil weten.

Wat in het magazijn ligt telt af tegen de behoefte; de rest is inkoopbehoefte.

### Stap 4 — Wie en wanneer

**Personeelsplanning en projectplanning zijn dezelfde omgeving.** Voeg `planning` en `uitvoeringsplanning` samen tot één — twee namen voor hetzelfde is precies waar mensen op vastlopen.

**Plan op het niveau waarop werkelijk gewerkt wordt:**
- doorvoeren worden opgeteld met een aantal uren ervoor, niet per stuk ingepland;
- bij woongebouwen is de eenheid **een woning**, één of twee per dag, met de bekende onderdelen: meterkast, badkamer, cv, voordeur.

**De uitvoeringsplanning wijzigt vlak voor of tijdens het werk.** Wijzigen moet dus makkelijk zijn, en een wijziging mag de inkoop- en facturatieplanning niet stil ontregelen — zie stap 6.

### Stap 5 — Wat vooraf geregeld moet zijn

Toegang tot het pand, contactpersoon ter plaatse, werkvergunning, V&G, en of er hoogwerker of steiger nodig is. Als afvinkbare lijst per opdracht, met wat ontbreekt zichtbaar vóór de startdatum.

### Stap 6 — De drie planningen tegen elkaar

**Inkoopplanning, facturatieplanning en uitvoeringsplanning moeten zoveel mogelijk op elkaar liggen.** Dat is een kasstroomvraagstuk: te vroeg inkopen is voorfinanciering, te laat factureren ook.

**De AI helpt de werkvoorbereider hierbij door te signaleren wanneer ze uit elkaar lopen**, niet door zelf te plannen. Bijvoorbeeld: er is materiaal besteld voor week 12 terwijl de uitvoering naar week 18 is verschoven, of er is uitgevoerd zonder dat er een factuurmoment tegenover staat.

Sluit aan op het bestaande signaalmechanisme; bouw geen tweede meldingenstroom.

### Stap 7 — Overdracht naar de uitvoering

De monteur moet op locatie weten wat hij waar doet: tekeningen, de lijst met werkzaamheden, foto's uit de opname. **En wat er nog aankomt en wanneer** — dat komt uit `INKOOP_01`.

### Regiewerk

**Bij regie is de werkvoorbereiding meestal adhoc.** De stroom moet daar dus grotendeels overslaan: opdracht met tarieven, direct plannen, uitvoeren, nacalculeren. Dwing geen stappen af die er niet zijn.

---

## 4. Acceptatie

1. Ik open een opdracht en zie één weg, geen twaalf tabbladen waarvan ik moet weten welke ik nodig heb.
2. Bij het aanmaken kies ik vaste prijs of regie, en de rest van de stroom past zich daarop aan.
3. Bij regie kan ik een dagdeeltarief afspreken zoals ik dat met de klant doe.
4. De werkbegroting komt uit de calculatie, niet uit spots.
5. Per materiaalregel staat wanneer het nodig is.
6. Personeelsplanning en projectplanning zijn één scherm.
7. Ik kan een woning als eenheid plannen, en doorvoeren als een aantal uren.
8. Verschuift de uitvoering, dan zie ik dat de inkoop- of facturatieplanning niet meer klopt.
9. Bij een regieopdracht word ik niet door stappen geleid die er niet zijn.

**Bewijs bij oplevering:** de inventarisatietabel uit §2, plus één echte opdracht met vaste prijs en één regieopdracht die beide van begin tot eind door de stroom zijn gegaan.

## 5. Wat niet mag

- Geen dertiende weg naast de twaalf bestaande — eerst inventariseren.
- Geen planning per spot.
- Geen tweede regiemodule naast `routes/regie.ts`.
- Geen dagdeel dat stilzwijgend als uren wordt weggeschreven.
- Geen opdracht zonder werknummer, ook niet bij regie.
- Geen tweede meldingenstroom naast het bestaande signaalmechanisme.
- Niet melden dat het klaar is op grond van een geslaagde build of typecheck.
