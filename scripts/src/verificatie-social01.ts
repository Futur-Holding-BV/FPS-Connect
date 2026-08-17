// SOCIAL_01 — bewijsscript. Test via HTTP (nooit api-server-source importeren)
// + @workspace/db voor opzet/controle. Draaien:
//   pnpm --filter @workspace/scripts run tsx src/verificatie-social01.ts
//
// Bewijst conform de spec:
//  1. Kanaaleisen komen van de server (fail-closed bron voor de opsteller).
//  2. Onplanbaar bericht (TikTok zonder video / Instagram zonder media / te
//     lange tekst) is NIET te plannen: 422 met redenen — geen poging achteraf.
//  3. Geldig bericht doorloopt concept → klaar → gepland.
//  4. Publicatieplanner: zonder werkende kanaal-API wordt het bericht nooit
//     stilzwijgend "geplaatst" — kanaalrij eindigt op mislukt/concept en er
//     staat ALTIJD een werkbak-taak (bron social_publicatie) voor de planner.
//  5. Koppelingen-CRUD (crm 4) — tokens nooit in het antwoord.
import { authenticator } from "otplib";
import { eq, and, like, inArray } from "drizzle-orm";
import {
  db, werkbakItemsTable, socialBerichtenTable, socialBerichtKanalenTable, socialKoppelingenTable, werkgeversTable,
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
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, wachtwoord }),
  });
  const cookie = (r1.headers.get("set-cookie") ?? "").split(";")[0]!;
  const j1 = (await r1.json()) as { status?: string };
  if (j1.status === "verify_2fa" || j1.status === "setup_2fa") {
    const code = authenticator.generate(totpSecret);
    const r2 = await fetch(`${BASIS}/auth/2fa/verify`, {
      method: "POST", headers: { "Content-Type": "application/json", cookie },
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

async function opruimen() {
  const testBerichten = await db.select({ id: socialBerichtenTable.id }).from(socialBerichtenTable)
    .where(like(socialBerichtenTable.tekst, "%[SOCIAL01-BEWIJS]%"));
  const ids = testBerichten.map((b) => b.id);
  if (ids.length) {
    const kanaalRijen = await db.select({ id: socialBerichtKanalenTable.id }).from(socialBerichtKanalenTable)
      .where(inArray(socialBerichtKanalenTable.berichtId, ids));
    if (kanaalRijen.length) {
      await db.delete(werkbakItemsTable).where(inArray(werkbakItemsTable.dedupSleutel, kanaalRijen.map((k) => `social_publicatie:${k.id}`)));
    }
    await db.delete(socialBerichtenTable).where(inArray(socialBerichtenTable.id, ids));
  }
  await db.delete(socialKoppelingenTable).where(eq(socialKoppelingenTable.accountNaam, "[SOCIAL01-BEWIJS] account"));
}

async function main() {
  console.log("— SOCIAL_01 bewijsscript —");
  await setupE2eWebAdminAccount();
  await opruimen();
  const admin = await login(E2E_WEB_ADMIN_EMAIL, E2E_WEB_ADMIN_WACHTWOORD, E2E_WEB_ADMIN_TOTP_SECRET);
  const [werkgever] = await db.select().from(werkgeversTable).limit(1);
  if (!werkgever) throw new Error("Geen werkgever in dev-DB");
  console.log(`Werkmaatschappij: #${werkgever.id} ${werkgever.naam}`);

  // 1. Kanaaleisen van de server
  const eisen = await api(admin, "GET", "/social/kanaaleisen");
  const lijst = eisen.json as Array<{ kanaal: string; media_verplicht: boolean; video: string; max_per_dag: number | null; tekst_max: number }>;
  check("kanaaleisen: 200 + 4 kanalen", eisen.status === 200 && lijst.length === 4);
  const tiktok = lijst.find((e) => e.kanaal === "tiktok");
  const insta = lijst.find((e) => e.kanaal === "instagram");
  check("TikTok: alleen video", tiktok?.video === "verplicht" && tiktok?.media_verplicht === true);
  check("Instagram: media verplicht + 25/dag", insta?.media_verplicht === true && insta?.max_per_dag === 25);

  // 2. Onplanbaar bericht: TikTok zonder video + Instagram zonder media + te lange LinkedIn-tekst
  const teLang = "x".repeat(3100);
  const fout = await api(admin, "POST", "/social/berichten", {
    werkgever_id: werkgever.id, tekst: `${teLang} [SOCIAL01-BEWIJS]`,
    kanalen: ["tiktok", "instagram", "linkedin"],
  });
  check("onplanbaar bericht aangemaakt als concept", fout.status === 201);
  const foutId = (fout.json as { id: number }).id;
  await api(admin, "POST", `/social/berichten/${foutId}/klaar`);
  const planFout = await api(admin, "POST", `/social/berichten/${foutId}/plannen`, { gepland_op: new Date(Date.now() + 3600_000).toISOString() });
  const redenen = (planFout.json as { redenen?: string[] })?.redenen ?? [];
  check("plannen geweigerd met 422 (fail-closed)", planFout.status === 422, JSON.stringify(planFout.json));
  check("reden: TikTok eist video", redenen.some((r) => r.includes("TikTok")), redenen.join(" | "));
  check("reden: Instagram eist media", redenen.some((r) => r.includes("Instagram")));
  check("reden: LinkedIn-tekst te lang", redenen.some((r) => r.includes("LinkedIn") && r.includes("maximum")));
  const naFout = await api(admin, "GET", `/social/berichten/${foutId}`);
  check("bericht bleef 'klaar' (geen halve planning)", (naFout.json as { status: string }).status === "klaar");

  // 3. Geldig bericht: concept → klaar → gepland (in het verleden zodat de planner 'm oppakt)
  const goed = await api(admin, "POST", "/social/berichten", {
    werkgever_id: werkgever.id, tekst: "Trotse blik op ons brandveiligheidsproject. [SOCIAL01-BEWIJS]",
    kanalen: ["linkedin"],
  });
  const goedId = (goed.json as { id: number }).id;
  check("geldig bericht aangemaakt", goed.status === 201 && goedId > 0);
  const teVroeg = await api(admin, "POST", `/social/berichten/${goedId}/plannen`, { gepland_op: new Date().toISOString() });
  check("plannen vóór 'klaar' geweigerd (statusmachine)", teVroeg.status === 409);
  await api(admin, "POST", `/social/berichten/${goedId}/klaar`);
  const plan = await api(admin, "POST", `/social/berichten/${goedId}/plannen`, { gepland_op: new Date(Date.now() - 60_000).toISOString() });
  check("geldig bericht gepland", plan.status === 200, JSON.stringify(plan.json));

  // 4. Publicatieplanner (tikt elke 60s): zonder API-koppeling → nooit stil,
  //    kanaalrij wordt 'mislukt' + werkbak-taak voor de planner.
  console.log("  … wachten op planner-tick (max 150s)");
  let kanaalRij: { id: number; plaatsingStatus: string; laatsteFout: string | null } | undefined;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const rijen = await db.select().from(socialBerichtKanalenTable).where(eq(socialBerichtKanalenTable.berichtId, goedId));
    if (rijen[0] && rijen[0].plaatsingStatus !== "wachtend") { kanaalRij = rijen[0]; break; }
  }
  check("planner heeft de kanaalrij afgehandeld", !!kanaalRij, "nog steeds 'wachtend' na 150s");
  check("uitkomst = mislukt (geen koppeling; fail-closed, niet 'geplaatst')", kanaalRij?.plaatsingStatus === "mislukt", kanaalRij?.plaatsingStatus);
  check("reden vastgelegd", !!kanaalRij?.laatsteFout, "laatste_fout leeg");
  if (kanaalRij) {
    const [taak] = await db.select().from(werkbakItemsTable)
      .where(and(eq(werkbakItemsTable.dedupSleutel, `social_publicatie:${kanaalRij.id}`), eq(werkbakItemsTable.status, "open")));
    check("werkbak-taak aangemaakt (bron social_publicatie)", !!taak && taak.bron === "social_publicatie");
    check("taak wijst naar het bericht", taak?.actiePad === `/crm/social?bericht=${goedId}`, taak?.actiePad ?? "-");
  }
  const [berichtNa] = await db.select().from(socialBerichtenTable).where(eq(socialBerichtenTable.id, goedId));
  check("bericht-uitkomst eerlijk: 'mislukt' (géén kanaal slaagde — niet 'geplaatst')", berichtNa?.status === "mislukt", berichtNa?.status);

  // 5. Koppelingen-CRUD; tokens nooit in het antwoord
  const kop = await api(admin, "POST", "/social/koppelingen", {
    werkgever_id: werkgever.id, kanaal: "linkedin", account_naam: "[SOCIAL01-BEWIJS] account", modus: "klaarzetten",
  });
  check("koppeling aangemaakt", kop.status === 201);
  const kopId = (kop.json as { id: number }).id;
  const dubbel = await api(admin, "POST", "/social/koppelingen", {
    werkgever_id: werkgever.id, kanaal: "linkedin", account_naam: "[SOCIAL01-BEWIJS] account", modus: "publiceren",
  });
  check("dubbele koppeling (zelfde wg+kanaal) geweigerd met 409", dubbel.status === 409);
  const lijstKop = await api(admin, "GET", "/social/koppelingen");
  const tekstKop = JSON.stringify(lijstKop.json);
  check("koppelingenlijst bevat geen token-velden", !tekstKop.includes("access_token") && !tekstKop.includes("refresh_token"));
  const patch = await api(admin, "PATCH", `/social/koppelingen/${kopId}`, { modus: "publiceren" });
  check("modus bijgewerkt", patch.status === 200 && (patch.json as { modus: string }).modus === "publiceren");
  const del = await api(admin, "DELETE", `/social/koppelingen/${kopId}`);
  check("koppeling verwijderd", del.status === 200);

  await opruimen();
  console.log(`\nResultaat: ${geslaagd} geslaagd, ${gefaald} gefaald`);
  process.exit(gefaald === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
