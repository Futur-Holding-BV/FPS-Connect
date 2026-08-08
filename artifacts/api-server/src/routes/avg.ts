import { Router } from "express";
import { publiekeAppUrl } from "../lib/publiekeUrl";
import { db } from "@workspace/db";
import {
  gebruikersTable,
  avgInzageverzoekTable,
  avgVerwerkersTable,
  activiteitenTable,
  medewerkersTable,
  verlofSaldiTable,
  verlofsoortenTable,
  medewerkerOpleidingenTable,
  opleidingenTable,
  auditLogTable,
  verlofAanvragenTable,
  opdrachtenTable,
  avgOpschoonLogTable,
} from "@workspace/db";
import { eq, desc, and, lt, sql } from "drizzle-orm";
import { requireBevoegdheid, requireAuth } from "../middlewares/auth";
import { logActiviteit } from "../lib/activiteit";
import { anonimiseerGebruiker } from "../lib/avgAnonimiseren";
import { stuurAvgVerzoekBevestiging, stuurAvgVerzoekAfgehandeldMail } from "../services/email";

const router = Router();

const alleenBeheer = requireBevoegdheid("systeem", 1);

// ── Mapper ────────────────────────────────────────────────────────────────────
// Veldnaam in API-antwoord: toelichting (gebruikersterm), afgerond_op (server-term)

function mapVerzoek(r: typeof avgInzageverzoekTable.$inferSelect, gebruikerNaam?: string | null) {
  return {
    id: r.id,
    gebruiker_id: r.gebruikerId,
    gebruiker_naam: gebruikerNaam ?? null,
    type: r.type,
    status: r.status,
    toelichting: r.opmerking ?? null,
    beheerder_opmerking: r.beheerderOpmerking ?? null,
    afgerond_op: r.afgerondOp?.toISOString() ?? null,
    geanonimiseerd_op: r.geanonimiseerdOp?.toISOString() ?? null,
    aangemaakt_op: r.aangemaaktOp.toISOString(),
    bijgewerkt_op: r.bijgewerktOp.toISOString(),
  };
}

// ── POST /avg/inzageverzoek — gebruiker dient verzoek in ─────────────────────

