// Zet de AI-wachtrij toolboxen klaar tot 50 concepten en bewijst daarna de
// volledige bedrijfsketen end-to-end tegen de draaiende dev-omgeving:
//
//   1. Admin (hoofdbeheerder) logt in en genereert via de echte API in stappen
//      van 10 concepten tot er 50 AI-concepten in de reviewwachtrij staan.
//   2. Bewijs review: admin keurt 1 concept goed -> gepubliceerd (DB-verificatie).
//   3. Bewijs inplannen: admin maakt de maandopdracht voor de huidige maand aan.
//   4. Bewijs telefoonkant: een monteur-account haalt /mijn/toolbox-maandopdracht
//      op (zelfde endpoint als de FPS Monteur-app) en voltooit de opdracht
//      (DB-verificatie voltooid_op).
//   5. Opruimen: maandopdracht verwijderd (cascade wist statusrijen), het
//      bewijs-concept terug naar de wachtrij, e2e-accounts gearchiveerd.
//
// Faalt een stap, dan stopt het script met exitcode 1. Idempotent: bij een
// wachtrij die al op 50 staat wordt niets extra gegenereerd.
//
// Draaien: pnpm --filter @workspace/scripts run toolbox-50-klaarzetten
import { and, count, desc, eq } from "drizzle-orm";

import { db, veiligheidToolboxenTable, toolboxMaandOpdrachtenTable, toolboxMaandStatusTable } from "@workspace/db";

import {
  E2E_WW_ADMIN_EMAIL,
  E2E_WW_ADMIN_WACHTWOORD,
  archiveerE2eWachtwoordAccounts,
  genereerVersAdminTotp,
  setupE2eWachtwoordAccounts,
} from "./e2e-wachtwoord-testaccounts";
import {
  E2E_EMAIL,
  E2E_WACHTWOORD,
  archiveerE2eAccount,
  genereerVersTotp,
  setupE2eAccount,
} from "./e2e-monteur-testaccount";

// Direct tegen de lokale api-server: de externe dev-tunnel verbreekt lange
// AI-verzoeken. Met X-Forwarded-Proto: https (trust proxy staat aan) wordt de
// Secure-sessiecookie gewoon gezet, dus login werkt ook via localhost.
const BASIS = "http://localhost:8080/api";
const DOEL_WACHTRIJ = 50;

class Sessie {
  private cookies = new Map<string, string>();

