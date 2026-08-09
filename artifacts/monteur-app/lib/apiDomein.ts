// Centrale bron voor het API-domein van de monteur-app.
//
// - Ontwikkel (Expo Go / dev-build): EXPO_PUBLIC_DOMAIN wordt door Replit
//   geïnjecteerd en wijst naar de dev-omgeving.
// - Productie (gepubliceerde app via Expo Launch): er is geen Replit-domein;
//   de app moet altijd met de productieserver praten.
//
// Gebruik overal API_DOMEIN i.p.v. process.env.EXPO_PUBLIC_DOMAIN, zodat een
// gepubliceerde build nooit per ongeluk naar een (dood) dev-domein wijst.

const PRODUCTIE_DOMEIN = "connect.fps-one.nl";

export const API_DOMEIN: string = __DEV__
  ? (process.env.EXPO_PUBLIC_DOMAIN ?? PRODUCTIE_DOMEIN)
  : PRODUCTIE_DOMEIN;