router.post("/avg/inzageverzoek", requireAuth, async (req, res): Promise<void> => {
  try {
    const gebruikerId = req.session.userId;
    if (!gebruikerId) return void res.status(401).json({ error: "Niet ingelogd" });

    const { type, toelichting } = req.body ?? {};
    const TOEGESTANE_TYPES = ["inzage", "verwijdering", "correctie", "beperking", "bezwaar"];
    const verzoekType = TOEGESTANE_TYPES.includes(type) ? type : "inzage";

    // Maximaal 1 open verzoek per type per gebruiker
    const [bestaand] = await db
      .select({ id: avgInzageverzoekTable.id })
      .from(avgInzageverzoekTable)
      .where(
        and(
          eq(avgInzageverzoekTable.gebruikerId, gebruikerId),
          eq(avgInzageverzoekTable.type, verzoekType),
          eq(avgInzageverzoekTable.status, "open"),
        ),
      )
      .limit(1);

    if (bestaand) {
      return void res.status(409).json({
        error: "Er staat al een open verzoek van dit type. Wacht tot dit is afgehandeld.",
      });
    }

    const [verzoek] = await db
      .insert(avgInzageverzoekTable)
      .values({
        gebruikerId,
        type: verzoekType,
        status: "open",
        opmerking: typeof toelichting === "string" && toelichting.trim() ? toelichting.trim() : null,
      })
      .returning();

    // Interne activiteitsregistratie (voor audittrail + interne meldingsfeed)
    await logActiviteit({
      type: "avg_verzoek",
      omschrijving: `AVG-${verzoekType}verzoek ingediend`,
      gebruikerId,
    });

    const [indiener] = await db
      .select({ naam: gebruikersTable.naam, email: gebruikersTable.email })
      .from(gebruikersTable)
      .where(eq(gebruikersTable.id, gebruikerId))
      .limit(1);
    if (indiener?.email) {
      void stuurAvgVerzoekBevestiging({
        naarEmail: indiener.email,
        naarNaam: indiener.naam,
        type: verzoekType,
        verzoekId: verzoek.id,
      });
    }

    req.log.info({ gebruikerId, type: verzoekType }, "AVG-verzoek ingediend");
    res.status(201).json(mapVerzoek(verzoek));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── GET /avg/inzageverzoeken — beheerder lijst ────────────────────────────────

router.get("/avg/inzageverzoeken", alleenBeheer, async (req, res): Promise<void> => {
  try {
    const q = req.query as Record<string, string | undefined>;
    const status = q.status ?? "open";
    const limiet = Math.min(parseInt(q.limiet ?? "50", 10) || 50, 200);
    const offset = parseInt(q.offset ?? "0", 10) || 0;

    const voorwaarden = status === "alle" ? undefined : eq(avgInzageverzoekTable.status, status);

    const [teller] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(avgInzageverzoekTable)
      .where(voorwaarden);

    const rijen = await db
      .select({
        verzoek: avgInzageverzoekTable,
        gebruikerNaam: gebruikersTable.naam,
      })
      .from(avgInzageverzoekTable)
      .leftJoin(gebruikersTable, eq(avgInzageverzoekTable.gebruikerId, gebruikersTable.id))
      .where(voorwaarden)
      .orderBy(desc(avgInzageverzoekTable.aangemaaktOp))
      .limit(limiet)
      .offset(offset);

    res.json({
      verzoeken: rijen.map((r) => mapVerzoek(r.verzoek, r.gebruikerNaam)),
      totaal: teller?.n ?? 0,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── PATCH /avg/inzageverzoek/:id — status bijwerken (beheerder) ──────────────

router.patch("/avg/inzageverzoek/:id", alleenBeheer, async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) return void res.status(400).json({ error: "Ongeldig id" });

    const { status, beheerder_opmerking } = req.body ?? {};
    const toegestaan = ["open", "in_behandeling", "afgerond", "afgewezen"];
    if (status && !toegestaan.includes(status)) {
      return void res.status(400).json({ error: "Ongeldige status" });
    }

    const nu = new Date();
    const [bijgewerkt] = await db
      .update(avgInzageverzoekTable)
      .set({
        status: status ?? undefined,
        beheerderOpmerking: beheerder_opmerking ?? undefined,
        afgerondOp: status === "afgerond" ? nu : undefined,
        bijgewerktOp: nu,
      })
      .where(eq(avgInzageverzoekTable.id, id))
      .returning();

    if (!bijgewerkt) return void res.status(404).json({ error: "Verzoek niet gevonden" });

    const [gebruiker] = await db
      .select({ naam: gebruikersTable.naam, email: gebruikersTable.email })
      .from(gebruikersTable)
      .where(eq(gebruikersTable.id, bijgewerkt.gebruikerId));

    if (gebruiker?.email && (status === "afgerond" || status === "afgewezen")) {
      const host = publiekeAppUrl()?.replace(/^https?:\/\//, "") ?? req.get("host") ?? "localhost";
      const exportLink = status === "afgerond" && bijgewerkt.type === "inzage" 
        ? `https://${host}/api/avg/inzageverzoek/${bijgewerkt.id}/export`
        : null;

      void stuurAvgVerzoekAfgehandeldMail({
        naarEmail: gebruiker.email,
        naarNaam: gebruiker.naam,
        type: bijgewerkt.type,
        status: status as "afgerond" | "afgewezen",
        beheerderOpmerking: bijgewerkt.beheerderOpmerking,
        exportLink
      }).catch(err => req.log.error(err, "Fout bij versturen AVG afhandeling mail"));
    }

    res.json(mapVerzoek(bijgewerkt, gebruiker?.naam));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── GET /avg/inzageverzoek/:id/export — JSON of CSV export persoonsgegevens ──

router.get("/avg/inzageverzoek/:id/export", alleenBeheer, async (req, res): Promise<void> => {
  try {
    const verzoekId = parseInt(String(req.params.id), 10);
    if (isNaN(verzoekId)) return void res.status(400).json({ error: "Ongeldig id" });

    const [verzoek] = await db
      .select()
      .from(avgInzageverzoekTable)
      .where(eq(avgInzageverzoekTable.id, verzoekId))
      .limit(1);

    if (!verzoek) return void res.status(404).json({ error: "Verzoek niet gevonden" });
    const gebruikerId = verzoek.gebruikerId;

    // 1. Accountgegevens
    const [gebruiker] = await db
      .select()
      .from(gebruikersTable)
      .where(eq(gebruikersTable.id, gebruikerId));

    if (!gebruiker) return void res.status(404).json({ error: "Gebruiker niet gevonden" });

    // 2. HRM-profiel
    const [medewerker] = await db
      .select()
      .from(medewerkersTable)
      .where(eq(medewerkersTable.gebruikerId, gebruikerId))
      .limit(1);

    // 3. Verlof
    let verlofsaldi: object[] = [];
    let opleidingen: object[] = [];
    let verlofaanvragen: object[] = [];

    if (medewerker) {
      const saldoRijen = await db
        .select({
          verlofsoort: verlofsoortenTable.naam,
          jaar: verlofSaldiTable.jaar,
          saldo_uren: verlofSaldiTable.saldoUren,
          opgebouwd_uren: verlofSaldiTable.opgebouwdUren,
          opgenomen_uren: verlofSaldiTable.opgenomenUren,
        })
        .from(verlofSaldiTable)
        .innerJoin(verlofsoortenTable, eq(verlofSaldiTable.verlofsoortId, verlofsoortenTable.id))
        .where(eq(verlofSaldiTable.medewerkerId, medewerker.id))
        .orderBy(desc(verlofSaldiTable.jaar));

      verlofsaldi = saldoRijen;

      const opleidingRijen = await db
        .select({
          naam: opleidingenTable.naam,
          soort: opleidingenTable.soort,
          niveau: opleidingenTable.niveau,
          behaald_op: medewerkerOpleidingenTable.behaaldOp,
          verloopt_op: medewerkerOpleidingenTable.verlooptOp,
          status: medewerkerOpleidingenTable.status,
        })
        .from(medewerkerOpleidingenTable)
        .innerJoin(opleidingenTable, eq(medewerkerOpleidingenTable.opleidingId, opleidingenTable.id))
        .where(eq(medewerkerOpleidingenTable.medewerkerId, medewerker.id))
        .orderBy(desc(medewerkerOpleidingenTable.behaaldOp));

      opleidingen = opleidingRijen;

      // Verlofaanvragen van de medewerker
      const aanvraagRijen = await db
        .select({
          soort: verlofsoortenTable.naam,
          start_datum: verlofAanvragenTable.startDatum,
          eind_datum: verlofAanvragenTable.eindDatum,
          aantal_uren: verlofAanvragenTable.aantalUren,
          status: verlofAanvragenTable.status,
          reden: verlofAanvragenTable.reden,
          aangemaakt_op: verlofAanvragenTable.aangemaaktOp,
        })
        .from(verlofAanvragenTable)
        .innerJoin(verlofsoortenTable, eq(verlofAanvragenTable.verlofsoortId, verlofsoortenTable.id))
        .where(eq(verlofAanvragenTable.medewerkerId, medewerker.id))
        .orderBy(desc(verlofAanvragenTable.aangemaaktOp))
        .limit(200);

      verlofaanvragen = aanvraagRijen.map((a) => ({
        ...a,
        aangemaakt_op: a.aangemaakt_op.toISOString(),
      }));
    }

    // 4. Opdrachten waar de gebruiker aan gekoppeld is als aanmaker
    const opdrachtRijen = await db
      .select({
        id: opdrachtenTable.id,
        titel: opdrachtenTable.titel,
        werknummer: opdrachtenTable.werknummer,
        opdrachtgever: opdrachtenTable.opdrachtgever,
        type: opdrachtenTable.type,
        status: opdrachtenTable.status,
        aangemaakt_op: opdrachtenTable.aangemaaktOp,
      })
      .from(opdrachtenTable)
      .where(eq(opdrachtenTable.aangemaaktDoorId, gebruikerId))
      .orderBy(desc(opdrachtenTable.aangemaaktOp))
      .limit(200);

    // 5. Activiteitenlog (max 500 regels, zonder sessiedata)
    const activiteitenRijen = await db
      .select({
        type: activiteitenTable.type,
        omschrijving: activiteitenTable.omschrijving,
        gebouw_naam: activiteitenTable.gebouwNaam,
        tijdstip: activiteitenTable.tijdstip,
      })
      .from(activiteitenTable)
      .where(eq(activiteitenTable.gebruikerId, gebruikerId))
      .orderBy(desc(activiteitenTable.tijdstip))
      .limit(500);

    // 6. Audit-log-regels gekoppeld aan gebruiker (geen sessie/auth)
    const auditRijen = await db
      .select({
        tijdstip: auditLogTable.tijdstip,
        module: auditLogTable.module,
        actie: auditLogTable.actie,
        entiteit: auditLogTable.entiteit,
        entiteit_naam: auditLogTable.entiteitNaam,
      })
      .from(auditLogTable)
      .where(eq(auditLogTable.gebruikerId, gebruikerId))
      .orderBy(desc(auditLogTable.tijdstip))
      .limit(500);

    const exportData = {
      export_tijdstip: new Date().toISOString(),
      verzoek_id: verzoekId,
      gebruiker: {
        id: gebruiker.id,
        naam: gebruiker.naam,
        email: gebruiker.email,
        rol: gebruiker.rol,
        telefoon: gebruiker.telefoon ?? null,
        bedrijf: gebruiker.bedrijf ?? null,
        aangemaakt_op: gebruiker.aangemaaktOp.toISOString(),
        laatste_online: gebruiker.laatstOnline?.toISOString() ?? null,
        taal: gebruiker.taal,
        functietitels: gebruiker.functietitels ?? [],
        dienstverband: gebruiker.dienstverband,
      },
      medewerker: medewerker
        ? {
            id: medewerker.id,
            naam: medewerker.naam,
            email: medewerker.email ?? null,
            telefoon: medewerker.telefoon ?? null,
            mobiel: medewerker.mobiel ?? null,
            werkmaatschappij: medewerker.werkmaatschappij,
            dienstverband: medewerker.dienstverband,
            in_dienst_sinds: medewerker.inDienstSinds ?? null,
          }
        : null,
      opdrachten: opdrachtRijen.map((o) => ({
        ...o,
        aangemaakt_op: o.aangemaakt_op.toISOString(),
      })),
      verlofsaldi,
      verlofaanvragen,
      opleidingen,
      activiteiten: activiteitenRijen.map((a) => ({
        ...a,
        tijdstip: a.tijdstip.toISOString(),
      })),
      audit_log: auditRijen.map((a) => ({
        ...a,
        tijdstip: a.tijdstip.toISOString(),
      })),
    };

    // Formaat: JSON (standaard) of CSV (platte gegevenslijst per categorie)
    const formaat = String((req.query as Record<string, string>).formaat ?? "json");
    if (formaat === "csv") {
      // Exporteer gebruiker + activiteiten als CSV-blokken (eenvoudige representatie)
      const lines: string[] = [];
      lines.push("=== ACCOUNTGEGEVENS ===");
      lines.push("veld,waarde");
      Object.entries(exportData.gebruiker).forEach(([k, v]) => {
        lines.push(`${k},"${String(v ?? "").replace(/"/g, '""')}"`);
      });
      lines.push("");
      lines.push("=== OPDRACHTEN ===");
      lines.push("id,titel,werknummer,opdrachtgever,type,status,aangemaakt_op");
      exportData.opdrachten.forEach((o) => {
        lines.push(
          [o.id, o.titel, o.werknummer ?? "", o.opdrachtgever ?? "", o.type, o.status, o.aangemaakt_op]
            .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
            .join(","),
        );
      });
      lines.push("");
      lines.push("=== ACTIVITEITEN ===");
      lines.push("tijdstip,type,omschrijving,gebouw_naam");
      exportData.activiteiten.forEach((a) => {
        lines.push(
          [a.tijdstip, a.type, a.omschrijving, a.gebouw_naam ?? ""]
            .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
            .join(","),
        );
      });
      const csvBestandsnaam = `avg-export-gebruiker-${gebruikerId}-${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${csvBestandsnaam}"`);
      return void res.send(lines.join("\n"));
    }

    const bestandsnaam = `avg-export-gebruiker-${gebruikerId}-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${bestandsnaam}"`);
    res.json(exportData);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── POST /avg/inzageverzoek/:id/anonimiseer — PII vervangen ──────────────────

router.post("/avg/inzageverzoek/:id/anonimiseer", alleenBeheer, async (req, res): Promise<void> => {
  try {
    const verzoekId = parseInt(String(req.params.id), 10);
    if (isNaN(verzoekId)) return void res.status(400).json({ error: "Ongeldig id" });

    const [verzoek] = await db
      .select()
      .from(avgInzageverzoekTable)
      .where(eq(avgInzageverzoekTable.id, verzoekId))
      .limit(1);

    if (!verzoek) return void res.status(404).json({ error: "Verzoek niet gevonden" });
    if (verzoek.geanonimiseerdOp) {
      return void res.status(409).json({ error: "Dit account is al geanonimiseerd" });
    }

    const gebruikerId = verzoek.gebruikerId;

    await anonimiseerGebruiker(gebruikerId, verzoekId);

    req.log.info({ gebruikerId, verzoekId }, "AVG: gebruiker geanonimiseerd");
    res.json({ bericht: "Account is geanonimiseerd", gebruiker_id: gebruikerId });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── GET /avg/inactieve-accounts — accounts > X dagen niet ingelogd ────────────

router.get("/avg/inactieve-accounts", alleenBeheer, async (req, res): Promise<void> => {
  try {
    const q = req.query as Record<string, string | undefined>;
    const inactiefDagen = parseInt(q.dagen ?? "180", 10) || 180;

    const grens = new Date();
    grens.setDate(grens.getDate() - inactiefDagen);

    const rijen = await db
      .select({
        id: gebruikersTable.id,
        naam: gebruikersTable.naam,
        email: gebruikersTable.email,
        rol: gebruikersTable.rol,
        actief: gebruikersTable.actief,
        aangemaakt_op: gebruikersTable.aangemaaktOp,
        laatste_online: gebruikersTable.laatstOnline,
      })
      .from(gebruikersTable)
      .where(
        and(
          eq(gebruikersTable.actief, true),
          eq(gebruikersTable.gearchiveerd, false),
          lt(gebruikersTable.laatstOnline, grens),
        ),
      )
      .orderBy(gebruikersTable.laatstOnline);

    res.json({
      inactief_dagen: inactiefDagen,
      grens: grens.toISOString(),
      accounts: rijen.map((r) => ({
        ...r,
        aangemaakt_op: r.aangemaakt_op.toISOString(),
        laatste_online: r.laatste_online?.toISOString() ?? null,
      })),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── GET /avg/mijn-verzoeken — eigen verzoeken inzien ─────────────────────────

router.get("/avg/mijn-verzoeken", requireAuth, async (req, res): Promise<void> => {
  try {
    const gebruikerId = req.session.userId;
    if (!gebruikerId) return void res.status(401).json({ error: "Niet ingelogd" });

    const rijen = await db
      .select()
      .from(avgInzageverzoekTable)
      .where(eq(avgInzageverzoekTable.gebruikerId, gebruikerId))
      .orderBy(desc(avgInzageverzoekTable.aangemaaktOp));

    res.json(rijen.map((r) => mapVerzoek(r)));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── GET /avg/stats — snelle tellingen voor het beheer-dashboard ───────────────

router.get("/avg/stats", alleenBeheer, async (req, res): Promise<void> => {
  try {
    const [open] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(avgInzageverzoekTable)
      .where(eq(avgInzageverzoekTable.status, "open"));

    const [behandeling] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(avgInzageverzoekTable)
      .where(eq(avgInzageverzoekTable.status, "in_behandeling"));

    const [afgehandeld] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(avgInzageverzoekTable)
      .where(eq(avgInzageverzoekTable.status, "afgerond"));

    const grens = new Date();
    grens.setDate(grens.getDate() - 180);
    const [inactief] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(gebruikersTable)
      .where(
        and(
          eq(gebruikersTable.actief, true),
          eq(gebruikersTable.gearchiveerd, false),
          lt(gebruikersTable.laatstOnline, grens),
        ),
      );

    res.json({
      open_verzoeken: open?.n ?? 0,
      in_behandeling: behandeling?.n ?? 0,
      afgehandeld: afgehandeld?.n ?? 0,
      inactieve_accounts: inactief?.n ?? 0,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── GET /avg/opschoon-status — status geautomatiseerde accountopschoning ─────

const AVG_ACCOUNT_BEWAARDAGEN = parseInt(process.env.AVG_ACCOUNT_BEWAARDAGEN ?? "730", 10) || 730;

router.get("/avg/opschoon-status", alleenBeheer, async (req, res): Promise<void> => {
  try {
    const grens = new Date();
    grens.setDate(grens.getDate() - AVG_ACCOUNT_BEWAARDAGEN);

    const [wachtend] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(gebruikersTable)
      .where(
        and(
          eq(gebruikersTable.actief, false),
          sql`${gebruikersTable.geanonimiseerd} IS NULL`,
          sql`${gebruikersTable.gedeactiveerdOp} IS NOT NULL`,
          lt(gebruikersTable.gedeactiveerdOp, grens),
        ),
      );

    const [laatsteRun] = await db
      .select()
      .from(avgOpschoonLogTable)
      .orderBy(desc(avgOpschoonLogTable.uitgevoerdOp))
      .limit(1);

    res.json({
      bewaardagen: AVG_ACCOUNT_BEWAARDAGEN,
      wachtend_op_anonimisering: wachtend?.n ?? 0,
      laatste_run: laatsteRun
        ? {
            uitgevoerd_op: laatsteRun.uitgevoerdOp.toISOString(),
            accounts_geanonimiseerd: laatsteRun.accountsGeanonimiseerd,
            activiteiten_verwijderd: laatsteRun.activiteitenVerwijderd,
          }
        : null,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Verwerkersregister (AVG art. 30 lid 2) ───────────────────────────────────

function leegNaarNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function mapVerwerker(r: typeof avgVerwerkersTable.$inferSelect) {
  return {
    id: r.id,
    naam: r.naam,
    land: r.land ?? null,
    doel: r.doel ?? null,
    categorie_persoonsgegevens: r.categoriePersoonsgegevens ?? null,
    grondslag: r.grondslag ?? null,
    vwo_aanwezig: r.vwoAanwezig,
    vwo_datum: r.vwoDatum ?? null,
    contactpersoon: r.contactpersoon ?? null,
    notities: r.notities ?? null,
    aangemaakt_op: r.aangemaaktOp.toISOString(),
    bijgewerkt_op: r.bijgewerktOp.toISOString(),
  };
}

// Standaard-verwerkers die in FPS Connect worden gebruikt. Bij een leeg register
// worden deze eenmalig voorgezaaid zodat het register direct bruikbaar is.
const STANDAARD_VERWERKERS: (typeof avgVerwerkersTable.$inferInsert)[] = [
  {
    naam: "OpenAI, L.L.C.",
    land: "Verenigde Staten",
    doel: "AI-analyse (formulierinvullen, spotherkenning, documentclassificatie, tekstgeneratie)",
    categoriePersoonsgegevens:
      "Vrije-tekstinvoer en documentinhoud die persoonsgegevens kunnen bevatten (namen, contactgegevens)",
    grondslag: "Uitvoering van de overeenkomst / gerechtvaardigd belang",
    vwoAanwezig: false,
    contactpersoon: "privacy@openai.com",
    notities:
      "Ingezet via de Replit AI-integratieproxy. Controleer de actuele verwerkersovereenkomst (DPA) van OpenAI.",
  },
  {
    naam: "Google Ireland Limited (Google Maps Platform)",
    land: "Ierland (EU)",
    doel: "Gebouwlocaties, geocoding, kaart- en satellietbeelden en Street View-gevelbeelden",
    categoriePersoonsgegevens: "Adres- en locatiegegevens van gebouwen",
    grondslag: "Uitvoering van de overeenkomst",
    vwoAanwezig: false,
    contactpersoon: "https://support.google.com/policies",
    notities: "Google Maps Platform API. Controleer de actuele Google Cloud DPA.",
  },
  {
    naam: "Microsoft Ireland Operations Limited (Microsoft 365)",
    land: "Ierland (EU)",
    doel: "Verzenden en ontvangen van e-mail (Microsoft Graph) namens FPS",
    categoriePersoonsgegevens: "E-mailadressen, namen en inhoud van e-mailberichten",
    grondslag: "Uitvoering van de overeenkomst",
    vwoAanwezig: false,
    contactpersoon: "https://www.microsoft.com/licensing/docs",
    notities: "Microsoft 365 / Azure. Controleer het Microsoft Products and Services DPA (DPA).",
  },
];

// GET /avg/verwerkers — lijst; zaait standaard-verwerkers bij een leeg register
router.get("/avg/verwerkers", alleenBeheer, async (req, res): Promise<void> => {
  try {
    let rijen = await db
      .select()
      .from(avgVerwerkersTable)
      .orderBy(avgVerwerkersTable.naam);

    if (rijen.length === 0) {
      await db.insert(avgVerwerkersTable).values(STANDAARD_VERWERKERS).onConflictDoNothing();
      rijen = await db.select().from(avgVerwerkersTable).orderBy(avgVerwerkersTable.naam);
    }

    res.json(rijen.map(mapVerwerker));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /avg/verwerkers — nieuwe verwerker toevoegen
router.post("/avg/verwerkers", alleenBeheer, async (req, res): Promise<void> => {
  try {
    const b = req.body ?? {};
    const naam = typeof b.naam === "string" ? b.naam.trim() : "";
    if (!naam) return void res.status(400).json({ error: "Naam is verplicht" });

    const [rij] = await db
      .insert(avgVerwerkersTable)
      .values({
        naam,
        land: leegNaarNull(b.land),
        doel: leegNaarNull(b.doel),
        categoriePersoonsgegevens: leegNaarNull(b.categorie_persoonsgegevens),
        grondslag: leegNaarNull(b.grondslag),
        vwoAanwezig: b.vwo_aanwezig === true,
        vwoDatum: leegNaarNull(b.vwo_datum),
        contactpersoon: leegNaarNull(b.contactpersoon),
        notities: leegNaarNull(b.notities),
      })
      .returning();

    res.status(201).json(mapVerwerker(rij));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// PATCH /avg/verwerkers/:id — verwerker bijwerken
router.patch("/avg/verwerkers/:id", alleenBeheer, async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) return void res.status(400).json({ error: "Ongeldig id" });

    const b = req.body ?? {};
    const wijziging: Partial<typeof avgVerwerkersTable.$inferInsert> = { bijgewerktOp: new Date() };
    if (typeof b.naam === "string") {
      const naam = b.naam.trim();
      if (!naam) return void res.status(400).json({ error: "Naam mag niet leeg zijn" });
      wijziging.naam = naam;
    }
    if ("land" in b) wijziging.land = leegNaarNull(b.land);
    if ("doel" in b) wijziging.doel = leegNaarNull(b.doel);
    if ("categorie_persoonsgegevens" in b)
      wijziging.categoriePersoonsgegevens = leegNaarNull(b.categorie_persoonsgegevens);
    if ("grondslag" in b) wijziging.grondslag = leegNaarNull(b.grondslag);
    if ("vwo_aanwezig" in b) wijziging.vwoAanwezig = b.vwo_aanwezig === true;
    if ("vwo_datum" in b) wijziging.vwoDatum = leegNaarNull(b.vwo_datum);
    if ("contactpersoon" in b) wijziging.contactpersoon = leegNaarNull(b.contactpersoon);
    if ("notities" in b) wijziging.notities = leegNaarNull(b.notities);

    const [rij] = await db
      .update(avgVerwerkersTable)
      .set(wijziging)
      .where(eq(avgVerwerkersTable.id, id))
      .returning();

    if (!rij) return void res.status(404).json({ error: "Verwerker niet gevonden" });
    res.json(mapVerwerker(rij));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// DELETE /avg/verwerkers/:id — verwerker verwijderen
router.delete("/avg/verwerkers/:id", alleenBeheer, async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) return void res.status(400).json({ error: "Ongeldig id" });

    const [rij] = await db
      .delete(avgVerwerkersTable)
      .where(eq(avgVerwerkersTable.id, id))
      .returning();

    if (!rij) return void res.status(404).json({ error: "Verwerker niet gevonden" });
    res.status(204).end();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
