# Opdracht – Calculatieregel toevoegen verbeteren

Pas het scherm **Calculatieregel toevoegen** aan zodat het aansluit op de FPS-calculatiemethode.

## Probleem nu

Het scherm toont wel velden, maar de logica klopt nog niet:

* Categorie staat op **Materiaal**, terwijl het voorbeeld feitelijk arbeid is.
* Normtijd en omschrijving lopen door elkaar.
* Arbeidstarief is verplicht/rood, maar er staat al een tariefbedrag onder.
* Materiaal, arbeid en onderaanneming staan als losse invoervelden zonder duidelijke kostensoortlogica.
* De gebruiker ziet niet goed hoe de regelprijs wordt opgebouwd.
* Hoofdstuk staat onderaan, terwijl dat juist de calculatiestructuur bepaalt.
* Klanttekst en interne opmerkingen zijn onduidelijk gescheiden.
* Het scherm is te technisch en niet praktisch genoeg voor werkvoorbereiding.

## Nieuwe opbouw

Maak bovenaan eerst de structuur:

1. Hoofdstuk
2. Kostensoort
3. Normregel / vrije regel
4. Omschrijving
5. Eenheid
6. Hoeveelheid

## Hoofdstuk

Hoofdstuk moet bovenaan staan.

Voorbeelden:

* Brandwerende doorvoeringen
* Brandwerende deuren
* Brandwerende beglazing
* Bouwkundig herstel
* Sloopwerk
* Aftimmerwerk
* Schilderwerk
* Overige werkzaamheden

## Kostensoort

Vervang “Categorie” door **Kostensoort**.

Keuzes:

* Arbeid
* Materiaal
* Materieel
* Onderaanneming
* Opslag / toeslag
* Stelpost
* Regiepost

De gekozen kostensoort bepaalt welke velden zichtbaar zijn.

## Bij kostensoort Arbeid

Toon alleen:

* Normregel
* Omschrijving
* Eenheid
* Hoeveelheid
* MU per eenheid
* Arbeidstarief
* Arbeidskosten totaal

Verberg:

* Materiaalprijs
* Onderaanneming

## Bij kostensoort Materiaal

Toon:

* Omschrijving
* Eenheid
* Hoeveelheid
* Materiaalprijs per eenheid
* Materiaalkosten totaal

Verberg:

* MU per eenheid
* Arbeidstarief
* Onderaanneming

## Bij kostensoort Onderaanneming

Toon:

* Omschrijving
* Eenheid
* Hoeveelheid
* Onderaanneming bedrag
* Eventuele opslag
* Totaal

## Normregel

Normregel moet optioneel zijn.

Wanneer een normregel wordt gekozen, vult het systeem automatisch:

* Omschrijving
* Eenheid
* MU per eenheid
* Standaard hoofdstuk
* Eventueel standaard klanttekst

De gebruiker mag deze waarden daarna handmatig aanpassen.

## Arbeidstarief

Maak arbeidstarief duidelijk.

Keuzes:

* Monteur
* Timmerman
* Projectleider
* Werkvoorbereider
* Regie uurtarief
* Aangepast tarief

Toon naast de keuze direct het bedrag.

Voorbeeld:

**Monteur – € 70,00/u**

Voorkom dat het veld rood wordt terwijl er al een tarief is ingevuld.

## Regelopbouw

Toon onder de invoer een duidelijke berekening:

Bij arbeid:

Hoeveelheid × MU per eenheid × tarief
1 × 1,50 × € 70,00 = € 105,00

Bij materiaal:

Hoeveelheid × materiaalprijs
10 × € 8,50 = € 85,00

Bij onderaanneming:

Bedrag + opslag = regeltotaal

## Klanttekst en interne notitie

Scheid dit duidelijk:

### Klanttekst offerte

Deze tekst komt op de offerte.

### Interne notitie

Alleen zichtbaar voor FPS.

## Validatie

Alleen velden valideren die horen bij de gekozen kostensoort.

Dus:

* Geen arbeidstarief verplicht bij materiaal.
* Geen materiaalprijs verplicht bij arbeid.
* Geen onderaanneming verplicht bij arbeid of materiaal.
* Geen rode foutmelding zolang de berekening geldig is.

## Eindresultaat

Het scherm moet voelen als een calculatietool voor werkvoorbereiding, niet als een generiek formulier.

Een calculatieregel moet logisch opgebouwd zijn vanuit:

**hoofdstuk → kostensoort → normregel → hoeveelheid → prijsopbouw → klanttekst/interne notitie**
