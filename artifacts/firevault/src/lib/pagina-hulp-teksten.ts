import type { Rol } from "@/context/rol-context";

export type PaginaSleutel =
  | "dashboard-beheerder"
  | "dashboard-monteur"
  | "dashboard-klant"
  | "gebouwen"
  | "gebouw-detail"
  | "plattegrond"
  | "voorzieningen"
  | "voorziening-detail"
  | "voorziening-nieuw"
  | "inspecties"
  | "inspectie-detail"
  | "onderhoud"
  | "gebruikers"
  | "personeel"
  | "medewerker-detail"
  | "verlof-overzicht"
  | "offertes"
  | "offerte-studio"
  | "leveranciers"
  | "leverancier-detail"
  | "artikelen"
  | "beheer-import"
  | "beheer-bibliotheek"
  | "beheer-toepassingen"
  | "beheer-rollen-rechten"
  | "dossiers"
  | "opname"
  | "planning"
  | "inbox"
  | "documentopmaak"
  | "abonnementen"
  // Inkoop
  | "inkoop-overzicht"
  // Magazijn
  | "magazijn"
  | "magazijn-artikelen"
  | "magazijn-locaties"
  | "magazijn-voorraad"
  | "magazijn-stellingscans"
  | "magazijn-mutaties"
  | "magazijn-reserveringen"
  | "magazijn-uitgiftes"
  | "magazijn-retouren"
  // Veiligheid
  | "veiligheid-toolboxen"
  | "veiligheid-lmra"
  | "veiligheid-meldingen"
  | "veiligheid-incidenten"
  | "veiligheid-pbm"
  | "veiligheid-toolbox-compliance"
  // Financieel
  | "directie-kompas"
  | "bedrijfskompas"
  | "boekhouding"
  | "facturen"
  | "factuur-detail"
  | "facturen-dashboard"
  | "facturen-stroom"
  | "facturen-controlebox"
  | "facturen-export"
  | "facturen-exportlog"
  | "crediteuren"
  | "bedrijfsresultaten"
  | "onderhanden-werk"
  | "jaarrekening"
  | "jaarrekeningen"
  | "meerjarenoverzicht"
  | "sepa-bestanden"
  // Goedkeuring
  | "goedkeuringen-dashboard"
  | "goedkeuringsbeleid"
  // Declaraties
  | "declaraties"
  | "declaratie-detail"
  // Wagenpark
  | "wagenpark"
  | "wagenpark-meldingen"
  | "wagenpark-detail"
  | "wagenpark-brandstof-import"
  | "wagenpark-documentsoorten"
  | "wagenpark-form";

type RolTekst = Partial<Record<Rol | "default", string>>;

