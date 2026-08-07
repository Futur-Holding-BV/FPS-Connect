# INKOOP_AI_01 — vóór/ná-vergelijking en bewijs

**Datum:** 7 augustus 2026 · **Status:** mechanisme gebouwd en bewezen; acceptatie op échte inkoopplannen wacht op data (zie nulbevinding).

## Nulbevinding (belangrijk, voor René)

Op 7 augustus 2026 bevat de omgeving **geen enkele** inkoopbon, inkoopplanregel, factuurregel, nacalculatie of werkbegroting. De acceptatie op "twee echte inkoopplannen en één afgeronde opdracht" kan dus pas zodra er echte inkoop- en uitvoeringsdata in het systeem staat (dezelfde bevinding als bij CALCULATIE_AI_01). Tot die tijd zegt het systeem eerlijk "onbekend" — bewezen gedrag.

## Wat er gebouwd is

Eén module (`inkoopEigenCijfers.ts`) bouwt deterministische eigen-cijfersblokken uit bestaande tabellen (geen tweede prijzenbron):
- **A. Wat FPS zelf betaalde** — mediaan/laagste/hoogste per artikel uit bestelde/geleverde inkoopbonnen + verwerkte/betaalde inkoopfacturen, met aantal waarnemingen en periode. Onder de drie waarnemingen: ONBEKEND.
- **B. Leveranciers met historie** — alle leveranciers die het artikel eerder leverden, mét hun prijs. De AI kiest er nooit één; de inkoper kiest.
- **C. Prijsontwikkeling per leverancier** — stijging t.o.v. eerdere leveringen, met bedragen en data.
- **D. Calculatie tegenover inkoop** — ligt de eigen inkoopmediaan boven de calculatieprijs, dan is dat een signaal richting de calculatiekant.
- **E. Vergelijkbaar werk, werkelijk besteed** — nacalculatie-afwijkingen (mediaan) per werktype, minimaal 3 afgeronde opdrachten.
- **F. Normtijden tegenover werkelijkheid** — structurele afwijkingen (≥15%) tussen normtijd en werkelijk gemeten uren, gemarkeerd als het de huidige begroting raakt.

**Deterministische vulling:** `inkoopprijs_verwacht` komt niet meer van de AI maar uit jaarprijslijst → eigen mediaan (≥3 waarnemingen) → onbekend (nieuwe prijsbron "inkoophistorie"). Besparing is een rekensom; `aanbevolen_leverancier` is voortaan een opsomming uit de eigen historie. `INKOOP_PROMPT` ging van één zin naar een uitgewerkte prompt (v2.0.0) met harde regels; de werkbegroting-adviezen (blokken E/F) landen in de bestaande tabel `werkbegroting_adviezen`. De offerteaanvraag-mail vraagt gericht om een prijs in de orde van de eigen historie (zonder de bronleverancier te noemen).

Gedragsbewijs: `scripts/src/bewijs-inkoop-eigen-cijfers.ts` — 11/11 checks groen, incl. determinisme en uitsluiting van conceptbonnen, verkoopfacturen en afgekeurde facturen.

## Vóór/ná op hetzelfde inkoopplan

Zelfde plan (brandwerende kit 310ml, calc €4,00; maatwerk manchet DN200 zonder historie), geseed met echte bonhistorie (€4,20 → €4,60 Technische Unie; €4,40 Mavotrans):

| | Vóór (prompt v1, één zin) | Ná (prompt v2 + eigen cijfers) |
|---|---|---|
| Verwachte prijs kit | verzonnen, "iets lager dan calculatie" | **€4,40 — gemeten mediaan, 3 waarnemingen** |
| Leverancier | AI kiest er één uit modelkennis (bv. Beele) | **geen keuze; beide leveranciers met prijs getoond** |
| Prijsstijging | onzichtbaar | **Technische Unie +9,5% gesignaleerd, met bedragen en data** |
| Calc vs inkoop | geen toets | **"mediaan ligt 10% boven calculatieprijs — signaal voor de calculatiekant"** |
| Maatwerk zonder historie | verzonnen prijs €54,00 bij verzonnen leverancier | **"ONBEKEND — prijs opvragen"** |
| Levertijd | kaal getal | benoemd als **algemene inschatting**, geen eigen cijfer |

