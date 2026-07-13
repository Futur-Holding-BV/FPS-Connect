// Gedeelde labelmaps voor documenttypen en documentstatussen. In een apart,
// lichtgewicht bestand zodat schermen (zoals de gebouwdetailpagina) deze labels
// kunnen hergebruiken zonder de volledige DMS-module te importeren.

export const TYPE_LABELS: Record<string, string> = {
  eta: "ETA",
  classificatierapport: "Classificatierapport",
  testrapport: "Testrapport",
  productcertificaat: "Productcertificaat",
  dop: "DoP",
  verwerkingsvoorschrift: "Verwerkingsvoorschrift",
  productblad: "Productblad",
  opleverrapport: "Opleverrapport",
  tekening: "Tekening",
  contract: "Contract",
  verzekering: "Verzekering",
  overig: "Overig",
};

export const STATUS_LABELS: Record<string, string> = {
  actueel: "Actueel",
  controle_nodig: "Controle nodig",
  vervangen: "Vervangen",
  mogelijk_verouderd: "Mogelijk verouderd",
  ingetrokken: "Ingetrokken",
};
