// WERVING_01 — Wervingsmodule: kandidaten, cv-toetsing en gespreksvragenlijst.
//
// Registratie + voorbereiding, meer niet: geen sollicitatieportaal, geen
// vacatureteksten, geen mailcampagnes. De AI oordeelt nooit (geen score,
// cijfer, rangschikking of geschiktheidsuitspraak) — zie
// services/wervingVoorbereiding.ts. Uitkomst en aantekeningen worden door de
// mens vastgelegd.
//
// AVG: bewaartermijn wordt afgedwongen in lib/avgOpruiming.ts (4 weken na
// afronding, of 1 jaar met uitdrukkelijke toestemming) — rij én cv-bestand.

import { Router } from "express";
import multer from "multer";
import {
  db,
  wervingKandidatenTable,
  wervingVragenTable,
  functieKernvragenTable,
  functiesTable,
  type WervingKandidaat,
  type WervingVraag,
  type FunctieKernvraag,
} from "@workspace/db";
import { eq, desc, asc, and, isNull, inArray, sql } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { ObjectStorageService } from "../lib/objectStorage";
import { bereidCvVoor, stelKernvragenVoor, verwijderKandidaatMetCv } from "../services/wervingVoorbereiding";

const router: Router = Router();
const lezen = requireBevoegdheid("personeel", 1);
const schrijven = requireBevoegdheid("personeel", 2);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const storage = new ObjectStorageService();

export const KANDIDAAT_STATUSSEN = ["ontvangen", "uitgenodigd", "gesproken", "afgewezen", "aangenomen"] as const;
const AFGEROND: ReadonlyArray<string> = ["afgewezen", "aangenomen"];

const CV_MIMES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "image/jpeg",
  "image/png",
]);

function veiligeBestandsnaam(naam: string): string {
  return naam.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "cv";
}

function mapKandidaat(k: WervingKandidaat, functieNaam?: string | null) {
  return {
    id: k.id,
    functie_id: k.functieId,
    functie_naam: functieNaam ?? null,
    naam: k.naam,
    email: k.email,
    telefoon: k.telefoon,
    kanaal: k.kanaal,
    status: k.status,
    toestemming_bewaring: k.toestemmingBewaring,
    procedure_afgerond_op: k.procedureAfgerondOp ? k.procedureAfgerondOp.toISOString() : null,
    cv_bestandsnaam: k.cvBestandsnaam,
    heeft_cv: Boolean(k.cvObjectPath),
    toetsing: (k.toetsing as unknown[] | null) ?? null,
    toetsing_op: k.toetsingOp ? k.toetsingOp.toISOString() : null,
    eindconclusie: k.eindconclusie,
    aangemaakt_op: k.aangemaaktOp.toISOString(),
    bijgewerkt_op: k.bijgewerktOp.toISOString(),
  };
}

function mapVraag(v: WervingVraag) {
  return {
    id: v.id,
    kandidaat_id: v.kandidaatId,
    volgorde: v.volgorde,
    bron: v.bron,
    vraag: v.vraag,
    aantekening: v.aantekening,
  };
}

function mapKernvraag(v: FunctieKernvraag) {
  return { id: v.id, functie_id: v.functieId, volgorde: v.volgorde, vraag: v.vraag };
}

// ── Kandidaten ────────────────────────────────────────────────────────────────

