# Opdracht – AI Opdrachtregisseur en Adaptieve Uitvoeringsassistent

## Doel

Ontwikkel binnen FPS One en FPS Connect één geïntegreerde AI-workflow die een opdracht begeleidt vanaf de eerste aanvraag tot en met de oplevering.

Het systeem mag geen verzameling losse AI-functies worden.

De AI moet gedurende de volledige levenscyclus van de opdracht dezelfde kennis gebruiken, uitbreiden en doorgeven.

Iedere fase bouwt voort op de vorige fase.

Er is altijd één bron van waarheid.

---

# Architectuur

## FPS One

FPS One is verantwoordelijk voor:

- analyse van de aanvraag;
- technisch advies;
- risicoanalyse;
- klantcommunicatie;
- adviesrapport;
- besluitvorming.

Na akkoord wordt de opdracht volledig overgedragen aan FPS Connect.

---

## FPS Connect

FPS Connect is verantwoordelijk voor:

- werkvoorbereiding;
- inkoop;
- planning;
- uitvoering;
- oplevering;
- onderhoud.

De AI moet tijdens iedere fase dezelfde opdracht blijven begrijpen.

Er mogen geen dubbele gegevens, dubbele AI-analyses of parallelle workflows ontstaan.

---

# Fase 1 – Adviescentrum

De gebruiker uploadt bijvoorbeeld:

- offerteaanvraag;
- bestek;
- tekeningen;
- foto's;
- documenten;
- aanvullende opmerkingen.

De AI analyseert automatisch:

- wat de opdrachtgever vraagt;
- welke werkzaamheden nodig zijn;
- welke normen en richtlijnen waarschijnlijk van toepassing zijn;
- welke risico's aanwezig zijn;
- welke informatie ontbreekt;
- welke aannames worden gemaakt;
- welke werkzaamheden binnen de competenties van FPS vallen.

De AI genereert vervolgens:

- opdrachtsamenvatting;
- technisch advies;
- aandachtspunten;
- risicoanalyse;
- vragen aan opdrachtgever;
- adviesrapport.

Na goedkeuring wordt de opdracht overgezet naar FPS Connect.

---

# Fase 2 – Werkvoorbereiding

De AI fungeert als senior werkvoorbereider.

Hij bepaalt automatisch:

- werkzaamheden;
- logische uitvoeringsvolgorde;
- benodigde materialen;
- artikelen;
- gereedschappen;
- competenties (bijvoorbeeld VOP);
- veiligheidsmaatregelen;
- controlepunten;
- benodigde foto's;
- verwachte arbeidstijd;
- mogelijke meerwerkrisico's.

De gebruiker kan alle voorstellen aanpassen voordat de voorbereiding wordt vastgesteld.

---

# Fase 3 – Inkoop

Op basis van de werkvoorbereiding stelt de AI een volledig inkoopvoorstel op.

Per artikel motiveert de AI waarom dit artikel gekozen is.

Na goedkeuring worden deze artikelen gekoppeld aan de opdracht.

Vanaf dat moment vormen deze artikelen de basis voor de uitvoering.

Tijdens de uitvoering weet de AI daardoor exact:

- welke artikelen zijn gekozen;
- welke producten geplaatst moeten worden;
- welke handleidingen, productspecificaties en montagevoorschriften daarbij horen.

---

# Fase 4 – Adaptieve Uitvoering

Dit is géén traditionele werkbon.

De monteur ontvangt geen PDF en geen volledig stappenplan.

De AI begeleidt de monteur gedurende de volledige uitvoering.

## Uitgangspunt

De AI toont altijd slechts één uitvoeringsstap tegelijk.

Pas nadat een stap volledig is afgerond bepaalt de AI de volgende stap.

Iedere volgende stap wordt bepaald op basis van:

- de oorspronkelijke opdracht;
- de werkvoorbereiding;
- de gekozen materialen;
- de reeds uitgevoerde stappen;
- foto's van de monteur;
- antwoorden van de monteur;
- geconstateerde afwijkingen.

