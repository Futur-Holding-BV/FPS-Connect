/**
 * SENTRY_AAN_01 — bewijsscript (dev).
 *
 * V1: GET /api/monitoring-config is publiek en geeft dsn/commit terug (dsn null zonder env).
 * V2: POST /api/monitoring-testfout is hoofdbeheerder-only (403 voor gewone gebruiker).
 * V3: testfout door hoofdbeheerder → 500 met verwijzingscode (het Sentry-pad).
 * V4: "Dit werkt niet" door een gewone ingelogde gebruiker → 201, landt als
 *     actiepunt (categorie meldingen) met gebruiker/pagina/tijdstip/handeling/tekst.
 * V5: zonder tekst → 400; zonder login → 401.
 *
 * Draait tegen de lokale api-server; testaccounts worden na afloop gearchiveerd.
 */
import { db, gebruikersTable, actiepuntenTable } from "@workspace/db";
import { eq, like } from "drizzle-orm";
import { hash } from "bcryptjs";
import { authenticator } from "otplib";

const TOTPS = new Map<string, string>();

const BASIS = process.env["API_BASIS"] ?? `https://${process.env["REPLIT_DEV_DOMAIN"]}/api`;
const WACHTWOORD = "SentryAan01!bewijs";

function faal(msg: string): never { console.error(`❌ ${msg}`); process.exit(1); }
function ok(msg: string): void { console.log(`✅ ${msg}`); }

async function maakAccount(email: string, naam: string, rol: string): Promise<number> {
  const ww = await hash(WACHTWOORD, 10);
  const totp = authenticator.generateSecret();
  TOTPS.set(email, totp);
  const [rij] = await db.insert(gebruikersTable).values({
    email, naam, rol, wachtwoord: ww, actief: true, totpSecret: totp, tweeFactorIngeschakeld: true,
  } as typeof gebruikersTable.$inferInsert).returning({ id: gebruikersTable.id });
  return rij!.id;
}

