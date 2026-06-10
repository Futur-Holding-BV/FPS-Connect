import { simpleParser } from "mailparser";
import MsgReaderImport from "@kenjiuno/msgreader";
import type { EmailContactpersoon } from "@workspace/db";
import { logger } from "../lib/logger";
import { heeftOpenAi, maakOpenAiClient } from "../lib/openai";

// esbuild bundelt dit pakket als ESM en wikkelt de CJS-default in een
// namespace-object, waardoor de echte constructor op `.default.default` belandt.
// Vandaar de robuuste resolutie hieronder (werkt ook bij directe default).
const MsgReader = ((MsgReaderImport as unknown as { default?: unknown }).default ??
  MsgReaderImport) as new (ab: ArrayBuffer) => {
  getFileData: () => Record<string, unknown>;
  getAttachment: (i: number) => { fileName?: string; content?: Uint8Array };
};

export interface GeparseerdeBijlage {
  bestandsnaam: string;
  contentType: string | null;
  inhoud: Buffer;
}

export interface GeparseerdeEmail {
  afzender: string | null;
  ontvanger: string | null;
  onderwerp: string | null;
  datum: string | null;
  inhoudTekst: string | null;
  bijlagen: GeparseerdeBijlage[];
}

export interface GeparseerdeEmailMetId extends GeparseerdeEmail {
  id: number;
}

export interface EmailAiResultaat {
  omschrijving: string | null;
  naw: string | null;
  contactinfo: string | null;
  tekeningen: string | null;
  actiepunten: string | null;
  relevant: boolean | null;
  relevantReden: string | null;
}

function strOfNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function isMsg(bestandsnaam: string): boolean {
  return bestandsnaam.toLowerCase().endsWith(".msg");
}

const MIME_PER_EXTENSIE: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
  svg: "image/svg+xml",
  dwg: "image/vnd.dwg",
  dxf: "image/vnd.dxf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt: "text/plain",
  csv: "text/csv",
  zip: "application/zip",
};

function mimeUitBestandsnaam(bestandsnaam: string): string | null {
  const ext = bestandsnaam.split(".").pop()?.toLowerCase();
  return ext ? (MIME_PER_EXTENSIE[ext] ?? null) : null;
}

const HTML_ENTITEITEN: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  euro: "€",
  copy: "©",
  reg: "®",
  trade: "™",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  bull: "•",
  middot: "·",
  laquo: "«",
  raquo: "»",
  deg: "°",
};

function veiligeCodePoint(n: number): string {
  return Number.isInteger(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
}

function decodeEntiteiten(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => veiligeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => veiligeCodePoint(parseInt(d, 10)))
    .replace(
      /&([a-zA-Z][a-zA-Z0-9]*);/g,
      (m, naam: string) => HTML_ENTITEITEN[naam] ?? HTML_ENTITEITEN[naam.toLowerCase()] ?? m,
    );
}

