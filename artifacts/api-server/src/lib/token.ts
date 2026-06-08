import crypto from "crypto";

// Eenvoudige, stateless bearer-tokens voor de mobiele monteur-app.
// De web-app blijft sessie-cookies gebruiken; mobiel kan geen cookies bewaren
// in de Replit-iframe, dus daar gebruiken we een ondertekend token.
const SECRET = process.env.SESSION_SECRET || "dev-secret-wijzig-mij";
const GELDIGHEID_MS = 30 * 24 * 60 * 60 * 1000; // 30 dagen

export function maakToken(userId: number): string {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, exp: Date.now() + GELDIGHEID_MS }),
  ).toString("base64url");
  const sig = crypto
    .createHmac("sha256", SECRET)
    .update(payload)
    .digest("base64url");
  return `${payload}.${sig}`;
}

export function leesToken(token: string): number | null {
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
    return data.uid;
  } catch {
    return null;
  }
}
