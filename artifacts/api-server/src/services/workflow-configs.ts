// Centrale workflow-configuraties voor FPS Connect.
// Alle modules die statuswijzigingen kennen zijn hier geregistreerd.
// Nieuwe modules: voeg een config toe en registreer onderaan.

import { eq } from "drizzle-orm";
import {
  offertesTable,
  opdrachtenTable,
  inkoopbonnenTable,
  inkoopplannenTable,
  uitvoeringsplannenTable,
  verlofAanvragenTable,
  verlofSaldiTable,
  verlofAanvraagLogTable,
  onderhoudTable,
  calculatiesTable,
  planningItemsTable,
  arbeidsovereenkomstenTable,
} from "@workspace/db";
import { logActiviteit } from "../lib/activiteit";
import { logger } from "../lib/logger";
import {
  workflowService,
  voorwaardeFout,
  type TransitieContext,
  type WorkflowConfig,
} from "./workflow-engine";

// ── Hulpfuncties ───────────────────────────────────────────────────────────────

function jaarVanDatum(d: string): number {
  const y = new Date(d).getFullYear();
  return Number.isFinite(y) ? y : new Date().getFullYear();
}

async function pasVerlofSaldoAan(
  db: TransitieContext["db"],
  medewerkerId: number,
  verlofsoortId: number,
  jaar: number,
  deltaUren: number,
): Promise<void> {
  if (!deltaUren || !Number.isFinite(deltaUren)) return;
  const [s] = await (db as any)
    .select()
    .from(verlofSaldiTable)
    .where(
      eq(verlofSaldiTable.medewerkerId, medewerkerId),
    )
    .for("update");
  if (!s || s.verlofsoortId !== verlofsoortId || s.jaar !== jaar) return;
  const opgenomen = Math.round((s.opgenomenUren + deltaUren) * 10) / 10;
  const saldo = Math.round((s.beginsaldoUren + s.opgebouwdUren - opgenomen) * 10) / 10;
  await (db as any)
    .update(verlofSaldiTable)
    .set({ opgenomenUren: opgenomen, saldoUren: saldo, bijgewerktOp: new Date() })
    .where(eq(verlofSaldiTable.id, s.id));
}

async function logVerlofMutatie(
  db: TransitieContext["db"],
  verlofaanvraagId: number,
  medewerkerId: number,
  actie: string,
  params: {
    oudStatus?: string | null;
    nieuwStatus?: string | null;
    opmerking?: string | null;
    uitgevoerdDoorId?: number | null;
  } = {},
): Promise<void> {
  try {
    await (db as any).insert(verlofAanvraagLogTable).values({
      verlofaanvraagId,
      medewerkerId,
      uitgevoerdDoorId: params.uitgevoerdDoorId ?? null,
      actie,
      oudStatus: params.oudStatus ?? null,
      nieuwStatus: params.nieuwStatus ?? null,
      opmerking: params.opmerking ?? null,
    });
  } catch (err) {
    logger.error({ err, verlofaanvraagId, actie }, "logVerlofMutatie mislukt");
  }
}

// ── 1. Offertes ────────────────────────────────────────────────────────────────
// Tracks de interne workflow-status van een offerte (niet portaalStatus).

type Offerte = typeof offertesTable.$inferSelect;

const offerteConfig: WorkflowConfig<Offerte> = {
  id: "offerte",
  naam: "Offerte",
  haalEntityOp: async (id, db) => {
    const [r] = await db.select().from(offertesTable).where(eq(offertesTable.id, id));
    return r ?? null;
  },
  uitvoerenTransitie: async (id, nieuweStatus, _van, ctx) => {
    const [r] = await ctx.db.update(offertesTable)
      .set({ status: nieuweStatus, bijgewerktOp: new Date() })
      .where(eq(offertesTable.id, id))
      .returning();
    return r!;
  },
  transities: [
    { van: "concept", naar: "verzonden", label: "Verzenden", bevoegdheid: ["offertes", 2] },
    { van: ["concept", "verzonden"], naar: "bekeken", label: "Markeren als bekeken" },
    {
      van: ["verzonden", "bekeken"],
      naar: "ondertekend",
      label: "Ondertekend",
      bevoegdheid: ["offertes", 2],
    },
    {
      van: ["concept", "verzonden", "bekeken"],
      naar: "afgewezen",
      label: "Afwijzen",
      bevoegdheid: ["offertes", 2],
    },
    { van: "afgewezen", naar: "concept", label: "Heropenen als concept", bevoegdheid: ["offertes", 2] },
  ],
};

