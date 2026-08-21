export type FaseStatus = "niet_gestart" | "bezig" | "gereed" | "aandacht";

export interface ProjectFase {
  id: string;
  label: string;
  korteLabel: string;
  status: FaseStatus;
  tab: string;
}

export function leidProjectFasenAf(
  calcs: any[],
  offertes: any[],
  opnames: any[],
  facturen: any[],
  gebouw: any,
): ProjectFase[] {
  const geaccepteerd = offertes.some((o) => o.status === "geaccepteerd");
  const gewonnen = calcs.some((c) => c.status === "gewonnen");
  const heeftOpdracht = geaccepteerd || gewonnen;

  return [
    {
      id: "opname",
      label: "Opname",
      korteLabel: "Opname",
      status: opnames.some((o) => ["definitief", "gereed"].includes(o.status))
        ? "gereed"
        : opnames.length > 0
          ? "bezig"
          : "niet_gestart",
      tab: "opnames",
    },
    {
      id: "calculatie",
      label: "Calculatie",
      korteLabel: "Calc.",
      status: gewonnen ? "gereed" : calcs.length > 0 ? "bezig" : "niet_gestart",
      tab: "calculaties",
    },
    {
      id: "offerte",
      label: "Offerte",
      korteLabel: "Offerte",
      status: geaccepteerd
        ? "gereed"
        : offertes.length > 0
          ? "bezig"
          : "niet_gestart",
      tab: "offertes",
    },
    {
      id: "opdracht",
      label: "Opdracht",
      korteLabel: "Opdracht",
      status: heeftOpdracht ? "gereed" : "niet_gestart",
      tab: "project",
    },
    {
      id: "werkbegroting",
      label: "Werkbegroting",
      korteLabel: "WB",
      status: "niet_gestart",
      tab: "calculaties",
    },
    {
      id: "inkoop",
      label: "Inkoop",
      korteLabel: "Inkoop",
      status: "niet_gestart",
      tab: "calculaties",
    },
    {
      id: "planning",
      label: "Planning",
      korteLabel: "Planning",
      status: "niet_gestart",
      tab: "uitvoering",
    },
    {
      id: "uitvoering",
      label: "Uitvoering",
      korteLabel: "Uitv.",
      status: "niet_gestart",
      tab: "uitvoering",
    },
    {
      id: "oplevering",
      label: "Oplevering",
      korteLabel: "Oplev.",
      status: gebouw.gereed_op ? "gereed" : "niet_gestart",
      tab: "rapporten",
    },
    {
      id: "facturatie",
      label: "Facturatie",
      korteLabel: "Factuur",
      status:
        facturen.length > 0 && facturen.some((f) => f.status === "betaald")
          ? "gereed"
          : facturen.length > 0
            ? "bezig"
            : "niet_gestart",
      tab: "facturen",
    },
    {
      id: "onderhoud",
      label: "Onderhoud",
      korteLabel: "Onderh.",
      status: "niet_gestart",
      tab: "beheer",
    },
  ];
}

export function bepaalActueleProjectFase(
  fasen: ProjectFase[],
): ProjectFase | undefined {
  return (
    [...fasen].reverse().find((fase) => fase.status !== "niet_gestart") ??
    fasen[0]
  );
}