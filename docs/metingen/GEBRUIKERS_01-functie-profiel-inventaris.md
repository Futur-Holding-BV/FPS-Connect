# GEBRUIKERS_01 — functie/profiel-inventaris vóór samenvoegen

Datum: 19-08-2026  
Gemeten commit: `1ea45b820660`  
Omgevingen: development én productie (de uitkomsten zijn gelijk)

## Vraag

Welke functies en bevoegdheidsprofielen bestaan nu, wat hoort aantoonbaar bij
elkaar en welke profielen hebben geen functie-tegenhanger?

Deze inventaris is de verplichte beslispoort vóór het onomkeerbaar samenvoegen
van dubbele functierijen of namen. Er is nog niets samengevoegd.

## GEMETEN

### Bestaande functies met expliciete profielkoppeling

| Functie | Werkmaatschappij | Gekoppeld profiel | Uitvoerend | Actief |
|---|---|---|---|---|
| Algemene Administratie | FPS Bouw | Administratie | nee | ja |
| Algemene Administratie | FPS Brandpreventie | Administratie | nee | ja |
| Project administratie | FPS Bouw | Project-admin | nee | ja |
| Project Administratie | FPS Brandpreventie | Project-admin | nee | ja |

De koppeling is niet afgeleid uit de naam: alle vier rijen dragen al expliciet
het `profiel_id`. Daarmee horen deze paren aantoonbaar bij elkaar:

- Algemene Administratie → Administratie
- Project Administratie → Project-admin

De twee administratiefuncties bestaan nu dubbel, één keer per
werkmaatschappij. Alleen het hoofdlettergebruik van “Administratie” verschilt.

### Profielen zonder functie-tegenhanger

De volgende zestien systeemprofielen zijn aan geen enkele functie gekoppeld:

| Groep | Profiel zonder functie |
|---|---|
| Commercieel | Calculatie |
| Commercieel | Commercieel |
| Financieel & Directie | Directie |
| Financieel & Directie | Externe boekhouder |
| HRM & Personeel | HRM-adviseur |
| Operationeel | Magazijnbeheerder |
| Operationeel | Wagenparkbeheerder |
| Projecten | Planner |
| Projecten | Projectleider |
| Projecten | Werkvoorbereider |
| Uitvoering | Controleur |
| Uitvoering | Externe inhuur |
| Uitvoering | Monteur |
| Uitvoering | Onderhoudsmonteur |
| Uitvoering | Timmerman |
| Uitvoering | Uitvoerder |

Er zijn geen zelfgemaakte profielen in development of productie. De acht namen
uit de v2-tekst — Backoffice Medewerker, Financieel Assistent, Toegang
Specialist, Klantcoördinator, Documentbeheerder, Onderhoudstechnicus,
Gebouwbeheerder en Inspecteur — bestaan in de gemeten database en de actuele
`PRESETS`-code niet als profiel of functie. Ze worden daarom niet stil
aangemaakt of aan een ander begrip gekoppeld.

### Technische oorzaak van de vier losse werelden

- Het functiehuis heeft al een expliciete `profiel_id`, maar de UI presenteert
  het profiel nog als los toegangsprofiel.
- Een functie heeft nu één `werkgever_id`/werkmaatschappij. Daardoor wordt
  dezelfde functie per werkmaatschappij gedupliceerd, terwijl de v2-eis één
  bedrijfsbrede functie met één of meer werkmaatschappijen voorschrijft.
- Het uitvoerende-portaalgedrag wordt nog bepaald met vier hardcoded
  functietitels. De gemeten functievelden `functies.uitvoerend` zijn nog niet de
  bron voor login en portaalweergave.

## Eerste voorstel — vervallen na besluit René

1. Behoud **Algemene Administratie** en **Project Administratie** als leidende
   functienamen. De profielnamen Administratie en Project-admin worden alleen
   nog technische rechtenmodellen achter die functies.
2. Voeg de twee werkmaatschappij-dubbelen per functie samen tot één
   bedrijfsbrede functie en koppel die ene functie aan FPS Bouw én FPS
   Brandpreventie. Bestaande medewerkers/aanstellingen worden naar de behouden
   functie omgehangen.
