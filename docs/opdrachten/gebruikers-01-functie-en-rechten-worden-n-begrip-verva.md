# GEBRUIKERS_01 — functie en rechten worden één begrip

Vervangt de eerdere versie van dit document en alle losse aanvullingen van
18-08-2026 over onboarden, profielen en contractvorm.

## Aanleiding

Iemand aannemen kost nu onnodig veel uitzoekwerk. Bij één nieuwe medewerker
liepen vier dingen tegelijk mis: het gewenste profiel stond niet in de
keuzelijst, de bevoegdheden waren niet te bewerken, de functie bestond alleen
als bevoegdheidsprofiel, en de contractvorm werd niet overgenomen.

René's oordeel: **"die functie is er toch al, heet alleen bevoegdheidsprofiel.
Het is erg omslachtig zo."** Dat is de kern — hetzelfde begrip staat op vier
plekken die niets van elkaar weten.

---

## 1. Eén begrip in plaats van vier

Vandaag bestaat "Monteur" als functie in HRM, als bevoegdheidsprofiel, als
functietitel in een vaste lijst in de code, en daarnaast is er nog een apart
scherm Rollen & Rechten. Voor de gebruiker is het één ding: iemand heeft een
functie, en daar horen rechten bij.

**Doel: de functie is leidend en draagt de rechten.**

- De **functie** is het begrip dat overal gebruikt wordt: bij het aanstellen,
  in HRM, in de planning en bij de rechten.
- **Monteur, Timmerman en Werkvoorbereider zijn leidend** als naamgeving. De
  profielnamen die daarvan afwijken (Backoffice Medewerker, Financieel
  Assistent, Toegang Specialist, Klantcoördinator, Documentbeheerder,
  Onderhoudstechnicus, Gebouwbeheerder, Inspecteur) worden functies met
  diezelfde naam.
- **Aan elke functie hangen vaste rolrechten.** Wie die functie krijgt, krijgt
  die rechten.
- De vaste functietitellijst in de code vervalt; de functies zijn de bron.
- Meet en meld welke profielen en functies er nu bestaan, welke bij elkaar
  horen en welke nergens een tegenhanger hebben. Lever die lijst aan René
  voordat er iets wordt samengevoegd — namen samenvoegen is onomkeerbaar.

## 2. Afwijken per persoon blijft mogelijk

De rechten van de functie zijn het uitgangspunt, maar per medewerker moet ervan
afgeweken kunnen worden. Dat gebeurt nu al in de praktijk.

- Op de medewerker is per module zichtbaar wat de functie geeft en wat er voor
  deze persoon van afwijkt.
- Een afwijking wordt vastgelegd met wie, wanneer en waarom.
- Wijzigt de functie later van rechten, dan volgt de medewerker mee — behalve
  op de punten waar bewust is afgeweken. Die blijven staan en zijn zichtbaar
  als afwijking.
- Het bestaande "1 gebruiker wijkt af van de preset" met de knop Toepassen
  blijft werken, maar mag een bewuste afwijking nooit stil overschrijven.

## 3. Een functie aanmaken waar je hem nodig hebt

- In het venster "Aanstelling toevoegen" kan een nieuwe functie ter plekke
  worden aangemaakt, zonder het scherm te verlaten.
- Bij het aanmaken worden meteen de rechten gekozen — als onderdeel van de
  functie, niet als losse wereld.
- Bij de functiekeuze is zichtbaar welke rechten eraan hangen, zodat duidelijk
  is wat iemand krijgt.
- Een functie is bedrijfsbreed met de werkmaatschappij(en) als kenmerk, niet per
  werkmaatschappij opnieuw aangemaakt.

## 4. Rechten zijn niet te bewerken — repareren

Er zijn twee schermen voor profielen: een kaartweergave met een potloodknop en
een tabel met een tekstlink "Bewerken" en een legenda (Geen · Lezen · Wijzigen ·
Aanmaken · Beheer). **In beide gebeurt er niets bij klikken.**

- In de kaartweergave zit geen blokkade in de code — zoek de werkelijke oorzaak
  (klikafhandeling, stapelvolgorde, dialoog binnen een kaart, fout in de
  console) en gok niet.
- Meet en meld waar die tabelweergave staat: geen van de teksten uit de legenda
  komt in de broncode op main voor. Staat hij niet op main, meld dan hoe hij op
  productie terechtkomt.
- Repareer het bewerken en toets het op alle functies.
- Na het samenvoegen uit punt 1 blijft er **één scherm** over. Meld welke
  schermen vervallen en laat geen doodlopende menu-ingang achter — ook niet
  onder Beheer, waar nu Gebruikers, Profielen, Rollen & Rechten en
  Object-rechten naast elkaar staan.

## 5. Contractvorm en nul contracturen

- **Nul is een geldige waarde** bij een oproep- of nul-urencontract. Het
  onboardingscherm eist nu meer dan nul, waardoor het urenveld — en mogelijk de
  hele overname — afvalt. Repareer dat en meld wat er precies wegviel.
- Twee woordenlijsten voor hetzelfde begrip: het onboardingscherm kent
  vast/tijdelijk/oproep/stage, de contractbewaking kent
  bepaalde_tijd/onbepaalde_tijd/oproep. Meet waar een waarde stukloopt en lever
  de vertaaltabel die je aantreft — of stel er één voor als hij niet bestaat.
- Toets met het echte geval: dienstverband **oproep**, nul contracturen,
  bepaalde tijd van zes maanden. Na het onboarden staan dienstverband, uren en
  einddatum goed op de personeelskaart, en de contractbewaking pikt de einddatum
  en de aanzegdeadline op (zie taak #1107).

## 6. Jonge medewerkers

Er komt een medewerker van 16 jaar in dienst.

- Meet en meld of Connect ergens rekening houdt met de leeftijd van een
  medewerker: werktijden, toegestane werkzaamheden, planning, veiligheid.
- Bouw hier nog niets. Lever alleen wat er is en wat ontbreekt; René beslist
  daarna wat er moet komen.

---

## Vaste eisen

- Toets elke aanname over module, route en bevoegdheid tegen de code en meld
  afwijkingen — pas niets stilzwijgend aan.
- Wijk je af van de scope, meld dat vóór je bouwt.
- Antwoord naar `docs/antwoorden/GEBRUIKERS_01.md`, metingen naar
  `docs/metingen/`.