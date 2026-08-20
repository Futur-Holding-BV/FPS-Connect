# PRIJS_01 — Jaarprijzen, factuurcontrole en de marktspiegel

**Opdracht voor Replit · 9 augustus 2026 · gemeten op `d3bf870` (`main`)**

---

## 1. Waar dit vandaan komt

[stated] René, 9 augustus 2026:

> Wij hebben jaarprijzen van enkele belangrijke leveranciers. Die gaan we inladen na de vakantie.

En het bredere principe dat hij eraan koppelde:

> Connect kan altijd onze vaste prijzen bekijken en op de achtergrond onderzoeken of wellicht andere partijen deze aanvraag ook zouden willen afprijzen. Trek het veel breder en er ontstaat iets moois.

**De kern: Connect weet wat FPS werkelijk betaalt. Dat interne feit is de maatstaf — voor de calculatie, voor de factuurcontrole, en pas daarna voor de markt.**

---

## 2. Gemeten uitgangssituatie

| Wat | Stand |
|---|---|
| `mod_calc_artikelen` | heeft **alleen `inkoopprijs` en `verkoopprijs` als kale getallen** — geen geldigheidsperiode, geen leverancierafspraak, geen staffel |
| Prijsafspraak-, staffel- of jaarprijstabel | **bestaat niet.** De contracttabellen die er zijn gaan over huur, lease en verzekering (`financiele_contracten`) of over klantcontracten |
| `factuur_regels` | draagt **stukprijs, hoeveelheid en eenheid** — de gegevens om tegen een afspraak te toetsen zijn er |
| Prijscontrole tegen een afspraak | **bestaat niet** |
| `goedkeuring-engine.ts` | kent al het type **`prijsafwijking`**: gaat naar `controle_nodig`, en bij directiegoedkeuring naar `klaar_voor_accountview`. **De haak is er dus al — er was alleen nooit een afgesproken prijs om tegen te toetsen** |
| Importmechanisme | bestaat: `/import/controleren`, `/import/uitvoeren`, `/import/logs`, **`/import/logs/:id/terugdraaien`** en `/import/template/:type`, met `bron: "import"` en een `importId` per rij. Artikelen en leveranciers zitten er al in |

**Waarschuwing die hier hard in moet:** laad je de jaarprijzen in het bestaande `inkoopprijs`-veld, dan overschrijf je volgend jaar stilzwijgend wat er stond. Dan weet niemand meer welke prijs wanneer gold, en is de factuurcontrole met terugwerkende kracht waardeloos.

---

## 3. Prijsafspraken vastleggen

Nieuwe tabel `prijsafspraken`, met per regel:

- **leverancier** (verwijzing naar `leveranciers`, niet naar `crm_klanten` — zie `LEVERANCIER_01`)
- **artikel** (verwijzing naar `mod_calc_artikelen`) of, als het artikel nog niet bestaat, de artikelcode en omschrijving van de leverancier
- **prijs**, **eenheid**, en of het exclusief btw is
- **geldig van** en **geldig tot**
- **staffels**: vanaf een aantal geldt een andere prijs
- eventuele **toeslagen** die apart gelden — transport, spoed, kleine order
- **bron**: welke prijslijst, welke datum, welk document

**Regels:**

- Een prijsafspraak wordt **nooit overschreven**. Een nieuwe jaarprijs is een nieuwe regel met een nieuwe periode; de oude blijft staan.
- Voor elke datum is precies één prijs geldig per leverancier, artikel en staffel. **Overlappende perioden worden geweigerd, niet stil opgelost.**
- Het brondocument (de prijslijst) wordt gekoppeld via `document_koppelingen`, met doeltype `prijsafspraak`. Zelfde mechanisme als bij voertuigen en contracten.

---

## 4. Inladen van de jaarprijslijsten — via Slim Upload

[stated] René: *"Als het goed is werkt slim uploaden? Dan knikkeren we een prijslijst erin, en Connect weet waar het moet staan."*

**Gemeten: Slim Upload bestaat.** `lib/documentIntelligence.ts` is de gedeelde classificatie-engine voor de Inbox én Slim Upload, en `POST /documenten/aanleveren` levert een herkend document direct af in de bibliotheek. Er zijn achttien categorieën: aanvraag · tekening · offerte · factuur · productdocument · testrapport · certificaat · eta · dop · personeelsdocument · verzekering · snagstream · jaarrekening · contract · bibliotheek · document_sjabloon · algemeen · onbekend.

**Twee dingen kloppen er niet voor dit doel:**

1. **"Prijslijst" staat niet in die lijst.** Een jaarprijslijst belandt nu als `productdocument`, `algemeen` of `onbekend`.
2. **Slim Upload legt een bestánd op de goede plek. Het leest geen tabel.** Een prijslijst moet geen document worden maar achthonderd regels in `prijsafspraken`. Dat is een ander soort werk.

