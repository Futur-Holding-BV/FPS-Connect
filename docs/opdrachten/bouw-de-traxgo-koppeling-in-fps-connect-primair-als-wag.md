Bouw de Traxgo-koppeling in FPS Connect primair als wagenparkbeheer-integratie, niet als personeelscontrole.

Doel:
Traxgo-data gebruiken voor voertuigbeheer, onderhoud, APK/keuringen, kilometerstanden, rittenadministratie en beheer van bedrijfsbussen. De module mag niet worden ingericht als systeem om medewerkers live te controleren of werktijd automatisch te beoordelen op basis van GPS.

Functioneel:
1. Maak een module “Wagenpark” binnen FPS Connect.
2. Voeg voertuigen toe met:
   - kenteken
   - merk/type
   - bouwjaar
   - huidige kilometerstand
   - APK-datum
   - onderhoudsinterval in km en/of datum
   - bandenwisselstatus
   - verzekeringsgegevens
   - lease/eigendom
   - gekoppelde Traxgo voertuig-ID
   - vaste of tijdelijke gebruiker/chauffeur
   - gekoppelde gereedschappen/voorraad in de bus

3. Maak een Traxgo-integratielaag:
   - aparte provider-adapter voor Traxgo
   - geen directe Traxgo-logica in de bedrijfslogica
   - ondersteuning voor later toevoegen van andere aanbieders zoals Webfleet, Geotab of FleetComplete
   - API keys/secrets via environment variables
   - logging van synchronisaties

4. Importeer uit Traxgo alleen voertuiggerichte data:
   - kilometerstand
   - ritten op voertuigniveau
   - laatst bekende voertuiglocatie
   - draaiuren indien beschikbaar
   - brandstof/laadgegevens indien beschikbaar
   - foutmeldingen/diagnosecodes indien beschikbaar

5. Gebruik de data voor:
   - automatisch onderhoudsadvies
   - melding “onderhoud binnenkort nodig”
   - melding “APK verloopt binnenkort”
   - signalering hoge kilometeropbouw
   - signalering langdurige stilstand voertuig
   - overzicht kosten per voertuig
   - rittenadministratie per voertuig
   - planning welk voertuig beschikbaar is

6. Bouw privacy-by-design in:
   - standaard geen persoonsgerichte GPS-tijdlijn tonen
   - geen prestatie- of gedragsscore per medewerker
   - geen automatische werktijdcontrole op basis van GPS
   - geen alerts zoals “medewerker is te laat” of “medewerker staat stil”
   - toon data primair per voertuig, niet per persoon
   - beperk live locatie tot planners/beheerders
   - bewaartermijnen instelbaar maken
   - exporteerbaar AVG-logboek: welke voertuigdata is opgeslagen, waarom, hoe lang en wie toegang heeft

7. Maak rollen en rechten:
   - Hoofdbeheerder: alles
   - Wagenparkbeheerder: voertuigen, onderhoud, ritten, kosten
   - Planner: voertuigbeschikbaarheid en actuele voertuiglocatie
   - Projectleider: alleen gekoppelde ritten/kosten op projectniveau
   - Monteur: eigen toegewezen voertuig, onderhoudsmeldingen, schade melden
   - Klant: geen toegang

8. Voeg AI-ondersteuning toe, maar uitsluitend voertuiggericht:
   - AI voorspelt onderhoud op basis van kilometerstand en gebruik
   - AI signaleert afwijkende kosten per voertuig
   - AI stelt voor welk voertuig onderhoud nodig heeft
   - AI maakt concepttaken voor onderhoud, APK en bandenwissel
   - AI koppelt voertuigkosten aan project als dat administratief logisch is
   - AI mag geen medewerkerprestaties beoordelen op basis van GPS-data

9. Maak dashboards:
   - wagenparkoverzicht
   - onderhoudskalender
   - APK/keuringen
   - voertuigen met aandacht nodig
   - kosten per voertuig
   - ritten per voertuig
   - beschikbaarheid voertuigen
   - open schade- en onderhoudsmeldingen

10. Maak een duidelijke privacytekst in de module:
   “Deze module gebruikt voertuigdata voor wagenparkbeheer, onderhoud, veiligheid, planning en administratie. De data is niet bedoeld voor continue personeelscontrole of beoordeling van individuele medewerkers.”

Resultaat:
FPS Connect krijgt een schaalbare wagenparkmodule met Traxgo-koppeling, gericht op onderhoud, beheer, kosten en beschikbaarheid van voertuigen. De oplossing moet AVG-bewust zijn en mag niet worden gebouwd als personeelsvolgsysteem.