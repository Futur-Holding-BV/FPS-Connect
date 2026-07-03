import { Router } from "express";
import { db, auditLogTable } from "@workspace/db";
import { and, eq, gte, lte, or, ilike, desc, sql } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";

const router = Router();
const alleenBeheer = requireBevoegdheid("systeem", 1);

// ── Mapper ─────────────────────────────────────────────────────────────────────

function mapRegel(r: typeof auditLogTable.$inferSelect) {
  return {
    id: r.id,
    tijdstip: r.tijdstip.toISOString(),
    gebruiker_id: r.gebruikerId,
    gebruiker_naam: r.gebruikerNaam,
    ip_adres: r.ipAdres,
    sessie_id: r.sessieId,
    module: r.module,
    actie: r.actie,
    entiteit: r.entiteit,
    entiteit_id: r.entiteitId,
    entiteit_naam: r.entiteitNaam,
    oude_waarde: r.oudeWaarde,
    nieuwe_waarde: r.nieuweWaarde,
    workflow_status: r.workflowStatus,
    gebouw_id: r.gebouwId,
    medewerker_id: r.medewerkerId,
    document_id: r.documentId,
    meta: r.meta,
  };
}

function csvEscape(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

type QueryParams = Record<string, string | string[] | undefined>;

function str(v: string | string[] | undefined): string | undefined {
  if (typeof v === "string") return v || undefined;
  if (Array.isArray(v) && v.length > 0) return v[0];
  return undefined;
}

function bouwVoorwaarden(q: QueryParams) {
  const zoek = str(q.zoek);
  const mod = str(q.module);
  const actie = str(q.actie);
  const gebruiker_id = str(q.gebruiker_id);
  const gebouw_id = str(q.gebouw_id);
  const medewerker_id = str(q.medewerker_id);
  const van_datum = str(q.van_datum);
  const tot_datum = str(q.tot_datum);

  return and(
    van_datum ? gte(auditLogTable.tijdstip, new Date(van_datum)) : undefined,
    tot_datum ? lte(auditLogTable.tijdstip, new Date(tot_datum + "T23:59:59")) : undefined,
    mod ? eq(auditLogTable.module, mod) : undefined,
    actie ? eq(auditLogTable.actie, actie) : undefined,
    gebruiker_id ? eq(auditLogTable.gebruikerId, parseInt(gebruiker_id, 10)) : undefined,
    gebouw_id ? eq(auditLogTable.gebouwId, parseInt(gebouw_id, 10)) : undefined,
    medewerker_id ? eq(auditLogTable.medewerkerId, parseInt(medewerker_id, 10)) : undefined,
    zoek
      ? or(
          ilike(auditLogTable.gebruikerNaam, `%${zoek}%`),
          ilike(auditLogTable.entiteitNaam, `%${zoek}%`),
          ilike(auditLogTable.module, `%${zoek}%`),
          ilike(auditLogTable.entiteit, `%${zoek}%`),
        )
      : undefined,
  );
}

// ── GET /audit ─────────────────────────────────────────────────────────────────

router.get("/audit", alleenBeheer, async (req, res) => {
  try {
    const q = req.query as Record<string, string | undefined>;
    const limiet = Math.min(parseInt(q.limiet ?? "50", 10) || 50, 200);
    const offset = parseInt(q.offset ?? "0", 10) || 0;

    const voorwaarden = bouwVoorwaarden(q);

    const [teller] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(auditLogTable)
      .where(voorwaarden);

    const regels = await db
      .select()
      .from(auditLogTable)
      .where(voorwaarden)
      .orderBy(desc(auditLogTable.tijdstip))
      .limit(limiet)
      .offset(offset);

    res.json({ regels: regels.map(mapRegel), totaal: teller?.n ?? 0 });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── GET /audit/export ──────────────────────────────────────────────────────────

router.get("/audit/export", alleenBeheer, async (req, res) => {
  try {
    const q = req.query as Record<string, string | undefined>;
    const voorwaarden = bouwVoorwaarden(q);

    const regels = await db
      .select()
      .from(auditLogTable)
      .where(voorwaarden)
      .orderBy(desc(auditLogTable.tijdstip))
      .limit(10000);

    const koptekst = [
      "ID", "Tijdstip", "Gebruiker ID", "Gebruiker", "IP-adres", "Sessie ID",
      "Module", "Actie", "Entiteit", "Entiteit ID", "Entiteit naam",
      "Workflow status", "Gebouw ID", "Medewerker ID", "Document ID",
      "Oude waarde", "Nieuwe waarde",
    ].join(",");

    const rijen = regels.map((r) =>
      [
        r.id,
        r.tijdstip.toISOString(),
        r.gebruikerId ?? "",
        csvEscape(r.gebruikerNaam ?? ""),
        csvEscape(r.ipAdres ?? ""),
        csvEscape(r.sessieId ?? ""),
        csvEscape(r.module),
        csvEscape(r.actie),
        csvEscape(r.entiteit),
        r.entiteitId ?? "",
        csvEscape(r.entiteitNaam ?? ""),
        csvEscape(r.workflowStatus ?? ""),
        r.gebouwId ?? "",
        r.medewerkerId ?? "",
        r.documentId ?? "",
        csvEscape(r.oudeWaarde ? JSON.stringify(r.oudeWaarde) : ""),
        csvEscape(r.nieuweWaarde ? JSON.stringify(r.nieuweWaarde) : ""),
      ].join(","),
    );

    const csv = "\uFEFF" + [koptekst, ...rijen].join("\r\n");
    const datum = new Date().toISOString().slice(0, 10);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="audit-trail-${datum}.csv"`);
    res.send(csv);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── GET /audit/tijdlijn/gebouw/:id ─────────────────────────────────────────────

router.get("/audit/tijdlijn/gebouw/:id", alleenBeheer, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }
  try {
    const regels = await db
      .select()
      .from(auditLogTable)
      .where(eq(auditLogTable.gebouwId, id))
      .orderBy(desc(auditLogTable.tijdstip))
      .limit(500);
    res.json(regels.map(mapRegel));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── GET /audit/tijdlijn/medewerker/:id ────────────────────────────────────────

router.get("/audit/tijdlijn/medewerker/:id", alleenBeheer, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }
  try {
    const regels = await db
      .select()
      .from(auditLogTable)
      .where(eq(auditLogTable.medewerkerId, id))
      .orderBy(desc(auditLogTable.tijdstip))
      .limit(500);
    res.json(regels.map(mapRegel));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── GET /audit/tijdlijn/document/:id ──────────────────────────────────────────

router.get("/audit/tijdlijn/document/:id", alleenBeheer, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }
  try {
    const regels = await db
      .select()
      .from(auditLogTable)
      .where(eq(auditLogTable.documentId, id))
      .orderBy(desc(auditLogTable.tijdstip))
      .limit(500);
    res.json(regels.map(mapRegel));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Serverfout" });
  }
});

export default router;
