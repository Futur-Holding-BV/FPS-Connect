import crypto from "crypto";

// Genereert een sterk, uitspreekbaar tijdelijk wachtwoord voor de
// admin-geïnitieerde wachtwoordreset. Verwarrende tekens (0/O, 1/l/I) zijn
// bewust weggelaten zodat een hoofdbeheerder het foutloos kan doorgeven.
const HOOFDLETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const KLEINE_LETTERS = "abcdefghijkmnopqrstuvwxyz";
const CIJFERS = "23456789";
const SYMBOLEN = "!@#$%&*?";
const ALLE_TEKENS = HOOFDLETTERS + KLEINE_LETTERS + CIJFERS + SYMBOLEN;

function willekeurigTeken(set: string): string {
  return set[crypto.randomInt(0, set.length)]!;
}

export function genereerTijdelijkWachtwoord(lengte = 14): string {
  const verplicht = [
    willekeurigTeken(HOOFDLETTERS),
    willekeurigTeken(KLEINE_LETTERS),
    willekeurigTeken(CIJFERS),
    willekeurigTeken(SYMBOLEN),
  ];
  const rest = Array.from({ length: Math.max(lengte - verplicht.length, 0) }, () =>
    willekeurigTeken(ALLE_TEKENS),
  );
  const tekens = [...verplicht, ...rest];
  // Fisher-Yates shuffle met crypto.randomInt zodat de verplichte tekens niet
  // altijd vooraan staan.
  for (let i = tekens.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [tekens[i], tekens[j]] = [tekens[j]!, tekens[i]!];
  }
  return tekens.join("");
}
