# FINANCIEEL_KETEN_01 — de keten gemeten en gerepareerd

Datum: 18 augustus 2026. Volledige meting per onderdeel:
`docs/metingen/FINANCIEEL_KETEN_01-meting.md`. Bewijs:
`scripts/src/verificatie-financieel-keten.ts` — 15/15 groen.

## De keten per onderdeel (één regel)

| Onderdeel | Waar vandaan → wat gebeurt er → waarheen |
|---|---|
| Facturen index | mail/upload → factuur + AI-regels → detail/controle/export |
| Facturen detail | factuur+regels+leverancier → controles (AI, drie-weg, prijs, contract) → accorderen/afwijzen/blokkeren → export |
| Facturen stroom | signaalgenerator → signalen → afhandelen met notitie → werkbak |
| Controlebox | controle_nodig → vergelijking → akkoord/afwijzing (wie/wanneer/reden) |
| Klaar-voor-export | geaccordeerd → AccountView-batch → verzonden/fout → exportlog |
| Exportlog | exportpoging → logregel (wie/tijd/payload/fout) → teruglink |
| Facturen dashboard | tellingen op facturen+signalen → links naar deelschermen |
| Facturen print | factuur+regels+briefpapier → PDF |
| Liquiditeit | open facturen + banksaldo → aging/cashflow → directiebeeld **→ nu ook werkbak bij te late inning** |
| Algemene kosten | begroting + realisaties + uren → AK-dashboard → adviezen → afhandelen/wegzetten (gelogd) |
| Scenario's | actieve begroting → kopie → doorrekening → vergelijking (bewust eindstation) **→ besluiten nu gelogd** |
| Crediteuren | leveranciers → facturen → betaalbatch (achter akkoord-schakelaar) |
| Bedrijfsresultaten | OHW-motor + factuurstatistiek → KPI's → deelschermen |
| Onderhanden werk | opdrachten+uren+facturen+calculatie → OHW-waarde → bedrijfsresultaten/jaarrekening **→ nu ook werkbak bij afgesloten-maar-open** |
| Jaarrekening | OHW-motor per peildatum → accountantsbeeld |
| Jaarrekeningen | upload → AI-extractie → mens keurt cijfers → meerjarenoverzicht (gelogd) |
| Meerjarenoverzicht | goedgekeurde kerncijfers → trend/signalen **→ dubbele cijfers nu deterministisch** |
| Contracten | contract+document → kosten/AI → besparingskansen → werkbak → besluit |
| Marktspiegel | prijsafspraak/contract → AI-webonderzoek → vergelijking **→ vastlopen nu eerlijk "mislukt"** |

## Gevonden breuken en wat ik heb gedaan (volgorde: geld eerst)

1. **Geblokkeerde facturen wachtten onzichtbaar** (geld staat stil tot iemand
   toevallig het filter opent). → Werkbak-voeder `factuur_geblokkeerd`: elk
   geblokkeerd, niet-afgekeurd factuur wordt een doen-punt voor financieel, en
   verdwijnt automatisch zodra de blokkade is opgeheven (bewezen).
2. **Mislukte AccountView-exports bleven in het exportlog hangen** — de
   boekhouding liep stil zonder dat iemand het zag. → Werkbak-voeder
   `factuur_exportfout` op status fout_bij_verzending.
3. **Verkoopfacturen over de vervaldatum leidden nergens toe** — inning wachtte
   op toeval; de liquiditeitspagina gaf wel advies maar geen handeling. →
   Werkbak-voeder `verkoopfactuur_vervallen` (herinnering/incasso staat op de
   factuurpagina zelf, het werkbakpunt brengt je erheen).
4. **"Project afgesloten maar OHW nog open" bleef een badge** — balanswaarde
   die blijft hangen. → Werkbak-voeder `ohw_signaal` op precies deze signalering.
5. **Handmatige OHW-waardering zonder spoor** — wie het balansbedrag overschreef
   en waarom verdween. → Toelichting is nu verplicht bij handmatige waardering
   (422 zonder), de gebruiker wordt op de override vastgelegd en het besluit
   staat in het activiteitenlog.
