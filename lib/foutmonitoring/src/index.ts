/**
 * Centrale privacygrens voor uitgaande foutmonitoring.
 *
 * Deze module kent bewust geen Sentry-SDK. API, browser en mobiel voeren hun
 * SDK-event hier doorheen vóór verzending en krijgen daardoor exact hetzelfde
 * minimale datacontract.
 */

type OnbekendObject = Record<string, unknown>;

const GEVOELIGE_VELDNAMEN = new Set([
  "address",
  "adres",
  "achternaam",
  "api_key",
  "apikey",
  "auth",
  "authorization",
  "bank",
  "bank_account",
  "bankrekening",
  "birthdate",
  "body",
  "bsn",
  "city",
  "client",
  "client_secret",
  "clientsecret",
  "contact",
  "cookie",
  "cookies",
  "customer",
  "data",
  "email",
  "form_data",
  "fullname",
  "geboortedatum",
  "headers",
  "huisnummer",
  "iban",
  "klant",
  "loon",
  "mailadres",
  "mobile",
  "mobiel",
  "naam",
  "name",
  "passcode",
  "password",
  "phone",
  "pin",
  "postcode",
  "postal_code",
  "query",
  "query_string",
  "rekeningnummer",
  "salary",
  "salaris",
  "secret",
  "session",
  "straat",
  "street",
  "telefoon",
  "token",
  "voornaam",
  "wachtwoord",
  "woonplaats",
]);

const VEILIGE_TAGS = new Set([
  "component",
  "handeling",
  "pagina",
  "routing_bewijs",
  "rol",
  "verwijzingscode",
]);

