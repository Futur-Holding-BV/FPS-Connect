import { db } from "@workspace/db";
import { aiPromptScansTable, aiWijzigingsvoorstellenTable } from "@workspace/db";
import { logger } from "../lib/logger";

export type PromptClassificatie = "groen" | "geel" | "oranje" | "rood";
export type PromptBeslissing = "toegestaan" | "voorstel" | "geblokkeerd";

export interface PromptScanInvoer {
  promptTekst: string;
  module: string;
  functie?: string | null;
  gebruikerId?: number | null;
  gebruikerNaam?: string | null;
  rol?: string | null;
}

export interface PromptScanResultaat {
  classificatie: PromptClassificatie;
  risicoScore: number;
  injectieGedetecteerd: boolean;
  injectieSignalen: string[];
  beslissing: PromptBeslissing;
  motivatie: string;
}

// ── Modules die alleen interne (systeem-)aanroepen doen ───────────────────────
// Voor deze modules slaat de governance-check de classificatie over
// en logt het als groen (interne systeemaanroep).

const INTERNE_MODULES = new Set([
  "document-analyse",
  "document-ai",
  "spot-ai",
  "gebouw-ai",
  "opleiding-ai",
  "email-ai",
  "scout",
  "backup",
  "snagstream",
  "bibliotheek-validatie",
  "bibliotheek",
  "ai-bibliotheek",
]);

// ── ROOD: altijd blokkeren ────────────────────────────────────────────────────

