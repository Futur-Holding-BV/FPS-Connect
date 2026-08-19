// Taak 1091 — bewijsscript. Twee scenario's:
// 1. Fred van Wallinga (Timmerman, FPS Bouw en Renovatie): wizard-voortgang
//    wordt per stap in één nesting bewaard en is bij hervatten terug te lezen
//    (incl. functie en werkmaatschappij); legacy dubbel-geneste concepten
//    blijven leesbaar via de terugval in de herstel-logica.
// 2. Fernando (ZZP-timmerman, ingehuurd door FPS Bouw): dienstverband zzp met
//    eigen bedrijfsnaam apart (zzp_bedrijfsnaam) en de inhurende partij als
//    echte koppeling (uitzendbureau_id → crm_klanten).
// Draaien: pnpm --filter @workspace/scripts run tsx src/verificatie-onboarding-1091.ts
import "./lib/prodGuard";
import { authenticator } from "otplib";
import { eq, inArray } from "drizzle-orm";
import {
  db, gebruikersTable, medewerkersTable, functiesTable, crmKlantenTable, werkgeversTable,
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
  return { status: r.status, json: json as Record<string, unknown> };
}

// Kopie van de herstel-selectie uit onboarden.tsx (welke bron + welk veld):
// nieuwste niet-lege stap_N, veld `form` (nieuw) of `voortgang_data` (legacy),
// terugval naar het buitenste niveau voor pre-stap-formaat.
function kiesBron(data: Record<string, unknown>, huidig: number): Record<string, unknown> {
  const isGevuld = (e: unknown): e is Record<string, unknown> =>
    !!e && typeof e === "object" && Object.keys(e as object).length > 0;
  const stapNummers = Object.keys(data)
    .filter((k) => /^stap_\d+$/.test(k))
    .map((k) => Number(k.slice(5)))
    .filter((n) => isGevuld(data[`stap_${n}`]));
  const kandidaat =
    stapNummers.includes(huidig) ? huidig
    : stapNummers.filter((n) => n < huidig).sort((a, b) => b - a)[0]
      ?? stapNummers.sort((a, b) => b - a)[0];
  return kandidaat !== undefined ? (data[`stap_${kandidaat}`] as Record<string, unknown>) : data;
}

function herstelForm(data: Record<string, unknown>, huidig: number): Record<string, unknown> {
  const bron = kiesBron(data, huidig);
  let vd = ((bron.form ?? bron.voortgang_data) as Record<string, unknown> | undefined) ?? {};
  if (vd && typeof vd.voortgang_data === "object" && vd.voortgang_data !== null) {
    vd = vd.voortgang_data as Record<string, unknown>;
  }
  return vd;
}

// Zelfde selectie, maar levert de laag op waar cvExtra e.d. staan.
function herstelBron(data: Record<string, unknown>, huidig: number): Record<string, unknown> {
  const bron = kiesBron(data, huidig);
  const vd = (bron.form ?? bron.voortgang_data) as Record<string, unknown> | undefined;
  if (vd && typeof vd.voortgang_data === "object" && vd.voortgang_data !== null) {
    return vd; // dubbel genest: wrapper bevat cvExtra e.d.
  }
  return bron;
}

const FRED_EMAIL = "fred.wallinga.1091@fps.local";
const FERNANDO_EMAIL = "fernando.zzp.1091@fps.local";

async function maakTestGebruiker(naam: string, email: string): Promise<number> {
  const [bestaand] = await db.select({ id: gebruikersTable.id }).from(gebruikersTable).where(eq(gebruikersTable.email, email));
  if (bestaand) return bestaand.id;
  const [g] = await db.insert(gebruikersTable).values({ naam, email, rol: "gebruiker", actief: true }).returning({ id: gebruikersTable.id });
  return g!.id;
}

