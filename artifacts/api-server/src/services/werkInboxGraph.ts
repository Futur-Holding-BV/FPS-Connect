/**
 * Microsoft Graph — delegated permissions voor Mijn werk-inbox.
 * Elke gebruiker koppelt zijn eigen Microsoft-account via OAuth.
 * De app slaat encrypted refresh-tokens op per gebruiker.
 */
import crypto from "crypto";
import { db } from "@workspace/db";
import {
  werkInboxTokensTable,
  werkInboxMailsTable,
  werkInboxMailboxenTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";
import { encrypteer, decrypteer } from "../lib/werkInboxCrypto";

const TENANT_ID  = process.env["AZURE_TENANT_ID"];
const CLIENT_ID  = process.env["AZURE_CLIENT_ID_NEW"];
const CLIENT_SECRET = process.env["AZURE_CLIENT_SECRET"];

// Exact de rechten die de beheerder in Azure heeft goedgekeurd (aug 2026).
export const DELEGATED_SCOPES = "User.Read Mail.ReadWrite Mail.ReadWrite.Shared Mail.Send Mail.Send.Shared offline_access";

/**
 * Vergelijkt de bij een koppeling opgeslagen scopes met de nu vereiste scopes.
 * Geeft de ontbrekende scopes terug (leeg = koppeling is breed genoeg).
 * `offline_access` wordt buiten beschouwing gelaten: Microsoft geeft die scope
 * niet terug in de token-response, dus die is nooit betrouwbaar opgeslagen.
 */
export function ontbrekendeScopes(opgeslagenScope: string | null | undefined): string[] {
  const aanwezig = new Set(
    (opgeslagenScope ?? "")
      .split(/\s+/)
      .filter(Boolean)
      // Graph kan scopes met resource-prefix teruggeven (https://graph.microsoft.com/Mail.Read)
      .map((s) => s.split("/").pop()!.toLowerCase()),
  );
  return DELEGATED_SCOPES.split(" ")
    .filter((s) => s !== "offline_access")
    .filter((s) => !aanwezig.has(s.toLowerCase()));
}

// Review MAIL_01: nooit een voorspelbare fallback — een bekende secret zou
// iedereen in staat stellen OAuth-states namens willekeurige gebruikers te
// ondertekenen. Zonder configuratie faalt de OAuth-flow expliciet.
const SESSION_SECRET = (() => {
  const s = process.env["SESSION_SECRET"];
  if (!s || s.length < 16) {
    throw new Error("SESSION_SECRET ontbreekt of is te kort — vereist voor het ondertekenen van OAuth-states van de werk-inbox.");
  }
  return s;
})();

// ── State-parameter (stateless, HMAC-gesigned) ────────────────────────────────

export function maakOAuthState(gebruikerId: number, nonce: string): string {
  const payload = Buffer.from(JSON.stringify({ uid: gebruikerId, n: nonce, ts: Date.now() })).toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyOAuthState(state: string): { uid: number; nonce: string } | null {
  const dot = state.lastIndexOf(".");
  if (dot < 0) return null;
  const payload = state.slice(0, dot);
  const sig     = state.slice(dot + 1);
  const verwacht = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  if (sig.length !== verwacht.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(verwacht))) return null;
  try {
    const obj = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { uid: number; n?: string; ts: number };
    if (Date.now() - obj.ts > 10 * 60 * 1000) return null; // 10 minuten
    if (typeof obj.n !== "string" || obj.n.length < 16) return null;
    return { uid: obj.uid, nonce: obj.n };
  } catch {
    return null;
  }
}

// ── Configuratie ──────────────────────────────────────────────────────────────

export function isGeconfigureerd(): boolean {
  return !!(TENANT_ID && CLIENT_ID && CLIENT_SECRET);
}

export function bouwAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id:    CLIENT_ID!,
    response_type: "code",
    redirect_uri: redirectUri,
    scope:        DELEGATED_SCOPES,
    response_mode: "query",
    state,
    prompt:       "select_account",
  });
  return `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize?${params.toString()}`;
}

