import { Router, Request, Response } from "express";
import {
  db,
  workflowDefinitiesTable,
  workflowLanesTable,
  workflowCardsTable,
} from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

// ── Seed helper ────────────────────────────────────────────────────────────────
// Zaait de standaard workflows. Race-safe via promise-lock + per-naam check.

let _seedBelofte: Promise<void> | null = null;

async function zaaiWorkflowsAlsLeeg() {
  if (_seedBelofte) return _seedBelofte;
  _seedBelofte = _voerSeedUit().catch(() => { _seedBelofte = null; });
  return _seedBelofte;
}

async function _voerSeedUit() {
  // Haal bestaande namen op zodat we per template kunnen besluiten
  const bestaandeNamen = new Set(
    (await db.select({ naam: workflowDefinitiesTable.naam })
      .from(workflowDefinitiesTable))
      .map((r) => r.naam)
  );

  const workflows: Array<{
    naam: string; type: string; omschrijving: string; volgorde: number;
    lanes: Array<{
      naam: string; kleur: string; volgorde: number;
      cards: Array<{
        type: string; titel: string; omschrijving?: string; volgorde: number;
        invoer?: string; uitvoer?: string; rol?: string; aiTaak?: string;
        akkoordDoor?: string; gekoppeldeModule?: string; uitzonderingsroute?: string;
      }>;
    }>;
  }> = [
    {
      naam: "Inkomende factuur",
      type: "factuur",
      omschrijving: "Van ontvangst factuurmail via AI-controle en dubbele accordering naar verwerking in AccountView",
      volgorde: 1,
      lanes: [
        {
          naam: "Mail & Ontvangst",
          kleur: "#64748b",
          volgorde: 0,
          cards: [
            {
              type: "stap", volgorde: 0, titel: "Factuurmail ontvangen",
              omschrijving: "Factuur arriveert op factuur@fps-brandpreventie.nl",
              invoer: "Inkomende e-mail met PDF-bijlage",
              uitvoer: "Factuur opgeslagen in mailbox",
              rol: "Systeem",
              aiTaak: "AI leest",
              gekoppeldeModule: "E-mail inbox",
            },
            {
              type: "stap", volgorde: 1, titel: "Mail markeren als in behandeling",
              omschrijving: "Systeem zet mail op status 'in behandeling' zodat duplicaatverwerking wordt voorkomen",
              invoer: "Onbehandelde factuurmail",
              uitvoer: "Mail gemarkeerd",
              rol: "Systeem",
              aiTaak: "Automatisch na akkoord",
              gekoppeldeModule: "Werk-inbox",
            },
          ],
        },
        {
          naam: "AI Verwerking",
          kleur: "#7c3aed",
          volgorde: 1,
          cards: [
            {
              type: "stap", volgorde: 0, titel: "AI herkent factuurtype",
              omschrijving: "AI leest de factuur-PDF en classificeert het type: leveranciersfactuur, dienstverlening of overig",
              invoer: "Factuur-PDF",
              uitvoer: "Factuurtype, leveranciersnaam, bedrag, factuurdatum, vervaldatum",
              rol: "AI",
              aiTaak: "AI leest",
              gekoppeldeModule: "Factuurverwerking",
            },
            {
              type: "stap", volgorde: 1, titel: "AI koppelt aan project",
              omschrijving: "AI zoekt op basis van referentie of projectnummer het bijbehorende project op in FPS Connect",
              invoer: "Factuurreferentie, leveranciersnaam",
              uitvoer: "Projectkoppeling (project_id of 'niet gevonden')",
              rol: "AI",
              aiTaak: "AI koppelt",
              gekoppeldeModule: "Gebouwen / Projecten",
            },
            {
              type: "stap", volgorde: 2, titel: "AI vergelijkt met inkoopbon",
              omschrijving: "AI controleert of het gefactureerde bedrag en de omschrijving overeenkomen met de bijbehorende inkoopbon",
              invoer: "Factuurbedrag, inkoopbonbedrag, omschrijvingen",
              uitvoer: "Match-percentage, afwijkingsbedrag, bevindingen",
              rol: "AI",
              aiTaak: "AI controleert",
              gekoppeldeModule: "Factuurverwerking",
            },
            {
              type: "beslissing", volgorde: 3, titel: "Factuur klopt met inkoopbon?",
              omschrijving: "Beslismoment op basis van AI-controle. Bij > 5% afwijking of ontbrekende inkoopbon gaat de factuur naar manuele beoordeling.",
              invoer: "AI match-resultaat",
              uitvoer: "Ja → Financiële administratie | Nee → Afwijking melden",
              rol: "Systeem",
              aiTaak: "AI wacht op akkoord",
              uitzonderingsroute: "Afwijking melden aan financiële administratie",
            },
          ],
        },
        {
          naam: "Financiële Administratie",
          kleur: "#0284c7",
          volgorde: 2,
          cards: [
            {
              type: "stap", volgorde: 0, titel: "Financiële administratie beoordeelt",
              omschrijving: "De financiële administratie bekijkt de factuur, de AI-bevindingen en de inkoopbon en geeft een eerste akkoord",
              invoer: "Factuur, AI-analyse, inkoopbon",
              uitvoer: "Akkoord financiële administratie",
              rol: "Administratie",
              aiTaak: "Mens akkoord nodig",
              akkoordDoor: "Administratie",
              gekoppeldeModule: "Factuurverwerking",
            },
            {
              type: "stap", volgorde: 1, titel: "Factuur coderen",
              omschrijving: "Factuur wordt geboekt op de juiste grootboekrekening en aan het project gekoppeld",
              invoer: "Akkoord + projectkoppeling",
              uitvoer: "Gecodeerde factuur gereed voor projectleider",
              rol: "Administratie",
              aiTaak: "AI stelt voor",
              gekoppeldeModule: "Factuurverwerking",
            },
          ],
        },
        {
          naam: "Projectleider",
          kleur: "#0891b2",
          volgorde: 3,
          cards: [
            {
              type: "stap", volgorde: 0, titel: "Projectleider ontvangt factuur ter accordering",
              omschrijving: "De projectleider krijgt een melding en kan de factuur, inkoopbon en AI-bevindingen inzien",
              invoer: "Gecodeerde factuur + AI-rapport",
              uitvoer: "Beoordeling in afwachting",
              rol: "Projectleider",
              aiTaak: "Mens akkoord nodig",
              akkoordDoor: "Projectleider",
              gekoppeldeModule: "Factuurverwerking",
            },
            {
              type: "beslissing", volgorde: 1, titel: "Projectleider akkoord?",
              omschrijving: "Projectleider keurt de factuur goed of wijst deze af met toelichting",
              invoer: "Beoordeelde factuur",
              uitvoer: "Ja → Klaarzetten voor betaling | Nee → Terugsturen met toelichting",
              rol: "Projectleider",
              aiTaak: "Mens akkoord nodig",
              uitzonderingsroute: "Factuur terugsturen naar financiële administratie met correctieverzoek",
            },
          ],
        },
        {
          naam: "Verwerking & Afsluiting",
          kleur: "#059669",
          volgorde: 4,
          cards: [
            {
              type: "stap", volgorde: 0, titel: "Factuur klaarzetten voor betaling",
              omschrijving: "Na dubbel akkoord wordt de factuur als betaalbaar geboekt en klaargezet in de betaalrun",
              invoer: "Dubbel akkoord (administratie + projectleider)",
              uitvoer: "Factuur in betaalwachtrij",
              rol: "Administratie",
              aiTaak: "Automatisch na akkoord",
              gekoppeldeModule: "Factuurverwerking / SEPA",
            },
            {
              type: "stap", volgorde: 1, titel: "Export naar AccountView",
              omschrijving: "Factuur wordt geëxporteerd naar AccountView voor de boekhouding",
              invoer: "Betaalklare factuur",
              uitvoer: "AccountView-boeking aangemaakt",
              rol: "Systeem",
              aiTaak: "Automatisch na akkoord",
              gekoppeldeModule: "AccountView-koppeling",
            },
            {
              type: "stap", volgorde: 2, titel: "Mail markeren als afgehandeld",
              omschrijving: "De originele factuurmail wordt gesloten en gearchiveerd in de werk-inbox",
              invoer: "Afgeronde factuur",
              uitvoer: "Mail status: Afgehandeld",
              rol: "Systeem",
              aiTaak: "Automatisch na akkoord",
              gekoppeldeModule: "Werk-inbox",
            },
          ],
        },
      ],
    },
    {
      naam: "Van aanvraag naar offerte",
      type: "aanvraag_offerte",
      omschrijving: "Commercieel traject van eerste klantvraag tot ondertekende offerte",
      volgorde: 2,
      lanes: [
        { naam: "Commercie", kleur: "#b45309", volgorde: 0, cards: [
          { type: "stap", volgorde: 0, titel: "Aanvraag ontvangen", omschrijving: "Klantvraag binnenkomt via mail, telefoon of website", rol: "Commercieel" },
          { type: "stap", volgorde: 1, titel: "Aanvraag beoordelen", omschrijving: "Klant en project beoordelen op haalbaarheid en kansrijkheid", rol: "Commercieel", aiTaak: "AI stelt voor" },
          { type: "beslissing", volgorde: 2, titel: "Opdracht kansrijk?", uitzonderingsroute: "Aanvraag afwijzen met motivatie" },
        ]},
        { naam: "Calculatie", kleur: "#dc2626", volgorde: 1, cards: [
          { type: "stap", volgorde: 0, titel: "Calculatie maken", omschrijving: "Kostprijsberekening op basis van spots en normtijden", rol: "Calculatie", aiTaak: "AI stelt voor", gekoppeldeModule: "Calculaties" },
          { type: "beslissing", volgorde: 1, titel: "Calculatie akkoord?", uitzonderingsroute: "Terug naar commercie voor bijstelling" },
        ]},
        { naam: "Werkvoorbereiding", kleur: "#0284c7", volgorde: 2, cards: [
          { type: "stap", volgorde: 0, titel: "Offerte opstellen", omschrijving: "Offerte samenstellen met scope, prijs en planning", rol: "Werkvoorbereider", gekoppeldeModule: "Offertes" },
        ]},
        { naam: "Directie", kleur: "#374151", volgorde: 3, cards: [
          { type: "stap", volgorde: 0, titel: "Directie akkoord bij grote opdrachten", rol: "Directie", akkoordDoor: "Directie", aiTaak: "Mens akkoord nodig" },
          { type: "stap", volgorde: 1, titel: "Offerte versturen naar klant", rol: "Commercieel" },
          { type: "beslissing", volgorde: 2, titel: "Klant akkoord?", uitzonderingsroute: "Onderhandelen of afsluiten" },
        ]},
      ],
    },
    {
      naam: "Van opdracht naar uitvoering",
      type: "opdracht_uitvoering",
      omschrijving: "Interne verwerking na akkoord klant: werkbegroting, planning en uitvoer",
      volgorde: 3,
      lanes: [
        { naam: "Werkvoorbereiding", kleur: "#0284c7", volgorde: 0, cards: [
          { type: "stap", volgorde: 0, titel: "Opdracht verwerken", omschrijving: "Opdracht aanmaken in FPS Connect", rol: "Werkvoorbereider", gekoppeldeModule: "Opdrachten" },
          { type: "stap", volgorde: 1, titel: "Werkbegroting maken", omschrijving: "Spots en uren verdelen per fase", rol: "Werkvoorbereider", gekoppeldeModule: "Calculaties", aiTaak: "AI stelt voor" },
          { type: "stap", volgorde: 2, titel: "Materiaalbehoefte bepalen", rol: "Werkvoorbereider" },
        ]},
        { naam: "Projectleiding", kleur: "#0891b2", volgorde: 1, cards: [
          { type: "stap", volgorde: 0, titel: "Project aanmaken en koppelen", rol: "Projectleider", gekoppeldeModule: "Gebouwen / Projecten" },
          { type: "beslissing", volgorde: 1, titel: "Werkbegroting akkoord?", uitzonderingsroute: "Terug naar werkvoorbereiding" },
        ]},
        { naam: "Planning", kleur: "#7c3aed", volgorde: 2, cards: [
          { type: "stap", volgorde: 0, titel: "Monteurs inplannen", rol: "Planning", gekoppeldeModule: "Planning" },
          { type: "stap", volgorde: 1, titel: "Materiaal bestellen", rol: "Planning" },
        ]},
        { naam: "Uitvoering", kleur: "#059669", volgorde: 3, cards: [
          { type: "stap", volgorde: 0, titel: "Spots plaatsen en fotograferen", rol: "Monteur", gekoppeldeModule: "Spots", aiTaak: "AI stelt voor" },
          { type: "stap", volgorde: 1, titel: "Uren registreren", rol: "Monteur", gekoppeldeModule: "Uren" },
          { type: "beslissing", volgorde: 2, titel: "Afwijking gevonden?", uitzonderingsroute: "Afwijking melden aan projectleider" },
        ]},
      ],
    },
    {
      naam: "Van uitvoering naar opleverrapport",
      type: "uitvoering_oplevering",
      omschrijving: "Afronding van het project: inspectie, rapport en overdracht aan klant",
      volgorde: 4,
      lanes: [
        { naam: "Uitvoering", kleur: "#059669", volgorde: 0, cards: [
          { type: "stap", volgorde: 0, titel: "Uitvoering gereedmelden", rol: "Monteur" },
        ]},
        { naam: "Controle / Oplevering", kleur: "#0891b2", volgorde: 1, cards: [
          { type: "stap", volgorde: 0, titel: "Opleverinspectie uitvoeren", rol: "Controleur", gekoppeldeModule: "Inspecties" },
          { type: "beslissing", volgorde: 1, titel: "Alles akkoord?", uitzonderingsroute: "Herstelactie aanmaken" },
          { type: "stap", volgorde: 2, titel: "Opleverrapport genereren", rol: "Projectleider", gekoppeldeModule: "Rapportages", aiTaak: "AI maakt concept" },
        ]},
        { naam: "Projectleiding", kleur: "#0284c7", volgorde: 2, cards: [
          { type: "stap", volgorde: 0, titel: "Rapport definitief maken", rol: "Projectleider", akkoordDoor: "Projectleider" },
          { type: "stap", volgorde: 1, titel: "Rapport naar klant versturen", rol: "Projectleider" },
        ]},
        { naam: "Financiële Administratie", kleur: "#b45309", volgorde: 3, cards: [
          { type: "stap", volgorde: 0, titel: "Eindafrekening opmaken", rol: "Administratie", gekoppeldeModule: "Factuurverwerking" },
        ]},
      ],
    },
    {
      naam: "Van e-mail naar actievoorstel",
      type: "email_actie",
      omschrijving: "Inkomende mail wordt door AI geanalyseerd en omgezet in een concreet actievoorstel",
      volgorde: 5,
      lanes: [
        { naam: "Mail & Ontvangst", kleur: "#64748b", volgorde: 0, cards: [
          { type: "stap", volgorde: 0, titel: "E-mail ontvangen", invoer: "Inkomende mail", rol: "Systeem", aiTaak: "AI leest", gekoppeldeModule: "E-mail inbox" },
        ]},
        { naam: "AI Verwerking", kleur: "#7c3aed", volgorde: 1, cards: [
          { type: "stap", volgorde: 0, titel: "AI classificeert mailtype", omschrijving: "Factuur, klacht, aanvraag, interne actie of overig", aiTaak: "AI leest" },
          { type: "stap", volgorde: 1, titel: "AI koppelt aan project of medewerker", aiTaak: "AI koppelt" },
          { type: "stap", volgorde: 2, titel: "AI stelt actievoorstel op", aiTaak: "AI stelt voor" },
          { type: "beslissing", volgorde: 3, titel: "Actie vereist?", uitzonderingsroute: "Mail archiveren als informatief" },
        ]},
        { naam: "Medewerker", kleur: "#0284c7", volgorde: 2, cards: [
          { type: "stap", volgorde: 0, titel: "Actievoorstel beoordelen", aiTaak: "Mens akkoord nodig", akkoordDoor: "Verantwoordelijke medewerker" },
          { type: "stap", volgorde: 1, titel: "Actie uitvoeren of doorzetten", uitvoer: "Taak aangemaakt of verwerkt" },
          { type: "stap", volgorde: 2, titel: "Mail afsluiten", aiTaak: "Automatisch na akkoord", gekoppeldeModule: "Werk-inbox" },
        ]},
      ],
    },
  ];

  for (const wf of workflows) {
    if (bestaandeNamen.has(wf.naam)) continue;   // al aanwezig — overslaan
    const [wfRij] = await db.insert(workflowDefinitiesTable).values({
      naam: wf.naam,
      type: wf.type,
      omschrijving: wf.omschrijving,
      volgorde: wf.volgorde,
    }).returning();

    for (const lane of wf.lanes) {
      const [laneRij] = await db.insert(workflowLanesTable).values({
        workflowId: wfRij.id,
        naam: lane.naam,
        kleur: lane.kleur,
        volgorde: lane.volgorde,
      }).returning();

      for (const card of lane.cards) {
        await db.insert(workflowCardsTable).values({
          workflowId: wfRij.id,
          laneId: laneRij.id,
          type: card.type,
          titel: card.titel,
          omschrijving: card.omschrijving ?? null,
          invoer: card.invoer ?? null,
          uitvoer: card.uitvoer ?? null,
          rol: card.rol ?? null,
          aiTaak: card.aiTaak ?? null,
          akkoordDoor: card.akkoordDoor ?? null,
          gekoppeldeModule: card.gekoppeldeModule ?? null,
          uitzonderingsroute: card.uitzonderingsroute ?? null,
          volgorde: card.volgorde,
        });
      }
    }
  }
}

