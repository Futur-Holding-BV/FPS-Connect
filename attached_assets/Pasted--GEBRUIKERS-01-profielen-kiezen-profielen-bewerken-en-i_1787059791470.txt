# GEBRUIKERS_01 — profielen kiezen, profielen bewerken en iemand onboarden

Vervangt de losse opdrachten van 18-08-2026 over het onboardingscherm, de
profielenschermen en de contractvorm. Alleen dit document geldt.

## Aanleiding

Een nieuwe medewerker aannemen lukt op dit moment niet volledig. Bij één
persoon liepen vier dingen tegelijk mis: het gewenste profiel stond niet in de
keuzelijst, de bevoegdheden van dat profiel waren niet te bewerken, en de
contractvorm werd niet overgenomen. Het gaat om een oproepcontract (0-uren) van
zes maanden.

---

## 1. Het onboardingscherm toont niet alle profielen

Het scherm "Kies een functie" toont tien profielen. In `lib/permissies` staan er
achttien, en daarnaast bestaan er zelfgemaakte profielen in de database
(bijvoorbeeld Backoffice Medewerker, Financieel Assistent, Klantcoördinator,
Documentbeheerder, Onderhoudstechnicus, Toegang Specialist, Inspecteur,
Gebouwbeheerder). Die zijn dus nergens toe te kennen.

- Meet en meld waar de lijst van tien vandaan komt en waarom hij afwijkt.
- Het scherm toont voortaan **alle** profielen uit één bron: de vaste presets én
  de zelfgemaakte. Een nieuw profiel verschijnt vanzelf, zonder dat iemand een
  tweede lijst bijwerkt.
- Ontbreken nu in elk geval: Onderhoudsmonteur, Externe inhuur, Planner,
  Calculatie, Directie, Administratie, Wagenparkbeheerder, Magazijnbeheerder,
  plus alle zelfgemaakte profielen.

## 2. Profielen zijn niet te bewerken

Er zijn twee schermen voor hetzelfde: een kaartweergave met een potloodknop, en
een tabel/matrix met een tekstlink "Bewerken" en een legenda (Geen · Lezen ·
Wijzigen · Aanmaken · Beheer). **In beide gebeurt er niets bij klikken.**

- Meet en meld waar dat matrixscherm staat. Het is niet in main terug te vinden:
  geen van de teksten uit de legenda komt in de broncode voor. Staat het niet op
  main, meld dan hoe het op productie terechtkomt.
- In de kaartweergave zit geen blokkade in de code (`openBewerk` wordt gewoon
  aangeroepen). Zoek de werkelijke oorzaak — klikafhandeling, stapelvolgorde,
  dialoog binnen een kaart, fout in de console — en gok niet.
- Repareer het bewerken, en toets het op zowel systeemprofielen als
  zelfgemaakte.
- Meld welk van de twee schermen kan vervallen. Twee plekken voor hetzelfde
  levert altijd één half werkend scherm op.

## 3. Contractvorm en nul contracturen

- **Nul is een geldige waarde** bij een oproep- of nul-urencontract. Het
  onboardingscherm eist nu meer dan nul, waardoor het urenveld — en mogelijk de
  hele overname — afvalt. Repareer dat en meld wat er precies wegviel.
- Twee woordenlijsten voor hetzelfde begrip: het onboardingscherm kent
  vast/tijdelijk/oproep/stage, de contractbewaking kent
  bepaalde_tijd/onbepaalde_tijd/oproep. Meet waar een waarde stukloopt tussen
  die twee en lever de vertaaltabel die je aantreft — of stel er één voor als
  hij niet bestaat.
- Toets met het echte geval: dienstverband **oproep**, nul contracturen,
  bepaalde tijd van zes maanden. Na het onboarden staan dienstverband, uren en
  einddatum goed op de personeelskaart, en de contractbewaking pikt de einddatum
  en de aanzegdeadline op (zie taak #1107).

## 4. Jonge medewerkers

Er komt een medewerker van 16 jaar in dienst.

- Meet en meld of Connect ergens rekening houdt met de leeftijd van een
  medewerker: werktijden, toegestane werkzaamheden, planning, veiligheid.
- Bouw hier nog niets. Lever alleen wat er is en wat ontbreekt; ik beslis daarna
  wat er moet komen.

---

## Vaste eisen

- Toets elke aanname over module, route en bevoegdheid tegen de code en meld
  afwijkingen — pas niets stilzwijgend aan.
- Wijk je af van de scope, meld dat vóór je bouwt.
- Antwoord naar `docs/antwoorden/GEBRUIKERS_01.md`, metingen naar
  `docs/metingen/`.