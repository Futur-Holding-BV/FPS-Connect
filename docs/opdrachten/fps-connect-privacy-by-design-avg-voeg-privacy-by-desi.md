# FPS Connect – Privacy by Design (AVG)

Voeg Privacy by Design als fundamenteel architectuurprincipe toe aan FPS Connect.

Privacy is geen losse module maar een onderdeel van iedere functie binnen Connect.

## Uitgangspunt

Connect is gebouwd om projecten, gebouwen, Spots, planning en bedrijfsvoering te ondersteunen.

Het systeem is niet ontworpen om medewerkers continu te controleren.

Persoonsgegevens worden uitsluitend verwerkt wanneer dit noodzakelijk is voor:

* uitvoering van de arbeidsovereenkomst
* projectuitvoering
* planning
* urenregistratie
* wettelijke verplichtingen
* beveiliging van bedrijfsmiddelen
* bedrijfsvoering

---

# Rollen en autorisaties

Werk met role based access control.

Voorbeelden:

Monteur

* Alleen eigen gegevens
* Eigen planning
* Eigen uren
* Eigen verlof

Projectleider

* Projectgegevens
* Planning
* Teambezetting
* Alleen noodzakelijke personeelsgegevens

HR

* Personeelsdossiers
* Verlof
* Contracten

Financieel

* Financiële gegevens
* Geen medische informatie
* Geen onnodige locatiegegevens

Directie

* Dashboards
* KPI's
* Analyses
* Detailinformatie uitsluitend indien noodzakelijk

Iedere gebruiker ziet uitsluitend gegevens die noodzakelijk zijn voor zijn functie.

---

# AI

Connect AI ondersteunt medewerkers.

AI neemt nooit besluiten over medewerkers.

AI mag:

* signaleren
* adviseren
* analyseren
* voorspellen

AI mag niet:

* medewerkers beoordelen
* disciplinaire conclusies trekken
* automatisch uren aanpassen
* automatisch ritten afkeuren
* automatisch verlof weigeren

De eindbeslissing ligt altijd bij een bevoegde medewerker.

---

# GPS en voertuiggegevens

Connect ondersteunt koppelingen met systemen zoals Traxgo.

Uitgangspunten:

* GPS uitsluitend gebruiken voor bedrijfsdoeleinden.
* Geen permanente live monitoring zonder noodzaak.
* Locatiegegevens alleen tonen wanneer functioneel noodzakelijk.
* Historische ritgegevens alleen toegankelijk voor bevoegde rollen.

AI gebruikt voertuiggegevens uitsluitend voor:

* planning
* reistijdanalyse
* projectvoortgang
* capaciteitsanalyse
* nacalculatie

Niet voor individuele prestatiebeoordeling.

---

# Dashboards

Dashboards richten zich primair op projecten en bedrijfsvoering.

Voorbeelden:

* projectresultaat
* orderportefeuille
* capaciteit
* planning
* werkvoorraad
* marges
* voortgang

Niet:

"Controle van medewerker X"

Maar:

"Project X loopt achter op planning."

---

# Dataminimalisatie

Sla uitsluitend gegevens op die noodzakelijk zijn.

Voorkom dubbele opslag.

Gebruik waar mogelijk verwijzingen in plaats van kopieën.

---

# Logging

Alle belangrijke acties worden gelogd.

Bijvoorbeeld:

* gebruiker
* datum
* tijd
* actie
* oude waarde
* nieuwe waarde

Auditlogs zijn alleen toegankelijk voor bevoegde gebruikers.

---

# Bewaartermijnen

Ontwerp de architectuur zodat bewaartermijnen instelbaar zijn.

Ondersteun automatische archivering en verwijdering volgens AVG.

---

# Transparantie

Medewerkers moeten eenvoudig kunnen zien:

* welke persoonsgegevens zijn opgeslagen
* waarom deze worden verwerkt
* wie toegang heeft
* wanneer gegevens zijn gewijzigd

---

# Rechten van betrokkenen

Bereid de architectuur voor op:

* inzage
* correctie
* export
* beperking van verwerking
* verwijdering waar wettelijk toegestaan

---

# Privacy by Design

Iedere nieuwe module moet voldoen aan de volgende vragen:

* Welke persoonsgegevens worden verwerkt?
* Waarom zijn deze noodzakelijk?
* Wie mag deze zien?
* Hoe lang worden deze bewaard?
* Zijn minder gegevens voldoende?
* Kan deze informatie worden gepseudonimiseerd?
* Wordt de verwerking gelogd?

Nieuwe modules die niet aan deze uitgangspunten voldoen, mogen niet worden toegevoegd zonder expliciete beoordeling.

Privacy by Design is een verplicht onderdeel van de architectuur van FPS Connect.