// ── Types ──────────────────────────────────────────────────────────────────────

type CardRow = typeof workflowCardsTable.$inferSelect;
type LaneRow = typeof workflowLanesTable.$inferSelect;
type WfRow = typeof workflowDefinitiesTable.$inferSelect;

function mapCard(c: CardRow) {
  return {
    id: c.id,
    workflow_id: c.workflowId,
    lane_id: c.laneId,
    type: c.type,
    titel: c.titel,
    omschrijving: c.omschrijving,
    invoer: c.invoer,
    uitvoer: c.uitvoer,
    rol: c.rol,
    ai_taak: c.aiTaak,
    akkoord_door: c.akkoordDoor,
    gekoppelde_module: c.gekoppeldeModule,
    uitzonderingsroute: c.uitzonderingsroute,
    actief: c.actief,
    volgorde: c.volgorde,
    aangemaakt_op: c.aangemaaktOp.toISOString(),
    bijgewerkt_op: c.bijgewerktOp.toISOString(),
  };
}

function mapLane(l: LaneRow, cards: CardRow[]) {
  return {
    id: l.id,
    workflow_id: l.workflowId,
    naam: l.naam,
    kleur: l.kleur,
    volgorde: l.volgorde,
    cards: cards.map(mapCard),
  };
}

function mapWf(w: WfRow) {
  return {
    id: w.id,
    naam: w.naam,
    type: w.type,
    omschrijving: w.omschrijving,
    actief: w.actief,
    volgorde: w.volgorde,
    aangemaakt_op: w.aangemaaktOp.toISOString(),
    bijgewerkt_op: w.bijgewerktOp.toISOString(),
  };
}

