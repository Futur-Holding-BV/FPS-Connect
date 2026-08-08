# CONTRACT_01 — Bedrijfscontracten en -papieren afmaken

**Opdracht voor Replit · 8 augustus 2026 · gemeten op `5479d8b` (`main`)**

Huurcontract kantoor, leasecontract printer, verzekeringen, softwareabonnementen, overeenkomsten. **Dit wordt niet gebouwd — het bestaat al en wordt afgemaakt.**

---

## 1. Wat er al staat

`lib/db/src/schema/financiele-contracten.ts` en `routes/financiele-contracten.ts`, met scherm op `/financieel/contracten` (`pages/financieel/contracten/index.tsx` en `detail.tsx`). Rechten: lezen `financieel` niveau 1, schrijven niveau 2.

Per contract bestaat al: naam · leverancier · categorie · contractnummer · werkgever (welke BV) · ingangsdatum · **einddatum** · **opzegtermijn in maanden** · **automatische verlenging** met verlengingsduur · kosten met periode · contractwaarde · **indexeringspercentage en -maand** · **aantal licenties en aantal in gebruik** · status · notities · AI-samenvatting.

Daarnaast bestaan al: `POST /:id/ai-analyse` (analyseert de tekst van het gekoppelde document), `GET /:id/coach`, `GET /financiele-contracten-besparingskansen`, en een signaleringstabel met ernst, AI-advies, zekerheid en een ontdubbelsleutel.

**Stap nul van deze opdracht: meld hoeveel rijen `financiele_contracten` er in productie staan, en per categorie hoeveel.** Als dat nul of bijna nul is, is de module gebouwd maar nooit in gebruik genomen — dat verandert waar het werk zit en moet expliciet gemeld worden.

---

## 2. Vier dingen die eraan mankeren

### 2.1 `categorie` is een vrij tekstveld

Nu `text` met standaardwaarde `"overig"`. Wie "abonnement" tikt en wie "software" tikt, maken twee groepen. De vraag "waar lopen mijn abonnementen" is dan niet te beantwoorden.

Wordt een vaste lijst, in de database afgedwongen, met een genummerde migratie die bestaande waarden omzet (en meldt wat niet automatisch te plaatsen was):

```
huur · lease · verzekering · softwareabonnement · telecom ·
energie · onderhoudscontract · dienstverlening · financiering · overig
```

Bestaat er een categorie die René of Jacqueline mist, dan is dat een aanvulling op deze lijst — geen vrij veld terug.

### 2.2 Eén document per contract

`document_id` is enkelvoud. Bij een verzekering horen polis, voorwaarden en aanhangsels; bij een huurcontract het contract plus allonges.

Los dit op **met exact hetzelfde mechanisme als in `WAGENPARK_01` §2**: voeg `financieel_contract` toe aan de toegestane doeltypes van `document_koppelingen`. Eén patroon voor het hele systeem, geen tweede manier om documenten aan iets te hangen.

Het bestaande `document_id` blijft bestaan als "het hoofddocument" — dat is wat de AI-analyse leest. De rest zijn bijlagen.

Documentsoorten en waarschuwingstermijnen worden **door Jacqueline zelf ingesteld**, met hetzelfde beheerscherm als bij de voertuigen. Niet twee lijstjes bouwen.

### 2.3 De bewaking gaat niet vanzelf af

`POST /financiele-contract-signaleringen/bewaak` draait alleen als iemand hem aanroept. Er is geen geplande taak. Een opzegtermijn die je zelf moet gaan opvragen is geen bewaking.