3. Maak voor elk van de zestien profielen zonder tegenhanger één functie met
   exact dezelfde naam en hetzelfde profiel als vaste rechtenbasis.
4. ~~Koppel nieuwe functies aan gekozen werkmaatschappijen.~~
5. Maak de acht niet-aangetroffen namen niet aan. Als deze namen bedrijfsmatig
   wel gewenst zijn, worden ze later als normale functie met rechten aangemaakt.

## AANGENOMEN

Punt 4 was een beleidsaanname. René heeft die op 19-08-2026 verworpen.

## Besluit René 19-08-2026

Alle functies gelden voor alle vier de werkmaatschappijen:

- FPS Bouw
- FPS Bouw en Renovatie
- FPS Brandpreventie
- FPS Onderhoud

Een functie wordt niet aan een BV gebonden. De werkmaatschappij staat op de
medewerker/aanstelling en bepaalt waar iemand werkt; zij bepaalt niet welke
functies bestaan.

René heeft nog **geen akkoord op de samenvoeging** gegeven. Eerst moet het
volgende definitieve overzicht worden goedgekeurd.

## Volledige lijst van 18 profielen en hun bestemming

“Verdwijnt” betekent hieronder: verdwijnt als zelfstandig zichtbaar
beheersbegrip. De profielrij wordt bij de eerste samenvoeging niet fysiek
verwijderd, maar blijft als terugdraaibare technische rechtenmatrix achter de
functie bestaan.

| # | Huidig profiel | Leidende functie na samenvoegen | Blijft zichtbaar | Verdwijnt als los begrip |
|---:|---|---|---|---|
| 1 | Calculatie | Calculatie (nieuw) | Functie Calculatie | Profiel Calculatie |
| 2 | Commercieel | Commercieel (nieuw) | Functie Commercieel | Profiel Commercieel |
| 3 | Administratie | Algemene Administratie (bestaand) | Functie Algemene Administratie | Profiel Administratie |
| 4 | Directie | Directie (nieuw) | Functie Directie | Profiel Directie |
| 5 | Externe boekhouder | Externe boekhouder (nieuw) | Functie Externe boekhouder | Profiel Externe boekhouder |
| 6 | HRM-adviseur | HRM-adviseur (nieuw) | Functie HRM-adviseur | Profiel HRM-adviseur |
| 7 | Magazijnbeheerder | Magazijnbeheerder (nieuw) | Functie Magazijnbeheerder | Profiel Magazijnbeheerder |
| 8 | Wagenparkbeheerder | Wagenparkbeheerder (nieuw) | Functie Wagenparkbeheerder | Profiel Wagenparkbeheerder |
| 9 | Planner | Planner (nieuw) | Functie Planner | Profiel Planner |
| 10 | Project-admin | Project Administratie (bestaand) | Functie Project Administratie | Profiel Project-admin |
| 11 | Projectleider | Projectleider (nieuw) | Functie Projectleider | Profiel Projectleider |
| 12 | Werkvoorbereider | Werkvoorbereider (nieuw) | Functie Werkvoorbereider | Profiel Werkvoorbereider |
| 13 | Controleur | Controleur (nieuw) | Functie Controleur | Profiel Controleur |
| 14 | Externe inhuur | Externe inhuur (nieuw) | Functie Externe inhuur | Profiel Externe inhuur |
| 15 | Monteur | Monteur (nieuw) | Functie Monteur | Profiel Monteur |
| 16 | Onderhoudsmonteur | Onderhoudsmonteur (nieuw) | Functie Onderhoudsmonteur | Profiel Onderhoudsmonteur |
| 17 | Timmerman | Timmerman (nieuw) | Functie Timmerman | Profiel Timmerman |
| 18 | Uitvoerder | Uitvoerder (nieuw) | Functie Uitvoerder | Profiel Uitvoerder |

Er worden dus geen twee rechtenmatrices met elkaar vermengd. Elk profiel wordt
de vaste rechtenmatrix van precies één leidende functie.

## Dubbele functierijen: behouden, verdwijnen en bezetting

Development en productie geven dezelfde telling.

