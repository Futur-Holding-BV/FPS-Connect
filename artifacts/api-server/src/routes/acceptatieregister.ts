// Acceptatieregister (REGISTER_01) — één regel per acceptatiepunt per opdracht.
// Alleen de hoofdbeheerder ziet en beheert het register; opleveringen werken
// de standen bij via scripts (zie scripts/src/oplever-check.ts).
import { Router, type IRouter } from "express";
import { db, acceptatieRegisterTable, ACCEPTATIE_STANDEN } from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import { requireRol } from "../middlewares/auth";

const router: IRouter = Router();

function naarDto(r: typeof acceptatieRegisterTable.$inferSelect) {
  return {
    id: r.id,
    opdracht_code: r.opdrachtCode,
    punt_nummer: r.puntNummer,
    omschrijving: r.omschrijving,
    stand: r.stand,
    bewijs_vindplaats: r.bewijsVindplaats,
    bron_bestand: r.bronBestand,
    toelichting: r.toelichting,
    bijgewerkt_op: r.bijgewerktOp.toISOString(),
  };
}

router.get("/acceptatieregister", requireRol("hoofdbeheerder"), async (_req, res): Promise<void> => {
  const rijen = await db
    .select()
    .from(acceptatieRegisterTable)
    .orderBy(asc(acceptatieRegisterTable.opdrachtCode), asc(acceptatieRegisterTable.puntNummer));
  res.json(rijen.map(naarDto));
});

router.patch("/acceptatieregister/:id", requireRol("hoofdbeheerder"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return void res.status(400).json({ error: "Ongeldig id" });

  // Strikte body-validatie: alleen bekende velden, juiste types, en minstens
  // één echte wijziging — een lege PATCH mag bijgewerkt_op niet verversen
  // (dat zou de oplevercontrole "register is bijgewerkt" omzeilbaar maken).
  const body = req.body as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return void res.status(400).json({ error: "Body moet een object zijn" });
  }
  const toegestaan = ["stand", "bewijs_vindplaats", "toelichting"] as const;
  const onbekend = Object.keys(body).filter((k) => !(toegestaan as readonly string[]).includes(k));
  if (onbekend.length > 0) {
    return void res.status(400).json({ error: `Onbekende velden: ${onbekend.join(", ")}` });
  }
  if (Object.keys(body).length === 0) {
    return void res.status(400).json({ error: "Geef minstens één veld op (stand, bewijs_vindplaats of toelichting)" });
  }

  const wijziging: Partial<typeof acceptatieRegisterTable.$inferInsert> = { bijgewerktOp: new Date() };
  if ("stand" in body) {
    const stand = body["stand"];
    if (typeof stand !== "string" || !(ACCEPTATIE_STANDEN as readonly string[]).includes(stand)) {
      return void res.status(400).json({ error: `Ongeldige stand — kies uit: ${ACCEPTATIE_STANDEN.join(", ")}` });
    }
    wijziging.stand = stand;
  }
  if ("bewijs_vindplaats" in body) {
    const b = body["bewijs_vindplaats"];
    if (b !== null && typeof b !== "string") return void res.status(400).json({ error: "bewijs_vindplaats moet tekst of null zijn" });
    wijziging.bewijsVindplaats = b ? b.slice(0, 500) : null;
  }
  if ("toelichting" in body) {
    const t = body["toelichting"];
    if (t !== null && typeof t !== "string") return void res.status(400).json({ error: "toelichting moet tekst of null zijn" });
    wijziging.toelichting = t ? t.slice(0, 1000) : null;
  }

  const [huidig] = await db.select().from(acceptatieRegisterTable).where(eq(acceptatieRegisterTable.id, id));
  if (!huidig) return void res.status(404).json({ error: "Acceptatiepunt niet gevonden" });

  // Fail-closed invariant: "gehaald" alleen met een niet-lege bewijs-vindplaats.
  const nieuweStand = wijziging.stand ?? huidig.stand;
  const nieuwBewijs = "bewijs_vindplaats" in body ? wijziging.bewijsVindplaats : huidig.bewijsVindplaats;
  if (nieuweStand === "gehaald" && !nieuwBewijs?.trim()) {
    return void res.status(400).json({ error: 'Stand "gehaald" vereist een bewijs-vindplaats' });
  }

  const [rij] = await db
    .update(acceptatieRegisterTable)
    .set(wijziging)
    .where(eq(acceptatieRegisterTable.id, id))
    .returning();
  if (!rij) return void res.status(404).json({ error: "Acceptatiepunt niet gevonden" });
  res.json(naarDto(rij));
});

export default router;