## Volledige AI-uitvoer

### Vóór
```json
{
  "samenvatting": "Voor de verbouwing van het kantoorpand zijn er materiaalregels voor brandpreventie doorvoeringen. Een voordeligere inkoopprijs dan de huidige calculatieprijs is haalbaar door gebruik te maken van betrouwbare leveranciers met sterke posities op de Nederlandse markt.",
  "totale_besparing": 41.60,
  "regels": [
    {
      "omschrijving": "brandwerende kit 310ml",
      "type": "standaard",
      "aanbevolen_leverancier": "Soudal",
      "inkoopprijs_verwacht": 3.80,
      "besparing_per_eenheid": 0.20,
      "besparing": 8.00,
      "levertijd_weken": 1,
      "motivatie": "Soudal is een bekende leverancier voor kitproducten met een breed scala aan brandwerende kitopties. Ze bieden doorgaans goede kortingen voor bulkafnames en snelle levertijden."
    },
    {
      "omschrijving": "maatwerk manchet DN200",
      "type": "maatwerk",
      "aanbevolen_leverancier": "Beele",
      "inkoopprijs_verwacht": 54.00,
      "besparing_per_eenheid": 4.00,
      "besparing": 24.00,
      "levertijd_weken": 2,
      "motivatie": "Beele is gespecialiseerd in kwalitatief hoogwaardige brandwerende oplossingen en biedt maatwerkmanchetten. Ze zijn een vaste waarde in de branche voor maatwerkoplossingen, wat de keuze verklaart."
    }
  ]
}
```

### Ná
```json
{
    "samenvatting": "De materialen in de werkbegroting voor de verbouwing van het kantoorpand bevatten artikelen waarvan één goed in te kopen is met beschikbare historische inkoopdata (brandwerende kit 310ml) en één maatwerkartikel zonder inkoophistorie (maatwerk manchet DN200). Er is een signaal dat de prijs van de brandwerende kit is gestegen en dat de calculatieprijs lager is dan de werkelijk betaalde mediaanprijs.",
    "totale_besparing": 0,
    "regels": [
        {
            "omschrijving": "brandwerende kit 310ml",
            "type": "standaard",
            "aanbevolen_leverancier": null,
            "inkoopprijs_verwacht": 4.40,
            "besparing_per_eenheid": -0.40,
            "besparing": -16.00,
            "levertijd_weken": 1,
            "motivatie": "Op basis van de eigen inkoophistorie is de mediaanprijs voor de brandwerende kit 310ml €4.40 bij zowel Mavotrans als Technische Unie. De prijs bij Technische Unie is recent gestegen met 9.5% (van €4.20 op 2026-08-07 naar €4.60 op 2026-08-07). De eigen inkoopmediaan ligt 10.0% boven de calculatieprijs; een signaal voor de calculatiekant. Levering binnen één week is een algemene inschatting."
        },
        {
            "omschrijving": "maatwerk manchet DN200",
            "type": "maatwerk",
            "aanbevolen_leverancier": null,
            "inkoopprijs_verwacht": 0.00,
            "besparing_per_eenheid": 0.00,
            "besparing": 0.00,
            "levertijd_weken": 4,
            "motivatie": "Er zijn geen eigen waarnemingen voor de maatwerk manchet DN200, dus de verwachte inkoopprijs is ONBEKEND en het advies is om een prijs op te vragen. Levertijd wordt op ongeveer vier weken geschat als algemene inschatting voor maatwerk."
        }
    ]
}
```
