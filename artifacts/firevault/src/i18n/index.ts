import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { vertalingen } from "./vertalingen";
import { STANDAARD_TAAL, OPSLAG_SLEUTEL, isGeldigeTaal } from "./talen";

const opgeslagen = typeof localStorage !== "undefined" ? localStorage.getItem(OPSLAG_SLEUTEL) : null;
const startTaal = isGeldigeTaal(opgeslagen) ? opgeslagen : STANDAARD_TAAL;

const resources = Object.fromEntries(
  Object.entries(vertalingen).map(([code, boom]) => [code, { translation: boom }]),
);

void i18n.use(initReactI18next).init({
  resources,
  lng: startTaal,
  fallbackLng: STANDAARD_TAAL,
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
});

export default i18n;