// ── Routes ─────────────────────────────────────────────────────────────────────

router.get("/workflow-definities", requireAuth, async (req: Request, res: Response) => {
  await zaaiWorkflowsAlsLeeg();
  const rows = await db.select().from(workflowDefinitiesTable)
    .orderBy(asc(workflowDefinitiesTable.volgorde));
  return res.json(rows.map(mapWf));
});

router.post("/workflow-definities", requireAuth, async (req: Request, res: Response) => {
  const { naam, type, omschrijving } = req.body;
  if (!naam || !type) return res.status(400).json({ message: "naam en type zijn verplicht" });

  const maxVolgorde = await db.select({ id: workflowDefinitiesTable.id, volgorde: workflowDefinitiesTable.volgorde })
    .from(workflowDefinitiesTable).orderBy(asc(workflowDefinitiesTable.volgorde));
  const nieuweVolgorde = maxVolgorde.length > 0
    ? Math.max(...maxVolgorde.map((r) => r.volgorde)) + 1
    : 0;

  const [wf] = await db.insert(workflowDefinitiesTable).values({
    naam, type, omschrijving: omschrijving ?? null, volgorde: nieuweVolgorde,
  }).returning();
  return res.status(201).json(mapWf(wf));
});

router.get("/workflow-definities/:id", requireAuth, async (req: Request, res: Response) => {
  await zaaiWorkflowsAlsLeeg();
  const id = Number(req.params.id);
  const [wf] = await db.select().from(workflowDefinitiesTable)
    .where(eq(workflowDefinitiesTable.id, id));
  if (!wf) return res.status(404).json({ message: "Niet gevonden" });

  const lanes = await db.select().from(workflowLanesTable)
    .where(eq(workflowLanesTable.workflowId, id))
    .orderBy(asc(workflowLanesTable.volgorde));

  const cards = await db.select().from(workflowCardsTable)
    .where(eq(workflowCardsTable.workflowId, id))
    .orderBy(asc(workflowCardsTable.volgorde));

  const lanesMetCards = lanes.map((l) =>
    mapLane(l, cards.filter((c) => c.laneId === l.id)),
  );

  return res.json({ ...mapWf(wf), lanes: lanesMetCards });
});

