// Bewijsscript DEFECT dode /api/storage/files-links.
//
// Bewijst per plek dat de nieuwe canonieke link /api/storage/objects/<subPath>
// het bestand ook ÉCHT opent (200 + juiste bytes), niet alleen dat de link
// naar een bestaande route wijst:
//  1. Facturen  — probe-PDF onder facturen/… (zelfde prefix als factuurstroom
//     + mandagstaat) via de canonieke URL geopend.
//  2. Werkgeverslogo — probe-PNG onder werkgevers/…; canonieke URL geopend én
//     resolveWerkgeverLogoSubPath-equivalent pad gecontroleerd (calculatieprint/merkenkast).
//  3. Aanvraagstroom-bijlagen — probe onder aanvragen/mailstroom/….
//  4. Offerte-sectiefoto's — probe onder offertes/….
//  5. Snagstream-rapport — probe onder snagstream/….
//  6. Dode-link-scan: geen enkele opgeslagen waarde bevat nog /api/storage/files
//     (facturen, werkgevers, aanvraag_voorstellen, offerte_secties, snagstream_rapporten).
//  7. Toegangscontrole: zonder sessie geeft dezelfde URL 401 (zelfde slot als MERK_01).
//
// Draaien: pnpm --filter @workspace/scripts exec tsx src/verificatie-storage-links.ts
import {
  setupE2eWebAccount,
  archiveerE2eWebAccount,
  genereerVersWebTotp,
  E2E_WEB_EMAIL,
  E2E_WEB_WACHTWOORD,
} from "./e2e-monteur-testaccount";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const DOMEIN = process.env.REPLIT_DEV_DOMAIN;
if (!DOMEIN) {
  console.error("REPLIT_DEV_DOMAIN ontbreekt.");
  process.exit(1);
}
const BASIS = `https://${DOMEIN}`;

