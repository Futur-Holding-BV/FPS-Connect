import Constants from "expo-constants";

// Centrale bron voor het API-domein van de monteur-app.
//
// - Ontwikkel (Expo Go / dev-build): app.config.js injecteert het actuele
//   Replit-domein in de Expo-config.
// - Productie (gepubliceerde app via Expo Launch): er is geen Replit-domein;
//   de app moet altijd met de productieserver praten.
//
// Gebruik overal API_DOMEIN i.p.v. een losse omgevingsvariabele, zodat een
// gepubliceerde build nooit per ongeluk naar een (dood) dev-domein wijst.

const PRODUCTIE_DOMEIN = "connect.fps-one.nl";
const configDomein = Constants.expoConfig?.extra?.apiDomein;
const ontwikkelDomein =
  typeof configDomein === "string" && configDomein.length > 0
    ? configDomein
    : PRODUCTIE_DOMEIN;

export const API_DOMEIN: string = __DEV__ ? ontwikkelDomein : PRODUCTIE_DOMEIN;
