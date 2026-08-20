OPDRACHT – Calculatiemodule gericht verbeteren voor kantoorversie

Doel

Verbeter de bestaande calculatiemodule van FPS Connect.

Niet opnieuw ontwerpen.
Niet vervangen.
Niet uitbreiden met nieuwe AI-functionaliteit.

Behoud de huidige opzet en verbeter uitsluitend onderdelen die de dagelijkse werking van de calculator beperken.

Gebruik de bestaande calculatiemodule als uitgangspunt.

=========================================================
1. HOOFDSTRUCTUUR
=========================================================

Voeg een echte calculatiestructuur toe.

Een calculatie bestaat uit:

Calculatie
    ↓
Hoofdstukken
    ↓
Regels
    ↓
Eventuele subregels
    ↓
Staartkosten
    ↓
Totalen

Ondersteun minimaal:

- Bouwplaatskosten / ABK
- Algemene kosten
- Applicaties
- Timmerwerk
- Glas
- Installaties
- Schilderwerk
- Sloopwerk
- Algemeen niet projectgerelateerd

De gebruiker moet:

- hoofdstukken toevoegen;
- volgorde wijzigen;
- hoofdstukken inklappen;
- hoofdstuktotalen zien.

Dit moet ook goed werken bij grote calculaties (>500 regels).

=========================================================
2. CALCULATIE HOORT BIJ EEN PROJECT
=========================================================

Een nieuwe calculatie mag niet meer volledig los worden aangemaakt.

Een calculatie hoort altijd bij minimaal één van onderstaande:

- Project
- Werk
- Gebouw
- Opname

Connect moet bestaande projectgegevens automatisch overnemen.

Bijvoorbeeld:

- opdrachtgever;
- gebouw;
- projectnaam;
- werknummer;
- btw-instellingen;
- projectleider.

Voorkom dubbele invoer.

=========================================================
3. INKOOPREGELS
=========================================================

Werk het onderdeel "Inkoopregels" verder uit.

Dit wordt straks de basis voor:

- offerteaanvragen;
- leveranciers;
- werkvoorbereiding;
- inkoop;
- magazijn.

Per inkoopregel minimaal:

- leverancier
- artikel
- omschrijving
- aantal
- eenheid
- offerte ontvangen
- gekozen leverancier
- levertijd
- prijs
- status

Nog geen AI bouwen.

Nog geen automatische offertevergelijking.

Alleen de workflow voorbereiden.

=========================================================
4. KOSTOPBOUW
=========================================================

Breid de huidige kostopbouw rechts uit.

Toon minimaal afzonderlijk:

- arbeid
- materiaal
- onderaanneming
- overige kosten
- bouwplaatskosten
- AK
- ABK
- risico
- winst
- totaal kostprijs
- totaal verkoop
- marge
- marge %

Laat totalen direct meerekenen.

=========================================================
5. REGELS
=========================================================

Verbeter de invoer van regels.

Ondersteun minimaal:

- artikel
- vrije regel
- receptregel
- normregel
- arbeid
- materiaal
- onderaanneming

Per regel:

- aantal
- eenheid
- materiaalprijs
- arbeidsuren
- arbeidstarief
- onderaanneming
- totaal kostprijs
- verkoopprijs
- marge

=========================================================
6. NIET DOEN
=========================================================

Niet bouwen:

- AI-offertevergelijking
- leveranciers-AI
- AI Financial Controller
- AccountView
- offerteworkflow
- werkbegroting opnieuw
- nieuwe calculatie-architectuur

Gebruik zoveel mogelijk bestaande tabellen, routes en componenten.

=========================================================
7. RAPPORTAGE
=========================================================

Lever uitsluitend op:

1.
Welke bestaande onderdelen zijn hergebruikt.

2.
Welke onderdelen zijn verbeterd.

3.
Welke ENK-functionaliteit hierdoor volledig vervangen wordt.

4.
Welke onderdelen nog ontbreken voordat een calculator volledig zonder ENK kan werken.

5.
GO / NO GO voor een eerste kantoorproef met een echte calculatie.

Belangrijk:

Verbeter alleen de werking van de bestaande calculatiemodule.

Niet uitbreiden met toekomstige functionaliteit.
Niet vooruit bouwen.

Het doel is dat een calculator morgen een eenvoudige praktijkcalculatie volledig in Connect kan maken.