// ── Token exchange / refresh ──────────────────────────────────────────────────

export interface TokenResponse {
  access_token:  string;
  refresh_token: string;
  expires_in:    number;
  token_type?:   string;
  id_token?:     string;
  /** Door Microsoft daadwerkelijk toegekende scopes (zonder offline_access). */
  scope?:        string;
}

async function ruilCodeVoorToken(code: string, redirectUri: string): Promise<TokenResponse> {
  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     CLIENT_ID!,
      client_secret: CLIENT_SECRET!,
      code,
      redirect_uri:  redirectUri,
      grant_type:    "authorization_code",
    }).toString(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "(leeg)");
    throw new Error(`Token exchange mislukt: ${res.status} — ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<TokenResponse>;
}

// Auth-fout bij refresh (invalid_grant e.d.) = koppeling stuk; netwerk/5xx niet.
export class TokenRefreshGeweigerd extends Error {
  status: number;
  constructor(status: number, body: string) {
    super(`Token refresh geweigerd: ${status} — ${body.slice(0, 200)}`);
    this.name = "TokenRefreshGeweigerd";
    this.status = status;
  }
}

async function verversToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     CLIENT_ID!,
      client_secret: CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type:    "refresh_token",
      // Bewust GEEN scope-parameter: bij refresh staat Microsoft alleen een
      // subset van de oorspronkelijke grant toe. Een bredere scope meesturen
      // laat refreshes van bestaande (smallere) koppelingen falen met 400,
      // waarna een werkende koppeling onterecht als stuk wordt gemarkeerd.
      // Bredere rechten komen uitsluitend via interactief herkoppelen.
    }).toString(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "(leeg)");
    // 400/401 = de refresh-token zelf is ongeldig (wachtwoordwissel, consent
    // ingetrokken). Andere statussen (netwerk, 5xx) zijn tijdelijk.
    if (res.status === 400 || res.status === 401) {
      throw new TokenRefreshGeweigerd(res.status, body);
    }
    throw new Error(`Token refresh mislukt: ${res.status} — ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<TokenResponse>;
}

// ── Token opslaan / ophalen ───────────────────────────────────────────────────

export async function slaTokenOp(gebruikerId: number, tokenData: TokenResponse, microsoftEmail: string): Promise<void> {
  const verlooptOp = new Date(Date.now() + tokenData.expires_in * 1000);
  const values = {
    gebruikerId,
    microsoftEmail,
    accessTokenEnc:  encrypteer(tokenData.access_token),
    refreshTokenEnc: encrypteer(tokenData.refresh_token),
    verlooptOp,
    // Geslaagde refresh/herkoppeling = koppeling weer gezond.
    refreshMisluktOp: null,
    bijgewerktOp:    new Date(),
    // De door Microsoft dáádwerkelijk toegekende scopes opslaan (niet wat wij
    // vroegen), zodat "opnieuw koppelen nodig" betrouwbaar te bepalen is.
    // Fail-closed: geen scope in de response = niet bewezen dat de brede
    // grant bestaat → leeg opslaan, zodat de status "herkoppelen nodig" toont.
    scope: tokenData.scope ?? "",
  };
  await db.insert(werkInboxTokensTable)
    .values(values)
    .onConflictDoUpdate({
      target: werkInboxTokensTable.gebruikerId,
      set: values,
    });
}

