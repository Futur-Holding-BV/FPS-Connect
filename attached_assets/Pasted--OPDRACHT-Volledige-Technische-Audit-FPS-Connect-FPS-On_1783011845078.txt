# OPDRACHT – Volledige Technische Audit FPS Connect / FPS One

## Doel

Voer een volledige technische audit uit van de huidige applicatie.

Er mogen GEEN wijzigingen aan de code, database, configuratie of infrastructuur worden uitgevoerd.

Het doel is uitsluitend om de huidige staat van FPS Connect / FPS One volledig in kaart te brengen als voorbereiding op een mogelijke migratie naar een ander AI-ontwikkelplatform. De audit moet objectief zijn en gebaseerd op de daadwerkelijke codebase.

---

# 1. Algemene Projectanalyse

Analyseer de volledige applicatie en geef een overzicht van:

- Totale omvang van het project
- Aantal bestanden
- Aantal regels code
- Gebruikte programmeertalen
- Frameworks
- Libraries
- Package managers
- Runtime(s)
- Database(s)
- Storage-oplossingen
- Hostingcomponenten
- Authenticatie
- AI-componenten
- Externe API's

Maak tevens een overzicht van de volledige systeemarchitectuur.

---

# 2. Mappenstructuur

Maak een volledige boomstructuur van het project.

Per map aangeven:

- Doel
- Functie
- Belangrijkste afhankelijkheden
- Kritisch of niet-kritisch onderdeel

---

# 3. Functionele Modules

Inventariseer alle aanwezige modules.

Onder andere:

- Dashboard
- CRM
- Gebouwen
- Projecten
- Calculaties
- Offertes
- Werkvoorbereiding
- Inkoop
- Uitvoering
- Oplevering
- Onderhoud
- Documentbibliotheek
- Slim Uploaden
- AI
- Planning
- HRM
- Klantenportaal (One)
- Rapportages
- Mail
- Rollen & Rechten
- Instellingen

Per module rapporteren:

- Huidige status
- Geschatte compleetheid (%)
- Afhankelijkheden
- Technische kwaliteit
- Migratiecomplexiteit
- Herbruikbaar zonder wijzigingen (Ja/Nee/Gedeeltelijk)

---

# 4. Databaseanalyse

Maak een volledig overzicht van:

- Tabellen
- Relaties
- Foreign Keys
- Indexen
- Views
- Storage Buckets
- Bestandsopslag

Genereer tevens een ER-diagram van de database.

---

# 5. AI-Architectuur

Analyseer alle AI-functionaliteit.

Breng in kaart:

- Welke AI-functionaliteiten aanwezig zijn
- Welke AI-providers worden gebruikt
- Welke modellen worden gebruikt
- Waar prompts zijn gedefinieerd
- Hoe AI wordt aangeroepen
- Welke processen synchroon zijn
- Welke processen asynchroon zijn
- Waar AI onnodig zwaar wordt ingezet
- Welke AI-processen vervangen kunnen worden door eenvoudige logica of classificatie

---

# 6. Externe Koppelingen

Maak een overzicht van alle externe koppelingen.

Bijvoorbeeld:

- Azure
- Microsoft Graph
- OpenAI
- Google Maps
- Google Places
- Eventuele overige API's

Per koppeling aangeven:

- Doel
- Status
- Kritisch voor de applicatie
- Platformafhankelijkheid
- Migratierisico

---

# 7. Front-end Analyse

Analyseer de volledige gebruikersinterface.

Geef een overzicht van:

- Pagina's
- React-componenten
- Layouts
- Dialogen
- Hooks
- Services
- Utilities
- Context Providers
- State Management

Controleer tevens op:

- Dubbele componenten
- Ongebruikte componenten
- Grote componenten die opgesplitst kunnen worden
- Componenten met meerdere verantwoordelijkheden

---

# 8. Performance Analyse

Controleer onder andere:

- Grote pagina's
- Langzame componenten
- Dubbele databasequeries
- Overmatig renderen
- Memory leaks
- Uploadprestaties
- AI-verwerking
- Databaseprestaties

Rapporteer per onderdeel de grootste knelpunten.

---

# 9. Codekwaliteit

Voer een volledige codekwaliteitsanalyse uit.

