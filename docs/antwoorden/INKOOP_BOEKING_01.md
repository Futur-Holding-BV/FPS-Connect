# INKOOP_BOEKING_01 — Direct betaalde inkoop met factuur + automatische AccountView-boeking

Datum: 18 augustus 2026

## Wat is gebouwd

### 1. Factuur-PDF als bewijsstuk bij "direct betaald"
- Een **PDF** die als bon wordt geüpload bij een direct betaalde algemene inkoop gaat nu door **exact dezelfde AI-lezing** als een factuur die per mail binnenkomt (zelfde leesmotor, zelfde velden, zelfde signalen).
- De gelezen factuur wordt als **inkoopfactuur** aangemaakt (bron "upload") en direct **aan de inkoopregel gekoppeld** (atomaire claim: nooit twee facturen op één inkoop).
- Een **foto** (jpg/png/webp/heic) blijft gewoon een bon — daar verandert niets aan.
- Kan de PDF niet gelezen worden of is het geen factuur, dan blijft hij als bon bewaard en ziet de gebruiker een duidelijke melding; de inkoop wordt dan handmatig afgehandeld zoals voorheen.

### 2. Vergelijking met de inkoopregel
- **Bedrag**: factuurbedrag incl. btw versus het bij de inkoop ingevulde bedrag, met **dezelfde tolerantie als op rekening**: maximaal €2 of 2% (de ruimste van de twee).
- **Leverancier**: genormaliseerde naamvergelijking (BV/VOF-toevoegingen genegeerd) met de leverancier van de inkoop, of een match op de gekoppelde leverancier uit het register.
- **Kostensoort**: de kostensoort van de inkoop wordt **als voorstel** op de factuur gezet — zelfde gedrag als bij op rekening (nooit een bestaande categorie overschrijven). Zie afwijking A1 hieronder.
- Klopt alles → factuur naar **klaar voor boeking** en de inkoop wordt **afgerond**. Wijkt iets af → het **bestaande signaal** (`algemene_inkoop_bedrag_afwijkend`) gaat af, de factuur blijft op controle staan en de inkoop wordt **niet** afgerond. Niets wordt stil verwerkt.
- Bekende boekingsgegevens van de leverancier (btw-code, grootboek, kostenplaats uit de zelflerende categorisatie) worden alvast ingevuld, zodat de boeking zo compleet mogelijk klaarstaat.

### 3. Automatische AccountView-boeking
- Zodra een factuur op **klaar voor boeking** komt (na goedkeuring via de goedkeuringsmotor, na handmatig accorderen, of via de nieuwe direct-betaald-route) en er **geen goedkeuring open staat**, wordt hij automatisch naar AccountView geboekt.
- Handmatige export en batch-export **blijven volledig werken**; de automatische boeking gebruikt exact dezelfde kern (zelfde controles, zelfde exportlog).
- Mislukt de boeking, dan gaat er een **faalmail met de reden** naar de hoofdbeheerder(s), met een knop naar de factuur; handmatig alsnog exporteren blijft mogelijk. Zie afwijking A2.
- De automatische boeking staat achter de bestaande instelling **`export_actief`** in de AccountView-instellingen (stond tot nu toe ongebruikt in de instellingen). Staat die uit, dan wordt er nooit automatisch geboekt — alleen handmatig. Zie afwijking A3.

## 4. AccountView-instellingen (gemeten, niets omgezet)
In de **ontwikkelomgeving** (de productie-database is voor mij niet direct benaderbaar; controleer prod via Instellingen → AccountView):
- API-endpoint: **leeg** · Administratiecode: **leeg** · API-gebruiker: **leeg** · API-sleutel: **niet gevuld**
- **Testmodus: AAN** (boekingen worden gesimuleerd, niets wordt echt verzonden)
- Dagboeken: INK / VRK (standaard) · Standaard grootboek: leeg
- `export_actief`: **UIT** · `magazijn_export_actief`: **UIT**

Gevolg: automatisch boeken doet in deze stand **niets** totdat een beheerder `export_actief` aanzet; en zolang testmodus aan staat, wordt elke boeking gesimuleerd (geslaagd, boeking-ID "TEST-…"). Ik heb **niets omgezet**.

## 5. Aannames getoetst — afwijkingen t.o.v. de opdrachttekst
- **A1 — "kostensoort vergelijken":** bij op rekening wordt de kostensoort **niet vergeleken** maar als *voorstel* overgenomen (alleen als de factuur nog geen categorie heeft). "Dezelfde vergelijking als bij op rekening" betekent dus: overnemen als voorstel. Zo is het ook hier gebouwd. Een échte kostensoort-vergelijking bestond nergens; als die gewenst is, is dat een aparte opdracht.
- **A1b — leverancier bij op rekening:** bij op rekening wordt de leverancier feitelijk via het A-nummer gematcht en niet apart vergeleken. Voor direct betaald heb ik de gevraagde leverancier-vergelijking wél gebouwd (naam genormaliseerd of register-koppeling); een mismatch telt als afwijking en gaat via hetzelfde bestaande signaal.
- **A2 — "bestaande faalmail":** er bestond **geen** faalmail voor AccountView-boekingen (alleen persistente foutopslag op de factuur + exportlog; de enige bestaande faalmail is de deploy-faalmail vanuit GitHub Actions). Ik heb een faalmail toegevoegd via het **bestaande mailmechanisme** (zelfde opmaak en verzendweg als alle andere systeemmails). Let op: systeemmails lopen standaard via de **mail-wachtrij** met beheerder-goedkeuring — de faalmail verschijnt daar dus eerst.
- **A3 — aan/uit-knop:** automatisch boeken zonder enige rem leek mij onverstandig zolang de koppeling leeg/test is; daarom is de bestaande, tot nu toe ongebruikte instelling `export_actief` de aan/uit-schakelaar voor de automatische boeking. Handmatig exporteren is hier bewust **niet** van afhankelijk.
- **A4 — goedkeuringsbeleid:** vereist het beleid goedkeuring voor het factuurbedrag, dan wordt de factuur bij direct betaald **niet** automatisch geaccordeerd; hij komt op controle te staan met de melding dat hij eerst ter goedkeuring moet. De goedkeuringspoort wordt nergens omzeild.
- **A5 — btw-code:** de AI leest geen btw-code van de factuur. Zonder btw-code weigert de exportcontrole ("niet exportklaar") en gaat de faalmail eruit. Verzachting: de zelflerende leverancier-categorisatie vult de btw-code alvast in zodra die leverancier eerder handmatig geaccordeerd is.
