import { logger } from "../lib/logger";
import { db, mailLogboekTable } from "@workspace/db";

// ── Configuratie ────────────────────────────────────────────────────────────
// Microsoft 365 via Azure App Registration (OAuth2 client-credentials, Graph
// sendMail). Geen gebruikerswachtwoorden. De Azure-gegevens staan uitsluitend
// in Replit Secrets en worden nooit gelogd of teruggegeven.
const TENANT_ID = process.env.AZURE_TENANT_ID;
// Tijdelijk: clientId uit AZURE_CLIENT_ID_NEW (de juiste Application/client ID),
// omdat AZURE_CLIENT_ID nog de tenant-waarde bevatte.
const CLIENT_ID = process.env.AZURE_CLIENT_ID_NEW;
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;

// Zichtbare afzender — alle uitgaande mail komt hiervandaan.
const MAIL_FROM = process.env.MAIL_FROM ?? "noreply@fpsbrandpreventie.nl";
// De feitelijke gedeelde postbus waartegen via Graph wordt verzonden. De
// noreply-afzender is een alias van deze postbus.
const MAIL_MAILBOX = process.env.MAIL_MAILBOX ?? "app@fpsbrandpreventie.nl";

// Weergegeven afzendernaam in e-mailclients: platform | bedrijfsnaam
const AFZENDER_NAAM = "FPS Connect";

// ── Foutmodel ────────────────────────────────────────────────────────────────
export type MailFoutCategorie =
  | "niet_geconfigureerd"
  | "token_verlopen"
  | "mailbox_onbereikbaar"
  | "rate_limit"
  | "verzendfout";

export const MAIL_FOUT_OMSCHRIJVING: Record<MailFoutCategorie, string> = {
  niet_geconfigureerd:
    "De mailkoppeling is niet geconfigureerd (Azure-gegevens ontbreken).",
  token_verlopen:
    "Aanmelden bij Microsoft 365 is mislukt — token verlopen of ongeldige gegevens.",
  mailbox_onbereikbaar:
    "De postbus is niet bereikbaar of bestaat niet in Microsoft 365.",
  rate_limit:
    "Microsoft 365 heeft het verzoek tijdelijk geblokkeerd (rate limit).",
  verzendfout: "Versturen via Microsoft 365 is mislukt (SMTP/Graph-fout).",
};

export class MailFout extends Error {
  categorie: MailFoutCategorie;
  detail: string | null;
  constructor(categorie: MailFoutCategorie, detail?: string | null) {
    super(MAIL_FOUT_OMSCHRIJVING[categorie]);
    this.name = "MailFout";
    this.categorie = categorie;
    this.detail = detail ?? null;
  }
}

export type MailSoort = "test" | "uitnodiging" | "wachtwoord_reset" | "offerte" | "klantvraag" | "ondertekening";

// ── Configuratie-helpers ─────────────────────────────────────────────────────
export function isGeconfigureerd(): boolean {
  return !!(TENANT_ID && CLIENT_ID && CLIENT_SECRET);
}

export function ontbrekendeConfiguratie(): string[] {
  const ontbreekt: string[] = [];
  if (!TENANT_ID) ontbreekt.push("AZURE_TENANT_ID");
  if (!CLIENT_ID) ontbreekt.push("AZURE_CLIENT_ID");
  if (!CLIENT_SECRET) ontbreekt.push("AZURE_CLIENT_SECRET");
  return ontbreekt;
}

export function mailConfiguratie() {
  return {
    geconfigureerd: isGeconfigureerd(),
    afzender: MAIL_FROM,
    postbus: MAIL_MAILBOX,
    ontbrekend: ontbrekendeConfiguratie(),
  };
}

function knip(tekst: string, max = 500): string {
  return tekst.length > max ? `${tekst.slice(0, max)}…` : tekst;
}

