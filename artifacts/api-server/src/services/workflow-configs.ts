// Centrale workflow-configuraties voor FPS Connect.
// Alle modules die statuswijzigingen kennen zijn hier geregistreerd.
// Nieuwe modules: voeg een config toe en registreer onderaan.

import { eq, and, ne, inArray, gte, lte } from "drizzle-orm";
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
  algemeneInkopenTable,
  medewerkersTable,
  functiesTable,
} from "@workspace/db";
import { logActiviteit } from "../lib/activiteit";
import { logger } from "../lib/logger";
import { medewerkerVoorId, isLeidinggevendeVan } from "./medewerker-lookup";
import {
  workflowService,
  voorwaardeFout,
  type TransitieContext,
  type WorkflowConfig,
} from "./workflow-engine";
import { checkVereistGoedkeuring, haalGoedgekeurdeAanvraag } from "./goedkeuring-engine";

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

type BezettingResultaat = {
  onderschreden: boolean;
  functieNaam?: string;
  datum?: string;
  beschikbaar?: number;
  minimum?: number;
};

// Controleert of het goedkeuren van deze verlofaanvraag de minimale bezetting
// (functie.minimaleBezetting) van de functie van de aanvrager op enige dag binnen
// de aanvraagperiode zou onderschrijden. Telt alleen collega's met dezelfde
// functie mee (bezetting is functie-gebonden, niet werkgever-breed); een
// medewerker zonder functie of een functie zonder ingestelde drempel wordt nooit
// geblokkeerd (null = geen bezettingscontrole).
async function controleerBezetting(
  db: TransitieContext["db"],
  aanvraag: { id: number; medewerkerId: number; startDatum: string; eindDatum: string },
): Promise<BezettingResultaat> {
  const medewerker = await medewerkerVoorId(aanvraag.medewerkerId, db);
  if (!medewerker?.functieId) return { onderschreden: false };

  const [functie] = await (db as any)
    .select()
    .from(functiesTable)
    .where(eq(functiesTable.id, medewerker.functieId));
  if (!functie?.minimaleBezetting) return { onderschreden: false };

  const collegas = await (db as any)
    .select({ id: medewerkersTable.id })
    .from(medewerkersTable)
    .where(and(eq(medewerkersTable.functieId, medewerker.functieId), eq(medewerkersTable.actief, true)));
  const totaal = collegas.length;
  if (totaal === 0) return { onderschreden: false };
  const collegaIds: number[] = collegas.map((c: { id: number }) => c.id);

  const overlappend = await (db as any)
    .select({
      medewerkerId: verlofAanvragenTable.medewerkerId,
      startDatum: verlofAanvragenTable.startDatum,
      eindDatum: verlofAanvragenTable.eindDatum,
    })
    .from(verlofAanvragenTable)
    .where(
      and(
        inArray(verlofAanvragenTable.medewerkerId, collegaIds),
        eq(verlofAanvragenTable.status, "goedgekeurd"),
        ne(verlofAanvragenTable.id, aanvraag.id),
        lte(verlofAanvragenTable.startDatum, aanvraag.eindDatum),
        gte(verlofAanvragenTable.eindDatum, aanvraag.startDatum),
      ),
    );

  const start = new Date(aanvraag.startDatum);
  const eind = new Date(aanvraag.eindDatum);
  for (let d = new Date(start); d.getTime() <= eind.getTime(); d.setDate(d.getDate() + 1)) {
    const dagStr = d.toISOString().slice(0, 10);
    const afwezig = new Set<number>([medewerker.id]);
    for (const o of overlappend as { medewerkerId: number; startDatum: string; eindDatum: string }[]) {
      if (o.startDatum <= dagStr && o.eindDatum >= dagStr) afwezig.add(o.medewerkerId);
    }
    const beschikbaar = totaal - afwezig.size;
    if (beschikbaar < functie.minimaleBezetting) {
      return { onderschreden: true, functieNaam: functie.naam, datum: dagStr, beschikbaar, minimum: functie.minimaleBezetting };
    }
  }
  return { onderschreden: false };
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
    {
      van: "concept",
      naar: "verzonden",
      label: "Verzenden",
      bevoegdheid: ["offertes", 2],
      // Als het goedkeuringsbeleid een formele aanvraag vereist, moet de
      // aanvraag eerst volledig goedgekeurd zijn voordat de offerte verzonden
      // kan worden. `viaGoedkeuring: true` wordt alleen door de
      // Governance & Approval Engine gezet na volledige goedkeuring.
      precheck: async (entity, ctx) => {
        if (ctx.params?.viaGoedkeuring === true) return null;
        const { vereist } = await checkVereistGoedkeuring(
          ctx.db,
          "offerte",
          entity.bedragInclBtw,
          null,
        );
        if (vereist) {
          const goedgekeurd = await haalGoedgekeurdeAanvraag(ctx.db, "offerte", entity.id);
          if (!goedgekeurd) {
            return voorwaardeFout(
              "Voor deze offerte is een formele goedkeuringsaanvraag vereist op basis van het geldende goedkeuringsbeleid. Dien de offerte in via het goedkeuringsproces in het tabblad 'Goedkeuring'.",
            );
          }
        }
        return null;
      },
    },
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
    {
      van: "afgewezen",
      naar: "concept",
      label: "Heropenen als concept",
      // AKKOORD_01 §1.4/§8: terugzetten is een uitzonderlijke correctie —
      // alleen de hoofdbeheerder (bewuste keuze, geen module-bevoegdheid).
      magUitvoeren: async (_e, ctx) => ctx.isHoofdbeheerder === true,
    },
    {
      van: ["verzonden", "bekeken"],
      naar: "ingetrokken",
      label: "Intrekken",
      bevoegdheid: ["offertes", 3],
      precheck: async (_entity, ctx) => {
        if (!ctx.params?.reden || String(ctx.params.reden).trim() === "") {
          return voorwaardeFout("Een reden is verplicht bij het intrekken van een offerte.", ["reden"]);
        }
        return null;
      },
    },
    {
      van: "ingetrokken",
      naar: "concept",
      label: "Heropenen als concept",
      // AKKOORD_01 §8: idem — alleen hoofdbeheerder.
      magUitvoeren: async (_e, ctx) => ctx.isHoofdbeheerder === true,
    },
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
    {
      van: "concept",
      naar: "goedgekeurd",
      label: "Goedkeuren",
      // `viaGoedkeuring` wordt alleen gezet door de Governance & Approval
      // Engine ná volledige goedkeuring (zie goedkeuring-engine.ts) — de
      // bevoegdheids- en beleidscheck zijn dan al door die motor afgehandeld.
      magUitvoeren: async (_entity, ctx) => {
        if (ctx.params?.viaGoedkeuring === true) return true;
        if (ctx.isHoofdbeheerder) return true;
        return (ctx.bevoegdheden["offertes"] ?? 0) >= 2;
      },
      precheck: async (entity, ctx) => {
        if (ctx.params?.viaGoedkeuring === true) return null;
        const { vereist } = await checkVereistGoedkeuring(
          ctx.db,
          "inkoopbon",
          entity.totaalBedrag,
          null,
        );
        if (vereist) {
          return voorwaardeFout(
            "Voor deze inkoopbon is volgens het geldende goedkeuringsbeleid een formele goedkeuringsaanvraag vereist. Dien de bon in via het goedkeuringsproces in plaats van de status direct te wijzigen.",
          );
        }
        return null;
      },
    },
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

    // Bezetting: bij goedkeuren wordt het (mogelijk overruled) resultaat vastgelegd
    // als audit-vlag, zodat achteraf zichtbaar blijft dat er bewust is overschreven.
    let bezettingOverschreden = vorige.bezettingOverschreden;
    if (nieuweStatus === "goedgekeurd") {
      const bezetting = await controleerBezetting(ctx.db, vorige);
      bezettingOverschreden = bezetting.onderschreden;
    }

    const [bijgewerkt] = await ctx.db.update(verlofAanvragenTable)
      .set({
        status: nieuweStatus,
        beoordeeldDoorId: beoordeeld ? (ctx.gebruikerId ?? null) : undefined,
        beoordeeldOp: beoordeeld ? new Date() : undefined,
        reden:
          typeof ctx.params?.reden === "string" ? ctx.params.reden : vorige.reden,
        opmerking:
          typeof ctx.params?.opmerking === "string" ? ctx.params.opmerking : vorige.opmerking,
        bezettingOverschreden,
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
      // Autorisatie: hoofdbeheerder en HRM (personeel:2) zijn altijd de fallback/
      // override; daarnaast mag de leidinggevende van de aanvrager beoordelen —
      // dit is de primaire goedkeuringsroute in de praktijk.
      magUitvoeren: async (entity, ctx) => {
        if (ctx.params?.viaGoedkeuring === true) return true;
        if (ctx.isHoofdbeheerder) return true;
        if ((ctx.bevoegdheden["personeel"] ?? 0) >= 2) return true;
        return isLeidinggevendeVan(ctx.gebruikerId, entity.medewerkerId, ctx.db);
      },
      precheck: async (entity, ctx) => {
        // Governance precheck: bij een actieve beleidsregel voor verlofaanvragen
        // moet de aanvraag eerst via de Governance & Approval Engine goedgekeurd
        // worden. `viaGoedkeuring: true` wordt gezet door de motor zelf na volledige
        // goedkeuring — de bevoegdheids- en beleidscheck zijn dan al afgehandeld.
        if (ctx.params?.viaGoedkeuring !== true) {
          const aantalDagen = Math.ceil((entity.aantalUren ?? 0) / 8);
          const { vereist } = await checkVereistGoedkeuring(
            ctx.db,
            "verlofaanvraag",
            aantalDagen,
            null,
          );
          if (vereist) {
            const goedgekeurd = await haalGoedgekeurdeAanvraag(ctx.db, "verlofaanvraag", entity.id);
            if (!goedgekeurd) {
              return voorwaardeFout(
                "Voor deze verlofaanvraag is op basis van het geldende goedkeuringsbeleid een formele goedkeuringsaanvraag vereist. Gebruik het goedkeuringsproces (knop 'Ter goedkeuring indienen') om de aanvraag in te dienen.",
              );
            }
          }
        }

        const bezetting = await controleerBezetting(ctx.db, entity);
        if (!bezetting.onderschreden) return null;

        // Alleen hoofdbeheerder/HRM mag de bezettingsdrempel overschrijven — een
        // leidinggevende die geen personeel-schrijfrecht heeft mag dat nooit.
        const magOverschrijven = ctx.isHoofdbeheerder || (ctx.bevoegdheden["personeel"] ?? 0) >= 2;
        const detail = `Minimale bezetting voor functie "${bezetting.functieNaam}" wordt op ${bezetting.datum} onderschreden (${bezetting.beschikbaar}/${bezetting.minimum} beschikbaar).`;
        if (!magOverschrijven) {
          return voorwaardeFout(
            `${detail} Alleen een hoofdbeheerder of HRM-beheerder kan dit overschrijven.`,
            ["bezetting"],
          );
        }
        if (ctx.params?.negeer_bezetting !== true) {
          return voorwaardeFout(
            `${detail} Bevestig expliciet (negeer_bezetting) om toch goed te keuren.`,
            ["bezetting"],
          );
        }
        return null;
      },
    },
    {
      van: "aangevraagd",
      naar: "afgewezen",
      label: "Afwijzen",
      magUitvoeren: async (entity, ctx) => {
        if (ctx.isHoofdbeheerder) return true;
        if ((ctx.bevoegdheden["personeel"] ?? 0) >= 2) return true;
        return isLeidinggevendeVan(ctx.gebruikerId, entity.medewerkerId, ctx.db);
      },
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

// ── Algemene inkoop (NP_INKOOP_01) ────────────────────────────────────────────
// Alleen de goedkeuringstransitie loopt via de workflow-engine; de rest van de
// lichte statusmachine (besteld → factuur_ontvangen → afgehandeld) zit in de
// eigen routes. "vrijgegeven" is een virtuele doelstatus: de echte beginstatus
// hangt af van de soort (op_rekening → besteld, direct_betaald → open).

type AlgemeneInkoop = typeof algemeneInkopenTable.$inferSelect;

const algemeneInkoopConfig: WorkflowConfig<AlgemeneInkoop> = {
  id: "algemene_inkoop",
  naam: "Algemene inkoop",
  haalEntityOp: async (id, db) => {
    const [r] = await db.select().from(algemeneInkopenTable).where(eq(algemeneInkopenTable.id, id));
    return r ?? null;
  },
  uitvoerenTransitie: async (id, _nieuweStatus, _van, ctx) => {
    const [huidig] = await ctx.db.select().from(algemeneInkopenTable).where(eq(algemeneInkopenTable.id, id));
    const doel = huidig?.soort === "direct_betaald" ? "open" : "besteld";
    const [r] = await ctx.db.update(algemeneInkopenTable)
      .set({ status: doel, bijgewerktOp: new Date() })
      .where(eq(algemeneInkopenTable.id, id))
      .returning();
    return r!;
  },
  transities: [
    {
      van: "ter_goedkeuring",
      naar: "vrijgegeven",
      label: "Vrijgeven",
      // Vrijgeven kan uitsluitend via de goedkeuringsmotor — óók voor de
      // hoofdbeheerder. Het beleid dat de regel in ter_goedkeuring zette,
      // blijft daarmee bindend; wie boven de grens zit, doorloopt de aanvraag
      // (de hoofdbeheerder kan die zelf goedkeuren, maar nooit overslaan).
      magUitvoeren: async (_entity, ctx) => ctx.params?.viaGoedkeuring === true,
      precheck: async (entity, ctx) => {
        if (ctx.params?.viaGoedkeuring === true) return null;
        const bedrag = entity.soort === "direct_betaald" ? entity.bedrag : entity.verwachtBedrag;
        const { vereist } = await checkVereistGoedkeuring(ctx.db, "algemene_inkoop", bedrag ?? null, null);
        if (vereist) {
          return voorwaardeFout(
            "Voor deze inkoop is volgens het geldende goedkeuringsbeleid een formele goedkeuringsaanvraag vereist.",
          );
        }
        return null;
      },
    },
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
  .registreer(arbeidsovereenkomstConfig)
  .registreer(algemeneInkoopConfig);
