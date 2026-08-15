# Kader — FPS Connect

Lees dit vóór elke opdracht in deze repository.
Bijgewerkt 15 augustus 2026.

---

## Wat dit is

Het ERP van FPS zelf. De **binnenlaag**. Hier draait de bedrijfsvoering:
calculatie, offerte, opdracht, werkvoorbereiding, inkoop, uren, facturen, HRM,
magazijn, wagenpark.

Draait op een eigen server. Medewerkers van FPS werken hierin.

## Wat dit niet is

**Geen klantomgeving.** Er komt geen enkele externe gebruiker in dit systeem —
geen opdrachtgever, geen adviseur, geen uitvoerende partij, geen bewoner.

Klanten wonen in FPS One Platform. Dat is een andere codebase op een andere
server.

## De eenrichtingsregel

Verkeer gaat **alleen van binnen naar buiten**. Er is precies één handeling:
bij oplevering worden documenten van een gebouw gepubliceerd naar de
klantomgeving in het Platform.

Er bestaat geen ingang van buiten naar binnen. Wint FPS zelf een uitvraag op
het Platform, dan voert een mens dat opnieuw in als aanvraag hier — bewust,
met de hand.

Wat nooit naar buiten gaat: kostprijzen, marges, uren, personeelsgegevens,
inkoopprijzen, gegevens van andere opdrachtgevers.

## Harde regels

**Geen klantrol.** De rol bestaat niet meer in het rechtenmodel; er zijn nog
twee basisrollen: hoofdbeheerder en gebruiker. Een controle in de build faalt
zodra de klantrol ergens terugkeert, in welke schrijfwijze dan ook. Voeg niets
toe aan de uitzonderingen van die controle.

**Geen remmen vóór productie.** Alles gaat direct door naar productie. Geen
goedkeuringspoort, geen controle die een uitrol tegenhoudt, geen extra stap.
Signalen die alleen mélden mogen wel; iets dat tegenhoudt niet.

**Migraties zijn onveranderlijk zodra ze gedeployed zijn.** Een genummerde
migratie wordt nooit hernoemd, gewijzigd of verwijderd — productie heeft hem
onder die naam geregistreerd. Twee migraties met hetzelfde nummer zijn
verboden; zes bestaande paren zijn uitgezonderd en mogen niet aangeraakt
worden.

**Klant als bedrijf blijft.** Het klantenbestand in het CRM heeft niets met de
inlogrol te maken en blijft ongewijzigd bestaan.

## Waar dit heen gaat

De FPS Planner (bewonercommunicatie en afspraakplanning) wordt hierin
opgenomen als eigen onderdeel onder Uitvoering. De planner bezit woningen,
bewoners en afspraken; Connect bezit mensen, tijd en capaciteit.

## Werkwijze

Een opdracht is pas af als er bewijs bij zit: een uitdraai, geen redenering.
Bij een controle betekent dat: groen, opzettelijk kapotgemaakt, gefaald mét
bestandsnaam en regelnummer, weer groen.

Een uitkomst van nul is een antwoord. Niets interpreteren wat er niet staat.