function escapeHtml(tekst: string): string {
  return tekst
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Defensief: Microsoft echoot normaliter geen geheimen terug, maar upstream
// foutteksten worden opgeslagen (mail_logboek), teruggegeven en gelogd. Daarom
// strippen we hier preventief alles wat op een token/secret lijkt, zodat er
// nooit een geheim in de DB, een API-respons of de logs belandt.
const GEVOELIGE_PATRONEN: RegExp[] = [
  // JWT-achtige strings (header.payload.signature)
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  // "Bearer <token>"
  /\bBearer\s+[A-Za-z0-9._\-]+/gi,
  // key=value vormen voor bekende geheime velden
  /\b(client_secret|access_token|refresh_token|id_token|password|assertion|code)\s*[=:]\s*[^&\s"']+/gi,
];

function veiligFoutdetail(tekst: string | null | undefined, max = 500): string | null {
  if (!tekst) return null;
  let schoon = tekst;
  for (const patroon of GEVOELIGE_PATRONEN) schoon = schoon.replace(patroon, "$1[verborgen]");
  // Tweede pass voor patronen zonder capture-groep (JWT/Bearer): vervang restanten.
  schoon = schoon
    .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[verborgen]")
    .replace(/\bBearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [verborgen]");
  const bijgesneden = knip(schoon.trim(), max);
  return bijgesneden.length > 0 ? bijgesneden : null;
}

// ── Microsoft Graph ──────────────────────────────────────────────────────────
async function haalAccessToken(): Promise<string> {
  const url = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: CLIENT_ID!,
    client_secret: CLIENT_SECRET!,
    scope: "https://graph.microsoft.com/.default",
  });
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch {
    throw new MailFout("token_verlopen", "Microsoft 365 niet bereikbaar voor aanmelden");
  }
  if (!res.ok) {
    let detail: string | null = `HTTP ${res.status}`;
    try {
      const data = (await res.json()) as { error?: string; error_description?: string };
      const samengesteld = veiligFoutdetail(
        `${data.error ?? res.status}: ${data.error_description ?? ""}`.trim(),
      );
      if (samengesteld) detail = samengesteld;
    } catch {
      /* responsbody niet leesbaar */
    }
    if (res.status === 429) throw new MailFout("rate_limit", detail);
    if (res.status >= 500) throw new MailFout("verzendfout", detail);
    throw new MailFout("token_verlopen", detail);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

function classificeerGraphFout(
  status: number,
  code: string | null,
  bericht: string | null,
): MailFout {
  const c = (code ?? "").toLowerCase();
  const veiligBericht = veiligFoutdetail(bericht);
  if (status === 429 || c.includes("throttl")) {
    return new MailFout("rate_limit", veiligBericht);
  }
  if (status === 401) {
    return new MailFout("token_verlopen", veiligBericht);
  }
  if (
    status === 404 ||
    c.includes("mailboxnotenabled") ||
    c.includes("invaliduser") ||
    c.includes("resourcenotfound") ||
    c.includes("itemnotfound")
  ) {
    return new MailFout("mailbox_onbereikbaar", veiligBericht);
  }
  return new MailFout(
    "verzendfout",
    veiligBericht ? knip(`HTTP ${status}: ${veiligBericht}`) : `HTTP ${status}`,
  );
}

async function leesGraphFout(res: Response): Promise<MailFout> {
  let code: string | null = null;
  let bericht: string | null = null;
  try {
    const data = (await res.json()) as { error?: { code?: string; message?: string } };
    code = data.error?.code ?? null;
    bericht = data.error?.message ?? null;
  } catch {
    /* responsbody niet leesbaar */
  }
  return classificeerGraphFout(res.status, code, bericht);
}

export type MailBijlage = { naam: string; contentType: string; inhoud: Buffer };

async function verstuurViaGraph(opties: {
  naarEmail: string;
  naarNaam?: string | null;
  onderwerp: string;
  html: string;
  bijlagen?: MailBijlage[];
}): Promise<void> {
  const token = await haalAccessToken();
  const graphUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
    MAIL_MAILBOX,
  )}/sendMail`;
  const bericht = {
    message: {
      subject: opties.onderwerp,
      body: { contentType: "HTML", content: opties.html },
      toRecipients: [
        { emailAddress: { address: opties.naarEmail, name: opties.naarNaam ?? opties.naarEmail } },
      ],
      from: { emailAddress: { address: MAIL_FROM, name: AFZENDER_NAAM } },
      // Antwoorden komen terug in de gedeelde postbus, niet op het noreply-alias.
      replyTo: [{ emailAddress: { address: MAIL_MAILBOX, name: "FPS Connect" } }],
      ...(opties.bijlagen && opties.bijlagen.length > 0
        ? {
            attachments: opties.bijlagen.map((b) => ({
              "@odata.type": "#microsoft.graph.fileAttachment",
              name: b.naam,
              contentType: b.contentType,
              contentBytes: b.inhoud.toString("base64"),
            })),
          }
        : {}),
    },
    saveToSentItems: false,
  };
  let res: Response;
  try {
    res = await fetch(graphUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(bericht),
    });
  } catch {
    throw new MailFout("verzendfout", "Microsoft Graph niet bereikbaar");
  }
  if (!res.ok) {
    throw await leesGraphFout(res);
  }
}

/**
 * Controleert de volledige keten: aanmelden (token) én postbus bereikbaar.
 * Gooit een MailFout met de juiste categorie als iets faalt.
 */
export async function testVerbinding(): Promise<void> {
  if (!isGeconfigureerd()) {
    throw new MailFout("niet_geconfigureerd");
  }
  const token = await haalAccessToken();
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
    MAIL_MAILBOX,
  )}?$select=id,mail,userPrincipalName`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new MailFout("mailbox_onbereikbaar", "Microsoft Graph niet bereikbaar");
  }
  if (!res.ok) {
    throw await leesGraphFout(res);
  }
}