const ROOD_PATRONEN: Array<{ regex: RegExp; label: string; score: number }> = [
  { regex: /\b(drop|delete|truncate|alter)\s+(table|database|schema|column|index)\b/i, label: "SQL destructieve opdracht", score: 95 },
  { regex: /\b(insert\s+into|update\s+\w+\s+set|delete\s+from)\b/i, label: "SQL schrijfopdracht", score: 90 },
  { regex: /\bdb\.(insert|update|delete|drop|migrate|push|execute|query)\b/i, label: "Directe DB-opdracht", score: 90 },
  { regex: /(wijzig|verander|pas\s+aan|aanpassen|aanpas)\s+(de\s+)?(database|tabel|schema|kolom|index|migratie)/i, label: "DB-wijziging verzoek", score: 88 },
  { regex: /\b(voer\s+uit|run|execute)\s+(migratie|migration|script|sql)\b/i, label: "Migratie uitvoeren", score: 85 },
  { regex: /\b(npm|pip|yarn|pnpm|cargo|gem|apt|apk|yum|brew)\s+(install|add|update|upgrade|remove)\b/i, label: "Package installatie", score: 92 },
  { regex: /\binstalleer\s+(package|pakket|module|library|bibliotheek|software)\b/i, label: "Software installatie verzoek", score: 90 },
  { regex: /(wachtwoord|password|secret|api.?key|api.?sleutel|token)\s*(tonen|laten\s+zien|geven|doorgeven|sturen|lekken|print|show|display|dump)/i, label: "Geheimen blootleggen", score: 98 },
  { regex: /\b(show|print|display|dump|export|reveal)\s+(password|secret|api.?key|token|credential|session)\b/i, label: "Credentials blootleggen (EN)", score: 98 },
  { regex: /(beveiliging|security|authenticatie|authentication|2fa|totp|mfa)\s*(uitschakelen|disablen|omzeilen|bypassen|verwijderen|uitzetten)/i, label: "Beveiliging uitschakelen", score: 96 },
  { regex: /\b(disable|bypass|circumvent|disable)\s+(security|auth|authentication|2fa|mfa|totp|firewall)\b/i, label: "Security bypass (EN)", score: 96 },
  { regex: /(logging|audittrail|audit.?log|logboek)\s*(uitschakelen|verwijderen|wissen|clear|purge|delete|disable)/i, label: "Audittrail verwijderen", score: 95 },
  { regex: /(rechten|rollen|bevoegdheden|permissions|roles)\s*(wijzigen|aanpassen|verhogen|escaleren|veranderen)/i, label: "Rechten/rollen wijzigen", score: 92 },
  { regex: /\b(admin|superuser|root)\s+(maken|worden|instellen|toewijzen|grant)\b/i, label: "Admin rechten verkrijgen", score: 95 },
  { regex: /\b(grant|elevate|escalate)\s+(privilege|permission|role|access|admin)\b/i, label: "Privilege escalation (EN)", score: 95 },
  { regex: /(broncode|source.?code|codebase)\s*(wijzigen|aanpassen|overschrijven|bewerken)/i, label: "Broncode wijzigen", score: 88 },
  { regex: /\b(write|modify|edit|overwrite)\s+(file|code|source|script|config)\b/i, label: "Bestand schrijven (EN)", score: 85 },
  { regex: /(gebruiker|account|user)\s*(aanmaken|registreren|toevoegen|create)\s*(met\s+rol|als\s+admin|hoofdbeheerder)/i, label: "Admin-gebruiker aanmaken", score: 90 },
  { regex: /\benv\s*\[|\bprocess\.env\b|\.env\s*bestand|omgevingsvariabelen\s*(tonen|laten\s+zien)/i, label: "Omgevingsvariabelen blootleggen", score: 95 },
];

// ── INJECTIE: prompt injection patronen ──────────────────────────────────────

const INJECTIE_PATRONEN: Array<{ regex: RegExp; label: string }> = [
  { regex: /negeer\s+(alle\s+)?(eerdere|vorige|je|uw|de)\s+instructies/i, label: "Instructie-overschrijving (NL)" },
  { regex: /ignore\s+(all\s+)?(previous|prior|your|the)\s+instructions?/i, label: "Instructie-overschrijving (EN)" },
  { regex: /vergeet\s+(je|jouw|uw|alle)\s+(instructies?|rol|regels?|taak)/i, label: "Rol-vergeet aanval" },
  { regex: /forget\s+(your|all)\s+(instructions?|role|rules?|task)/i, label: "Rol-vergeet aanval (EN)" },
  { regex: /\bjij\s+(bent\s+nu|bent\s+een|wordt\s+nu|moet\s+nu\s+zijn)\b/i, label: "Rolherdefiniëring (NL)" },
  { regex: /\b(you\s+are\s+now|act\s+as|you\s+must\s+now\s+be|pretend\s+to\s+be)\b/i, label: "Rolherdefiniëring (EN)" },
  { regex: /\bdan\s+mode\b|\bjailbreak\b|\bdan\s+jailbreak\b|\bdan:\s/i, label: "DAN/Jailbreak-aanval" },
  { regex: /\b(do\s+anything\s+now|jailbreak|bypass\s+your\s+(safety|filter|restriction|guideline))\b/i, label: "Jailbreak (EN)" },
  { regex: /toon\s+(je|jouw|uw|de)\s+(systeem.?prompt|system.?prompt|instructies|regels)/i, label: "Systeemprompt-extractie (NL)" },
  { regex: /\b(show|reveal|print|display)\s+(your\s+)?(system\s*prompt|instructions?|rules?|guidelines?)\b/i, label: "Systeemprompt-extractie (EN)" },
  { regex: /\bsystem\s*:\s*\[|\b###\s*instruction\s*###|\b<\s*system\s*>/i, label: "Systeem-tag injectie" },
  { regex: /\[\[SYSTEM\]\]|\[INST\]|\[\/INST\]|<\|system\|>|<\|user\|>|<\|assistant\|>/i, label: "LLM control tokens" },
  { regex: /verwijder\s+(je\s+)?(beperkingen?|grenzen?|filters?|beveiliging|veiligheidsmaatregel)/i, label: "Beperkingsverwijdering (NL)" },
  { regex: /\b(remove|disable|bypass)\s+(your\s+)?(restrictions?|limits?|filters?|safety|constraints?)\b/i, label: "Beperkingsverwijdering (EN)" },
  { regex: /\bsocial\s+engineering\b|\bphishing\b|\bpretexting\b|\bimpersonation\b/i, label: "Social engineering termen" },
  { regex: /als\s+hoofd.?beheerder\s+/i, label: "Rolmisbruik hoofdbeheerder" },
  { regex: /\b(as\s+an?\s+(admin|administrator|superuser|root|system))\b/i, label: "Rolmisbruik admin (EN)" },
  { regex: /base64[_\s]*(decode|encoded?|instructie|instruction)/i, label: "Base64 instructie-obfuscatie" },
  { regex: /<\s*script\b[^>]*>/i, label: "HTML script-injectie" },
  { regex: /javascript\s*:/i, label: "JavaScript-protocol injectie" },
  { regex: /\]\s*\(\s*javascript:/i, label: "Markdown-link injectie" },
  { regex: /\bdata\s*:\s*text\s*\/\s*(html|plain|javascript)/i, label: "Data-URI injectie" },
  { regex: /<!--[\s\S]*?-->/i, label: "HTML commentaar injectie" },
  { regex: /\bexfiltrate\b|\bexfiltration\b|\bdata\s+theft\b/i, label: "Data-exfiltratie aanval" },
  { regex: /\bSSRF\b|\bserver.?side\s+request\s+forgery\b/i, label: "SSRF-aanval" },
  { regex: /\.\.\//i, label: "Path-traversal in prompt" },
];

// ── ORANJE: alleen als voorstel (geen directe uitvoering) ─────────────────────

const ORANJE_PATRONEN: Array<{ regex: RegExp; label: string; score: number }> = [
  { regex: /(workflow|werkstroom|proces)\s*(aanpassen|wijzigen|veranderen|configureren)/i, label: "Workflow-aanpassing verzoek", score: 55 },
  { regex: /(instelling|setting|configuratie|config)\s*(wijzigen|aanpassen|veranderen|instellen)/i, label: "Configuratiewijziging verzoek", score: 50 },
  { regex: /(koppeling|integratie|api.?koppeling|webhook)\s*(wijzigen|toevoegen|aanpassen|activeren)/i, label: "Koppelingswijziging verzoek", score: 52 },
  { regex: /ai.?(configuratie|instelling|regel|governance|prompt)\s*(wijzigen|aanpassen|veranderen)/i, label: "AI-configuratiewijziging verzoek", score: 58 },
  { regex: /(nieuw\s+proces|nieuw\s+workflow|nieuwe\s+module)\s*(aanmaken|opzetten|configureren)/i, label: "Nieuw proces aanmaken verzoek", score: 48 },
  { regex: /\b(deploy|uitrollen|publiceren|releasen)\s+(naar\s+)?(productie|prod)\b/i, label: "Productie-uitrol verzoek", score: 60 },
  { regex: /(module|functie|feature)\s*(inschakelen|uitschakelen|activeren|deactiveren)/i, label: "Module in/uitschakelen verzoek", score: 55 },
];

// ── GEEL: toegestaan binnen gebruikersrechten ─────────────────────────────────

const GEEL_PATRONEN: Array<{ regex: RegExp; label: string }> = [
  { regex: /\b(e-?mail|brief|bericht)\s*(schrijven|opstellen|samenstellen|maken)/i, label: "Document schrijven" },
  { regex: /\b(rapport|rapportage|verslag)\s*(genereren|maken|opstellen|aanmaken)/i, label: "Rapport genereren" },
  { regex: /\b(offerte|aanbieding|prijsopgave)\s*(opstellen|maken|genereren)/i, label: "Offerte opstellen" },
  { regex: /\b(planning|schema|rooster)\s*(voorstellen|maken|opstellen)/i, label: "Planning voorstellen" },
  { regex: /\b(documenten?|bestanden?)\s*(vergelijken|analyseren|controleren)/i, label: "Documenten vergelijken" },
  { regex: /\b(samenvatten|analyse|analyseren|advies|aanbeveling)\b/i, label: "Informatieve actie" },
];

// ── Kern-classificatiefunctie ─────────────────────────────────────────────────

export function classifeerPrompt(invoer: PromptScanInvoer): PromptScanResultaat {
  const { promptTekst, module } = invoer;
  const tekst = promptTekst.trim();

  if (INTERNE_MODULES.has(module)) {
    return {
      classificatie: "groen",
      risicoScore: 0,
      injectieGedetecteerd: false,
      injectieSignalen: [],
      beslissing: "toegestaan",
      motivatie: `Interne systeemaanroep door module '${module}'. Automatisch toegestaan.`,
    };
  }

  const injectieSignalen: string[] = [];
  for (const p of INJECTIE_PATRONEN) {
    if (p.regex.test(tekst)) {
      injectieSignalen.push(p.label);
    }
  }

  if (injectieSignalen.length > 0) {
    return {
      classificatie: "rood",
      risicoScore: Math.min(60 + injectieSignalen.length * 12, 100),
      injectieGedetecteerd: true,
      injectieSignalen,
      beslissing: "geblokkeerd",
      motivatie: `Prompt injection gedetecteerd: ${injectieSignalen.join(", ")}. Aanroep geblokkeerd.`,
    };
  }

  for (const p of ROOD_PATRONEN) {
    if (p.regex.test(tekst)) {
      return {
        classificatie: "rood",
        risicoScore: p.score,
        injectieGedetecteerd: false,
        injectieSignalen: [],
        beslissing: "geblokkeerd",
        motivatie: `Geblokkeerde opdracht: ${p.label}. AI mag dit nooit zelfstandig uitvoeren.`,
      };
    }
  }

  for (const p of ORANJE_PATRONEN) {
    if (p.regex.test(tekst)) {
      return {
        classificatie: "oranje",
        risicoScore: p.score,
        injectieGedetecteerd: false,
        injectieSignalen: [],
        beslissing: "voorstel",
        motivatie: `Wijzigingsverzoek gedetecteerd: ${p.label}. Opgeslagen als voorstel ter beoordeling door de hoofdbeheerder.`,
      };
    }
  }

  for (const p of GEEL_PATRONEN) {
    if (p.regex.test(tekst)) {
      return {
        classificatie: "geel",
        risicoScore: 15,
        injectieGedetecteerd: false,
        injectieSignalen: [],
        beslissing: "toegestaan",
        motivatie: `Gebruikersactie binnen bevoegdheden: ${p.label}.`,
      };
    }
  }

  return {
    classificatie: "groen",
    risicoScore: 5,
    injectieGedetecteerd: false,
    injectieSignalen: [],
    beslissing: "toegestaan",
    motivatie: "Informatieve of ondersteunende opdracht. Automatisch toegestaan.",
  };
}

// ── Document-injectie scanner ─────────────────────────────────────────────────
// Speciaal voor DMS/security-intake: scant documenttekst op verborgen AI-instructies.

const DOCUMENT_INJECTIE_PATRONEN: Array<{ regex: RegExp; label: string }> = [
  { regex: /negeer\s+(alle\s+)?(eerdere|vorige|je|uw)\s+instructies/i, label: "Instructie-overschrijving in document" },
  { regex: /ignore\s+(all\s+)?(previous|prior|your)\s+instructions?/i, label: "Instruction override in document" },
  { regex: /vergeet\s+(je|jouw)\s+(instructies?|rol)/i, label: "Rol-vergeet aanval in document" },
  { regex: /toon\s+(je|jouw)?\s*(systeem.?prompt|wachtwoord|sleutel)/i, label: "Systeem-extractie in document" },
  { regex: /\b(jij\s+bent\s+nu|you\s+are\s+now|act\s+as)\b/i, label: "Rolherdefiniëring in document" },
  { regex: /voer\s+(de\s+volgende|onderstaande)\s+opdracht\s+uit/i, label: "Verborgen opdracht in document" },
  { regex: /execute\s+the\s+following\s+(command|instruction)/i, label: "Hidden command in document" },
  { regex: /verwijder\s+(je\s+)?(beveiliging|beperkingen)/i, label: "Beveiligingsverwijdering in document" },
  { regex: /\[\[SYSTEM\]\]|\[INST\]|<\|system\|>/i, label: "LLM control tokens in document" },
  { regex: /<\s*script\b[^>]*>/i, label: "Script-tag in document" },
  { regex: /\bexfiltrate\b|\bdata\s+theft\b/i, label: "Data-exfiltratie in document" },
];

export interface DocumentInjectieScan {
  injectieGedetecteerd: boolean;
  signalen: string[];
  risicoScore: number;
}

export function scanDocumentOpInjectie(tekst: string): DocumentInjectieScan {
  const signalen: string[] = [];
  for (const p of DOCUMENT_INJECTIE_PATRONEN) {
    if (p.regex.test(tekst)) {
      signalen.push(p.label);
    }
  }
  return {
    injectieGedetecteerd: signalen.length > 0,
    signalen,
    risicoScore: signalen.length > 0 ? Math.min(50 + signalen.length * 15, 100) : 0,
  };
}

// ── DB-logging (fire-and-forget) ──────────────────────────────────────────────

export function logPromptScanAsync(
  invoer: PromptScanInvoer,
  resultaat: PromptScanResultaat,
  aiAanroepId?: number | null,
): void {
  const samenvatting = invoer.promptTekst.slice(0, 500);
  db.insert(aiPromptScansTable).values({
    gebruikerId: invoer.gebruikerId ?? null,
    gebruikerNaam: invoer.gebruikerNaam ?? null,
    rol: invoer.rol ?? null,
    module: invoer.module,
    functie: invoer.functie ?? null,
    promptSamenvatting: samenvatting,
    classificatie: resultaat.classificatie,
    risicoScore: resultaat.risicoScore,
    injectieGedetecteerd: resultaat.injectieGedetecteerd,
    injectieSignalen: resultaat.injectieSignalen.length > 0
      ? (resultaat.injectieSignalen as unknown as Record<string, unknown>[])
      : null,
    beslissing: resultaat.beslissing,
    motivatie: resultaat.motivatie,
    aiAanroepId: aiAanroepId ?? null,
  }).catch((err) => {
    logger.warn({ err }, "AI prompt-scan logging mislukt");
  });
}

export async function logPromptScanEnHaalId(
  invoer: PromptScanInvoer,
  resultaat: PromptScanResultaat,
): Promise<number | null> {
  try {
    const samenvatting = invoer.promptTekst.slice(0, 500);
    const [rij] = await db.insert(aiPromptScansTable).values({
      gebruikerId: invoer.gebruikerId ?? null,
      gebruikerNaam: invoer.gebruikerNaam ?? null,
      rol: invoer.rol ?? null,
      module: invoer.module,
      functie: invoer.functie ?? null,
      promptSamenvatting: samenvatting,
      classificatie: resultaat.classificatie,
      risicoScore: resultaat.risicoScore,
      injectieGedetecteerd: resultaat.injectieGedetecteerd,
      injectieSignalen: resultaat.injectieSignalen.length > 0
        ? (resultaat.injectieSignalen as unknown as Record<string, unknown>[])
        : null,
      beslissing: resultaat.beslissing,
      motivatie: resultaat.motivatie,
      aiAanroepId: null,
    }).returning({ id: aiPromptScansTable.id });
    return rij?.id ?? null;
  } catch (err) {
    logger.warn({ err }, "AI prompt-scan (met id) logging mislukt");
    return null;
  }
}

export async function slaWijzigingsvoorstelOp(
  scanId: number | null,
  invoer: PromptScanInvoer,
  resultaat: PromptScanResultaat,
): Promise<number | null> {
  try {
    const betrokkenModules = [invoer.module].filter(Boolean);
    const impactanalyse = bouwImpactanalyse(invoer.promptTekst, resultaat);
    const [rij] = await db.insert(aiWijzigingsvoorstellenTable).values({
      promptScanId: scanId,
      gebruikerId: invoer.gebruikerId ?? null,
      gebruikerNaam: invoer.gebruikerNaam ?? null,
      rol: invoer.rol ?? null,
      titel: maakVoorstelTitel(invoer.promptTekst),
      beschrijving: invoer.promptTekst.slice(0, 2000),
      impactanalyse,
      betrokkenModules: betrokkenModules as unknown as Record<string, unknown>[],
      risicoNiveau: resultaat.classificatie,
      status: "wacht",
    }).returning({ id: aiWijzigingsvoorstellenTable.id });
    return rij?.id ?? null;
  } catch (err) {
    logger.warn({ err }, "AI wijzigingsvoorstel opslaan mislukt");
    return null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function maakVoorstelTitel(promptTekst: string): string {
  const eerste = promptTekst.trim().split(/[\n.!?]/)[0] ?? promptTekst;
  return eerste.slice(0, 120);
}

function bouwImpactanalyse(promptTekst: string, resultaat: PromptScanResultaat): string {
  const onderdelen: string[] = [
    `Classificatie: ${resultaat.classificatie.toUpperCase()}`,
    `Risicoanalyse: ${resultaat.motivatie}`,
    ``,
    `Beschrijving van het verzoek:`,
    promptTekst.slice(0, 500),
    ``,
    `Gevolgen: Dit verzoek vereist beoordeling door de hoofdbeheerder.`,
    `Uitvoering: Alleen mogelijk via het gecontroleerde ontwikkelproces.`,
    `Stap 1: Impactanalyse en risicoafweging door hoofdbeheerder.`,
    `Stap 2: Ontwikkelopdracht in geïsoleerde ontwikkelomgeving.`,
    `Stap 3: Test en acceptatie.`,
    `Stap 4: Productie-uitrol via goedgekeurd wijzigingsbeheer.`,
  ];
  return onderdelen.join("\n");
}

// ── Exporteer helper voor gateway ─────────────────────────────────────────────

/**
 * Extraheert de gebruikersprompt uit een chat-berichten-array.
 * Neemt de laatste user-bericht als representatieve tekst voor de classificatie.
 */
export function extraheerGebruikersPrompt(
  messages: Array<{ role: string; content: unknown }>,
): string {
  const gebruikersBerichten = messages
    .filter((m) => m.role === "user")
    .map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)));

  if (gebruikersBerichten.length === 0) {
    return messages
      .map((m) => (typeof m.content === "string" ? m.content : ""))
      .join(" ")
      .slice(0, 1000);
  }

  return gebruikersBerichten[gebruikersBerichten.length - 1] ?? "";
}
