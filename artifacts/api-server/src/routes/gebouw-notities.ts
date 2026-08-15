// NOTITIE_01 — losse aantekeningen bij een gebouw.
// Regels worden nooit overschreven: corrigeren kan alleen door de schrijver
// binnen 15 minuten; daarna is een nieuwe aantekening de weg. Verwijderen
// (gebouwen niveau 4) haalt de regel door maar laat hem zichtbaar staan.
// Aantekeningen zijn intern en vallen onder de reguliere module-rechten
// (KLANTLOOS_01: Connect kent geen externe gebruikers meer).
import { Router } from "express";
import { db, gebouwNotitiesTable, gebouwenTable, gebruikersTable } from "@workspace/db";
import { eq, desc, and, isNull, gt } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { requireBevoegdheid } from "../middlewares/auth";
import { effectieveContext } from "../utils/rol";
import { effectieveInitialen } from "../lib/initialen";

const router = Router();
const lezenGebouwen = requireBevoegdheid("gebouwen", 1);

const BEWERK_VENSTER_MS = 15 * 60 * 1000;

const notitieInputSchema = z.object({
  tekst: z.string().trim().min(1, "Tekst is verplicht"),
  type: z.enum(["telefoon", "bezoek", "mail", "algemeen"]).default("algemeen"),
  beller_naam: z.string().trim().max(200).nullish(),
});

const notitieUpdateSchema = z.object({
  tekst: z.string().trim().min(1, "Tekst is verplicht"),
  beller_naam: z.string().trim().max(200).nullish(),
});

type NotitieRij = {
  id: number;
  gebouwId: number;
  gebruikerId: number;
  tekst: string;
  type: string;
  bellerNaam: string | null;
  aangemaaktOp: Date;
  bewerktOp: Date | null;
  verwijderdOp: Date | null;
  schrijverNaam: string | null;
  schrijverInitialen: string | null;
  verwijderdDoorNaam: string | null;
};

function naarAntwoord(rij: NotitieRij, huidigeGebruikerId: number) {
  const naam = rij.schrijverNaam ?? "Onbekend";
  const magBewerken =
    rij.gebruikerId === huidigeGebruikerId &&
    rij.verwijderdOp === null &&
    Date.now() - rij.aangemaaktOp.getTime() < BEWERK_VENSTER_MS;
  return {
    id: rij.id,
    gebouw_id: rij.gebouwId,
    gebruiker_id: rij.gebruikerId,
    tekst: rij.tekst,
    type: rij.type,
    beller_naam: rij.bellerNaam,
    gebruiker_naam: naam,
    initialen: effectieveInitialen(rij.schrijverInitialen, naam),
    aangemaakt_op: rij.aangemaaktOp.toISOString(),
    bewerkt_op: rij.bewerktOp ? rij.bewerktOp.toISOString() : null,
    verwijderd: rij.verwijderdOp !== null,
    verwijderd_op: rij.verwijderdOp ? rij.verwijderdOp.toISOString() : null,
    verwijderd_door_naam: rij.verwijderdDoorNaam,
    mag_bewerken: magBewerken,
  };
}

const verwijderaar = alias(gebruikersTable, "verwijderaar");

function notitieSelectie() {
  return db
    .select({
      id: gebouwNotitiesTable.id,
      gebouwId: gebouwNotitiesTable.gebouwId,
      gebruikerId: gebouwNotitiesTable.gebruikerId,
      tekst: gebouwNotitiesTable.tekst,
      type: gebouwNotitiesTable.type,
      bellerNaam: gebouwNotitiesTable.bellerNaam,
      aangemaaktOp: gebouwNotitiesTable.aangemaaktOp,
      bewerktOp: gebouwNotitiesTable.bewerktOp,
      verwijderdOp: gebouwNotitiesTable.verwijderdOp,
      schrijverNaam: gebruikersTable.naam,
      schrijverInitialen: gebruikersTable.initialen,
      verwijderdDoorNaam: verwijderaar.naam,
    })
    .from(gebouwNotitiesTable)
    .leftJoin(gebruikersTable, eq(gebouwNotitiesTable.gebruikerId, gebruikersTable.id))
    .leftJoin(verwijderaar, eq(gebouwNotitiesTable.verwijderdDoorId, verwijderaar.id));
}

// GET /gebouwen/:id/notities — lezen vanaf gebouwen niveau 1, binnen gebouw-scope
router.get("/gebouwen/:id/notities", lezenGebouwen, async (req, res): Promise<void> => {
  const gebouwId = Number(req.params.id);
  if (!Number.isInteger(gebouwId)) {
    res.status(400).json({ message: "Ongeldig gebouw-id" });
    return;
  }
  if (!req.permissies!.magBijGebouw(gebouwId)) {
    res.status(403).json({ message: "Geen toegang tot dit gebouw" });
    return;
  }
  const ctx = await effectieveContext(req);
  const rijen = await notitieSelectie()
    .where(eq(gebouwNotitiesTable.gebouwId, gebouwId))
    .orderBy(desc(gebouwNotitiesTable.aangemaaktOp), desc(gebouwNotitiesTable.id));
  res.json(rijen.map((r) => naarAntwoord(r, ctx.userId)));
});

