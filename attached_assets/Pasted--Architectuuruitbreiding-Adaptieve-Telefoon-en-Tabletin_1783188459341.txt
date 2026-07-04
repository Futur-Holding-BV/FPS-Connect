# Architectuuruitbreiding – Adaptieve Telefoon- en Tabletinterface voor de Monteur

## Doel

Ontwerp de monteur-app als een adaptieve gebruikersinterface die automatisch gebruik maakt van de beschikbare schermruimte.

Er worden géén aparte apps ontwikkeld voor telefoon en tablet.

Er is één codebase met een responsive interface die zich automatisch aanpast aan:

- schermgrootte;
- resolutie;
- oriëntatie;
- apparaat (telefoon of tablet).

Hierdoor krijgt iedere gebruiker dezelfde functionaliteit, maar optimaal gepresenteerd voor het beschikbare scherm.

---

# Uitgangspunten

De interface mag nooit simpelweg uitgerekt worden.

Extra schermruimte moet worden gebruikt om de monteur beter te begeleiden.

Het doel is niet méér informatie tonen, maar de juiste informatie gelijktijdig beschikbaar maken zodat de monteur zo min mogelijk hoeft te wisselen tussen schermen.

---

# Telefoonmodus

Op een telefoon staat eenvoud centraal.

Toon uitsluitend:

- huidige opdracht
- huidige uitvoeringsstap
- korte instructie
- foto maken
- stap afronden
- afwijking melden
- vraag aan AI

Alle overige informatie is op aanvraag beschikbaar.

---

# Tabletmodus

Wanneer een tablet wordt gebruikt schakelt de interface automatisch over naar een uitgebreid werkvenster.

Gebruik de extra schermruimte voor meerdere informatiepanelen.

Bijvoorbeeld:

LINKERPANEEL

- huidige stap
- uitleg
- waarom deze stap
- benodigd materiaal
- veiligheidsinformatie

MIDDENPANEEL

- grote projectfoto
- detailtekening
- uitsnede van plattegrond
- AI-markeringen
- referentiebeeld
- animatie
- exploded view (later)

RECHTERPANEEL

- AI-assistent
- controlepunten
- documenten
- ETA
- DoP
- montagevoorschriften
- projectnotities
- veelgemaakte fouten

ONDERAAN

Grote knoppen:

- Foto maken
- Stap afgerond
- Afwijking melden
- Vraag AI

---

# Adaptieve AI-presentatie

AI bepaalt niet alleen de volgende uitvoeringsstap.

AI bepaalt ook welke informatie op dat moment zichtbaar moet zijn.

Bijvoorbeeld:

Eenvoudige stap:

- korte instructie
- één foto

Complexe stap:

- detailtekening
- animatie
- montagevolgorde
- productblad
- controlepunten
- AI-uitleg

De gebruiker hoeft nooit zelf tientallen documenten te openen.

---

# Uitvoeringsmodus

Wanneer de monteur een opdracht start schakelt de tablet automatisch over naar een speciale Uitvoeringsmodus.

Deze modus:

- minimaliseert afleiding;
- verbergt overbodige menu's;
- houdt het scherm actief;
- toont grote knoppen voor gebruik met handschoenen;
- gebruikt hoog contrast voor buitengebruik;
- plaatst de camera direct onder handbereik.

Na afronding van de opdracht keert de app automatisch terug naar de normale werkomgeving.

---

# Contextafhankelijke documenten

Tijdens iedere stap bepaalt AI automatisch welke documenten relevant zijn.

Bijvoorbeeld:

- detailtekening
- projecttekening
- plattegrond
- productblad
- ETA
- DoP
- montagevoorschrift
- foto's uit de opname
- foto's van vergelijkbare projecten
- eerdere herstelwerkzaamheden

Alleen relevante documenten worden getoond.

---

# Camera als hoofdinterface

De camera vormt de belangrijkste invoermethode tijdens de uitvoering.

Na iedere foto:

- analyseert AI de situatie;
- vergelijkt AI deze met de gewenste uitvoering;
- markeert afwijkingen;
- geeft verbeterpunten;
- bepaalt of de volgende stap gestart kan worden.

De originele foto blijft altijd ongewijzigd.

AI-markeringen worden als aparte laag opgeslagen.

---

# Visuele ondersteuning

De tablet moet optimaal gebruik maken van de grotere schermruimte.

AI kan afhankelijk van de situatie tonen:

- referentiefoto's;
- detailtekeningen;
- gemarkeerde foto's;
- overlays;
- exploded views;
- montagevolgordes;
- korte animaties;
- veelgemaakte fouten;
- veiligheidswaarschuwingen.

AI kiest automatisch welke visual de monteur het beste helpt.

---

# Toekomstige uitbreidbaarheid

De architectuur moet voorbereid zijn op:

- 3D-modellen;
- IFC;
- Revit;
- AutoCAD;
- interactieve exploded views;
- AR (Augmented Reality);
- Vision AI;
- realtime kwaliteitscontrole.

Deze uitbreidingen mogen later kunnen worden toegevoegd zonder de bestaande interface opnieuw te ontwerpen.

---

# Belangrijk

Er worden géén aparte telefoon- of tablet-apps gebouwd.

Er is één adaptieve interface die automatisch de beschikbare schermruimte optimaal benut.

Het doel is dat de monteur zich volledig kan richten op de uitvoering, terwijl AI op het juiste moment precies de informatie, documenten en visuele ondersteuning toont die nodig zijn om de opdracht veilig, correct en efficiënt uit te voeren.