import { Router } from "express";
import { db } from "@workspace/db";
import {
  gebruikersTable,
  medewerkersTable,
  functiesTable,
  activiteitenTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

const mijnPrivacyRouter = Router();

mijnPrivacyRouter.get("/mijn/privacy-gegevens", requireAuth, async (req, res) => {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ fout: "Niet ingelogd" });

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

  if (!gebruiker) return res.status(404).json({ fout: "Gebruiker niet gevonden" });

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
      functie_naam: functiesTable.naam,
    })
    .from(medewerkersTable)
    .leftJoin(functiesTable, eq(medewerkersTable.functieId, functiesTable.id))
    .where(eq(medewerkersTable.gebruikerId, userId));

  return res.json({
    id: gebruiker.id,
    naam: gebruiker.naam,
    email: gebruiker.email,
    rol: gebruiker.rol,
    aangemaaktOp: gebruiker.aangemaaktOp,
    medewerker: medewerkerRij
      ? {
          id: medewerkerRij.id,
          naam: medewerkerRij.naam,
          werkmaatschappij: medewerkerRij.werkmaatschappij,
          dienstverband: medewerkerRij.dienstverband,
          in_dienst_sinds: medewerkerRij.in_dienst_sinds ?? null,
          email: medewerkerRij.email ?? null,
          telefoon: medewerkerRij.telefoon ?? null,
          mobiel: medewerkerRij.mobiel ?? null,
          functie_naam: medewerkerRij.functie_naam ?? null,
        }
      : null,
  });
});

mijnPrivacyRouter.get("/mijn/activiteiten", requireAuth, async (req, res) => {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ fout: "Niet ingelogd" });

  const limit = Math.min(Number(req.query["limit"] ?? 50), 50);
  const offset = Number(req.query["offset"] ?? 0);

  const rijen = await db
    .select()
    .from(activiteitenTable)
    .where(eq(activiteitenTable.gebruikerId, userId))
    .orderBy(desc(activiteitenTable.tijdstip))
    .limit(limit)
    .offset(offset);

  return res.json(
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