| Dubbel paar | Blijft | Verdwijnt uit actief gebruik | Medewerkers op verdwijnende rij | Bestemming |
|---|---|---|---:|---|
| Algemene Administratie | ID 11 — Algemene Administratie (nu FPS Brandpreventie) | ID 9 — Algemene Administratie (nu FPS Bouw) | 0 | ID 11 |
| Project Administratie | ID 10 — Project Administratie (nu FPS Brandpreventie) | ID 8 — Project administratie (nu FPS Bouw) | 0 | ID 10 |

De behouden rij Algemene Administratie (ID 11) heeft nu één medewerker. Die
medewerker blijft op dezelfde functie-ID staan. De behouden rij Project
Administratie (ID 10) heeft nu nul medewerkers. Geen huidige medewerker of
aanstelling hoeft door deze keuze te worden omgehangen.

Bij uitvoering verliezen de behouden functies hun BV-kenmerk. De twee
verdwijnende rijen worden niet verwijderd maar inactief gemaakt. Daardoor zijn
zij niet meer kiesbaar, terwijl hun oorspronkelijke waarden beschikbaar blijven
voor herstel.

## Zestien nieuwe functies met vaste rechten

Bron: actuele developmentprofielen op 19-08-2026. Alleen modules met een recht
boven “Geen toegang” zijn vermeld. Niveaus blijven ongewijzigd:
Lezen, Wijzigen, Aanmaken en Beheer.

### Commercieel

1. **Calculatie**  
   Bibliotheek: Wijzigen; Calculaties: Beheer; CRM: Lezen; Dossiers: Wijzigen;
   Gebouwen: Lezen; Merk: Lezen; Offertes: Beheer; Projecten: Aanmaken;
   Rapportages: Lezen; Voorzieningen: Lezen.

2. **Commercieel**  
   Abonnementen: Beheer; Bibliotheek: Lezen; CRM: Beheer; Gebouwen: Lezen;
   Marketing: Aanmaken; Merk: Aanmaken; Rapportages: Lezen; Social: Aanmaken;
   Voorzieningen: Lezen.

### Financieel en directie

3. **Directie**  
   Abonnementen: Beheer; Bibliotheek: Wijzigen; Calculaties: Lezen; CRM:
   Beheer; Declaraties: Beheer; Dossiers: Wijzigen; Financieel: Beheer;
   Financieel vertrouwelijk: Beheer; Gebouwen: Wijzigen; Goedkeuring: Beheer;
   HRM-vrijgave: Aanmaken; Inspecties: Wijzigen; Marketing: Beheer; Merk:
   Aanmaken; Offertes: Wijzigen; Onderhoud: Wijzigen; Personeel: Wijzigen;
   Planning: Wijzigen; Projecten: Aanmaken; Rapportages: Beheer;
   Salarisarchief: Lezen; Social: Beheer; Voorzieningen: Wijzigen.

4. **Externe boekhouder**  
   Boekhouderportaal: Beheer; Financieel: Lezen; Financieel vertrouwelijk:
   Lezen; Salarismutaties: Lezen; Salarisarchief: Aanmaken.

### HRM en personeel

5. **HRM-adviseur**  
   Dossiers: Lezen; Gebruikers: Lezen; HRM-vrijgave: Aanmaken; Personeel:
   Beheer; Rapportages: Lezen; Salarisarchief: Aanmaken.

### Operationeel

6. **Magazijnbeheerder**  
   Magazijn: Beheer; Offertes: Lezen; Projecten: Wijzigen.

7. **Wagenparkbeheerder**  
   Gereedschappen: Lezen; Planning: Lezen; Wagenpark: Beheer.

### Projecten

8. **Planner**  
   Gebouwen: Wijzigen; Onderhoud: Lezen; Personeel: Lezen; Planning: Beheer;
   Toolbox: Wijzigen; Voorzieningen: Lezen.

9. **Projectleider**  
   Bibliotheek: Aanmaken; Calculaties: Aanmaken; CRM: Aanmaken; Gebouwen:
   Beheer; Gereedschappen: Wijzigen; Inspecties: Beheer; Magazijn: Wijzigen;
   Merk: Lezen; Onderhoud: Beheer; Projecten: Aanmaken; Rapportages: Beheer;
   Voorzieningen: Beheer.

