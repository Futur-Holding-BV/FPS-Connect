export const APP_VERSIE = "1.0.0";
export const APP_UITGEBRACHT_OP = "2026-06-08";
export const APP_LEVERANCIER = "FPS Brandpreventie";

export type Wijziging = {
  versie: string;
  datum: string;
  punten: string[];
};

export const WIJZIGINGSLOGBOEK: Wijziging[] = [
  {
    versie: "1.0.0",
    datum: "2026-06-08",
    punten: [
      "Helpdesk, feedback en gebruiksstatistieken toegevoegd",
      "Login-risicosignalen (nieuw apparaat of nieuw IP-adres)",
      "Uitnodigingslogboek met verlopen-status en acceptatiedatum",
      "Brand- en rookscheidingen intekenen op plattegronden",
      "Tekeningenbeheer en gebouwpartijen met toegewezen gebruikers",
    ],
  },
  {
    versie: "0.9.0",
    datum: "2026-05-20",
    punten: [
      "Verplichte tweestapsverificatie met authenticator-app",
      "Rolgebaseerde portalen voor beheerder en monteur",
      "Mobiele monteur-app gekoppeld aan het platform",
    ],
  },
  {
    versie: "0.5.0",
    datum: "2026-04-15",
    punten: [
      "Gebouwen-, voorzieningen-, inspectie- en onderhoudsbeheer",
      "Dashboard met live statistieken en aankomende inspectiedatums",
      "Abonnementen en gebruikersbeheer",
    ],
  },
];
