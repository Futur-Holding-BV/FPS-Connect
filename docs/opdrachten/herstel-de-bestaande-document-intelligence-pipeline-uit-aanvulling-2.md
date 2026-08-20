Herstel de bestaande Document Intelligence Pipeline uitsluitend in de enige echte en geldige omgeving:

https://connect.fps-one.nl

Voor deze opdracht bestaat maar één werkelijkheid en dat is connect.fps-one.nl.

Replit preview, localhost, development, staging, testomgevingen en losse builds zijn uitsluitend hulpmiddelen en gelden nooit als resultaat.

Een oplossing is pas een oplossing wanneer deze aantoonbaar werkt op connect.fps-one.nl.

Dit is geen nieuw los documenttype en er mag geen speciale hardcoded regel voor FPSB-BP-Pixel-based.pdf worden toegevoegd.

De eerder afgesproken generieke multimodale pipeline moet werkelijk functioneren.

Onderzoek en herstel de huidige implementatie van:
- Slim Upload
- Uploadwachtrij
- Document Inbox
- Document Studio

Zoek en verwijder of vervang waar nodig:
- classificeerMockAI
- filename-based classificatie
- eenvoudige MIME-classificatie
- andere mocklogica
- stille fallbacks waarbij geen echte inhoudsanalyse plaatsvindt

Laat iedere PDF eerst onderzoeken op:
- echte tekstlaag
- embedded afbeeldingen
- paginarendering
- OCR-resultaat
- visuele documentkenmerken

Wanneer tekst ontbreekt of onvoldoende is:
- render iedere relevante pagina naar een afbeelding
- voer daadwerkelijk vision-analyse uit
- sla deze stap niet over
- val niet direct terug op Onbekend

Combineer bij classificatie:
- OCR-tekst
- logo’s
- huisstijl
- paginalay-out
- kop- en voettekst
- contactgegevens
- bestandsnaam
- bestaande Document Studio-referentiemodellen

Gebruik de bestandsnaam uitsluitend als ondersteunend signaal en nooit als hoofdclassificatie.

Laat de pipeline minimaal retourneren:
- documenttype
- werkmaatschappij
- documentfunctie
- voorgestelde bestemming
- confidence
- gebruikte bewijskenmerken
- reden bij onvoldoende zekerheid

Herken het bijgevoegde document op basis van de visuele inhoud als:
- werkmaatschappij: FPS Brandpreventie
- documentfunctie: briefpapiermodel / huisstijltemplate
- niet: Productdocumenten
- niet: Onbekend

Controleer de bestaande Document Studio-modellen voor:
FPS Brandpreventie + briefpapiermodel

Gebruik deze als vergelijkingsmateriaal wanneer aanwezig.

Zorg dat het systeem leert van een handmatige correctie:
- sla de correct gekozen categorie op
- sla de visuele en inhoudelijke documentkenmerken op
- gebruik deze correctie bij volgende vergelijkbare uploads
- wijzig nooit automatisch een actief model zonder expliciete goedkeuring

Toon in de interface voortaan:
- wat is uitgelezen
- of OCR is gebruikt
- of vision is gebruikt
- welk model is gebruikt
- confidence
- waarom de categorie is voorgesteld

Voeg duidelijke foutafhandeling toe:
- geen verzonnen documentinhoud
- geen stille fallback
- Nederlandse foutmelding wanneer vision, OCR of een benodigde API niet beschikbaar is

Test rechtstreeks op:
https://connect.fps-one.nl

Met:
FPSB-BP-Pixel-based.pdf

De opdracht is pas opgelost wanneer:
- de live productieomgeving het document inhoudelijk en visueel analyseert
- het document niet meer als Onbekend wordt getoond
- de werkmaatschappij correct als FPS Brandpreventie wordt herkend
- de documentfunctie correct als briefpapiermodel / huisstijltemplate wordt herkend
- de voorgestelde bestemming passend is
- in de interface zichtbaar is dat vision en/of OCR daadwerkelijk zijn gebruikt
- de werking rechtstreeks op connect.fps-one.nl is gecontroleerd

Niet alleen testen in Replit preview.

Niet afronden met alleen diagnose, uitleg, codewijzigingen of verwachte resultaten.

Niet gereedmelden wanneer de oplossing alleen werkt in Replit, localhost, development, staging of een andere omgeving.

Alleen connect.fps-one.nl geldt als werkelijkheid, testomgeving en eindresultaat.

Meld de opdracht pas gereed wanneer het probleem aantoonbaar is opgelost in de live productieomgeving.

De gewenste eindmelding is uitsluitend:

Opgelost: Document Intelligence werkt weer correct op connect.fps-one.nl.

Geef alleen aanvullende uitleg wanneer het probleem niet volledig opgelost kon worden.