6. **Factuur verwijderen werd nergens vastgelegd.** → Verwijderen schrijft nu
   een activiteitregel met factuurnummer, relatie, bedrag en gebruiker.
7. **Scenario- en AK-postbesluiten hadden geen actor.** → Scenario aanmaken/
   verwijderen en AK-posten aan/uit zetten worden gelogd.
8. **Meerjarenoverzicht koos bij dubbele goedgekeurde cijfers een toevallige
   winnaar.** → Het nieuwste goedgekeurde cijfer wint nu deterministisch.
9. **Marktspiegel-onderzoek kon eeuwig op "bezig" blijven** na een gecrashte
   worker. → Na 30 minuten wordt het eerlijk "mislukt" met reden.

Alle vier de nieuwe werkbak-bronnen staan in de vaste bronnenlijst (WERKBAK_01
§5: uitbreiden is een besluit) en reconciliëren automatisch: toestand opgelost =
punt afgehandeld.

## Wat ik voorleg (regel 3 van de opdracht)

Geen onderdeel hoeft te vervallen en er botst niets met een eerder besluit.
Wél zijn er definitieverschillen die ik niet stilzwijgend gelijktrek omdat de
uitkomst dan verandert:

- **Incl./excl. btw**: liquiditeit rekent openstaande facturen incl. btw
  (kasstroom), OHW/bedrijfsresultaten excl. btw (resultaat). Beide zijn correct
  voor hun doel, maar de schermen noemen het allebei "openstaand/gefactureerd".
  Voorstel: labels aanpassen ("incl. btw" / "excl. btw" erbij), geen cijfers
  wijzigen. Zeg het als je wilt dat ik één definitie afdwing — dan veranderen
  getallen op één van beide schermen.
- **Contractkosten**: de lijst toont een jaarlast uit de contractvelden, het
  besparingsadvies rekent op de kostenhistorie. Gelijktrekken verandert de
  lijstbedragen. Voorstel: lijst uit de kostenhistorie laten lezen zodra er
  historie is, anders contractveld — jouw akkoord vóór ik dit omzet.
- **Crediteuridentiteit op drie plekken** (leveranciersregister, factuurveld,
  AccountView-mapping): reconciliatie vergt een opschoonslag in bestaande data.
  Voorstel volgt apart; niets stilzwijgend aangepast.

## Bewust laten liggen (met reden)

- **Scenario's blijven een eindstation.** Vaste regel in dit systeem: scenario-
  begrotingen raken prognose/AK/calculatie nooit — een "toepassen op begroting"-
  knop zou een tweede rekenmodel invoeren. De keten eindigt hier bewust in een
  vergelijking; het besluit (begroting aanpassen) loopt via de begrotingsmodule.
- **AK-jaarrealisaties blijven een handmatige bron** naast het live model: dat
  is de ijking op jaarrekeningcijfers, geen dubbele bron van hetzelfde getal.
- **Marktspiegelresultaat wordt niet teruggeschreven** naar prijsafspraken —
  AI stelt vast, de mens besluit (bestaand principe).
- **Facturen-dashboard en index tellen op dezelfde tabel** — geen tweede bron,
  geen reparatie nodig.
- **AK-advies "weggezet" blijft zichtbaar in het dashboard** — dat is een
  parkeerstatus met reden/wie/wanneer, geen open einde.
- **Geen aparte crediteurenpagina gebouwd**: de betaalbatch (ADMINISTRATIE_02)
  ís het crediteurenstation zodra jij de schakelaar omzet; een extra saldo-
  scherm zou een derde bron naast facturen en AccountView worden.

## Toetsing aannames (vaste eis)

- Module-id is overal "financieel"; niveaus: lezen=1, muteren=2 — klopt met de
  bestaande routes; de nieuwe werkbakpunten eisen financieel:2.
- De eerder gerapporteerde "dode link" naar /financieel/onderhanden-werk bleek
  onjuist: de pagina en route bestaan. Geen reparatie nodig; meting gecorrigeerd.
- OHW-override-endpoint stond al op financieel:2 (schrijven) — ongewijzigd, er
  is alleen vastlegging toegevoegd.
