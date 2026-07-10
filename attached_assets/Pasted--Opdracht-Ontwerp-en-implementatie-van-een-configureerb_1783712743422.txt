**Opdracht – Ontwerp en implementatie van een configureerbare Governance & Approval Engine**

Voer **nog geen implementatie** uit. Werk eerst een volledig technisch ontwerp uit en leg dit ter goedkeuring voor.

## Doel

Ontwikkel een generieke Governance & Approval Engine die door alle huidige en toekomstige modules van Connect-One gebruikt kan worden. De engine mag niet specifiek zijn voor offertes of facturen, maar moet het centrale autorisatie-, goedkeurings- en beleidsplatform van de applicatie worden.

De oplossing moet volledig configureerbaar zijn vanuit de applicatie zonder dat broncode hoeft te worden aangepast.

---

# 1. Uitbreiding autorisatiemodel

Breid het huidige rechtenmodel uit.

Ondersteun minimaal:

* Read
* Create
* Update
* Delete
* Approve
* Publish / Send
* Recall
* Archive

Deze rechten moeten afzonderlijk kunnen worden toegekend per:

* gebruiker
* rol
* afdeling
* module

---

# 2. Generieke Approval Engine

Ontwerp een engine die voor elk documenttype gebruikt kan worden.

Ondersteun minimaal:

* offertes
* facturen
* inkooporders
* inspectierapporten
* opleverrapporten
* contracten
* documenten
* urenstaten
* projectafsluitingen

Nieuwe documenttypen moeten later eenvoudig toegevoegd kunnen worden.

---

# 3. Vier-ogen-principe

Ondersteun configureerbaar:

* auteur mag niet zelf goedkeuren
* auteur mag wel goedkeuren
* tweede goedkeurder verplicht
* meerdere goedkeurders
* parallelle goedkeuring
* sequentiële goedkeuring

Alles instelbaar per documenttype.

---

# 4. Financiële goedkeuringsgrenzen

Ontwikkel een configureerbare matrix.

Voorbeelden:

Inkoop

* tot €500
* €500–€5.000
* > €5.000

Facturen

* tot €2.500
* €2.500–€10.000
* > €10.000

Offertes

* per bedrag
* per projecttype
* per klantcategorie

De directeur moet deze grenzen volledig zelf kunnen wijzigen via een beheerscherm.

Geen bedragen mogen in code worden vastgelegd.

---

# 5. Bedrijfsbeleid (Governance)

Ontwikkel een centrale Governance-pagina.

Hier moeten onder andere configureerbaar zijn:

* financiële limieten
* verplichte goedkeuringsniveaus
* verplichte tweede controle
* uitzonderingen
* projectafwijkingen
* klantafwijkingen
* spoedprocedures
* digitale handtekening verplicht
* verplichte bijlagen
* afwijkende workflows

Dit vormt het centrale bedrijfsbeleid.

---

# 6. Escalatie-engine

Ondersteun configureerbare escalaties.

Voorbeeld:

Dag 1

→ medewerker

Dag 3

→ projectleider

Dag 7

→ hoofdbeheerder

Dag 14

→ directeur

Instelbaar per workflow.

---

# 7. Operations Monitoring Dashboard

Ontwerp één centraal dashboard waarin alle bewaking samenkomt.

Onder andere:

* open goedkeuringen
* verlopen documenten
* SLA-waarschuwingen
* onderhoud
* certificaten
* HRM-contracten
* APK
* gereedschapskeuringen
* voorraad
* AI-budget
* systeemmeldingen
* back-upstatus
* open recalls

Ondersteun:

* prioriteiten
* filters
* eigenaarschap
* doorklikken
* escalatiestatus

---

# 8. Recall & Lifecycle Engine

Ontwerp een generieke levenscyclus.

Ondersteun minimaal:

Concept

In behandeling

Goedgekeurd

Verzonden

Gelezen

Ingetrokken

Vervangen

Verlopen

Gearchiveerd

Bij intrekken:

* reden verplicht
* automatische vervolgcommunicatie
* volledige audittrail

---

# 9. Workflow Timeline

Iedere wijziging moet zichtbaar worden op één chronologische tijdlijn.

Voorbeelden:

* aangemaakt
* gewijzigd
* goedgekeurd
* afgewezen
* verzonden
* geopend
* herinnering verstuurd
* ingetrokken
* vervangen
* gearchiveerd

Per actie:

* gebruiker
* datum/tijd
* actie
* opmerkingen
* eventuele reden

---

# 10. Audit

Alle wijzigingen aan governance-instellingen moeten eveneens worden gelogd.

Onder andere:

* oude waarde
* nieuwe waarde
* gebruiker
* datum
* reden

Ook wijzigingen aan goedkeuringsgrenzen moeten volledig auditbaar zijn.

---

# 11. Database

Werk een voorstel uit voor:

* nieuwe tabellen
* relaties
* migraties
* indexering
* performance-impact

---

# 12. API

Werk alle benodigde API-endpoints uit.

Beschrijf:

* requests
* responses
* autorisatie
* foutafhandeling

---

# 13. Front-end

Werk een UI-ontwerp uit voor:

* Governance
* Approval Matrix
* Goedkeuringsdashboard
* Workflow Timeline
* Escalatiebeheer
* Recallbeheer

---

# 14. Implementatievolgorde

Lever eerst uitsluitend een technisch ontwerp op met:

* architectuur
* datamodel
* API-ontwerp
* UI-concept
* migratieplan
* risicoanalyse
* implementatieplanning

**Start pas met programmeren nadat het ontwerp is goedgekeurd.**

## Ontwerpprincipes

* Volledig generiek en modulair.
* Niet gekoppeld aan één documenttype.
* Volledig configureerbaar via de applicatie.
* Geen hardgecodeerde financiële limieten of workflowregels.
* Geschikt als centrale governance-laag voor alle huidige én toekomstige Connect-One modules.
* Ontwerp uitbreidbaar zodat toekomstige Forge-componenten (zoals beleidsanalyse, AI-ondersteunde risicodetectie en procesoptimalisatie) kunnen aansluiten zonder de basisarchitectuur te wijzigen.