async function haalGeldigToken(gebruikerId: number): Promise<string | null> {
  const [token] = await db.select()
    .from(werkInboxTokensTable)
    .where(eq(werkInboxTokensTable.gebruikerId, gebruikerId))
    .limit(1);

  if (!token) return null;

  // Nog 5 minuten geldig → access token hergebruiken
  if (token.verlooptOp.getTime() - Date.now() > 5 * 60 * 1000) {
    return decrypteer(token.accessTokenEnc);
  }

  // Anders refreshen
  try {
    const fresh = await verversToken(decrypteer(token.refreshTokenEnc));
    await slaTokenOp(gebruikerId, fresh, token.microsoftEmail);
    return fresh.access_token;
  } catch (err) {
    if (err instanceof TokenRefreshGeweigerd) {
      // Koppeling is definitief stuk (invalid_grant): markeer dat direct zodat
      // het beheerscherm en de syncbewaking dit niet als "werkend" meetellen.
      await db.update(werkInboxTokensTable)
        .set({ refreshMisluktOp: new Date(), bijgewerktOp: new Date() })
        .where(eq(werkInboxTokensTable.gebruikerId, gebruikerId));
      logger.warn({ gebruikerId, status: err.status }, "werk-inbox: Microsoft-koppeling geweigerd bij refresh — gemarkeerd als niet-werkend");
    } else {
      logger.warn({ err, gebruikerId }, "werk-inbox: token refresh mislukt (tijdelijk)");
    }
    return null;
  }
}

// ── Microsoft-account ontkoppelen ─────────────────────────────────────────────

export async function verwijderToken(gebruikerId: number): Promise<void> {
  await db.delete(werkInboxTokensTable)
    .where(eq(werkInboxTokensTable.gebruikerId, gebruikerId));
}

// ── Gebruiker-info ophalen ────────────────────────────────────────────────────

export async function haalMicrosoftEmail(accessToken: string): Promise<string> {
  const res = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Graph /me mislukt: ${res.status}`);
  const data = (await res.json()) as { mail?: string; userPrincipalName: string };
  return data.mail ?? data.userPrincipalName;
}

// ── Mail ophalen van Graph ────────────────────────────────────────────────────

interface GraphMessage {
  id:          string;
  subject:     string;
  bodyPreview: string;
  receivedDateTime: string;
  isRead:      boolean;
  hasAttachments: boolean;
  conversationId?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
}

interface GraphMessageDetail extends GraphMessage {
  body: { contentType: string; content: string };
  toRecipients: Array<{ emailAddress: { name: string; address: string } }>;
  ccRecipients: Array<{ emailAddress: { name: string; address: string } }>;
}

const MAIL_VELDEN = "id,subject,bodyPreview,receivedDateTime,isRead,hasAttachments,from,conversationId";
const MAX_PER_MAILBOX = 50;

async function haalMailsVanMailbox(
  accessToken: string,
  mailboxAdres: string,
  isPersonlijk: boolean,
): Promise<GraphMessage[]> {
  const basis = isPersonlijk
    ? "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages"
    : `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailboxAdres)}/mailFolders/inbox/messages`;

  const params = new URLSearchParams({
    $select:  MAIL_VELDEN,
    $top:     String(MAX_PER_MAILBOX),
    $orderby: "receivedDateTime desc",
  });

  const res = await fetch(`${basis}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 403 || res.status === 404) {
    throw new GeenToegang(mailboxAdres);
  }
  if (!res.ok) {
    throw new Error(`Graph messages mislukt voor ${mailboxAdres}: ${res.status}`);
  }
  const data = (await res.json()) as { value: GraphMessage[] };
  return data.value ?? [];
}

export class GeenToegang extends Error {
  mailbox: string;
  constructor(mailbox: string) {
    super(`Geen toegang tot mailbox: ${mailbox}`);
    this.name = "GeenToegang";
    this.mailbox = mailbox;
  }
}

// ── Volledige mail ophalen ────────────────────────────────────────────────────