async function ruimOp() {
  const gebruikers = await db.select({ id: gebruikersTable.id }).from(gebruikersTable)
    .where(inArray(gebruikersTable.email, [FRED_EMAIL, FERNANDO_EMAIL]));
  const ids = gebruikers.map((g) => g.id);
  if (ids.length > 0) {
    await db.delete(medewerkersTable).where(inArray(medewerkersTable.gebruikerId, ids));
    await db.delete(gebruikersTable).where(inArray(gebruikersTable.id, ids));
  }
}

async function main() {
  console.log("— Taak 1091 bewijsscript —");
  await setupE2eWebAdminAccount();
  await ruimOp(); // schone start (restanten van eerdere runs)
  const admin = await login(E2E_WEB_ADMIN_EMAIL, E2E_WEB_ADMIN_WACHTWOORD, E2E_WEB_ADMIN_TOTP_SECRET);

  // Opzoekwerk: functie Timmerman + werkgever FPS Bouw en Renovatie
  const functies = await db.select({ id: functiesTable.id, naam: functiesTable.naam }).from(functiesTable);
  const timmerman = functies.find((f) => f.naam.trim().toLowerCase() === "timmerman") ?? functies[0]!;
  const werkgevers = await db.select({ id: werkgeversTable.id, naam: werkgeversTable.naam }).from(werkgeversTable);
  const fpsBouw = werkgevers.find((w) => w.naam.toLowerCase().includes("bouw")) ?? werkgevers[0]!;
  console.log(`Functie: #${timmerman.id} ${timmerman.naam}; werkgever: ${fpsBouw.naam}`);

  try {
    // ── Scenario 1: Fred — wizard onderbreken/hervatten ──
    console.log("\nScenario 1 — Fred van Wallinga (wizard-persistentie):");
    const fredGebruikerId = await maakTestGebruiker("Fred van Wallinga", FRED_EMAIL);
    const maak = await api(admin, "POST", "/medewerkers", { naam: "Fred van Wallinga", gebruiker_id: fredGebruikerId });
    check("concept-medewerker aangemaakt", maak.status === 201 || maak.status === 200, `status ${maak.status}: ${JSON.stringify(maak.json)}`);
    const fredId = maak.json.id as number;

    const formData = {
      naam: "Fred van Wallinga",
      functie_id: timmerman.id,
      werkmaatschappij: fpsBouw.naam,
      dienstverband: "vast",
      contracturen_per_week: "38",
    };
    const p1 = await api(admin, "PATCH", `/medewerkers/${fredId}/wizard-voortgang`, {
      stap: 3, versie: 0, medewerker_status: "concept",
      voortgang_data: { form: formData, cvExtra: { mobiel: "0612345678" }, geselecteerdeMiddelen: ["laptop"], onboardingTaken: {}, onboardingDeadlines: {} },
    });
    check("wizard-voortgang stap 3 opgeslagen", p1.status === 200, `status ${p1.status}`);

    // "Onderbreken en hervatten": status opnieuw ophalen zoals de wizard doet
    const st = await api(admin, "GET", `/medewerkers/${fredId}/wizard-status`);
    check("wizard-status opgehaald", st.status === 200, `status ${st.status}`);
    const voortgang = (st.json.wizard_voortgang ?? {}) as Record<string, unknown>;
    const stap3 = voortgang.stap_3 as Record<string, unknown> | undefined;
    check("data staat één keer genest onder stap_3.form", !!stap3 && typeof stap3.form === "object" && !("voortgang_data" in ((stap3?.form ?? {}) as object)));
    const hersteld = herstelForm(voortgang, st.json.huidig_stap as number);
    check("hervatten vindt functie terug", hersteld.functie_id === timmerman.id, JSON.stringify(hersteld));
    check("hervatten vindt werkmaatschappij terug", hersteld.werkmaatschappij === fpsBouw.naam);
    check("huidig_stap = 3", st.json.huidig_stap === 3);

    // Regressie: doorgelopen tot stap 7, dan terug en op een eerdere stap
    // opnieuw bewaard — hervatten moet de NIEUWE (eerdere) snapshot tonen,
    // niet de verouderde latere.
    await api(admin, "PATCH", `/medewerkers/${fredId}/wizard-voortgang`, {
      stap: 7, versie: p1.json.versie, voortgang_data: { form: { ...formData, functie_id: 999999, werkmaatschappij: "OUD-STALE" } },
    });
    const gewijzigd = { ...formData, contracturen_per_week: "32" };
    const pTerug = await api(admin, "PATCH", `/medewerkers/${fredId}/wizard-voortgang`, {
      stap: 4, versie: (p1.json.versie as number) + 1, voortgang_data: { form: gewijzigd, cvExtra: { mobiel: "0611111111" } },
    });
    const stT = await api(admin, "GET", `/medewerkers/${fredId}/wizard-status`);
    check("na teruggaan: huidig_stap = 4", stT.json.huidig_stap === 4);
    const dataT = (stT.json.wizard_voortgang ?? {}) as Record<string, unknown>;
    const hersteldT = herstelForm(dataT, stT.json.huidig_stap as number);
    check("na teruggaan: bewerkte data hersteld, niet de stale stap-7-snapshot",
      hersteldT.functie_id === timmerman.id && hersteldT.werkmaatschappij === fpsBouw.naam && hersteldT.contracturen_per_week === "32",
      JSON.stringify(hersteldT));
    const bronT = herstelBron(dataT, stT.json.huidig_stap as number);
    check("na teruggaan: cvExtra van de huidige stap hersteld", (bronT.cvExtra as Record<string, unknown> | undefined)?.mobiel === "0611111111");

    // Legacy A: het exacte payload-formaat dat de OUDE client naar de endpoint
    // stuurde (dubbel genest: voortgang_data.voortgang_data = form, met cvExtra
    // e.d. in de tussenwrapper), opgeslagen via de echte wizard-endpoint.
    await db.update(medewerkersTable).set({ wizardVoortgang: {} }).where(eq(medewerkersTable.id, fredId));
    const pOud = await api(admin, "PATCH", `/medewerkers/${fredId}/wizard-voortgang`, {
      stap: 4,
      versie: 0,
      voortgang_data: {
        voortgang_data: { ...formData },
        cvExtra: { mobiel: "0687654321" },
        geselecteerdeMiddelen: ["bus"],
        onboardingTaken: { contract: true },
        onboardingDeadlines: {},
      },
    });
    check("legacy payload via endpoint opgeslagen", pOud.status === 200, `status ${pOud.status}`);
    const st2 = await api(admin, "GET", `/medewerkers/${fredId}/wizard-status`);
    const dataOud = (st2.json.wizard_voortgang ?? {}) as Record<string, unknown>;
    const hersteldLegacy = herstelForm(dataOud, st2.json.huidig_stap as number);
    check("legacy (dubbel genest) formulier blijft leesbaar", hersteldLegacy.functie_id === timmerman.id && hersteldLegacy.werkmaatschappij === fpsBouw.naam, JSON.stringify(hersteldLegacy));
    const bronOud = herstelBron(dataOud, st2.json.huidig_stap as number);
    check("legacy cvExtra uit de juiste laag gelezen", (bronOud.cvExtra as Record<string, unknown> | undefined)?.mobiel === "0687654321", JSON.stringify(bronOud.cvExtra));
    check("legacy onboardingTaken uit de juiste laag gelezen", (bronOud.onboardingTaken as Record<string, unknown> | undefined)?.contract === true);

    // Legacy B: enkel genest (stap_N.voortgang_data = form, zonder wrapper)
    await db.update(medewerkersTable).set({
      wizardVoortgang: { _huidig_stap: 4, stap_4: { voortgang_data: { functie_id: timmerman.id, werkmaatschappij: fpsBouw.naam } } },
    }).where(eq(medewerkersTable.id, fredId));
    const st3 = await api(admin, "GET", `/medewerkers/${fredId}/wizard-status`);
    const hersteldEnkel = herstelForm((st3.json.wizard_voortgang ?? {}) as Record<string, unknown>, st3.json.huidig_stap as number);
    check("legacy (enkel genest) concept blijft leesbaar", hersteldEnkel.functie_id === timmerman.id && hersteldEnkel.werkmaatschappij === fpsBouw.naam, JSON.stringify(hersteldEnkel));

    // ── Scenario 2: Fernando — ZZP ingehuurd door FPS Bouw ──
    console.log("\nScenario 2 — Fernando (ZZP, ingehuurd door FPS Bouw):");
    // Inhurende partij als CRM-organisatie (type inlener); aanmaken indien afwezig.
    let [inlener] = await db.select({ id: crmKlantenTable.id }).from(crmKlantenTable).where(eq(crmKlantenTable.naam, fpsBouw.naam));
    if (!inlener) {
      [inlener] = await db.insert(crmKlantenTable).values({ naam: fpsBouw.naam, type: "inlener", status: "klant" }).returning({ id: crmKlantenTable.id });
    }
    const fernandoGebruikerId = await maakTestGebruiker("Fernando Costa", FERNANDO_EMAIL);
    const maakF = await api(admin, "POST", "/medewerkers", {
      naam: "Fernando Costa",
      gebruiker_id: fernandoGebruikerId,
      functie_id: timmerman.id,
      werkmaatschappij: fpsBouw.naam,
      dienstverband: "zzp",
      zzp_bedrijfsnaam: "Costa Timmerwerken",
      uitzendbureau_id: inlener!.id,
      bedrijf_uitzendbureau: fpsBouw.naam,
      in_dienst_sinds: "2026-08-01",
      uit_dienst_per: "2026-12-31",
    });
    check("zzp-medewerker aangemaakt", maakF.status === 201 || maakF.status === 200, `status ${maakF.status}: ${JSON.stringify(maakF.json)}`);
    const fernandoId = maakF.json.id as number;

    const lees = await api(admin, "GET", `/medewerkers/${fernandoId}`);
    check("dienstverband blijft zzp", lees.json.dienstverband === "zzp");
    check("eigen bedrijfsnaam apart bewaard", lees.json.zzp_bedrijfsnaam === "Costa Timmerwerken", String(lees.json.zzp_bedrijfsnaam));
    check("inhurende partij is echte koppeling", lees.json.uitzendbureau_id === inlener!.id, String(lees.json.uitzendbureau_id));
    check("inhurende partij naam afgeleid", lees.json.uitzendbureau_naam === fpsBouw.naam, String(lees.json.uitzendbureau_naam));
    check("functie Timmerman gekoppeld", lees.json.functie_id === timmerman.id);

    // Bewerken (zoals het medewerker-bewerkscherm): bedrijfsnaam wijzigen, koppeling behouden
    const upd = await api(admin, "PATCH", `/medewerkers/${fernandoId}`, {
      naam: "Fernando Costa", dienstverband: "zzp",
      zzp_bedrijfsnaam: "Costa Timmer & Montage", uitzendbureau_id: inlener!.id, bedrijf_uitzendbureau: fpsBouw.naam,
    });
    check("bewerken zzp-velden slaagt", upd.status === 200, `status ${upd.status}: ${JSON.stringify(upd.json)}`);
    const lees2 = await api(admin, "GET", `/medewerkers/${fernandoId}`);
    check("gewijzigde bedrijfsnaam teruggelezen", lees2.json.zzp_bedrijfsnaam === "Costa Timmer & Montage", String(lees2.json.zzp_bedrijfsnaam));
    check("koppeling na bewerken intact", lees2.json.uitzendbureau_id === inlener!.id);
  } finally {
    await ruimOp();
  }

  console.log(`\nResultaat: ${geslaagd} geslaagd, ${gefaald} gefaald`);
  if (gefaald > 0) process.exit(1);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