De AI werkt dus dynamisch en niet volgens een vooraf vastgelegde lijst met tientallen stappen.

---

## Per uitvoeringsstap

De AI toont uitsluitend de informatie die op dat moment nodig is.

Bij iedere stap krijgt de monteur:

- doel van de stap;
- uit te voeren werkzaamheden;
- benodigde artikelen;
- benodigde gereedschappen;
- veiligheidsaandachtspunten;
- productspecifieke instructies;
- montagevoorschriften indien relevant.

De AI vraagt vervolgens bijvoorbeeld om:

- één of meerdere foto's;
- een bevestiging;
- een meetwaarde;
- een antwoord op een controlevraag.

Pas na beoordeling van deze informatie wordt de volgende stap vrijgegeven.

Hierdoor ontstaat een interactieve uitvoeringsbegeleiding die zich aanpast aan de werkelijke situatie.

---

## AI gebruikt de foto's actief

Foto's dienen niet alleen als bewijs.

De AI gebruikt de foto's om:

- de huidige situatie te begrijpen;
- afwijkingen te herkennen;
- montagekwaliteit te beoordelen;
- ontbrekende onderdelen te signaleren;
- vervolgacties te bepalen.

Foto's vormen daarmee een essentieel onderdeel van de besluitvorming tijdens de uitvoering.

---

## Afwijkingen

Wanneer de AI constateert dat de werkelijke situatie afwijkt van de voorbereiding moet de AI:

- de afwijking benoemen;
- uitleggen waarom deze relevant is;
- mogelijke oplossingen voorstellen;
- aangeven of de werkvoorbereiding aangepast moet worden;
- indien nodig een meerwerkvoorstel voorbereiden;
- de gebruiker laten beslissen voordat de uitvoering wordt voortgezet.

De AI mag nooit zelfstandig de scope van de opdracht wijzigen.

---

# Fase 5 – Oplevering

Na afronding controleert de AI automatisch:

- of alle stappen zijn uitgevoerd;
- of alle verplichte foto's aanwezig zijn;
- of alle controlepunten zijn afgerond;
- of alle afwijkingen zijn verwerkt;
- of alle toegepaste artikelen geregistreerd zijn.

Daarna genereert de AI automatisch:

- opleverrapport;
- fotorapport;
- certificaat of verklaring (indien van toepassing);
- overdracht naar onderhoud.

---

# Ontwerpprincipes

Gedurende de volledige workflow geldt:

- één opdracht;
- één AI-context;
- één bron van waarheid;
- geen dubbele invoer;
- geen dubbele analyses;
- geen losse AI-modules.

Alle kennis die tijdens het Adviescentrum wordt opgebouwd blijft beschikbaar tijdens:

- werkvoorbereiding;
- inkoop;
- uitvoering;
- oplevering;
- onderhoud.

De AI mag in geen enkele fase informatie opnieuw uitvragen die eerder al is vastgesteld, tenzij er een wijziging of onzekerheid is geconstateerd.

---

# Acceptatiecriteria

- Een opdracht kan vanuit FPS One volledig worden geanalyseerd.
- De opdracht kan zonder informatieverlies worden overgezet naar FPS Connect.
- De AI genereert automatisch een complete werkvoorbereiding.
- De AI genereert automatisch een gemotiveerd inkoopvoorstel.
- De gekozen artikelen vormen de basis voor de uitvoering.
- De monteur ontvangt géén statische werkbon maar een adaptieve AI-uitvoeringsbegeleiding.
- De AI toont nooit meer dan één uitvoeringsstap tegelijk.
- Foto's en antwoorden bepalen de volgende stap.
- Afwijkingen worden automatisch herkend en ter beoordeling voorgelegd.
- De AI genereert automatisch de volledige opleverdocumentatie.
- De volledige workflow blijft onderdeel van de bestaande FPS One/FPS Connect-architectuur zonder dubbele gegevens, dubbele processen of regressies.