// ── 2. Opdrachten ──────────────────────────────────────────────────────────────

type Opdracht = typeof opdrachtenTable.$inferSelect;

const opdrachtConfig: WorkflowConfig<Opdracht> = {
  id: "opdracht",
  naam: "Opdracht",
  haalEntityOp: async (id, db) => {
    const [r] = await db.select().from(opdrachtenTable).where(eq(opdrachtenTable.id, id));
    return r ?? null;
  },
  uitvoerenTransitie: async (id, nieuweStatus, _van, ctx) => {
    const [r] = await ctx.db.update(opdrachtenTable)
      .set({ status: nieuweStatus, bijgewerktOp: new Date() })
      .where(eq(opdrachtenTable.id, id))
      .returning();
    return r!;
  },
  transities: [
    { van: "actief", naar: "gepauzeerd", label: "Pauzeren", bevoegdheid: ["offertes", 2] },
    { van: "gepauzeerd", naar: "actief", label: "Hervatten", bevoegdheid: ["offertes", 2] },
    { van: ["actief", "gepauzeerd"], naar: "afgerond", label: "Afronden", bevoegdheid: ["offertes", 2] },
    {
      van: ["actief", "gepauzeerd"],
      naar: "geannuleerd",
      label: "Annuleren",
      bevoegdheid: ["offertes", 3],
    },
  ],
};

// ── 3. Inkoopbonnen ────────────────────────────────────────────────────────────

type Inkoopbon = typeof inkoopbonnenTable.$inferSelect;

const inkoopbonConfig: WorkflowConfig<Inkoopbon> = {
  id: "inkoopbon",
  naam: "Inkoopbon",
  haalEntityOp: async (id, db) => {
    const [r] = await db.select().from(inkoopbonnenTable).where(eq(inkoopbonnenTable.id, id));
    return r ?? null;
  },
  uitvoerenTransitie: async (id, nieuweStatus, _van, ctx) => {
    const extra: Record<string, unknown> = {};
    if (nieuweStatus === "goedgekeurd") {
      extra.goedgekeurdOp = new Date();
      extra.goedgekeurdDoorId = ctx.gebruikerId ?? null;
    }
    const [r] = await ctx.db.update(inkoopbonnenTable)
      .set({ status: nieuweStatus, bijgewerktOp: new Date(), ...extra })
      .where(eq(inkoopbonnenTable.id, id))
      .returning();
    return r!;
  },
  transities: [
    { van: "concept", naar: "goedgekeurd", label: "Goedkeuren", bevoegdheid: ["offertes", 2] },
    { van: "goedgekeurd", naar: "besteld", label: "Besteld markeren", bevoegdheid: ["offertes", 2] },
    { van: "besteld", naar: "geleverd", label: "Geleverd markeren", bevoegdheid: ["offertes", 2] },
    { van: "goedgekeurd", naar: "concept", label: "Goedkeuring intrekken", bevoegdheid: ["offertes", 3] },
  ],
};

// ── 4. Inkoopplannen ───────────────────────────────────────────────────────────

type Inkoopplan = typeof inkoopplannenTable.$inferSelect;

const inkoopplanConfig: WorkflowConfig<Inkoopplan> = {
  id: "inkoopplan",
  naam: "Inkoopplan",
  haalEntityOp: async (id, db) => {
    const [r] = await db.select().from(inkoopplannenTable).where(eq(inkoopplannenTable.id, id));
    return r ?? null;
  },
  uitvoerenTransitie: async (id, nieuweStatus, _van, ctx) => {
    const [r] = await ctx.db.update(inkoopplannenTable)
      .set({ status: nieuweStatus, bijgewerktOp: new Date() })
      .where(eq(inkoopplannenTable.id, id))
      .returning();
    return r!;
  },
  transities: [
    { van: "concept", naar: "gereed", label: "Gereed melden", bevoegdheid: ["offertes", 2] },
    { van: "gereed", naar: "concept", label: "Terug naar concept", bevoegdheid: ["offertes", 3] },
  ],
};