const VEILIGE_NIVEAUS = new Set(["debug", "info", "warning", "error", "fatal"]);
const VEILIGE_METHODEN = new Set(["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]);
const VEILIGE_OMGEVINGEN = new Set([
  "development",
  "preview",
  "production",
  "staging",
  "test",
]);
const VEILIGE_COMPONENTEN = new Set(["api", "firevault", "monteur-app"]);
const VEILIGE_PLATFORMEN = new Set([
  "cocoa",
  "java",
  "javascript",
  "native",
  "node",
  "react-native",
]);
const VEILIGE_ROLLEN = new Set([
  "beheerder",
  "gebruiker",
  "hoofdbeheerder",
  "klant",
  "monteur",
]);
const VEILIGE_FOUTTYPEN = new Set([
  "Error",
  "EvalError",
  "NativeError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TypeError",
  "URIError",
  "UnhandledRejection",
]);

function isObject(waarde: unknown): waarde is OnbekendObject {
  return typeof waarde === "object" && waarde !== null && !Array.isArray(waarde);
}

function normaliseerVeldnaam(veldnaam: string): string {
  return veldnaam
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

export function isGevoeligeVeldnaam(veldnaam: string): boolean {
  const genormaliseerd = normaliseerVeldnaam(veldnaam);
  if (GEVOELIGE_VELDNAMEN.has(genormaliseerd)) return true;
  const delen = genormaliseerd.split("_");
  return delen.some((deel) => GEVOELIGE_VELDNAMEN.has(deel));
}

/**
 * Verwijdert gevoelige velden op iedere diepte. Cyclische waarden worden niet
 * gekopieerd: een foutobject mag de monitoring nooit door serialisatie breken.
 */
export function verwijderGevoeligeVelden(
  waarde: unknown,
  gezien: WeakSet<object> = new WeakSet<object>(),
): unknown {
  if (waarde === null || typeof waarde !== "object") return waarde;
  if (gezien.has(waarde)) return undefined;
  gezien.add(waarde);

  if (Array.isArray(waarde)) {
    return waarde
      .map((item) => verwijderGevoeligeVelden(item, gezien))
      .filter((item) => item !== undefined);
  }

  const resultaat: OnbekendObject = {};
  for (const [sleutel, inhoud] of Object.entries(waarde)) {
    if (isGevoeligeVeldnaam(sleutel)) continue;
    const schoon = verwijderGevoeligeVelden(inhoud, gezien);
    if (schoon !== undefined) resultaat[sleutel] = schoon;
  }
  return resultaat;
}

function veiligKenmerk(waarde: unknown, maxLengte = 120): string | undefined {
  if (typeof waarde !== "string") return undefined;
  const schoon = waarde.trim();
  if (!schoon || schoon.length > maxLengte) return undefined;
  if (!/^[a-zA-Z0-9_.:/@+-]+$/.test(schoon)) return undefined;
  return schoon;
}

function veiligeBoolean(waarde: unknown): boolean | undefined {
  return typeof waarde === "boolean" ? waarde : undefined;
}

function veiligGetal(waarde: unknown): number | undefined {
  return typeof waarde === "number" && Number.isFinite(waarde) ? waarde : undefined;
}

/**
 * Schoont dynamische routewaarden uit een URL of schermpad. Query, fragment,
 * e-mailachtige segmenten, UUID's, numerieke id's en lange tokens verdwijnen.
 */
export function normaliseerMonitoringPad(waarde: unknown): string | undefined {
  if (typeof waarde !== "string") return undefined;
  let pad = waarde.trim().split(/[?#]/, 1)[0] ?? "";
  pad = pad.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i, "");
  pad = pad.replace(/\\/g, "/");
  if (!pad.startsWith("/")) pad = `/${pad}`;

  const segmenten = pad.split("/").filter(Boolean);
  if (segmenten.length === 0) return "/";
  const maximaalStatisch = segmenten[0] === "api" ? 2 : 1;
  const statisch = segmenten.slice(0, maximaalStatisch).map((segment) => {
    let leesbaar = segment;
    try {
      leesbaar = decodeURIComponent(segment);
    } catch {
      return ":scherm";
    }
    return /^[a-zA-Z][a-zA-Z0-9._~-]{0,49}$/.test(leesbaar)
      ? leesbaar
      : ":scherm";
  });
  if (segmenten.length > maximaalStatisch) statisch.push(":scherm");
  return `/${statisch.join("/")}`.slice(0, 160);
}

function veiligBestandspad(waarde: unknown): string | undefined {
  if (typeof waarde !== "string") return undefined;
  const zonderQuery = waarde.split(/[?#]/, 1)[0]?.replace(/\\/g, "/") ?? "";
  const bestandsnaam = zonderQuery.split("/").filter(Boolean).at(-1) ?? "";
  return /^[a-zA-Z][a-zA-Z0-9_.-]{0,119}\.(?:c|cc|cpp|h|hpp|java|js|jsx|kt|m|mjs|mm|swift|ts|tsx)$/.test(
    bestandsnaam,
  )
    ? bestandsnaam
    : undefined;
}

function schoonFrame(frame: unknown): OnbekendObject | undefined {
  if (!isObject(frame)) return undefined;
  const resultaat: OnbekendObject = {};
  const filename = veiligBestandspad(frame["filename"]);
  const lineno = veiligGetal(frame["lineno"]);
  const colno = veiligGetal(frame["colno"]);
  const instructionAddr =
    typeof frame["instruction_addr"] === "string" &&
    /^0x[0-9a-f]{1,32}$/i.test(frame["instruction_addr"])
      ? frame["instruction_addr"]
      : undefined;
  const symbolAddr =
    typeof frame["symbol_addr"] === "string" &&
    /^0x[0-9a-f]{1,32}$/i.test(frame["symbol_addr"])
      ? frame["symbol_addr"]
      : undefined;
  const inApp = veiligeBoolean(frame["in_app"]);

  if (filename) resultaat["filename"] = filename;
  if (lineno !== undefined) resultaat["lineno"] = lineno;
  if (colno !== undefined) resultaat["colno"] = colno;
  if (instructionAddr) resultaat["instruction_addr"] = instructionAddr;
  if (symbolAddr) resultaat["symbol_addr"] = symbolAddr;
  if (inApp !== undefined) resultaat["in_app"] = inApp;
  if (!filename && !instructionAddr && !symbolAddr) return undefined;
  return Object.keys(resultaat).length > 0 ? resultaat : undefined;
}

function schoneStacktrace(stacktrace: unknown): OnbekendObject | undefined {
  if (!isObject(stacktrace) || !Array.isArray(stacktrace["frames"])) return undefined;
  const frames = stacktrace["frames"]
    .map((frame) => schoonFrame(frame))
    .filter((frame): frame is OnbekendObject => frame !== undefined);
  return frames.length > 0 ? { frames } : undefined;
}

function schoneException(exception: unknown): OnbekendObject | undefined {
  if (!isObject(exception) || !Array.isArray(exception["values"])) return undefined;
  const values = exception["values"]
    .map((item): OnbekendObject | undefined => {
      if (!isObject(item)) return undefined;
      const resultaat: OnbekendObject = {
        // Vrije fouttekst kan ieder persoonsgegeven bevatten. Het type en de
        // gestructureerde frames blijven voldoende voor issuegroepering.
        value: "Onverwachte technische fout",
      };
      const type =
        typeof item["type"] === "string" && VEILIGE_FOUTTYPEN.has(item["type"])
          ? item["type"]
          : "Error";
      const stacktrace = schoneStacktrace(item["stacktrace"]);
      if (type) resultaat["type"] = type;
      if (stacktrace) resultaat["stacktrace"] = stacktrace;
      if (isObject(item["mechanism"])) {
        const mechanism: OnbekendObject = {};
        const handled = veiligeBoolean(item["mechanism"]["handled"]);
        if (handled !== undefined) mechanism["handled"] = handled;
        if (Object.keys(mechanism).length > 0) resultaat["mechanism"] = mechanism;
      }
      return resultaat;
    })
    .filter((item): item is OnbekendObject => item !== undefined);
  return values.length > 0 ? { values } : undefined;
}

function schoneThreads(threads: unknown): OnbekendObject | undefined {
  if (!isObject(threads) || !Array.isArray(threads["values"])) return undefined;
  const values = threads["values"]
    .map((item): OnbekendObject | undefined => {
      if (!isObject(item)) return undefined;
      const resultaat: OnbekendObject = {};
      const crashed = veiligeBoolean(item["crashed"]);
      const current = veiligeBoolean(item["current"]);
      const stacktrace = schoneStacktrace(item["stacktrace"]);
      if (crashed !== undefined) resultaat["crashed"] = crashed;
      if (current !== undefined) resultaat["current"] = current;
      if (stacktrace) resultaat["stacktrace"] = stacktrace;
      return Object.keys(resultaat).length > 0 ? resultaat : undefined;
    })
    .filter((item): item is OnbekendObject => item !== undefined);
  return values.length > 0 ? { values } : undefined;
}

function schoneTags(tags: unknown): Record<string, string> | undefined {
  if (!isObject(tags)) return undefined;
  const resultaat: Record<string, string> = {};
  for (const [sleutel, inhoud] of Object.entries(tags)) {
    if (!VEILIGE_TAGS.has(sleutel) || typeof inhoud !== "string") continue;
    let waarde: string | undefined;
    if (sleutel === "pagina") waarde = normaliseerMonitoringPad(inhoud);
    else if (sleutel === "verwijzingscode") {
      waarde = /^FPS-[A-Z0-9]{8}$/.test(inhoud) ? inhoud : undefined;
    } else if (sleutel === "routing_bewijs") {
      waarde = /^[0-9a-f]{64}$/i.test(inhoud) ? inhoud : undefined;
    } else if (sleutel === "component") {
      waarde = VEILIGE_COMPONENTEN.has(inhoud) ? inhoud : undefined;
    } else if (sleutel === "rol") {
      waarde = VEILIGE_ROLLEN.has(inhoud) ? inhoud : undefined;
    } else if (sleutel === "handeling") {
      waarde = /^(?:DELETE|GET|HEAD|OPTIONS|PATCH|POST|PUT):\/[a-zA-Z0-9_./:-]{1,120}$/.test(
        inhoud,
      ) || inhoud === "overig"
        ? inhoud
        : undefined;
    } else {
      waarde = veiligKenmerk(inhoud, 80);
    }
    if (waarde) resultaat[sleutel] = waarde;
  }
  return Object.keys(resultaat).length > 0 ? resultaat : undefined;
}

function schoneGebruiker(user: unknown): { id: string } | undefined {
  if (!isObject(user)) return undefined;
  const id = typeof user["id"] === "number" || typeof user["id"] === "string"
    ? String(user["id"]).trim()
    : "";
  return /^\d{1,18}$/.test(id) ? { id } : undefined;
}

function schoneRequest(request: unknown): OnbekendObject | undefined {
  if (!isObject(request)) return undefined;
  const resultaat: OnbekendObject = {};
  const methode = typeof request["method"] === "string"
    ? request["method"].toUpperCase()
    : "";
  const url = normaliseerMonitoringPad(request["url"]);
  if (VEILIGE_METHODEN.has(methode)) resultaat["method"] = methode;
  if (url) resultaat["url"] = url;
  return Object.keys(resultaat).length > 0 ? resultaat : undefined;
}

function schoneVerzoekContext(contexts: unknown): OnbekendObject | undefined {
  if (!isObject(contexts) || !isObject(contexts["verzoek"])) return undefined;
  const bron = contexts["verzoek"];
  const resultaat: OnbekendObject = {};
  const methodeWaarde = bron["methode"] ?? bron["method"];
  const methode = typeof methodeWaarde === "string" ? methodeWaarde.toUpperCase() : "";
  const pad = normaliseerMonitoringPad(bron["pad"] ?? bron["scherm"]);
  const status = veiligGetal(bron["status"]);
  const handelingInhoud =
    typeof bron["handeling"] === "string" ? bron["handeling"] : "";
  const handeling =
    /^(?:DELETE|GET|HEAD|OPTIONS|PATCH|POST|PUT):\/[a-zA-Z0-9_./:-]{1,120}$/.test(
      handelingInhoud,
    ) || handelingInhoud === "overig"
      ? handelingInhoud
      : undefined;
  if (VEILIGE_METHODEN.has(methode)) resultaat["methode"] = methode;
  if (pad) resultaat["pad"] = pad;
  if (status !== undefined && status >= 100 && status <= 599) resultaat["status"] = status;
  if (handeling) resultaat["handeling"] = handeling;
  return Object.keys(resultaat).length > 0 ? { verzoek: resultaat } : undefined;
}

/**
 * Bouwt een nieuw allowlist-event. Het oorspronkelijke SDK-event wordt niet
 * gemuteerd en onbekende velden overleven de grens niet.
 */
export function maakVeiligMonitoringEvent<E extends OnbekendObject>(event: E): E {
  const veldSchoon = verwijderGevoeligeVelden(event);
  const bron = isObject(veldSchoon) ? veldSchoon : {};
  const resultaat: OnbekendObject = {};

  const eventId =
    typeof bron["event_id"] === "string" &&
    /^[0-9a-f]{32}$/i.test(bron["event_id"])
      ? bron["event_id"]
      : undefined;
  const platform =
    typeof bron["platform"] === "string" &&
    VEILIGE_PLATFORMEN.has(bron["platform"])
      ? bron["platform"]
      : undefined;
  const release =
    typeof bron["release"] === "string" &&
    /^[0-9a-f]{7,64}$/i.test(bron["release"])
      ? bron["release"]
      : undefined;
  const environment =
    typeof bron["environment"] === "string" &&
    VEILIGE_OMGEVINGEN.has(bron["environment"])
      ? bron["environment"]
      : undefined;
  const dist =
    typeof bron["dist"] === "string" && /^\d{1,12}$/.test(bron["dist"])
      ? bron["dist"]
      : undefined;
  const timestamp = veiligGetal(bron["timestamp"]);
  const level = typeof bron["level"] === "string" && VEILIGE_NIVEAUS.has(bron["level"])
    ? bron["level"]
    : undefined;
  const exception = schoneException(bron["exception"]);
  const threads = schoneThreads(bron["threads"]);
  const tags = schoneTags(bron["tags"]);
  const user = schoneGebruiker(bron["user"]);
  const request = schoneRequest(bron["request"]);
  const contexts = schoneVerzoekContext(bron["contexts"]);

  if (eventId) resultaat["event_id"] = eventId;
  if (timestamp !== undefined) resultaat["timestamp"] = timestamp;
  if (platform) resultaat["platform"] = platform;
  if (level) resultaat["level"] = level;
  if (release) resultaat["release"] = release;
  if (environment) resultaat["environment"] = environment;
  if (dist) resultaat["dist"] = dist;
  if (exception) resultaat["exception"] = exception;
  if (threads) resultaat["threads"] = threads;
  if (tags) resultaat["tags"] = tags;
  if (user) resultaat["user"] = user;
  if (request) resultaat["request"] = request;
  if (contexts) resultaat["contexts"] = contexts;

  return resultaat as E;
}