router.patch("/workflow-definities/:id", requireAuth, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { naam, omschrijving, actief } = req.body;
  const update: Partial<typeof workflowDefinitiesTable.$inferInsert> = {
    bijgewerktOp: new Date(),
  };
  if (naam !== undefined) update.naam = naam;
  if (omschrijving !== undefined) update.omschrijving = omschrijving;
  if (actief !== undefined) update.actief = actief;

  const [updated] = await db.update(workflowDefinitiesTable).set(update)
    .where(eq(workflowDefinitiesTable.id, id)).returning();
  if (!updated) return res.status(404).json({ message: "Niet gevonden" });
  return res.json(mapWf(updated));
});

// ── Lanes ─────────────────────────────────────────────────────────────────────

router.post("/workflow-lanes", requireAuth, async (req: Request, res: Response) => {
  const { workflow_id, naam, kleur } = req.body;
  if (!workflow_id || !naam) return res.status(400).json({ message: "workflow_id en naam zijn verplicht" });

  const bestaandeLanes = await db.select({ volgorde: workflowLanesTable.volgorde })
    .from(workflowLanesTable).where(eq(workflowLanesTable.workflowId, Number(workflow_id)));
  const nieuweVolgorde = bestaandeLanes.length > 0
    ? Math.max(...bestaandeLanes.map((l) => l.volgorde)) + 1 : 0;

  const [lane] = await db.insert(workflowLanesTable).values({
    workflowId: Number(workflow_id),
    naam,
    kleur: kleur ?? "#64748b",
    volgorde: nieuweVolgorde,
  }).returning();
  return res.status(201).json(mapLane(lane, []));
});

