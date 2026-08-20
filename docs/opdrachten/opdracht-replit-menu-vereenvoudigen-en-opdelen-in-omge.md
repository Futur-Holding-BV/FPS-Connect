# Opdracht Replit – Menu vereenvoudigen en opdelen in omgevingen

Het huidige hoofdmenu is te uitgebreid en toont FPS Connect, FPS One en beheerfuncties door elkaar. Dit maakt de applicatie onoverzichtelijk, vooral voor dagelijks gebruik.

Pas de navigatiestructuur aan.

## Uitgangspunt

Gebruikers werken primair in één omgeving tegelijk:

1. **FPS Connect** – interne werkomgeving
2. **FPS One** – klantomgeving
3. **Beheer** – instellingen en beheerfuncties

Toon niet alle modules van alle omgevingen tegelijk in één lange zijbalk.

## Gewenste structuur

Maak bovenin of linksboven een duidelijke omgeving-switcher:

* FPS Connect
* FPS One
* Beheer

Afhankelijk van de gekozen omgeving toont de zijbalk alleen de relevante menu-items.

---

## FPS Connect

Toon hier alleen interne werkmodules:

* Dashboard
* Projecten / Gebouwen
* Inspecties
* Planning
* Onderhoud
* Rapporten
* Documenten
* Personeel / HRM
* CRM

Eventueel later:

* Toolbox & berichten
* Bibliotheek

---

## FPS One

Toon hier alleen klantportaalmodules:

* Dashboard
* Gebouwen
* Documenten
* Rapporten
* Abonnementen

FPS One mag ook als inklapbaar submenu onder een omgeving-switch worden geplaatst, maar niet meer als volledige losse sectie tussen interne menu-items.

---

## Beheer

Toon hier alleen beheerdersfuncties:

* Gebruikers
* Profielen
* Login-pogingen
* Mailinstellingen
* Documentopmaak
* Helpdesk
* Feedback
* Ontwikkelstatus
* App-informatie

Beheer is alleen zichtbaar voor hoofdbeheerder en bevoegde beheerders.

---

## Rollen en rechten

Niet iedere gebruiker ziet dezelfde omgeving.

* Monteur: alleen FPS Connect, beperkte modules
* Projectleider: FPS Connect
* Kantoor/gebruiker: FPS Connect
* Klant: alleen FPS One
* Hoofdbeheerder: FPS Connect, FPS One en Beheer

## Doel

De navigatie moet korter, rustiger en logischer worden.

De gebruiker moet direct begrijpen:

* in welke omgeving hij werkt;
* welke modules daarbij horen;
* welke onderdelen voor dagelijks gebruik zijn;
* welke onderdelen alleen beheer zijn.

Het menu mag geen lange verzamellijst meer zijn.
