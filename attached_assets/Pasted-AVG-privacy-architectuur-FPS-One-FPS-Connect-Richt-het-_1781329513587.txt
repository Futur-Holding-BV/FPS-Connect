AVG / privacy-architectuur FPS One & FPS Connect

Richt het datamodel en de rechtenstructuur AVG-proof in volgens het uitgangspunt:

Iedere persoon bestaat één keer in het systeem en krijgt één of meerdere rollen.

Rollen:
- FPS medewerker
- Inhuurkracht
- Contactpersoon klant
- Bewoner / huurder
- Leverancier
- Inspecteur
- Klantgebruiker FPS One

Maak de volgende hoofdentiteiten:
1. Organisatie
2. Gebouw
3. Woning / ruimte
4. Persoon
5. Rol
6. Contract
7. Project
8. Onderhoudscontract

Datamodel:
Organisatie → Gebouw → Woning/Ruimte → Bewoner
Organisatie → Contactpersoon
Gebouw → Project
Gebouw → Onderhoudscontract
Persoon → Rol(len)

Belangrijke AVG-regels:
- Bewoners/huurders niet opnemen in CRM.
- Bewoners alleen koppelen aan woning/ruimte.
- Geen BSN, geboortedata, medische gegevens of gezinssamenstelling opslaan.
- Alleen noodzakelijke gegevens opslaan: naam, adres, telefoon, e-mail en afspraakgegevens.
- Zakelijke klantcontacten beperken tot zakelijke gegevens.
- Medewerkers- en inhuurgegevens afschermen per rol.

Bouw een rollen- en rechtenmatrix met minimaal:
- Monteur
- Teamleider
- Werkvoorbereider
- Projectleider
- KAM
- Directie
- Klant
- Bewoner
- Onderhoudsmedewerker
- Systeembeheerder

Per module instelbaar maken:
- Lezen
- Toevoegen
- Wijzigen
- Verwijderen
- Exporteren

Modules:
- Gebouwen
- Projecten
- Onderhoud
- Relaties
- Organisatie
- DMS / Bibliotheek
- Systeembeheer

Voeg AVG-functionaliteit toe:
- Logging wie welke persoonsgegevens bekijkt of wijzigt.
- Auditlog per persoon, gebouw en klant.
- Bewaartermijnen per persoonsrol.
- Mogelijkheid om persoonsgegevens te exporteren.
- Mogelijkheid om persoonsgegevens te anonimiseren of verwijderen.
- Privacy-instellingen per rol.
- Consent/communicatievoorkeuren indien relevant.
- Markering “AVG-gevoelige gegevens”.

Belangrijk:
Onderhoud mag nieuwe gebouwen aanmaken, maar alle gebouwen moeten terechtkomen in hetzelfde centrale gebouwenregister.

Abonnementen mogen geen losse module zijn. Leg abonnementen vast als contractvorm onder Organisatie/Klant:
- FPS One abonnement
- Onderhoudscontract
- Overige contracten

Doel:
FPS One en FPS Connect moeten vanaf de basis voorbereid zijn op AVG-compliance voor:
- eigen medewerkers
- inhuurkrachten
- klantcontactpersonen
- bewoners/huurders van klanten