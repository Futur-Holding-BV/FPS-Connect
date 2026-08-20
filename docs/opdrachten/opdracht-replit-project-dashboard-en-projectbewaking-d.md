# Opdracht Replit – Project-dashboard en projectbewaking

## Doel

Bouw binnen FPS Connect per project één centraal Project-dashboard.

Dit dashboard moet de actuele stand van het project tonen zoals professionele projectbewakingstools dat doen.

De gebruiker moet in één scherm kunnen zien:

- waar het project staat;
- wat de financiële stand is;
- welke acties openstaan;
- waar risico’s zitten;
- wat de voortgang is;
- of het project binnen planning en budget blijft.

Het Project-dashboard is de startpagina van ieder project.

---

# Plaats in Connect

Wanneer een gebruiker een project opent, komt hij eerst op:

**Project-dashboard**

Daarna kan hij doorklikken naar:

- Gebouwgegevens
- Opnames
- Calculaties
- Offertes
- Werkbegroting
- Inkoopplanning
- Uitvoeringsplanning
- Uren
- Nacalculatie
- Facturen
- Opleverrapportage
- Onderhoud
- Documenten
- Communicatie

Het huidige tabblad “Gebouw” blijft bestaan, maar is niet langer de startpagina.

---

# Dashboard-opbouw

## 1. Projectkop

Toon bovenaan:

- projectnaam
- projectnummer
- klant
- gebouw / locatie
- werkmaatschappij
- projectleider
- werkvoorbereider
- projectstatus
- startdatum
- geplande uitvoeringsdatum
- verwachte opleverdatum
- actuele fase

Gebruik duidelijke statuslabels.

Voorbeelden:

- Offertefase
- Opdracht ontvangen
- Werkbegroting concept
- Werkbegroting akkoord
- Inkoop loopt
- Uitvoering gepland
- In uitvoering
- Oplevering controleren
- Gefactureerd
- Afgesloten
- Risico

---

# 2. Voortgangsbalk projectflow

Toon een visuele projectflow:

Opname
→ Calculatie
→ Offerte
→ Opdracht
→ Werkbegroting
→ Inkoop
→ Planning
→ Uitvoering
→ Oplevering
→ Facturatie
→ Onderhoud

Per stap tonen:

- niet gestart
- bezig
- gereed
- geblokkeerd
- risico

De gebruiker moet direct kunnen doorklikken naar iedere stap.

---

# 3. Financiële projectkaart

Toon een financiële samenvatting:

- opdrachtsom
- goedgekeurd meerwerk
- totale verkoopwaarde
- begrote kosten
- werkbegroting
- werkelijk geboekte kosten
- verwachte eindkosten
- actuele marge
- verwachte eindmarge
- reeds gefactureerd
- nog te factureren
- openstaande inkoopfacturen
- onderhanden werk
- resultaatprognose

Gebruik kleuren of waarschuwingen bij afwijkingen.

Bijvoorbeeld:

- marge onder doelmarge
- kosten boven werkbegroting
- facturatie loopt achter
- veel kosten maar weinig voortgang
- onderhanden werk controleren

---

# 4. Planning en uitvoering

Toon:

- geplande start
- geplande einddatum
- actuele voortgang
- geplande uren
- geboekte uren
- resterende uren
- monteurs gepland
- openstaande uitvoeringsdagen
- vertragingen
- blokkades

AI moet signaleren:

- uitvoering niet gepland
- planning botst met levertijden
- te weinig uren gepland
- uren lopen uit
- oplevering niet ingepland

---

# 5. Inkoop en materiaal

Toon:

- benodigde materialen
- uit voorraad gereserveerd
- nog te bestellen
- besteld
- geleverd
- ontbrekend
- lange levertijd
- materiaalverbruik op project
- afwijking t.o.v. werkbegroting

AI moet signaleren:

- materiaal niet op tijd beschikbaar
- materiaal wel nodig maar niet besteld
- materiaal uit magazijn gebruikt maar niet begroot
- voorraadreservering ontbreekt
- leverancier levert te laat

---

# 6. Acties en blokkades

Toon centraal:

