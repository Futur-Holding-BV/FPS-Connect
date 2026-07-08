// FPS Moments — extensible framework voor dagelijks-relevante persoonlijke
// gebeurtenissen (eerste type: verjaardag). Elk toekomstig Moment-type
// implementeert MomentType en wordt geregistreerd in registry.ts; de route en
// het datacontract blijven ongewijzigd.

export type MomentContext = {
  // Effectieve gebruiker (na eventuele "bekijken als"-impersonatie).
  userId: number;
  rol: string;
  vandaag: Date;
};

// Eén Moment-item zoals het naar web + mobiel gaat. Bewust minimaal: nooit
// leeftijd/geboortejaar of andere gevoelige velden — alleen wat nodig is om
// te vieren.
export type Moment = {
  type: "verjaardag";
  medewerkerId: number;
  naam: string;
  fotoUrl: string | null;
  // true wanneer dit Moment over de ingelogde gebruiker zelf gaat — bepaalt
  // of confetti/felicitatiekaart voor déze gebruiker getoond wordt.
  geldtVoorJou: boolean;
};

export type MomentType = {
  key: Moment["type"];
  // Geeft alle Momenten van dit type die vandaag voor deze gebruiker getoond
  // mogen worden (rekening houdend met opt-in van collega's en de eigen
  // gebruiker's zichtbaarheid).
  vandaag: (ctx: MomentContext) => Promise<Moment[]>;
};