export async function haalVolledigeMail(
  gebruikerId: number,
  mailboxAdres: string,
  messageId: string,
  isPersonlijk: boolean,
): Promise<GraphMessageDetail | null> {
  const token = await haalGeldigToken(gebruikerId);
  if (!token) return null;

  const basis = isPersonlijk
    ? "https://graph.microsoft.com/v1.0/me/messages"
    : `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailboxAdres)}/messages`;

  const res = await fetch(`${basis}/${encodeURIComponent(messageId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json() as Promise<GraphMessageDetail>;
}

// ── Bijlagen ophalen (FACTUUR_02: factuur-PDF's uit de mail) ─────────────────

export interface GraphBijlage {
  id: string;
  name: string;
  contentType: string;
  size: number;
  contentBytes?: string; // base64
}

export async function haalBijlagen(
  gebruikerId: number,
  mailboxAdres: string,
  messageId: string,
  isPersonlijk: boolean,
): Promise<GraphBijlage[]> {
  const token = await haalGeldigToken(gebruikerId);
  if (!token) return [];

  const basis = isPersonlijk
    ? "https://graph.microsoft.com/v1.0/me/messages"
    : `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailboxAdres)}/messages`;

  const res = await fetch(
    `${basis}/${encodeURIComponent(messageId)}/attachments?$select=id,name,contentType,size,contentBytes`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { value?: GraphBijlage[] };
  // Alleen echte bestandsbijlagen met inhoud (geen inline/item attachments zonder bytes)
  return (data.value ?? []).filter((b) => typeof b.contentBytes === "string" && b.contentBytes.length > 0);
}

// ── Markeer gelezen/ongelezen ─────────────────────────────────────────────────

export async function markeerGelezen(
  gebruikerId: number,
  mailboxAdres: string,
  messageId: string,
  isPersonlijk: boolean,
  isGelezen: boolean,
): Promise<boolean> {
  const token = await haalGeldigToken(gebruikerId);
  if (!token) return false;

  const basis = isPersonlijk
    ? "https://graph.microsoft.com/v1.0/me/messages"
    : `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailboxAdres)}/messages`;

  const res = await fetch(`${basis}/${encodeURIComponent(messageId)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ isRead: isGelezen }),
  });
  return res.ok;
}

// ── Verplaatsen / Archiveren ──────────────────────────────────────────────────

/**
 * Verplaatst een bericht naar een andere map.
 * doelMap kan een well-known naam zijn: "archive", "deleteditems", "inbox",
 * "junkemail", "sentitems", of een specifieke map-ID uit Graph.
 */
export async function verplaatsMail(
  gebruikerId: number,
  mailboxAdres: string,
  messageId: string,
  isPersonlijk: boolean,
  doelMap: string,
): Promise<boolean> {
  const token = await haalGeldigToken(gebruikerId);
  if (!token) return false;

  const basis = isPersonlijk
    ? "https://graph.microsoft.com/v1.0/me/messages"
    : `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailboxAdres)}/messages`;

  const res = await fetch(`${basis}/${encodeURIComponent(messageId)}/move`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ destinationId: doelMap }),
  });
  return res.ok;
}

/**
 * Archiveert een bericht (verplaatst naar de Archive-map).
 */
export async function archiveerMail(
  gebruikerId: number,
  mailboxAdres: string,
  messageId: string,
  isPersonlijk: boolean,
): Promise<boolean> {
  return verplaatsMail(gebruikerId, mailboxAdres, messageId, isPersonlijk, "archive");
}

// ── Beantwoorden ──────────────────────────────────────────────────────────────

export interface BeantwoordOpties {
  htmlBody: string;
  extraOntvangers?: Array<{ emailAddress: { address: string; name?: string } }>;
}

/**
 * Beantwoordt een bericht via de Graph createReply-flow (ondersteunt HTML).
 * 1. createReply-concept aanmaken  2. body patchen  3. versturen
 */
