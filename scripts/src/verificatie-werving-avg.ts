// WERVING_01 AVG-bewijs — verwijdering van verlopen kandidaten inclusief
// cv-BESTAND (niet alleen de rij), via de bestaande AVG-opruiming.
//
// Werkwijze:
// 1. Maakt via echte login een kandidaat met cv aan (procedure "afgewezen").
// 2. Zet procedure_afgerond_op 40 dagen terug (zonder toestemming → 4 weken).
// 3. Draait ruimVerlopenKandidatenOp() in de api-server-context.
// 4. Bewijst: rij weg (API 404) én cv-bestand weg (download uit storage faalt).
//
// Draaien: pnpm --filter @workspace/scripts exec tsx src/verificatie-werving-avg.ts
import { execSync } from "node:child_process";
import { db, wervingKandidatenTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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
    if (init?.body && typeof init.body === "string") headers.set("Content-Type", "application/json");
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
}

function eis(v: boolean, stap: string, detail: string): void {
  if (!v) throw new Error(`FAIL — ${stap}: ${detail}`);
}

async function main(): Promise<void> {
  console.log(`WERVING_01 AVG-verwijderbewijs — doel ${BASIS}`);
  await setupE2eWebAccount();
  const s = new Sessie();
  let kandidaatId = 0;

  try {
    // Login
    const r1 = await s.fetch("/auth/login", { method: "POST", body: JSON.stringify({ email: E2E_WEB_EMAIL, wachtwoord: E2E_WEB_WACHTWOORD }) });
    eis(r1.status === 200, "login", `${r1.status}`);
    const r2 = await s.fetch("/auth/2fa/verify", { method: "POST", body: JSON.stringify({ code: await genereerVersWebTotp() }) });
    eis(r2.status === 200, "2fa", `${r2.status}`);

    // Functie voor de kandidaat
    const functies = (await (await s.fetch("/functies")).json()) as any[];
    eis(functies.length > 0, "functies", "geen functies");

    // Kandidaat met cv aanmaken en afronden
    const form = new FormData();
    form.append("naam", "WERVING_01 AVG Testkandidaat");
    form.append("functie_id", String(functies[0].id));
    form.append("kanaal", "avg-test");
    form.append("cv", new Blob(["Test-cv voor AVG-verwijderbewijs."], { type: "text/plain" }), "cv.txt");
    const rK = await s.fetch("/werving/kandidaten", { method: "POST", body: form });
    const kandidaat = (await rK.json()) as any;
    eis(rK.status === 201, "kandidaat", `${rK.status} ${JSON.stringify(kandidaat)}`);
    kandidaatId = kandidaat.id;
    const rAf = await s.fetch(`/werving/kandidaten/${kandidaatId}`, { method: "PATCH", body: JSON.stringify({ status: "afgewezen" }) });
    eis(rAf.status === 200, "afwijzen", `${rAf.status}`);

    // cv-objectpad uit DB + procedure_afgerond_op 40 dagen terugzetten
    const [rij] = await db.select().from(wervingKandidatenTable).where(eq(wervingKandidatenTable.id, kandidaatId));
    eis(!!rij?.cvObjectPath, "cv-pad", "kandidaat heeft geen cv-objectpad");
    const cvPad = rij.cvObjectPath as string;
    const verleden = new Date();
    verleden.setDate(verleden.getDate() - 40);
    await db.update(wervingKandidatenTable).set({ procedureAfgerondOp: verleden }).where(eq(wervingKandidatenTable.id, kandidaatId));
    console.log(`OK — kandidaat ${kandidaatId} met cv ${cvPad}, afgerond teruggezet naar ${verleden.toISOString().slice(0, 10)} (geen toestemming → 28 dagen bewaartermijn)`);

    // AVG-opruiming draaien in api-server-context + bestandscontrole
    const evalCode = [
      `(async () => {`,
      `const { ruimVerlopenKandidatenOp } = await import("./src/lib/avgOpruiming.ts");`,
      `const { ObjectStorageService } = await import("./src/lib/objectStorage.ts");`,
      `const n = await ruimVerlopenKandidatenOp();`,
      `console.log("OPGERUIMD:" + n);`,
      `try { await new ObjectStorageService().downloadBestandBuffer(${JSON.stringify(cvPad.replace(/^\/objects\//, ""))}); console.log("BESTAND:NOG-AANWEZIG"); } catch { console.log("BESTAND:VERWIJDERD"); }`,
      `process.exit(0);`,
      `})();`,
    ].join("\n");
    const uit = execSync(`pnpm --filter @workspace/api-server exec tsx -e '${evalCode.replace(/'/g, "'\\''")}'`, {
      cwd: `${process.cwd()}/..`,
      encoding: "utf8",
    });
    console.log(uit.trim());
    eis(/OPGERUIMD:[1-9]/.test(uit), "opruiming", `geen kandidaten opgeruimd: ${uit}`);
    eis(uit.includes("BESTAND:VERWIJDERD"), "cv-bestand", "cv-bestand bestaat nog in objectopslag");

    // Rij weg via API
    const rWeg = await s.fetch(`/werving/kandidaten/${kandidaatId}`);
    eis(rWeg.status === 404, "rij verwijderd", `${rWeg.status}`);
    kandidaatId = 0;
    console.log("OK — kandidaat-rij én cv-bestand verwijderd door AVG-opruiming");
    console.log("\nALLE CONTROLES GESLAAGD");
  } finally {
    if (kandidaatId) {
      await s.fetch(`/werving/kandidaten/${kandidaatId}`, { method: "DELETE" }).catch(() => {});
    }
    await archiveerE2eWebAccount();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
