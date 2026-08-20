import assert from "node:assert/strict";
import { db } from "@workspace/db";
import { sql, type SQL } from "drizzle-orm";
import {
  berekenHerstartVoorvertoning,
  HerstartFout,
  voerHerstartUitBinnenTransactie,
} from "./lib/externeAdviseurHerstart";

const ROLLBACK = new Error("VERIFICATIE_ROLLBACK");

async function rows<T>(executor: Pick<typeof db, "execute">, query: SQL): Promise<T[]> {
  const result = await executor.execute(query);
  return (result as unknown as { rows: T[] }).rows;
}

async function verwachtFout(actie: () => Promise<unknown>, status: number, tekst: RegExp) {
  await assert.rejects(actie, (fout: unknown) => {
    assert.ok(fout instanceof HerstartFout);
    assert.equal(fout.status, status);
    assert.match(fout.message, tekst);
    return true;
  });
}

try {
  await db.transaction(async (tx) => {
    const uniek = `${Date.now()}-${process.pid}`;
    const origineelEmail = `adviseur-herstart-${uniek}@example.invalid`;
    const [actor] = await rows<{ id: number }>(tx as Pick<typeof db, "execute">, sql`
      INSERT INTO gebruikers (naam, email, rol)
      VALUES ('Verificatie hoofdbeheerder', ${`hoofd-${uniek}@example.invalid`}, 'hoofdbeheerder')
      RETURNING id
    `);
    const [nietHoofd] = await rows<{ id: number }>(tx as Pick<typeof db, "execute">, sql`
      INSERT INTO gebruikers (naam, email, rol)
      VALUES ('Verificatie gebruiker', ${`gebruiker-${uniek}@example.invalid`}, 'gebruiker')
      RETURNING id
    `);
    const [doel] = await rows<{ id: number }>(tx as Pick<typeof db, "execute">, sql`
      INSERT INTO gebruikers (
        naam, email, rol, wachtwoord, totp_secret, twee_factor_ingeschakeld,
        uitnodiging_status, uitnodiging_token
      )
      VALUES (
        'Verificatie Adviseur', ${origineelEmail}, 'gebruiker', 'test-hash',
        'test-totp', true, 'uitgenodigd', ${`invite-${uniek}`}
      )
      RETURNING id
    `);
    const [adviseur] = await rows<{ id: number }>(tx as Pick<typeof db, "execute">, sql`
      INSERT INTO externe_adviseurs (gebruiker_id, bedrijf, ingeschakeld_voor, toegang_tot)
      VALUES (${doel.id}, 'Verificatiebedrijf', 'Regressieproef', '2099-12-31')
      RETURNING id
    `);

    await verwachtFout(
      () => berekenHerstartVoorvertoning(tx as Pick<typeof db, "execute">, adviseur.id, nietHoofd.id),
      403,
      /hoofdbeheerder/i,
    );
    await tx.execute(sql`UPDATE gebruikers SET rol = 'hoofdbeheerder' WHERE id = ${doel.id}`);
    await verwachtFout(
      () => berekenHerstartVoorvertoning(tx as Pick<typeof db, "execute">, adviseur.id, doel.id),
      409,
      /eigen account/i,
    );
    await verwachtFout(
      () => berekenHerstartVoorvertoning(tx as Pick<typeof db, "execute">, adviseur.id, actor.id),
      409,
      /hoofdbeheerderaccount/i,
    );
    await tx.execute(sql`UPDATE gebruikers SET rol = 'gebruiker' WHERE id = ${doel.id}`);

    await tx.execute(sql`
      INSERT INTO uitvoerder_sessies (monteur_id, status) VALUES (${doel.id}, 'actief')
    `);
    const geblokkeerd = await berekenHerstartVoorvertoning(
      tx as Pick<typeof db, "execute">,
      adviseur.id,
      actor.id,
    );
    assert.equal(geblokkeerd.uitvoerbaar, false);
    assert.ok(geblokkeerd.blokkades.some((b) => b.code === "uitvoerdersessie" && b.voorbeelden.length > 0));
    await tx.execute(sql`DELETE FROM uitvoerder_sessies WHERE monteur_id = ${doel.id}`);

    const oud = await berekenHerstartVoorvertoning(
      tx as Pick<typeof db, "execute">,
      adviseur.id,
      actor.id,
    );
    await tx.execute(sql`
      INSERT INTO gebruiker_voorkeuren (gebruiker_id, sleutel, waarde)
      VALUES (${doel.id}, 'verificatie', '{"aan":true}'::jsonb)
    `);
    await verwachtFout(
      () => voerHerstartUitBinnenTransactie(
        tx as Pick<typeof db, "execute">,
        adviseur.id,
        actor.id,
        oud.bevestigingstekst,
        oud.impact_token,
      ),
      409,
      /voorvertoning is gewijzigd/i,
    );

    let preview = await berekenHerstartVoorvertoning(
      tx as Pick<typeof db, "execute">,
      adviseur.id,
      actor.id,
    );
    await verwachtFout(
      () => voerHerstartUitBinnenTransactie(
        tx as Pick<typeof db, "execute">,
        adviseur.id,
        actor.id,
        "ONJUIST",
        preview.impact_token,
      ),
      400,
      /Typ exact/i,
    );

    const [profiel] = await rows<{ id: number }>(tx as Pick<typeof db, "execute">, sql`
      INSERT INTO profielen (naam, bevoegdheden)
      VALUES (${`Verificatieprofiel ${uniek}`}, '{"personeel":1}'::jsonb)
      RETURNING id
    `);
    await tx.execute(sql`INSERT INTO gebruiker_profielen (gebruiker_id, profiel_id) VALUES (${doel.id}, ${profiel.id})`);
    await tx.execute(sql`
      INSERT INTO wachtwoord_reset_tokens (gebruiker_id, token, verloopt_op)
      VALUES (${doel.id}, ${`reset-${uniek}`}, NOW() + interval '1 hour')
    `);
    await tx.execute(sql`
      INSERT INTO push_tokens (gebruiker_id, expo_push_token)
      VALUES (${doel.id}, ${`ExponentPushToken[${uniek}]`})
    `);
    const [gesprek] = await rows<{ id: number }>(tx as Pick<typeof db, "execute">, sql`
      INSERT INTO chat_gesprekken (type, naam)
      VALUES ('groep', ${`Verificatiegesprek ${uniek}`})
      RETURNING id
    `);
    await tx.execute(sql`
      INSERT INTO chat_deelnemers (gesprek_id, gebruiker_id)
      VALUES (${gesprek.id}, ${doel.id})
    `);
    await tx.execute(sql`
      INSERT INTO monteur_achievements
        (gebruiker_id, spots_mijlpaal, rang, beloning, behaald_op)
      VALUES (${doel.id}, 1, 'verificatie', 'verificatie', CURRENT_DATE)
    `);
    await tx.execute(sql`
      INSERT INTO activiteiten (type, omschrijving, gebruiker_id, gebruiker_naam)
      VALUES ('verificatie', 'Te behouden activiteit', ${doel.id}, 'Verificatie Adviseur')
    `);
    await tx.execute(sql`
      INSERT INTO audit_log (gebruiker_id, gebruiker_naam, module, actie, entiteit)
      VALUES (${doel.id}, 'Verificatie Adviseur', 'personeel', 'verificatie', 'gebruiker')
    `);
    await tx.execute(sql`
      INSERT INTO document_logboek (gebruiker_id, gebruiker_naam, actie)
      VALUES (${doel.id}, 'Verificatie Adviseur', 'verificatie')
    `);
    await tx.execute(sql`
      INSERT INTO financiele_document_log (gebruiker_id, actie)
      VALUES (${doel.id}, 'verificatie')
    `);
    await tx.execute(sql`
      INSERT INTO "session" (sid, sess, expire)
      VALUES (${`sessie-${uniek}`}, ${JSON.stringify({ userId: doel.id })}, NOW() + interval '1 hour')
    `);

    preview = await berekenHerstartVoorvertoning(
      tx as Pick<typeof db, "execute">,
      adviseur.id,
      actor.id,
    );
    const resultaat = await voerHerstartUitBinnenTransactie(
      tx as Pick<typeof db, "execute">,
      adviseur.id,
      actor.id,
      preview.bevestigingstekst,
      preview.impact_token,
    );
    assert.equal(resultaat.vrijgegeven_email, origineelEmail);
    assert.equal(resultaat.geanonimiseerd, true);
    assert.equal(resultaat.sessies_beeindigd, 1);

    const [staat] = await rows<{
      adviseurs: number;
      herbouwbaar: number;
      bewijs: number;
      account_ok: boolean;
      namen_afgeschermd: boolean;
    }>(tx as Pick<typeof db, "execute">, sql`
      SELECT
        (SELECT count(*)::int FROM externe_adviseurs WHERE gebruiker_id = ${doel.id}) AS adviseurs,
        ((SELECT count(*) FROM gebruiker_profielen WHERE gebruiker_id = ${doel.id})
          + (SELECT count(*) FROM gebruiker_voorkeuren WHERE gebruiker_id = ${doel.id})
          + (SELECT count(*) FROM wachtwoord_reset_tokens WHERE gebruiker_id = ${doel.id})
          + (SELECT count(*) FROM push_tokens WHERE gebruiker_id = ${doel.id})
          + (SELECT count(*) FROM chat_deelnemers WHERE gebruiker_id = ${doel.id})
          + (SELECT count(*) FROM monteur_achievements WHERE gebruiker_id = ${doel.id}))::int AS herbouwbaar,
        ((SELECT count(*) FROM activiteiten WHERE gebruiker_id = ${doel.id})
          + (SELECT count(*) FROM audit_log WHERE gebruiker_id = ${doel.id})
          + (SELECT count(*) FROM document_logboek WHERE gebruiker_id = ${doel.id})
          + (SELECT count(*) FROM financiele_document_log WHERE gebruiker_id = ${doel.id}))::int AS bewijs,
        (SELECT actief = false AND gearchiveerd = true AND geanonimiseerd = 'externe_adviseur_herstart'
                AND email <> ${origineelEmail} AND wachtwoord IS NULL AND totp_secret IS NULL
           FROM gebruikers WHERE id = ${doel.id}) AS account_ok,
        ((SELECT gebruiker_naam = 'Verwijderde adviseur' FROM activiteiten
            WHERE gebruiker_id = ${doel.id} LIMIT 1)
          AND (SELECT gebruiker_naam = 'Verwijderde adviseur' FROM audit_log
            WHERE gebruiker_id = ${doel.id} LIMIT 1)
          AND (SELECT gebruiker_naam = 'Verwijderde adviseur' FROM document_logboek
            WHERE gebruiker_id = ${doel.id} LIMIT 1)) AS namen_afgeschermd
    `);
    assert.deepEqual(
      { adviseurs: staat.adviseurs, herbouwbaar: staat.herbouwbaar, bewijs: staat.bewijs },
      { adviseurs: 0, herbouwbaar: 0, bewijs: 4 },
    );
    assert.equal(staat.account_ok, true);
    assert.equal(staat.namen_afgeschermd, true);

    await tx.execute(sql`SAVEPOINT afgewezen_toewijzing`);
    let toewijzingAfgewezen = false;
    try {
      await tx.execute(sql`
        INSERT INTO werkbonnen (werkbonnummer, titel, monteur_id, status)
        VALUES (${`WB-${uniek}`}, 'Mag niet aan bewijsanker', ${doel.id}, 'gepland')
      `);
    } catch (fout) {
      const code = (fout as { cause?: { code?: string } }).cause?.code;
      assert.equal(code, "23514");
      toewijzingAfgewezen = true;
      await tx.execute(sql`ROLLBACK TO SAVEPOINT afgewezen_toewijzing`);
    }
    assert.equal(toewijzingAfgewezen, true);
    await tx.execute(sql`RELEASE SAVEPOINT afgewezen_toewijzing`);

    await tx.execute(sql`SAVEPOINT afgewezen_medewerker`);
    let medewerkerAfgewezen = false;
    try {
      await tx.execute(sql`
        INSERT INTO medewerkers (gebruiker_id, naam)
        VALUES (${doel.id}, 'Mag niet aan bewijsanker')
      `);
    } catch (fout) {
      assert.equal((fout as { cause?: { code?: string } }).cause?.code, "23514");
      medewerkerAfgewezen = true;
      await tx.execute(sql`ROLLBACK TO SAVEPOINT afgewezen_medewerker`);
    }
    assert.equal(medewerkerAfgewezen, true);
    await tx.execute(sql`RELEASE SAVEPOINT afgewezen_medewerker`);

    const [losMedewerkerprofiel] = await rows<{ id: number }>(
      tx as Pick<typeof db, "execute">,
      sql`INSERT INTO medewerkers (naam) VALUES ('Los verificatieprofiel') RETURNING id`,
    );
    await tx.execute(sql`SAVEPOINT afgewezen_medewerker_update`);
    let medewerkerUpdateAfgewezen = false;
    try {
      await tx.execute(sql`
        UPDATE medewerkers SET gebruiker_id = ${doel.id} WHERE id = ${losMedewerkerprofiel.id}
      `);
    } catch (fout) {
      assert.equal((fout as { cause?: { code?: string } }).cause?.code, "23514");
      medewerkerUpdateAfgewezen = true;
      await tx.execute(sql`ROLLBACK TO SAVEPOINT afgewezen_medewerker_update`);
    }
    assert.equal(medewerkerUpdateAfgewezen, true);
    await tx.execute(sql`RELEASE SAVEPOINT afgewezen_medewerker_update`);

    const [nieuw] = await rows<{ id: number }>(tx as Pick<typeof db, "execute">, sql`
      INSERT INTO gebruikers (naam, email, rol)
      VALUES ('Opnieuw uitgenodigde adviseur', ${origineelEmail}, 'gebruiker')
      RETURNING id
    `);
    const [opnieuw] = await rows<{ id: number }>(tx as Pick<typeof db, "execute">, sql`
      INSERT INTO externe_adviseurs (gebruiker_id, bedrijf, ingeschakeld_voor, toegang_tot)
      VALUES (${nieuw.id}, 'Verificatiebedrijf', 'Nieuwe onboarding', '2099-12-31')
      RETURNING id
    `);
    assert.ok(opnieuw.id > 0);

    throw ROLLBACK;
  });
} catch (fout) {
  if (fout !== ROLLBACK) throw fout;
}

console.log("Externe-adviseur-herstart: alle regressiecontroles geslaagd (testdata teruggedraaid).");