// Zet HTML-e-mailinhoud om naar leesbare platte tekst. Verwijdert niet-zichtbare
// blokken (style/script/head) volledig — anders lekt de CSS als onleesbare tekst
// in de berichttekst — zet blokelementen om naar regeleindes en decodeert entiteiten.
function htmlNaarTekst(html: string): string {
  let t = html;
  t = t.replace(/<!--[\s\S]*?-->/g, " ");
  t = t.replace(/<(style|script|head|title)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  t = t.replace(/<br\s*\/?>/gi, "\n");
  t = t.replace(/<\/td>/gi, "\t");
  t = t.replace(
    /<\/(p|div|tr|li|h[1-6]|table|ul|ol|blockquote|section|article|header|footer)>/gi,
    "\n",
  );
  t = t.replace(/<[^>]+>/g, "");
  t = decodeEntiteiten(t);
  t = t.replace(/\r\n?/g, "\n");
  t = t.replace(/[ \t\f\v]+/g, " ");
  t = t.replace(/ *\n */g, "\n");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

async function parseEml(buffer: Buffer): Promise<GeparseerdeEmail> {
  const mail = await simpleParser(buffer);
  const afzender = mail.from?.text ?? null;
  const ontvangerVeld = Array.isArray(mail.to) ? mail.to[0] : mail.to;
  const ontvanger = ontvangerVeld?.text ?? null;
  const bijlagen: GeparseerdeBijlage[] = (mail.attachments ?? [])
    .filter((a) => a.content && (a.filename || a.contentType))
    .map((a, i) => {
      const naam = a.filename || `bijlage-${i + 1}`;
      return {
        bestandsnaam: naam,
        contentType: a.contentType ?? mimeUitBestandsnaam(naam),
        inhoud: a.content as Buffer,
      };
    });
  let inhoudTekst: string | null = strOfNull(mail.text);
  if (!inhoudTekst && mail.html) {
    inhoudTekst = strOfNull(htmlNaarTekst(String(mail.html)));
  }
  return {
    afzender,
    ontvanger,
    onderwerp: mail.subject ?? null,
    datum: mail.date ? mail.date.toISOString() : null,
    inhoudTekst,
    bijlagen,
  };
}

function parseMsg(buffer: Buffer): GeparseerdeEmail {
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
  const reader = new MsgReader(arrayBuffer);
  const data = reader.getFileData() as Record<string, any>;
  const recipients: any[] = Array.isArray(data.recipients) ? data.recipients : [];
  const ontvanger = recipients
    .map((r) => r.email || r.name)
    .filter(Boolean)
    .join(", ") || null;
  const afzender =
    [data.senderName, data.senderEmail].filter(Boolean).join(" ") || data.senderEmail || data.senderName || null;

  const bijlagen: GeparseerdeBijlage[] = [];
  const attachments: any[] = Array.isArray(data.attachments) ? data.attachments : [];
  attachments.forEach((att, i) => {
    try {
      const file = reader.getAttachment(i) as { fileName?: string; content?: Uint8Array };
      if (file?.content) {
        const naam = file.fileName || att.fileName || att.fileNameShort || `bijlage-${i + 1}`;
        const ruweTag = typeof att.attachMimeTag === "string" ? att.attachMimeTag.trim() : "";
        const mimeTag = /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(ruweTag) ? ruweTag : null;
        bijlagen.push({
          bestandsnaam: naam,
          contentType: mimeTag ?? mimeUitBestandsnaam(naam),
          inhoud: Buffer.from(file.content),
        });
      }
    } catch (err) {
      logger.warn({ err }, "Kon .msg-bijlage niet lezen");
    }
  });

  let inhoudTekst = strOfNull(data.body);
  if (!inhoudTekst && typeof data.bodyHTML === "string") {
    inhoudTekst = strOfNull(htmlNaarTekst(data.bodyHTML));
  }

  return {
    afzender: strOfNull(afzender),
    ontvanger: strOfNull(ontvanger),
    onderwerp: strOfNull(data.subject),
    datum: strOfNull(data.messageDeliveryTime) ?? strOfNull(data.clientSubmitTime),
    inhoudTekst,
    bijlagen,
  };
}

function isLegeEmail(e: GeparseerdeEmail): boolean {
  return (
    !e.afzender &&
    !e.ontvanger &&
    !e.onderwerp &&
    !e.inhoudTekst &&
    e.bijlagen.length === 0
  );
}

export async function parseEmailBestand(
  bestandsnaam: string,
  buffer: Buffer,
): Promise<GeparseerdeEmail> {
  const geparseerd = isMsg(bestandsnaam) ? parseMsg(buffer) : await parseEml(buffer);
  if (isLegeEmail(geparseerd)) {
    throw new Error(
      "Het bestand bevat geen leesbare e-mailgegevens (geen afzender, onderwerp, inhoud of bijlagen).",
    );
  }
  return geparseerd;
}

const AI_PROMPT = `Je analyseert een e-mail die hoort bij een brandpreventie-dossier van een gebouw.
Vat de relevante informatie samen voor de dossierbeheerder. Verzin geen feiten; laat onbekende velden op null.
Geef uitsluitend geldige JSON terug met deze velden:
- omschrijving (korte Nederlandse tekst of null): waar gaat deze e-mail over, in 1-3 zinnen.
- naw (tekst of null): naam, adres, woonplaats (NAW-gegevens) van personen of bedrijven die in de e-mail worden genoemd. Combineer tot leesbare regels.
- contactinfo (tekst of null): e-mailadressen en telefoonnummers die in de e-mail worden genoemd.
- tekeningen (tekst of null): noem bijlagen of verwijzingen die bouwtekeningen, plattegronden of technische tekeningen lijken te zijn.
- actiepunten (tekst of null): openstaande actiepunten, verzoeken of to-do's die uit de e-mail voortvloeien, als genummerde lijst. Null als er geen zijn.
- relevant (true, false of null): is deze e-mail inhoudelijk relevant voor het opleverdossier? Kies true wanneer de e-mail opdracht-leidend, technisch, juridisch of randvoorwaardelijk is, of over revisies of goedkeuringen gaat. Kies false bij louter logistieke, sociale of niet ter zake doende correspondentie (ontvangstbevestigingen, automatische antwoorden, planning zonder inhoud). Null als je het niet kunt bepalen.
- relevant_reden (korte Nederlandse tekst of null): in maximaal 1 zin waarom de e-mail wel of niet relevant is voor het dossier.
Antwoord in het Nederlands. Alleen JSON, geen extra tekst.`;

const SAMENVATTING_PROMPT = `Je analyseert de gecombineerde e-mailcorrespondentie van een brandpreventie-project (FPS Brandpreventie: passieve brandpreventie, branddoorvoering, branddeuren, brandkleppen etc.).
Maak een overzichtelijke projectsamenvatting. Geef uitsluitend geldige JSON terug met deze velden (null als onbekend):

- opdrachtomschrijving: korte Nederlandse omschrijving van het project/de opdracht (1-4 zinnen) of null.
- opdrachtgever: naam, bedrijf en/of adres van de opdrachtgever of null.
- contactgegevens: alle e-mailadressen en telefoonnummers die zijn gevonden, als leesbare lijst of null.
- afspraken: gemaakte afspraken, toezeggingen of deadlines als korte opsomming of null.
- actiepunten: alle openstaande actiepunten en to-do's als genummerde lijst of null.
- besluiten: relevante besluiten of overeenkomsten uit de correspondentie of null.
- tekeningen: genoemde bouwtekeningen, plattegronden of technische documenten of null.
- risicos: risico's, aandachtspunten of bezwaren die zijn geuit of null.
- contactpersonen: array met betrokkenen. Geef per persoon een object met:
  - rol: een van "opdrachtgever", "gebruiker", "installateur", "aannemer", "eigenaar", "aanvrager"
  - naam: volledige naam of bedrijfsnaam (verplicht)
  - organisatie: bedrijfsnaam of null
  - functie: functietitel binnen de organisatie (bijv. "Projectleider", "Directeur", "Facility Manager") of null
  - email: e-mailadres of null — verzin GEEN e-mailadressen
  - telefoon: telefoonnummer of null
  - relevantie: "relevant" als de persoon/organisatie een actieve rol speelt in opdracht, uitvoering, planning, communicatie of oplevering van het FPS-project; "ter_controle" als ze uitsluitend in CC staan, een onduidelijke of marginale rol hebben, of het twijfelgevallen zijn die de beheerder zelf moet beoordelen
  - bron_email_nr: het e-mailnummer (1, 2, 3...) waaruit de informatie voornamelijk afkomstig is
  Neem alleen echte personen of bedrijven op die daadwerkelijk in de e-mails voorkomen. Geen algemene mailboxen (info@, noreply@). Lege array als niets gevonden.

Antwoord in het Nederlands. Alleen JSON, geen extra tekst.`;

export interface ProjectSamenvatting {
  opdrachtomschrijving: string | null;
  opdrachtgever: string | null;
  contactgegevens: string | null;
  afspraken: string | null;
  actiepunten: string | null;
  besluiten: string | null;
  tekeningen: string | null;
  risicos: string | null;
  contactpersonen: EmailContactpersoon[];
}

const GELDIGE_ROLLEN = new Set([
  "opdrachtgever",
  "gebruiker",
  "installateur",
  "aannemer",
  "eigenaar",
  "aanvrager",
]);

function parseContactpersonen(
  v: unknown,
  emailIds: number[],
): EmailContactpersoon[] {
  if (!Array.isArray(v)) return [];
  const resultaat: EmailContactpersoon[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const rol = typeof o.rol === "string" ? o.rol.trim().toLowerCase() : "";
    const naam = strOfNull(o.naam);
    if (!naam || !GELDIGE_ROLLEN.has(rol)) continue;

    // Zet bron_email_nr (1-based) om naar echte bron_email_id
    const bronNr = typeof o.bron_email_nr === "number" ? o.bron_email_nr : null;
    const bronEmailId =
      bronNr !== null && bronNr >= 1 && bronNr <= emailIds.length
        ? emailIds[bronNr - 1]
        : null;

    const relevantieRuw = typeof o.relevantie === "string" ? o.relevantie.trim() : "relevant";
    const relevantie: "relevant" | "ter_controle" =
      relevantieRuw === "ter_controle" ? "ter_controle" : "relevant";

    resultaat.push({
      rol,
      naam,
      organisatie: strOfNull(o.organisatie),
      email: strOfNull(o.email),
      telefoon: strOfNull(o.telefoon),
      functie: strOfNull(o.functie),
      status: "voorstel",
      relevantie,
      bron_email_id: bronEmailId,
      bron_onderwerp: null, // wordt ingevuld door de caller met de werkelijke onderwerpregel
    });
  }
  return resultaat;
}

export async function genereerProjectSamenvatting(
  emails: GeparseerdeEmailMetId[],
): Promise<ProjectSamenvatting> {
  const leeg: ProjectSamenvatting = {
    opdrachtomschrijving: null, opdrachtgever: null, contactgegevens: null,
    afspraken: null, actiepunten: null, besluiten: null, tekeningen: null, risicos: null,
    contactpersonen: [],
  };
  if (!heeftOpenAi() || emails.length === 0) return leeg;

  const emailIds = emails.map((e) => e.id);
  const onderwerpPerNr = new Map<number, string | null>(
    emails.map((e, i) => [i + 1, e.onderwerp]),
  );

  const blokken = emails.map((e, i) => {
    const delen = [
      `--- E-mail ${i + 1} (id: ${e.id}) ---`,
      `Afzender: ${e.afzender ?? "(onbekend)"}`,
      `Onderwerp: ${e.onderwerp ?? "(geen)"}`,
      `Bijlagen: ${e.bijlagen.map((b) => b.bestandsnaam).join(", ") || "(geen)"}`,
      "",
      (e.inhoudTekst ?? "(geen tekstinhoud)").slice(0, 3000),
    ];
    return delen.join("\n");
  });

  const userTekst = blokken.join("\n\n");

  try {
    const client = maakOpenAiClient();
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      max_tokens: 1800,
      messages: [
        { role: "system", content: SAMENVATTING_PROMPT },
        { role: "user", content: userTekst.slice(0, 20000) },
      ],
    });
    const tekst = completion.choices[0]?.message?.content;
    if (!tekst) return leeg;
    const p = JSON.parse(tekst) as Record<string, unknown>;

    // Parseer contacten en vul bron_onderwerp in vanuit de lokale email-index
    const contactpersonen = parseContactpersonen(p.contactpersonen, emailIds).map((c) => {
      const bronNrVoorOnderwerp = emailIds.indexOf(c.bron_email_id ?? -1) + 1;
      return {
        ...c,
        bron_onderwerp: onderwerpPerNr.get(bronNrVoorOnderwerp) ?? null,
      };
    });

    return {
      opdrachtomschrijving: strOfNull(p.opdrachtomschrijving),
      opdrachtgever: strOfNull(p.opdrachtgever),
      contactgegevens: strOfNull(p.contactgegevens),
      afspraken: strOfNull(p.afspraken),
      actiepunten: strOfNull(p.actiepunten),
      besluiten: strOfNull(p.besluiten),
      tekeningen: strOfNull(p.tekeningen),
      risicos: strOfNull(p.risicos),
      contactpersonen,
    };
  } catch (err) {
    logger.error({ err }, "Project-samenvatting genereren mislukt");
    return leeg;
  }
}

