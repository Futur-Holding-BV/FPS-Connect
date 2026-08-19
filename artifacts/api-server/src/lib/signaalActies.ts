export interface SignaalActie {
  actie_pad: string | null;
  actie_label: string | null;
}

export const FIE_SIGNAAL_TYPES = [
  "geen_begroting",
  "omzet_risico",
  "omzet_achterstand",
  "omzet_voorsprong",
  "break_even_risico",
  "ak_onderdekking",
  "lege_pipeline",
] as const;

export const LIQUIDITEIT_SIGNAAL_TYPES = [
  "liquiditeit_tekort",
  "crediteuren_achterstallig",
  "debiteuren_achterstallig",
  "cashflow_negatief_30d",
] as const;

const ACTIES: Record<string, SignaalActie> = {
  geen_begroting: {
    actie_pad: "/beheer/bedrijfskompas",
    actie_label: "Begroting openen",
  },
  omzet_risico: {
    actie_pad: "/offertes",
    actie_label: "Offertes en pipeline bekijken",
  },
  omzet_achterstand: {
    actie_pad: "/offertes",
    actie_label: "Offertes en pipeline bekijken",
  },
  omzet_voorsprong: {
    actie_pad: "/modules/planning",
    actie_label: "Capaciteit bekijken",
  },
  break_even_risico: {
    actie_pad: "/beheer/bedrijfskompas",
    actie_label: "Begroting en break-even bekijken",
  },
  ak_onderdekking: {
    actie_pad: "/beheer/bedrijfskompas",
    actie_label: "AK-dekking bekijken",
  },
  lege_pipeline: {
    actie_pad: "/offertes",
    actie_label: "Offertes bekijken",
  },
  liquiditeit_tekort: {
    actie_pad: "/financieel/liquiditeit",
    actie_label: "Liquiditeit bekijken",
  },
  crediteuren_achterstallig: {
    actie_pad: "/financieel/crediteuren",
    actie_label: "Crediteuren bekijken",
  },
  debiteuren_achterstallig: {
    actie_pad: "/facturen",
    actie_label: "Debiteuren bekijken",
  },
  cashflow_negatief_30d: {
    actie_pad: "/financieel/liquiditeit",
    actie_label: "Cashflow bekijken",
  },
};

export function bepaalSignaalActie(type: string): SignaalActie {
  return ACTIES[type] ?? {
    actie_pad: null,
    actie_label: null,
  };
}