// ── Logboek ──────────────────────────────────────────────────────────────────
async function logMail(opties: {
  naarEmail: string;
  naarNaam?: string | null;
  onderwerp: string;
  soort: MailSoort;
  status: "verzonden" | "mislukt";
  foutCategorie?: MailFoutCategorie | null;
  foutdetail?: string | null;
  verstuurdDoorId?: number | null;
}): Promise<void> {
  try {
    await db.insert(mailLogboekTable).values({
      naarEmail: opties.naarEmail,
      naarNaam: opties.naarNaam ?? null,
      onderwerp: opties.onderwerp,
      soort: opties.soort,
      status: opties.status,
      foutCategorie: opties.foutCategorie ?? null,
      foutdetail: opties.foutdetail ?? null,
      verstuurdDoorId: opties.verstuurdDoorId ?? null,
    });
  } catch (err) {
    logger.error(err, "Mail-logboek schrijven mislukt");
  }
}

/**
 * Kern: verstuurt één bericht via Graph en legt de uitkomst (verzonden of
 * mislukt + foutcategorie) vast in het mail-logboek. Gooit een MailFout bij
 * mislukken zodat de aanroeper kan reageren.
 */
export async function verstuurMail(opties: {
  naarEmail: string;
  naarNaam?: string | null;
  onderwerp: string;
  html: string;
  soort: MailSoort;
  verstuurdDoorId?: number | null;
  bijlagen?: MailBijlage[];
}): Promise<void> {
  const basis = {
    naarEmail: opties.naarEmail,
    naarNaam: opties.naarNaam ?? null,
    onderwerp: opties.onderwerp,
    soort: opties.soort,
    verstuurdDoorId: opties.verstuurdDoorId ?? null,
  };
  if (!isGeconfigureerd()) {
    await logMail({ ...basis, status: "mislukt", foutCategorie: "niet_geconfigureerd" });
    throw new MailFout("niet_geconfigureerd");
  }
  try {
    await verstuurViaGraph({ ...opties, bijlagen: opties.bijlagen });
  } catch (err) {
    const fout =
      err instanceof MailFout
        ? err
        : new MailFout("verzendfout", err instanceof Error ? veiligFoutdetail(err.message) : null);
    await logMail({
      ...basis,
      status: "mislukt",
      foutCategorie: fout.categorie,
      foutdetail: fout.detail,
    });
    throw fout;
  }
  await logMail({ ...basis, status: "verzonden" });
  logger.info({ naar: opties.naarEmail, soort: opties.soort }, "Mail verstuurd");
}

