/**
 * Link Scanner — URL-reputatieanalyse voor FPS Connect.
 *
 * Controleert links op:
 *  - Verdachte TLDs en gratis domein-diensten
 *  - IP-gebaseerde URL's (geen hostname)
 *  - Localhost/intern netwerk-adressen
 *  - URL-shorteners (verborgen bestemming)
 *  - Typosquatting op bekende legitieme domeinen
 *  - Verdachte subdomein-patronen
 *  - Data-URI's met uitvoerbare inhoud
 *  - JavaScript-protocol links
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type LinkRisicoNiveau = "groen" | "geel" | "oranje" | "rood";

export interface LinkRisico {
  url: string;
  risicoNiveau: LinkRisicoNiveau;
  redenen: string[];
}

// ── Configuratie ───────────────────────────────────────────────────────────────

const BEKENDE_VEILIGE_DOMEINEN = new Set([
  "fps-brandpreventie.nl", "fps-connect.nl", "fps-one.nl",
  "google.com", "microsoft.com", "office.com", "outlook.com",
  "github.com", "linkedin.com", "youtube.com",
  "rijksoverheid.nl", "overheid.nl", "omgevingsloket.nl",
]);

const URL_SHORTENERS = new Set([
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "buff.ly",
  "short.to", "rb.gy", "rebrand.ly", "bl.ink", "smarturl.it",
  "tiny.cc", "is.gd", "cli.gs", "pic.gd", "cutt.ly", "v.gd",
  "tr.im", "su.pr", "twurl.nl", "snipurl.com", "short.ie",
  "u.to", "lnkd.in", "db.tt", "qr.ae", "adf.ly", "j.mp",
  "x.co", "mcaf.ee", "go2l.ink", "yourls.org", "wp.me",
]);

const VERDACHTE_TLDS = new Set([
  ".tk", ".ml", ".ga", ".cf", ".gq",
  ".pw", ".top", ".work", ".click", ".download",
  ".zip", ".mov",
  ".stream", ".loan", ".racing", ".review",
  ".xyz", ".ru", ".cn", ".onion",
  ".cc", ".info", ".biz",
]);

const IP_PATROON = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/;

const INTERN_IP_PATRONEN = [
  /^10\.\d+\.\d+\.\d+/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+/,
  /^192\.168\.\d+\.\d+/,
  /^127\.\d+\.\d+\.\d+/,
  /^localhost/i,
  /^0\.0\.0\.0/,
  /^\[::1\]/,
  /^::1$/,
  /^169\.254\.\d+\.\d+/,
];

const BEKENDE_DOMEINEN_TYPOSQUATTING = [
  { domein: "microsoft", varianten: ["m1crosoft", "micros0ft", "mlcrosoft", "rnicrosoft", "microsofft"] },
  { domein: "google", varianten: ["g00gle", "gooogle", "g0ogle", "googel", "gogle"] },
  { domein: "paypal", varianten: ["paypa1", "paypa-l", "paypall", "payqal"] },
  { domein: "apple", varianten: ["app1e", "appl3", "appie"] },
  { domein: "amazon", varianten: ["arnazon", "arnaz0n", "amaz0n"] },
  { domein: "dropbox", varianten: ["dr0pbox", "dropb0x", "dropbx"] },
  { domein: "onedrive", varianten: ["one-drive", "1nedrive", "onedrlve"] },
  { domein: "sharepoint", varianten: ["sharepointt", "sharepo1nt"] },
  { domein: "outlook", varianten: ["outl00k", "0utlook", "outllook"] },
  { domein: "fps-brandpreventie", varianten: ["fps-brandpreventle", "fps-brandprevente", "fpsbrandpreventie"] },
];

const VERDACHTE_SUBDOMEIN_PATRONEN = [
  /^(secure|login|account|verify|update|billing|confirm|support)\./i,
  /^(paypal|microsoft|google|apple|amazon|outlook)\.[a-z0-9-]+\.(tk|ml|ga|cf|gq)/i,
];

const VERDACHTE_PATH_PATRONEN = [
  /\/wp-admin\//i,
  /\/eval\(/i,
  /\/base64_decode/i,
  /\/\.\.\//,
  /\.(php|asp|aspx|jsp|cgi)\?/i,
  /\/shell/i,
  /\/cmd\//i,
];

// ── URL-extractie ─────────────────────────────────────────────────────────────

export function extraherenLinks(tekst: string): string[] {
  const url_regex = /https?:\/\/[^\s<>"'`(){}\[\]\\|^~]+/gi;
  const data_regex = /data:(?:text|application)\/[a-z]+;base64,[a-zA-Z0-9+/=]+/gi;
  const js_regex = /javascript:[^\s<>"'`]+/gi;

  const gevonden = new Set<string>();
  for (const match of tekst.matchAll(url_regex)) gevonden.add(match[0].replace(/[.,;:!?)]$/, ""));
  for (const match of tekst.matchAll(data_regex)) gevonden.add(match[0].slice(0, 100));
  for (const match of tekst.matchAll(js_regex)) gevonden.add(match[0]);

  return [...gevonden].slice(0, 200);
}

// ── URL-reputatieanalyse ──────────────────────────────────────────────────────

export function analyserenLinks(urls: string[]): LinkRisico[] {
  return urls.map((url) => analyserenEenLink(url));
}

function analyserenEenLink(url: string): LinkRisico {
  const redenen: string[] = [];
  let niveau: LinkRisicoNiveau = "groen";

  if (url.startsWith("javascript:")) {
    return { url, risicoNiveau: "rood", redenen: ["JavaScript-protocol link (kan code uitvoeren)"] };
  }

  if (url.startsWith("data:")) {
    const isExecutable = /data:(?:application|text\/javascript|text\/html)/i.test(url);
    return {
      url: url.slice(0, 80) + "...",
      risicoNiveau: isExecutable ? "rood" : "geel",
      redenen: [isExecutable ? "Data-URI met uitvoerbare inhoud" : "Data-URI"],
    };
  }

  let hostname = "";
  let pathname = "";
  try {
    const parsed = new URL(url);
    hostname = parsed.hostname.toLowerCase();
    pathname = parsed.pathname;
  } catch {
    return { url, risicoNiveau: "geel", redenen: ["Ongeldige URL-syntax"] };
  }

  if (BEKENDE_VEILIGE_DOMEINEN.has(hostname) || [...BEKENDE_VEILIGE_DOMEINEN].some((d) => hostname.endsWith("." + d))) {
    return { url, risicoNiveau: "groen", redenen: [] };
  }

  if (IP_PATROON.test(hostname)) {
    const isIntern = INTERN_IP_PATRONEN.some((p) => p.test(hostname));
    redenen.push(isIntern ? "Intern/localhost IP-adres in URL (mogelijke SSRF)" : "Numeriek IP-adres in URL");
    niveau = isIntern ? "rood" : "oranje";
  }

  if (!IP_PATROON.test(hostname) && INTERN_IP_PATRONEN.some((p) => p.test(hostname))) {
    redenen.push("Lokaal/intern netwerk-adres");
    niveau = "rood";
  }

  if (hostname.endsWith(".onion")) {
    redenen.push("Tor hidden service (.onion domein)");
    niveau = "rood";
  }

  if (URL_SHORTENERS.has(hostname)) {
    redenen.push(`URL-shortener (${hostname}) — bestemming verborgen`);
    niveau = niveau === "rood" ? "rood" : "oranje";
  }

  for (const tld of VERDACHTE_TLDS) {
    if (hostname.endsWith(tld)) {
      redenen.push(`Verdachte TLD: ${tld}`);
      niveau = niveau === "rood" ? "rood" : "oranje";
    }
  }

  for (const { domein, varianten } of BEKENDE_DOMEINEN_TYPOSQUATTING) {
    if (varianten.some((v) => hostname.includes(v))) {
      redenen.push(`Mogelijke typosquatting op "${domein}": ${hostname}`);
      niveau = "rood";
    }
  }

  for (const p of VERDACHTE_SUBDOMEIN_PATRONEN) {
    if (p.test(hostname)) {
      redenen.push(`Verdacht subdomain-patroon: ${hostname}`);
      niveau = niveau === "rood" ? "rood" : "oranje";
    }
  }

  for (const p of VERDACHTE_PATH_PATRONEN) {
    if (p.test(pathname)) {
      redenen.push(`Verdacht pad-patroon: ${pathname.slice(0, 60)}`);
      niveau = niveau === "rood" ? "rood" : "oranje";
    }
  }

  if (url.startsWith("http://") && niveau === "groen") {
    redenen.push("Onversleutelde HTTP-verbinding");
    niveau = "geel";
  }

  if (url.length > 2000) {
    redenen.push(`Extreem lange URL (${url.length} tekens)`);
    niveau = niveau === "rood" ? "rood" : "oranje";
  }

  const subdomainCount = hostname.split(".").length - 2;
  if (subdomainCount > 4) {
    redenen.push(`Veel subdomeinen (${subdomainCount}) — mogelijke verduistering`);
    niveau = niveau === "rood" ? "rood" : "geel";
  }

  return { url: url.slice(0, 500), risicoNiveau: niveau, redenen };
}

// ── Aggregatie ────────────────────────────────────────────────────────────────

export function hoogsteNiveauUitLinks(links: LinkRisico[]): string {
  if (links.some((l) => l.risicoNiveau === "rood")) return "rood";
  if (links.some((l) => l.risicoNiveau === "oranje")) return "oranje";
  if (links.some((l) => l.risicoNiveau === "geel")) return "geel";
  return "groen";
}
