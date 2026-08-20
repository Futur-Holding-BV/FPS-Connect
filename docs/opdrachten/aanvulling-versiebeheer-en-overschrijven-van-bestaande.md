Aanvulling – Versiebeheer en overschrijven van bestaande documentmodellen

Probleem:
Wanneer later een nieuw referentie-/briefpapiermodel wordt geüpload voor dezelfde werkmaatschappij en hetzelfde documenttype, mag het systeem niet stilzwijgend het bestaande model vervangen.

Gewenst gedrag:
Als er al een actief model bestaat en de gebruiker uploadt een nieuw model, dan moet het systeem expliciet vragen:

“Er bestaat al een actief model voor [werkmaatschappij] – [documenttype]. Wil je dit model vervangen?”

Keuzes:

1. Bestaand model behouden
- Upload annuleren of alleen als losse conceptversie bewaren.
- Actief model blijft ongewijzigd.

2. Nieuw model als concept toevoegen
- Nieuw model wordt opgeslagen als concept.
- Bestaand actieve model blijft gebruikt worden.
- Gebruiker kan later vergelijken en goedkeuren.

3. Nieuw model activeren vanaf nu
- Oud model wordt gearchiveerd, niet verwijderd.
- Nieuw model wordt actieve versie.
- Vanaf dat moment gebruiken alle nieuw te maken documenten dit nieuwe model.
- Reeds bestaande/gemaakte documenten blijven gekoppeld aan het oude model waarmee ze zijn gemaakt.

Belangrijke regel:
Een nieuw model mag alleen gelden voor documenten die vanaf dat moment worden gemaakt. Historische documenten mogen niet automatisch wijzigen.

Vereist:
- Modelversies bewaren.
- Actieve versie per werkmaatschappij + documenttype vastleggen.
- Documenten moeten vastleggen met welke modelversie ze zijn gegenereerd.
- Oudere modelversies moeten raadpleegbaar blijven.
- Gebruiker moet kunnen zien:
  - actieve versie;
  - vorige versies;
  - upload-/activatiedatum;
  - wie de wijziging heeft gedaan.

Acceptatie:
1. Upload eerste briefpapiermodel voor FPS Brandpreventie – Offerte.
2. Model wordt actieve versie.
3. Upload tweede briefpapiermodel voor dezelfde combinatie.
4. Systeem vraagt expliciet of het bestaande model moet worden vervangen.
5. Kies “nieuw model als concept” → actieve model blijft ongewijzigd.
6. Kies “activeren vanaf nu” → nieuw model wordt actief.
7. Nieuw aangemaakte documenten gebruiken het nieuwe model.
8. Oude documenten blijven gekoppeld aan de oude modelversie.
9. Oude modelversie blijft zichtbaar in versiehistorie.