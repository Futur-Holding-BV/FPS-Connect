# FPS Connect als ERP — Gap-analyse & aanbevelingen (10 juli 2026)

> Dit document is een momentopname, geen roadmapfase. Het beantwoordt de vraag: "Connect is nu een extreem uitgebreide ERP-software — wat ontbreekt nog om hem beter, completer en praktisch werkbaarder te maken?" Gebaseerd op onderzoek van de daadwerkelijke code (routes, schema's, pagina's), niet op aannames.

## Kernboodschap

Connect heeft al drie dingen die de meeste zelfgebouwde ERP's missen: een generieke workflow-engine met automatische vervolgacties, een granulaire bevoegdheden-matrix, en gedeeltelijke deadline-signalering per module. De grootste gaps zitten niet in "nog een module bouwen", maar in **drie plekken waar het systeem inconsistent of onvolledig is over de bestaande modules heen**:

1. Er is geen enkele plek waar iemand kan zien "wat loopt er nu vast, waar dreigt een deadline, wat wacht op goedkeuring" — dat zit nu versnipperd per module.
2. Er is geen "vier-ogen"-niveau tussen lezen en schrijven — wie mag muteren, mag ook goedkeuren. Voor facturen/offertes is dat een reëel controlerisico.
3. Er bestaat geen terugroepactie voor iets dat al verzonden is (uitnodiging, rapport, e-mail) — alleen "laten verlopen" of "nieuwe versie maken".

Hieronder per categorie: wat er al is, wat ontbreekt, en wat ik zou aanraden.

---

## 1. Standaard formulieren & sjablonen

**Wat er al is:** een echte bibliotheek (`beheer/bibliotheek.tsx` + classificatie.ts) voor de technische catalogus (applicaties/toepassingen/fabrikanten), en het Document Design System (Studio) voor documentsjablonen in drie families (klant / HRM-juridisch / intern).

**Gap:** deze twee bibliotheken staan los van elkaar en dekken niet alle "papierwerk" dat een bedrijf als FPS gebruikt: er is geen centrale plek voor bijvoorbeeld standaard e-mailteksten, standaard checklists (LMRA, oplevercontrole, veiligheidsronde), of standaard contractsjablonen buiten HRM.

**Aanbeveling:** één overkoepelend "Sjablonen"-overzicht (kan dun blijven — een index-pagina) dat verwijst naar de bestaande sub-bibliotheken, zodat een nieuwe medewerker niet hoeft te weten dat sjablonen op drie plekken zitten. Geen nieuwe engine nodig, wel een navigatie-/vindbaarheidsfix.

## 2. Mappenstructuur / documentclassificatie

**Wat er al is:** geen klassieke mappenboom, maar een label-gebaseerde classificatie die dwars door modules werkt (`groepId`/`documenttype` in het documentenschema, automatische classificatie van binnenkomende e-mail).

**Gap:** dit werkt goed voor de bekende documenttypes, maar een gebruiker die "even snel een map wil zien per gebouw/klant/jaar" heeft geen boom-achtig overzicht — alles moet via filters gevonden worden.

**Aanbeveling:** dit is bewust zo gebouwd en werkt beter dan een mappenboom voor herbruikbaarheid van documenten over meerdere gebouwen heen (een dossier hoeft niet te "in de verkeerde map" zitten). Ik zou dit niet vervangen, wel: een "virtuele mapweergave" toevoegen als extra filterpreset (per gebouw → per jaar → per type) bovenop de bestaande classificatie, puur als andere weergave — geen nieuwe opslagstructuur.

## 3. Acties & vervolgacties

**Wat er al is:** een echte, generieke workflow-engine (`workflow-engine.ts`) met pre-checks en automatische vervolgacties. Voorbeeld dat al werkt: bij "Alles akkoord? Nee" op een inspectie wordt automatisch een hersteltaak aangemaakt. Facturen lopen door AI-check → accordering → AccountView-export als vaste flow.

**Gap:** deze engine wordt maar in een paar modules gebruikt (facturen, inspectie→herstel, uitvoering→oplevering). Andere logische actie/vervolgactie-paren zijn nog handmatig: bijv. na het afkeuren van een offerte volgt niet automatisch een taak "reden vastleggen + klant informeren"; na het verlopen van een certificaat in HRM volgt niet automatisch een taak "herscholing inplannen".

**Aanbeveling:** de engine bestaat al — dit is puur een kwestie van meer transities definiëren, geen nieuwe bouw. Ik zou dit per-module laten prioriteren op basis van waar nu het meest "tussen wal en schip" valt in de praktijk (mijn gok: offerte-opvolging en HRM-certificaten, maar dat wil ik niet zelf invullen).

