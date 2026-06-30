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
  | "abonnementen";

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
      "HRM-module met medewerkerprofielen, functiehuizen, opleidingen en verlof. Klik 'Medewerker onboarden' om een bestaand account als medewerker te registreren — gegevens worden automatisch overgenomen. Gebruik de bekwaamheidsmatrix om certificaten en vaardigheden bij te houden.",
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
