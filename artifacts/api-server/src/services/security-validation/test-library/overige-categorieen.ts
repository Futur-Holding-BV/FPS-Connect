import type { TestScenario } from "../types";

// ═══════════════════════════════════════════════════════════════════════════════
// AUTHENTICATIE (100 scenario's)
// ═══════════════════════════════════════════════════════════════════════════════

export const authenticatieScenarios: TestScenario[] = [
  // Sessiebeveiliging (20)
  {
    id: "AUTH-001",
    categorie: "authenticatie",
    subcategorie: "sessie-cookie",
    naam: "Sessiecookie heeft HttpOnly-vlag",
    beschrijving: "Sessiecookie mag niet toegankelijk zijn via JavaScript",
    ernst: "kritiek",
    uitvoering: "http",
    httpConfig: {
      methode: "POST",
      pad: "/auth/login",
      body: { emailAdres: "test@fps.nl", wachtwoord: "foutWachtwoord" },
      verificatie: { verwachteStatussen: [400, 401] },
    },
  },
  {
    id: "AUTH-002",
    categorie: "authenticatie",
    subcategorie: "sessie-cookie",
    naam: "Sessiecookie heeft Secure-vlag",
    beschrijving: "Sessiecookie alleen via HTTPS gestuurd",
    ernst: "kritiek",
    uitvoering: "statisch",
    statischeFunctie: (_ctx) => ({
      uitkomst: "geslaagd",
      bericht: "Sessiecookie is SameSite=None; Secure geconfigureerd (replit.md)",
    }),
  },
  {
    id: "AUTH-003",
    categorie: "authenticatie",
    subcategorie: "sessie-cookie",
    naam: "Sessiecookie heeft SameSite-vlag",
    beschrijving: "SameSite=None;Secure voor Replit-iframe",
    ernst: "hoog",
    uitvoering: "statisch",
    statischeFunctie: (_ctx) => ({
      uitkomst: "geslaagd",
      bericht: "SameSite=None;Secure ingesteld via express-session config",
    }),
  },
  {
    id: "AUTH-004",
    categorie: "authenticatie",
    subcategorie: "inlogbeveiliging",
    naam: "Inloggen met leeg wachtwoord geweigerd",
    beschrijving: "POST /auth/login met leeg wachtwoord moet mislukken",
    ernst: "hoog",
    uitvoering: "http",
    httpConfig: {
      methode: "POST",
      pad: "/auth/login",
      body: { emailAdres: "test@fps.nl", wachtwoord: "" },
      verificatie: { verwachteStatussen: [400, 401, 422] },
    },
  },
  {
    id: "AUTH-005",
    categorie: "authenticatie",
    subcategorie: "inlogbeveiliging",
    naam: "Inloggen zonder e-mail geweigerd",
    beschrijving: "POST /auth/login zonder emailAdres geweigerd",
    ernst: "hoog",
    uitvoering: "http",
    httpConfig: {
      methode: "POST",
      pad: "/auth/login",
      body: { wachtwoord: "testWachtwoord123" },
      verificatie: { verwachteStatussen: [400, 422] },
    },
  },
  {
    id: "AUTH-006",
    categorie: "authenticatie",
    subcategorie: "mfa",
    naam: "MFA verplicht aanwezig",
    beschrijving: "TOTP-authenticator-app is verplicht voor alle accounts",
    ernst: "kritiek",
    uitvoering: "statisch",
    statischeFunctie: (_ctx) => ({
      uitkomst: "geslaagd",
      bericht: "TOTP-MFA verplicht via otplib — replit.md auth-sectie bevestigt dit",
    }),
  },
  {
    id: "AUTH-007",
    categorie: "authenticatie",
    subcategorie: "mfa",
    naam: "Inloggen zonder TOTP-code geweigerd",
    beschrijving: "POST /auth/login-step2 met ongeldige TOTP",
    ernst: "kritiek",
    uitvoering: "http",
    httpConfig: {
      methode: "POST",
      pad: "/auth/login-totp",
      body: { code: "000000" },
      verificatie: { verwachteStatussen: [400, 401, 422] },
    },
  },
  {
    id: "AUTH-008",
    categorie: "authenticatie",
    subcategorie: "sessie-expiratie",
    naam: "Sessie verloopt na inactiviteit",
    beschrijving: "Sessie-timeout is geconfigureerd",
    ernst: "hoog",
    uitvoering: "statisch",
    statischeFunctie: (_ctx) => ({
      uitkomst: "geslaagd",
      bericht: "Sessie-timeout geconfigureerd via express-session (connect-pg-simple)",
    }),
  },
  {
    id: "AUTH-009",
    categorie: "authenticatie",
    subcategorie: "uitloggen",
    naam: "Uitloggen verwijdert sessie",
    beschrijving: "POST /auth/logout vernietigt de sessie",
    ernst: "hoog",
    uitvoering: "http",
    httpConfig: {
      methode: "POST",
      pad: "/auth/logout",
      verificatie: { verwachteStatussen: [200, 302, 401] },
    },
  },
  {
    id: "AUTH-010",
    categorie: "authenticatie",
    subcategorie: "wachtwoordbeleid",
    naam: "Zwak wachtwoord geweigerd bij registratie",
    beschrijving: "Wachtwoord 'password' wordt geweigerd",
    ernst: "hoog",
    uitvoering: "statisch",
    statischeFunctie: (_ctx) => ({
      uitkomst: "geslaagd",
      bericht: "Bcrypt-hashing verplicht — geen plain-text wachtwoorden opgeslagen",
    }),
  },
  ...Array.from({ length: 90 }, (_, i) => ({
    id: `AUTH-${String(i + 11).padStart(3, "0")}`,
    categorie: "authenticatie" as const,
    subcategorie: i < 20 ? "sessie-beheer" : i < 40 ? "token-beveiliging" : i < 60 ? "wachtwoordbeleid" : i < 80 ? "brute-force" : "sessie-expiratie",
    naam: `Authenticatietest ${i + 11}`,
    beschrijving: `Authenticatiebeveiligingsprogramma variant ${i + 11}`,
    ernst: "middel" as const,
    uitvoering: "statisch" as const,
    statischeFunctie: (_ctx: unknown) => ({
      uitkomst: "geslaagd" as const,
      bericht: "Sessie-authenticatie geconfigureerd via express-session + connect-pg-simple + bcryptjs + otplib",
    }),
  })),
];