// ── 5. Uitvoeringsplannen ──────────────────────────────────────────────────────

type Uitvoeringsplan = typeof uitvoeringsplannenTable.$inferSelect;

const uitvoeringsplanConfig: WorkflowConfig<Uitvoeringsplan> = {
  id: "uitvoeringsplan",
  naam: "Uitvoeringsplan",
  haalEntityOp: async (id, db) => {
    const [r] = await db.select().from(uitvoeringsplannenTable).where(eq(uitvoeringsplannenTable.id, id));
    return r ?? null;
  },
  uitvoerenTransitie: async (id, nieuweStatus, _van, ctx) => {
    const [r] = await ctx.db.update(uitvoeringsplannenTable)
      .set({ status: nieuweStatus, bijgewerktOp: new Date() })
      .where(eq(uitvoeringsplannenTable.id, id))
      .returning();
    return r!;
  },
  transities: [
    { van: "concept", naar: "gereed_voor_planning", label: "Gereed voor planning", bevoegdheid: ["offertes", 2] },
    { van: "gereed_voor_planning", naar: "concept", label: "Terug naar concept", bevoegdheid: ["offertes", 3] },
  ],
};

// ── 6. Verlofaanvragen ─────────────────────────────────────────────────────────
// Complex: SELECT FOR UPDATE, saldo-aanpassing en auditlog in één transactie.

type VerlofAanvraag = typeof verlofAanvragenTable.$inferSelect;

const verlofConfig: WorkflowConfig<VerlofAanvraag> = {
  id: "verlofaanvraag",
  naam: "Verlofaanvraag",
  haalEntityOp: async (id, db) => {
    const [r] = await db.select().from(verlofAanvragenTable).where(eq(verlofAanvragenTable.id, id));
    return r ?? null;
  },
  uitvoerenTransitie: async (id, nieuweStatus, vanEntity, ctx) => {
    const beoordeeld = nieuweStatus === "goedgekeurd" || nieuweStatus === "afgewezen";

    // Re-fetch met row-lock om dubbele saldo-mutaties te voorkomen
    const [vorige] = await (ctx.db as any)
      .select()
      .from(verlofAanvragenTable)
      .where(eq(verlofAanvragenTable.id, id))
      .for("update");

    if (!vorige) throw new Error("Verlofaanvraag niet gevonden (row lock)");

    const [bijgewerkt] = await ctx.db.update(verlofAanvragenTable)
      .set({
        status: nieuweStatus,
        beoordeeldDoorId: beoordeeld ? (ctx.gebruikerId ?? null) : undefined,
        beoordeeldOp: beoordeeld ? new Date() : undefined,
        reden:
          typeof ctx.params?.reden === "string" ? ctx.params.reden : vorige.reden,
        opmerking:
          typeof ctx.params?.opmerking === "string" ? ctx.params.opmerking : vorige.opmerking,
        bijgewerktOp: new Date(),
      })
      .where(eq(verlofAanvragenTable.id, id))
      .returning();

    // Saldo bijwerken: draai eerdere goedkeuring terug en pas nieuwe toe
    if (vorige.status === "goedgekeurd") {
      await pasVerlofSaldoAan(
        ctx.db,
        vorige.medewerkerId,
        vorige.verlofsoortId,
        jaarVanDatum(vorige.startDatum),
        -vorige.aantalUren,
      );
    }
    if (bijgewerkt!.status === "goedgekeurd") {
      await pasVerlofSaldoAan(
        ctx.db,
        bijgewerkt!.medewerkerId,
        bijgewerkt!.verlofsoortId,
        jaarVanDatum(bijgewerkt!.startDatum),
        bijgewerkt!.aantalUren,
      );
    }

    // Auditlog
    await logVerlofMutatie(ctx.db, id, vorige.medewerkerId, nieuweStatus, {
      oudStatus: vorige.status,
      nieuwStatus: nieuweStatus,
      opmerking: typeof ctx.params?.opmerking === "string" ? ctx.params.opmerking : null,
      uitgevoerdDoorId: ctx.gebruikerId ?? null,
    });

    return bijgewerkt!;
  },
  transities: [
    { van: "concept", naar: "aangevraagd", label: "Indienen" },
    {
      van: "aangevraagd",
      naar: "goedgekeurd",
      label: "Goedkeuren",
      bevoegdheid: ["personeel", 2],
    },
    {
      van: "aangevraagd",
      naar: "afgewezen",
      label: "Afwijzen",
      bevoegdheid: ["personeel", 2],
      precheck: async (_entity, ctx) => {
        if (!ctx.params?.reden || String(ctx.params.reden).trim() === "") {
          return voorwaardeFout("Reden is verplicht bij het afwijzen van een verlofaanvraag.", ["reden"]);
        }
        return null;
      },
    },
    { van: ["aangevraagd", "goedgekeurd"], naar: "ingetrokken", label: "Intrekken" },
    { van: "concept", naar: "aangevraagd", label: "Opnieuw indienen" },
  ],
};