## 4. Controlestappen (vier-ogen-principe)

**Wat er al is:** goedkeuringsstappen bestaan al concreet (facturen accorderen/afkeuren, weekstaten accorderen, verlof goedkeuren, rapporten definitief maken). Deze zijn gekoppeld aan bevoegdheidsniveau "schrijven" (2).

**Gap — belangrijkste controlerisico dat ik zie:** er is geen apart niveau voor "mag goedkeuren" versus "mag aanmaken/wijzigen". Wie een factuur mag *invoeren* met schrijfrecht, mag hem in de huidige matrix ook *accorderen*. Voor geld (facturen, offertes) en voor juridisch bindende stukken (definitieve rapporten, dossiers) is dat een klassiek intern-controle-gat: degene die het aanmaakt zou het idealiter niet ook zelf mogen afvinken.

**Aanbeveling:** een vierde bevoegdheidsniveau toevoegen naast 0/1/2 (bijv. niveau 3 = "goedkeuren", los van "schrijven"), en dat expliciet afdwingen op de bestaande accordeer-knoppen voor facturen/offertes/definitieve rapporten. Dit is een gerichte, beperkte wijziging (bevoegdheden-matrix + een handvol accordeer-endpoints) met grote controle-waarde.

## 5. Toegangsniveaus (bevoegdheden-matrix breder)

**Wat er al is:** drie basisrollen (hoofdbeheerder/gebruiker/klant), een numerieke matrix per module (32+ modules), object-niveau rechten (per gebouw), en presetprofielen. Dit is al aanzienlijk verder uitgewerkt dan bij de meeste vergelijkbare bedrijven.

**Gaps:**
- Geen los "auditor/compliance"-profiel als vast preset (kan nu wel handmatig samengesteld worden, maar is geen eersteklas concept) — handig voor een accountant of ISO-auditor die tijdelijk alles moet kunnen *lezen*, nergens moet kunnen wijzigen, en dat gebruik zelf ook gelogd moet worden.
- Geen tijdelijke/verlopende toegang (bijv. "extern bedrijf krijgt 30 dagen inzage in dit project, daarna automatisch dicht"). Nu is toegang aan/uit, niet tijdgebonden.
- Geen "delegeren bij afwezigheid" (leidinggevende A is met vakantie → verlofaanvragen en accorderingen lopen automatisch naar B).

**Aanbeveling:** van deze drie is de derde (delegatie bij afwezigheid) het meest praktisch dringend zodra er vier-ogen-controles bijkomen (punt 4) — anders staat alles vast zodra een goedkeurder er even niet is. De andere twee zijn waardevol maar minder urgent.

## 6. Terugroepacties (recall/intrekken)

**Wat er al is:** niets generieks. Uitnodigingen kunnen alleen *verlopen* (7 dagen) of indirect ongeldig gemaakt worden door de gebruiker te archiveren. Rapporten/offertes werken met voorwaartse versies ("vervangen door nieuwe versie"), geen echte terugtrekking. Eenmaal verzonden e-mail (via Microsoft 365) kan sowieso nooit technisch worden teruggehaald bij de ontvanger — dat is een systeembeperking van e-mail zelf, geen Connect-gap.

**Gap:** dit is het duidelijkste ontbrekende stuk uit uw vraag. Er is geen knop "trek deze uitnodiging in" of "trek dit verzonden rapport terug" met een nette audit-trail (wie, wanneer, waarom).

**Aanbeveling:** een generiek "intrekken"-patroon toevoegen op de plekken waar het praktisch relevant is:
- **Uitnodigingen**: directe intrek-knop (token onmiddellijk ongeldig maken + logging), in plaats van archiveren als omweg.
- **Definitieve rapporten**: een "corrigerende terugtrekking" state naast de bestaande "vervangen door nieuwe versie" — met verplichte reden, zodat de klant een nette vervolgmail krijgt ("dit rapport is introkken, vervangend rapport volgt") in plaats van dat het stilzwijgend verdwijnt.
- Verzonden e-mail zelf blijft niet terug te halen (technische grens van e-mail) — wel kan een *vervolgmail* met correctie automatisch getriggerd worden vanuit zo'n intrekactie.

## 7. AI-bewaking van deadlines

