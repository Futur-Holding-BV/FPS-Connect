// Bewijsscript: verifieert end-to-end (echte login + TOTP) dat meerdere
// functies (aanstellingen) voor een medewerker via de API werken.
// Draaien: pnpm --filter @workspace/scripts exec tsx src/verificatie-aanstellingen.ts <medewerkerId>
// Maakt een test-aanstelling aan en ruimt die direct weer op (geen datawijziging).
import "./lib/prodGuard";
import {
  setupE2eWebAccount,
  archiveerE2eWebAccount,
  genereerVersWebTotp,
  E2E_WEB_EMAIL,
  E2E_WEB_WACHTWOORD,
} from "./e2e-monteur-testaccount";

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
  del(pad: string): Promise<Response> {
    return this.fetch(pad, { method: "DELETE" });
  }
  get(pad: string): Promise<Response> {
    return this.fetch(pad);
  }
}

async function json<T = any>(res: Response): Promise<T> {
  const t = await res.text();
  try {
    return JSON.parse(t) as T;
  } catch {
    return t as unknown as T;
  }
}

function eis(v: boolean, stap: string, detail: string): void {
  if (!v) {
    // Gooien i.p.v. process.exit zodat catch/finally (opruimen + archiveren)
    // altijd doorlopen en er geen test-aanstelling op een echte medewerker
    // achterblijft.
    throw new Error(`FAIL — ${stap}: ${detail}`);
  }
}

async function main(): Promise<void> {
  const medId = Number(process.argv[2] ?? "5");
  console.log(`Verificatie meerdere functies (aanstellingen) voor medewerker ${medId} — doel ${BASIS}`);

  await setupE2eWebAccount();
  const s = new Sessie();

  const r1 = await s.post("/auth/login", { email: E2E_WEB_EMAIL, wachtwoord: E2E_WEB_WACHTWOORD });
  const b1 = await json(r1);
  eis(r1.status === 200 && b1.status === "verify_2fa", "login", `${r1.status} ${JSON.stringify(b1)}`);
  const code = await genereerVersWebTotp();
  const r2 = await s.post("/auth/2fa/verify", { code });
  const b2 = await json(r2);
  eis(r2.status === 200, "2fa", `${r2.status} ${JSON.stringify(b2)}`);
  console.log(`STAP 1 PASS — ingelogd als ${E2E_WEB_EMAIL} (rol=${b2.rol})`);

  const r3 = await s.get(`/medewerkers/${medId}/aanstellingen`);
  const lijst0 = await json<any[]>(r3);
  eis(r3.status === 200 && Array.isArray(lijst0), "lijst vooraf", `${r3.status} ${JSON.stringify(lijst0)}`);
  console.log(`STAP 2 PASS — GET aanstellingen: 200, ${lijst0.length} bestaande aanstelling(en)`);

  const fRes = await s.get(`/functies`);
  const functies = await json<any[]>(fRes);
  eis(fRes.status === 200 && functies.length > 0, "functies", `${fRes.status} — functiehuis leeg?`);
  const functie = functies[0];

  // De aangemaakte test-aanstelling wordt óók bij een tussentijdse fout
  // opgeruimd (finally), zodat er nooit testdata op een echte medewerker blijft.
  let aangemaaktId: number | null = null;
  try {
    const r4 = await s.post(`/medewerkers/${medId}/aanstellingen`, {
      werkmaatschappij: "FPS Brandpreventie",
      functie_id: functie.id,
      cao: "",
      contracturen_per_week: null,
    });
    const nieuw = await json<any>(r4);
    eis(r4.status === 201 && typeof nieuw.id === "number", "aanmaken", `${r4.status} ${JSON.stringify(nieuw)}`);
    aangemaaktId = nieuw.id;
    console.log(`STAP 3 PASS — POST extra functie "${functie.naam}": 201, aanstelling id=${nieuw.id}`);

    const r5 = await s.get(`/medewerkers/${medId}/aanstellingen`);
    const lijst1 = await json<any[]>(r5);
    eis(lijst1.length === lijst0.length + 1, "lijst na aanmaken", `verwacht ${lijst0.length + 1}, kreeg ${lijst1.length}`);
    console.log(`STAP 4 PASS — GET na aanmaken: ${lijst1.length} aanstelling(en), nieuwe zichtbaar in lijst`);
  } finally {
    if (aangemaaktId !== null) {
      const r6 = await s.del(`/medewerkers/${medId}/aanstellingen/${aangemaaktId}`);
      eis(r6.status === 204, "opruimen", `${r6.status}`);
    }
  }
  const r7 = await s.get(`/medewerkers/${medId}/aanstellingen`);
  const lijst2 = await json<any[]>(r7);
  eis(lijst2.length === lijst0.length, "lijst na opruimen", `verwacht ${lijst0.length}, kreeg ${lijst2.length}`);
  console.log(`STAP 5 PASS — testaanstelling opgeruimd (204), lijst weer ${lijst2.length}`);

  console.log("ALLE STAPPEN PASS — meerdere functies per medewerker werken end-to-end via de API.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await archiveerE2eWebAccount();
    process.exit(process.exitCode ?? 0);
  });