router.patch("/workflow-lanes/:id", requireAuth, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { naam, kleur } = req.body;
  const update: Partial<typeof workflowLanesTable.$inferInsert> = {};
  if (naam !== undefined) update.naam = naam;
  if (kleur !== undefined) update.kleur = kleur;

  const [updated] = await db.update(workflowLanesTable).set(update)
    .where(eq(workflowLanesTable.id, id)).returning();
  if (!updated) return res.status(404).json({ message: "Niet gevonden" });
  return res.json(mapLane(updated, []));
});

router.delete("/workflow-lanes/:id", requireAuth, async (req: Request, res: Response) => {
  await db.delete(workflowLanesTable).where(eq(workflowLanesTable.id, Number(req.params.id)));
  return res.status(204).send();
});

// ── Cards ─────────────────────────────────────────────────────────────────────

router.post("/workflow-cards", requireAuth, async (req: Request, res: Response) => {
  const {
    workflow_id, lane_id, type, titel, omschrijving,
    invoer, uitvoer, rol, ai_taak, akkoord_door,
    gekoppelde_module, uitzonderingsroute,
  } = req.body;
  if (!workflow_id || !lane_id || !titel) {
    return res.status(400).json({ message: "workflow_id, lane_id en titel zijn verplicht" });
  }

  const bestaand = await db.select({ volgorde: workflowCardsTable.volgorde })
    .from(workflowCardsTable).where(eq(workflowCardsTable.laneId, Number(lane_id)));
  const nieuweVolgorde = bestaand.length > 0
    ? Math.max(...bestaand.map((c) => c.volgorde)) + 1 : 0;

  const [card] = await db.insert(workflowCardsTable).values({
    workflowId: Number(workflow_id),
    laneId: Number(lane_id),
    type: type ?? "stap",
    titel,
    omschrijving: omschrijving ?? null,
    invoer: invoer ?? null,
    uitvoer: uitvoer ?? null,
    rol: rol ?? null,
    aiTaak: ai_taak ?? null,
    akkoordDoor: akkoord_door ?? null,
    gekoppeldeModule: gekoppelde_module ?? null,
    uitzonderingsroute: uitzonderingsroute ?? null,
    volgorde: nieuweVolgorde,
  }).returning();
  return res.status(201).json(mapCard(card));
});

