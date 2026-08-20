# Architectuuropdracht – AI Visual Guidance Framework

## Doel

Ontwerp een centraal AI Visual Guidance Framework dat de monteur tijdens complexe uitvoeringswerkzaamheden visueel ondersteunt.

Dit is nadrukkelijk géén losstaande module, maar een generieke voorziening die later gebruikt kan worden door:

- Adviescentrum
- Werkvoorbereiding
- Uitvoering
- Oplevering
- Onderhoud
- Inspecties

Er hoeft in deze fase nog niets volledig gebouwd te worden.

Doel is het ontwerpen van een veilige, schaalbare architectuur die later stapsgewijs kan worden ingevuld.

---

# Uitgangspunten

De AI mag nooit zelf technische waarheden verzinnen.

Alle technische informatie moet afkomstig zijn uit gecontroleerde bronnen zoals:

- projecttekeningen
- detailtekeningen
- BIM/IFC (later)
- productbladen
- ETA
- DoP
- montagevoorschriften
- FPS Knowledge Base
- goedgekeurde standaarddetails

AI mag uitsluitend:

- informatie selecteren;
- vereenvoudigen;
- markeren;
- combineren;
- stapvolgorde bepalen;
- uitleg begrijpelijk maken.

---

# Visual Guidance Engine

Ontwerp een engine die per uitvoeringsstap automatisch de meest geschikte ondersteuning kiest.

Bijvoorbeeld:

- detailtekening
- uitsnede van een tekening
- projectfoto
- referentiefoto
- gemarkeerde foto
- exploded view
- 3D-weergave
- korte animatie
- checklist
- AI-uitleg

De monteur krijgt nooit een overload aan informatie.

AI bepaalt welke visual op dat moment het meest helpt.

---

# Animaties

Onderzoek hoe animaties later opgebouwd kunnen worden.

Niet als volledig AI-gegenereerde video.

Maar opgebouwd uit:

- gecontroleerde tekeningen
- gecontroleerde 3D-componenten
- bestaande montagevolgorden
- productinformatie
- FPS-standaarddetails

Hierdoor blijft iedere animatie technisch betrouwbaar.

---

# AI Fotoanalyse

Onderzoek hoe AI foto's van de monteur kan combineren met de gekozen visual.

Bijvoorbeeld:

- overlay op de foto
- markering van aandachtspunten
- verschil tussen gewenste en actuele situatie
- pijlen
- kleurcodering
- automatische kwaliteitscontrole

De originele foto blijft altijd behouden.

AI-annotaties vormen een aparte laag.

---

# Herbruikbare Visual Library

Ontwerp een centrale bibliotheek waarin visuals worden opgeslagen.

Bijvoorbeeld:

- standaarddetails
- referentiefoto's
- animaties
- exploded views
- montagevolgorden
- veelgemaakte fouten
- praktijkvoorbeelden

Deze bibliotheek moet later automatisch gebruikt kunnen worden door alle AI-modules.

---

# Leermechanisme

Na afronding van projecten moet AI kunnen leren welke visuals het beste resultaat opleveren.

Bijvoorbeeld:

- minder fouten
- minder vragen
- kortere montagetijd
- hogere kwaliteit
- minder herstelwerk

Gebruik deze informatie uitsluitend om toekomstige visualisaties beter te kiezen.

Niet om technische eisen automatisch te wijzigen.

---

# Architectuur

Ontwerp dit framework modulair.

Het moet later uitgebreid kunnen worden met:

- IFC
- Revit
- AutoCAD
- 3D-modellen
- AR (Augmented Reality)
- Vision AI
- nieuwe AI-modellen

zonder bestaande modules te hoeven wijzigen.

---

# Belangrijk

In deze fase geen uitgebreide ontwikkeling starten.

Alleen:

- architectuur;
- datamodel;
- componenten;
- interfaces;
- afhankelijkheden;
- uitbreidbaarheid;
- risicoanalyse.

Er mogen geen bestaande werkende onderdelen van FPS Connect worden aangepast.

Het framework moet volledig additief zijn en pas worden geïmplementeerd nadat de productieomgeving stabiel is.