- open acties
- beslissingen nodig
- ontbrekende informatie
- taken voor projectleider
- taken voor werkvoorbereider
- taken voor administratie
- taken voor monteur
- klantactie nodig

Voorbeelden:

- werkbegroting nog akkoord geven
- offerte nog niet ondertekend
- inkoopplanning ontbreekt
- uitvoeringsdatum ontbreekt
- opleverrapportage nog niet gecontroleerd
- factuur nog niet verzonden
- onderhoudsvoorstel nog niet opgevolgd

---

# 7. Documenten en communicatie

Toon recente relevante documenten:

- offerte
- opdrachtbevestiging
- calculatie
- werkbegroting
- tekeningen
- foto’s
- rapportages
- opleverrapport
- inkoopoffertes
- facturen
- e-mails

Toon ook recente communicatie:

- inkomende e-mails gekoppeld aan project
- verzonden e-mails
- interne opmerkingen
- AI-samenvatting van recente communicatie

---

# 8. AI Projectbewaker

Voeg rechts op het dashboard een vaste AI Projectbewaker toe.

Deze geeft korte, concrete signaleringen.

Voorbeelden:

- “Werkbegroting is nog concept, maar inkoopplanning wordt al geopend.”
- “Er zijn kosten geboekt, maar nog geen uitvoeringsplanning.”
- “De actuele marge ligt 6% lager dan begroot.”
- “Er is materiaal nodig met lange levertijd.”
- “Project lijkt gereed, maar opleverrapportage ontbreekt.”
- “Er is nog geen onderhoudsvoorstel aangemaakt.”
- “Dit project moet mogelijk als onderhanden werk worden opgenomen.”

AI mag alleen signaleren en voorstellen doen.

De projectleider blijft verantwoordelijk voor akkoord.

---

# 9. Onderhanden werk

Neem onderhanden werk direct op in het Project-dashboard.

Toon:

- waarde geleverde prestatie
- reeds gefactureerd
- nog te factureren
- geboekte kosten
- verwachte marge
- OHW-status
- peildatum
- jaarrekeningrelevantie

Statussen:

- Niet relevant
- Mogelijk OHW
- OHW controleren
- OHW akkoord
- Afgesloten

---

# 10. Projectgezondheid

Maak een simpele projectgezondheidsscore.

Deze score is niet leidend, maar helpt bij prioriteren.

Gebaseerd op:

- planning
- marge
- facturatie
- inkoop
- materiaalbeschikbaarheid
- open acties
- klantcommunicatie
- opleverstatus

Toon als:

- Groen: onder controle
- Oranje: aandacht nodig
- Rood: risico

Laat altijd zien waarom de score zo is.

---

# 11. Doorklikbare kaarten

Alle kaarten moeten klikbaar zijn.

Klik op “Marge” opent nacalculatie.

Klik op “Materiaal ontbreekt” opent inkoopplanning.

Klik op “Oplevering ontbreekt” opent opleverrapportage.

Klik op “Nog te factureren” opent facturatie.

Klik op “Open acties” opent takenlijst.

---

# 12. Rollen

Het dashboard toont informatie afhankelijk van rol.

## Directie / beheerder

Ziet alles:

- financieel
- marge
- OHW
- risico’s
- facturatie
- projectstatus

## Projectleider

Ziet:

- voortgang
- planning
- werkbegroting
- marge
- acties
- inkoop
- oplevering

## Werkvoorbereider

Ziet:

- werkbegroting
- inkoop
- materiaal
- planning
- acties

## Monteur

Ziet alleen:

- planning
- opdrachtinformatie
- uitvoeringsinstructies
- materialen
- open uitvoeringsacties
- opleverpunten

Geen marges of interne financiële details.

---

# 13. Belangrijk ontwerpprincipe

Het Project-dashboard is geen extra administratieve pagina.

Het is de centrale cockpit van het project.

Alle bestaande projectmodules blijven bestaan, maar het dashboard haalt de belangrijkste informatie samen en toont afwijkingen, risico’s en volgende acties.

De gebruiker moet niet hoeven zoeken waar het project staat.

Connect moet dit direct laten zien.