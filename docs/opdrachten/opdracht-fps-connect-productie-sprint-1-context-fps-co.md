# OPDRACHT – FPS Connect Productie Sprint 1

Context

FPS Connect draait nu succesvol in productie.

De eerste hoofdbeheerder is aangemaakt.
De VPS draait stabiel.
GitHub is de bron van waarheid.

Vanaf nu richten we de applicatie in met echte bedrijfsgegevens.

Los uitsluitend onderstaande punten op.

Geen nieuwe functionaliteit buiten deze scope.

===========================================================
1. Werkgever aanmaken – AI Assistent
===========================================================

Bij het aanmaken van een werkgever moet AI helpen.

Gebruiker vult bijvoorbeeld in:

- bedrijfsnaam
- KvK
- website
- e-mailadres

AI doet vervolgens voorstellen voor:

- adres
- postcode
- plaats
- telefoon
- website
- contactgegevens
- branche
- overige bekende bedrijfsgegevens

Belangrijk

- AI vult niets definitief in.
- Gebruiker controleert alles.
- Daarna pas opslaan.

===========================================================
2. Document Studio – Referentiemodel koppelen
===========================================================

Probleem

Na upload van een referentie-PDF wordt deze niet gekoppeld aan het documenttype.

Daardoor blijft zichtbaar:

"Geen model"

terwijl upload wel gelukt is.

Vereist

Na upload:

- referentie koppelen aan:
    - werkmaatschappij
    - documenttype

- teller aanpassen

- status aanpassen

- document zichtbaar maken

- bestand bewaren

- refresh moet koppeling behouden

- gebruiker moet kunnen:

    bekijken

    vervangen

    verwijderen

    opnieuw analyseren

===========================================================
3. Document Studio – AI analyse
===========================================================

Na upload moet AI automatisch een analyse uitvoeren.

Onder andere:

- logo
- kleuren
- header
- footer
- marges
- contactblok
- adres
- KvK
- btw
- IBAN
- e-mail
- website
- telefoon

Resultaat:

Concept-model

Gebruiker keurt goed.

Pas daarna wordt het actief.

===========================================================
4. Documentopmaak automatisch vullen
===========================================================

Documentopmaak moet gegevens automatisch overnemen uit het geüploade referentiemodel.

Bijvoorbeeld:

- logo

- merkkleur

- adresblok

- footer

- contactgegevens

- marges

- A4 preview

Niet direct overschrijven.

Eerst tonen als voorstel.

Na akkoord opslaan.

===========================================================
5. Versiebeheer Document Studio
===========================================================

Er bestaat altijd precies:

ÉÉN actief model

per:

- werkmaatschappij

- documenttype

Nieuwe upload:

↓

Concept

↓

AI analyse

↓

Vergelijken

↓

Goedkeuren

↓

Nieuw actief

↓

Oude versie archiveren

Belangrijk

Bestaande documenten blijven gekoppeld aan de versie waarmee ze gemaakt zijn.

Nieuwe documenten gebruiken automatisch de nieuwe versie.

Nooit automatisch een actief model vervangen.

Nooit een situatie zonder actief model.

Bewaar volledige versiehistorie.

===========================================================
6. Regressie gebruikersprofielen
===========================================================

Probleem

Alle rechten staan nu standaard op:

0 Geen toegang.

Vroeger waren standaardprofielen volledig ingericht.

Dat moet terug.

Maak standaardprofielen:

- Hoofdbeheerder

- Project-admin

- Projectleider

- Werkvoorbereider

- Uitvoerder

- Monteur

- Controleur

- Commercieel

- Financieel

- Externe boekhouder

- HR

- Klant

- Leverancier

- Auditor

- Alleen lezen

Per profiel:

realistische standaardrechten.

===========================================================
7. Nieuwe gebruiker
===========================================================

Nieuwe gebruiker:

↓

profiel kiezen

↓

rechten automatisch overnemen

Niet opnieuw tientallen dropdowns.

Persoonlijke uitzonderingen blijven mogelijk.

Bij wijzigen profiel:

vraag:

"Ook toepassen op bestaande gebruikers?"

===========================================================
8. Niet wijzigen
===========================================================

Niet wijzigen:

- login

- bootstrap

- 2FA

- uitnodigingen

- gebruikersschema

- bestaande productiegegevens

===========================================================
9. Testen
===========================================================

Test minimaal:

✓ werkgever met AI

✓ upload referentie

✓ koppeling zichtbaar

✓ document bekijken

✓ vervangen

✓ verwijderen

✓ AI analyse

✓ documentopmaak gevuld

✓ versiebeheer

✓ standaardprofielen

✓ nieuwe gebruiker

✓ bestaande gebruiker

✓ regressietest login

✓ regressietest bootstrap

===========================================================
10. Oplevering
===========================================================

Na afronding:

- samenvatting

- gewijzigde bestanden

- testresultaten

- git status

- git diff --stat

Commit pas wanneer uitsluitend bovenstaande scope is gewijzigd.