export async function extraheerEmailInzicht(
  email: GeparseerdeEmail,
): Promise<EmailAiResultaat> {
  const leeg: EmailAiResultaat = { omschrijving: null, naw: null, contactinfo: null, tekeningen: null, actiepunten: null, relevant: null, relevantReden: null };
  if (!heeftOpenAi()) return leeg;

  const bijlageNamen = email.bijlagen.map((b) => b.bestandsnaam).join(", ") || "(geen)";
  const userTekst = [
    `Afzender: ${email.afzender ?? "(onbekend)"}`,
    `Ontvanger: ${email.ontvanger ?? "(onbekend)"}`,
    `Onderwerp: ${email.onderwerp ?? "(geen)"}`,
    `Bijlagen: ${bijlageNamen}`,
    "",
    "Inhoud:",
    (email.inhoudTekst ?? "(geen tekstinhoud)").slice(0, 8000),
  ].join("\n");

  try {
    const client = maakOpenAiClient();
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      max_tokens: 700,
      messages: [
        { role: "system", content: AI_PROMPT },
        { role: "user", content: userTekst },
      ],
    });
    const tekst = completion.choices[0]?.message?.content;
    if (!tekst) return leeg;
    const parsed = JSON.parse(tekst) as Record<string, unknown>;
    return {
      omschrijving: strOfNull(parsed.omschrijving),
      naw: strOfNull(parsed.naw),
      contactinfo: strOfNull(parsed.contactinfo),
      tekeningen: strOfNull(parsed.tekeningen),
      actiepunten: strOfNull(parsed.actiepunten),
      relevant: typeof parsed.relevant === "boolean" ? parsed.relevant : null,
      relevantReden: strOfNull(parsed.relevant_reden),
    };
  } catch (err) {
    logger.error({ err }, "E-mail AI-extractie mislukte");
    return leeg;
  }
}
