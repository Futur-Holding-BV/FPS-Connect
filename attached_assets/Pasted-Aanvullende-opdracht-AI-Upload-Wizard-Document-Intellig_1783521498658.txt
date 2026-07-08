Aanvullende opdracht – AI Upload Wizard / Document Intelligence

Dit is inmiddels de vierde keer dat dezelfde feedback terugkomt. Daarom wil ik geen nieuwe classificatiefix, maar een controle en herstel van de volledige documentanalyse-pipeline.

De huidige UI meldt onder andere:
- "Geen herkenbare sleutelwoorden in de bestandsnaam gevonden."
- "Waarschijnlijk bevat het bestand tekst."

Dat is niet de gewenste architectuur.

De AI mag de bestandsnaam uitsluitend als aanvullende context gebruiken. De documentinhoud moet de primaire bron van classificatie zijn.

Onderzoek en bewijs stap voor stap de volledige pipeline:

1. Wordt het bestand daadwerkelijk geopend?
2. Welk bestandstype is gedetecteerd?
3. Hoeveel pagina's bevat het document?
4. Is een tekstlaag aanwezig?
5. Zo ja: hoeveel tekens zijn daadwerkelijk geëxtraheerd?
6. Zo nee: wordt OCR uitgevoerd?
7. Welke tekst (eerste ±500 tekens) wordt daadwerkelijk aan de AI aangeboden?
8. Welke prompt ontvangt de AI?
9. Welke metadata haalt de AI uit het document?
10. Hoe wordt de confidence-score bepaald?
11. Hoe wordt de uiteindelijke opslaglocatie bepaald?

Daarnaast:

- Verwijder de afhankelijkheid van bestandsnaam-gebaseerde classificatie als primaire methode.
- Gebruik de bestandsnaam alleen als aanvullende context.
- De UI mag nooit meer melden dat classificatie hoofdzakelijk op de bestandsnaam is gebaseerd.

Test dit expliciet met:

- Geconsolideerde jaarrekening
- Jaarrekening
- Factuur
- Offerte
- Arbeidsovereenkomst
- Certificaat
- Opleverrapport
- Onderhoudsrapport
- Bouwtekening

Concreet voorbeeld:

Document:
"FPS 2024 Geconsolideerd.pdf"

De AI moet zelfstandig herkennen:

- Documenttype: Geconsolideerde jaarrekening
- Organisatie: FPS Groep
- Boekjaar: 2024
- Categorie: Financieel
- Bestemming:
  Archief
    └── Jaarrekeningen
          └── 2024

Lever niet alleen de oplossing op, maar ook aantoonbaar bewijs dat de pipeline daadwerkelijk werkt.

Ik wil in de debuginformatie kunnen zien:

✓ PDF geopend
✓ X pagina's gevonden
✓ Tekstlaag aanwezig / OCR uitgevoerd
✓ X tekens geëxtraheerd
✓ AI-analyse uitgevoerd
✓ Metadata herkend
✓ Confidence berekend
✓ Definitieve opslaglocatie bepaald

Als een van deze stappen ontbreekt, is de implementatie nog niet conform ontwerp.