router.get("/werving/kandidaten", lezen, async (_req, res): Promise<void> => {
  try {
    const rijen = await db
      .select({ kandidaat: wervingKandidatenTable, functieNaam: functiesTable.naam })
      .from(wervingKandidatenTable)
      .leftJoin(functiesTable, eq(wervingKandidatenTable.functieId, functiesTable.id))
      .orderBy(desc(wervingKandidatenTable.aangemaaktOp));
    res.json(rijen.map((r) => mapKandidaat(r.kandidaat, r.functieNaam)));
  } catch (err) {
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/werving/kandidaten", schrijven, upload.single("cv"), async (req, res): Promise<void> => {
  try {
    const naam = typeof req.body?.naam === "string" ? req.body.naam.trim() : "";
    const functieId = parseInt(String(req.body?.functie_id), 10);
    if (!naam || !Number.isFinite(functieId)) {
      return void res.status(422).json({ error: "Naam en functie zijn verplicht." });
    }
    const functie = await db.select().from(functiesTable).where(eq(functiesTable.id, functieId)).limit(1);
    if (functie.length === 0) return void res.status(422).json({ error: "Functie niet gevonden." });

    const bestand = req.file;
    if (bestand && !CV_MIMES.has(bestand.mimetype)) {
      return void res.status(422).json({ error: "Cv-bestandstype niet ondersteund (PDF, DOCX, tekst of afbeelding)." });
    }

    const [rij] = await db
      .insert(wervingKandidatenTable)
      .values({
        functieId,
        naam,
        email: typeof req.body?.email === "string" && req.body.email.trim() ? req.body.email.trim() : null,
        telefoon: typeof req.body?.telefoon === "string" && req.body.telefoon.trim() ? req.body.telefoon.trim() : null,
        kanaal: typeof req.body?.kanaal === "string" && req.body.kanaal.trim() ? req.body.kanaal.trim() : "onbekend",
        toestemmingBewaring: String(req.body?.toestemming_bewaring) === "true",
      })
      .returning();

    if (bestand) {
      const subPath = `werving/kandidaat-${rij.id}/${veiligeBestandsnaam(bestand.originalname)}`;
      const objectPath = await storage.uploadBestand(subPath, bestand.buffer, bestand.mimetype);
      const [bijgewerkt] = await db
        .update(wervingKandidatenTable)
        .set({ cvObjectPath: objectPath, cvBestandsnaam: bestand.originalname, cvMime: bestand.mimetype, bijgewerktOp: new Date() })
        .where(eq(wervingKandidatenTable.id, rij.id))
        .returning();
      return void res.status(201).json(mapKandidaat(bijgewerkt, functie[0].naam));
    }
    res.status(201).json(mapKandidaat(rij, functie[0].naam));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.get("/werving/kandidaten/:id", lezen, async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const rijen = await db
      .select({ kandidaat: wervingKandidatenTable, functieNaam: functiesTable.naam })
      .from(wervingKandidatenTable)
      .leftJoin(functiesTable, eq(wervingKandidatenTable.functieId, functiesTable.id))
      .where(eq(wervingKandidatenTable.id, id))
      .limit(1);
    if (rijen.length === 0) return void res.status(404).json({ error: "Kandidaat niet gevonden" });
    const vragen = await db
      .select()
      .from(wervingVragenTable)
      .where(eq(wervingVragenTable.kandidaatId, id))
      .orderBy(asc(wervingVragenTable.volgorde), asc(wervingVragenTable.id));
    res.json({ ...mapKandidaat(rijen[0].kandidaat, rijen[0].functieNaam), vragen: vragen.map(mapVraag) });
  } catch (err) {
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/werving/kandidaten/:id", schrijven, async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const bestaand = await db.select().from(wervingKandidatenTable).where(eq(wervingKandidatenTable.id, id)).limit(1);
    if (bestaand.length === 0) return void res.status(404).json({ error: "Kandidaat niet gevonden" });

    const b = req.body ?? {};
    const wijzigingen: Partial<typeof wervingKandidatenTable.$inferInsert> = { bijgewerktOp: new Date() };
    if (typeof b.naam === "string" && b.naam.trim()) wijzigingen.naam = b.naam.trim();
    if (typeof b.email === "string" || b.email === null) wijzigingen.email = b.email ? String(b.email).trim() : null;
    if (typeof b.telefoon === "string" || b.telefoon === null) wijzigingen.telefoon = b.telefoon ? String(b.telefoon).trim() : null;
    if (typeof b.kanaal === "string" && b.kanaal.trim()) wijzigingen.kanaal = b.kanaal.trim();
    if (typeof b.toestemming_bewaring === "boolean") wijzigingen.toestemmingBewaring = b.toestemming_bewaring;
    if (typeof b.eindconclusie === "string" || b.eindconclusie === null) wijzigingen.eindconclusie = b.eindconclusie || null;
    if (typeof b.status === "string") {
      if (!KANDIDAAT_STATUSSEN.includes(b.status as (typeof KANDIDAAT_STATUSSEN)[number])) {
        return void res.status(422).json({ error: "Ongeldige status." });
      }
      wijzigingen.status = b.status;
      // Bewaartermijn start zodra de procedure is afgerond (afgewezen/aangenomen).
      wijzigingen.procedureAfgerondOp = AFGEROND.includes(b.status) ? (bestaand[0].procedureAfgerondOp ?? new Date()) : null;
    }
    const [rij] = await db.update(wervingKandidatenTable).set(wijzigingen).where(eq(wervingKandidatenTable.id, id)).returning();
    res.json(mapKandidaat(rij));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/werving/kandidaten/:id", schrijven, async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const bestaand = await db.select().from(wervingKandidatenTable).where(eq(wervingKandidatenTable.id, id)).limit(1);
    if (bestaand.length === 0) return void res.status(404).json({ error: "Kandidaat niet gevonden" });
    // AVG: cv-bestand eerst en aantoonbaar verwijderen; faalt dat, dan blijft
    // de rij staan (502) zodat opnieuw proberen mogelijk is en er nooit een
    // wees-cv in de opslag achterblijft.
    try {
      await verwijderKandidaatMetCv({
        cvObjectPath: bestaand[0].cvObjectPath,
        verwijderBestand: (pad) => storage.deleteBestand(pad),
        verwijderRij: async () => {
          await db.delete(wervingKandidatenTable).where(eq(wervingKandidatenTable.id, id));
        },
      });
    } catch (err) {
      req.log.error({ err, kandidaatId: id }, "werving: cv-bestand verwijderen mislukt — kandidaat blijft staan");
      return void res.status(502).json({ error: "Het cv-bestand kon niet uit de opslag worden verwijderd. De kandidaat is NIET verwijderd; probeer het opnieuw." });
    }
    res.status(204).end();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Cv downloaden ─────────────────────────────────────────────────────────────

router.get("/werving/kandidaten/:id/cv", lezen, async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const rijen = await db.select().from(wervingKandidatenTable).where(eq(wervingKandidatenTable.id, id)).limit(1);
    if (rijen.length === 0 || !rijen[0].cvObjectPath) return void res.status(404).json({ error: "Geen cv aanwezig" });
    const subPath = rijen[0].cvObjectPath.replace(/^\/objects\//, "");
    const buffer = await storage.downloadBestandBuffer(subPath);
    res.setHeader("Content-Type", rijen[0].cvMime ?? "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${veiligeBestandsnaam(rijen[0].cvBestandsnaam ?? "cv")}"`);
    res.send(buffer);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Cv ophalen mislukt" });
  }
});

// ── AI-voorbereiding: toetsing + vragenlijst opbouwen ─────────────────────────

router.post("/werving/kandidaten/:id/voorbereiden", schrijven, async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const rijen = await db.select().from(wervingKandidatenTable).where(eq(wervingKandidatenTable.id, id)).limit(1);
    if (rijen.length === 0) return void res.status(404).json({ error: "Kandidaat niet gevonden" });
    const kandidaat = rijen[0];
    if (!kandidaat.cvObjectPath) return void res.status(422).json({ error: "Deze kandidaat heeft geen cv. Upload eerst een cv." });

    const functieRijen = await db.select().from(functiesTable).where(eq(functiesTable.id, kandidaat.functieId)).limit(1);
    if (functieRijen.length === 0) return void res.status(422).json({ error: "Functie niet gevonden." });

    const subPath = kandidaat.cvObjectPath.replace(/^\/objects\//, "");
    const cvBuffer = await storage.downloadBestandBuffer(subPath);

    const uitkomst = await bereidCvVoor({
      functie: functieRijen[0],
      cvBuffer,
      cvMime: kandidaat.cvMime ?? "application/pdf",
      cvBestandsnaam: kandidaat.cvBestandsnaam ?? "cv.pdf",
      gebruikerId: req.session?.userId ?? null,
      kandidaatId: id,
      kandidaatNaam: kandidaat.naam,
    });
    if (!uitkomst.ok) return void res.status(uitkomst.status).json({ error: uitkomst.fout });

    // Kernvragen van de functie (identiek voor elke kandidaat op deze functie).
    const kernvragen = await db
      .select()
      .from(functieKernvragenTable)
      .where(eq(functieKernvragenTable.functieId, kandidaat.functieId))
      .orderBy(asc(functieKernvragenTable.volgorde), asc(functieKernvragenTable.id));

    await db.transaction(async (tx) => {
      await tx
        .update(wervingKandidatenTable)
        .set({ toetsing: uitkomst.toetsing, toetsingOp: new Date(), bijgewerktOp: new Date() })
        .where(eq(wervingKandidatenTable.id, id));
      // Vragen zonder aantekening vervangen; vragen mét aantekening blijven staan
      // (gespreksverslag mag nooit verloren gaan door opnieuw voorbereiden).
      await tx.delete(wervingVragenTable).where(and(eq(wervingVragenTable.kandidaatId, id), isNull(wervingVragenTable.aantekening)));
      let volgorde = 0;
      const nieuwe: Array<typeof wervingVragenTable.$inferInsert> = [];
      for (const kv of kernvragen) nieuwe.push({ kandidaatId: id, volgorde: volgorde++, bron: "kern", vraag: kv.vraag });
      for (const cv of uitkomst.cvVragen) nieuwe.push({ kandidaatId: id, volgorde: volgorde++, bron: "cv", vraag: cv.vraag, aantekening: null });
      if (nieuwe.length > 0) await tx.insert(wervingVragenTable).values(nieuwe);
    });

    const vragen = await db
      .select()
      .from(wervingVragenTable)
      .where(eq(wervingVragenTable.kandidaatId, id))
      .orderBy(asc(wervingVragenTable.volgorde), asc(wervingVragenTable.id));
    const [bijgewerkt] = await db.select().from(wervingKandidatenTable).where(eq(wervingKandidatenTable.id, id)).limit(1);
    res.json({ ...mapKandidaat(bijgewerkt, functieRijen[0].naam), vragen: vragen.map(mapVraag), cv_bron: uitkomst.bron });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Vragenlijst bewerken ──────────────────────────────────────────────────────

router.post("/werving/kandidaten/:id/vragen", schrijven, async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const vraag = typeof req.body?.vraag === "string" ? req.body.vraag.trim() : "";
    if (!vraag) return void res.status(422).json({ error: "Vraag is verplicht." });
    const bestaand = await db.select().from(wervingKandidatenTable).where(eq(wervingKandidatenTable.id, id)).limit(1);
    if (bestaand.length === 0) return void res.status(404).json({ error: "Kandidaat niet gevonden" });
    const [{ max }] = await db
      .select({ max: sql<number>`coalesce(max(${wervingVragenTable.volgorde}), -1)` })
      .from(wervingVragenTable)
      .where(eq(wervingVragenTable.kandidaatId, id));
    const [rij] = await db
      .insert(wervingVragenTable)
      .values({ kandidaatId: id, volgorde: Number(max) + 1, bron: "handmatig", vraag })
      .returning();
    res.status(201).json(mapVraag(rij));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/werving/vragen/:id", schrijven, async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const b = req.body ?? {};
    const wijzigingen: Partial<typeof wervingVragenTable.$inferInsert> = { bijgewerktOp: new Date() };
    if (typeof b.vraag === "string" && b.vraag.trim()) wijzigingen.vraag = b.vraag.trim();
    if (typeof b.aantekening === "string" || b.aantekening === null) wijzigingen.aantekening = b.aantekening || null;
    if (typeof b.volgorde === "number") wijzigingen.volgorde = b.volgorde;
    const [rij] = await db.update(wervingVragenTable).set(wijzigingen).where(eq(wervingVragenTable.id, id)).returning();
    if (!rij) return void res.status(404).json({ error: "Vraag niet gevonden" });
    res.json(mapVraag(rij));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/werving/vragen/:id", schrijven, async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const result = await db.delete(wervingVragenTable).where(eq(wervingVragenTable.id, id)).returning({ id: wervingVragenTable.id });
    if (result.length === 0) return void res.status(404).json({ error: "Vraag niet gevonden" });
    res.status(204).end();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Kernvragen per functie ────────────────────────────────────────────────────

router.get("/werving/functies/:id/kernvragen", lezen, async (req, res): Promise<void> => {
  try {
    const functieId = parseInt(String(req.params.id), 10);
    const rijen = await db
      .select()
      .from(functieKernvragenTable)
      .where(eq(functieKernvragenTable.functieId, functieId))
      .orderBy(asc(functieKernvragenTable.volgorde), asc(functieKernvragenTable.id));
    res.json(rijen.map(mapKernvraag));
  } catch (err) {
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.put("/werving/functies/:id/kernvragen", schrijven, async (req, res): Promise<void> => {
  try {
    const functieId = parseInt(String(req.params.id), 10);
    const functie = await db.select().from(functiesTable).where(eq(functiesTable.id, functieId)).limit(1);
    if (functie.length === 0) return void res.status(404).json({ error: "Functie niet gevonden" });
    const vragen: unknown = req.body?.vragen;
    if (!Array.isArray(vragen)) return void res.status(422).json({ error: "Stuur { vragen: string[] }." });
    const schoon = vragen
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter((v) => v.length > 0)
      .slice(0, 30);
    const rijen = await db.transaction(async (tx) => {
      await tx.delete(functieKernvragenTable).where(eq(functieKernvragenTable.functieId, functieId));
      if (schoon.length === 0) return [] as FunctieKernvraag[];
      return tx
        .insert(functieKernvragenTable)
        .values(schoon.map((vraag, i) => ({ functieId, volgorde: i, vraag })))
        .returning();
    });
    res.json(rijen.map(mapKernvraag));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/werving/functies/:id/kernvragen-voorstel", schrijven, async (req, res): Promise<void> => {
  try {
    const functieId = parseInt(String(req.params.id), 10);
    const functie = await db.select().from(functiesTable).where(eq(functiesTable.id, functieId)).limit(1);
    if (functie.length === 0) return void res.status(404).json({ error: "Functie niet gevonden" });
    const uitkomst = await stelKernvragenVoor({ functie: functie[0], gebruikerId: req.session?.userId ?? null });
    if (!uitkomst.ok) return void res.status(uitkomst.status).json({ error: uitkomst.fout });
    // Alleen een voorstel — de mens bevestigt en bewaart via PUT.
    res.json({ vragen: uitkomst.vragen });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Kanalenoverzicht ──────────────────────────────────────────────────────────

router.get("/werving/kanalen", lezen, async (_req, res): Promise<void> => {
  try {
    const rijen = await db
      .select({
        kanaal: wervingKandidatenTable.kanaal,
        status: wervingKandidatenTable.status,
        aantal: sql<number>`count(*)::int`,
      })
      .from(wervingKandidatenTable)
      .groupBy(wervingKandidatenTable.kanaal, wervingKandidatenTable.status);
    const perKanaal = new Map<string, { kanaal: string; totaal: number; per_status: Record<string, number> }>();
    for (const r of rijen) {
      const item = perKanaal.get(r.kanaal) ?? { kanaal: r.kanaal, totaal: 0, per_status: {} };
      item.totaal += Number(r.aantal);
      item.per_status[r.status] = Number(r.aantal);
      perKanaal.set(r.kanaal, item);
    }
    res.json(Array.from(perKanaal.values()).sort((a, b) => b.totaal - a.totaal));
  } catch (err) {
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
