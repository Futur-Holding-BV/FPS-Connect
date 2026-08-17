import { Router } from "express";
import { db } from "@workspace/db";
import {
  gebruikersTable,
  medewerkersTable,
  functiesTable,
  activiteitenTable,
  verlofSaldiTable,
  verlofsoortenTable,
  medewerkerOpleidingenTable,
  opleidingenTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

const mijnPrivacyRouter = Router();

// PATCH /mijn/initialen — NOTITIE_01: iedereen stelt zijn eigen initialen in;
// leeg laten mag (dan worden ze afgeleid uit de naam).
mijnPrivacyRouter.patch("/mijn/initialen", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session?.userId;
  if (!userId) return void res.status(401).json({ fout: "Niet ingelogd" });

  const ruw = (req.body as { initialen?: unknown })?.initialen;
  if (typeof ruw !== "string") {
    return void res.status(400).json({ message: "initialen moet een tekst zijn" });
  }
  const initialen = ruw.trim();
  if (initialen.length > 6) {
    return void res.status(400).json({ message: "Initialen zijn maximaal 6 tekens" });
  }
  await db
    .update(gebruikersTable)
    .set({ initialen: initialen === "" ? null : initialen })
    .where(eq(gebruikersTable.id, userId));
  res.json({ initialen });
});

mijnPrivacyRouter.get("/mijn/privacy-gegevens", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session?.userId;
  if (!userId) return void res.status(401).json({ fout: "Niet ingelogd" });

  const [gebruiker] = await db
    .select({
      id: gebruikersTable.id,
      naam: gebruikersTable.naam,
      email: gebruikersTable.email,
      rol: gebruikersTable.rol,
      aangemaaktOp: gebruikersTable.aangemaaktOp,
    })
    .from(gebruikersTable)
    .where(eq(gebruikersTable.id, userId));

  if (!gebruiker) return void res.status(404).json({ fout: "Gebruiker niet gevonden" });

  const [medewerkerRij] = await db
    .select({
      id: medewerkersTable.id,
      naam: medewerkersTable.naam,
      werkmaatschappij: medewerkersTable.werkmaatschappij,
      dienstverband: medewerkersTable.dienstverband,
      in_dienst_sinds: medewerkersTable.inDienstSinds,
      email: medewerkersTable.email,
      telefoon: medewerkersTable.telefoon,
      mobiel: medewerkersTable.mobiel,
      afgeschermd_op: medewerkersTable.afgeschermdOp,
      functie_naam: functiesTable.naam,
      verjaardag_zichtbaar: medewerkersTable.verjaardagZichtbaar,
    })
    .from(medewerkersTable)
    .leftJoin(functiesTable, eq(medewerkersTable.functieId, functiesTable.id))
    .where(eq(medewerkersTable.gebruikerId, userId));

  let verlofsaldi: object[] = [];
  let opleidingen: object[] = [];

  if (medewerkerRij) {
    const huidigJaar = new Date().getFullYear();

    const saldoRijen = await db
      .select({
        verlofsoort: verlofsoortenTable.naam,
        jaar: verlofSaldiTable.jaar,
        saldo_uren: verlofSaldiTable.saldoUren,
        opgebouwd_uren: verlofSaldiTable.opgebouwdUren,
        opgenomen_uren: verlofSaldiTable.opgenomenUren,
        vervalt_op: verlofSaldiTable.vervaltOp,
      })
      .from(verlofSaldiTable)
      .innerJoin(verlofsoortenTable, eq(verlofSaldiTable.verlofsoortId, verlofsoortenTable.id))
      .where(eq(verlofSaldiTable.medewerkerId, medewerkerRij.id))
      .orderBy(desc(verlofSaldiTable.jaar));

    verlofsaldi = saldoRijen.filter((s) => s.jaar === huidigJaar || s.jaar === huidigJaar - 1);

    const opleidingRijen = await db
      .select({
        naam: opleidingenTable.naam,
        type: opleidingenTable.soort,
        niveau: opleidingenTable.niveau,
        behaald_op: medewerkerOpleidingenTable.behaaldOp,
        verloopt_op: medewerkerOpleidingenTable.verlooptOp,
        status: medewerkerOpleidingenTable.status,
      })
      .from(medewerkerOpleidingenTable)
      .innerJoin(opleidingenTable, eq(medewerkerOpleidingenTable.opleidingId, opleidingenTable.id))
      .where(eq(medewerkerOpleidingenTable.medewerkerId, medewerkerRij.id))
      .orderBy(desc(medewerkerOpleidingenTable.behaaldOp));

    opleidingen = opleidingRijen;
  }

  return void res.json({
    id: gebruiker.id,
    naam: gebruiker.naam,
    // AVG-afscherming: het account-e-mailadres is doorgaans hetzelfde adres als
    // het afgeschermde medewerker-e-mailadres; bij afscherming ook hier niet tonen.
    email: medewerkerRij?.afgeschermd_op ? null : gebruiker.email,
    rol: gebruiker.rol,
    aangemaaktOp: gebruiker.aangemaaktOp,
    medewerker: medewerkerRij
      ? {
          id: medewerkerRij.id,
          naam: medewerkerRij.naam,
          werkmaatschappij: medewerkerRij.werkmaatschappij,
          dienstverband: medewerkerRij.dienstverband,
          in_dienst_sinds: medewerkerRij.in_dienst_sinds ?? null,
          // AVG-afscherming: ook self-scoped geen afgeschermde velden teruggeven —
          // een afgeschermde oud-medewerker kan (actief=true, uit_dienst_per
          // verstreken) nog een werkend account hebben.
          email: medewerkerRij.afgeschermd_op ? null : (medewerkerRij.email ?? null),
          telefoon: medewerkerRij.afgeschermd_op ? null : (medewerkerRij.telefoon ?? null),
          mobiel: medewerkerRij.afgeschermd_op ? null : (medewerkerRij.mobiel ?? null),
          functie_naam: medewerkerRij.functie_naam ?? null,
          verlofsaldi,
          opleidingen,
          verjaardag_zichtbaar: medewerkerRij.verjaardag_zichtbaar,
        }
      : null,
  });
});