**Wat gebouwd wordt is de combinatie, en dat is precies wat René bedoelt:**

- **`prijslijst` wordt een negentiende categorie** in `DOC_CATEGORIEEN`.
- Herkent Slim Upload een prijslijst, dan wordt naast het archiveren van het bestand **de leverancier, de geldigheidsperiode en de valuta voorgesteld**, uit de kop van het document zelf.
- Daarna wordt de lijst doorgezet naar de importstroom met een **voorgestelde kolomkoppeling**: welke kolom is artikelcode, welke omschrijving, welke prijs, welke eenheid, welke staffel. **Voorgesteld, niet ingevuld** — jij controleert.
- **Daarmee vervalt het sjabloon.** Geen "download sjabloon, vul in, upload" meer; je gooit de Excel of de pdf erin en corrigeert hooguit een kolom.

**Onder de motorkap blijft het bestaande importmechanisme**: `/import/controleren`, `/import/uitvoeren`, `/import/logs` en **`/import/logs/:id/terugdraaien`**, met `bron: "import"` en een `importId` per rij. Geen tweede importweg.

**Vier eisen die dit betrouwbaar houden:**

- **Toon een proef van twintig regels vóór de rest.** Een verkeerd gekoppelde kolom bij achthonderd regels merk je anders pas als een calculatie er raar uitziet. Bij een pdf is kolomherkenning foutgevoeliger dan bij een Excel; meld welk van beide het was.
- **Terugdraaien blijft verplicht beschikbaar.** Bij prijzen is dat geen luxe: een verkeerd ingeladen lijst vervuilt elke calculatie erna.
- **Artikelen die niet te koppelen zijn worden gemeld, niet aangemaakt.** De leverancierscode is niet jouw artikelcode; dat koppelen is hetzelfde werk als in `CALC_INVOER_01` §3.3. Toon hoeveel regels niet te plaatsen zijn en waarom.
- **Bij de controle wordt getoond wat er verandert ten opzichte van de vorige afspraak**: hoeveel artikelen duurder, hoeveel goedkoper, en de tien grootste verschillen. Een leverancier die stilletjes acht procent verhoogt, zie je dan bij het inladen in plaats van bij de derde factuur.

## 5. De calculatie gebruikt de afspraak

- `mod_calc_artikelen.inkoopprijs` wordt niet meer met de hand onderhouden waar een geldige prijsafspraak bestaat; de prijs komt **uit de afspraak die geldt op de calculatiedatum**.
- Bij de regel is zichtbaar **waar de prijs vandaan komt**: welke leverancier, welke afspraak, welke periode.
- Is er geen geldige afspraak, dan blijft het bestaande veld gelden, **met de vermelding dat het geen afgesproken prijs is**.
- Dit sluit `CALC_INVOER_01` §3.5 — daar staat dat een prijs nooit van een website mag komen. Nu is er een plek waar hij wél vandaan komt.

---

## 6. Factuurcontrole tegen de afspraak

**Dit levert het meeste op en het is geen marktvergelijking.**

Bij het verwerken van een inkoopfactuur wordt per regel gezocht naar een geldige prijsafspraak bij die leverancier, voor dat artikel, op de factuurdatum.

| Uitkomst | Wat er gebeurt |
|---|---|
| Prijs klopt met de afspraak | geen melding, gewone stroom |
| Prijs wijkt af boven een in te stellen marge | **`prijsafwijking`** via de bestaande goedkeuringsmotor, met afspraak, factuurprijs en het verschil in euro's erbij |
| Geen afspraak gevonden | geen melding; dat is normaal, niet alles staat in een jaarprijs |
| Artikel niet herkend | gemeld als "niet te toetsen", zonder de factuur op te houden |

**Harde regels:**

- **Nooit stil corrigeren.** De factuur blijft wat hij is; er ontstaat een melding.
- **Een afwijking is geen fout.** Een spoedtoeslag of een prijs buiten de staffel kan terecht zijn. De melding vraagt om een oordeel, niet om een correctie.
- **Maandelijks een totaal:** hoeveel is er in die maand méér betaald dan afgesproken. Dat getal is de opbrengst van deze hele opdracht, en het moet zichtbaar zijn.

---

## 7. Aflopende afspraken bewaken

Als voeder in de **bestaande** `bewakingsloop.ts` — geen eigen planner:

- een prijsafspraak die binnen een in te stellen termijn afloopt → werkbakitem bij de administratie en de inkoper;
- een leverancier waarvan alle afspraken verlopen zijn terwijl er nog wel facturen binnenkomen → melding;
- **het aflopen van een jaarprijs is het natuurlijke moment voor de marktspiegel** uit §8. Het signaal verwijst daarnaar.

---

## 8. De marktspiegel

Dit is het bredere idee van René, en het komt **na** §3 tot en met §7 — zonder eigen prijzen valt er niets te spiegelen.