async function login(email: string): Promise<string> {
  const r = await fetch(`${BASIS}/auth/mobile/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, wachtwoord: WACHTWOORD, code: authenticator.generate(TOTPS.get(email)!) }),
  });
  if (!r.ok) faal(`login ${email} → ${r.status}: ${await r.text()}`);
  const j = (await r.json()) as { token?: string };
  if (!j.token) faal(`login ${email}: geen token`);
  return j.token;
}

async function api(token: string | null, methode: string, pad: string, body?: unknown) {
  const r = await fetch(`${BASIS}${pad}`, {
    method: methode,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json: unknown = null;
  try { json = await r.json(); } catch { /* leeg */ }
  return { status: r.status, json };
}

async function main(): Promise<void> {
  const stempel = Date.now();
  const hbEmail = `sentry01-hb-${stempel}@voorbeeld.example`;
  const gbEmail = `sentry01-gb-${stempel}@voorbeeld.example`;
  const hbId = await maakAccount(hbEmail, "Sentry01 Hoofdbeheerder", "hoofdbeheerder");
  const gbId = await maakAccount(gbEmail, "Sentry01 Gebruiker", "gebruiker");
  const opruimActiepunten: number[] = [];
  try {
    const hb = await login(hbEmail);
    const gb = await login(gbEmail);
    ok("Testaccounts aangemaakt en ingelogd (hoofdbeheerder + gewone gebruiker)");

    // V1 — publieke monitoring-config
    const v1 = await fetch(`${BASIS}/monitoring-config`);
    if (v1.status !== 200) faal(`V1 monitoring-config → ${v1.status}`);
    const cfg = (await v1.json()) as { sentry_dsn_web: string | null; commit: string | null };
    if (!("sentry_dsn_web" in cfg) || !cfg.commit) faal(`V1: onverwachte config: ${JSON.stringify(cfg)}`);
    ok(`V1 Monitoring-config publiek bereikbaar (dsn_web=${cfg.sentry_dsn_web ? "gezet" : "leeg (dev)"}, commit=${cfg.commit})`);

    // V2 — testfout niet voor gewone gebruikers
    const v2 = await api(gb, "POST", "/monitoring-testfout");
    if (v2.status !== 403) faal(`V2: testfout door gewone gebruiker moet 403 geven, kreeg ${v2.status}`);
    ok("V2 Bewuste testfout is hoofdbeheerder-only (403 voor gewone gebruiker)");

    // V3 — testfout → 500 met verwijzingscode (het pad dat naar Sentry stuurt)
    const v3 = await api(hb, "POST", "/monitoring-testfout");
    const v3j = v3.json as { verwijzingscode?: string; error?: string } | null;
    if (v3.status !== 500 || !v3j?.verwijzingscode?.startsWith("FPS-")) {
      faal(`V3: verwacht 500 + verwijzingscode, kreeg ${v3.status}: ${JSON.stringify(v3.json)}`);
    }
    ok(`V3 Testfout loopt door de centrale foutafhandelaar (500, verwijzingscode ${v3j.verwijzingscode}) — mét DSN gaat exact dit event naar Sentry`);

    // V4 — Dit werkt niet door gewone gebruiker → actiepunt
    const v4 = await api(gb, "POST", "/dit-werkt-niet", {
      tekst: "De knop Opslaan doet niets (bewijsscript)",
      pagina: "/gebouwen/42?tab=uitvoering",
      laatste_handeling: "Opslaan (14:02:11)",
    });
    const v4j = v4.json as { id?: number } | null;
    if (v4.status !== 201 || !v4j?.id) faal(`V4 → ${v4.status}: ${JSON.stringify(v4.json)}`);
    opruimActiepunten.push(v4j.id);
    const [punt] = await db.select().from(actiepuntenTable).where(eq(actiepuntenTable.id, v4j.id));
    if (!punt) faal("V4: actiepunt niet gevonden in DB");
    if (punt.categorie !== "meldingen") faal(`V4: categorie=${punt.categorie}, verwacht meldingen`);
    const oms = punt.omschrijving ?? "";
    for (const verwacht of ["Sentry01 Gebruiker", "/gebouwen/42", "Tijdstip:", "Opslaan (14:02:11)", "bewijsscript"]) {
      if (!oms.includes(verwacht) && !punt.titel.includes(verwacht)) faal(`V4: '${verwacht}' ontbreekt in actiepunt:\n${punt.titel}\n${oms}`);
    }
    ok(`V4 "Dit werkt niet" landt als actiepunt #${punt.id} (categorie meldingen) met gebruiker, pagina, tijdstip, laatste handeling en tekst`);

    // V5 — validatie en auth
    const v5a = await api(gb, "POST", "/dit-werkt-niet", { tekst: "   ", pagina: "/x" });
    if (v5a.status !== 400) faal(`V5a: lege tekst moet 400 geven, kreeg ${v5a.status}`);
    const v5b = await api(null, "POST", "/dit-werkt-niet", { tekst: "test", pagina: "/x" });
    if (v5b.status !== 401) faal(`V5b: zonder login moet 401 geven, kreeg ${v5b.status}`);
    ok("V5 Lege tekst → 400; zonder login → 401");

    console.log("\n🎉 SENTRY_AAN_01: alle bewijspunten geslaagd");
  } finally {
    for (const id of opruimActiepunten) {
      await db.delete(actiepuntenTable).where(eq(actiepuntenTable.id, id));
    }
    await db.update(gebruikersTable).set({ actief: false, email: `gearchiveerd-${Date.now()}-${hbId}@voorbeeld.example` }).where(eq(gebruikersTable.id, hbId));
    await db.update(gebruikersTable).set({ actief: false, email: `gearchiveerd-${Date.now()}-${gbId}@voorbeeld.example` }).where(eq(gebruikersTable.id, gbId));
    // Veiligheidsnet: eventuele reststempels van eerdere runs niet — alleen eigen accounts.
    void like;
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