// PATCH /mijn/privacy-instellingen — medewerker zet zelf de zichtbaarheid van zijn/haar
// verjaardag voor collega's aan/uit (FPS Moments). Standaard uit; alleen de medewerker zelf mag dit wijzigen.
mijnPrivacyRouter.patch("/mijn/privacy-instellingen", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session?.userId;
  if (!userId) return void res.status(401).json({ fout: "Niet ingelogd" });

  const { verjaardag_zichtbaar } = req.body as { verjaardag_zichtbaar?: boolean };
  if (typeof verjaardag_zichtbaar !== "boolean") {
    return void res.status(400).json({ fout: "verjaardag_zichtbaar moet een boolean zijn" });
  }

  const [medewerkerRij] = await db
    .select({ id: medewerkersTable.id })
    .from(medewerkersTable)
    .where(eq(medewerkersTable.gebruikerId, userId));

  if (!medewerkerRij) return void res.status(404).json({ fout: "Geen medewerkerprofiel gevonden" });

  const [bijgewerkt] = await db
    .update(medewerkersTable)
    .set({ verjaardagZichtbaar: verjaardag_zichtbaar, bijgewerktOp: new Date() })
    .where(eq(medewerkersTable.id, medewerkerRij.id))
    .returning({ verjaardagZichtbaar: medewerkersTable.verjaardagZichtbaar });

  return void res.json({ verjaardag_zichtbaar: bijgewerkt.verjaardagZichtbaar });
});

mijnPrivacyRouter.get("/mijn/activiteiten", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session?.userId;
  if (!userId) return void res.status(401).json({ fout: "Niet ingelogd" });

  const limit = Math.min(Number(req.query["limit"] ?? 50), 50);
  const offset = Number(req.query["offset"] ?? 0);

  const rijen = await db
    .select()
    .from(activiteitenTable)
    .where(eq(activiteitenTable.gebruikerId, userId))
    .orderBy(desc(activiteitenTable.tijdstip))
    .limit(limit)
    .offset(offset);

  return void res.json(
    rijen.map((a) => ({
      id: a.id,
      type: a.type,
      omschrijving: a.omschrijving,
      gebouw_id: a.gebouwId,
      gebouw_naam: a.gebouwNaam,
      voorziening_id: a.voorzieningId,
      voorziening_nummer: a.voorzieningNummer,
      gebruiker_id: a.gebruikerId,
      gebruiker_naam: a.gebruikerNaam,
      tijdstip: a.tijdstip instanceof Date ? a.tijdstip.toISOString() : a.tijdstip,
    })),
  );
});

export default mijnPrivacyRouter;