export const PAGINA_HULP: Record<PaginaSleutel, RolTekst> = {

  "dashboard-beheerder": {
    hoofdbeheerder:
      "Welkom op uw dashboard. Hier ziet u een live-overzicht van uw portefeuille: actieve gebouwen, openstaande spots, komende inspecties en werkorders. Klik op een tegel om direct naar het bijbehorende overzicht te gaan.",
    gebruiker:
      "Uw persoonlijke werkdashboard toont de gebouwen en taken die aan u zijn toegewezen. Klik op een item om direct naar de details te gaan.",
  },

  "dashboard-monteur": {
    default:
      "Uw werkdashboard. Hier ziet u de gebouwen en werkorders die voor u klaarstaan. Gebruik de navigatie onderaan voor spots, foto's en plattegronden.",
  },

  "dashboard-klant": {
    klant:
      "Welkom in FPS One. Hier ziet u een samenvatting van uw gebouwen, actuele spots en rapportages. Klik op een gebouw of rapport voor meer details.",
  },

  "gebouwen": {
    hoofdbeheerder:
      "Overzicht van uw volledige projectportefeuille. Gebruik 'Nieuw gebouw' om een project aan te maken. Zoek en filter op naam, status of projectfase. Klik op een kaart om het gebouw te openen.",
    gebruiker:
      "Hier ziet u de gebouwen waaraan u bent gekoppeld. Klik op een gebouw om de spots, plattegrond en documenten te bekijken.",
    klant:
      "Uw gebouwen staan hier overzichtelijk weergegeven. Klik op een gebouw voor de actuele spotstatus en uw rapportages.",
  },

  "gebouw-detail": {
    hoofdbeheerder:
      "Gebouwdetailpagina met drie tabbladen: Overzicht (projectformulier, betrokkenen, AI-samenvatting), Uitvoering (spots per verdieping) en Documenten. Vul het projectformulier volledig in — dit wordt gebruikt in rapporten en offertes.",
    gebruiker:
      "Bekijk de spotlijst en het projectformulier van dit gebouw. Navigeer naar een verdieping om spots te bekijken of bij te werken.",
  },

  "plattegrond": {
    hoofdbeheerder:
      "SVG-plattegrondeditor. Sleep spots naar de juiste positie, voeg scheidingen in en beheer logo-plaatsing. Klik op een spot-marker voor het zijpaneel. Sla op met de knop rechtsboven.",
    gebruiker:
      "Lees-only weergave van de plattegrond. Klik op een spot-marker voor details en foto's.",
  },

  "voorzieningen": {
    hoofdbeheerder:
      "Spot-overzicht over alle gebouwen. Filter op status (gereed, in uitvoering, afgekeurd), type of gebouw. Klik op een spot voor inspecties, foto's en gekoppelde documenten. Gebruik 'Nieuwe spot' om handmatig een voorziening te registreren.",
    gebruiker:
      "Spots die aan u zijn toegewezen. Filter op 'Mijn spots' voor een overzicht van uw taken. Klik op een spot om bevindingen en foto's toe te voegen.",
  },

  "voorziening-detail": {
    hoofdbeheerder:
      "Spotdetailpagina: type, status, locatie, toepassing, inspecties en foto's. Bewerk een spot via de bewerkknop. Koppel een toepassing uit de bibliotheek voor de juiste werendheidsinformatie.",
    gebruiker:
      "Bekijk de volledige details van deze spot. Voeg een bevinding of foto toe via de knoppen onderaan de pagina.",
  },

  "voorziening-nieuw": {
    hoofdbeheerder:
      "Nieuwe spot aanmaken. Kies het gebouw en de verdieping, selecteer het type, wijs een monteur toe en voeg eventueel een foto toe. Het spotnummer wordt automatisch gegenereerd.",
    gebruiker:
      "Vul alle verplichte velden in (met * gemarkeerd). Kies het juiste type en locatie — dit kan later niet meer worden gewijzigd zonder de spot te archiveren.",
  },

  "inspecties": {
    hoofdbeheerder:
      "Overzicht van alle inspectieronden: oplevering, periodiek, jaarlijks en herstel. Maak een nieuwe inspectie aan via 'Nieuwe inspectie', koppel spots en wijs een controleur toe. Afgeronde inspecties kunnen worden afgesloten en omgezet naar een rapport.",
    gebruiker:
      "Inspecties waaraan u bent gekoppeld. Open een inspectie om per spot een bevinding in te voeren en de status bij te werken.",
  },

  "inspectie-detail": {
    hoofdbeheerder:
      "Inspectiedetail: gekoppelde spots, bevindingen per spot en status. Gebruik de statusknop om de inspectie te starten, in uitvoering te zetten of af te sluiten. Na afsluiting kunt u een rapport genereren.",
    gebruiker:
      "Voer per spot een bevinding in. Kies de status (goedgekeurd / afgekeurd / n.v.t.) en voeg opmerkingen en foto's toe.",
  },

  "onderhoud": {
    hoofdbeheerder:
      "Werkorderoverzicht. Maak werkorders aan, stel prioriteit en deadline in en wijs een uitvoerder toe. Sleep werkorders tussen statussen of wijzig de status via het detail. Werkorders met een verstreken deadline worden rood gemarkeerd.",
    gebruiker:
      "Uw openstaande werkorders. Klik op een werkorder om de instructies te lezen en de status bij te werken. Voeg opmerkingen toe aan het logboek.",
  },

  "gebruikers": {
    hoofdbeheerder:
      "Gebruikersbeheer: overzicht van alle accounts. Nodig nieuwe teamleden uit via 'Uitnodigen'. Stel per gebruiker de rol en bevoegdheden in via het bevoegdhedenprofiel. Koppel teamleden aan specifieke gebouwen voor een beperkt zichtbereik.",
  },

  "personeel": {
    hoofdbeheerder:
      "HRM-module met medewerkerprofielen, functiehuizen, opleidingen en verlof. Onboarden start u per gebruiker via 'Onboarden' in de lijst 'Gebruikers zonder medewerkerprofiel' — naam, e-mail en telefoon worden uit het account overgenomen. Gebruik de bekwaamheidsmatrix om certificaten en vaardigheden bij te houden.",
  },

  "medewerker-detail": {
    hoofdbeheerder:
      "Medewerkerdetail met vijf tabbladen: Profiel, Account/Rol, Functie, Opleidingen en Verlof. Bewerk velden via de bewerkknop per sectie. Verlof aanvragen en goedkeuren gaat via het Verlof-tabblad.",
  },

  "verlof-overzicht": {
    hoofdbeheerder:
      "Verlofaanvragen van alle medewerkers. Keur aanvragen goed of af. Saldo's worden bijgewerkt na goedkeuring. Gebruik de filteropties om per medewerker of periode te filteren.",
  },

  "offertes": {
    hoofdbeheerder:
      "Offerteoverzicht: alle offertes gesorteerd op datum. Maak een nieuwe offerte via 'Nieuwe offerte'. Klik op een offerte om de studio te openen. Een vastgestelde offerte kan worden omgezet naar een opdracht.",
  },

  "offerte-studio": {
    hoofdbeheerder:
      "De offertestudio heeft vijf tabbladen: Secties (vrije tekstvakken voor inleiding, aanpak en slotwoord), Prijzen (begrotingsregels + weergave-instellingen), Condities (betalingstermijn, geldigheid, factuurschema), Bijlagen (verwijzingen naar certificaten en documenten) en Voorbeeld (live preview). Sla per tabblad afzonderlijk op. Gebruik 'DDS afdrukken' voor de definitieve PDF.",
  },

  "leveranciers": {
    hoofdbeheerder:
      "Leveranciersregister. Maak leveranciers aan met contactgegevens, bankgegevens (IBAN, BIC) en betalingstermijn. Via de detailpagina koppelt u artikelen aan een leverancier en ziet u gekoppelde inkoopbonnen.",
  },

  "leverancier-detail": {
    hoofdbeheerder:
      "Leverancierdetail met drie tabbladen: Gegevens (adres, contact, bank), Artikelen (catalogus van deze leverancier) en Inkoopbonnen. Bewerk gegevens via de bewerkknop. Voeg artikelen toe via het tabblad Artikelen.",
  },

  "artikelen": {
    hoofdbeheerder:
      "Artikelcatalogus: inkoop- en verkoopprijzen per eenheid. Koppel een artikel aan een leverancier. Gebruik de zoekfunctie om snel te filteren op code, naam of categorie. Prijzen worden gebruikt als basis voor offerteregels.",
  },

  "beheer-import": {
    hoofdbeheerder:
      "Gegevens importeren uit Excel of CSV in vier stappen: (1) kies het type en upload uw bestand, (2) koppel de kolommen aan de juiste velden, (3) bekijk de preview van 20 rijen, (4) importeer en bekijk het rapport. Bestaande records worden bijgewerkt op basis van code of naam — duplicaten worden niet aangemaakt.",
  },

  "beheer-bibliotheek": {
    hoofdbeheerder:
      "Bibliotheek met brandpreventieve toepassingen en labels (fabrikanten + producten). Toepassingen worden gekoppeld aan spots voor de juiste werendheidsinformatie. Bewerk een toepassing om de testnorm en EI-waarden in te stellen.",
  },

  "beheer-toepassingen": {
    hoofdbeheerder:
      "Toepassingencatalogus: beheer de typen brandpreventieve toepassingen. Koppel fabrikanten en testnormen. Deze gegevens vormen de basis voor de bekwaamheidsmatrix en de spotdetailpagina.",
  },

  "beheer-rollen-rechten": {
    hoofdbeheerder:
      "Rollen- en rechtenbeheer: de rollenmatrix toont per bevoegdheidsprofiel welke modules zichtbaar en bewerkbaar zijn. Maak een nieuw profiel via 'Nieuw profiel'. Gebruik 'Toepassen op gebruiker' om een profiel aan een account te koppelen.",
  },

  "dossiers": {
    hoofdbeheerder:
      "Digitale dossiers per gebouw: verzamel alle documenten, rapporten en correspondentie op één plek. Stel de status in op Concept → Definitief → Gearchiveerd. Een definitief dossier is bevroren en juridisch sluitend.",
  },

  "opname": {
    hoofdbeheerder:
      "Opnameschermen voor het vastleggen van gebouwinformatie op locatie. Registreer spotlocaties, maak foto's en voeg bevindingen toe. Opnames worden direct gesynchroniseerd met het gebouwdossier.",
    gebruiker:
      "Gebruik dit scherm op locatie om spots te registreren en foto's toe te voegen. Zorg dat u een actieve internetverbinding hebt voor directe synchronisatie.",
  },

  "planning": {
    hoofdbeheerder:
      "Planningsmodule: plan werkorders en inspecties per dag en medewerker. Gebruik de weekweergave voor een snel overzicht. Items met een verstreken deadline worden rood gemarkeerd.",
  },

  "inbox": {
    default:
      "Uw berichten en meldingen. Inkomende berichten van klanten, teamleden en het systeem verschijnen hier. Markeer berichten als gelezen door ze te openen.",
  },

  "documentopmaak": {
    hoofdbeheerder:
      "Document Design System: beheer de opmaak van offertes, rapporten en HRM-documenten. Stel de huisstijl in (logo, kleur, lettertype) en bekijk een live preview. Wijzigingen zijn direct zichtbaar in nieuwe documenten.",
  },

  "abonnementen": {
    hoofdbeheerder:
      "Abonnementsbeheer: kies het pakket dat past bij uw organisatie. Basis (€149/maand) voor kleine teams, Beheer (€349/maand) met uitgebreid gebruikersbeheer en Volledig (€699/maand) inclusief alle modules.",
  },

  // ══════════ Inkoop ══════════

  "inkoop-overzicht": {
    hoofdbeheerder:
      "Inkoopoverzicht: alle inkoopbonnen met hun status en gekoppelde leverancier. Maak een nieuwe inkoopbon aan, keur openstaande bonnen goed en volg de levering. Een goedkeuringsbeleid kan een statuswijziging blokkeren tot de bon is goedgekeurd.",
    gebruiker:
      "Hier ziet u de inkoopbonnen. Dien een inkoopaanvraag in en volg de status. Goedkeuring verloopt via de verantwoordelijke beheerder.",
  },

  // ══════════ Magazijn ══════════

  "magazijn": {
    hoofdbeheerder:
      "Magazijndashboard: live overzicht van voorraadniveaus, kritieke artikelen, openstaande reserveringen en recente mutaties. Klik op een tegel om direct naar het bijbehorende overzicht te gaan. Kritieke voorraad wordt rood gemarkeerd.",
    gebruiker:
      "Overzicht van het magazijn: voorraad, uitgiftes en reserveringen. Klik op een tegel voor de details.",
  },

  "magazijn-artikelen": {
    hoofdbeheerder:
      "Magazijnartikelen: beheer alle voorraadartikelen met minimum- en bestelniveaus, eenheid en locatie. Stel per artikel het kritieke niveau in zodat u tijdig een signalering krijgt. Koppel artikelen aan een magazijnlocatie voor snelle terugvindbaarheid.",
    gebruiker:
      "Overzicht van de magazijnartikelen. Zoek op code of naam om snel het juiste artikel en de voorraad te vinden.",
  },

  "magazijn-locaties": {
    hoofdbeheerder:
      "Magazijnlocaties: beheer de fysieke opslagplaatsen (stellingen, vakken, ruimtes). Koppel artikelen aan een locatie zodat voorraad snel terug te vinden is. Locaties vormen de basis voor de stellingscans.",
  },

  "magazijn-voorraad": {
    hoofdbeheerder:
      "Voorraadoverzicht: de actuele voorraad per artikel en locatie. Corrigeer voorraad handmatig via een mutatie. Artikelen onder het kritieke niveau worden gemarkeerd zodat u tijdig kunt bijbestellen.",
    gebruiker:
      "Actuele voorraad per artikel. Controleer hier of een artikel op voorraad is voordat u het reserveert of uitgeeft.",
  },

  "magazijn-stellingscans": {
    hoofdbeheerder:
      "Stellingscans: leg fysieke tellingen per stelling vast en vergelijk ze met de administratieve voorraad. Verschillen worden zichtbaar gemaakt zodat u ze kunt onderzoeken en corrigeren. Gebruik dit voor periodieke voorraadcontrole.",
    gebruiker:
      "Scan een stelling om de aanwezige artikelen te tellen. Verschillen met de administratie worden automatisch gesignaleerd.",
  },

  "magazijn-mutaties": {
    hoofdbeheerder:
      "Voorraadmutaties: het volledige logboek van alle voorraadwijzigingen (inname, uitgifte, correctie, retour). Elke mutatie is herleidbaar naar gebruiker en tijdstip. Gebruik de filters om per artikel, type of periode te zoeken.",
  },

  "magazijn-reserveringen": {
    hoofdbeheerder:
      "Reserveringen: gereserveerde artikelen voor een project of werkorder. Gereserveerde voorraad blijft geboekt tot uitgifte of vrijgave. Zo voorkomt u dat materiaal dubbel wordt toegewezen.",
    gebruiker:
      "Reserveer artikelen voor uw project of werkorder. Gereserveerde voorraad wordt voor u apart gehouden tot u ze ophaalt.",
  },

  "magazijn-uitgiftes": {
    hoofdbeheerder:
      "Uitgiftes: geef artikelen uit aan een medewerker, project of werkorder. Elke uitgifte verlaagt de voorraad en wordt vastgelegd in het mutatielogboek. Koppel een uitgifte aan een project voor correcte kostentoerekening.",
    gebruiker:
      "Registreer welke artikelen u meeneemt voor uw werk. De voorraad wordt automatisch bijgewerkt en aan uw project gekoppeld.",
  },

  "magazijn-retouren": {
    hoofdbeheerder:
      "Retouren: registreer teruggebrachte artikelen. Ongebruikt materiaal wordt teruggeboekt in de voorraad; beschadigd materiaal kunt u afkeuren. Elke retour wordt vastgelegd in het mutatielogboek.",
    gebruiker:
      "Breng ongebruikte artikelen terug naar het magazijn. Geef aan of het materiaal herbruikbaar of beschadigd is.",
  },

  // ══════════ Veiligheid ══════════

  "veiligheid-toolboxen": {
    hoofdbeheerder:
      "Toolboxen: beheer veiligheidsonderwerpen en instructies voor het team. Publiceer een toolbox en volg per medewerker de leesbevestiging. Gebruik de compliance-weergave om te zien wie nog moet bevestigen.",
    gebruiker:
      "Lees de toolboxonderwerpen die voor u klaarstaan en bevestig 'gelezen en begrepen'. Zo houdt de organisatie zicht op ieders veiligheidskennis.",
  },

  "veiligheid-lmra": {
    hoofdbeheerder:
      "LMRA (Laatste Minuut Risico Analyse): overzicht van de op locatie ingevulde risicochecks. Controleer of medewerkers vóór aanvang van het werk de risico's beoordelen. Openstaande of afgekeurde LMRA's worden gemarkeerd.",
    gebruiker:
      "Vul vóór aanvang van het werk een LMRA in: beoordeel de actuele risico's op de werkplek en bevestig dat het veilig is om te beginnen.",
  },

  "veiligheid-meldingen": {
    hoofdbeheerder:
      "Veiligheidsmeldingen: overzicht van gemelde onveilige situaties, bijna-ongevallen en verbeterpunten. Wijs een verantwoordelijke toe en volg de afhandeling tot afronding. Open meldingen worden bovenaan getoond.",
    gebruiker:
      "Meld een onveilige situatie of bijna-ongeval. Uw melding komt direct bij de verantwoordelijke terecht voor opvolging.",
  },

  "veiligheid-incidenten": {
    hoofdbeheerder:
      "Incidentenregister: leg ongevallen en incidenten vast met oorzaak, letsel en genomen maatregelen. Dit register vormt de basis voor rapportage en preventie. Houd de afhandeling en eventuele meldingsplicht bij.",
    gebruiker:
      "Registreer een incident of ongeval zo volledig mogelijk. Beschrijf wat er gebeurde en welke directe maatregelen zijn genomen.",
  },

  "veiligheid-pbm": {
    hoofdbeheerder:
      "PBM-beheer (persoonlijke beschermingsmiddelen): houd per medewerker bij welke beschermingsmiddelen zijn verstrekt en wanneer ze vervangen moeten worden. Verlopen of ontbrekende PBM's worden gesignaleerd.",
    gebruiker:
      "Overzicht van uw persoonlijke beschermingsmiddelen. Controleer de vervangingsdatum en meld ontbrekende of versleten middelen.",
  },

  "veiligheid-toolbox-compliance": {
    hoofdbeheerder:
      "Toolbox-compliance: zie per medewerker en per toolbox wie de leesbevestiging al heeft gegeven en wie nog achterloopt. Gebruik dit overzicht om herinneringen te sturen en aantoonbaar aan de veiligheidsverplichting te voldoen.",
  },

  // ══════════ Financieel ══════════

  "directie-kompas": {
    hoofdbeheerder:
      "Directiekompas: strategisch dashboard met de belangrijkste bedrijfskengetallen (omzet, marge, onderhanden werk, liquiditeit). Bedoeld voor directie en management om in één oogopslag de gezondheid van de organisatie te beoordelen.",
  },

  "bedrijfskompas": {
    hoofdbeheerder:
      "Bedrijfskompas: overzicht van de operationele en financiële kernprestaties. Volg trends per periode en signaleer afwijkingen vroegtijdig. Bedoeld voor beheerders en directie die sturen op bedrijfsresultaat.",
  },

  "boekhouding": {
    hoofdbeheerder:
      "Boekhoudkoppeling: beheer de verbinding met het boekhoudpakket (o.a. AccountView). Connect levert de gegevens aan; het boekhoudpakket blijft leidend. Controleer hier de koppelingsstatus en exportinstellingen.",
  },

  "facturen": {
    hoofdbeheerder:
      "Facturenoverzicht: alle inkoop- en verkoopfacturen met status. Filter op leverancier, periode of status. Klik op een factuur voor de details en de controlestappen vóór export naar de boekhouding.",
  },

  "factuur-detail": {
    hoofdbeheerder:
      "Factuurdetail: bekijk de factuurregels, gekoppelde inkoopbon of project en de controlestatus. Keur de factuur goed of markeer een afwijking. Een goedgekeurde factuur kan mee in de export naar de boekhouding.",
  },

  "facturen-dashboard": {
    hoofdbeheerder:
      "Facturendashboard: live overzicht van openstaande, gecontroleerde en geëxporteerde facturen. Zie in één oogopslag wat nog controle of goedkeuring vereist voordat het naar de boekhouding gaat.",
  },

  "facturen-stroom": {
    hoofdbeheerder:
      "Factuurbewaking: alle gebeurtenissen uit de automatische factuurstroom die aandacht van een mens nodig hebben. Het systeem leest binnenkomende facturen, koppelt ze en signaleert twijfel — goedkeuren doet het nooit zelf. Stel hier ook in welke mailbox de factuurmailbox is.",
  },

  "facturen-controlebox": {
    hoofdbeheerder:
      "Controlebox: facturen die nog inhoudelijk gecontroleerd moeten worden. Vergelijk de factuur met de inkoopbon of het project, keur goed of stuur terug bij een afwijking. Alleen gecontroleerde facturen komen in aanmerking voor export.",
  },

  "facturen-export": {
    hoofdbeheerder:
      "Klaar voor export: gecontroleerde en goedgekeurde facturen die klaarstaan om naar de boekhouding te worden verzonden. Controleer de selectie en start de export. Na export verschijnen ze in het exportlogboek.",
  },

  "facturen-exportlog": {
    hoofdbeheerder:
      "Exportlogboek: historie van alle facturenexports naar de boekhouding, met tijdstip, aantal en status. Gebruik dit om achteraf te controleren welke facturen wanneer zijn doorgezet.",
  },

  "crediteuren": {
    hoofdbeheerder:
      "Crediteurenoverzicht: openstaande verplichtingen aan leveranciers. Zie per crediteur het openstaande saldo en de vervaldatums. Gebruik dit voor betaalvoorbereiding en het opstellen van SEPA-bestanden.",
  },

  "bedrijfsresultaten": {
    hoofdbeheerder:
      "Bedrijfsresultaten: overzicht van omzet, kosten en marge per periode. Vergelijk realisatie met eerdere perioden om trends te herkennen. Bedoeld voor beheerders en directie die op resultaat sturen.",
  },

  "onderhanden-werk": {
    hoofdbeheerder:
      "Onderhanden werk (OHW): de waarde van lopende projecten die nog niet is gefactureerd. Zie per project de bestede kosten tegenover de gefactureerde bedragen, zodat u het resultaat en de nog te factureren waarde bewaakt.",
  },

  "jaarrekening": {
    hoofdbeheerder:
      "Jaarrekening: het financiële jaaroverzicht met balans en resultatenrekening. Bedoeld voor directie, boekhouder en accountant. Het boekhoudpakket blijft leidend voor de definitieve cijfers.",
  },

  "jaarrekeningen": {
    hoofdbeheerder:
      "Jaarrekeningen: archief van de opgestelde jaarrekeningen per boekjaar. Open een boekjaar voor de balans en resultatenrekening van dat jaar.",
  },

  "meerjarenoverzicht": {
    hoofdbeheerder:
      "Meerjarenoverzicht: de financiële kerncijfers over meerdere jaren naast elkaar. Herken lange-termijntrends in omzet, marge en resultaat. Bedoeld voor directie en management.",
  },

  "sepa-bestanden": {
    hoofdbeheerder:
      "SEPA-bestanden: stel betaalbestanden samen voor de bank op basis van openstaande crediteuren. Controleer de selectie, genereer het SEPA-bestand en upload dit in uw bankomgeving. Elk gegenereerd bestand wordt vastgelegd.",
  },

  // ══════════ Goedkeuring ══════════

  "goedkeuringen-dashboard": {
    hoofdbeheerder:
      "Goedkeuringendashboard: alle openstaande en afgehandelde goedkeuringsaanvragen. Keur aanvragen goed of wijs ze af; de motor voert de bijbehorende actie daarna zelf uit. Aanvragen die op uw actie wachten worden bovenaan getoond.",
    gebruiker:
      "Overzicht van uw goedkeuringsaanvragen en de aanvragen die op uw actie wachten. Open een aanvraag om de details te bekijken en te beslissen.",
  },

  "goedkeuringsbeleid": {
    hoofdbeheerder:
      "Goedkeuringsbeleid: bepaal welke acties (bijvoorbeeld een inkoopbon boven een bedrag) een goedkeuring vereisen en wie mag goedkeuren. Zolang een beleidsregel geldt, wordt de directe actie geblokkeerd tot goedkeuring is verleend.",
  },

  // ══════════ Declaraties ══════════

  "declaraties": {
    hoofdbeheerder:
      "Declaraties: overzicht van ingediende onkostendeclaraties van medewerkers. Controleer bonnen en bedragen, keur goed of wijs af. Goedgekeurde declaraties kunnen mee in de betaal- en boekhoudverwerking.",
    gebruiker:
      "Dien uw onkosten in met een omschrijving, bedrag en bon. Volg de status van uw declaratie tot deze is goedgekeurd en uitbetaald.",
  },

  "declaratie-detail": {
    hoofdbeheerder:
      "Declaratiedetail: bekijk de declaratieregels, bijgevoegde bonnen en de status. Keur de declaratie goed of wijs af met een reden. De indiener ziet de statuswijziging direct.",
    gebruiker:
      "Details van uw declaratie: regels, bedragen en bijgevoegde bonnen. Volg hier de status en de eventuele reden bij afwijzing.",
  },

  // ══════════ Wagenpark ══════════

  "wagenpark": {
    hoofdbeheerder:
      "Wagenpark: overzicht van alle voertuigen met kenteken, toegewezen bestuurder en onderhoudsstatus. Beheer keuringen (APK), onderhoudsbeurten en brandstofverbruik. Aankomende of verlopen keuringen worden gesignaleerd.",
    gebruiker:
      "Overzicht van de voertuigen. Bekijk de gegevens en onderhoudsstatus van het voertuig dat aan u is toegewezen.",
  },

  "wagenpark-meldingen": {
    hoofdbeheerder:
      "Wagenparkmeldingen: aankomende en verlopen keuringen, onderhoudsbeurten en schademeldingen. Wijs opvolging toe en houd de afhandeling bij. Zo blijft het wagenpark keuringsplichtig en verkeersveilig.",
    gebruiker:
      "Meld schade, storingen of onderhoud aan uw voertuig. Uw melding komt direct bij de wagenparkbeheerder terecht.",
  },

  "wagenpark-detail": {
    hoofdbeheerder:
      "Voertuigdetail: kenteken, bestuurder, keuringsdata, onderhoudshistorie en brandstofverbruik. Registreer een onderhoudsbeurt of pas de toegewezen bestuurder aan. Gebruik de historie voor kosteninzicht per voertuig.",
    gebruiker:
      "Details van het voertuig: keuringsdata, onderhoud en brandstof. Meld hier bijzonderheden aan de wagenparkbeheerder.",
  },

  "wagenpark-brandstof-import": {
    hoofdbeheerder:
      "Brandstofimport: lees tankpas-transacties in uit een bestand van uw brandstofleverancier. De transacties worden gekoppeld aan het juiste voertuig zodat u het verbruik en de kosten per voertuig kunt volgen.",
  },

  "wagenpark-documentsoorten": {
    hoofdbeheerder:
      "Documentsoorten: beheer de soorten voertuigdocumenten (bijv. verzekeringsbewijs, leasecontract). Stel per soort in of er een vervaldatum geldt en na hoeveel dagen een waarschuwing wordt getoond.",
  },

  "wagenpark-form": {
    hoofdbeheerder:
      "Voertuig aanmaken of bewerken: vul de basisgegevens, aandrijving, vaste garage, verzekering en lease in. Gebruik 'RDW ophalen' als invulhulp op basis van het kenteken.",
  },
};

export function getPaginaHulpTekst(
  pagina: PaginaSleutel,
  rol: Rol,
): string | null {
  const teksten = PAGINA_HULP[pagina];
  if (!teksten) return null;
  return (
    (teksten as Record<string, string>)[rol] ??
    teksten.default ??
    null
  );
}