// ── Berichtsjablonen ─────────────────────────────────────────────────────────
function mailShell(opties: {
  titel: string;
  kopje: string;
  paragrafen: string[];
  knop?: { label: string; link: string };
  voettekst?: string;
}): string {
  const knopHtml = opties.knop
    ? `
              <table cellpadding="0" cellspacing="0" style="margin:0 auto 32px;">
                <tr>
                  <td style="background:#F23B0D;border-radius:6px;">
                    <a href="${opties.knop.link}"
                      style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:.3px;">
                      ${opties.knop.label}
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:12px;color:#71717a;">
                Werkt de knop niet? Kopieer dan onderstaande link in uw browser:
              </p>
              <p style="margin:0;font-size:11px;color:#a1a1aa;word-break:break-all;">${opties.knop.link}</p>`
    : "";
  const paras = opties.paragrafen
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3f3f46;">${p}</p>`,
    )
    .join("\n              ");
  const voet =
    opties.voettekst ??
    "Dit bericht is verstuurd door FPS Connect &bull; Niet aangevraagd? Neem contact op met uw beheerder.";
  return `
<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${opties.titel}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0"
          style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.12);">
          <tr>
            <td style="background:#212631;padding:28px 40px;text-align:center;">
              <p style="margin:0;display:inline-flex;align-items:center;gap:8px;">
                <span style="display:inline-block;width:28px;height:28px;background:#F23B0D;border-radius:6px;vertical-align:middle;"></span>
                <span style="color:#ffffff;font-size:16px;letter-spacing:.5px;font-weight:700;vertical-align:middle;">FPS Connect</span>
              </p>
              <p style="margin:10px 0 0;color:rgba(255,255,255,.55);font-size:12px;letter-spacing:.2px;">
                Beheersomgeving brandpreventieve voorzieningen
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#18181b;">
                ${opties.kopje}
              </h1>
              ${paras}
              ${knopHtml}
            </td>
          </tr>
          <tr>
            <td style="background:#f4f4f5;padding:24px 40px;border-top:1px solid #e4e4e7;">
              <p style="margin:0;font-size:12px;color:#71717a;text-align:center;">
                ${voet}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function stuurUitnodigingsmail(opties: {
  naarEmail: string;
  naarNaam: string;
  activatieLink: string;
  isOpnieuw?: boolean;
  verstuurdDoorId?: number | null;
}): Promise<boolean> {
  const { naarEmail, naarNaam, activatieLink, isOpnieuw = false, verstuurdDoorId } = opties;

  const onderwerp = isOpnieuw
    ? "Uw uitnodiging voor FPS Connect (herinnering)"
    : "U bent uitgenodigd voor FPS Connect";

  // Behoud bestaand gedrag: zonder configuratie wordt er niet verstuurd, maar
  // de uitnodiging kan in de ontwikkelomgeving wel worden aangemaakt.
  if (!isGeconfigureerd()) {
    logger.warn(
      { email: naarEmail },
      "E-mailservice niet geconfigureerd — uitnodiging niet verstuurd " +
        "(stel AZURE_TENANT_ID, AZURE_CLIENT_ID en AZURE_CLIENT_SECRET in)",
    );
    await logMail({
      naarEmail,
      naarNaam,
      onderwerp,
      soort: "uitnodiging",
      status: "mislukt",
      foutCategorie: "niet_geconfigureerd",
      verstuurdDoorId,
    });
    return false;
  }

  const html = mailShell({
    titel: onderwerp,
    kopje: `${isOpnieuw ? "Herinnering:" : "Welkom,"} ${naarNaam}`,
    paragrafen: [
      isOpnieuw
        ? "U heeft eerder een uitnodiging ontvangen voor FPS Connect. " +
          "Gebruik onderstaande knop om uw account te activeren."
        : "U bent uitgenodigd voor FPS Connect. " +
          "Activeer hieronder uw account, stel uw wachtwoord in en koppel de authenticator-app.",
      "De activatielink is <strong>7 dagen geldig</strong>.",
    ],
    knop: { label: "Account activeren", link: activatieLink },
  });

  await verstuurMail({
    naarEmail,
    naarNaam,
    onderwerp,
    html,
    soort: "uitnodiging",
    verstuurdDoorId,
  });
  return true;
}

/**
 * Verstuurt een wachtwoord-reset e-mail.
 */
export async function verstuurWachtwoordResetMail(opties: {
  naarEmail: string;
  naarNaam: string;
  resetLink: string;
}): Promise<void> {
  const { naarEmail, naarNaam, resetLink } = opties;
  const onderwerp = "Wachtwoord opnieuw instellen — FPS Connect";
  const html = mailShell({
    titel: onderwerp,
    kopje: `Wachtwoord opnieuw instellen`,
    paragrafen: [
      `U ontvangt dit bericht omdat er een verzoek is ingediend om het wachtwoord van uw account (${naarEmail}) opnieuw in te stellen.`,
      "Klik op de knop hieronder om een nieuw wachtwoord in te stellen. De link is <strong>1 uur geldig</strong>.",
      "Heeft u dit verzoek niet zelf ingediend? Dan kunt u dit bericht negeren. Uw wachtwoord blijft ongewijzigd.",
    ],
    knop: { label: "Wachtwoord opnieuw instellen", link: resetLink },
  });
  await verstuurMail({
    naarEmail,
    naarNaam,
    onderwerp,
    html,
    soort: "wachtwoord_reset",
  });
}

/**
 * Stuurt een notificatiemail naar de behandelend beheerder (of algemene postbus)
 * als een klant een nieuwe vraag stelt via het offerte-portaal.
 * Gooit nooit — mislukkingen worden gelogd en stilzwijgend genegeerd.
 */
export async function stuurKlantvraagNotificatie(opties: {
  naarEmail: string;
  naarNaam?: string | null;
  bezoekerNaam: string | null;
  vraagTekst: string;
  offerteId: number;
  offertenummer: string | null;
  offerteTitel: string;
  connectUrl: string;
}): Promise<void> {
  const {
    naarEmail,
    naarNaam,
    bezoekerNaam,
    vraagTekst,
    offerteId,
    offertenummer,
    offerteTitel,
    connectUrl,
  } = opties;

  if (!isGeconfigureerd()) {
    logger.warn(
      { offerteId },
      "E-mailservice niet geconfigureerd — klantvraag-notificatie niet verstuurd",
    );
    return;
  }

  const offerteLabel = offertenummer
    ? `offerte ${escapeHtml(offertenummer)}`
    : `offerte #${offerteId}`;
  const bezoekerLabel = escapeHtml(bezoekerNaam ?? "onbekende bezoeker");
  const onderwerp = `Nieuwe vraag via portaal — ${offertenummer ?? `#${offerteId}`}`;

  const html = mailShell({
    titel: onderwerp,
    kopje: "Nieuwe klantvraag ontvangen",
    paragrafen: [
      `Via het klantportaal van <strong>${escapeHtml(offerteTitel)}</strong> (${offerteLabel}) heeft <strong>${bezoekerLabel}</strong> een nieuwe vraag gesteld:`,
      `<blockquote style="margin:0 0 16px;padding:12px 16px;background:#f4f4f5;border-left:4px solid #F23B0D;border-radius:4px;font-style:italic;color:#3f3f46;">${escapeHtml(knip(vraagTekst, 2000))}</blockquote>`,
      "Open de offerte in FPS Connect om de vraag te bekijken en te beantwoorden.",
    ],
    knop: { label: "Bekijk offerte in FPS Connect", link: connectUrl },
    voettekst:
      "Dit bericht is automatisch gegenereerd door FPS Connect &bull; U ontvangt dit omdat u als behandelaar op deze offerte staat.",
  });

  try {
    await verstuurMail({
      naarEmail,
      naarNaam: naarNaam ?? undefined,
      onderwerp,
      html,
      soort: "klantvraag",
    });
  } catch (err) {
    logger.warn({ err, offerteId }, "Klantvraag-notificatiemail mislukt (niet-kritiek)");
  }
}

