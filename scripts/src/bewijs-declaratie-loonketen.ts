// Bewijs: declaraties → loonverwerking automatisch (16 aug 2026).
//
// Scenario (echte HTTP-flow tegen de dev-API + DB-verificatie):
//   1. Admin logt in (wachtwoord + TOTP).
//   2. Declaratie aanmaken + indienen + goedkeuren.
//   3. BEWIJS A: er staat automatisch een salaris_mutatie (bron "declaratie",
//      declaratie_id gevuld) voor de lopende periode.
//   4. SCAB-mail voor die werkmaatschappij/periode aanmaken en verzenden.
//   5. BEWIJS B: de declaratie staat automatisch op "verwerkt".
//   6. Tegenproef: alsnog afwijzen ná goedkeuring ruimt de concept-mutatie op.
//   7. Opruimen: testrijen verwijderen.
import "./lib/prodGuard";
import { eq, and } from "drizzle-orm";
import {
  db,
  declaratiesTable,
  salarisMutatiesTable,
  scabMailsTable,
  medewerkersTable,
  gebruikersTable,
} from "@workspace/db";
import {
  setupE2eWachtwoordAccounts,
  archiveerE2eWachtwoordAccounts,
  E2E_WW_ADMIN_EMAIL,
  E2E_WW_ADMIN_WACHTWOORD,
  genereerVersAdminTotp,
} from "./e2e-wachtwoord-testaccounts";

const BASIS = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;

let cookies = "";
function bewaarCookies(res: Response): void {
  const setCookies = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookies) {
    const kv = c.split(";")[0]!;
    const naam = kv.split("=")[0]!;
    cookies = cookies
      .split("; ")
      .filter((x) => x && !x.startsWith(`${naam}=`))
      .concat(kv)
      .join("; ");
  }
}

async function api(pad: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${BASIS}${pad}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(cookies ? { Cookie: cookies } : {}),
      ...(init?.headers ?? {}),
    },
  });
  bewaarCookies(res);
  return res;
}