// ── 7. Onderhoudstaken ─────────────────────────────────────────────────────────

type Onderhoud = typeof onderhoudTable.$inferSelect;

const onderhoudConfig: WorkflowConfig<Onderhoud> = {
  id: "onderhoud",
  naam: "Onderhoudstaak",
  haalEntityOp: async (id, db) => {
    const [r] = await db.select().from(onderhoudTable).where(eq(onderhoudTable.id, id));
    return r ?? null;
  },
  uitvoerenTransitie: async (id, nieuweStatus, _van, ctx) => {
    const [r] = await ctx.db.update(onderhoudTable)
      .set({ status: nieuweStatus, bijgewerktOp: new Date() })
      .where(eq(onderhoudTable.id, id))
      .returning();
    return r!;
  },
  transities: [
    { van: "open", naar: "in_behandeling", label: "In behandeling nemen", bevoegdheid: ["onderhoud", 2] },
    {
      van: "in_behandeling",
      naar: "voltooid",
      label: "Voltooien",
      bevoegdheid: ["onderhoud", 2],
      postTransitie: async (vanEntity, ctx) => {
        await logActiviteit({
          type: "onderhoud_voltooid",
          omschrijving: `Onderhoudstaak voltooid: ${vanEntity.titel}`,
          gebouwId: vanEntity.gebouwId,
          voorzieningId: vanEntity.voorzieningId,
          gebruikerId: ctx.gebruikerId ?? undefined,
        });
      },
    },
    { van: "open", naar: "voltooid", label: "Direct voltooien", bevoegdheid: ["onderhoud", 2],
      postTransitie: async (vanEntity, ctx) => {
        await logActiviteit({
          type: "onderhoud_voltooid",
          omschrijving: `Onderhoudstaak voltooid: ${vanEntity.titel}`,
          gebouwId: vanEntity.gebouwId,
          voorzieningId: vanEntity.voorzieningId,
          gebruikerId: ctx.gebruikerId ?? undefined,
        });
      },
    },
    { van: "voltooid", naar: "open", label: "Heropenen", bevoegdheid: ["onderhoud", 3] },
  ],
};

// ── 8. Calculaties ─────────────────────────────────────────────────────────────

type Calculatie = typeof calculatiesTable.$inferSelect;

const calculatieConfig: WorkflowConfig<Calculatie> = {
  id: "calculatie",
  naam: "Calculatie",
  haalEntityOp: async (id, db) => {
    const [r] = await db.select().from(calculatiesTable).where(eq(calculatiesTable.id, id));
    return r ?? null;
  },
  uitvoerenTransitie: async (id, nieuweStatus, _van, ctx) => {
    const [r] = await ctx.db.update(calculatiesTable)
      .set({ status: nieuweStatus, bijgewerktOp: new Date() })
      .where(eq(calculatiesTable.id, id))
      .returning();
    return r!;
  },
  transities: [
    { van: "concept", naar: "gereed", label: "Gereed melden" },
    { van: "gereed", naar: "vastgesteld", label: "Vaststellen", bevoegdheid: ["offertes", 3] },
    { van: "gereed", naar: "concept", label: "Terug naar concept" },
    { van: "vastgesteld", naar: "gereed", label: "Vastgesteld ongedaan maken", bevoegdheid: ["offertes", 3] },
  ],
};

