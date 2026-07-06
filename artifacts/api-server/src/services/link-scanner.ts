/**
 * Link Scanner — analyseert URLs op veiligheidsrisico's.
 * Volledig server-side, geen externe API's vereist.
 */

export interface LinkRisico {
  url: string;
  risicoScore: number;
  risicoNiveau: "groen" | "geel" | "oranje" | "rood";
  bevindingen: string[];
}

// ── Bekende URL-verkortingsdiensten ───────────────────────────────────────────

const URL_VERKORTINGEN = new Set([
  "bit.ly", "tinyurl.com", "goo.gl", "t.co", "ow.ly", "buff.ly",
  "adf.ly", "is.gd", "tiny.cc", "shorte.st", "rebrand.ly", "cutt.ly",
  "shorturl.at", "rb.gy", "snip.ly", "gg.gg", "zpr.io",
]);

// ── Verdachte TLD's (vaak misbruikt voor phishing/spam) ──────────────────────

const VERDACHTE_TLDS = new Set([
  ".tk", ".ml", ".ga", ".cf", ".gq", ".pw", ".top", ".club",
  ".xyz", ".icu", ".vip", ".work", ".cam", ".men", ".date",
  ".online", ".site", ".website", ".tech",
]);

// ── Directe bestandsdownload-extensies via URL ────────────────────────────────

const GEVAARLIJKE_URL_EXTENSIES = /\.(exe|bat|cmd|msi|ps1|vbs|js|jar|dll|scr|hta|apk|iso|img|inf|reg|com|pif)([?#]|$)/i;

// ── Phishing-indicatoren in domeinnaam ────────────────────────────────────────

const PHISHING_PATRONEN = [
  /paypal.*\.(?!paypal\.com)/i,
  /microsoft.*\.(?!microsoft\.com|office\.com|live\.com)/i,
  /google.*\.(?!google\.com|googleapis\.com|google\.nl)/i,
  /apple.*\.(?!apple\.com|icloud\.com)/i,
  /amazon.*\.(?!amazon\.(com|nl|de|fr|co\.uk))/i,
  /bol\.com.*\.(?!bol\.com)/i,
  /ing.*\.(?!ing\.nl|ing\.com)/i,
  /rabobank.*\.(?!rabobank\.nl|rabobank\.com)/i,
  /belastingdienst.*\.(?!belastingdienst\.nl)/i,
  /login|signin|account|verify|secure|update.*password/i,
];

// ── URL-extractie uit tekst ───────────────────────────────────────────────────

const URL_REGEX = /https?:\/\/[^\s\]"'>]+/gi;
const VERDACHTE_PROTOCOLLEN = /^(javascript:|data:|file:\/\/|vbscript:)/i;

/**
 * Extraheer alle URLs uit een stuk tekst.
 */
export function extraherenLinks(tekst: string): string[] {
  const gevonden: string[] = [];
  const matches = tekst.match(URL_REGEX) ?? [];
  for (const url of matches) {
    const schoon = url.replace(/[.,;)>\]]+$/, ""); // strip trailing punctuation
    if (schoon.length <= 2048) gevonden.push(schoon);
  }
  return [...new Set(gevonden)]; // dedupliceer
}

/**
 * Analyseer één URL en geef een risicobeoordeling.
 */
export function analyserenUrl(rawUrl: string): LinkRisico {
  const bevindingen: string[] = [];
  let score = 0;

  // Verdacht protocol
  if (VERDACHTE_PROTOCOLLEN.test(rawUrl)) {
    bevindingen.push("Verdacht protocol (javascript/data/file)");
    score += 80;
  }

  let hostname = "";
  let pad = "";
  try {
    const u = new URL(rawUrl);
    hostname = u.hostname.toLowerCase();
    pad = u.pathname + u.search;
  } catch {
    bevindingen.push("Ongeldige URL-structuur");
    score += 30;
    return { url: rawUrl, risicoScore: score, risicoNiveau: niveauVanScore(score), bevindingen };
  }

  // IP-adres als hostname
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    bevindingen.push("IP-adres als host (geen domeinnaam)");
    score += 40;
  }

  // URL-verkorting
  if (URL_VERKORTINGEN.has(hostname)) {
    bevindingen.push("URL-verkorter detectered — eindbestemming onbekend");
    score += 25;
  }

  // Verdachte TLD
  const tldMatch = hostname.match(/\.[a-z]{2,10}$/);
  if (tldMatch && VERDACHTE_TLDS.has(tldMatch[0])) {
    bevindingen.push(`Verdachte TLD: ${tldMatch[0]}`);
    score += 20;
  }

  // Phishing-patronen in domein
  for (const patroon of PHISHING_PATRONEN) {
    if (patroon.test(hostname)) {
      bevindingen.push("Mogelijk lookalike/phishing domein");
      score += 45;
      break;
    }
  }

  // Directe gevaarlijke bestandsdownload
  if (GEVAARLIJKE_URL_EXTENSIES.test(pad)) {
    bevindingen.push("URL leidt naar uitvoerbaar of gevaarlijk bestand");
    score += 60;
  }

  // Overmatig lange URL (obfuscatie)
  if (rawUrl.length > 500) {
    bevindingen.push("Zeer lange URL — mogelijk obfuscatie");
    score += 10;
  }

  // Meerdere subdomains (typisch bij misleiding)
  const subdomainCount = hostname.split(".").length - 2;
  if (subdomainCount >= 3) {
    bevindingen.push(`Veel subdomainniveaus (${subdomainCount}) — mogelijk misleiding`);
    score += 15;
  }

  // Encoding/obfuscatie in pad
  if ((pad.match(/%[0-9a-f]{2}/gi) ?? []).length > 10) {
    bevindingen.push("Overmatige URL-encoding — mogelijk obfuscatie");
    score += 20;
  }

  // Verdachte paden
  if (/\/(phish|malware|payload|dropper|crypter|rat|keylog|exploit)/i.test(pad)) {
    bevindingen.push("Verdacht pad in URL");
    score += 50;
  }

  const risicoNiveau = niveauVanScore(Math.min(score, 100));
  return { url: rawUrl, risicoScore: Math.min(score, 100), risicoNiveau, bevindingen };
}

/**
 * Analyseer een lijst URLs en retourneer gesorteerd op risico.
 */
export function analyserenLinks(urls: string[]): LinkRisico[] {
  return urls
    .slice(0, 100) // max 100 links per document
    .map(analyserenUrl)
    .sort((a, b) => b.risicoScore - a.risicoScore);
}

function niveauVanScore(score: number): "groen" | "geel" | "oranje" | "rood" {
  if (score >= 60) return "rood";
  if (score >= 35) return "oranje";
  if (score >= 15) return "geel";
  return "groen";
}

/**
 * Hoogste risico-niveau uit een lijst link-risico's.
 */
export function hoogsteNiveauUitLinks(
  links: LinkRisico[],
): "groen" | "geel" | "oranje" | "rood" {
  const rangorde = { groen: 0, geel: 1, oranje: 2, rood: 3 };
  let hoogste: "groen" | "geel" | "oranje" | "rood" = "groen";
  for (const l of links) {
    if (rangorde[l.risicoNiveau] > rangorde[hoogste]) hoogste = l.risicoNiveau;
  }
  return hoogste;
}