  async fetch(pad: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    headers.set("X-Forwarded-Proto", "https");
    if (init?.body) headers.set("Content-Type", "application/json");
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
  patch(pad: string, body: unknown): Promise<Response> {
    return this.fetch(pad, { method: "PATCH", body: JSON.stringify(body) });
  }
  del(pad: string): Promise<Response> {
    return this.fetch(pad, { method: "DELETE" });
  }
  get(pad: string): Promise<Response> {
    return this.fetch(pad);
  }
}

function faal(stap: string, detail: string): never {
  throw new Error(`FAIL — ${stap}: ${detail}`);
}

function eis(voorwaarde: boolean, stap: string, detail: string): void {
  if (!voorwaarde) faal(stap, detail);
}

async function json<T = any>(res: Response): Promise<T> {
  const tekst = await res.text();
  try {
    return JSON.parse(tekst) as T;
  } catch {
    return tekst as unknown as T;
  }
}

function log(regel: string): void {
  console.log(regel);
}

async function wachtrijAantal(): Promise<number> {
  const [rij] = await db
    .select({ c: count() })
    .from(veiligheidToolboxenTable)
    .where(and(eq(veiligheidToolboxenTable.aiGegenereerd, true), eq(veiligheidToolboxenTable.gepubliceerd, false)));
  return Number(rij?.c ?? 0);
}

async function login(sessie: Sessie, email: string, wachtwoord: string, totp: () => Promise<string>, stap: string): Promise<void> {
  const r1 = await sessie.post("/auth/login", { email, wachtwoord });
  const b1 = await json(r1);
  eis(r1.status === 200 && b1.status === "verify_2fa", stap, `login gaf ${r1.status} ${JSON.stringify(b1)}`);
  const r2 = await sessie.post("/auth/2fa/verify", { code: await totp() });
  const b2 = await json(r2);
  eis(r2.status === 200 && Number.isFinite(Number(b2?.id)), stap, `2fa/verify gaf ${r2.status} ${JSON.stringify(b2).slice(0, 200)}`);
}

// Canonieke categorielijst — moet gelijk blijven aan de frontend
// (artifacts/firevault/src/pages/veiligheid/toolboxen.tsx) en de whitelist in
// het batch-endpoint; onbekende waarden geeft het endpoint een 400.
const CATEGORIEEN = [
  "brandveiligheid", "werken_op_hoogte", "pbm", "elektrisch",
  "bouwplaats", "gezondheid", "milieu", "machines", "overig",
];

// Voor de vangnet-opruiming in finally: aangemaakte testdata bijhouden zodat
// een mislukte run geen gepubliceerde testtoolbox of maandopdracht achterlaat.
let opruimOpdrachtId: number | null = null;
let opruimConceptId: number | null = null;

async function main(): Promise<void> {
  log(`Toolbox 50 klaarzetten — ${new Date().toISOString()} — doel: ${BASIS}`);

  await setupE2eWachtwoordAccounts();
  const monteurId = await setupE2eAccount();

  const admin = new Sessie();
  await login(admin, E2E_WW_ADMIN_EMAIL, E2E_WW_ADMIN_WACHTWOORD, genereerVersAdminTotp, "admin-login");
  log("STAP 0 PASS — admin (hoofdbeheerder) ingelogd");

  // ── STAP 1: wachtrij aanvullen tot 50 concepten ────────────────────────────
  // Let op: de dev-proxy kan de HTTP-verbinding verbreken terwijl de server de
  // AI-generatie gewoon afmaakt. Succes wordt daarom gemeten aan de DB-teller
  // (wachtrij groeit), niet aan de HTTP-respons. De server dedupliceert op
  // bestaande titels, dus een herhaalpoging levert geen duplicaten op.
  let inWachtrij = await wachtrijAantal();
  log(`STAP 1 — wachtrij bevat ${inWachtrij} AI-concepten (doel ${DOEL_WACHTRIJ})`);
  let zonderGroei = 0;
  while (inWachtrij < DOEL_WACHTRIJ && zonderGroei < 3) {
    const stap = Math.min(10, DOEL_WACHTRIJ - inWachtrij);
    const vorige = inWachtrij;
    try {
      const r = await admin.fetch("/veiligheid/toolboxen/ai-batch-genereer", {
        method: "POST",
        body: JSON.stringify({
          categorieen: CATEGORIEEN,
          aantal: stap,
          toelichting: "Gevarieerde onderwerpen voor maandelijkse toolboxmeetings van brandpreventie- en bouwplaatsmonteurs, verspreid over het hele jaar.",
        }),
        signal: AbortSignal.timeout(180_000),
      });
      const b = await json(r);
      if (r.status === 200 && b.aangemaakt) log(`  respons: +${b.aangemaakt} concepten (batch ${b.batch_id})`);
      else log(`  respons: ${r.status} ${JSON.stringify(b).slice(0, 200)}`);
    } catch (e) {
      log(`  geen HTTP-respons (${String(e).slice(0, 120)}) — server kan nog bezig zijn, DB-teller wordt gepeild`);
    }
    // Peil de DB-teller tot er groei is (server kan na een verbroken verbinding nog doorwerken).
    const deadline = Date.now() + 120_000;
    inWachtrij = await wachtrijAantal();
    while (inWachtrij <= vorige && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 10_000));
      inWachtrij = await wachtrijAantal();
    }
    if (inWachtrij > vorige) {
      zonderGroei = 0;
      log(`  wachtrij gegroeid: ${vorige} -> ${inWachtrij}`);
    } else {
      zonderGroei += 1;
      log(`  geen groei (blijft ${inWachtrij}) — poging ${zonderGroei}/3`);
    }
  }
  eis(inWachtrij >= DOEL_WACHTRIJ, "stap 1", `wachtrij bleef op ${inWachtrij} na herhaalde pogingen`);
  log(`STAP 1 PASS — ${inWachtrij} AI-concepten staan klaar voor review`);

  // ── STAP 2: review — admin keurt 1 concept goed ────────────────────────────
  const [concept] = await db
    .select({ id: veiligheidToolboxenTable.id, titel: veiligheidToolboxenTable.titel })
    .from(veiligheidToolboxenTable)
    .where(and(eq(veiligheidToolboxenTable.aiGegenereerd, true), eq(veiligheidToolboxenTable.gepubliceerd, false)))
    .orderBy(desc(veiligheidToolboxenTable.id))
    .limit(1);
  eis(!!concept, "stap 2", "geen concept gevonden in de wachtrij");
  opruimConceptId = concept.id;
  const rReview = await admin.patch(`/veiligheid/toolboxen/${concept.id}/review`, { besluit: "goedkeuren" });
  eis(rReview.status === 200, "stap 2", `review gaf ${rReview.status}`);
  const [naReview] = await db
    .select({ gepubliceerd: veiligheidToolboxenTable.gepubliceerd })
    .from(veiligheidToolboxenTable)
    .where(eq(veiligheidToolboxenTable.id, concept.id));
  eis(naReview?.gepubliceerd === true, "stap 2", "toolbox niet gepubliceerd na goedkeuren");
  log(`STAP 2 PASS — concept #${concept.id} ("${concept.titel}") goedgekeurd en gepubliceerd (DB-bewijs)`);

  // ── STAP 3: maandopdracht huidige maand aanmaken ───────────────────────────
  const nu = new Date();
  const rMaand = await admin.post("/veiligheid/toolbox-maandopdrachten", {
    toolbox_id: concept.id,
    jaar: nu.getFullYear(),
    maand: nu.getMonth() + 1,
  });
  const bMaand = await json(rMaand);
  let opdrachtId: number;
  if (rMaand.status === 409) {
    // Restant van een eerdere (mislukte) run: bestaande opdracht voor deze maand hergebruiken.
    const [bestaande] = await db
      .select({ id: toolboxMaandOpdrachtenTable.id })
      .from(toolboxMaandOpdrachtenTable)
      .where(and(eq(toolboxMaandOpdrachtenTable.jaar, nu.getFullYear()), eq(toolboxMaandOpdrachtenTable.maand, nu.getMonth() + 1)));
    eis(!!bestaande, "stap 3", "409 maar geen bestaande maandopdracht gevonden voor deze maand");
    opdrachtId = bestaande.id;
    log(`STAP 3 PASS — bestaande maandopdracht #${opdrachtId} hergebruikt voor ${nu.getFullYear()}-${nu.getMonth() + 1} (restant eerdere run)`);
  } else {
    eis(rMaand.status === 200 || rMaand.status === 201, "stap 3", `maandopdracht gaf ${rMaand.status} ${JSON.stringify(bMaand).slice(0, 200)}`);
    opdrachtId = Number(bMaand.id);
    eis(Number.isFinite(opdrachtId), "stap 3", `geen opdracht-id in respons: ${JSON.stringify(bMaand).slice(0, 200)}`);
    log(`STAP 3 PASS — maandopdracht #${opdrachtId} aangemaakt voor ${nu.getFullYear()}-${nu.getMonth() + 1}`);
  }
  opruimOpdrachtId = opdrachtId;

  // ── STAP 4: monteur ziet en voltooit de opdracht (telefoon-endpoint) ───────
  const monteur = new Sessie();
  await login(monteur, E2E_EMAIL, E2E_WACHTWOORD, genereerVersTotp, "monteur-login");
  const rMijn = await monteur.get("/mijn/toolbox-maandopdracht");
  const bMijn = await json(rMijn);
  if (rMijn.status !== 200) {
    // Tijdelijke diagnose: welke cookies had de monteur-sessie en wat kwam terug?
    log(`  DEBUG monteur-cookienamen: ${JSON.stringify([...(monteur as unknown as { cookies: Map<string, string> }).cookies.keys()])}`);
    log(`  DEBUG mijn-responsheaders: ${JSON.stringify([...rMijn.headers.entries()])}`);
  }
  eis(
    rMijn.status === 200 && bMijn && bMijn.toolbox_id === concept.id && bMijn.jaar === nu.getFullYear() && bMijn.maand === nu.getMonth() + 1,
    "stap 4",
    `mijn-opdracht gaf ${rMijn.status} ${JSON.stringify(bMijn).slice(0, 300)}`,
  );
  eis(typeof bMijn.toolbox_titel === "string" && bMijn.toolbox_titel.length > 0, "stap 4", "toolbox-titel ontbreekt in mijn-opdracht");
  const statusId = Number(bMijn.id);
  const rVoltooi = await monteur.post(`/mijn/toolbox-maandopdracht/${statusId}/voltooien`, {});
  eis(rVoltooi.status === 200, "stap 4", `voltooien gaf ${rVoltooi.status}`);
  const [statusRij] = await db
    .select({ voltooIdOp: toolboxMaandStatusTable.voltooIdOp, gebruikerId: toolboxMaandStatusTable.gebruikerId })
    .from(toolboxMaandStatusTable)
    .where(eq(toolboxMaandStatusTable.id, statusId));
  eis(!!statusRij?.voltooIdOp && statusRij.gebruikerId === monteurId, "stap 4", "voltooid_op niet gezet in DB");
  log(`STAP 4 PASS — monteur zag maandopdracht "${bMijn.toolbox_titel}" en voltooide deze (DB-bewijs voltooid_op)`);

  // ── STAP 5: opruimen ───────────────────────────────────────────────────────
  const rDel = await admin.del(`/veiligheid/toolbox-maandopdrachten/${opdrachtId}`);
  eis(rDel.status === 200 || rDel.status === 204, "stap 5", `verwijderen maandopdracht gaf ${rDel.status}`);
  opruimOpdrachtId = null;
  const rTerug = await admin.patch(`/veiligheid/toolboxen/${concept.id}`, { gepubliceerd: false });
  eis(rTerug.status === 200, "stap 5", `terugzetten naar concept gaf ${rTerug.status}`);
  opruimConceptId = null;
  const [restOpdrachten] = await db.select({ c: count() }).from(toolboxMaandOpdrachtenTable);
  const eindWachtrij = await wachtrijAantal();
  eis(eindWachtrij >= DOEL_WACHTRIJ, "stap 5", `wachtrij is ${eindWachtrij} na opruimen`);
  log(`STAP 5 PASS — opgeruimd: 0 testopdrachten over (${Number(restOpdrachten?.c ?? 0)} maandopdrachten totaal), wachtrij ${eindWachtrij} concepten`);

  log("ALLE STAPPEN PASS — 50 AI-concepten klaargezet en volledige keten (genereren -> review -> inplannen -> telefoon -> voltooien) bewezen.");
}

