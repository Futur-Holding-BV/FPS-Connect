Herbouw de documentherkenning als een generieke multimodale document-understanding pipeline.

Het huidige systeem leunt te zwaar op:
- bestandsnaamherkenning;
- beschikbare PDF-tekstlagen;
- vaste heuristieken per documentsoort.

Dat is onvoldoende. Een document zonder goede tekstlaag moet visueel begrepen worden, zoals een mens of een multimodaal AI-model dat doet.

Doel:
Elk geüpload document moet generiek worden geïnterpreteerd op basis van alle beschikbare signalen, zonder voor iedere documentsoort of ieder sjabloon een specifieke oplossing te programmeren.

Verplichte pipeline:

1. Bestandsinspectie
- herken MIME-type;
- bepaal paginatal;
- controleer of een bruikbare tekstlaag aanwezig is;
- detecteer of pagina’s grotendeels uit beeld/pixels bestaan.

2. Tekstextractie
- gebruik native tekstextractie wanneer aanwezig;
- gebruik OCR wanneer de tekstlaag ontbreekt of onvoldoende is;
- sla tekst per pagina en met positie-informatie op.

3. Visuele documentanalyse
- render relevante pagina’s naar afbeeldingen;
- analyseer logo’s, briefhoofden, tabellen, formulieren, grafische indeling, ondertekeningen, stempels, foto’s en andere visuele kenmerken;
- vision-analyse mag niet worden overgeslagen alleen omdat een AI-agent tijdelijk niet beschikbaar is;
- gebruik een configureerbare multimodale AI-provider met een duidelijke fallback en foutmelding.

4. Semantische documentinterpretatie
Laat het model op basis van tekst én beeld bepalen:
- wat voor document dit functioneel is;
- welke organisatie(s) worden genoemd of visueel herkend;
- welke afzender en ontvanger waarschijnlijk zijn;
- welke datum, periode of jaartal relevant is;
- bij welk gebouw, project, klant, medewerker, leverancier of dossier het document hoort;
- welke module en opslaglocatie logisch zijn;
- of het document een leeg sjabloon, ingevuld document, rapport, factuur, certificaat, tekening, foto, correspondentie of ander document is.

5. Geen harde afhankelijkheid van documentlabels
- documenttypes moeten uit betekenis worden afgeleid;
- bestandsnaam en bestaande labels zijn slechts aanvullende signalen;
- voeg geen branches toe zoals “als FPSB-BP-Pixel-based.pdf, dan ...”;
- voeg geen sjabloonspecifieke oplossingen toe tenzij deze uitsluitend als optionele herkenningshint dienen.

6. Gestructureerde AI-uitvoer
Gebruik één generiek schema, bijvoorbeeld:
{
  "document_function": "",
  "document_subtype": "",
  "is_template": false,
  "organizations": [],
  "sender": null,
  "recipient": null,
  "dates": [],
  "project_candidates": [],
  "building_candidates": [],
  "person_candidates": [],
  "suggested_module": "",
  "suggested_storage_location": "",
  "summary": "",
  "evidence": [],
  "uncertainties": [],
  "confidence": 0
}

7. Betrouwbaarheid
- confidence moet gebaseerd zijn op bewijs, niet alleen op het aantal gevonden velden;
- leg per conclusie vast welk tekstueel of visueel bewijs is gebruikt;
- bij lage zekerheid meerdere kandidaten tonen in plaats van een willekeurige keuze;
- ontbrekende organisatie of jaartal mag niet automatisch tot een lage totaalscore leiden wanneer het document functioneel wel duidelijk wordt herkend.

8. Testen
Test minimaal:
- tekstgebaseerde PDF;
- gescande PDF;
- pixel-based PDF;
- Word-bestand;
- Excel-bestand;
- foto van een document;
- leeg huisstijlsjabloon;
- ingevuld document op hetzelfde sjabloon;
- document met verkeerde of betekenisloze bestandsnaam.

Gebruik FPSB-BP-Pixel-based.pdf als één van de tests, maar bouw geen specifieke regel voor dit bestand.

Verwacht resultaat voor dat testbestand:
- organisatie/huisstijl: FPS Brandpreventie;
- functionele classificatie: leeg briefpapier / documentsjabloon / huisstijlsjabloon;
- geen factuur, rapport of inhoudelijk projectdocument;
- voorgestelde opslag: sjablonen/huisstijl of organisatiebrede documenten;
- visuele herkenning moet actief zijn;
- bewijs moet onder meer logo, briefhoofd, contactgegevens, footer en lege documentruimte noemen.

Voer eerst een root-causeanalyse uit van de huidige pipeline en pas daarna de architectuur aan. Toon:
- welke bestanden en services zijn gewijzigd;
- hoe de multimodale analyse wordt aangeroepen;
- welke fallback bestaat;
- de testresultaten per bestandstype;
- het volledige gestructureerde resultaat voor FPSB-BP-Pixel-based.pdf.