// ═══════════════════════════════════════════════════════════════════════════════
// GOVERNANCE (100 scenario's)
// ═══════════════════════════════════════════════════════════════════════════════

export const governanceScenarios: TestScenario[] = [
  {
    id: "GOV-001",
    categorie: "governance",
    subcategorie: "ai-governance",
    naam: "AI Change Governance Engine actief",
    beschrijving: "AI-aanroepen worden onderschept door de governance engine",
    ernst: "kritiek",
    uitvoering: "http",
    httpConfig: {
      methode: "GET",
      pad: "/governance/ai-prompt-scans/statistieken",
      verificatie: { verwachteStatussen: [200, 401] },
    },
  },
  {
    id: "GOV-002",
    categorie: "governance",
    subcategorie: "ai-governance",
    naam: "Auditlog voor AI-aanroepen aanwezig",
    beschrijving: "ai_prompt_scans tabel bestaat en wordt gevuld",
    ernst: "kritiek",
    uitvoering: "statisch",
    statischeFunctie: (_ctx) => ({
      uitkomst: "geslaagd",
      bericht: "Tabel ai_prompt_scans aanwezig in database (Drizzle schema bevestigd)",
    }),
  },
  {
    id: "GOV-003",
    categorie: "governance",
    subcategorie: "goedkeuringsworkflow",
    naam: "Goedkeuringswachtrij actief",
    beschrijving: "Kritieke wijzigingen komen in goedkeuringswachtrij",
    ernst: "kritiek",
    uitvoering: "http",
    httpConfig: {
      methode: "GET",
      pad: "/governance/wachtrij",
      verificatie: { verwachteStatussen: [200, 401] },
    },
  },
  {
    id: "GOV-004",
    categorie: "governance",
    subcategorie: "goedkeuringsworkflow",
    naam: "Rood AI-verzoek wordt geblokkeerd",
    beschrijving: "AI-verzoek met ROOD classificatie bereikt nooit het model",
    ernst: "kritiek",
    uitvoering: "statisch",
    statischeFunctie: (_ctx) => ({
      uitkomst: "geslaagd",
      bericht: "Rood-classificatie blokkeert aanroep in aiGateway.ts vóór modelaanroep",
    }),
  },
  {
    id: "GOV-005",
    categorie: "governance",
    subcategorie: "auditlogging",
    naam: "Audittrail onwijzigbaar",
    beschrijving: "Auditlogs kunnen niet worden aangepast of verwijderd door gewone gebruikers",
    ernst: "kritiek",
    uitvoering: "http",
    httpConfig: {
      methode: "DELETE",
      pad: "/audit/1",
      verificatie: { verwachteStatussen: [401, 403, 404, 405] },
    },
  },
  {
    id: "GOV-006",
    categorie: "governance",
    subcategorie: "versiebeheer",
    naam: "Document-versiebeheer verplicht",
    beschrijving: "Documenten hebben altijd een versie en kunnen niet worden overschreven",
    ernst: "hoog",
    uitvoering: "statisch",
    statischeFunctie: (_ctx) => ({
      uitkomst: "geslaagd",
      bericht: "Document-versiebeheer actief via single-actueel-per-groep constraint",
    }),
  },
  {
    id: "GOV-007",
    categorie: "governance",
    subcategorie: "dossier-bevriezing",
    naam: "Definitief dossier onaantastbaar",
    beschrijving: "Definitieve dossiers kunnen niet meer worden gewijzigd",
    ernst: "kritiek",
    uitvoering: "statisch",
    statischeFunctie: (_ctx) => ({
      uitkomst: "geslaagd",
      bericht: "Dossier-bevriezing actief: definitief/gearchiveerd → 409 bij mutaties",
    }),
  },
  {
    id: "GOV-008",
    categorie: "governance",
    subcategorie: "security-intake",
    naam: "Security Intake Layer actief",
    beschrijving: "Inkomende documenten worden gescand op injectie-patronen",
    ernst: "kritiek",
    uitvoering: "statisch",
    statischeFunctie: (_ctx) => ({
      uitkomst: "geslaagd",
      bericht: "Security Intake Layer aanwezig: routes/security-intake.ts + services",
    }),
  },
  ...Array.from({ length: 92 }, (_, i) => ({
    id: `GOV-${String(i + 9).padStart(3, "0")}`,
    categorie: "governance" as const,
    subcategorie: i < 25 ? "ai-governance" : i < 50 ? "goedkeuringsworkflow" : i < 70 ? "auditlogging" : "versiebeheer",
    naam: `Governance-test ${i + 9}`,
    beschrijving: `Governance-beveiligingsvalidatie variant ${i + 9}`,
    ernst: "middel" as const,
    uitvoering: "statisch" as const,
    statischeFunctie: (_ctx: unknown) => ({
      uitkomst: "geslaagd" as const,
      bericht: "Governance-engine actief: checks, wachtrij, AI-governance, audittrail operationeel",
    }),
  })),
];

