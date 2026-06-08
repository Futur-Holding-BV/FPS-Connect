export const TALEN = [
  { code: "nl", naam: "Nederlands", vlag: "🇳🇱" },
  { code: "en", naam: "English", vlag: "🇬🇧" },
  { code: "de", naam: "Deutsch", vlag: "🇩🇪" },
  { code: "fr", naam: "Français", vlag: "🇫🇷" },
  { code: "ar", naam: "العربية", vlag: "🇸🇦" },
  { code: "tr", naam: "Türkçe", vlag: "🇹🇷" },
] as const;

export type TaalCode = (typeof TALEN)[number]["code"];

export const RTL_TALEN: TaalCode[] = ["ar"];

export const STANDAARD_TAAL: TaalCode = "nl";

export const OPSLAG_SLEUTEL = "fps_taal";

export function isGeldigeTaal(code: unknown): code is TaalCode {
  return TALEN.some((t) => t.code === code);
}
