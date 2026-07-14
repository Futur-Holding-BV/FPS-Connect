Voeg in Connect een functie toe om ENK-calculaties te uploaden, bewaren en opnieuw te gebruiken.

Functionaliteit:

1. Voeg bij calculaties een knop toe:
"ENK-calculatie uploaden"

2. Ondersteun minimaal:
- PDF
- Excel
- CSV

3. Sla het originele ENK-bestand op bij het project en de calculatie.

4. Na uploaden moet Connect:
- Het bestand uitlezen.
- Projectgegevens herkennen.
- Calculatieregels herkennen.
- Omschrijving, aantal, eenheid, materiaal, arbeid en bedragen overnemen.
- Hoofdstukken en volgorde behouden.
- Opslagen herkennen.
- Een conceptcalculatie aanmaken.

5. Toon vóór het opslaan een controlescherm waarin de gebruiker:
- Herkende regels kan bekijken.
- Waarden kan aanpassen.
- Fouten en onzekere regels ziet.
- Opslagen kan controleren.
- De import kan bevestigen of annuleren.

6. Voeg bij iedere calculatie een sectie toe:
"Bronbestanden"

Toon daarin:
- Bestandsnaam
- Bestandstype
- Uploaddatum
- Wie het bestand heeft geüpload
- Importstatus
- Link om het originele bestand te openen

7. Voeg een ENK-bibliotheek toe waarin eerder geüploade calculaties kunnen worden gezocht en hergebruikt.

Zoeken en filteren op:
- Projectnaam
- Opdrachtgever
- Calculatienummer
- Werknummer
- Datum
- Gebouw
- Omschrijving

8. Voeg bij een bestaande ENK-calculatie de acties toe:
- Openen
- Downloaden
- Opnieuw importeren
- Kopiëren naar nieuwe calculatie
- Koppelen aan project
- Verwijderen

9. Bij "Kopiëren naar nieuwe calculatie":
- Maak een nieuwe conceptcalculatie.
- Neem alle regels en opslagen over.
- Laat projectgegevens opnieuw kiezen.
- Bewaar een verwijzing naar de oorspronkelijke ENK-calculatie.

10. Voorkom dubbele uploads door te controleren op:
- Bestandsnaam
- Bestandsgrootte
- Bestands-hash
- Calculatienummer

Toon bij een mogelijke dubbele upload een waarschuwing.

11. Sla per import op:
- Origineel bestand
- Uitgelezen gegevens
- Handmatige aanpassingen
- Importdatum
- Gebruiker
- Waarschuwingen
- Verschil tussen ENK-totaal en Connect-totaal

12. Verwijder een origineel ENK-bestand nooit automatisch wanneer een calculatie wordt aangepast.

13. Zorg voor rechten:
- Gebruikers met calculatierechten mogen uploaden en importeren.
- Alleen bevoegde gebruikers mogen bronbestanden verwijderen.
- Andere gebruikers mogen bestanden alleen bekijken.

14. Gebruik bestaande opslag, project- en calculatiemodellen van Connect. Bouw geen losstaand systeem.

15. Begin met een analyse van de huidige bestandsupload, projectkoppeling en calculatiemodellen. Implementeer daarna in kleine stappen zonder bestaande functionaliteit te breken.