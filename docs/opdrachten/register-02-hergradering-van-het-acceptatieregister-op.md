REGISTER_02 — hergradering van het acceptatieregister op de code

AANLEIDING
Het register uit REGISTER_01 (438 punten) beoordeelt punten op antwoorddocumenten die de
stand van vóór de bouw beschrijven. Twee steekproeven waren allebei fout:
- AKKOORD_01 punt 1 en 2 staan op niet_gebouwd, terwijl lib/akkoordPoort.ts bestaat met
  heeftAkkoord(), aangeroepen vanuit routes/uren.ts (r.774 en 1025) en
  lib/inkoopbonService.ts (r.46). Het KETEN_01-eindrapport bewijst het gedrag: uren zonder
  akkoord geven 422 AKKOORD_ONTBREEKT, geen rij weggeschreven, geen lek.
- FACTUUR_03 staat volledig (8 punten) op niet_gebouwd "niet begonnen", terwijl
  routes/betaalbatch.ts bestaat inclusief G-rekening-afhandeling, gebouwd in ADMINISTRATIE_02.
Daarmee is STATUS_2026-08-19.md nu niet bruikbaar als werklijst.

HARDE REGEL
Een oordeel mag nooit rusten op een document dat ouder is dan de laatste wijziging in het
codepad waar het punt over gaat. Bij elk punt wordt vastgelegd: bron (codepad, meetrapport
of testbestand), datum, en de commit-SHA waarop het oordeel is gemaakt.

FASE 0 — meten, niets herschrijven
Tel per punt waar het huidige oordeel op rust en hoeveel punten die harde regel schenden.
Uitkomst als docs/metingen/REGISTER_02_bronnen.md. Nul is een antwoord.

FASE 1 — hergradering
Alle 438 punten opnieuw beoordelen op de code en op bestaande meetrapporten, inclusief de
209 die nu op "gehaald" staan; die kant is nooit gecontroleerd en kan even hard fout zijn.
Elk punt krijgt het codepad waar het over gaat.

FASE 2 — bewijs dat zichzelf onderhoudt
Waar het bewijs te automatiseren is: een bewijsscript dat het punt bij groen zelf op
"gehaald" zet. Wijzigt daarna het gekoppelde codepad, dan valt het punt automatisch terug
op "gebouwd-onbewezen" tot het bewijsscript opnieuw groen draait. Faalt een bewijsscript
dat eerder groen was, dan gaat de bestaande faalmail uit — geen melding in een logboek.

FASE 3 — de 16 punten die op René wachten
Die worden automatisch actiepunten in Connect (tabel actiepunten, categorie platform) en
sluiten zichzelf zodra de handeling is verricht. Geen dubbele lijst.

TOT SLOT
Statusrapport opnieuw genereren na de hergradering, en de technische-schuld-tabel
herrekenen in dezelfde slotparagraaf.