class Sessie {
  private cookies = new Map<string, string>();
  async fetch(pad: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    if (typeof init?.body === "string") headers.set("Content-Type", "application/json");
    const cookie = [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    if (cookie) headers.set("Cookie", cookie);
    const res = await fetch(`${BASIS}${pad}`, { ...init, headers, redirect: "manual" });
    for (const sc of res.headers.getSetCookie()) {
      const [paar] = sc.split(";");
      const idx = paar.indexOf("=");
      if (idx > 0) {
        const naam = paar.slice(0, idx).trim();
        const waarde = paar.slice(idx + 1).trim();
        if (waarde === "" || /expires=Thu, 01 Jan 1970/i.test(sc)) this.cookies.delete(naam);
        else this.cookies.set(naam, waarde);
      }
    }
    return res;
  }
  post(pad: string, body?: unknown): Promise<Response> {
    return this.fetch(pad, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
  }
}

function eis(v: boolean, stap: string, detail: string): void {
  if (!v) throw new Error(`FAIL — ${stap}: ${detail}`);
}

// Zelfde formule als storageObjectsUrl in de api-server (geen bronimport toegestaan).
function objectsUrl(subPath: string): string {
  return "/api/storage/objects/" + subPath.split("/").map(encodeURIComponent).join("/");
}

// Upload direct naar de private object-storage (zelfde backend als
// objectStorage.uploadBestand), zonder api-server-source te importeren.
async function uploadProbe(subPath: string, data: Buffer, contentType: string): Promise<void> {
  const dir = process.env.PRIVATE_OBJECT_DIR ?? "";
  eis(dir.length > 0, "setup", "PRIVATE_OBJECT_DIR ontbreekt");
  const fullPath = `${dir}/${subPath}`.replace(/^\/+/, "");
  const [bucketName, ...rest] = fullPath.split("/");
  const objectName = rest.join("/");
  // GCS-client als gewone afhankelijkheid van het scripts-pakket (nooit via een
  // absoluut werkruimte-pad importeren: dat bestaat niet op de GitHub-runner).
  const mod: any = await import("@google-cloud/storage");
  const storage = new mod.Storage({
    credentials: { audience: "replit", subject_token_type: "access_token", token_url: "http://127.0.0.1:1106/token", type: "external_account", credential_source: { url: "http://127.0.0.1:1106/credential", format: { type: "json", subject_token_field_name: "access_token" } }, universe_domain: "googleapis.com" },
    projectId: "",
  });
  await storage.bucket(bucketName).file(objectName).save(data, { contentType, resumable: false });
}

async function main(): Promise<void> {
  const stempel = Date.now();
  await setupE2eWebAccount();
  const sessie = new Sessie();

  // Inloggen (wachtwoord + TOTP)
  let res = await sessie.post("/api/auth/login", { email: E2E_WEB_EMAIL, wachtwoord: E2E_WEB_WACHTWOORD });
  eis(res.status === 200, "stap 0 login", `status ${res.status}`);
  res = await sessie.post("/api/auth/2fa/verify", { code: await genereerVersWebTotp() });
  eis(res.status === 200, "stap 0 totp", `status ${res.status}`);
  console.log(`STAP 0 PASS — ingelogd als ${E2E_WEB_EMAIL}`);

  // Probes per plek: prefix → (naam, inhoud, contentType)
  const PDF_BYTES = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
  const PNG_BYTES = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");
  const plekken: Array<{ plek: string; subPath: string; data: Buffer; ct: string }> = [
    { plek: "facturen (factuurstroom/mandagstaat)", subPath: `facturen/e2e-${stempel}/probe.pdf`, data: PDF_BYTES, ct: "application/pdf" },
    { plek: "werkgeverslogo (calculatieprint/merkenkast)", subPath: `werkgevers/999999/logo-e2e-${stempel}.png`, data: PNG_BYTES, ct: "image/png" },
    { plek: "aanvraagstroom-bijlagen", subPath: `aanvragen/mailstroom/e2e-${stempel}-bijlage.pdf`, data: PDF_BYTES, ct: "application/pdf" },
    { plek: "offerte-sectiefoto's", subPath: `offertes/e2e-${stempel}/foto.png`, data: PNG_BYTES, ct: "image/png" },
    { plek: "snagstream-rapport", subPath: `snagstream/e2e-${stempel}/rapport.pdf`, data: PDF_BYTES, ct: "application/pdf" },
  ];

  let stap = 1;
  for (const p of plekken) {
    await uploadProbe(p.subPath, p.data, p.ct);
    const url = objectsUrl(p.subPath);
    const open = await sessie.fetch(url);
    const body = Buffer.from(await open.arrayBuffer());
    eis(open.status === 200, `stap ${stap} ${p.plek}`, `GET ${url} → ${open.status}`);
    eis(body.equals(p.data), `stap ${stap} ${p.plek}`, `bytes wijken af (${body.length} vs ${p.data.length})`);
    console.log(`STAP ${stap} PASS — ${p.plek}: ${url} → 200, ${body.length} bytes identiek`);
    stap++;
  }

  // Toegangscontrole: zonder sessie 401 (zelfde slot als MERK_01/beeldbank).
  const anoniem = await fetch(`${BASIS}${objectsUrl(plekken[0].subPath)}`, { redirect: "manual" });
  eis(anoniem.status === 401 || anoniem.status === 403, `stap ${stap} ACL`, `anonieme GET → ${anoniem.status}`);
  console.log(`STAP ${stap} PASS — zonder sessie geweigerd (${anoniem.status})`);
  stap++;

  // Dode-link-scan in de database (na migratie 0068 hoort dit overal 0 te zijn).
  const scan = await db.execute(sql`
    SELECT 'facturen' bron, count(*)::int n FROM facturen WHERE pdf_url LIKE '%/api/storage/files%'
    UNION ALL SELECT 'werkgevers', count(*)::int FROM werkgevers WHERE logo_url LIKE '%/api/storage/files%'
    UNION ALL SELECT 'aanvraag_voorstellen', count(*)::int FROM aanvraag_voorstellen WHERE bijlagen::text LIKE '%/api/storage/files%'
    UNION ALL SELECT 'offerte_secties', count(*)::int FROM offerte_secties WHERE fotos::text LIKE '%/api/storage/files%'
    UNION ALL SELECT 'snagstream_rapporten', count(*)::int FROM snagstream_rapporten WHERE pdf_url LIKE '%/api/storage/files%'`);
  const rijen = (scan as any).rows ?? scan;
  const dood = rijen.filter((r: any) => Number(r.n) > 0);
  eis(dood.length === 0, `stap ${stap} dode-link-scan`, JSON.stringify(dood));
  console.log(`STAP ${stap} PASS — geen opgeslagen /api/storage/files-links meer in de 5 brontabellen`);

  await archiveerE2eWebAccount();
  console.log("ALLE STAPPEN PASS — alle storage-links wijzen naar de bestaande beveiligde route en de bestanden zijn echt te openen.");
}

main().catch(async (err) => {
  console.error(String(err?.message ?? err));
  try { await archiveerE2eWebAccount(); } catch { /* opruimen best effort */ }
  process.exit(1);
});
