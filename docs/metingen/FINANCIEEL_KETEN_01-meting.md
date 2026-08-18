# Meting FINANCIEEL_KETEN_01 — de keten per onderdeel (18 aug 2026)

Per onderdeel: waar vandaan → wat gebeurt er → waarheen, plus de gevonden breuken.
Reparaties staan in `docs/antwoorden/FINANCIEEL_KETEN_01.md`.

## Facturen (de sterke kant van het hoofdstuk)

| Onderdeel | Keten in één regel |
|---|---|
| Index | mail/upload → facturen + AI-regels → detail/controle/export; historisch → losse Excel |
| Detail | factuur+regels+leverancier+inkoopbon → controles (AI, drie-weg, prijs, contract) → accorderen/afwijzen/blokkeren → klaar voor AccountView |
| Stroom | signaalgenerator → factuur_signalen → afhandelen met notitie → werkbak (voeder bestond al) |
| Controlebox | status controle_nodig/klaar_voor_boeking → inhoudelijke vergelijking → akkoord (met wie/wanneer) of afwijzing (met reden/categorie) |
| Klaar-voor-export | geaccordeerd → klaar_voor_accountview → batch-export → verzonden/verwerkt of fout → exportlog |
| Exportlog | exportpoging → logregel (gebruiker/tijd/payload/response/fout) → teruglink detail |
| Dashboard | COUNT-aggregaten op facturen + signalen → links naar de deelschermen |
| Print | factuur+regels+briefpapier (DDS/werkgever) → PDF-beeld |

**Breuken gevonden:** (a) geblokkeerde facturen en exportfouten wachtten op een
mens zonder werkbak-item — geld dat stilstaat was alleen een filter in een
scherm; (b) verwijderen van een factuur werd nergens vastgelegd; (c) verkoop-
facturen over de vervaldatum verschenen nergens (inning wachtte op toeval).
Alle drie gerepareerd. Het dashboard telt rechtstreeks op facturen — zelfde
tabel als de index, dus geen echte tweede bron.

## Liquiditeit
Facturen (incl. btw, open) + optioneel AccountView-banksaldo → liquiditeit-service
(aging/cashflow/werkkapitaal) → directiepagina; alleen beeld, adviezen zonder actie.
**Breuken:** te late verkoopfacturen leidden nergens tot een handeling
(gerepareerd via werkbak-voeder); zonder AccountView valt "netto liquiditeit"
stil terug op werkkapitaal (staat als melding op het scherm, definitieverschil
gemeld hieronder bij "één bron per cijfer").

## Onderhanden werk (OHW)
Opdrachten + uren + projectfacturen (excl. btw) + calculatie/offerte + override →
OHW-aggregatie → bedrijfsresultaten + jaarrekening-OHW.
**Breuken:** (a) signalering "project afgesloten maar OHW open" bleef beeld —
balanswaarde die blijft hangen (gerepareerd: werkbak-voeder); (b) handmatige
waardering had geen verplichte toelichting, geen wie, geen logregel (gerepareerd);
(c) de eerder vermoede "dode link" /financieel/onderhanden-werk bestaat wél als
pagina — geen breuk.

## Bedrijfsresultaten
OHW-endpoint + factuurstatistieken → KPI-kaarten en tabel → links.
**Breuk:** eindstation is navigatie, geen besluit — acceptabel als cockpit
zolang de signaleringen zelf naar de werkbak komen (nu het geval via OHW-voeder).

## Algemene kosten (AK)
Begroting-AK + jaarrealisaties + uren/capaciteit → AK-dashboard → adviezen →
afhandelen/wegzetten (status, reden, wie, wanneer al vastgelegd in fie_ak_adviezen).
**Breuken (gemeld, bewust niet verbouwd):** jaarrealisaties zijn een handmatige
bron naast het live factuur/OHW-model — dat is een bewuste keuze (jaarrekening-
cijfers als ijkpunt, zie kalibratie hieronder); personeelskosten bevatten
productief én indirect, het dashboard meldt dat tekstueel.

## Scenario's (FIE wat-als)
Actieve jaarbegroting → kopie + AK-posten → doorrekening → vergelijkingskaarten.
**Bewust einde van de keten:** scenario's mógen niets raken (vaste regel:
scenario-begrotingen overal uitfilteren, nooit een tweede rekenmodel). Besluit-
vastlegging ontbrak wel: aanmaken/verwijderen van een scenario en het aan/uit
zetten van AK-posten wordt nu gelogd.

## Crediteuren
Er is geen apart crediteurenscherm; de keten is leveranciersregister → facturen →
betaalbatch (ADMINISTRATIE_02, achter akkoord-schakelaar). Crediteuridentiteit
leeft op drie plekken (leveranciers.relatiecode, facturen.relatieCode,
accountview-relatiemapping) — gemeld bij "één bron per cijfer".

## Jaarrekening / Jaarrekeningen / Meerjarenoverzicht
- Jaarrekening (scherm) = OHW-per-peildatum-beeld voor de accountant; leest uit
  dezelfde OHW-motor als bedrijfsresultaten — één bron, geen breuk.
- Jaarrekeningen = upload → AI-extractie → mens keurt kerncijfers goed/af/uit →
  meerjarenoverzicht; besluiten wél gelogd (financiele_document_log + beoordelaar
  op het cijfer). Sterkste keten buiten facturen.
- Meerjarenoverzicht leest alléén goedgekeurde, niet-uitgesloten cijfers van
  actuele documenten. **Breuk:** bij twee goedgekeurde cijfers voor dezelfde
  sleutel/boekjaar was de winnaar toevalsvolgorde (gerepareerd: nieuwste wint
  deterministisch).

## Contracten (financieel)
Contract + DMS-document → kostenhistorie/AI → besparingskansen + signaleringen →
werkbak (voeder financiele_contracten bestond al) → besluit. CRUD en AI worden
gelogd. **Gemeld:** "actieve jaarlast" op de lijst is lokaal berekend uit
contractvelden terwijl besparingsadvies op de kostenhistorie steunt — twee
gezichtspunten op kosten, geen reparatie zonder cijferwijziging (zie voorleggen).

## Marktspiegel
Prijsafspraak/contract/vrije vraag → asynchroon AI/webonderzoek → resultaat met
bronlinks → vergelijkingsbeeld; resultaat wordt bewust niet teruggeschreven naar
prijsafspraken (mens besluit). **Breuk:** een gecrashte worker liet een onderzoek
eeuwig op "bezig" staan zonder melding (gerepareerd: na 30 minuten eerlijk
"mislukt" met reden).

## Eén bron per cijfer — definitieverschillen (voorgelegd, niet stilzwijgend gewijzigd)

| Cijfer | Bron A | Bron B | Verschil |
|---|---|---|---|
| Openstaand/omzet | Liquiditeit: incl. btw | OHW/bedrijfsresultaten: excl. btw | Beide zijn intern correct (kasstroom vs. resultaat), maar heten op de schermen allebei "openstaand/gefactureerd" |
| AK-realisatie | fie_jaarrealisaties (handmatig/jaarrekening) | live facturen/OHW | Bewuste ijking, maar loopt uiteen tot iemand de realisatie invult |
| Contractkosten | contractvelden (jaarlast) | financiele_contract_kosten (historie) | Lijst en advies kunnen verschillende bedragen tonen |
| Crediteuridentiteit | leveranciers.relatiecode | facturen.relatieCode + AccountView-mapping | Drie plekken, geen automatische reconciliatie |