function faal(msg: string): never {
  console.error(`FAAL: ${msg}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const { adminId } = await setupE2eWachtwoordAccounts();

  // Admin heeft een medewerkerprofiel nodig (declaraties zijn medewerker-gebonden).
  let [mw] = await db
    .select({ id: medewerkersTable.id, werkmaatschappij: medewerkersTable.werkmaatschappij })
    .from(medewerkersTable)
    .where(eq(medewerkersTable.gebruikerId, adminId))
    .limit(1);
  let mwAangemaakt = false;
  if (!mw) {
    const [admin] = await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable).where(eq(gebruikersTable.id, adminId)).limit(1);
    const [nieuw] = await db
      .insert(medewerkersTable)
      .values({ gebruikerId: adminId, naam: admin?.naam ?? "E2E Admin" })
      .returning({ id: medewerkersTable.id, werkmaatschappij: medewerkersTable.werkmaatschappij });
    mw = nieuw!;
    mwAangemaakt = true;
  }

  // 1. Login (wachtwoord + TOTP)
  let res = await api("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: E2E_WW_ADMIN_EMAIL, wachtwoord: E2E_WW_ADMIN_WACHTWOORD }),
  });
  if (!res.ok) faal(`login stap 1: ${res.status} ${await res.text()}`);
  res = await api("/auth/2fa/verify", {
    method: "POST",
    body: JSON.stringify({ code: await genereerVersAdminTotp() }),
  });
  if (!res.ok) faal(`login TOTP: ${res.status} ${await res.text()}`);
  console.log("1. Admin ingelogd.");

  // 2. Declaratie aanmaken + indienen + goedkeuren
  res = await api("/declaraties", {
    method: "POST",
    body: JSON.stringify({
      categorie: "Reiskosten",
      omschrijving: "BEWIJS loonketen",
      bedrag_totaal_cents: 1234,
      datum: "2026-08-16",
    }),
  });
  if (!res.ok) faal(`declaratie aanmaken: ${res.status} ${await res.text()}`);
  const decl = (await res.json()) as { id: number };
  res = await api(`/declaraties/${decl.id}/indienen`, { method: "POST" });
  if (!res.ok) faal(`indienen: ${res.status} ${await res.text()}`);
  res = await api(`/declaraties/${decl.id}/goedkeuren`, { method: "POST" });
  if (!res.ok) faal(`goedkeuren: ${res.status} ${await res.text()}`);
  console.log(`2. Declaratie #${decl.id} aangemaakt, ingediend en goedgekeurd.`);

  // 3. BEWIJS A: automatische salarismutatie
  const [mutatie] = await db
    .select()
    .from(salarisMutatiesTable)
    .where(eq(salarisMutatiesTable.declaratieId, decl.id))
    .limit(1);
  if (!mutatie) faal("geen automatische salarismutatie gevonden na goedkeuren");
  if (mutatie.bron !== "declaratie") faal(`mutatie-bron is ${mutatie.bron}, verwacht "declaratie"`);
  console.log(
    `3. BEWIJS A: salarismutatie #${mutatie.id} automatisch aangemaakt (${mutatie.werkmaatschappij} ${mutatie.periodeJaar}-${mutatie.periodeMaand}, type=${mutatie.type}).`,
  );

  // 4. SCAB-mail voor die wm/periode aanmaken + verzenden
  res = await api("/scab-mails/genereer", {
    method: "POST",
    body: JSON.stringify({
      werkmaatschappij: mutatie.werkmaatschappij,
      periode_jaar: mutatie.periodeJaar,
      periode_maand: mutatie.periodeMaand,
    }),
  });
  if (!res.ok) faal(`scab genereer: ${res.status} ${await res.text()}`);
  const mail = (await res.json()) as { id: number };
  // E-mailadres verplicht voor verzenden; testdomein — mailguard onderdrukt echte verzending.
  await db.update(scabMailsTable).set({ scabEmailAdres: "bewijs@fps.local" }).where(eq(scabMailsTable.id, mail.id));

  // BEWIJS C-voorbereiding: declaratie die pas NA het genereren wordt goedgekeurd
  // (staat dus niet in de mail-snapshot en mag niet mee op "verwerkt").
  res = await api("/declaraties", {
    method: "POST",
    body: JSON.stringify({ categorie: "Overig", omschrijving: "BEWIJS na-genereren", bedrag_totaal_cents: 750, datum: "2026-08-16" }),
  });
  const decl3 = (await res.json()) as { id: number };
  await api(`/declaraties/${decl3.id}/indienen`, { method: "POST" });
  await api(`/declaraties/${decl3.id}/goedkeuren`, { method: "POST" });

  res = await api(`/scab-mails/${mail.id}/verzend`, { method: "POST" });
  if (!res.ok) faal(`scab verzend: ${res.status} ${await res.text()}`);
  console.log(`4. SCAB-mail #${mail.id} verzonden.`);

  // 5. BEWIJS B: declaratie automatisch verwerkt
  const [na] = await db.select().from(declaratiesTable).where(eq(declaratiesTable.id, decl.id)).limit(1);
  if (na?.status !== "verwerkt") faal(`declaratie-status is ${na?.status}, verwacht "verwerkt"`);
  if (!na.verwerkingOp) faal("verwerking_op niet gevuld");
  console.log(`5. BEWIJS B: declaratie #${decl.id} staat automatisch op "verwerkt" (door gebruiker ${na.verwerktDoor}).`);

  // BEWIJS C: na-genereren goedgekeurde declaratie blijft "goedgekeurd"
  const [na3] = await db.select().from(declaratiesTable).where(eq(declaratiesTable.id, decl3.id)).limit(1);
  if (na3?.status !== "goedgekeurd") faal(`BEWIJS C: declaratie #${decl3.id} heeft status ${na3?.status}, verwacht "goedgekeurd" (stond niet in mail-snapshot)`);
  console.log(`5b. BEWIJS C: declaratie #${decl3.id} (goedgekeurd ná genereren) blijft "goedgekeurd" — snapshot beschermt tegen meeliften.`);

  // 6. Tegenproef: nieuwe declaratie, goedkeuren, alsnog afwijzen → mutatie weg
  res = await api("/declaraties", {
    method: "POST",
    body: JSON.stringify({ categorie: "Overig", omschrijving: "BEWIJS tegenproef", bedrag_totaal_cents: 500, datum: "2026-08-16" }),
  });
  const decl2 = (await res.json()) as { id: number };
  await api(`/declaraties/${decl2.id}/indienen`, { method: "POST" });
  await api(`/declaraties/${decl2.id}/goedkeuren`, { method: "POST" });
  const [m2] = await db.select({ id: salarisMutatiesTable.id }).from(salarisMutatiesTable).where(eq(salarisMutatiesTable.declaratieId, decl2.id)).limit(1);
  if (!m2) faal("tegenproef: geen mutatie na goedkeuren");
  res = await api(`/declaraties/${decl2.id}/afwijzen`, { method: "POST", body: JSON.stringify({ afwijzingsreden: "Bewijs tegenproef" }) });
  if (!res.ok) faal(`alsnog afwijzen: ${res.status} ${await res.text()}`);
  const [m2na] = await db.select({ id: salarisMutatiesTable.id }).from(salarisMutatiesTable).where(eq(salarisMutatiesTable.declaratieId, decl2.id)).limit(1);
  if (m2na) faal("tegenproef: concept-mutatie is NIET opgeruimd na alsnog afwijzen");
  console.log(`6. Tegenproef geslaagd: concept-mutatie opgeruimd na alsnog afwijzen van declaratie #${decl2.id}.`);

  // 7. Opruimen
  await db.delete(salarisMutatiesTable).where(eq(salarisMutatiesTable.declaratieId, decl.id));
  await db.delete(salarisMutatiesTable).where(eq(salarisMutatiesTable.declaratieId, decl3.id));
  await db.delete(declaratiesTable).where(eq(declaratiesTable.id, decl3.id));
  await db.delete(scabMailsTable).where(eq(scabMailsTable.id, mail.id));
  await db.delete(declaratiesTable).where(eq(declaratiesTable.id, decl.id));
  await db.delete(declaratiesTable).where(eq(declaratiesTable.id, decl2.id));
  if (mwAangemaakt && mw) {
    await db.delete(medewerkersTable).where(and(eq(medewerkersTable.id, mw.id), eq(medewerkersTable.gebruikerId, adminId)));
  }
  await archiveerE2eWachtwoordAccounts();
  console.log("7. Opgeruimd. ALLE BEWIJZEN GESLAAGD.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
