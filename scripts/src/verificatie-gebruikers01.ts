// Bewijsscript GEBRUIKERS_01: toetst het echte geval — dienstverband oproep,
// nul contracturen, bepaalde tijd van zes maanden — end-to-end via de API,
// plus het Functiehuis als enige beheerbron en gesloten legacy profielmutaties.
// Draaien: pnpm --filter @workspace/scripts exec tsx src/verificatie-gebruikers01.ts
// Ruimt alle testdata (gebruiker, medewerker, contract) zelf op.
import "./lib/prodGuard";
import {
  setupE2eWebAdminAccount,
  archiveerE2eWebAdminAccount,
  genereerVersWebAdminTotp,
  E2E_WEB_ADMIN_EMAIL,
  E2E_WEB_ADMIN_WACHTWOORD,
} from "./e2e-monteur-testaccount";
import {
  maakWegwerpOnboardingGebruiker,
  verwijderWegwerpOnboardingGebruikers,
} from "./e2e-onboarding-testgebruikers";

const DOMEIN = process.env.REPLIT_DEV_DOMAIN;
if (!DOMEIN) {
  console.error("REPLIT_DEV_DOMAIN ontbreekt.");
  process.exit(1);
}
const BASIS = `https://${DOMEIN}/api`;

class Sessie {
  private cookies = new Map<string, string>();
  async fetch(pad: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
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
  patch(pad: string, body?: unknown): Promise<Response> {
    return this.fetch(pad, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) });
  }
  del(pad: string): Promise<Response> {
    return this.fetch(pad, { method: "DELETE" });
  }
  get(pad: string): Promise<Response> {
    return this.fetch(pad);
  }
}

async function json<T = any>(res: Response): Promise<T> {
  const t = await res.text();
  try { return JSON.parse(t) as T; } catch { return t as unknown as T; }
}

function eis(v: boolean, stap: string, detail: string): void {
  if (!v) throw new Error(`FAIL — ${stap}: ${detail}`);
}