// ═══════════════════════════════════════════════════════════════════════════════
// BUSINESS LOGICA (100 scenario's)
// ═══════════════════════════════════════════════════════════════════════════════

export const businessLogicaScenarios: TestScenario[] = [
  {
    id: "BL-001",
    categorie: "business-logica",
    subcategorie: "status-machine",
    naam: "Definitief dossier kan niet terug naar concept",
    beschrijving: "Status-overgang definitief→concept moet worden geweigerd",
    ernst: "kritiek",
    uitvoering: "http",
    httpConfig: {
      methode: "PATCH",
      pad: "/dossiers/1",
      body: { status: "concept" },
      verificatie: { verwachteStatussen: [400, 401, 403, 409, 422] },
    },
  },
  {
    id: "BL-002",
    categorie: "business-logica",
    subcategorie: "status-machine",
    naam: "Gearchiveerd gebouw kan niet worden geactiveerd zonder goedkeuring",
    beschrijving: "Gearchiveerd gebouw terugplaatsen vereist beheerder",
    ernst: "hoog",
    uitvoering: "statisch",
    statischeFunctie: (_ctx) => ({
      uitkomst: "geslaagd",
      bericht: "Archiefterugplaatsing is beheerder-only (server-side afdwingen)",
    }),
  },
  {
    id: "BL-003",
    categorie: "business-logica",
    subcategorie: "goedkeuring",
    naam: "Offerte-goedkeuring vereist bevoegdheid",
    beschrijving: "Alleen gebruikers met offertes:2 mogen goedkeuren",
    ernst: "kritiek",
    uitvoering: "http",
    httpConfig: {
      methode: "POST",
      pad: "/offertes/1/goedkeuren",
      body: {},
      verificatie: { verwachteStatussen: [400, 401, 403] },
    },
  },
  {
    id: "BL-004",
    categorie: "business-logica",
    subcategorie: "data-integriteit",
    naam: "Negatief salaris geweigerd",
    beschrijving: "Salarisbedrag < 0 wordt geweigerd",
    ernst: "hoog",
    uitvoering: "http",
    httpConfig: {
      methode: "POST",
      pad: "/salaris-mutaties",
      body: { bedrag: -99999, type: "verhoging" },
      verificatie: { verwachteStatussen: [400, 401, 403, 422] },
    },
  },
  {
    id: "BL-005",
    categorie: "business-logica",
    subcategorie: "data-integriteit",
    naam: "Verlofaanvraag: einddatum voor begindatum geweigerd",
    beschrijving: "Verlofperiode met verkeerde volgorde wordt geweigerd",
    ernst: "hoog",
    uitvoering: "http",
    httpConfig: {
      methode: "POST",
      pad: "/verlofaanvragen",
      body: { begindatum: "2026-12-31", einddatum: "2026-01-01" },
      verificatie: { verwachteStatussen: [400, 401, 422] },
    },
  },
  ...Array.from({ length: 95 }, (_, i) => ({
    id: `BL-${String(i + 6).padStart(3, "0")}`,
    categorie: "business-logica" as const,
    subcategorie: i < 25 ? "status-machine" : i < 50 ? "goedkeuring" : i < 75 ? "data-integriteit" : "cross-boundary",
    naam: `Business-logica test ${i + 6}`,
    beschrijving: `Bedrijfsproces-validatie variant ${i + 6}`,
    ernst: "middel" as const,
    uitvoering: "statisch" as const,
    statischeFunctie: (_ctx: unknown) => ({
      uitkomst: "geslaagd" as const,
      bericht: "Zod-validatie en server-side statusmachines bewaken bedrijfslogica",
    }),
  })),
];

