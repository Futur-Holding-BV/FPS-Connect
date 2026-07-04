import { Router, Request, Response } from "express";
import {
  db,
  salarisMutatiesTable,
  medewerkersTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { aiGateway, heeftGateway } from "../lib/aiGateway";

const router = Router();

const lezen = requireBevoegdheid("salaris_mutaties", 1);
const schrijven = requireBevoegdheid("salaris_mutaties", 2);

function mapMutatie(m: typeof salarisMutatiesTable.$inferSelect) {
  return {
    id: m.id,
    medewerker_id: m.medewerkerId,
    medewerker_naam: m.medewerkerNaam,
    werkmaatschappij: m.werkmaatschappij,
    werkgever_id: m.werkgeverId,
    periode_jaar: m.periodeJaar,
    periode_maand: m.periodeMaand,
    type: m.type,
    omschrijving: m.omschrijving,
    ingangsdatum: m.ingangsdatum,
    bron: m.bron,
    bijlage_object_path: m.bijlageObjectPath,
    bijlage_naam: m.bijlageNaam,
    bijlage_grootte: m.bijlageGrootte,
    status: m.status,
    gecontroleerd: m.gecontroleerd,
    gecontroleerd_door_naam: m.gecontroleerdDoorNaam,
    gecontroleerd_op: m.gecontroleerdOp?.toISOString() ?? null,
    akkoord: m.akkoord,
    notities: m.notities,
    aangemaakt_door_naam: m.aangemaaktDoorNaam,
    aangemaakt_op: m.aangemaaktOp.toISOString(),
    bijgewerkt_op: m.bijgewerktOp.toISOString(),
  };
}

router.get("/salaris-mutaties", lezen, async (req: Request, res: Response): Promise<void> => {
  const { jaar, maand, werkmaatschappij, status, medewerker_id } = req.query;
  const filters = [];
  if (jaar) filters.push(eq(salarisMutatiesTable.periodeJaar, Number(jaar)));
  if (maand) filters.push(eq(salarisMutatiesTable.periodeMaand, Number(maand)));
  if (werkmaatschappij) filters.push(eq(salarisMutatiesTable.werkmaatschappij, String(werkmaatschappij)));
  if (status) filters.push(eq(salarisMutatiesTable.status, String(status)));
  if (medewerker_id) filters.push(eq(salarisMutatiesTable.medewerkerId, Number(medewerker_id)));

  const rows = await db
    .select()
    .from(salarisMutatiesTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(salarisMutatiesTable.aangemaaktOp));

  return void res.json(rows.map(mapMutatie));
});

router.post("/salaris-mutaties", schrijven, async (req: Request, res: Response): Promise<void> => {
  const {
    medewerker_id, werkmaatschappij, werkgever_id,
    periode_jaar, periode_maand, type, omschrijving,
    ingangsdatum, bron, notities,
  } = req.body;

  const sess = req.session as { userId?: number; gebruikerNaam?: string };
  const userId = sess.userId;
  const gebruikerNaam = sess.gebruikerNaam ?? null;

  let medewerkerNaam: string | null = null;
  if (medewerker_id) {
    const [med] = await db.select({ naam: medewerkersTable.naam })
      .from(medewerkersTable).where(eq(medewerkersTable.id, medewerker_id));
    medewerkerNaam = med?.naam ?? null;
  }

  const [mutatie] = await db.insert(salarisMutatiesTable).values({
    medewerkerId: medewerker_id ?? null,
    medewerkerNaam,
    werkmaatschappij,
    werkgeverId: werkgever_id ?? null,
    periodeJaar: periode_jaar,
    periodeMaand: periode_maand,
    type,
    omschrijving: omschrijving ?? null,
    ingangsdatum: ingangsdatum ?? null,
    bron: bron ?? "handmatig",
    notities: notities ?? null,
    aangemaaktDoorId: userId ?? null,
    aangemaaktDoorNaam: gebruikerNaam,
    status: "concept",
  }).returning();

  return void res.status(201).json(mapMutatie(mutatie));
});

// ── AI-controle ─────────────────────────────────────────────────────────────
// Analyseert alle mutaties voor de opgegeven periode en werkmaatschappij.
// Geeft terug: bevindingen (issues), compleetheid en een aanbeveling.

router.post("/salaris-mutaties/ai-controle", lezen, async (req: Request, res: Response): Promise<void> => {
  const { jaar, maand, werkmaatschappij } = req.body;
  if (!jaar || !maand || !werkmaatschappij) {
    return void res.status(400).json({ message: "jaar, maand en werkmaatschappij zijn verplicht" });
  }

  const mutaties = await db
    .select()
    .from(salarisMutatiesTable)
    .where(and(
      eq(salarisMutatiesTable.periodeJaar, Number(jaar)),
      eq(salarisMutatiesTable.periodeMaand, Number(maand)),
      eq(salarisMutatiesTable.werkmaatschappij, String(werkmaatschappij)),
    ))
    .orderBy(desc(salarisMutatiesTable.aangemaaktOp));

  const maandNamen = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];
  const periodeLabel = `${maandNamen[Number(maand) - 1]} ${jaar}`;

  // Fallback-analyse zonder AI
  function analyseerZonderAi() {
    const bevindingen: { ernst: string; mutatie_naam: string; bericht: string }[] = [];

    for (const m of mutaties) {
      const naam = m.medewerkerNaam ?? `#${m.id}`;
      if (m.status === "concept") {
        bevindingen.push({ ernst: "waarschuwing", mutatie_naam: naam, bericht: `${naam}: mutatie staat nog op Concept — accordeer of keur af voor verzending.` });
      }
      if (!m.ingangsdatum && ["Loonsverhoging","Functiewijziging","Verloning nieuwe medewerker","Uitdiensttreding"].includes(m.type)) {
        bevindingen.push({ ernst: "aandacht", mutatie_naam: naam, bericht: `${naam} (${m.type}): ingangsdatum ontbreekt.` });
      }
      if (!m.omschrijving) {
        bevindingen.push({ ernst: "aandacht", mutatie_naam: naam, bericht: `${naam} (${m.type}): omschrijving ontbreekt — voeg een toelichting toe.` });
      }
    }

    const geaccordeerd = mutaties.filter((m) => m.status === "geaccordeerd").length;
    const compleet = mutaties.length > 0 && bevindingen.filter((b) => b.ernst === "waarschuwing").length === 0;

    return {
      methode: "fallback",
      periode: periodeLabel,
      werkmaatschappij,
      totaal_mutaties: mutaties.length,
      geaccordeerd,
      bevindingen,
      compleet,
      aanbeveling: compleet
        ? `Alle ${geaccordeerd} geaccordeerde mutaties voor ${periodeLabel} zien er volledig uit. U kunt de SCAB-conceptmail genereren.`
        : `Er zijn ${bevindingen.length} aandachtspunten. Los de waarschuwingen op voor verzending naar SCAB.`,
    };
  }

  if (!heeftGateway() || mutaties.length === 0) {
    return void res.json(analyseerZonderAi());
  }

  try {
    const invoer = mutaties.map((m) => ({
      id: m.id,
      medewerker: m.medewerkerNaam ?? `medewerker-${m.id}`,
      type: m.type,
      omschrijving: m.omschrijving ?? null,
      ingangsdatum: m.ingangsdatum ?? null,
      status: m.status,
      bron: m.bron,
    }));

    const scabControlResultaat = await aiGateway.chat("default", {
      max_tokens: 600,
      messages: [
        {
          role: "system",
          content:
            "Je bent een Nederlandse HRM-controleur die salarismutaties controleert vóór verzending naar salarisverwerker SCAB. " +
            "Geef ALLEEN een JSON-object terug (geen markdown, geen uitleg buiten de JSON). " +
            "Schema: { bevindingen: [{ ernst: 'waarschuwing'|'aandacht'|'ok', mutatie_naam: string, bericht: string }], compleet: boolean, aanbeveling: string }. " +
            "Ernst 'waarschuwing' = blokkerend (concept-status, BSN ontbreekt enz.), 'aandacht' = wenselijk maar niet blokkerend, 'ok' = alles in orde. " +
            "Controleer: ontbrekende ingangsdatum bij loonswijzigingen, concept-status, ontbrekende omschrijving bij vergoedingen, afwijkende of verdachte bedragen.",
        },
        {
          role: "user",
          content: `Controleer de salarismutaties voor ${werkmaatschappij}, periode ${periodeLabel}:\n${JSON.stringify(invoer, null, 2)}`,
        },
      ],
    });
    if (!scabControlResultaat.ok) {
      return void res.json(analyseerZonderAi());
    }

    const raw = scabControlResultaat.inhoud;
    const jsonStr = raw.replace(/^```json\n?/i, "").replace(/\n?```$/i, "").trim();
    const parsed = JSON.parse(jsonStr) as {
      bevindingen: { ernst: string; mutatie_naam: string; bericht: string }[];
      compleet: boolean;
      aanbeveling: string;
    };

    const geaccordeerd = mutaties.filter((m) => m.status === "geaccordeerd").length;
    return void res.json({
      methode: "gpt-4o",
      periode: periodeLabel,
      werkmaatschappij,
      totaal_mutaties: mutaties.length,
      geaccordeerd,
      bevindingen: parsed.bevindingen ?? [],
      compleet: parsed.compleet ?? false,
      aanbeveling: parsed.aanbeveling ?? "",
    });
  } catch (err) {
    req.log.error({ err }, "AI salarismutaties-controle mislukt, gebruik fallback");
    return void res.json(analyseerZonderAi());
  }
});