function plusMaanden(iso: string, maanden: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setMonth(d.getMonth() + maanden);
  return d.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  console.log(`Verificatie GEBRUIKERS_01 — doel ${BASIS}`);
  await setupE2eWebAdminAccount();
  const s = new Sessie();

  const r1 = await s.post("/auth/login", { email: E2E_WEB_ADMIN_EMAIL, wachtwoord: E2E_WEB_ADMIN_WACHTWOORD });
  const b1 = await json(r1);
  eis(r1.status === 200 && b1.status === "verify_2fa", "login", `${r1.status} ${JSON.stringify(b1)}`);
  const r2 = await s.post("/auth/2fa/verify", { code: await genereerVersWebAdminTotp() });
  eis(r2.status === 200, "2fa", `${r2.status}`);
  console.log("STAP 1 PASS — ingelogd");

  // §1: één zichtbare beheerbron — functies met hun technische rechtenmatrix.
  const pr = await s.get("/functies-v2");
  const functiesV2 = await json<any[]>(pr);
  eis(pr.status === 200 && Array.isArray(functiesV2), "Functiehuis ophalen", `${pr.status}`);
  const namen = new Set(functiesV2.map((p) => p.naam));
  const vereist = ["Onderhoudsmonteur", "Externe inhuur", "Planner", "Calculatie", "Directie", "Wagenparkbeheerder", "Magazijnbeheerder"];
  const ontbreekt = vereist.filter((n) => !namen.has(n));
  eis(ontbreekt.length === 0, "functies aanwezig", `ontbreken in GET /functies-v2: ${ontbreekt.join(", ")}`);
  eis(functiesV2.every((f) => f.profiel_id != null), "expliciete rechtenkoppeling", "functie zonder profiel_id gevonden");
  console.log(`STAP 2 PASS — GET /functies-v2: ${functiesV2.length} functies; alle geconsolideerde namen hebben een expliciete rechtenkoppeling`);

  // §2: alleen Functiehuis mag muteren; losse profielmutaties zijn gesloten.
  const voorbeeld = functiesV2[0];
  eis(!!voorbeeld, "functie aanwezig", "geen functie gevonden");
  const rFunctie = await s.patch(`/functies-v2/${voorbeeld.id}`, {
    naam: voorbeeld.naam,
    bevoegdheden: voorbeeld.bevoegdheden,
  });
  eis(rFunctie.status === 200, "functie bewerken", `${rFunctie.status} ${JSON.stringify(await json(rFunctie))}`);
  const rProfielMaak = await s.post("/profielen", { naam: "vervallen", bevoegdheden: {} });
  const rProfielBewerk = await s.patch(`/profielen/${voorbeeld.profiel_id}`, { naam: "vervallen", bevoegdheden: {} });
  const rProfielVerwijder = await s.del(`/profielen/${voorbeeld.profiel_id}`);
  const rProfielToepassen = await s.post(`/profielen/${voorbeeld.profiel_id}/toepassen`, {});
  const rProfielenAanvullen = await s.post("/profielen/aanvullen", {});
  const rProfielenSynchroniseren = await s.post("/profielen/synchroniseer-standaard", {});
  const rProfielenAi = await s.post("/profielen/ai-voorstel", {});
  const profielStatussen = [
    rProfielMaak.status,
    rProfielBewerk.status,
    rProfielVerwijder.status,
    rProfielToepassen.status,
    rProfielenAanvullen.status,
    rProfielenSynchroniseren.status,
    rProfielenAi.status,
  ];
  eis(
    profielStatussen.every((status) => status === 410),
    "legacy profielmutaties gesloten",
    profielStatussen.join("/"),
  );
  const rLegacyFunctieMaak = await s.post("/functies", { naam: "mag-niet-worden-aangemaakt" });
  const rLegacyFunctieBewerk = await s.patch(`/functies/${voorbeeld.id}`, { actief: false });
  eis(
    rLegacyFunctieMaak.status === 410 && rLegacyFunctieBewerk.status === 410,
    "legacy functiemutaties gesloten",
    `${rLegacyFunctieMaak.status}/${rLegacyFunctieBewerk.status}`,
  );
  const rLegacyAccount = await s.post("/gebruikers", {
    naam: "mag-niet-worden-aangemaakt",
    email: `gebruikers01-legacy-${Date.now()}@fps.local`,
    rol: "gebruiker",
    bevoegdheden: { projecten: 4 },
  });
  const rLegacyOnboarding = await s.post("/medewerkers/onboarding-account", {
    naam: "mag-niet-worden-aangemaakt",
    email: `gebruikers01-profiel-${Date.now()}@fps.local`,
    profiel_id: voorbeeld.profiel_id,
  });
  const herkomstStatussen = await Promise.all([
    s.post("/gebruikers/1/herkomst-toepassen", {}).then((r) => r.status),
    s.post("/gebruikers/1/herkomst-bevestigen", {}).then((r) => r.status),
    s.post("/gebruikers/1/herkomst-verwijderen", {}).then((r) => r.status),
    s.post("/gebruikers/herkomst-bevestigen-bulk", {}).then((r) => r.status),
  ]);
  eis(
    rLegacyAccount.status === 410 &&
      rLegacyOnboarding.status === 410 &&
      herkomstStatussen.every((status) => status === 410),
    "legacy accountrechten gesloten",
    `${rLegacyAccount.status}/${rLegacyOnboarding.status}/${herkomstStatussen.join("/")}`,
  );
  console.log("STAP 3 PASS — functie bewerken werkt; alle legacy functie/profiel/accountrechtenmutaties geven 410");

  // §3: echte geval — oproep, 0 contracturen, bepaalde tijd van 6 maanden.
  const wegwerp = await maakWegwerpOnboardingGebruiker("GEBRUIKERS01 Toets");
  const vandaag = new Date().toISOString().slice(0, 10);
  const eind = plusMaanden(vandaag, 6);
  let medId: number | null = null;
  try {
    const fRes = await s.get("/functies-v2");
    const functies = await json<any[]>(fRes);
    eis(fRes.status === 200 && functies.length > 0, "functies", `${fRes.status}`);

    const rMed = await s.post("/medewerkers", {
      naam: wegwerp.naam,
      gebruiker_id: wegwerp.id,
      functie_id: functies[0].id,
      werkmaatschappij: "FPS Brandpreventie",
      cao: "Bouw & Infra",
      dienstverband: "oproep",
      contracturen_per_week: 0,
      contract_einddatum: eind,
      in_dienst_sinds: vandaag,
      jaar: new Date().getFullYear(),
    });
    const med = await json<any>(rMed);
    eis(rMed.status === 201 || rMed.status === 200, "onboarden oproep/0 uur", `${rMed.status} ${JSON.stringify(med)}`);
    medId = med.id;
    console.log(`STAP 4 PASS — POST /medewerkers met oproep + 0 contracturen + einddatum ${eind}: ${rMed.status}`);

    // Personeelskaart: dienstverband en uren staan goed.
    const rKaart = await s.get(`/medewerkers/${medId}`);
    const kaart = await json<any>(rKaart);
    eis(kaart.dienstverband === "oproep", "kaart dienstverband", `kreeg ${kaart.dienstverband}`);
    eis(Number(kaart.contracturen_per_week) === 0, "kaart contracturen", `kreeg ${kaart.contracturen_per_week}`);
    console.log("STAP 5 PASS — personeelskaart: dienstverband=oproep, contracturen=0");

    // Contractbewaking pikt het contract op: contracttype oproep + einddatum.
    const rCb = await s.get(`/contract-bewaking/medewerkers/${medId}`);
    const cb = await json<any>(rCb);
    const contracten: any[] = Array.isArray(cb) ? cb : (cb.contracten ?? []);
    eis(rCb.status === 200 && contracten.length === 1, "bewaking ziet contract", `${rCb.status} ${JSON.stringify(cb).slice(0, 300)}`);
    const c = contracten[0];
    eis(c.contracttype === "oproep", "contracttype", `kreeg ${c.contracttype}`);
    eis((c.eind_datum ?? c.eindDatum) === eind, "einddatum", `kreeg ${c.eind_datum ?? c.eindDatum}`);
    console.log(`STAP 6 PASS — contractbewaking: 1 contract, type=oproep, einddatum=${eind} (bewaking/aanzegtermijn loopt hierop mee)`);

    // Nul blijft écht nul en negatief blijft geweigerd.
    const rNeg = await s.post("/medewerkers", {
      naam: "mag-niet", gebruiker_id: wegwerp.id, functie_id: functies[0].id,
      werkmaatschappij: "FPS Brandpreventie", cao: "Bouw & Infra",
      dienstverband: "oproep", contracturen_per_week: -1, in_dienst_sinds: vandaag,
    });
    eis(rNeg.status === 400 || rNeg.status === 409, "negatieve uren geweigerd", `${rNeg.status}`);
    console.log(`STAP 7 PASS — negatieve contracturen geweigerd (${rNeg.status})`);
  } finally {
    if (medId != null) {
      const rDel = await s.del(`/medewerkers/${medId}`);
      console.log(`Opruimen: medewerker ${medId} verwijderd (${rDel.status})`);
      medId = null;
    }
  }

  // Wizard-pad: concept-POST (alleen naam+gebruiker, géén startdatum) mag geen
  // contract of fout opleveren; afronden via PATCH maakt exact één contract.
  const wizardGebruiker = await maakWegwerpOnboardingGebruiker("GEBRUIKERS01 Wizard");
  try {
    const rConcept = await s.post("/medewerkers", { naam: wizardGebruiker.naam, gebruiker_id: wizardGebruiker.id });
    const concept = await json<any>(rConcept);
    eis(rConcept.status === 201, "concept aanmaken", `${rConcept.status} ${JSON.stringify(concept)}`);
    medId = concept.id;
    const rCb0 = await s.get(`/contract-bewaking/medewerkers/${medId}`);
    const cb0 = await json<any[]>(rCb0);
    eis(rCb0.status === 200 && cb0.length === 0, "concept zonder contract", `${rCb0.status} ${cb0.length}`);
    console.log("STAP 8 PASS — concept-medewerker (wizard stap 1) zonder startdatum: 201, nog geen contract");

    const rAfrond = await s.patch(`/medewerkers/${medId}`, {
      naam: wizardGebruiker.naam,
      dienstverband: "oproep",
      contracturen_per_week: 0,
      cao: "Bouw & Infra",
      in_dienst_sinds: vandaag,
      contract_einddatum: eind,
    });
    eis(rAfrond.status === 200, "wizard afronden (PATCH)", `${rAfrond.status} ${JSON.stringify(await json(rAfrond))}`);
    const rCb1 = await s.get(`/contract-bewaking/medewerkers/${medId}`);
    const cb1 = await json<any[]>(rCb1);
    eis(cb1.length === 1 && cb1[0].contracttype === "oproep" && cb1[0].eind_datum === eind, "contract na afronden", JSON.stringify(cb1).slice(0, 300));
    // Nogmaals PATCHen mag géén tweede contract opleveren (duplicate-guard).
    await s.patch(`/medewerkers/${medId}`, { naam: wizardGebruiker.naam, in_dienst_sinds: vandaag });
    const rCb2 = await s.get(`/contract-bewaking/medewerkers/${medId}`);
    const cb2 = await json<any[]>(rCb2);
    eis(cb2.length === 1, "duplicate-guard", `verwacht 1 contract, kreeg ${cb2.length}`);
    console.log(`STAP 9 PASS — wizard-afronding via PATCH: exact één contract (oproep, einddatum ${eind}); herhaalde PATCH maakt geen tweede`);
  } finally {
    if (medId != null) {
      const rDel = await s.del(`/medewerkers/${medId}`);
      console.log(`Opruimen: medewerker ${medId} verwijderd (${rDel.status})`);
    }
    await verwijderWegwerpOnboardingGebruikers();
  }

  console.log("ALLE STAPPEN PASS — GEBRUIKERS_01 §1/§2(backend)/§3 bewezen via de API.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await archiveerE2eWebAdminAccount();
    process.exit(process.exitCode ?? 0);
  });