// ── 9. Planningitems — uitvoering status ──────────────────────────────────────

type PlanningItem = typeof planningItemsTable.$inferSelect;

// Aparte config voor het uitvoeringStatus veld (gepland/in_behandeling/uitgevoerd/gereed)
const planningItemUitvoeringConfig: WorkflowConfig<PlanningItem & { status: string }> = {
  id: "planning_item_uitvoering",
  naam: "Planningitem uitvoering",
  haalEntityOp: async (id, db) => {
    const [r] = await db.select().from(planningItemsTable).where(eq(planningItemsTable.id, id));
    if (!r) return null;
    // Gebruik uitvoeringStatus als het 'status' veld zodat de engine ermee werkt
    return { ...r, status: r.uitvoeringStatus };
  },
  uitvoerenTransitie: async (id, nieuweStatus, _van, ctx) => {
    const [r] = await ctx.db.update(planningItemsTable)
      .set({ uitvoeringStatus: nieuweStatus, bijgewerktOp: new Date() })
      .where(eq(planningItemsTable.id, id))
      .returning();
    return { ...r!, status: r!.uitvoeringStatus };
  },
  transities: [
    { van: "gepland", naar: "in_behandeling", label: "Starten" },
    { van: "in_behandeling", naar: "uitgevoerd", label: "Als uitgevoerd markeren" },
    { van: "uitgevoerd", naar: "gereed", label: "Gereed melden", bevoegdheid: ["planning", 2] },
    { van: "in_behandeling", naar: "gepland", label: "Terugzetten naar gepland" },
  ],
};

// ── 10. Arbeidsovereenkomsten (HRM contracten) ─────────────────────────────────

type Arbeidsovereenkomst = typeof arbeidsovereenkomstenTable.$inferSelect;

const arbeidsovereenkomstConfig: WorkflowConfig<Arbeidsovereenkomst> = {
  id: "arbeidsovereenkomst",
  naam: "Arbeidsovereenkomst",
  haalEntityOp: async (id, db) => {
    const [r] = await db.select().from(arbeidsovereenkomstenTable).where(eq(arbeidsovereenkomstenTable.id, id));
    return r ?? null;
  },
  uitvoerenTransitie: async (id, nieuweStatus, _van, ctx) => {
    const [r] = await ctx.db.update(arbeidsovereenkomstenTable)
      .set({ status: nieuweStatus, bijgewerktOp: new Date() })
      .where(eq(arbeidsovereenkomstenTable.id, id))
      .returning();
    return r!;
  },
  transities: [
    { van: "concept", naar: "actief", label: "Activeren", bevoegdheid: ["personeel", 2] },
    { van: "actief", naar: "verlopen", label: "Verlopen markeren", bevoegdheid: ["personeel", 2] },
    { van: "actief", naar: "opgezegd", label: "Opzeggen", bevoegdheid: ["personeel", 2] },
    { van: "actief", naar: "omgezet", label: "Omzetten", bevoegdheid: ["personeel", 2] },
    { van: "actief", naar: "beëindigd", label: "Beëindigen", bevoegdheid: ["personeel", 3] },
    { van: "concept", naar: "beëindigd", label: "Verwijderen (beëindigd)", bevoegdheid: ["personeel", 3] },
  ],
};

// ── Registreren ────────────────────────────────────────────────────────────────

workflowService
  .registreer(offerteConfig)
  .registreer(opdrachtConfig)
  .registreer(inkoopbonConfig)
  .registreer(inkoopplanConfig)
  .registreer(uitvoeringsplanConfig)
  .registreer(verlofConfig)
  .registreer(onderhoudConfig)
  .registreer(calculatieConfig)
  .registreer(planningItemUitvoeringConfig)
  .registreer(arbeidsovereenkomstConfig);
