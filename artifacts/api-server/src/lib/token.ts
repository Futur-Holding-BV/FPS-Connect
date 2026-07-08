import crypto from "crypto";

// Eenvoudige, stateless bearer-tokens voor de mobiele monteur-app.
// De web-app blijft sessie-cookies gebruiken; mobiel kan geen cookies bewaren
// in de Replit-iframe, dus daar gebruiken we een ondertekend token.
const SECRET = process.env.SESSION_SECRET || "dev-secret-wijzig-mij";
const GELDIGHEID_MS = 30 * 24 * 60 * 60 * 1000; // 30 dagen

export interface TokenPayload {
  uid: number;
  // Token-epoch (tokenVersie op gebruikers). Ontbreekt in oudere tokens, dan
  // geldt 0 — gelijk aan de kolomdefault, dus bestaande logins blijven werken
  // totdat een reset/sessies-beëindigen de versie ophoogt.
  tv: number;
}

// `tokenVersie` maakt het token intrekbaar: bij een admin-wachtwoordreset of
// "sessies beëindigen" hoogt de server de kolom op, waardoor elk eerder
// uitgegeven token (met de oude tv) direct ongeldig wordt zonder een
// blocklist bij te houden.
export function maakToken(userId: number, tokenVersie: number): string {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, tv: tokenVersie, exp: Date.now() + GELDIGHEID_MS }),
  ).toString("base64url");
  const sig = crypto
    .createHmac("sha256", SECRET)
    .update(payload)
    .digest("base64url");
  return `${payload}.${sig}`;
}

export function leesToken(token: string): TokenPayload | null {
  const delen = token.split(".");
  if (delen.length !== 2) return null;
  const [payload, sig] = delen;
  const verwacht = crypto
    .createHmac("sha256", SECRET)
    .update(payload)
    .digest("base64url");
  const aangeleverd = Buffer.from(sig);
  const verwachtBuf = Buffer.from(verwacht);
  if (
    aangeleverd.length !== verwachtBuf.length ||
    !crypto.timingSafeEqual(aangeleverd, verwachtBuf)
  ) {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof data.uid !== "number" || typeof data.exp !== "number") return null;
    if (data.exp < Date.now()) return null;
    const tv = typeof data.tv === "number" ? data.tv : 0;
    return { uid: data.uid, tv };
  } catch {
    return null;
  }
}
