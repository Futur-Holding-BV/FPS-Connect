import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import {
  ciRapportenTable,
  ciRoodMailVerzendingenTable,
  db,
  gebruikersTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import {
  bereidAanhoudendRodeCiMailVoor,
  claimCiRoodMailVerzending,
  herbevestigCiRoodMailOntvanger,
  markeerCiRoodMailMislukt,
  markeerCiRoodMailVerzonden,
} from "./ciRoodMailClaim";

test("parallelle claims en gedeeltelijke fouten blijven per ontvanger gededupliceerd", async () => {
  const basisRunId = Date.now();
  const nu = new Date(Date.now() + 72 * 60 * 60 * 1000);
  const rapportIds: number[] = [];
  const testGebruikerIds: number[] = [];
  try {
    const eersteEmail = `ci-rood-test-${randomBytes(8).toString("hex")}@fps.local`;
    const tweedeEmail = `ci-rood-test-${randomBytes(8).toString("hex")}@fps.local`;
    const testGebruikers = await db
      .insert(gebruikersTable)
      .values([
        {
          naam: "CI rood mailtest één",
          email: eersteEmail,
          rol: "hoofdbeheerder",
          actief: true,
        },
        {
          naam: "CI rood mailtest twee",
          email: tweedeEmail,
          rol: "hoofdbeheerder",
          actief: true,
        },
      ])
      .returning({ id: gebruikersTable.id });
    testGebruikerIds.push(...testGebruikers.map((gebruiker) => gebruiker.id));
    const eersteGebruikerId = testGebruikers[0]!.id;

    const rijen = await db
      .insert(ciRapportenTable)
      .values([
        {
          commitSha: randomBytes(20).toString("hex"),
          conclusie: "success",
          runId: basisRunId,
          runAttempt: 1,
          gemeldOp: new Date(nu.getTime() - 26 * 60 * 60 * 1000),
        },
        {
          commitSha: randomBytes(20).toString("hex"),
          conclusie: "failure",
          runId: basisRunId + 1,
          runAttempt: 1,
          gefaaldeTaak: "e2e-outboxtest",
          gemeldOp: new Date(nu.getTime() - 25 * 60 * 60 * 1000),
        },
      ])
      .returning({ id: ciRapportenTable.id });
    rapportIds.push(...rijen.map((rij) => rij.id));

    const voorbereid = await bereidAanhoudendRodeCiMailVoor(nu);
    assert.ok(voorbereid);
    assert.ok(voorbereid.verzendingen.length > 0);
    const eerste = voorbereid.verzendingen.find(
      (verzending) => verzending.ontvangerEmail === eersteEmail,
    );
    assert.ok(eerste, "het tijdelijke hoofdbeheerderaccount moet een outboxrij krijgen");

    const claims = await Promise.all(
      Array.from({ length: 5 }, () => claimCiRoodMailVerzending(eerste.id, nu)),
    );
    const geldigeClaims = claims.filter((claim) => claim !== null);
    assert.equal(geldigeClaims.length, 1, "één ontvanger mag maar één gelijktijdige claim krijgen");

    await markeerCiRoodMailVerzonden(geldigeClaims[0]!, nu);
    assert.equal(
      await claimCiRoodMailVerzending(eerste.id, new Date(nu.getTime() + 60 * 60 * 1000)),
      null,
      "verzonden ontvanger mag nooit opnieuw worden geclaimd",
    );

    const tweede = voorbereid.verzendingen.find(
      (verzending) => verzending.ontvangerEmail === tweedeEmail,
    );
    assert.ok(tweede, "de tweede tijdelijke hoofdbeheerder moet een outboxrij krijgen");
    const tweedeClaim = await claimCiRoodMailVerzending(tweede.id, nu);
    assert.ok(tweedeClaim);
    await markeerCiRoodMailMislukt(tweedeClaim, new Error("gesimuleerde Graph-fout"));
    assert.ok(
      await claimCiRoodMailVerzending(tweede.id, new Date(nu.getTime() + 1000)),
      "alleen de mislukte ontvanger moet opnieuw geclaimd kunnen worden",
    );

    const nogmaals = await bereidAanhoudendRodeCiMailVoor(nu);
    assert.equal(
      nogmaals?.verzendingen.some((verzending) => verzending.id === eerste.id),
      false,
      "een nieuwe loop in dezelfde periode mag een verzonden ontvanger niet teruggeven",
    );

    const nieuweEmail = `ci-rood-gewijzigd-${randomBytes(8).toString("hex")}@fps.local`;
    const intrekkingsRij = nogmaals?.verzendingen.find(
      (verzending) => verzending.ontvangerEmail === eersteEmail,
    );
    const volgendeDag = new Date(nu.getTime() + 24 * 60 * 60 * 1000);
    const volgendePeriode = await bereidAanhoudendRodeCiMailVoor(volgendeDag);
    const volgendeRij = volgendePeriode?.verzendingen.find(
      (verzending) => verzending.ontvangerEmail === eersteEmail,
    );
    assert.equal(intrekkingsRij, undefined);
    assert.ok(volgendeRij);
    await db
      .update(gebruikersTable)
      .set({ email: nieuweEmail })
      .where(eq(gebruikersTable.id, eersteGebruikerId));
    const adresClaim = await claimCiRoodMailVerzending(volgendeRij.id, volgendeDag);
    assert.equal(adresClaim?.ontvangerEmail, nieuweEmail, "retry gebruikt het actuele adres");
    assert.ok(adresClaim);

    await db
      .update(gebruikersTable)
      .set({ rol: "gebruiker" })
      .where(eq(gebruikersTable.id, eersteGebruikerId));
    assert.equal(
      await herbevestigCiRoodMailOntvanger(adresClaim, volgendeDag),
      null,
      "ingetrokken hoofdbeheerder mag vlak vóór verzending niet meer worden gekozen",
    );
    const [overgeslagen] = await db
      .select({ status: ciRoodMailVerzendingenTable.status })
      .from(ciRoodMailVerzendingenTable)
      .where(eq(ciRoodMailVerzendingenTable.id, volgendeRij.id));
    assert.equal(overgeslagen?.status, "overgeslagen");
  } finally {
    if (rapportIds.length > 0) {
      await db.delete(ciRapportenTable).where(inArray(ciRapportenTable.id, rapportIds));
    }
    if (testGebruikerIds.length > 0) {
      await db.delete(gebruikersTable).where(inArray(gebruikersTable.id, testGebruikerIds));
    }
  }
});