- Aanhaken op dezelfde dagelijkse loop als de overige bewaking (zie `WERKBAK_01`). **Geen eigen planner voor deze module.**
- Bezorgen op de werkbak. Is die er nog niet, dan een e-mail aan de beheerder als tussenoplossing, en de bron opleveren in de vorm die de werkbak verwacht. **Geen nieuwe meldingentabel** — de signaleringstabel bestaat al.
- Ontvanger is **Jacqueline in haar rol van administratie**, bepaald op recht (`financieel` niveau 2 of hoger), niet op een naam of e-mailadres in de code.
- Wat gesignaleerd wordt: naderende einddatum, **de opzegdatum berekend uit einddatum minus opzegtermijn** (dat is de datum die er werkelijk toe doet), automatische verlenging die op het punt staat in te gaan, indexeringsmaand, en een verlopende documentvervaldatum uit §2.2.
- Draait de loop een etmaal niet, dan is dát een melding.

### 2.4 Een contract invoeren is te veel werk

Jacqueline doet de administratie en moet dit gaan vullen. Bij twintig lopende contracten met elk vijftien velden is de kans groot dat het blijft liggen.

Draai het om, volgens hetzelfde patroon dat al voor facturen is gekozen: **zij uploadt het contract, de AI stelt de velden voor, zij bevestigt of corrigeert.**

- `analyseerPolisDocument` bestaat al en leest de documenttekst. Breid de uitkomst uit naar de invulvelden: leverancier, ingangsdatum, einddatum, opzegtermijn, automatische verlenging, bedrag en periode, indexering.
- De voorgestelde waarden staan **naast** het veld met de zin uit het contract waar ze vandaan komen, zodat zij kan zien waarop het gebaseerd is.
- **Niets wordt automatisch opgeslagen.** Zij bevestigt. Wat de AI niet vindt, blijft leeg — er wordt niets aannemelijks ingevuld.
- Vastleggen wat de AI voorstelde én wat zij ervan maakte, net als bij de factuurstroom.

---

## 3. Het overzicht

Een overzichtsscherm dat de vraag "waar loopt het allemaal" in één blik beantwoordt:

- per categorie: aantal contracten en **totale kosten per jaar**, met een totaal onderaan
- een tijdlijn van de eerstvolgende twaalf maanden met de opzegdata en einddata die daarin vallen
- bij softwareabonnementen: **aantal licenties tegenover aantal in gebruik**, met de kosten van het verschil. Dat is de vraag "betalen we voor stoelen die leegstaan"
- filter op werkgever (BV), want de kosten horen bij de juiste vennootschap
- contracten zonder einddatum apart zichtbaar — die kunnen niet bewaakt worden en dat moet opvallen in plaats van verdwijnen

---

## 4. Verboden

- Geen tweede contracttabel, geen tweede documentenmechanisme, geen eigen planner, geen nieuwe meldingentabel.
- `categorie` niet als vrij veld laten staan "voor de flexibiliteit".
- Geen automatische opslag van door de AI voorgestelde contractwaarden.
- Niet stilzwijgend de arbeidsovereenkomsten uit `contracten.ts` of de onderhoudscontracten van klanten hierin trekken — dat zijn andere dingen. Constateer je overlap, meld het dan.

---

## 5. Acceptatie

Met vermelding van commit-SHA, GitHub `main`-SHA en productie-SHA:

1. **Nulmeting gemeld:** aantal contracten in productie, per categorie.
2. Een contract-pdf uploaden levert ingevulde voorstellen op met de bronzin erbij. Toon het scherm vóór bevestigen. Toon ook een veld dat de AI niet kon vinden en dus leeg bleef.
3. Meerdere documenten aan één contract gekoppeld, zichtbaar op de detailpagina.
4. Een contract met einddatum over 100 dagen en opzegtermijn 3 maanden levert een signaal op **op de opzegdatum**, niet op de einddatum. Toon de berekening en het signaal.
5. Het signaal komt aan bij de administratie zonder dat iemand een knop indrukt. Toon de logregel van de dagelijkse loop.
6. Het overzichtsscherm toont totalen per categorie per jaar, en bij een softwareabonnement het verschil tussen licenties en gebruik.
7. Een contract zonder einddatum staat apart en is niet weggefilterd.