10. **Werkvoorbereider**  
    Bibliotheek: Aanmaken; Calculaties: Aanmaken; CRM: Lezen; Gebouwen:
    Aanmaken; Gereedschappen: Wijzigen; Inspecties: Wijzigen; Magazijn:
    Wijzigen; Onderhoud: Aanmaken; Planning: Wijzigen; Projecten: Aanmaken;
    Rapportages: Wijzigen; Voorzieningen: Beheer.

### Uitvoering

11. **Controleur**  
    Bibliotheek: Lezen; Gebouwen: Lezen; Inspecties: Aanmaken; Onderhoud:
    Aanmaken; Projecten: Lezen; Rapportages: Lezen; Voorzieningen: Lezen.

12. **Externe inhuur**  
    Bibliotheek: Lezen; Gebouwen: Lezen; Inspecties: Lezen; Onderhoud:
    Wijzigen; Projecten: Lezen; Rapportages: Lezen; Toolbox: Lezen;
    Voorzieningen: Wijzigen.

13. **Monteur**  
    Bibliotheek: Lezen; Gebouwen: Lezen; Gereedschappen: Lezen; Inspecties:
    Aanmaken; Magazijn: Lezen; Onderhoud: Aanmaken; Projecten: Lezen;
    Rapportages: Lezen; Voorzieningen: Aanmaken.

14. **Onderhoudsmonteur**  
    Bibliotheek: Lezen; Declaraties: Wijzigen; Gebouwen: Lezen; Inspecties:
    Wijzigen; Onderhoud: Beheer; Planning: Lezen; Projecten: Lezen;
    Rapportages: Lezen; Toolbox: Lezen; Voorzieningen: Wijzigen.

15. **Timmerman**  
    Bibliotheek: Lezen; Gebouwen: Lezen; Inspecties: Wijzigen; Onderhoud:
    Aanmaken; Projecten: Lezen; Rapportages: Lezen; Voorzieningen: Aanmaken.

16. **Uitvoerder**  
    Bibliotheek: Lezen; Gebouwen: Wijzigen; Gereedschappen: Lezen; Inspecties:
    Aanmaken; Magazijn: Lezen; Onderhoud: Aanmaken; Projecten: Wijzigen;
    Rapportages: Wijzigen; Voorzieningen: Aanmaken.

De twee bestaande leidende functies houden de volgende rechten:

- **Algemene Administratie** gebruikt de matrix van Administratie.
- **Project Administratie** gebruikt de matrix van Project-admin.

## Gemeten verschil development versus productie

De profielnamen en aantallen zijn gelijk, maar enkele rechten in development
lopen voor op productie. De bovenstaande lijst toont bewust de actuele
developmentbasis die na merge wordt uitgerold. Voorbeelden van gemeten
verschillen zijn nieuwe rechten voor Merk/Social/Marketing, HRM-vrijgave en
Financieel vertrouwelijk, plus hogere Calculaties-rechten voor Projectleider en
Werkvoorbereider. De samenvoeging kopieert geen rechten: functies blijven aan
dezelfde profiel-ID gekoppeld en volgen daardoor de geldende matrix.

## Terugdraaipunt vóór uitvoering

De samenvoeging wordt pas na Renés tweede akkoord uitgevoerd en is
niet-destructief:

1. Vóór de datamigratie wordt een controleerbare snapshot vastgelegd van alle
   functies, profielkoppelingen en verwijzende medewerker-/aanstellings-ID’s.
2. De twee dubbele rijen worden alleen inactief gemaakt, niet verwijderd.
3. De zestien nieuwe functies blijven herkenbaar aan de migratie en kunnen bij
   herstel inactief worden gemaakt.
4. De oude profielrijen blijven bestaan als technische rechtenmatrix.
5. Een inverse herstelprocedure wordt naast het bewijs vastgelegd en getest
   tegen de ontwikkeldatabase.
6. Code en databasewijziging worden in één Replit-checkpoint aangeboden. Voor
   productieherstel blijft de migratiegeschiedenis immutabel; herstel gebeurt
   zo nodig met een nieuwe, inverse migratie op basis van de snapshot.

Hierdoor kan een verkeerde indeling worden hersteld zonder rechtenmatrices of
oude functierijen uit reconstructie te hoeven terugbouwen.