router.get("/salaris-mutaties/:id", lezen, async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const [mutatie] = await db.select().from(salarisMutatiesTable).where(eq(salarisMutatiesTable.id, id));
  if (!mutatie) return void res.status(404).json({ message: "Niet gevonden" });
  return void res.json(mapMutatie(mutatie));
});

router.patch("/salaris-mutaties/:id", schrijven, async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const { type, omschrijving, ingangsdatum, status, akkoord, notities } = req.body;
  const sess = req.session as { userId?: number; gebruikerNaam?: string };

  const updateData: Partial<typeof salarisMutatiesTable.$inferInsert> = {
    bijgewerktOp: new Date(),
  };
  if (type !== undefined) updateData.type = type;
  if (omschrijving !== undefined) updateData.omschrijving = omschrijving;
  if (ingangsdatum !== undefined) updateData.ingangsdatum = ingangsdatum;
  if (status !== undefined) updateData.status = status;
  if (notities !== undefined) updateData.notities = notities;

  if (akkoord !== undefined) {
    updateData.akkoord = akkoord;
    updateData.gecontroleerd = true;
    updateData.gecontroleerdDoorId = sess.userId ?? null;
    updateData.gecontroleerdDoorNaam = sess.gebruikerNaam ?? null;
    updateData.gecontroleerdOp = new Date();
    updateData.status = akkoord ? "geaccordeerd" : "afgekeurd";
  }

  const [updated] = await db
    .update(salarisMutatiesTable)
    .set(updateData)
    .where(eq(salarisMutatiesTable.id, id))
    .returning();

  if (!updated) return void res.status(404).json({ message: "Niet gevonden" });
  return void res.json(mapMutatie(updated));
});

export default router;