### 8.1 Wat het is

Een achtergronddienst die, voor een artikel of een categorie waar FPS een afspraak over heeft, naar buiten kijkt: **vragen andere partijen hiervoor meer of minder?** Via de zoekdienst uit `UITVRAAG_01` — één vaste zoek-API, en de server haalt géén leverancierspagina's binnen.

Van toepassing op meer dan inkoopartikelen: **huur, lease, verzekeringen, softwareabonnementen** (`financiele_contracten` uit `CONTRACT_01`), **wagenparkkosten**, en **onderaannemerstarieven**.

### 8.2 Wanneer het draait

**Niet doorlopend.** Doorlopend vergelijken is ruis. Wel:

- rond het aflopen van een afspraak of contract (§7);
- bij een prijsverhoging bij het inladen van een nieuwe prijslijst (§4);
- op verzoek, met een knop.

### 8.3 De twee regels die dit kunnen maken of breken

**Het doel is weten, niet wisselen.** [stated] Een goede vaste leverancier die op vrijdagmiddag nog levert, is meer waard dan drie procent korting. De uitkomst luidt: *dit betaal je, dit vraagt de markt* — en meestal is de juiste vervolgstap een gesprek met de bestaande leverancier. **Het systeem adviseert nooit om over te stappen.**

**Een marktprijs zonder bron is een gerucht.** Elke vergelijking draagt de vindplaats en de datum. Wat niet te vinden was, blijft leeg — nooit geschat, nooit geïnterpoleerd.

### 8.4 En de andere kant op

Dezelfde vergelijking geldt voor de **verkoopkant**: reken je genoeg? Dat is even interessant als besparen, en het is met dezelfde gegevens te maken.

**Beoordeel of dat in deze opdracht past of een eigen wordt, en meld dat** — bouw het niet ongevraagd mee.

---

## 9. Verboden

- Geen jaarprijs in het bestaande `inkoopprijs`-veld schrijven; een afspraak is een eigen regel met een periode.
- Geen prijsafspraak overschrijven; een nieuwe periode is een nieuwe regel.
- Geen overlappende geldigheidsperioden stil oplossen.
- Geen artikel automatisch aanmaken bij het inladen van een prijslijst.
- Geen factuurregel stil corrigeren naar de afgesproken prijs.
- Geen marktvergelijking zonder vindplaats en datum.
- Geen advies om van leverancier te wisselen.
- Geen tweede importweg; het bestaande mechanisme met terugdraaien is de enige.
- Geen prijslijst inladen zonder proef van twintig regels vooraf.
- Geen sjabloon verplicht stellen; de kolomkoppeling wordt voorgesteld.
- Geen eigen planner voor de bewaking.

---

## 10. Twee vaste eisen

**Toets elke aanname en meld afwijkingen.** Controleer per onderdeel welke module en welk niveau de bijbehorende backendroute werkelijk eist, en meld elk verschil met wat hier staat — **pas niets stilzwijgend aan**.

**Wijk je af van de scope van deze opdracht, meld dat dan vóór je bouwt.**

---

## 11. Acceptatie

Met vermelding van commit-SHA, GitHub `main`-SHA en productie-SHA:

1. **Een prijslijst wordt door Slim Upload herkend** als `prijslijst`, met leverancier en geldigheidsperiode voorgesteld uit het document zelf. Toon de herkenning.
1b. **De kolomkoppeling wordt voorgesteld en is te corrigeren**, zonder sjabloon. Toon de proef van twintig regels vóór het inladen van de rest, en het aantal niet-plaatsbare regels.
2. **De vergelijking met de vorige afspraak wordt getoond**: hoeveel duurder, hoeveel goedkoper, en de tien grootste verschillen.
3. **Overlappende perioden worden geweigerd.** Toon de weigering.
4. **Een calculatieregel gebruikt de afgesproken prijs** en toont de herkomst. Toon ook een artikel zonder afspraak, met de vermelding dat het geen afgesproken prijs is.
5. **Een factuurregel boven de afgesproken prijs levert een `prijsafwijking`** op via de bestaande goedkeuringsmotor, met afspraak, factuurprijs en verschil. Toon het.
6. **Een factuurregel binnen de marge levert geen melding op.** Toon dat de gewone stroom doorloopt.
7. **De factuur wordt niet gecorrigeerd.** Bewijs dat het bedrag ongewijzigd is na de melding.
8. **Maandtotaal zichtbaar:** hoeveel er die maand meer is betaald dan afgesproken.
9. **Een aflopende afspraak levert een werkbakitem** op via de bestaande bewakingsloop. Toon de regel uit `bewaking_draaien`.
10. **Een marktvergelijking draagt per regel de vindplaats en de datum**, en bevat geen enkel advies om te wisselen. Toon de uitkomst.
11. Meld of de verkoopkant uit §8.4 in deze opdracht past of een eigen opdracht wordt.