export async function beantwoordMail(
  gebruikerId: number,
  mailboxAdres: string,
  messageId: string,
  isPersonlijk: boolean,
  opties: BeantwoordOpties,
): Promise<{ ok: boolean; fout?: string }> {
  const token = await haalGeldigToken(gebruikerId);
  if (!token) return { ok: false, fout: "Geen geldig Microsoft-token. Koppel uw account opnieuw." };

  const basis = isPersonlijk
    ? "https://graph.microsoft.com/v1.0/me/messages"
    : `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailboxAdres)}/messages`;

  // Stap 1: concept aanmaken
  const conceptRes = await fetch(`${basis}/${encodeURIComponent(messageId)}/createReply`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!conceptRes.ok) {
    const detail = await conceptRes.text().catch(() => "");
    return { ok: false, fout: `Concept aanmaken mislukt (${conceptRes.status}): ${detail.slice(0, 100)}` };
  }
  const concept = (await conceptRes.json()) as { id: string };

  // Stap 2: body patchen
  const patchPayload: Record<string, unknown> = {
    body: { contentType: "HTML", content: opties.htmlBody },
  };
  if (opties.extraOntvangers && opties.extraOntvangers.length > 0) {
    patchPayload.ccRecipients = opties.extraOntvangers;
  }

  const conceptBasis = isPersonlijk
    ? "https://graph.microsoft.com/v1.0/me/messages"
    : `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailboxAdres)}/messages`;

  const patchRes = await fetch(`${conceptBasis}/${encodeURIComponent(concept.id)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(patchPayload),
  });
  if (!patchRes.ok) {
    return { ok: false, fout: `Body patchen mislukt (${patchRes.status})` };
  }

  // Stap 3: versturen
  const sendRes = await fetch(`${conceptBasis}/${encodeURIComponent(concept.id)}/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!sendRes.ok) {
    return { ok: false, fout: `Versturen mislukt (${sendRes.status})` };
  }
  return { ok: true };
}

// ── Nieuw bericht versturen ───────────────────────────────────────────────────

export interface NieuwBerichtOpties {
  naarEmail: string;
  naarNaam?: string;
  onderwerp: string;
  htmlBody: string;
  isPersonlijk: boolean;
  mailboxAdres: string;
}

/**
 * Verstuurt een nieuw bericht namens de gekoppelde gebruiker via delegated token.
 * Gebruikt /me/sendMail (persoonlijk) of /users/{mb}/sendMail (gedeeld).
 */
export async function verstuurNieuwDelegatedMail(
  gebruikerId: number,
  opties: NieuwBerichtOpties,
): Promise<{ ok: boolean; fout?: string }> {
  const token = await haalGeldigToken(gebruikerId);
  if (!token) return { ok: false, fout: "Geen geldig Microsoft-token. Koppel uw account opnieuw." };

  const sendUrl = opties.isPersonlijk
    ? "https://graph.microsoft.com/v1.0/me/sendMail"
    : `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(opties.mailboxAdres)}/sendMail`;

  const bericht = {
    message: {
      subject: opties.onderwerp,
      body: { contentType: "HTML", content: opties.htmlBody },
      toRecipients: [
        { emailAddress: { address: opties.naarEmail, name: opties.naarNaam ?? opties.naarEmail } },
      ],
    },
    saveToSentItems: true,
  };

  const res = await fetch(sendUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(bericht),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { ok: false, fout: `Versturen mislukt (${res.status}): ${detail.slice(0, 100)}` };
  }
  return { ok: true };
}

// ── Exchange-toegang tonen (MAIL_01 §2: tonen, nooit beheren) ─────────────────

export type ExchangeStatus = "ok" | "geen_toegang" | "geen_token" | "fout";

/** Lichtgewicht probe: kan dit Microsoft-account de inbox van deze mailbox openen? */
export async function probeExchangeToegang(gebruikerId: number, mailboxAdres: string, isPersonlijk: boolean): Promise<ExchangeStatus> {
  const token = await haalGeldigToken(gebruikerId);
  if (!token) return "geen_token";
  const basis = isPersonlijk ? "me" : `users/${encodeURIComponent(mailboxAdres)}`;
  try {
    const res = await fetch(`https://graph.microsoft.com/v1.0/${basis}/mailFolders/inbox?$select=id`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) return "ok";
    if (res.status === 403 || res.status === 404) return "geen_toegang";
    return "fout";
  } catch {
    return "fout";
  }
}

