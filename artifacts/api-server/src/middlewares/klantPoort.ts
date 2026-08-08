// KLANT_01 Fase 1 — centrale klant-begrenzing ("klant-poort").
//
// Uitgangspunt: DICHT TENZIJ OPEN. Een gebruiker met rol "klant" kan alleen
// de routes bereiken die hieronder expliciet zijn opgenomen; elke andere route
// geeft 403 — óók als een handler of middleware verderop de klant per ongeluk
// zou doorlaten. Bestaande handler-filters blijven staan als tweede laag.
//
// Regels:
// - Deze lijst is het volledige, bedoelde klantoppervlak van de sessie-API.
//   (De publieke routers — auth, health, uitnodiging, installatie, portaal —
//   staan vóór requireAuth gemount en vallen buiten deze poort.)
// - Een nieuwe route voor klanten? Voeg hem hier toe MET een begrenzing in de
//   handler (toegewezenGebouwIds / magBijGebouw). De buildcontrole
//   (scripts/src/klant-poort-check.ts) dwingt af dat elke
//   requireBevoegdheidOfKlant-route in deze lijst staat.
// - Fail-closed: is de rol niet vast te stellen, dan behandelen we het verzoek
//   als een gewone gebruiker (de bevoegdhedenlaag blokkeert dan zelf); is de
//   rol "klant" en matcht niets, dan 403.

import type { NextFunction, Request, Response } from "express";

export interface KlantRoute {
  methode: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  // Regex over req.path (zonder /api-prefix, zoals de routers hem zien).
  patroon: RegExp;
  omschrijving: string;
}

export const KLANT_TOEGESTANE_ROUTES: KlantRoute[] = [
  // Dashboard (handlers filteren op toegewezen gebouwen)
  { methode: "GET", patroon: /^\/dashboard\/(stats|recente-activiteit|status-verdeling|vervaldagen)$/, omschrijving: "klantdashboard" },
  // Gebouwen — lijst + detail + kaart + publicatiestatus (handler filtert op toewijzing + publicatie)
  { methode: "GET", patroon: /^\/gebouwen$/, omschrijving: "gebouwenlijst (gefilterd)" },
  { methode: "GET", patroon: /^\/gebouwen\/\d+$/, omschrijving: "gebouwdetail (gefilterd)" },
  { methode: "GET", patroon: /^\/gebouwen\/\d+\/kaart$/, omschrijving: "gebouwkaart" },
  { methode: "GET", patroon: /^\/gebouwen\/\d+\/publicatiestatus$/, omschrijving: "publicatiestatus" },
  // Inspecties — lijst + detail + bevindingen (handler filtert)
  { methode: "GET", patroon: /^\/inspecties$/, omschrijving: "inspectielijst (gefilterd)" },
  { methode: "GET", patroon: /^\/inspecties\/\d+$/, omschrijving: "inspectiedetail" },
  { methode: "GET", patroon: /^\/inspecties\/\d+\/bevindingen$/, omschrijving: "inspectiebevindingen" },
  // Rapportages (handler: alleen definitief/gearchiveerd + gebouwtoewijzing)
  { methode: "GET", patroon: /^\/gebouwen\/\d+\/rapporten$/, omschrijving: "rapportenlijst" },
  { methode: "GET", patroon: /^\/gebouwen\/\d+\/rapporten\/\d+$/, omschrijving: "rapportdetail" },
  { methode: "POST", patroon: /^\/gebouwen\/\d+\/rapporten\/\d+\/klant-reactie$/, omschrijving: "ontvangst bevestigen" },
  { methode: "GET", patroon: /^\/gebouwen\/\d+\/rapporten\/\d+\/bijlagenbundel$/, omschrijving: "bijlagen downloaden" },
  // PIM — klant-leesweergave (handler begrenst op gebouwtoewijzing + veldweglating)
  { methode: "GET", patroon: /^\/opdrachten\/\d+\/pim$/, omschrijving: "PIM-klantweergave" },
  { methode: "GET", patroon: /^\/opdrachten\/\d+\/pim\/uitvoering\/stappen$/, omschrijving: "PIM-uitvoeringsstappen" },
  { methode: "GET", patroon: /^\/opdrachten\/\d+\/pim\/uitvoering\/huidige-stap$/, omschrijving: "PIM huidige stap" },
  { methode: "GET", patroon: /^\/opdrachten\/\d+\/pim\/uitvoering\/stap\/\d+\/foto-analyse\/\d+$/, omschrijving: "PIM foto-analyse" },
  { methode: "GET", patroon: /^\/opdrachten\/\d+\/pim\/uitvoering\/verslag$/, omschrijving: "PIM-uitvoeringsverslag" },
  // Assistent — antwoorden lopen via contextmotor + gegevens-tools met rechtencheck
  { methode: "POST", patroon: /^\/adviseur\/vraag$/, omschrijving: "Connect-assistent" },
  // Chat — sessie-gescoopt (alleen eigen gesprekken); /chat/gebruikers bewust NIET
  { methode: "GET", patroon: /^\/chat\/gesprekken$/, omschrijving: "eigen gesprekken (notificaties)" },
  { methode: "GET", patroon: /^\/chat\/gesprekken\/\d+$/, omschrijving: "eigen gesprek" },
  { methode: "GET", patroon: /^\/chat\/gesprekken\/\d+\/berichten$/, omschrijving: "eigen berichten" },
  { methode: "POST", patroon: /^\/chat\/gesprekken\/\d+\/berichten$/, omschrijving: "bericht sturen in eigen gesprek" },
  { methode: "POST", patroon: /^\/chat\/gesprekken\/\d+\/gelezen$/, omschrijving: "gelezen-markering" },
  // Bestanden — nodig voor foto's/plattegronden/rapport-PDF's in het portaal
  { methode: "GET", patroon: /^\/storage\/(objects|thumbnails|public-objects)\//, omschrijving: "bestandsweergave" },
  // AVG — eigen verzoeken (sessie-gescoopt)
  { methode: "POST", patroon: /^\/avg\/inzageverzoek$/, omschrijving: "eigen AVG-verzoek" },
  { methode: "GET", patroon: /^\/avg\/mijn-verzoeken$/, omschrijving: "eigen AVG-verzoeken" },
  // Meldingen — bug/vraag indienen (schrijft alleen eigen melding)
  { methode: "POST", patroon: /^\/meldingen$/, omschrijving: "melding indienen" },
];

export function klantPoort(req: Request, res: Response, next: NextFunction): void {
  // Rol vaststellen: permissieservice is leidend, sessie-rol als vangnet.
  const isKlant =
    req.permissies?.isKlant ??
    ((req.session as { rol?: string } | undefined)?.rol === "klant");
  if (!isKlant) { next(); return; }

  const toegestaan = KLANT_TOEGESTANE_ROUTES.some(
    (r) => r.methode === req.method && r.patroon.test(req.path),
  );
  if (toegestaan) { next(); return; }

  res.status(403).json({ error: "Deze functie is niet beschikbaar in het klantportaal" });
}