router.patch("/workflow-cards/:id", requireAuth, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const {
    lane_id, type, titel, omschrijving, invoer, uitvoer,
    rol, ai_taak, akkoord_door, gekoppelde_module,
    uitzonderingsroute, actief, volgorde,
  } = req.body;

  const update: Partial<typeof workflowCardsTable.$inferInsert> = {
    bijgewerktOp: new Date(),
  };
  if (lane_id !== undefined) update.laneId = Number(lane_id);
  if (type !== undefined) update.type = type;
  if (titel !== undefined) update.titel = titel;
  if (omschrijving !== undefined) update.omschrijving = omschrijving;
  if (invoer !== undefined) update.invoer = invoer;
  if (uitvoer !== undefined) update.uitvoer = uitvoer;
  if (rol !== undefined) update.rol = rol;
  if (ai_taak !== undefined) update.aiTaak = ai_taak;
  if (akkoord_door !== undefined) update.akkoordDoor = akkoord_door;
  if (gekoppelde_module !== undefined) update.gekoppeldeModule = gekoppelde_module;
  if (uitzonderingsroute !== undefined) update.uitzonderingsroute = uitzonderingsroute;
  if (actief !== undefined) update.actief = actief;
  if (volgorde !== undefined) update.volgorde = Number(volgorde);

  const [updated] = await db.update(workflowCardsTable).set(update)
    .where(eq(workflowCardsTable.id, id)).returning();
  if (!updated) return res.status(404).json({ message: "Niet gevonden" });
  return res.json(mapCard(updated));
});

router.delete("/workflow-cards/:id", requireAuth, async (req: Request, res: Response) => {
  await db.delete(workflowCardsTable).where(eq(workflowCardsTable.id, Number(req.params.id)));
  return res.status(204).send();
});

export default router;