// ── Sync ──────────────────────────────────────────────────────────────────────

export interface SyncResultaat {
  mailboxen: Array<{ adres: string; gesynchroniseerd: number; fout?: string }>;
  totaal: number;
  fout?: string;
}

export async function syncMailboxen(gebruikerId: number): Promise<SyncResultaat> {
  const token = await haalGeldigToken(gebruikerId);
  if (!token) {
    return { mailboxen: [], totaal: 0, fout: "Microsoft-account niet gekoppeld of token verlopen." };
  }

  const [tokenRecord] = await db.select({ microsoftEmail: werkInboxTokensTable.microsoftEmail })
    .from(werkInboxTokensTable)
    .where(eq(werkInboxTokensTable.gebruikerId, gebruikerId))
    .limit(1);

  const eigenEmail = (tokenRecord?.microsoftEmail ?? "").toLowerCase();
  // MAIL_01: sync alle actieve mailboxen waar deze gebruiker Connect-toegang
  // toe heeft. De persoonlijke mailbox staat sinds de migratie ook als rij in
  // werk_inbox_mailboxen (met toegang 'beheren' voor de eigenaar).
  const { toegankelijkeMailboxen } = await import("./werkInboxToegang");
  const mailboxen = (await toegankelijkeMailboxen(gebruikerId)).filter((m) => m.actief);

  const alleMailboxen = mailboxen.map((m) => ({
    id: m.id,
    adres: m.emailAdres,
    label: m.label ?? m.emailAdres,
    isPersonlijk: m.emailAdres === eigenEmail,
  }));

  const resultaten: SyncResultaat["mailboxen"] = [];
  let totaal = 0;

  for (const mb of alleMailboxen) {
    try {
      const mails = await haalMailsVanMailbox(token, mb.adres, mb.isPersonlijk);
      for (const m of mails) {
        await db.insert(werkInboxMailsTable)
          .values({
            messageId:          m.id,
            gebruikerId,
            mailboxAdres:       mb.adres,
            onderwerp:          m.subject ?? "",
            afzenderNaam:       m.from?.emailAddress?.name ?? null,
            afzenderEmail:      m.from?.emailAddress?.address ?? "",
            ontvangenOp:        new Date(m.receivedDateTime),
            snippet:            m.bodyPreview?.slice(0, 300) ?? null,
            heeftBijlage:       m.hasAttachments,
            conversationId:     m.conversationId ?? null,
            isGelezenMs:        m.isRead,
            gesynchroniseerdOp: new Date(),
            bijgewerktOp:       new Date(),
          })
          .onConflictDoUpdate({
            target: [werkInboxMailsTable.mailboxAdres, werkInboxMailsTable.messageId],
            set: {
              gebruikerId,
              isGelezenMs:        m.isRead,
              snippet:            m.bodyPreview?.slice(0, 300) ?? null,
              heeftBijlage:       m.hasAttachments,
              conversationId:     m.conversationId ?? null,
              gesynchroniseerdOp: new Date(),
              bijgewerktOp:       new Date(),
            },
          });
      }
      resultaten.push({ adres: mb.adres, gesynchroniseerd: mails.length });
      totaal += mails.length;
      // Bewaking: markeer de succesvolle sync zodat het beheerscherm en de
      // achtergrondbewaking kunnen zien of de sync nog loopt.
      await db.update(werkInboxMailboxenTable)
        .set({ laatstGesynctOp: new Date() })
        .where(eq(werkInboxMailboxenTable.id, mb.id));
    } catch (err) {
      const fout = err instanceof GeenToegang
        ? "Geen toegang tot deze mailbox"
        : err instanceof Error ? err.message.slice(0, 100) : "Onbekende fout";
      resultaten.push({ adres: mb.adres, gesynchroniseerd: 0, fout });
      logger.warn({ err, mailbox: mb.adres, gebruikerId }, "werk-inbox: sync fout");
    }
  }

  return { mailboxen: resultaten, totaal };
}
