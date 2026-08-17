// MARKETING_01 Fase 1 — bewijsscript fundament: toestemming (harde poort),
// doelgroepen, sjablonen, campagnes, proef-verplichting, wachtrij-verzending
// en publiek afmelden. Test via HTTP + @workspace/db voor opzet/cleanup.
// Draaien: cd scripts && npx tsx src/verificatie-marketing-fase1.ts
import "./lib/prodGuard";
import { authenticator } from "otplib";
import { eq, and, inArray } from "drizzle-orm";
import {
  db,
  crmKlantenTable,
  crmContactpersonenTable,
  crmCommunicatieTable,
  marketingDoelgroepenTable,
  marketingSjablonenTable,
  marketingCampagnesTable,
  marketingCampagneOntvangersTable,
  mailWachtrijTable,
} from "@workspace/db";
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
  let json: any = null;
  try { json = await r.json(); } catch { /* leeg */ }
  return { status: r.status, json };
}

const STEMPEL = Date.now();
const BRANCHE = `bewijs-marketing-${STEMPEL}`;

async function main() {
  await setupE2eWebAdminAccount();
  const s = await login(E2E_WEB_ADMIN_EMAIL, E2E_WEB_ADMIN_WACHTWOORD, E2E_WEB_ADMIN_TOTP_SECRET);

  // ── Opzet: klant + 3 contactpersonen (met/zonder toestemming, zonder e-mail)
  const [klant] = await db.insert(crmKlantenTable).values({
    naam: `Bewijs Marketing BV ${STEMPEL}`,
    branche: BRANCHE,
    stad: "Teststad",
  }).returning();
  const klantId = klant!.id;
  const [cpMet] = await db.insert(crmContactpersonenTable).values({
    klantId, naam: "Met Toestemming", email: `bewijs-mkt-met-${STEMPEL}@fps.local`,
  }).returning();
  const [cpZonder] = await db.insert(crmContactpersonenTable).values({
    klantId, naam: "Zonder Toestemming", email: `bewijs-mkt-zonder-${STEMPEL}@fps.local`,
  }).returning();
  const [cpGeenMail] = await db.insert(crmContactpersonenTable).values({
    klantId, naam: "Geen Mailadres",
  }).returning();

  console.log("\n1) Toestemming vastleggen");
  const tZonderBron = await api(s, "PATCH", `/marketing/contactpersonen/${cpMet!.id}/toestemming`, { toestemming: true });
  check("toestemming zonder bron → 422", tZonderBron.status === 422, `status=${tZonderBron.status}`);
  const tMet = await api(s, "PATCH", `/marketing/contactpersonen/${cpMet!.id}/toestemming`, { toestemming: true, bron: "bewijsscript: mondelinge toestemming" });
  check("toestemming met bron → ok", tMet.status === 200, `status=${tMet.status}`);

  console.log("\n2) Doelgroep — harde toestemmingspoort");
  const dgVoorbeeld = await api(s, "POST", "/marketing/doelgroepen/voorbeeld", { criteria: { branche: [BRANCHE] } });
  check("voorbeeldtelling = 1 (alleen consented mét e-mail)", dgVoorbeeld.json?.aantal_leden === 1, JSON.stringify(dgVoorbeeld.json));
  const dgAanmaak = await api(s, "POST", "/marketing/doelgroepen", { naam: `Bewijsgroep ${STEMPEL}`, criteria: { branche: [BRANCHE] } });
  check("doelgroep aangemaakt", dgAanmaak.status === 201, `status=${dgAanmaak.status}`);
  const dgId = dgAanmaak.json?.id as number;
  const leden = await api(s, "GET", `/marketing/doelgroepen/${dgId}/leden`);
  check("ledenlijst bevat alleen contactpersoon mét toestemming",
    Array.isArray(leden.json) && leden.json.length === 1 && leden.json[0]?.contactpersoon_id === cpMet!.id,
    JSON.stringify(leden.json));

  console.log("\n3) Sjabloon + campagne");
  const sjb = await api(s, "POST", "/marketing/sjablonen", {
    naam: `Bewijssjabloon ${STEMPEL}`,
    onderwerp: `Bewijscampagne ${STEMPEL} voor {{organisatie}}`,
    inhoud: "Beste {{naam}},\n\nDit is een bewijsmail voor {{organisatie}}.",
  });
  check("sjabloon aangemaakt", sjb.status === 201, `status=${sjb.status}`);
  const cmp = await api(s, "POST", "/marketing/campagnes", {
    naam: `Bewijscampagne ${STEMPEL}`, doelgroep_id: dgId, sjabloon_id: sjb.json?.id,
  });
  check("campagne aangemaakt", cmp.status === 201, `status=${cmp.status}`);
  const cmpId = cmp.json?.id as number;

  console.log("\n4) Verzenden vereist proef");
  const zonderProef = await api(s, "POST", `/marketing/campagnes/${cmpId}/verzenden`);
  check("verzenden zonder proef → 422", zonderProef.status === 422, `status=${zonderProef.status} ${JSON.stringify(zonderProef.json)}`);
  const proef = await api(s, "POST", `/marketing/campagnes/${cmpId}/proef`);
  check("proefverzending → ok", proef.status === 200, `status=${proef.status} ${JSON.stringify(proef.json)}`);

  console.log("\n5) Verzenden → fail-closed via mailwachtrij");
  const verzend = await api(s, "POST", `/marketing/campagnes/${cmpId}/verzenden`);
  check("verzenden → ok, 1 ingepland", verzend.status === 200 && verzend.json?.ingepland === 1, JSON.stringify(verzend.json));
  const nogmaals = await api(s, "POST", `/marketing/campagnes/${cmpId}/verzenden`);
  check("tweede verzendactie → 409", nogmaals.status === 409, `status=${nogmaals.status}`);
  const ontvangers = await db.select().from(marketingCampagneOntvangersTable)
    .where(eq(marketingCampagneOntvangersTable.campagneId, cmpId));
  check("1 ontvanger (gepland) met snapshot-e-mail",
    ontvangers.length === 1 && ontvangers[0]!.status === "gepland" && ontvangers[0]!.email === cpMet!.email,
    JSON.stringify(ontvangers.map(o => ({ s: o.status, e: o.email }))));
  const wachtrij = await db.select().from(mailWachtrijTable)
    .where(eq(mailWachtrijTable.campagneOntvangerId, ontvangers[0]!.id));
  check("wachtrij-item wachtend, gekoppeld aan ontvanger, soort campagne",
    wachtrij.length === 1 && wachtrij[0]!.status === "wachtend" && wachtrij[0]!.soort === "campagne",
    JSON.stringify(wachtrij.map(w => ({ s: w.status, soort: w.soort }))));
  check("mail bevat persoonlijke afmeldlink",
    (wachtrij[0]?.html ?? "").includes(`/api/marketing/afmelden/${ontvangers[0]!.afmeldToken}`));
  const detail = await api(s, "GET", `/marketing/campagnes/${cmpId}`);
  check("campagnestatus = verzendend", detail.json?.status === "verzendend", JSON.stringify(detail.json?.status));

  console.log("\n6) Publiek afmelden (zonder inloggen)");
  const afmeldGet = await fetch(`${BASIS}/marketing/afmelden/${ontvangers[0]!.afmeldToken}`);
  check("GET afmeldpagina → 200 zonder sessie", afmeldGet.status === 200, `status=${afmeldGet.status}`);
  const [cpGet] = await db.select().from(crmContactpersonenTable).where(eq(crmContactpersonenTable.id, cpMet!.id));
  check("GET meldt niet af (scanner-veilig, bevestiging vereist)", cpGet!.mailAfgemeldOp === null);
  const afmeld = await fetch(`${BASIS}/marketing/afmelden/${ontvangers[0]!.afmeldToken}`, { method: "POST" });
  check("POST afmelden → 200 zonder sessie", afmeld.status === 200, `status=${afmeld.status}`);
  const [cpNa] = await db.select().from(crmContactpersonenTable).where(eq(crmContactpersonenTable.id, cpMet!.id));
  check("contactpersoon afgemeld + toestemming ingetrokken",
    cpNa!.mailAfgemeldOp !== null && cpNa!.mailToestemming === false);
  const [ontvNa] = await db.select().from(marketingCampagneOntvangersTable)
    .where(eq(marketingCampagneOntvangersTable.id, ontvangers[0]!.id));
  check("ontvangerstatus = afgemeld", ontvNa!.status === "afgemeld", ontvNa!.status);
  const events = await db.select().from(crmCommunicatieTable)
    .where(and(eq(crmCommunicatieTable.klantId, klantId), eq(crmCommunicatieTable.type, "campagne_afgemeld")));
  check("afmeld-gebeurtenis bij de relatie vastgelegd", events.length === 1, `n=${events.length}`);
  const telNa = await api(s, "POST", "/marketing/doelgroepen/voorbeeld", { criteria: { branche: [BRANCHE] } });
  check("afgemelde valt direct uit de doelgroep (telling 0)", telNa.json?.aantal_leden === 0, JSON.stringify(telNa.json));
  const afmeld2 = await fetch(`${BASIS}/marketing/afmelden/${ontvangers[0]!.afmeldToken}`, { method: "POST" });
  check("tweede afmeld-POST blijft nette pagina (idempotent)", afmeld2.status === 200);
  const wachtrijNaAfmelding = await db.select().from(mailWachtrijTable)
    .where(eq(mailWachtrijTable.campagneOntvangerId, ontvangers[0]!.id));
  check("afmelden wijst wachtende campagnemail direct af",
    wachtrijNaAfmelding.every(w => w.status === "afgewezen"),
    JSON.stringify(wachtrijNaAfmelding.map(w => w.status)));

  console.log("\n7) Onbestelbaar valt óók uit de doelgroep");
  await db.update(crmContactpersonenTable)
    .set({ mailToestemming: true, mailAfgemeldOp: null, mailOnbestelbaarOp: new Date(), mailOnbestelbaarReden: "bewijs: harde bounce" })
    .where(eq(crmContactpersonenTable.id, cpMet!.id));
  const telOnbestelbaar = await api(s, "POST", "/marketing/doelgroepen/voorbeeld", { criteria: { branche: [BRANCHE] } });
  check("onbestelbaar → telling 0 ondanks toestemming", telOnbestelbaar.json?.aantal_leden === 0, JSON.stringify(telOnbestelbaar.json));

  console.log("\n8) Stoppen ruimt wachtende items op");
  const stop = await api(s, "POST", `/marketing/campagnes/${cmpId}/stoppen`, { reden: "bewijs" });
  check("stoppen → ok", stop.status === 200, `status=${stop.status} ${JSON.stringify(stop.json)}`);
  const wachtrijNa = await db.select().from(mailWachtrijTable)
    .where(eq(mailWachtrijTable.campagneOntvangerId, ontvangers[0]!.id));
  check("wachtrij-item afgewezen na stoppen",
    wachtrijNa.every(w => w.status === "afgewezen" || w.status === "verzonden"),
    JSON.stringify(wachtrijNa.map(w => w.status)));

  // ── Cleanup
  await db.delete(mailWachtrijTable).where(eq(mailWachtrijTable.campagneOntvangerId, ontvangers[0]!.id));
  await db.delete(marketingCampagnesTable).where(eq(marketingCampagnesTable.id, cmpId));
  await db.delete(marketingDoelgroepenTable).where(eq(marketingDoelgroepenTable.id, dgId));
  await db.delete(marketingSjablonenTable).where(eq(marketingSjablonenTable.id, sjb.json?.id));
  await db.delete(crmCommunicatieTable).where(eq(crmCommunicatieTable.klantId, klantId));
  await db.delete(crmContactpersonenTable).where(inArray(crmContactpersonenTable.id, [cpMet!.id, cpZonder!.id, cpGeenMail!.id]));
  await db.delete(crmKlantenTable).where(eq(crmKlantenTable.id, klantId));

  console.log(`\nResultaat: ${geslaagd} geslaagd, ${gefaald} gefaald`);
  process.exit(gefaald > 0 ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
