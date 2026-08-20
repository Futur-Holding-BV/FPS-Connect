Opdracht: security-hercontrole na AI Gateway en API-uitbreidingen

Controleer of de oorspronkelijke veiligheidsmaatregelen nog volledig werken na alle nieuwe API’s, AI Gateway, logging, exports en contextkoppelingen.

Doel:
Geen nieuwe features bouwen. Alleen verifiëren, herstellen en harden waar bestaande beveiliging is verzwakt of omzeild.

Controleer minimaal:

1. Authenticatie
- Alle API-routes vereisen geldige sessie/authenticatie.
- Geen publieke routes tenzij expliciet bedoeld.
- AI Gateway, AI-logs, exports en beheer-endpoints zijn nooit publiek toegankelijk.

2. Autorisatie en rollen
- Directie/beheerfunctionaliteit is alleen toegankelijk voor juiste rollen.
- AI-logboek, kostenregistratie, Prompt Registry, CSV-export en kostendrempels zijn admin-only.
- Gebruikers kunnen alleen data zien die bij hun rol, werkmaatschappij, project of gebouw hoort.

3. Server-side afdwinging
- Geen beveiliging alleen in de frontend.
- Alle rolcontroles ook in route-handlers/services.
- Geen client-side bypass mogelijk via directe API-calls.

4. AI Gateway
- Alle AI-aanroepen lopen via AiGatewayService.
- Geen directe provider-calls.
- Geen API-keys, secrets of tokens in frontend, logs, exports of foutmeldingen.
- Prompt Registry en contextBronnen lekken geen gevoelige data naar onbevoegde gebruikers.
- Logging maskeert of beperkt persoonsgegevens en vertrouwelijke inhoud waar nodig.

5. Inputvalidatie
- Alle nieuwe API’s valideren body, params en query-string met schema’s.
- Geen ongecontroleerde JSON, bestandsnamen, IDs of filterparameters.
- CSV-export voorkomt formule-injectie.

6. Bestanden en documenten
- Uploads zijn type-, grootte- en rechten-gecontroleerd.
- Downloads en previews controleren autorisatie per document.
- Geen directe toegang tot bestanden via voorspelbare URL’s.

7. Multi-tenant / werkmaatschappij-scheiding
- Data van FPS Brandpreventie, FPS Bouw, FPS Onderhoud en FPS Bouw en Renovatie blijft correct gescheiden waar dat functioneel vereist is.
- Rapporten en documenten tonen alleen toegestane bedrijfsdata.

8. Logging en foutafhandeling
- Foutmeldingen tonen geen stack traces, SQL, secrets of interne paden aan gebruikers.
- Logs bevatten voldoende auditinformatie, maar geen onnodige gevoelige inhoud.
- AI-fouten geven gecontroleerde fallback, geen lege pagina of crash.

9. Rate limiting en misbruik
- AI Gateway heeft bescherming tegen herhaald of onbeperkt aanroepen.
- Export-, upload- en zoekendpoints zijn beschermd tegen misbruik.
- Kostenlimieten kunnen niet worden omzeild.

10. Regressiecontrole
- Controleer bestaande securitytests en voeg alleen ontbrekende kritieke tests toe.
- Los alleen echte securityregressies op.
- Geen refactors buiten securityscope.

Werkwijze:
- Begin met een route-inventarisatie van alle API-endpoints.
- Markeer per endpoint: auth vereist, rol vereist, data-scope, inputvalidatie, logging, risico.
- Herstel direct elk endpoint dat niet voldoet.
- Werk door zonder te wachten op akkoord.
- Na afronding terug naar de productie-roadmap.

Acceptatiecriteria:
- Geen onbeveiligde beheer-, AI-, export-, upload- of financiële endpoints.
- Geen directe AI-provider-calls buiten AiGatewayService.
- Geen secrets of gevoelige data in client, logs, exports of foutmeldingen.
- Autorisatie wordt server-side afgedwongen.
- Kritieke regressietests slagen.