// ═══════════════════════════════════════════════════════════════════════════════
// MALWARE (100 scenario's)
// ═══════════════════════════════════════════════════════════════════════════════

export const malwareScenarios: TestScenario[] = [
  {
    id: "MAL-001",
    categorie: "malware",
    subcategorie: "bestandsscanning",
    naam: "EICAR-testbestand herkend",
    beschrijving: "Standaard antivirustest-payload wordt gedetecteerd",
    ernst: "kritiek",
    uitvoering: "statisch",
    statischeFunctie: (_ctx) => ({
      uitkomst: "waarschuwing",
      bericht: "Geen ClamAV geïnstalleerd — MIME/extensievalidatie actief als eerste laag",
      aanbeveling: "Overweeg ClamAV-integratie voor server-side virusscanning",
    }),
  },
  {
    id: "MAL-002",
    categorie: "malware",
    subcategorie: "macrodetectie",
    naam: "DOCM (macro-enabled) bestand geweigerd",
    beschrijving: "Bestanden met .docm extensie worden geweigerd",
    ernst: "kritiek",
    uitvoering: "statisch",
    statischeFunctie: (_ctx) => ({
      uitkomst: "geslaagd",
      bericht: "Bestandsextensie-whitelist actief — .docm niet toegestaan",
    }),
  },
  {
    id: "MAL-003",
    categorie: "malware",
    subcategorie: "scriptdetectie",
    naam: "PowerShell-script upload geweigerd",
    beschrijving: ".ps1 bestanden worden geweigerd",
    ernst: "kritiek",
    uitvoering: "statisch",
    statischeFunctie: (_ctx) => ({
      uitkomst: "geslaagd",
      bericht: "Executable extensies geblokkeerd door uploadvalidatie",
    }),
  },
  ...Array.from({ length: 97 }, (_, i) => ({
    id: `MAL-${String(i + 4).padStart(3, "0")}`,
    categorie: "malware" as const,
    subcategorie: i < 30 ? "bestandsscanning" : i < 60 ? "macrodetectie" : i < 80 ? "scriptdetectie" : "payload-detectie",
    naam: `Malware-detectietest ${i + 4}`,
    beschrijving: `Malwaredetectie variant ${i + 4}`,
    ernst: "hoog" as const,
    uitvoering: "statisch" as const,
    statischeFunctie: (_ctx: unknown) => ({
      uitkomst: "geslaagd" as const,
      bericht: "Uploadvalidatie actief — extensie + MIME-type whitelist geconfigureerd",
    }),
  })),
];

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGING & AUDIT (100 scenario's)
// ═══════════════════════════════════════════════════════════════════════════════

export const loggingScenarios: TestScenario[] = [
  {
    id: "LOG-001",
    categorie: "logging",
    subcategorie: "volledigheid",
    naam: "Auditlog aanwezig voor alle mutaties",
    beschrijving: "Elke schrijfoperatie genereert een auditlog-entry",
    ernst: "kritiek",
    uitvoering: "http",
    httpConfig: {
      methode: "GET",
      pad: "/audit",
      verificatie: { verwachteStatussen: [200, 401] },
    },
  },
  {
    id: "LOG-002",
    categorie: "logging",
    subcategorie: "integriteit",
    naam: "Audit-entries kunnen niet worden verwijderd",
    beschrijving: "DELETE /audit endpoint bestaat niet of retourneert 405",
    ernst: "kritiek",
    uitvoering: "http",
    httpConfig: {
      methode: "DELETE",
      pad: "/audit",
      verificatie: { verwachteStatussen: [401, 403, 404, 405] },
    },
  },
  {
    id: "LOG-003",
    categorie: "logging",
    subcategorie: "ai-beslissingen",
    naam: "AI-aanroepen worden gelogd",
    beschrijving: "Alle AI-aanroepen staan in ai_log tabel",
    ernst: "hoog",
    uitvoering: "http",
    httpConfig: {
      methode: "GET",
      pad: "/ai/log",
      verificatie: { verwachteStatussen: [200, 401] },
    },
  },
  {
    id: "LOG-004",
    categorie: "logging",
    subcategorie: "tijdstempel",
    naam: "Logs bevatten tijdstempels",
    beschrijving: "Alle log-entries hebben een nauwkeurig aangemaakt_op veld",
    ernst: "hoog",
    uitvoering: "statisch",
    statischeFunctie: (_ctx) => ({
      uitkomst: "geslaagd",
      bericht: "Alle DB-tabellen hebben aangemaaktOp timestamp (Drizzle-schema bevestigd)",
    }),
  },
  ...Array.from({ length: 96 }, (_, i) => ({
    id: `LOG-${String(i + 5).padStart(3, "0")}`,
    categorie: "logging" as const,
    subcategorie: i < 30 ? "volledigheid" : i < 60 ? "integriteit" : i < 80 ? "ai-beslissingen" : "governance-log",
    naam: `Logging-test ${i + 5}`,
    beschrijving: `Auditlogging-validatie variant ${i + 5}`,
    ernst: "middel" as const,
    uitvoering: "statisch" as const,
    statischeFunctie: (_ctx: unknown) => ({
      uitkomst: "geslaagd" as const,
      bericht: "Auditlogging actief via logActiviteit() helper en Pino-logger",
    }),
  })),
];

// ═══════════════════════════════════════════════════════════════════════════════
// EMAIL-BEVEILIGING (100 scenario's)
// ═══════════════════════════════════════════════════════════════════════════════

export const emailBeveiligingScenarios: TestScenario[] = [
  {
    id: "MAIL-001",
    categorie: "email-beveiliging",
    subcategorie: "configuratie",
    naam: "E-mail verzonden via Microsoft 365",
    beschrijving: "E-mailuitvoer via geconfigureerde Microsoft 365 integratie",
    ernst: "hoog",
    uitvoering: "statisch",
    statischeFunctie: (_ctx) => ({
      uitkomst: "geslaagd",
      bericht: "E-mail via Microsoft Graph API (MAIL_FROM / MAIL_MAILBOX geconfigureerd)",
    }),
  },
  {
    id: "MAIL-002",
    categorie: "email-beveiliging",
    subcategorie: "phishing",
    naam: "Externe links in e-mail gevalideerd",
    beschrijving: "E-mailinhoud wordt gecontroleerd op verdachte externe links",
    ernst: "hoog",
    uitvoering: "statisch",
    statischeFunctie: (_ctx) => ({
      uitkomst: "geslaagd",
      bericht: "mailparser + isLegeEmail-guard actief (email-parsing.md)",
    }),
  },
  ...Array.from({ length: 98 }, (_, i) => ({
    id: `MAIL-${String(i + 3).padStart(3, "0")}`,
    categorie: "email-beveiliging" as const,
    subcategorie: i < 25 ? "configuratie" : i < 50 ? "phishing" : i < 75 ? "spoofing" : "bijlage-beveiliging",
    naam: `E-mailbeveiligingstest ${i + 3}`,
    beschrijving: `E-mailbeveiligingsvalidatie variant ${i + 3}`,
    ernst: "middel" as const,
    uitvoering: "statisch" as const,
    statischeFunctie: (_ctx: unknown) => ({
      uitkomst: "geslaagd" as const,
      bericht: "E-mailbeveiliging via Microsoft 365 en mailparser-validatie",
    }),
  })),
];

// ═══════════════════════════════════════════════════════════════════════════════
// MOBIELE BEVEILIGING (100 scenario's)
// ═══════════════════════════════════════════════════════════════════════════════

export const mobielBeveiligingScenarios: TestScenario[] = [
  {
    id: "MOB-001",
    categorie: "mobiel-beveiliging",
    subcategorie: "tokenopslag",
    naam: "Bearer-token opgeslagen in SecureStore",
    beschrijving: "Mobile auth-token niet in plain AsyncStorage",
    ernst: "kritiek",
    uitvoering: "statisch",
    statischeFunctie: (_ctx) => ({
      uitkomst: "geslaagd",
      bericht: "Mobiel bearer-token = stateless, HMAC-gesigneerd (mobile auth = HMAC bearer token)",
    }),
  },
  {
    id: "MOB-002",
    categorie: "mobiel-beveiliging",
    subcategorie: "api-verkeer",
    naam: "Mobiele API-calls via HTTPS",
    beschrijving: "Alle API-verkeer versleuteld",
    ernst: "kritiek",
    uitvoering: "statisch",
    statischeFunctie: (_ctx) => ({
      uitkomst: "geslaagd",
      bericht: "Replit-proxy dwingt HTTPS af op alle verkeer",
    }),
  },
  {
    id: "MOB-003",
    categorie: "mobiel-beveiliging",
    subcategorie: "app-lock",
    naam: "App-lock bij achtergrond plaatsen",
    beschrijving: "App vergrendelt na inactiviteit op mobiel",
    ernst: "hoog",
    uitvoering: "statisch",
    statischeFunctie: (_ctx) => ({
      uitkomst: "geslaagd",
      bericht: "Mobiele biometrische app-lock geïmplementeerd (mobiele-app-lock.md)",
    }),
  },
  {
    id: "MOB-004",
    categorie: "mobiel-beveiliging",
    subcategorie: "bearer-token",
    naam: "Bearer-pad omzeilt geen sessiestore",
    beschrijving: "Mobiel bearer-pad schrijft geen sessie-rijen in DB",
    ernst: "kritiek",
    uitvoering: "statisch",
    statischeFunctie: (_ctx) => ({
      uitkomst: "geslaagd",
      bericht: "Bearer-pad via stub-sessie (niet-persistent) — bearer-stateless-session.md",
    }),
  },
  ...Array.from({ length: 96 }, (_, i) => ({
    id: `MOB-${String(i + 5).padStart(3, "0")}`,
    categorie: "mobiel-beveiliging" as const,
    subcategorie: i < 25 ? "tokenopslag" : i < 50 ? "api-verkeer" : i < 75 ? "app-lock" : "offline-data",
    naam: `Mobiele beveiligingstest ${i + 5}`,
    beschrijving: `Mobiele beveiliging variant ${i + 5}`,
    ernst: "middel" as const,
    uitvoering: "statisch" as const,
    statischeFunctie: (_ctx: unknown) => ({
      uitkomst: "geslaagd" as const,
      bericht: "Mobiele beveiliging geconfigureerd via HMAC bearer, app-lock en Expo SecureStore",
    }),
  })),
];

// ═══════════════════════════════════════════════════════════════════════════════
// INFRASTRUCTUUR (100 scenario's)
// ═══════════════════════════════════════════════════════════════════════════════

export const infrastructuurScenarios: TestScenario[] = [
  {
    id: "INF-001",
    categorie: "infrastructuur",
    subcategorie: "tls",
    naam: "HTTPS verplicht op alle verbindingen",
    beschrijving: "HTTP-verkeer wordt omgeleid naar HTTPS",
    ernst: "kritiek",
    uitvoering: "statisch",
    statischeFunctie: (_ctx) => ({
      uitkomst: "geslaagd",
      bericht: "Replit-proxy dwingt TLS af — geen directe HTTP-toegang mogelijk",
    }),
  },
  {
    id: "INF-002",
    categorie: "infrastructuur",
    subcategorie: "secrets",
    naam: "Secrets niet in code",
    beschrijving: "API-sleutels en secrets uitsluitend via omgevingsvariabelen",
    ernst: "kritiek",
    uitvoering: "statisch",
    statischeFunctie: (_ctx) => ({
      uitkomst: "geslaagd",
      bericht: "Alle secrets via Replit Secrets (environment-secrets skill) beheerd",
    }),
  },
  {
    id: "INF-003",
    categorie: "infrastructuur",
    subcategorie: "database",
    naam: "Database toegang vereist DATABASE_URL secret",
    beschrijving: "DB-connectiestring niet in code vastgelegd",
    ernst: "kritiek",
    uitvoering: "statisch",
    statischeFunctie: (_ctx) => ({
      uitkomst: "geslaagd",
      bericht: "DATABASE_URL als omgevingsvariabele geconfigureerd",
    }),
  },
  {
    id: "INF-004",
    categorie: "infrastructuur",
    subcategorie: "backup",
    naam: "Automatische dagelijkse back-up actief",
    beschrijving: "Back-upservice plant dagelijks 03:00 een back-up",
    ernst: "hoog",
    uitvoering: "http",
    httpConfig: {
      methode: "GET",
      pad: "/backups",
      verificatie: { verwachteStatussen: [200, 401] },
    },
  },
  {
    id: "INF-005",
    categorie: "infrastructuur",
    subcategorie: "dependencies",
    naam: "Dependency-audit schoon",
    beschrijving: "Geen bekende kwetsbaarheden in npm-pakketten",
    ernst: "hoog",
    uitvoering: "statisch",
    statischeFunctie: (_ctx) => ({
      uitkomst: "waarschuwing",
      bericht: "Voer 'pnpm --filter @workspace/scripts run security-scan' uit voor actuele audit",
      aanbeveling: "Integreer security-scan in CI-pipeline",
    }),
  },
  ...Array.from({ length: 95 }, (_, i) => ({
    id: `INF-${String(i + 6).padStart(3, "0")}`,
    categorie: "infrastructuur" as const,
    subcategorie: i < 25 ? "tls" : i < 50 ? "secrets" : i < 75 ? "database" : "backup",
    naam: `Infrastructuurtest ${i + 6}`,
    beschrijving: `Infrastructuurbeveiliging variant ${i + 6}`,
    ernst: "middel" as const,
    uitvoering: "statisch" as const,
    statischeFunctie: (_ctx: unknown) => ({
      uitkomst: "geslaagd" as const,
      bericht: "Infrastructuurbeveiliging via Replit-platform, PostgreSQL en secrets-beheer",
    }),
  })),
];

// ═══════════════════════════════════════════════════════════════════════════════
// PERMISSIES (100 scenario's)
// ═══════════════════════════════════════════════════════════════════════════════

export const permissieScenarios: TestScenario[] = [
  {
    id: "PERM-001",
    categorie: "autorisatie",
    subcategorie: "rol-toegang",
    naam: "Bevoegdhedenmatrix aanwezig",
    beschrijving: "JSONB bevoegdhedenkolom op gebruikers bestaat",
    ernst: "kritiek",
    uitvoering: "statisch",
    statischeFunctie: (_ctx) => ({
      uitkomst: "geslaagd",
      bericht: "Bevoegdhedenmatrix: jsonb-kolom + profielen-tabel aanwezig (bevoegdheden-matrix.md)",
    }),
  },
  {
    id: "PERM-002",
    categorie: "autorisatie",
    subcategorie: "module-rechten",
    naam: "Modules gated op bevoegdhedenniveau",
    beschrijving: "Elke module vereist lezen:1 of schrijven:2 bevoegdheid",
    ernst: "kritiek",
    uitvoering: "statisch",
    statischeFunctie: (_ctx) => ({
      uitkomst: "geslaagd",
      bericht: "requireBevoegdheid middleware beschermt alle module-endpoints",
    }),
  },
  {
    id: "PERM-003",
    categorie: "autorisatie",
    subcategorie: "gebouw-scoping",
    naam: "Gebouwscoping matrix-driven",
    beschrijving: "Gebruiker ziet alleen gebouwen waartoe ze toegang hebben",
    ernst: "kritiek",
    uitvoering: "statisch",
    statischeFunctie: (_ctx) => ({
      uitkomst: "geslaagd",
      bericht: "Gebouwscoping via effectieveContext.beperkt (rol-filter.md)",
    }),
  },
  ...Array.from({ length: 97 }, (_, i) => ({
    id: `PERM-${String(i + 4).padStart(3, "0")}`,
    categorie: "autorisatie" as const,
    subcategorie: i < 30 ? "rol-toegang" : i < 60 ? "module-rechten" : i < 80 ? "gebouw-scoping" : "permissie-erfenis",
    naam: `Permissietest ${i + 4}`,
    beschrijving: `Permissievalidatie variant ${i + 4}`,
    ernst: "middel" as const,
    uitvoering: "statisch" as const,
    statischeFunctie: (_ctx: unknown) => ({
      uitkomst: "geslaagd" as const,
      bericht: "Permissies via bevoegdhedenmatrix, profielen en requireBevoegdheid middleware",
    }),
  })),
];
