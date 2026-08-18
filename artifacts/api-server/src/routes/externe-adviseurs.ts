// GEBRUIKERS_01 aanvulling: externe adviseur / dienstverlener.
// Herbert (externe boekhouder) en Dunya (externe HRM-adviseur) leveren een
// dienst aan het bedrijf: zij krijgen een account met functie en rechten,
// maar GEEN medewerkerprofiel, aanstelling, contract, verlofopbouw of
// contractbewaking. Hier leggen we vast: bedrijf, contactpersoon, waarvoor
// ingeschakeld en tot wanneer de toegang geldt. De toegang_tot-datum wordt
// bij het inloggen fail-closed gecontroleerd (auth.ts).
import { Router } from "express";
import { db, externeAdviseursTable, gebruikersTable, medewerkersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";

const router = Router();

// Zelfde gates als de rest van de onboarding-wizard: personeel niveau 1
// (lezen) en 2 (schrijven).
const lezen = requireBevoegdheid("personeel", 1);
const schrijven = requireBevoegdheid("personeel", 2);

function mapAdviseur(
  a: typeof externeAdviseursTable.$inferSelect,
  g?: { naam: string; email: string; actief: boolean } | null,
) {
  return {
    id: a.id,
    gebruiker_id: a.gebruikerId,
    naam: g?.naam ?? null,
    email: g?.email ?? null,
    account_actief: g?.actief ?? null,
    bedrijf: a.bedrijf,
    contactpersoon: a.contactpersoon ?? null,
    ingeschakeld_voor: a.ingeschakeldVoor,
    functietitel: a.functietitel ?? null,
    toegang_tot: a.toegangTot,
    aangemaakt_op: a.aangemaaktOp?.toISOString() ?? null,
  };
}

const DATUM_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /externe-adviseurs — overzicht van externe adviseurs/dienstverleners.
router.get("/externe-adviseurs", lezen, async (req, res): Promise<void> => {
  try {
    const rijen = await db
      .select({
        adviseur: externeAdviseursTable,
        naam: gebruikersTable.naam,
        email: gebruikersTable.email,
        actief: gebruikersTable.actief,
      })
      .from(externeAdviseursTable)
      .innerJoin(gebruikersTable, eq(gebruikersTable.id, externeAdviseursTable.gebruikerId))
      .orderBy(desc(externeAdviseursTable.aangemaaktOp));
    res.json(rijen.map((r) => mapAdviseur(r.adviseur, { naam: r.naam, email: r.email, actief: r.actief })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /externe-adviseurs — registreer een bestaand gebruikersaccount als
// externe adviseur. Bewust GEEN medewerker-, contract- of verlofbijwerking.
router.post("/externe-adviseurs", schrijven, async (req, res): Promise<void> => {
  try {
    const { gebruiker_id, bedrijf, contactpersoon, ingeschakeld_voor, functietitel, toegang_tot } = req.body ?? {};
    if (typeof gebruiker_id !== "number" || !Number.isInteger(gebruiker_id)) {
      return void res.status(400).json({ error: "gebruiker_id is verplicht" });
    }
    if (typeof bedrijf !== "string" || !bedrijf.trim()) {
      return void res.status(400).json({ error: "bedrijf is verplicht" });
    }
    if (typeof ingeschakeld_voor !== "string" || !ingeschakeld_voor.trim()) {
      return void res.status(400).json({ error: "ingeschakeld_voor is verplicht" });
    }
    if (typeof toegang_tot !== "string" || !DATUM_RE.test(toegang_tot)) {
      return void res.status(400).json({ error: "toegang_tot (JJJJ-MM-DD) is verplicht" });
    }
    const [g] = await db.select().from(gebruikersTable).where(eq(gebruikersTable.id, gebruiker_id));
    if (!g || g.geanonimiseerd) {
      return void res.status(404).json({ error: "Gebruiker niet gevonden" });
    }
    // Een externe adviseur hoort niet in het personeelsbestand: bestaat er al
    // een medewerkerprofiel, dan is dit de verkeerde soort (409).
    const [medewerker] = await db
      .select({ id: medewerkersTable.id })
      .from(medewerkersTable)
      .where(eq(medewerkersTable.gebruikerId, gebruiker_id))
      .limit(1);
    if (medewerker) {
      return void res.status(409).json({ error: "Dit account heeft al een medewerkerprofiel; een externe adviseur staat bewust buiten het personeelsbestand." });
    }
    const [bestaand] = await db
      .select({ id: externeAdviseursTable.id })
      .from(externeAdviseursTable)
      .where(eq(externeAdviseursTable.gebruikerId, gebruiker_id))
      .limit(1);
    if (bestaand) {
      return void res.status(409).json({ error: "Dit account is al geregistreerd als externe adviseur." });
    }
    const [nieuw] = await db
      .insert(externeAdviseursTable)
      .values({
        gebruikerId: gebruiker_id,
        bedrijf: bedrijf.trim(),
        contactpersoon: typeof contactpersoon === "string" && contactpersoon.trim() ? contactpersoon.trim() : null,
        ingeschakeldVoor: ingeschakeld_voor.trim(),
        functietitel: typeof functietitel === "string" && functietitel.trim() ? functietitel.trim() : null,
        toegangTot: toegang_tot,
      })
      .returning();
    res.status(201).json(mapAdviseur(nieuw, { naam: g.naam, email: g.email, actief: g.actief }));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// PATCH /externe-adviseurs/:id — gegevens bijwerken of toegang verlengen.
router.patch("/externe-adviseurs/:id", schrijven, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return void res.status(400).json({ error: "Ongeldig id" });
    const { bedrijf, contactpersoon, ingeschakeld_voor, functietitel, toegang_tot } = req.body ?? {};
    const set: Partial<typeof externeAdviseursTable.$inferInsert> = { bijgewerktOp: new Date() };
    if (bedrijf !== undefined) {
      if (typeof bedrijf !== "string" || !bedrijf.trim()) return void res.status(400).json({ error: "bedrijf mag niet leeg zijn" });
      set.bedrijf = bedrijf.trim();
    }
    if (contactpersoon !== undefined) {
      set.contactpersoon = typeof contactpersoon === "string" && contactpersoon.trim() ? contactpersoon.trim() : null;
    }
    if (ingeschakeld_voor !== undefined) {
      if (typeof ingeschakeld_voor !== "string" || !ingeschakeld_voor.trim()) return void res.status(400).json({ error: "ingeschakeld_voor mag niet leeg zijn" });
      set.ingeschakeldVoor = ingeschakeld_voor.trim();
    }
    if (functietitel !== undefined) {
      set.functietitel = typeof functietitel === "string" && functietitel.trim() ? functietitel.trim() : null;
    }
    if (toegang_tot !== undefined) {
      if (typeof toegang_tot !== "string" || !DATUM_RE.test(toegang_tot)) {
        return void res.status(400).json({ error: "toegang_tot moet JJJJ-MM-DD zijn" });
      }
      set.toegangTot = toegang_tot;
    }
    const [bijgewerkt] = await db
      .update(externeAdviseursTable)
      .set(set)
      .where(eq(externeAdviseursTable.id, id))
      .returning();
    if (!bijgewerkt) return void res.status(404).json({ error: "Externe adviseur niet gevonden" });
    const [g] = await db
      .select({ naam: gebruikersTable.naam, email: gebruikersTable.email, actief: gebruikersTable.actief })
      .from(gebruikersTable)
      .where(eq(gebruikersTable.id, bijgewerkt.gebruikerId));
    res.json(mapAdviseur(bijgewerkt, g ?? null));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
