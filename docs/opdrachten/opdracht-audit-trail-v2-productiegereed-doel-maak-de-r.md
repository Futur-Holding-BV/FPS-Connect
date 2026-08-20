# Opdracht – Audit Trail v2 (Productiegereed)

## Doel

Maak de reeds gebouwde Universele Audit Trail volledig productiegereed voor de toekomstige kantooromgeving.

Deze opdracht is GEEN uitbreiding, maar de afronding van de bestaande implementatie.

Gebruik het zojuist opgeleverde beoordelingsrapport als uitgangspunt.

## Belangrijk uitgangspunt

De Audit Trail is juridisch en operationeel één van de belangrijkste onderdelen van FPS Connect.

Veiligheid, AVG, performance en betrouwbaarheid hebben altijd prioriteit boven extra functionaliteit.

---

## 1. Gevoelige gegevens

Voorkom dat gevoelige informatie ooit in de audit_log terechtkomt.

Voer een centrale sanitiseerlaag in vóór iedere auditregistratie.

Gebruik GEEN blacklist, maar een whitelist.

Standaard alleen loggen:

- id
- status
- workflowstatus
- documentnummer
- projectnummer
- gebouw
- module
- actie
- gebruiker
- tijdstip

Alle overige velden uitsluitend indien expliciet toegestaan.

Masker minimaal:

- tokens
- Authorization headers
- cookies
- sessiegegevens
- wachtwoorden
- wachtwoordhashes
- TOTP secrets
- API keys
- BSN
- IBAN
- salarisgegevens
- medische gegevens
- overige privacygevoelige HRM-data

---

## 2. Authenticatie-routes

Controleer alle authenticatie-routes.

Voorkom dat login-, token- of TOTP-responses ooit worden opgeslagen.

Controleer minimaal:

- login
- mobile login
- logout
- refresh token
- password reset
- password change
- forgot password
- TOTP setup
- alle toekomstige authenticatie-endpoints

---

## 3. Payload-beperking

Voorkom onbeheersbare groei van de auditdatabase.

Introduceer:

- maximale payloadgrootte
- maximale nesting
- maximale arraylengte
- automatische truncatie met melding

De audit moet compact en leesbaar blijven.

---

## 4. CSV-export

CSV-export mag nooit gevoelige informatie bevatten.

Verwijder of anonimiseer minimaal:

- sessie-id
- tokens
- Authorization gegevens
- privacygevoelige JSON
- volledige payloads

Exporteer uitsluitend relevante auditinformatie.

---

## 5. Immutable Audit

Auditrecords mogen na opslag nooit meer gewijzigd worden.

Toestaan:

- INSERT

Niet toestaan:

- UPDATE
- DELETE

Verwijderen uitsluitend via bewaartermijn of archivering.

---

## 6. Betrouwbaarheid

Fire-and-forget mag de hoofdapplicatie nooit blokkeren.

Voeg toe:

- retrymechanisme
- foutregistratie
- monitoring
- teller voor gemiste audit-events

Bij storingen moet zichtbaar zijn hoeveel auditregels niet zijn opgeslagen.

---

## 7. Actorinformatie

Vul automatisch:

- gebruikersnaam
- gebruiker-id
- rol
- afdeling
- werkmaatschappij (indien beschikbaar)

Iedere auditregel moet zelfstandig leesbaar zijn.

---

## 8. Database-optimalisatie

Controleer en verbeter indien nodig:

- partial indexes
- indexgebruik
- insertsnelheid
- bewaartermijn
- archivering
- partitionering (voor toekomstige groei)

---

## 9. Tests

Voeg tests toe voor:

- sanitisatie
- authenticatie-routes
- CSV-export
- payloadlimieten
- retrymechanisme
- performance
- regressies

---

## 10. Acceptatiecriteria

De Audit Trail is pas gereed wanneer:

- geen gevoelige informatie kan uitlekken;
- aantoonbaar AVG-proof is;
- geschikt is voor langdurig productiegebruik;
- logging volledig betrouwbaar is;
- bestaande functionaliteit niet is gebroken;
- alle bestaande tests slagen;
- nieuwe tests succesvol zijn toegevoegd.

---

## Belangrijke instructie

Voer uitsluitend verbeteringen uit binnen de bestaande Audit Trail.

Geen nieuwe functionaliteit toevoegen.

Geen wijzigingen aan de architectuur van Connect buiten de Audit Trail.

Lever na afronding een beoordelingsrapport op met:

- uitgevoerde verbeteringen;
- resterende risico's;
- testresultaten;
- performance-impact;
- eindadvies of de Audit Trail productiegereed is voor de toekomstige kantooromgeving.