# Fase 2 — Bedrijfsbesturing, calculatie en managementinformatie

> **Status: strategische horizon, vastgelegd — NIET vooruit bouwen.**
> Dit is geen bouwopdracht. Het beschrijft de gewenste architectuur *ná* afronding van de huidige Connect-roadmap. De huidige prioriteiten blijven ongewijzigd:
> - Connect operationeel afronden (de actieve roadmap eerst).
> - FPS One heeft geen prioriteit.
> - Geen nieuwe grote modules toevoegen die de huidige ontwikkeling vertragen.
>
> Zie [`README.md`](./README.md) voor het roadmapoverzicht en [`replit.md`](../../replit.md) voor de sporen.

## Uitgangspunt

FPS Connect wordt op termijn het primaire systeem voor de dagelijkse bedrijfsvoering en uiteindelijk het centrale bedrijfsdashboard van de FPS Groep. AccountView blijft voorlopig bestaan als het officiële boekhoudsysteem; Connect vervangt AccountView niet, maar levert er later informatie aan.

## Architectuurvisie — de vijf kernvragen

Connect moet niet alleen registreren, maar inzicht geven. Het systeem moet uiteindelijk antwoord geven op vijf vragen:

1. Verdienen we geld?
2. Welke projecten vragen aandacht?
3. Welke klanten leveren waarde op?
4. Welke risico's ontstaan?
5. Welke beslissingen vragen managementaandacht?

## Financiële filosofie

Financiën zijn geen losse module, maar de rode draad door alle processen. Iedere actie heeft uiteindelijk invloed op kosten, opbrengsten, marge, cashflow en risico. Toekomstige modules moeten daarom altijd financieel verbonden zijn.

## Calculatiemodule (eerste prioriteit ná de huidige Connect-fase)

Connect wordt de primaire bron voor projectbegrotingen. Minimaal:
- urenbegroting
- materiaalbegroting
- onderaanneming
- ABK (algemene bouwplaatskosten)
- opslagen
- winst en risico
- marge
- offerteprijs

Uitgangspunt: ENK niet exact kopiëren, maar een systeem bouwen dat aansluit op FPS.

## Projectbegroting als fundament

Iedere calculatie wordt automatisch de projectbegroting — geen dubbele invoer. De calculatie stroomt direct door naar:
- werkvoorbereiding
- projectcontrole
- nacalculatie
- managementinformatie

## Projectcontrol

Per project zichtbaar:
- begrote uren vs. gerealiseerde uren
- begrote kosten vs. gerealiseerde kosten
- meerwerk
- facturatiestatus
- verwachte eindmarge

Doel: afwijkingen vroeg zichtbaar maken.

## Project health

Automatische signalering (niet automatisch oplossen, wel zichtbaar maken), bijvoorbeeld:
- uren lopen uit
- materiaal loopt uit
- meerwerk ontbreekt
- marge daalt
- facturatie blijft achter

## Klantintelligence

Per klant inzicht in omzet, marge, betaalgedrag, klachten en herhaalopdrachten. Doel: niet iedere omzet is goede omzet.

## Capaciteitsinzicht

Inzicht in beschikbare capaciteit, geplande capaciteit, tekorten en overschotten. Doel: vooruitkijken.

## Management dashboard

Dagelijks overzicht voor de directie, bewust beperkt tot: omzet, marge, risico's, projectgezondheid, capaciteit en een cash-indicatie. Doel: binnen vijf minuten weten hoe FPS ervoor staat.

## AccountView-koppeling

Strategische keuze: AccountView blijft voorlopig bestaan.
- **Connect wordt leidend voor:** projecten, calculatie, begrotingen, managementinformatie.
- **AccountView blijft leidend voor:** boekhouding, btw, bank, accountant, jaarrekening.
- **Toekomstige koppeling:** Connect → AccountView (eenrichting; niet andersom).

## Belangrijke regel

Geen module bouwen omdat een concurrent die heeft. Iedere nieuwe functie moet één van de vijf kernvragen beter beantwoorden — anders niet bouwen.

## Succescriterium

Connect is succesvol wanneer de directie niet meer handmatig tientallen bestanden, systemen en overzichten hoeft te raadplegen om te begrijpen hoe FPS ervoor staat. Connect moet uiteindelijk het centrale bedrijfsdashboard van de FPS Groep worden.

## Relatie tot de bestaande roadmap

Deze Fase 2 ligt verder weg dan de huidige roadmap en bouwt erop voort; het vervangt de bestaande fasen niet. Aansluitpunten:
- De **calculatie-/offertelijn** sluit aan op de reeds vastgelegde strategische AI-lijn (zie [`geparkeerd.md`](./geparkeerd.md), AI Calculator / AI Offertegenerator, stap K4) en op het parallelle spoor **Offerte Intelligence** (Fase 1-basis: alleen voorbereiding, geen AI-calculatie, geen automatische verzending).
- **Project health** en **projectcontrol** bouwen voort op de rapportage- en dossierlijn (V1.4 Opleverrapportage, V1.5 Rapportenmodule).
- **Capaciteitsinzicht** sluit aan op de HRM/Personeel-lijn (parallel spoor Fase 1-basis; volledige uitwerking in V3.0).
- De **AI-conventie** blijft gelden: AI stelt voor, een mens beslist; AI keurt nooit zelfstandig goed en verstuurt nooit zelfstandig definitieve offertes.
