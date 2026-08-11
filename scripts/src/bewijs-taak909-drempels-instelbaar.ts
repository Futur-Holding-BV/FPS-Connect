// Bewijs taak #909 — BEWAKING_02-drempels instelbaar via instellingen-endpoint.
// PUT /info/instellingen zet de drie drempels; GET geeft ze terug; validatie 400.
// Draaien: pnpm --filter @workspace/scripts exec tsx src/bewijs-taak909-drempels-instelbaar.ts
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { authenticator } from "otplib";
import { db, gebruikersTable, appInstellingenTable } from "@workspace/db";

const BASIS = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
const TOTP = "MFRGGZDFMZTWQ2LK";
const WW = "BewijsTaak909!2026";
const EMAIL = "bewijs-taak909-hb@fps.local";

if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") {
  throw new Error("GEWEIGERD: bewijsscript nooit tegen productie draaien.");
}

let falen = 0;
function check(naam: string, conditie: boolean, detail?: unknown): void {
  if (!conditie) { console.error(`\x1b[31m✗ FAALT: ${naam}\x1b[0m`, detail ?? ""); falen++; return; }
  console.log(`✓ ${naam}`);
}

async function main(): Promise<void> {
  const [oud] = await db.select({ id: gebruikersTable.id }).from(gebruikersTable).where(eq(gebruikersTable.email, EMAIL));
  if (oud) await db.delete(gebruikersTable).where(eq(gebruikersTable.id, oud.id));
  const [gebruiker] = await db.insert(gebruikersTable).values({
    naam: "Bewijs 909 HB", email: EMAIL, rol: "hoofdbeheerder",
    wachtwoord: await bcrypt.hash(WW, 10), totpSecret: TOTP, tweeFactorIngeschakeld: true, actief: true,
  }).returning({ id: gebruikersTable.id });

  // Oorspronkelijke waarden bewaren voor herstel
  const [instelling] = await db.select().from(appInstellingenTable).orderBy(appInstellingenTable.id).limit(1);
  const origineel = instelling ? {
    offerteReactieBewakingDagen: instelling.offerteReactieBewakingDagen,
    offerteBekekenBewakingDagen: instelling.offerteBekekenBewakingDagen,
    opnameCalculatieBewakingDagen: instelling.opnameCalculatieBewakingDagen,
    supportEmail: instelling.supportEmail,
    supportTelefoon: instelling.supportTelefoon,
  } : null;

  try {
    const r = await fetch(`${BASIS}/auth/mobile/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, wachtwoord: WW, code: authenticator.generate(TOTP) }),
    });
    if (r.status !== 200) throw new Error(`login faalde: ${r.status} ${await r.text()}`);
    const { token } = await r.json() as { token: string };
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    // 1. GET geeft de drie drempels terug
    const g1 = await (await fetch(`${BASIS}/info/instellingen`, { headers })).json() as Record<string, unknown>;
    check("GET bevat offerte_reactie_bewaking_dagen", typeof g1.offerte_reactie_bewaking_dagen === "number", g1);
    check("GET bevat offerte_bekeken_bewaking_dagen", typeof g1.offerte_bekeken_bewaking_dagen === "number");
    check("GET bevat opname_calculatie_bewaking_dagen", typeof g1.opname_calculatie_bewaking_dagen === "number");

    // 2a. Supportgegevens vooraf zetten — drempel-only PUT mag die niet wissen
    const sup = await fetch(`${BASIS}/info/instellingen`, {
      method: "PUT", headers,
      body: JSON.stringify({ support_email: "bewijs909@fps.local", support_telefoon: "0612345678" }),
    });
    check("supportgegevens vooraf gezet", sup.status === 200, await sup.clone().text());

    // 2. PUT past ze aan
    const p = await fetch(`${BASIS}/info/instellingen`, {
      method: "PUT", headers,
      body: JSON.stringify({ offerte_reactie_bewaking_dagen: 9, offerte_bekeken_bewaking_dagen: 4, opname_calculatie_bewaking_dagen: 21 }),
    });
    const pj = await p.json() as Record<string, unknown>;
    check("PUT slaagt (200)", p.status === 200, pj);
    check("PUT respons: reactie=9", pj.offerte_reactie_bewaking_dagen === 9);
    check("PUT respons: bekeken=4", pj.offerte_bekeken_bewaking_dagen === 4);
    check("PUT respons: opname=21", pj.opname_calculatie_bewaking_dagen === 21);
    check("drempel-only PUT wist support_email niet", pj.support_email === "bewijs909@fps.local", pj.support_email);
    check("drempel-only PUT wist support_telefoon niet", pj.support_telefoon === "0612345678", pj.support_telefoon);

    // 3. DB bevat de nieuwe waarden (dus de eerstvolgende bewakingsdraai leest ze)
    const [naDb] = await db.select().from(appInstellingenTable).orderBy(appInstellingenTable.id).limit(1);
    check("DB: offerte_reactie_bewaking_dagen=9", naDb?.offerteReactieBewakingDagen === 9);
    check("DB: offerte_bekeken_bewaking_dagen=4", naDb?.offerteBekekenBewakingDagen === 4);
    check("DB: opname_calculatie_bewaking_dagen=21", naDb?.opnameCalculatieBewakingDagen === 21);

    // 4. Validatie: buiten bereik = 400
    const fout = await fetch(`${BASIS}/info/instellingen`, {
      method: "PUT", headers, body: JSON.stringify({ offerte_reactie_bewaking_dagen: 0 }),
    });
    check("PUT met 0 dagen geeft 400", fout.status === 400, await fout.text());
    const [naFout] = await db.select({ d: appInstellingenTable.offerteReactieBewakingDagen }).from(appInstellingenTable).orderBy(appInstellingenTable.id).limit(1);
    check("ongeldige waarde niet opgeslagen", naFout?.d === 9);
  } finally {
    if (origineel && instelling) {
      await db.update(appInstellingenTable).set(origineel).where(eq(appInstellingenTable.id, instelling.id));
    }
    await db.delete(gebruikersTable).where(eq(gebruikersTable.id, gebruiker.id));
  }

  if (falen > 0) { console.error(`\n${falen} controle(s) gefaald`); process.exit(1); }
  console.log("\nAlle controles geslaagd.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