Controleer op:

- Technische schuld
- Dubbele code
- Dead code
- Tijdelijke oplossingen
- TODO's
- Grote functies
- Grote bestanden
- Inconsistente naamgeving
- Inconsistente architectuur
- Mogelijke bugs
- Complexiteit

Geef iedere categorie een score van 1 t/m 10.

---

# 10. Veiligheid

Controleer onder andere:

- Environment Variables
- Secrets
- API Keys
- Authenticatie
- Autorisaties
- Rolstructuur
- Inputvalidatie
- Uploadbeveiliging
- SQL-injection risico's
- XSS-risico's
- Bestandsrechten

Rapporteer uitsluitend bevindingen.

Geen wijzigingen uitvoeren.

---

# 11. GitHub Export Readiness

Controleer of het project geschikt is om zonder problemen naar GitHub te exporteren.

Controleer onder andere:

- Buildproces
- Dependencies
- Package-lock
- Configuratiebestanden
- Environment variables
- Secrets
- Scripts
- Databaseconfiguratie
- Storageconfiguratie

Geef een oordeel:

- Direct exporteerbaar
- Exporteerbaar na kleine aanpassingen
- Eerst technische opschoning noodzakelijk

---

# 12. Migratieanalyse

Beantwoord objectief:

- Welke onderdelen kunnen zonder aanpassingen worden overgenomen?
- Welke onderdelen vereisen beperkte aanpassingen?
- Welke onderdelen moeten waarschijnlijk opnieuw worden gebouwd?
- Welke onderdelen zijn platformafhankelijk?
- Welke onderdelen vormen een technisch risico?
- Welke onderdelen zijn juist sterk opgezet en verdienen behoud?

---

# 13. Eindrapport

Maak een managementrapport bestaande uit:

## Samenvatting

- Huidige volwassenheid van FPS Connect / FPS One
- Grootste sterke punten
- Grootste zwakke punten
- Grootste technische risico's
- Verwachte onderhoudbaarheid
- Geschiktheid voor verdere schaalvergroting

## Eindbeoordeling

Geef een score van 1 t/m 10 voor:

- Architectuur
- Codekwaliteit
- Onderhoudbaarheid
- AI-architectuur
- Performance
- Schaalbaarheid
- Veiligheid
- Migratiegeschiktheid

---

# 14. Conclusie

Beantwoord uitsluitend op basis van de feitelijke analyse de volgende vragen:

1. Is de huidige applicatie geschikt als basis voor verdere professionele ontwikkeling?
2. Is migratie naar een ander AI-ontwikkelplatform realistisch?
3. Kan de bestaande code grotendeels behouden blijven?
4. Welke migratiestrategie heeft technisch de voorkeur?
5. Welke risico's moeten eerst worden opgelost voordat een migratie plaatsvindt?

---

# Randvoorwaarden

- Er mogen GEEN wijzigingen worden uitgevoerd aan de code, database, configuratie of infrastructuur.
- Er mogen GEEN bestanden worden verwijderd of aangepast.
- Er mogen GEEN packages worden bijgewerkt.
- Er mogen GEEN refactorings worden uitgevoerd.
- Er mogen GEEN AI-prompts worden aangepast.
- Er mogen GEEN databasewijzigingen plaatsvinden.
- Er mogen GEEN nieuwe bestanden worden aangemaakt, behalve indien noodzakelijk voor het eindrapport.
- Baseer alle conclusies uitsluitend op de huidige implementatie.
- Onderbouw bevindingen met concrete voorbeelden uit de codebase waar relevant.

---

# Op te leveren

Lever één compleet auditrapport op in Markdown met:

1. Managementsamenvatting
2. Technische architectuur
3. Module-overzicht
4. Database-overzicht inclusief ER-diagram
5. AI-architectuur
6. Front-end analyse
7. Back-end analyse
8. Security-analyse
9. Performance-analyse
10. Codekwaliteitsanalyse
11. GitHub Export Readiness
12. Migratieanalyse
13. Eindconclusie
14. Prioriteitenlijst met aanbevelingen (Hoog / Middel / Laag)

Voer uitsluitend de analyse uit. Wacht met alle verbeteringen totdat daar expliciet opdracht voor wordt gegeven.