**Wat er al is — en dit is een naamgevingsverwarring die ik wil ophelderen:** het bestand `aiDrempelCheck.ts` bewaakt **niet** deadlines — het bewaakt alleen de maandelijkse *kosten* van AI-gebruik (euro's) en stuurt een e-mail als een ingestelde kostendrempel wordt overschreden. Er ís wel deadline-signalering, maar die is **regelgebaseerd, niet AI**, en zit verspreid over losse services:
- Rapporten: dagelijkse check op verstreken reactietermijnen (07:30)
- Planning: dagelijkse check op offerte-deadlines (08:00)
- Magazijn: minimumvoorraad-signalering
- HRM-contracten: de meest uitgewerkte, met keten- en aanzegtermijn-drempels (30/60/90/120 dagen) — puur TypeScript-logica, geen AI

**Gap:** géén van de operationele modules met harde deadlines heeft *proactieve* bewaking: inspecties (herkeuringstermijnen), onderhoud (SLA's op werkbonnen), documenten-vervaldatums (certificaten/ETA's/keuringen) buiten HRM. Én: er is geen centraal overzicht dat al deze losse signaleringen bundelt — een hoofdbeheerder moet nu per module kijken of er iets urgent is.

**Aanbeveling, in twee stappen:**
1. **Eerst een centraal "Bewaking"-dashboard** dat de bestaande signaleringen bundelt (reactietermijnen, planning, magazijn, contracten, wagenpark-APK) op één scherm, gesorteerd op urgentie. Dit is vooral samenvoegen van wat er al is, geen nieuwe logica.
2. **Daarna pas** de ontbrekende bewakingen toevoegen (inspectie-hertermijnen, onderhouds-SLA's, documenten-vervaldatums breed) volgens hetzelfde regelgebaseerde patroon — en pas dáárna, waar het toegevoegde waarde heeft (bijv. prioriteren welke van de 50 openstaande signaleringen het eerst aandacht nodig heeft, op basis van historische patronen), een laag "echte" AI erover heen. Nu al AI noemen voor iets wat gewoon een datumvergelijking is, zou verwarrend zijn richting gebruikers.

## 8. Overige ERP-essentials die ik zou overwegen (niet expliciet gevraagd, wel relevant)

- **Master-data-governance**: wie mag een klant/leverancier/artikel *verwijderen* of samenvoegen bij een duplicaat? Nu voor zover gezien geen dedupe-mechanisme voor bijv. dubbel ingevoerde relaties in CRM.
- **Data-retentie/AVG**: automatische verwijder- of anonimiseringsregels voor bijv. oud-medewerkers, verlopen klantdata — nu waarschijnlijk handmatig.
- **Escalatiepaden**: als een goedkeuring te lang blijft liggen (bijv. 3 dagen geen actie op een factuur), gaat er nu geen automatisch escalatiebericht naar een hoger niveau. Dit sluit direct aan bij punt 4 (vier-ogen) en punt 7 (bewaking).
- **Management-rapportage/BI**: er is per module dashboard-informatie, maar geen cross-module trendrapportage (bijv. "gemiddelde doorlooptijd van offerte tot oplevering per kwartaal"). Dit staat al bewust geparkeerd in Fase 2 (Bedrijfsbesturing) — terecht, dat is een grotere stap.

---

## Prioritering — mijn advies

**Kleine, gerichte ingrepen met grote controle-waarde (ik zou hiermee beginnen):**
1. Vierde bevoegdheidsniveau "goedkeuren" naast lezen/schrijven, toegepast op facturen/offertes/definitieve rapporten (punt 4).
2. Centraal bewakingsdashboard dat bestaande signaleringen bundelt (punt 7, stap 1).
3. Intrekken/terugroepen van uitnodigingen en definitieve rapporten (punt 6).

**Middelgroot, bouwt voort op wat er al staat:**
4. Meer workflow-engine-transities voor bestaande handmatige stappen (punt 3).
5. Delegatie bij afwezigheid voor goedkeuringen (punt 5).
6. Ontbrekende deadline-bewaking toevoegen: inspectie-hertermijnen, onderhouds-SLA's, brede documenten-vervaldatums (punt 7, stap 2).

**Later / bewust klein houden:**
7. Sjablonen-indexpagina, virtuele mapweergave (punt 1 en 2 — cosmetisch/vindbaarheid, geen structureel probleem).
8. Master-data-governance, AVG-retentie, escalatiepaden, cross-module BI (punt 8) — waardevol maar groter en deels al belegd in de Fase 2-horizon.

Dit is een analyse, geen bouwopdracht — ik bouw niets hiervan zonder uw akkoord per onderdeel.
