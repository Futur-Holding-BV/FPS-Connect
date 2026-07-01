Verbeter de functie “Slim uploaden”. De huidige melding “De analyse kon niet worden uitgevoerd” is onvoldoende. De upload moet werken als document-intelligentie workflow.

Doel:
Een gebruiker uploadt één of meer bestanden. AI analyseert het document, herkent het type en stelt daarna een logische vervolgactie voor. De gebruiker bevestigt altijd handmatig voordat er iets definitief wordt aangemaakt of gekoppeld.

Voorbeelden die correct moeten werken:

1. Mail met tekening / aanvraag
Als een geüploade e-mail of PDF lijkt op een nieuwe aanvraag, offerteaanvraag of opdrachtverzoek, en er zitten tekeningen of projectdocumenten bij, dan moet AI voorstellen:

“Dit lijkt een nieuwe aanvraag. Wil je hiervoor een nieuw werk/project aanmaken?”

Daarna vervolgscherm met:
- vermoedelijke klant
- projectnaam / locatie
- contactpersoon
- ontvangen documenten
- tekeningen apart herkennen
- voorstel opslaglocatie
- knop: Nieuw werk aanmaken
- knop: Koppelen aan bestaand werk
- knop: Alleen opslaan in documentenbibliotheek

2. Testrapport / productrapport
Als een document lijkt op een productrapport, testrapport, ETA, DoP, certificaat, classificatierapport of verwerkingsvoorschrift, dan moet AI voorstellen:

“Dit lijkt een productdocument. Wil je dit opnemen in de documentenbibliotheek en koppelen aan relevante toepassingen?”

Daarna vervolgscherm met:
- documenttype
- fabrikant / productnaam
- classificatie indien aanwezig
- toepassingen waarvoor dit relevant kan zijn
- mogelijke koppelingen:
  - brandwerende doorvoering
  - brandwerende deur
  - brandwerend glas
  - voegafdichting
  - kanaal / klep / rooster
  - schacht / wand / vloer
- geldigheidsdatum of rapportdatum indien gevonden
- knop: Toevoegen aan documentenbibliotheek
- knop: Koppelen aan applicaties/toepassingen
- knop: Handmatig indelen

3. Factuur
Als het document een factuur is:
- leverancier herkennen
- bedrag, datum, factuurnummer proberen uit te lezen
- voorstellen koppeling aan project, voertuig, onderhoud, magazijn of algemene kosten
- gebruiker laat definitieve keuze maken

4. Personeelsdocument
Als het document lijkt op arbeidsovereenkomst, ID, certificaat, VCA, diploma of personeelsdocument:
- voorstellen opslaan bij Personeel / HRM
- medewerker proberen te herkennen
- AVG-waarschuwing tonen
- nooit automatisch breed zichtbaar maken

5. Onbekend document
Als AI het document niet met voldoende zekerheid herkent:
- toon niet alleen een foutmelding
- toon:
  “Ik weet niet zeker waar dit document thuishoort.”
- geef de beste 3 voorstellen met confidence-score
- laat gebruiker kiezen uit:
  - Documentenbibliotheek
  - Offertes
  - Facturen
  - Personeel / HRM
  - Tekeningen
  - Snagstream archief
  - Documenten algemeen
  - Nieuw werk/project aanmaken
  - Koppelen aan bestaand werk

Belangrijk:
- De melding “De analyse kon niet worden uitgevoerd” mag alleen verschijnen bij een echte technische fout.
- Bij onvoldoende zekerheid moet er altijd een handmatige classificatieflow komen.
- AI mag nooit direct definitief opslaan of koppelen zonder bevestiging.
- Log per upload:
  - bestandsnaam
  - uploadmoment
  - herkend documenttype
  - confidence-score
  - voorgestelde actie
  - gekozen actie door gebruiker
  - gekoppeld project/werk/documentcategorie

Technische eisen:
- Maak een centrale upload-classifier.
- Classificatie moet minimaal deze categorieën ondersteunen:
  aanvraag
  tekening
  offerte
  factuur
  productdocument
  testrapport
  certificaat
  ETA
  DoP
  personeelsdocument
  Snagstream-archief
  algemeen document
  onbekend

- Bouw foutafhandeling:
  1. AI-analyse succesvol → voorstel tonen
  2. AI-analyse onzeker → keuzevoorstellen tonen
  3. AI-analyse technisch mislukt → fallback handmatig opslaan tonen
  4. Geen wit scherm of blokkade

UX-eis:
Na upload verschijnt geen simpele categorieknop meer als eindpunt, maar een beslisscherm:

“Wat wil je met dit document doen?”

Met daaronder:
- AI-inschatting
- reden van de inschatting
- gevonden gegevens
- voorgestelde actie
- alternatieve acties
- bevestigingsknop

Doelresultaat:
Een mail met tekening moet leiden tot voorstel “nieuw werk/project aanmaken”.
Een testrapport moet leiden tot voorstel “documentenbibliotheek + koppelen aan relevante toepassingen”.
Een onbekend document moet altijd netjes handmatig te plaatsen zijn.