// VOORRAADTELLING fase 2 (camera-telling) — bewijsscript. Test via HTTP
// (nooit api-server-source importeren) + @workspace/db voor opzet.
// Scenario: foto met twee vakken → AI-voorstellen → één corrigeren (bevestigen
// met ander aantal), één verwerpen → telling vaststellen → foto met kader
// zichtbaar (bron_vakken) bij de bevroren regel.
// Draaien: pnpm --filter @workspace/scripts run tsx src/verificatie-voorraadtelling-camera.ts
import "./lib/prodGuard";
import { authenticator } from "otplib";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { db, artikelenTable } from "@workspace/db";
import {
  setupE2eWebAdminAccount,
  E2E_WEB_ADMIN_EMAIL, E2E_WEB_ADMIN_WACHTWOORD, E2E_WEB_ADMIN_TOTP_SECRET,
} from "./e2e-monteur-testaccount";

const BASIS = process.env.API_BASIS
  ?? (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}/api` : "http://localhost:8080/api");

let geslaagd = 0;
let gefaald = 0;
function check(naam: string, conditie: boolean, detail?: string) {
  if (conditie) { geslaagd++; console.log(`  ✓ ${naam}`); }
  else { gefaald++; console.error(`  ✗ ${naam}${detail ? ` — ${detail}` : ""}`); }
}

type Sessie = { cookie: string };

async function login(email: string, wachtwoord: string, totpSecret: string): Promise<Sessie> {
  const r1 = await fetch(`${BASIS}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, wachtwoord }),
  });
  const cookie = (r1.headers.get("set-cookie") ?? "").split(";")[0]!;
  const j1 = (await r1.json()) as { status?: string };
  if (j1.status === "verify_2fa" || j1.status === "setup_2fa") {
    const code = authenticator.generate(totpSecret);
    const r2 = await fetch(`${BASIS}/auth/2fa/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ code }),
    });
    if (!r2.ok) throw new Error(`2fa verify faalde: ${r2.status} ${await r2.text()}`);
    const c2 = r2.headers.get("set-cookie");
    return { cookie: c2 ? c2.split(";")[0]! : cookie };
  }
  if (!r1.ok) throw new Error(`login faalde: ${r1.status} ${JSON.stringify(j1)}`);
  return { cookie };
}

async function api(s: Sessie, methode: string, pad: string, body?: unknown) {
  const r = await fetch(`${BASIS}${pad}`, {
    method: methode,
    headers: { "Content-Type": "application/json", cookie: s.cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: unknown = null;
  try { json = await r.json(); } catch { /* leeg */ }
  return { status: r.status, json };
}

// Testfoto: twee "planken" met duidelijk gelabelde dozen zodat de vision-AI
// de artikelen uit de lijst kan herkennen en tellen.
async function maakStellingFoto(a1: { code: string; naam: string }, a2: { code: string; naam: string }): Promise<Buffer> {
  const doos = (x: number, y: number, label: string, kleur: string) => `
    <rect x="${x}" y="${y}" width="150" height="110" rx="6" fill="${kleur}" stroke="#5b4636" stroke-width="3"/>
    <text x="${x + 75}" y="${y + 48}" font-size="17" font-family="Arial" font-weight="bold" text-anchor="middle" fill="#222">${label}</text>
    <text x="${x + 75}" y="${y + 76}" font-size="15" font-family="Arial" text-anchor="middle" fill="#333">1 stuk</text>`;
  let boxes = "";
  // Plank 1 (bovenste helft): 3 dozen artikel 1
  for (let i = 0; i < 3; i++) boxes += doos(60 + i * 180, 120, `${a1.code} ${a1.naam}`, "#e8d3a9");
  // Plank 2 (onderste helft): 2 dozen artikel 2
  for (let i = 0; i < 2; i++) boxes += doos(60 + i * 180, 420, `${a2.code} ${a2.naam}`, "#cfe3f5");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
    <rect width="800" height="600" fill="#f4f1ec"/>
    <rect x="20" y="250" width="760" height="16" fill="#8a6d4d"/>
    <rect x="20" y="550" width="760" height="16" fill="#8a6d4d"/>
    <text x="30" y="60" font-size="24" font-family="Arial" fill="#555">Magazijnstelling A</text>
    ${boxes}
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

type Vak = {
  id: number; aanduiding: string; status: string;
  voorstellen: Array<{ id: string; artikel_id: number | null; aantal: number; zekerheid: number; status: string; regel_id: number | null }>;
};

async function main() {
  console.log("— VOORRAADTELLING camera-telling bewijsscript —");
  await setupE2eWebAdminAccount();

  // Opzet: twee herkenbare testartikelen (idempotent op code)
  const artikelSpec = [
    { code: "BLUS-6KG", naam: "Poederblusser 6kg", eenheid: "st" },
    { code: "BRANDDEKEN", naam: "Blusdeken 120x120", eenheid: "st" },
  ];
  const artikelen: Array<{ id: number; code: string; naam: string }> = [];
  for (const spec of artikelSpec) {
    const [bestaand] = await db.select().from(artikelenTable).where(eq(artikelenTable.code, spec.code)).limit(1);
    if (bestaand) { artikelen.push({ id: bestaand.id, code: spec.code, naam: bestaand.naam }); continue; }
    const [nieuw] = await db.insert(artikelenTable).values({
      code: spec.code, naam: spec.naam, eenheid: spec.eenheid, inkoopprijs: 25,
    }).returning();
    artikelen.push({ id: nieuw.id, code: spec.code, naam: nieuw.naam });
  }
  const [a1, a2] = artikelen;
  console.log(`Testartikelen: #${a1.id} ${a1.naam}, #${a2.id} ${a2.naam}`);

  const admin = await login(E2E_WEB_ADMIN_EMAIL, E2E_WEB_ADMIN_WACHTWOORD, E2E_WEB_ADMIN_TOTP_SECRET);

  // 1. Telling aanmaken
  const t = await api(admin, "POST", "/magazijn/tellingen", {
    peildatum: new Date().toISOString().slice(0, 10),
    grondslag: "inkoopprijs",
    omschrijving: "Bewijs camera-telling",
  });
  check("telling aangemaakt", t.status === 201, JSON.stringify(t.json));
  const tellingId = (t.json as { id: number }).id;

  // 2. Foto uploaden via upload-url
  const up = await api(admin, "POST", `/magazijn/tellingen/${tellingId}/fotos/upload-url`);
  check("upload-url verkregen", up.status === 200, JSON.stringify(up.json));
  const { upload_url, object_path } = up.json as { upload_url: string; object_path: string };
  const foto = await maakStellingFoto(a1, a2);
  const putResp = await fetch(upload_url, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: new Uint8Array(foto) });
  check("foto geüpload", putResp.ok, String(putResp.status));

  // Beveiliging: een willekeurig (niet voor deze telling uitgegeven) objectpad
  // mag nooit server-side worden gedownload/geanalyseerd → 403
  const vreemd = await api(admin, "POST", `/magazijn/tellingen/${tellingId}/vakken`, {
    foto_pad: "/objects/uploads/niet-geclaimd-pad.jpg",
    vakken: [{ aanduiding: "hack", x: 0.1, y: 0.1, breedte: 0.2, hoogte: 0.2 }],
  });
  check("vreemd objectpad als foto_pad = 403", vreemd.status === 403, JSON.stringify(vreemd.json));

  // 3. Twee vakken tekenen (plank 1 boven, plank 2 onder) → AI telt per vak
  const vk = await api(admin, "POST", `/magazijn/tellingen/${tellingId}/vakken`, {
    foto_pad: object_path,
    vakken: [
      { aanduiding: "plank 1", x: 0.02, y: 0.15, breedte: 0.96, hoogte: 0.33 },
      { aanduiding: "plank 2", x: 0.02, y: 0.63, breedte: 0.96, hoogte: 0.33 },
    ],
  });
  check("vakken aangemaakt + geanalyseerd", vk.status === 201, JSON.stringify(vk.json).slice(0, 300));

  // Claim is éénmalig: hetzelfde pad nogmaals indienen → 403
  const hergebruik = await api(admin, "POST", `/magazijn/tellingen/${tellingId}/vakken`, {
    foto_pad: object_path,
    vakken: [{ aanduiding: "dubbel", x: 0.1, y: 0.1, breedte: 0.2, hoogte: 0.2 }],
  });
  check("hergebruik van verbruikte upload-claim = 403", hergebruik.status === 403);
  const vakken = vk.json as Vak[];
  check("twee vakken terug", Array.isArray(vakken) && vakken.length === 2);
  const vak1 = vakken.find(v => v.aanduiding === "plank 1")!;
  const vak2 = vakken.find(v => v.aanduiding === "plank 2")!;
  console.log(`  vak1: status=${vak1.status}, voorstellen=${JSON.stringify(vak1.voorstellen)}`);
  console.log(`  vak2: status=${vak2.status}, voorstellen=${JSON.stringify(vak2.voorstellen)}`);
  check("vak1 heeft AI-voorstel", vak1.status === "gereed" && vak1.voorstellen.length > 0);
  check("vak2 heeft AI-voorstel", vak2.status === "gereed" && vak2.voorstellen.length > 0);
  if (vak1.voorstellen.length === 0 || vak2.voorstellen.length === 0) {
    throw new Error("Geen AI-voorstellen — scenario kan niet verder");
  }

  // Fail-closed check: elk voorgesteld artikel_id komt uit het eigen artikelbestand (of is null)
  const alleIds = [...vak1.voorstellen, ...vak2.voorstellen].map(v => v.artikel_id).filter((v): v is number => v != null);
  const bekend = new Set((await db.select({ id: artikelenTable.id }).from(artikelenTable)).map(r => r.id));
  check("alle voorgestelde artikel-id's uit eigen artikelbestand", alleIds.every(id => bekend.has(id)));

  // 4a. Voorstel uit vak 1 CORRIGEREN en bevestigen: expliciet artikel + ander aantal (7)
  const v1 = vak1.voorstellen[0];
  const b1 = await api(admin, "POST", `/magazijn/tellingen/${tellingId}/vakken/${vak1.id}/voorstellen/${v1.id}/beslissen`, {
    actie: "bevestig", artikel_id: a1.id, aantal: 7,
  });
  check("voorstel vak1 gecorrigeerd bevestigd", b1.status === 200, JSON.stringify(b1.json).slice(0, 200));
  const regel1 = (b1.json as { regel: { id: number; geteld_aantal: number; bevestigd: boolean; bron_vakken: unknown[] } }).regel;
  check("regel aangemaakt met gecorrigeerd aantal 7", regel1?.geteld_aantal === 7 && regel1?.bevestigd === true);
  check("regel draagt bron_vak (foto+coördinaten)", Array.isArray(regel1?.bron_vakken) && regel1.bron_vakken.length === 1);

  // Dubbele beslissing moet 409 geven (voorstel al beoordeeld)
  const b1b = await api(admin, "POST", `/magazijn/tellingen/${tellingId}/vakken/${vak1.id}/voorstellen/${v1.id}/beslissen`, { actie: "verwerp" });
  check("tweede beslissing over zelfde voorstel = 409", b1b.status === 409);

  // Fail-closed: vaststellen kan NIET zolang er nog een open voorstel is (vak 2)
  const teVroeg = await api(admin, "POST", `/magazijn/tellingen/${tellingId}/vaststellen`);
  check("vaststellen met open voorstel = 422", teVroeg.status === 422
    && String((teVroeg.json as { error?: string }).error ?? "").includes("voorstel"), JSON.stringify(teVroeg.json));

  // 4b. Voorstel uit vak 2 VERWERPEN → geen regel
  const v2 = vak2.voorstellen[0];
  const b2 = await api(admin, "POST", `/magazijn/tellingen/${tellingId}/vakken/${vak2.id}/voorstellen/${v2.id}/beslissen`, { actie: "verwerp" });
  check("voorstel vak2 verworpen", b2.status === 200 && (b2.json as { regel: unknown }).regel == null);

  // Restant-voorstellen (extra AI-regels) verwerpen zodat de telling alleen de bevestigde regel bevat
  for (const { vak, vs } of [
    ...vak1.voorstellen.slice(1).map(vs => ({ vak: vak1, vs })),
    ...vak2.voorstellen.slice(1).map(vs => ({ vak: vak2, vs })),
  ]) {
    await api(admin, "POST", `/magazijn/tellingen/${tellingId}/vakken/${vak.id}/voorstellen/${vs.id}/beslissen`, { actie: "verwerp" });
  }

  // 5. Alleen de bevestigde regel telt mee
  const det = await api(admin, "GET", `/magazijn/tellingen/${tellingId}`);
  const regels = (det.json as { regels: Array<{ artikel_id: number | null; geteld_aantal: number; bevestigd: boolean; bron_vakken: Array<{ foto_pad: string; aanduiding: string; x: number; breedte: number }> | null }> }).regels;
  check("precies één tellingregel (verworpen voorstel telt niet mee)", regels.length === 1, JSON.stringify(regels));
  check("regel = gecorrigeerd artikel + aantal", regels[0]?.artikel_id === a1.id && regels[0]?.geteld_aantal === 7);

  // 6. Vaststellen → bevroren; bron_vakken blijft leesbaar op de bevroren regel
  const vast = await api(admin, "POST", `/magazijn/tellingen/${tellingId}/vaststellen`);
  check("telling vastgesteld", vast.status === 200, JSON.stringify(vast.json).slice(0, 200));

  const detNa = await api(admin, "GET", `/magazijn/tellingen/${tellingId}`);
  const regelsNa = (detNa.json as { status: string; regels: typeof regels }).regels;
  const bron = regelsNa[0]?.bron_vakken?.[0];
  check("bevroren regel toont foto+kader (bron_vakken)", !!bron && bron.foto_pad === object_path && bron.aanduiding === "plank 1" && bron.breedte > 0);

  // Foto zelf blijft ophaalbaar via de storage-route
  const fotoResp = await fetch(`${BASIS}/storage/objects/${object_path.replace(/^\/objects\//, "").replace(/^\/+/, "")}`, { headers: { cookie: admin.cookie } });
  check("bewijsfoto downloadbaar via /storage/objects", fotoResp.ok, String(fotoResp.status));

  // 7. Ná vaststellen: geen nieuwe vakken/beslissingen meer (409, bevroren)
  const naVak = await api(admin, "POST", `/magazijn/tellingen/${tellingId}/vakken`, {
    foto_pad: object_path, vakken: [{ aanduiding: "te laat", x: 0.1, y: 0.1, breedte: 0.2, hoogte: 0.2 }],
  });
  check("vak toevoegen op vastgestelde telling = 409", naVak.status === 409);

  console.log(`\nResultaat: ${geslaagd} geslaagd, ${gefaald} gefaald`);
  if (gefaald > 0) process.exit(1);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
