import { simpleParser } from "mailparser";
import MsgReader from "@kenjiuno/msgreader";
import { logger } from "../lib/logger";
import { heeftOpenAi, maakOpenAiClient } from "../lib/openai";

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

export interface EmailAiResultaat {
  omschrijving: string | null;
  naw: string | null;
  contactinfo: string | null;
  tekeningen: string | null;
  actiepunten: string | null;
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
  return {
    afzender,
    ontvanger,
    onderwerp: mail.subject ?? null,
    datum: mail.date ? mail.date.toISOString() : null,
    inhoudTekst: mail.text ?? (mail.html ? String(mail.html).replace(/<[^>]+>/g, " ") : null),
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

  return {
    afzender: strOfNull(afzender),
    ontvanger: strOfNull(ontvanger),
    onderwerp: strOfNull(data.subject),
    datum: strOfNull(data.messageDeliveryTime) ?? strOfNull(data.clientSubmitTime),
    inhoudTekst: strOfNull(data.body),
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
Antwoord in het Nederlands. Alleen JSON, geen extra tekst.`;

const SAMENVATTING_PROMPT = `Je analyseert de gecombineerde e-mailcorrespondentie van een brandpreventie-project.
Maak een overzichtelijke projectsamenvatting op basis van ALLE e-mails samen.
Geef uitsluitend geldige JSON terug met deze velden (null als onbekend):
- opdrachtomschrijving: korte Nederlandse omschrijving van het project/de opdracht (1-4 zinnen) of null.
- opdrachtgever: naam, bedrijf en/of adres van de opdrachtgever of null.
- contactgegevens: alle e-mailadressen en telefoonnummers die zijn gevonden, als leesbare lijst of null.
- afspraken: gemaakte afspraken, toezeggingen of deadlines als korte opsomming of null.
- actiepunten: alle openstaande actiepunten en to-do's als genummerde lijst of null.
- besluiten: relevante besluiten of overeenkomsten uit de correspondentie of null.
- tekeningen: genoemde bouwtekeningen, plattegronden of technische documenten of null.
- risicos: risico's, aandachtspunten of bezwaren die zijn geuit of null.
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
}

export async function genereerProjectSamenvatting(
  emails: GeparseerdeEmail[],
): Promise<ProjectSamenvatting> {
  const leeg: ProjectSamenvatting = {
    opdrachtomschrijving: null, opdrachtgever: null, contactgegevens: null,
    afspraken: null, actiepunten: null, besluiten: null, tekeningen: null, risicos: null,
  };
  if (!heeftOpenAi() || emails.length === 0) return leeg;

  const blokken = emails.map((e, i) => {
    const delen = [
      `--- E-mail ${i + 1} ---`,
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
      max_tokens: 1200,
      messages: [
        { role: "system", content: SAMENVATTING_PROMPT },
        { role: "user", content: userTekst.slice(0, 20000) },
      ],
    });
    const tekst = completion.choices[0]?.message?.content;
    if (!tekst) return leeg;
    const p = JSON.parse(tekst) as Record<string, unknown>;
    return {
      opdrachtomschrijving: strOfNull(p.opdrachtomschrijving),
      opdrachtgever: strOfNull(p.opdrachtgever),
      contactgegevens: strOfNull(p.contactgegevens),
      afspraken: strOfNull(p.afspraken),
      actiepunten: strOfNull(p.actiepunten),
      besluiten: strOfNull(p.besluiten),
      tekeningen: strOfNull(p.tekeningen),
      risicos: strOfNull(p.risicos),
    };
  } catch (err) {
    logger.error({ err }, "Project-samenvatting genereren mislukt");
    return leeg;
  }
}

export async function extraheerEmailInzicht(
  email: GeparseerdeEmail,
): Promise<EmailAiResultaat> {
  const leeg: EmailAiResultaat = { omschrijving: null, naw: null, contactinfo: null, tekeningen: null, actiepunten: null };
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
    };
  } catch (err) {
    logger.error({ err }, "E-mail AI-extractie mislukte");
    return leeg;
  }
}
