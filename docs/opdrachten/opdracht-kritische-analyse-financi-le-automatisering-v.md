OPDRACHT – Kritische analyse financiële automatisering vóór bouw

Doel:
Voorkom dat Connect een losse financiële module bouwt die niet aansluit op de bedrijfsworkflow of AccountView.

Voer geen implementatie uit.

Analyseer de bestaande code en rapporteer kritisch:

1. Welke financiële onderdelen bestaan al?
Controleer:
- facturen.ts
- AccountView-koppeling
- documenten/DMS
- werkbegroting
- uren
- werkbonnen
- regie
- magazijn
- materiaal-aanvragen
- opleverrapportage
- projectstatussen
- audit trail
- AI Gateway

2. Waar is nu de bron van waarheid?
Rapporteer per gegeven:
- klant/debiteur
- leverancier/crediteur
- project
- werknummer
- opdracht
- werkbegroting
- inkooporder
- levering
- factuur
- factuurregels
- btw-code
- G-rekening
- grootboekrekening
- betaalstatus
- factuurnummer
- boekstuknummer

Geef per gegeven aan:
- Connect
- AccountView
- e-mail/document
- gebruiker
- nog onbekend

3. Welke gaten blokkeren automatisering?
Rapporteer concreet:
- ontbrekende tabellen
- ontbrekende routes
- ontbrekende statusovergangen
- ontbrekende koppelingen
- ontbrekende AccountView-terugkoppeling
- ontbrekende documentherkenning
- ontbrekende projectkoppeling
- ontbrekende order/levering/factuur-matching

4. Wat kan AI nu betrouwbaar doen?
Classificeer:
- veilig automatisch voorbereiden
- alleen voorstel doen
- menselijke controle verplicht
- nu nog niet mogelijk

5. Welke risico’s zijn er?
Beoordeel minimaal:
- dubbele boekhouding
- foutieve btw-code
- foutieve G-rekening
- foutieve projectkoppeling
- dubbele factuur
- factuur zonder bestelling
- betaling aan verkeerde leverancier
- AI-hallucinatie
- ontbrekende audittrail
- onvolledige AccountView-koppeling
- algemene administratie krijgt alsnog boekhoudkundige keuzes

6. AccountView-koppeling
Onderzoek wat minimaal nodig is:
- verkoopfactuur klaarzetten
- inkoopfactuur klaarzetten
- factuurnummer terug
- boekstuknummer terug
- betaalstatus terug
- openstaande posten terug
- debiteuren/crediteuren synchronisatie
- grootboek/btw-code mapping
- foutafhandeling
- herstel bij mislukte export

7. Ontwerp daarna pas een minimale veilige implementatiefase.

Maak onderscheid tussen:

Fase 1:
Financiële Controlebox zonder boeken.
Alleen ontvangen, uitlezen, herkennen, koppelen, controleren en voorstellen.

Fase 2:
Verkoopfacturen voorbereiden vanuit oplevering, regie, weekstaten en termijnschema.

Fase 3:
Inkoopfacturen matchen met bestelling, levering, werkbegroting en project.

Fase 4:
AccountView-export en terugkoppeling.

Fase 5:
Projectimpact, nacalculatie, marge en cashflow.

8. Geef een GO / NO GO advies.

Belangrijk:
Bouw niets.
Geen nieuwe tabellen.
Geen nieuwe routes.
Geen AI-prompts.
Alleen analyse en implementatieadvies.

Beoordeel vanuit dit doel:
De algemene administratie moet facturen kunnen verwerken zonder specialistische boekhoudkundige kennis, terwijl AccountView de officiële boekhouding blijft en Connect de workflow, controle en projectimpact bewaakt.