main()
  .catch((err) => {
    console.error(String(err?.message ?? err));
    process.exitCode = 1;
  })
  .finally(async () => {
    // Vangnet: een mislukte run mag geen testmaandopdracht of gepubliceerde
    // testtoolbox achterlaten. Gericht op id, nooit tabel-breed.
    try {
      if (opruimOpdrachtId !== null) {
        await db.delete(toolboxMaandOpdrachtenTable).where(eq(toolboxMaandOpdrachtenTable.id, opruimOpdrachtId));
        log(`vangnet: maandopdracht #${opruimOpdrachtId} verwijderd (run was niet volledig)`);
      }
      if (opruimConceptId !== null) {
        await db
          .update(veiligheidToolboxenTable)
          .set({ gepubliceerd: false, bijgewerktOp: new Date() })
          .where(eq(veiligheidToolboxenTable.id, opruimConceptId));
        log(`vangnet: toolbox #${opruimConceptId} terug naar concept (run was niet volledig)`);
      }
    } catch (e) {
      console.error(`vangnet-opruiming mislukt: ${String(e)}`);
    }
    try {
      await archiveerE2eWachtwoordAccounts();
      await archiveerE2eAccount();
      log("e2e-accounts gearchiveerd");
    } catch (e) {
      console.error(`archiveren e2e-accounts mislukt: ${String(e)}`);
    }
    process.exit(process.exitCode ?? 0);
  });