/**
 * Stuurt een notificatiemail naar de behandelend beheerder (of algemene postbus)
 * zodra een klant een offerte heeft ondertekend via het portaal.
 * Gooit nooit — mislukkingen worden gelogd en stilzwijgend genegeerd.
 */
export async function stuurOndertekeningNotificatie(opties: {
  naarEmail: string;
  naarNaam?: string | null;
  ondertekendDoor: string;
  ondertekendOp: Date;
  offerteId: number;
  offertenummer: string | null;
  offerteTitel: string;
  opdrachtgever: string | null;
  connectUrl: string;
}): Promise<void> {
  const {
    naarEmail,
    naarNaam,
    ondertekendDoor,
    ondertekendOp,
    offerteId,
    offertenummer,
    offerteTitel,
    opdrachtgever,
    connectUrl,
  } = opties;

  if (!isGeconfigureerd()) {
    logger.warn(
      { offerteId },
      "E-mailservice niet geconfigureerd — ondertekening-notificatie niet verstuurd",
    );
    return;
  }

  const offerteLabel = offertenummer
    ? `offerte ${escapeHtml(offertenummer)}`
    : `offerte #${offerteId}`;

  const datumTijd = ondertekendOp.toLocaleString("nl-NL", {
    timeZone: "Europe/Amsterdam",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const onderwerp = `Offerte ondertekend — ${offertenummer ?? `#${offerteId}`}`;

  const paragrafen: string[] = [
    `<strong>${escapeHtml(offerteTitel)}</strong> (${offerteLabel}) is zojuist ondertekend.`,
  ];

  if (opdrachtgever) {
    paragrafen.push(`<strong>Opdrachtgever:</strong> ${escapeHtml(opdrachtgever)}`);
  }

  paragrafen.push(
    `<strong>Ondertekend door:</strong> ${escapeHtml(ondertekendDoor)}`,
    `<strong>Datum en tijd:</strong> ${datumTijd}`,
    "Open de offerte in FPS Connect voor de volgende stappen.",
  );

  const html = mailShell({
    titel: onderwerp,
    kopje: "Offerte ondertekend",
    paragrafen,
    knop: { label: "Bekijk offerte in FPS Connect", link: connectUrl },
    voettekst:
      "Dit bericht is automatisch gegenereerd door FPS Connect &bull; U ontvangt dit omdat u als behandelaar op deze offerte staat.",
  });

  try {
    await verstuurMail({
      naarEmail,
      naarNaam: naarNaam ?? undefined,
      onderwerp,
      html,
      soort: "ondertekening",
    });
  } catch (err) {
    logger.warn({ err, offerteId }, "Ondertekening-notificatiemail mislukt (niet-kritiek)");
  }
}

/**
 * Verstuurt een testbericht om de mailkoppeling te controleren.
 */
export async function stuurTestmail(opties: {
  naarEmail: string;
  verstuurdDoorId?: number | null;
}): Promise<void> {
  const onderwerp = "Testbericht van FPS Connect";
  const html = mailShell({
    titel: onderwerp,
    kopje: "Testbericht",
    paragrafen: [
      "Dit is een testbericht om de mailkoppeling van FPS Connect te controleren.",
      "Ontvangt u dit bericht? Dan werkt de verbinding met Microsoft 365 correct.",
    ],
    voettekst:
      "Dit bericht is automatisch gegenereerd vanuit de mailinstellingen van FPS Connect.",
  });
  await verstuurMail({
    naarEmail: opties.naarEmail,
    onderwerp,
    html,
    soort: "test",
    verstuurdDoorId: opties.verstuurdDoorId,
  });
}