// POST /gebouwen/:id/notities — schrijven vanaf niveau 1; schrijver = sessie, nooit body
router.post("/gebouwen/:id/notities", lezenGebouwen, async (req, res): Promise<void> => {
  const gebouwId = Number(req.params.id);
  if (!Number.isInteger(gebouwId)) {
    res.status(400).json({ message: "Ongeldig gebouw-id" });
    return;
  }
  if (!req.permissies!.magBijGebouw(gebouwId)) {
    res.status(403).json({ message: "Geen toegang tot dit gebouw" });
    return;
  }
  const parse = notitieInputSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ message: parse.error.issues[0]?.message ?? "Ongeldige invoer" });
    return;
  }
  const [gebouw] = await db
    .select({ id: gebouwenTable.id })
    .from(gebouwenTable)
    .where(eq(gebouwenTable.id, gebouwId));
  if (!gebouw) {
    res.status(404).json({ message: "Gebouw niet gevonden" });
    return;
  }
  const ctx = await effectieveContext(req);
  const [nieuw] = await db
    .insert(gebouwNotitiesTable)
    .values({
      gebouwId,
      gebruikerId: ctx.userId,
      tekst: parse.data.tekst,
      type: parse.data.type,
      bellerNaam: parse.data.type === "telefoon" ? (parse.data.beller_naam ?? null) : null,
    })
    .returning({ id: gebouwNotitiesTable.id });
  const [rij] = await notitieSelectie().where(eq(gebouwNotitiesTable.id, nieuw!.id));
  res.status(201).json(naarAntwoord(rij!, ctx.userId));
});

// PATCH /gebouwen/notities/:notitieId — alleen de schrijver, alleen binnen 15 minuten
router.patch("/gebouwen/notities/:notitieId", lezenGebouwen, async (req, res): Promise<void> => {
  const notitieId = Number(req.params.notitieId);
  if (!Number.isInteger(notitieId)) {
    res.status(400).json({ message: "Ongeldig notitie-id" });
    return;
  }
  const parse = notitieUpdateSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ message: parse.error.issues[0]?.message ?? "Ongeldige invoer" });
    return;
  }
  const [bestaand] = await db
    .select()
    .from(gebouwNotitiesTable)
    .where(eq(gebouwNotitiesTable.id, notitieId));
  if (!bestaand) {
    res.status(404).json({ message: "Aantekening niet gevonden" });
    return;
  }
  if (!req.permissies!.magBijGebouw(bestaand.gebouwId)) {
    res.status(403).json({ message: "Geen toegang tot dit gebouw" });
    return;
  }
  const ctx = await effectieveContext(req);
  if (bestaand.gebruikerId !== ctx.userId) {
    res.status(403).json({ message: "Alleen de schrijver kan zijn eigen aantekening aanpassen" });
    return;
  }
  if (bestaand.verwijderdOp !== null) {
    res.status(403).json({ message: "Een doorgehaalde aantekening kan niet worden aangepast" });
    return;
  }
  if (Date.now() - bestaand.aangemaaktOp.getTime() >= BEWERK_VENSTER_MS) {
    res.status(403).json({
      message: "De 15 minuten om te corrigeren zijn voorbij; zet een nieuwe aantekening eronder",
    });
    return;
  }
  // Race-safe: alle voorwaarden nogmaals in de UPDATE zelf, zodat een
  // tussentijdse doorhaling of het verlopen van het venster nooit alsnog
  // een wijziging doorlaat (de checks hierboven geven alleen nette meldingen).
  const bijgewerkt = await db
    .update(gebouwNotitiesTable)
    .set({
      tekst: parse.data.tekst,
      bellerNaam:
        bestaand.type === "telefoon"
          ? (parse.data.beller_naam !== undefined ? parse.data.beller_naam : bestaand.bellerNaam)
          : null,
      bewerktOp: new Date(),
    })
    .where(
      and(
        eq(gebouwNotitiesTable.id, notitieId),
        eq(gebouwNotitiesTable.gebruikerId, ctx.userId),
        isNull(gebouwNotitiesTable.verwijderdOp),
        gt(gebouwNotitiesTable.aangemaaktOp, new Date(Date.now() - BEWERK_VENSTER_MS)),
      ),
    )
    .returning({ id: gebouwNotitiesTable.id });
  if (bijgewerkt.length === 0) {
    res.status(403).json({
      message: "Aanpassen kan niet meer: de aantekening is doorgehaald of het correctievenster is verlopen",
    });
    return;
  }
  const [rij] = await notitieSelectie().where(eq(gebouwNotitiesTable.id, notitieId));
  res.json(naarAntwoord(rij!, ctx.userId));
});

// DELETE /gebouwen/notities/:notitieId — doorhalen, alleen gebouwen niveau 4
router.delete(
  "/gebouwen/notities/:notitieId",
  requireBevoegdheid("gebouwen", 4),
  async (req, res): Promise<void> => {
    const notitieId = Number(req.params.notitieId);
    if (!Number.isInteger(notitieId)) {
      res.status(400).json({ message: "Ongeldig notitie-id" });
      return;
    }
    const [bestaand] = await db
      .select()
      .from(gebouwNotitiesTable)
      .where(eq(gebouwNotitiesTable.id, notitieId));
    if (!bestaand) {
      res.status(404).json({ message: "Aantekening niet gevonden" });
      return;
    }
    if (!req.permissies!.magBijGebouw(bestaand.gebouwId)) {
      res.status(403).json({ message: "Geen toegang tot dit gebouw" });
      return;
    }
    const ctx = await effectieveContext(req);
    // Race-safe: alleen doorhalen als de regel nog niet doorgehaald is; bij
    // twee gelijktijdige beheerders wint de eerste en blijft diens metadata staan.
    await db
      .update(gebouwNotitiesTable)
      .set({ verwijderdOp: new Date(), verwijderdDoorId: ctx.userId })
      .where(
        and(eq(gebouwNotitiesTable.id, notitieId), isNull(gebouwNotitiesTable.verwijderdOp)),
      );
    const [rij] = await notitieSelectie().where(eq(gebouwNotitiesTable.id, notitieId));
    res.json(naarAntwoord(rij!, ctx.userId));
  },
);

export default router;
