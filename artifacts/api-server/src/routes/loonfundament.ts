// LOON_02A — Loonfundament API-routes.
//
// Alle endpoints zijn fail-closed via de niet-toekenbare identiteitspoort
// (hoofdbeheerder of systeemprofiel Externe boekhouder) plus het niveaurecht:
//  - lezen (GET):   niveau 1
//  - schrijven:     niveau 2
//  - volledig beheer (import): niveau 4
//
// Geen fiscale bedragen of percentages in dit bestand.
// Postgres 23505 (unique_violation) wordt als 409 gerapporteerd.

import { Router, type Request, type Response } from "express";
import { eq, and, desc } from "drizzle-orm";
import {
  db,
  caoCatalogusTable,
  medewerkerAanstellingenTable,
  medewerkersTable,
  werkgeversTable,
  loonMigratiebevindingenTable,
  loonInkomstenverhoudingenTable,
  loonAfsprakenTable,
  loonJaarsetsTable,
  loonJaarbronnenTable,
  loonJaarparametersTable,
  loonStatenTable,
  loonStaatTijdvakregelsTable,
} from "@workspace/db";
import { requireLoonfundamentToegang } from "../middlewares/auth";
import {
  UpdateLoonInhoudingsplichtigeParams,
  UpdateLoonInhoudingsplichtigeBody,
  ListLoonInkomstenverhoudingenQueryParams,
  CreateLoonInkomstenverhoudingBody,
  UpdateLoonInkomstenverhoudingParams,
  UpdateLoonInkomstenverhoudingBody,
  ListLoonAfsprakenQueryParams,
  CreateLoonAfspraakBody,
  GetLoonJaarparametersParams,
  GetLoonJaarparametersQueryParams,
  GetLoonJaarGereedheidParams,
  ImportLoonJaarparametersBody,
  ListLoonStatenQueryParams,
  CreateLoonStaatBody,
  CreateLoonStaatTijdvakregelParams,
  CreateLoonStaatTijdvakregelBody,
} from "@workspace/api-zod";
import {
  JaarImportConflictError,
  VEREISTE_BRONSOORTEN,
  voerImportUit,
} from "../services/loonfundament-import";

const router = Router();

// Bevoegdheidsniveaus
const lezen = requireLoonfundamentToegang(1);
const schrijven = requireLoonfundamentToegang(2);
const beheer = requireLoonfundamentToegang(4);

// ── Helper: Postgres 23505 → 409 ─────────────────────────────────────────────
function postgresCode(err: unknown): string | null {
  if (typeof err !== "object" || err === null) return null;
  const direct = (err as { code?: unknown }).code;
  if (typeof direct === "string") return direct;
  return postgresCode((err as { cause?: unknown }).cause);
}

function isPgUniqueViolation(err: unknown): boolean {
  return postgresCode(err) === "23505";
}

function isPgInputViolation(err: unknown): boolean {
  return ["23503", "23514", "P0001"].includes(postgresCode(err) ?? "");
}

const isoOf = (d: Date | null | undefined) => (d ? d.toISOString() : null);

// ── CAO-catalogus ─────────────────────────────────────────────────────────────

router.get(
  "/loonfundament/cao-catalogus",
  lezen,
  async (_req: Request, res: Response): Promise<void> => {
    const rows = await db
      .select()
      .from(caoCatalogusTable)
      .orderBy(caoCatalogusTable.code);
    return void res.json(
      rows.map((r) => ({
        id: r.id,
        code: r.code,
        naam: r.naam,
        actief: r.actief,
      })),
    );
  },
);

// ── Aanstellingen (keuze voor IKV-koppeling) ──────────────────────────────────

router.get(
  "/loonfundament/aanstellingen",
  lezen,
  async (_req: Request, res: Response): Promise<void> => {
    const rows = await db
      .select({
        id: medewerkerAanstellingenTable.id,
        medewerkerId: medewerkerAanstellingenTable.medewerkerId,
        medewerkerNaam: medewerkersTable.naam,
        werkgeverId: medewerkerAanstellingenTable.werkgeverId,
        werkgeverNaam: werkgeversTable.naam,
        caoId: medewerkerAanstellingenTable.caoId,
        caoNaam: caoCatalogusTable.naam,
      })
      .from(medewerkerAanstellingenTable)
      .innerJoin(medewerkersTable, eq(medewerkersTable.id, medewerkerAanstellingenTable.medewerkerId))
      .innerJoin(werkgeversTable, eq(werkgeversTable.id, medewerkerAanstellingenTable.werkgeverId))
      .innerJoin(caoCatalogusTable, eq(caoCatalogusTable.id, medewerkerAanstellingenTable.caoId))
      .orderBy(medewerkerAanstellingenTable.id);
    return void res.json(
      rows.map((r) => ({
        id: r.id,
        medewerker_id: r.medewerkerId,
        medewerker_naam: r.medewerkerNaam ?? `Medewerker #${r.medewerkerId}`,
        werkgever_id: r.werkgeverId,
        werkgever_naam: r.werkgeverNaam,
        cao_id: r.caoId,
        cao_naam: r.caoNaam ?? `CAO #${r.caoId}`,
      })),
    );
  },
);

// ── Inhoudingsplichtigen (werkgevers met loonfiscale attributen) ───────────────

/** Bouw een LoonInhoudingsplichtige response-object vanuit een werkgever-rij. */
async function bouwInhoudingsplichtige(werkgeverId: number) {
  const [wg] = await db
    .select({
      id: werkgeversTable.id,
      naam: werkgeversTable.naam,
      caoId: werkgeversTable.caoId,
      caoCode: caoCatalogusTable.code,
      caoNaam: caoCatalogusTable.naam,
      loonheffingennummer: werkgeversTable.loonheffingennummer,
      sectorcode: werkgeversTable.sectorcode,
      risicogroep: werkgeversTable.risicogroep,
      aangiftetijdvak: werkgeversTable.aangiftetijdvak,
      eigenrisicodragerWga: werkgeversTable.eigenrisicodragerWga,
      eigenrisicodragerZw: werkgeversTable.eigenrisicodragerZw,
      loonkostenvoordeelInstelling: werkgeversTable.loonkostenvoordeelInstelling,
    })
    .from(werkgeversTable)
    .leftJoin(caoCatalogusTable, eq(caoCatalogusTable.id, werkgeversTable.caoId))
    .where(eq(werkgeversTable.id, werkgeverId));
  if (!wg) return null;

  const bevindingen = await db
    .select()
    .from(loonMigratiebevindingenTable)
    .where(
      and(
        eq(loonMigratiebevindingenTable.entiteitType, "werkgever"),
        eq(loonMigratiebevindingenTable.entiteitId, werkgeverId),
      ),
    );

  const compleet =
    wg.caoCode !== "ONBEKEND" &&
    !!wg.loonheffingennummer &&
    !!wg.sectorcode &&
    !!wg.risicogroep &&
    !!wg.aangiftetijdvak;

  return {
    id: wg.id,
    naam: wg.naam,
    cao_id: wg.caoId,
    cao_code: wg.caoCode ?? "",
    cao_naam: wg.caoNaam ?? "",
    loonheffingennummer: wg.loonheffingennummer ?? null,
    sectorcode: wg.sectorcode ?? null,
    risicogroep: wg.risicogroep ?? null,
    aangiftetijdvak: (wg.aangiftetijdvak as "maand" | "vier_weken" | null) ?? null,
    eigenrisicodrager_wga: wg.eigenrisicodragerWga,
    eigenrisicodrager_zw: wg.eigenrisicodragerZw,
    loonkostenvoordeel_instelling: wg.loonkostenvoordeelInstelling,
    compleet,
    migratiebevindingen: bevindingen.map((b) => ({
      id: b.id,
      entiteit_type: b.entiteitType,
      entiteit_id: b.entiteitId,
      veld: b.veld,
      oorspronkelijke_waarde: b.oorspronkelijkeWaarde ?? null,
      reden: b.reden,
      opgelost_op: isoOf(b.opgelostOp),
      aangemaakt_op: b.aangemaaktOp.toISOString(),
    })),
  };
}

router.get(
  "/loonfundament/inhoudingsplichtigen",
  lezen,
  async (_req: Request, res: Response): Promise<void> => {
    const werkgevers = await db
      .select({ id: werkgeversTable.id })
      .from(werkgeversTable)
      .where(eq(werkgeversTable.actief, true))
      .orderBy(werkgeversTable.naam);
    const resultaten = await Promise.all(
      werkgevers.map((w) => bouwInhoudingsplichtige(w.id)),
    );
    return void res.json(resultaten.filter(Boolean));
  },
);

router.patch(
  "/loonfundament/inhoudingsplichtigen/:id",
  schrijven,
  async (req: Request, res: Response): Promise<void> => {
    const params = UpdateLoonInhoudingsplichtigeParams.safeParse(req.params);
    if (!params.success) {
      return void res.status(400).json({ message: "Ongeldig id" });
    }
    const body = UpdateLoonInhoudingsplichtigeBody.safeParse(req.body);
    if (!body.success) {
      return void res.status(400).json({ message: "Ongeldige invoer", errors: body.error.issues });
    }

    const { id } = params.data;
    const upd = body.data;

    // Controleer of werkgever bestaat
    const [bestaand] = await db
      .select({ id: werkgeversTable.id, naam: werkgeversTable.naam })
      .from(werkgeversTable)
      .where(eq(werkgeversTable.id, id));
    if (!bestaand) {
      return void res.status(404).json({ message: "Inhoudingsplichtige niet gevonden" });
    }
    let caoNaam: string | undefined;
    if (upd.cao_id !== undefined) {
      const bindendeCode = bestaand.naam === "FPS Bouw" || bestaand.naam === "FPS Brandpreventie"
        ? "MT"
        : bestaand.naam === "FPS Bouw en Renovatie"
          ? "BI"
          : null;
      const [cao] = await db
        .select({ code: caoCatalogusTable.code, naam: caoCatalogusTable.naam })
        .from(caoCatalogusTable)
        .where(eq(caoCatalogusTable.id, upd.cao_id));
      if (!cao) {
        return void res.status(400).json({ message: "CAO bestaat niet in de catalogus" });
      }
      caoNaam = cao.naam;
      if (bindendeCode) {
        if (cao?.code !== bindendeCode) {
          return void res.status(400).json({
            message: `De CAO-indeling van ${bestaand.naam} is bindend`,
          });
        }
      }
    }

    try {
      await db
        .update(werkgeversTable)
        .set({
          ...(upd.cao_id !== undefined ? { caoId: upd.cao_id } : {}),
          ...(caoNaam !== undefined ? { cao: caoNaam } : {}),
          ...(upd.loonheffingennummer !== undefined ? { loonheffingennummer: upd.loonheffingennummer } : {}),
          ...(upd.sectorcode !== undefined ? { sectorcode: upd.sectorcode } : {}),
          ...(upd.risicogroep !== undefined ? { risicogroep: upd.risicogroep } : {}),
          ...(upd.aangiftetijdvak !== undefined ? { aangiftetijdvak: upd.aangiftetijdvak } : {}),
          ...(upd.eigenrisicodrager_wga !== undefined ? { eigenrisicodragerWga: upd.eigenrisicodrager_wga } : {}),
          ...(upd.eigenrisicodrager_zw !== undefined ? { eigenrisicodragerZw: upd.eigenrisicodrager_zw } : {}),
          ...(upd.loonkostenvoordeel_instelling !== undefined ? { loonkostenvoordeelInstelling: upd.loonkostenvoordeel_instelling } : {}),
          bijgewerktOp: new Date(),
        })
        .where(eq(werkgeversTable.id, id));
    } catch (err) {
      if (isPgUniqueViolation(err)) {
        return void res.status(409).json({ message: "Conflict bij opslaan" });
      }
      if (isPgInputViolation(err)) {
        return void res.status(400).json({ message: "Ongeldige fiscale gegevens" });
      }
      throw err;
    }

    const resultaat = await bouwInhoudingsplichtige(id);
    if (!resultaat) return void res.status(404).json({ message: "Niet gevonden" });
    return void res.json(resultaat);
  },
);

// ── Inkomstenverhoudingen ─────────────────────────────────────────────────────

interface IkvRow {
  id: number;
  werkgeverId: number;
  medewerkerId: number;
  aanstellingId: number;
  volgnummer: number;
  datumAanvang: string;
  datumEinde: string | null;
  codeAardArbeidsverhouding: string | null;
  contractOnbepaaldeTijd: boolean;
  schriftelijkeArbeidsovereenkomst: boolean;
  oproepovereenkomst: boolean;
  verzekerdZw: boolean;
  verzekerdWw: boolean;
  verzekerdWia: boolean;
  codeInvloedVerzekeringsplicht: string | null;
  actief: boolean;
  aangemaaktOp: Date;
  bijgewerktOp: Date;
  werkgeverNaam: string | null;
  medewerkerNaam: string | null;
}

const ikvSelectFields = {
  id: loonInkomstenverhoudingenTable.id,
  werkgeverId: loonInkomstenverhoudingenTable.werkgeverId,
  medewerkerId: loonInkomstenverhoudingenTable.medewerkerId,
  aanstellingId: loonInkomstenverhoudingenTable.aanstellingId,
  volgnummer: loonInkomstenverhoudingenTable.volgnummer,
  datumAanvang: loonInkomstenverhoudingenTable.datumAanvang,
  datumEinde: loonInkomstenverhoudingenTable.datumEinde,
  codeAardArbeidsverhouding: loonInkomstenverhoudingenTable.codeAardArbeidsverhouding,
  contractOnbepaaldeTijd: loonInkomstenverhoudingenTable.contractOnbepaaldeTijd,
  schriftelijkeArbeidsovereenkomst: loonInkomstenverhoudingenTable.schriftelijkeArbeidsovereenkomst,
  oproepovereenkomst: loonInkomstenverhoudingenTable.oproepovereenkomst,
  verzekerdZw: loonInkomstenverhoudingenTable.verzekerdZw,
  verzekerdWw: loonInkomstenverhoudingenTable.verzekerdWw,
  verzekerdWia: loonInkomstenverhoudingenTable.verzekerdWia,
  codeInvloedVerzekeringsplicht: loonInkomstenverhoudingenTable.codeInvloedVerzekeringsplicht,
  actief: loonInkomstenverhoudingenTable.actief,
  aangemaaktOp: loonInkomstenverhoudingenTable.aangemaaktOp,
  bijgewerktOp: loonInkomstenverhoudingenTable.bijgewerktOp,
  werkgeverNaam: werkgeversTable.naam,
  medewerkerNaam: medewerkersTable.naam,
};

function mapIkv(r: IkvRow) {
  return {
    id: r.id,
    werkgever_id: r.werkgeverId,
    werkgever_naam: r.werkgeverNaam ?? `Werkgever #${r.werkgeverId}`,
    medewerker_id: r.medewerkerId,
    medewerker_naam: r.medewerkerNaam ?? `Medewerker #${r.medewerkerId}`,
    aanstelling_id: r.aanstellingId,
    volgnummer: r.volgnummer,
    datum_aanvang: r.datumAanvang,
    datum_einde: r.datumEinde ?? null,
    code_aard_arbeidsverhouding: r.codeAardArbeidsverhouding ?? null,
    contract_onbepaalde_tijd: r.contractOnbepaaldeTijd,
    schriftelijke_arbeidsovereenkomst: r.schriftelijkeArbeidsovereenkomst,
    oproepovereenkomst: r.oproepovereenkomst,
    verzekerd_zw: r.verzekerdZw,
    verzekerd_ww: r.verzekerdWw,
    verzekerd_wia: r.verzekerdWia,
    code_invloed_verzekeringsplicht: r.codeInvloedVerzekeringsplicht ?? null,
    actief: r.actief,
    aangemaakt_op: r.aangemaaktOp.toISOString(),
    bijgewerkt_op: r.bijgewerktOp.toISOString(),
  };
}

router.get(
  "/loonfundament/inkomstenverhoudingen",
  lezen,
  async (req: Request, res: Response): Promise<void> => {
    const query = ListLoonInkomstenverhoudingenQueryParams.safeParse(req.query);
    if (!query.success) {
      return void res.status(400).json({ message: "Ongeldige queryparameters" });
    }
    const { werkgever_id, medewerker_id } = query.data;

    const filters = [];
    if (werkgever_id) filters.push(eq(loonInkomstenverhoudingenTable.werkgeverId, werkgever_id));
    if (medewerker_id) filters.push(eq(loonInkomstenverhoudingenTable.medewerkerId, medewerker_id));

    const rows = await db
      .select(ikvSelectFields)
      .from(loonInkomstenverhoudingenTable)
      .leftJoin(werkgeversTable, eq(werkgeversTable.id, loonInkomstenverhoudingenTable.werkgeverId))
      .leftJoin(medewerkersTable, eq(medewerkersTable.id, loonInkomstenverhoudingenTable.medewerkerId))
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(loonInkomstenverhoudingenTable.id);

    return void res.json(rows.map(mapIkv));
  },
);

router.post(
  "/loonfundament/inkomstenverhoudingen",
  schrijven,
  async (req: Request, res: Response): Promise<void> => {
    const body = CreateLoonInkomstenverhoudingBody.safeParse(req.body);
    if (!body.success) {
      return void res.status(400).json({ message: "Ongeldige invoer", errors: body.error.issues });
    }
    const b = body.data;

    try {
      const [rij] = await db
        .insert(loonInkomstenverhoudingenTable)
        .values({
          werkgeverId: b.werkgever_id,
          medewerkerId: b.medewerker_id,
          aanstellingId: b.aanstelling_id,
          volgnummer: b.volgnummer,
          datumAanvang: b.datum_aanvang instanceof Date
            ? b.datum_aanvang.toISOString().slice(0, 10)
            : String(b.datum_aanvang),
          datumEinde: b.datum_einde
            ? (b.datum_einde instanceof Date
                ? b.datum_einde.toISOString().slice(0, 10)
                : String(b.datum_einde))
            : null,
          codeAardArbeidsverhouding: b.code_aard_arbeidsverhouding ?? null,
          contractOnbepaaldeTijd: b.contract_onbepaalde_tijd,
          schriftelijkeArbeidsovereenkomst: b.schriftelijke_arbeidsovereenkomst,
          oproepovereenkomst: b.oproepovereenkomst,
          verzekerdZw: b.verzekerd_zw,
          verzekerdWw: b.verzekerd_ww,
          verzekerdWia: b.verzekerd_wia,
          codeInvloedVerzekeringsplicht: b.code_invloed_verzekeringsplicht ?? null,
        })
        .returning();
      if (!rij) return void res.status(500).json({ message: "Aanmaken mislukt" });

      // Laad namen voor response
      const [wg] = await db.select({ naam: werkgeversTable.naam }).from(werkgeversTable).where(eq(werkgeversTable.id, rij.werkgeverId));
      const [mw] = await db.select({ naam: medewerkersTable.naam }).from(medewerkersTable).where(eq(medewerkersTable.id, rij.medewerkerId));
      return void res.status(201).json(mapIkv({ ...rij, werkgeverNaam: wg?.naam ?? null, medewerkerNaam: mw?.naam ?? null }));
    } catch (err) {
      if (isPgUniqueViolation(err)) {
        return void res.status(409).json({ message: "Volgnummer bestaat al voor deze medewerker en werkgever" });
      }
      if (isPgInputViolation(err)) {
        return void res.status(400).json({ message: "Aanstelling, werkgever of contractkenmerken zijn ongeldig" });
      }
      throw err;
    }
  },
);

router.patch(
  "/loonfundament/inkomstenverhoudingen/:id",
  schrijven,
  async (req: Request, res: Response): Promise<void> => {
    const params = UpdateLoonInkomstenverhoudingParams.safeParse(req.params);
    if (!params.success) return void res.status(400).json({ message: "Ongeldig id" });
    const body = UpdateLoonInkomstenverhoudingBody.safeParse(req.body);
    if (!body.success) return void res.status(400).json({ message: "Ongeldige invoer", errors: body.error.issues });

    const { id } = params.data;
    const b = body.data;

    const [bestaand] = await db
      .select({ id: loonInkomstenverhoudingenTable.id })
      .from(loonInkomstenverhoudingenTable)
      .where(eq(loonInkomstenverhoudingenTable.id, id));
    if (!bestaand) return void res.status(404).json({ message: "Inkomstenverhouding niet gevonden" });

    try {
      await db
        .update(loonInkomstenverhoudingenTable)
        .set({
          ...(b.volgnummer !== undefined ? { volgnummer: b.volgnummer } : {}),
          ...(b.datum_aanvang !== undefined ? { datumAanvang: b.datum_aanvang instanceof Date ? b.datum_aanvang.toISOString().slice(0, 10) : String(b.datum_aanvang) } : {}),
          ...(b.datum_einde !== undefined ? { datumEinde: b.datum_einde ? (b.datum_einde instanceof Date ? b.datum_einde.toISOString().slice(0, 10) : String(b.datum_einde)) : null } : {}),
          ...(b.code_aard_arbeidsverhouding !== undefined ? { codeAardArbeidsverhouding: b.code_aard_arbeidsverhouding } : {}),
          ...(b.contract_onbepaalde_tijd !== undefined ? { contractOnbepaaldeTijd: b.contract_onbepaalde_tijd } : {}),
          ...(b.schriftelijke_arbeidsovereenkomst !== undefined ? { schriftelijkeArbeidsovereenkomst: b.schriftelijke_arbeidsovereenkomst } : {}),
          ...(b.oproepovereenkomst !== undefined ? { oproepovereenkomst: b.oproepovereenkomst } : {}),
          ...(b.verzekerd_zw !== undefined ? { verzekerdZw: b.verzekerd_zw } : {}),
          ...(b.verzekerd_ww !== undefined ? { verzekerdWw: b.verzekerd_ww } : {}),
          ...(b.verzekerd_wia !== undefined ? { verzekerdWia: b.verzekerd_wia } : {}),
          ...(b.code_invloed_verzekeringsplicht !== undefined ? { codeInvloedVerzekeringsplicht: b.code_invloed_verzekeringsplicht } : {}),
          ...(b.actief !== undefined ? { actief: b.actief } : {}),
          bijgewerktOp: new Date(),
        })
        .where(eq(loonInkomstenverhoudingenTable.id, id));
    } catch (err) {
      if (isPgUniqueViolation(err)) {
        return void res.status(409).json({ message: "Volgnummer bestaat al voor deze medewerker en werkgever" });
      }
      if (isPgInputViolation(err)) {
        return void res.status(400).json({ message: "Contractkenmerken of datums zijn ongeldig" });
      }
      throw err;
    }

    const [updated] = await db
      .select(ikvSelectFields)
      .from(loonInkomstenverhoudingenTable)
      .leftJoin(werkgeversTable, eq(werkgeversTable.id, loonInkomstenverhoudingenTable.werkgeverId))
      .leftJoin(medewerkersTable, eq(medewerkersTable.id, loonInkomstenverhoudingenTable.medewerkerId))
      .where(eq(loonInkomstenverhoudingenTable.id, id));
    if (!updated) return void res.status(404).json({ message: "Niet gevonden" });
    return void res.json(mapIkv(updated));
  },
);

// ── Loonafspraken ─────────────────────────────────────────────────────────────

function mapAfspraak(r: typeof loonAfsprakenTable.$inferSelect) {
  return {
    id: r.id,
    inkomstenverhouding_id: r.inkomstenverhoudingId,
    ingangsdatum: r.ingangsdatum,
    loonsoort: r.loonsoort,
    bedrag_cents: r.bedragCents,
    schaal: r.schaal ?? null,
    trede: r.trede ?? null,
    vaste_toeslagen: r.vasteToeslagen as { omschrijving: string; bedrag_cents: number }[],
    loonheffingskorting: r.loonheffingskorting,
    tabelkeuze: r.tabelkeuze,
    anoniementarief: r.anoniementarief,
    vastgelegd_door_id: r.vastgelegdDoorId ?? null,
    aangemaakt_op: r.aangemaaktOp.toISOString(),
  };
}

router.get(
  "/loonfundament/loonafspraken",
  lezen,
  async (req: Request, res: Response): Promise<void> => {
    const query = ListLoonAfsprakenQueryParams.safeParse(req.query);
    if (!query.success) {
      return void res.status(400).json({ message: "inkomstenverhouding_id is verplicht" });
    }
    const rows = await db
      .select()
      .from(loonAfsprakenTable)
      .where(eq(loonAfsprakenTable.inkomstenverhoudingId, query.data.inkomstenverhouding_id))
      .orderBy(loonAfsprakenTable.ingangsdatum);
    return void res.json(rows.map(mapAfspraak));
  },
);

router.post(
  "/loonfundament/loonafspraken",
  schrijven,
  async (req: Request, res: Response): Promise<void> => {
    const body = CreateLoonAfspraakBody.safeParse(req.body);
    if (!body.success) {
      return void res.status(400).json({ message: "Ongeldige invoer", errors: body.error.issues });
    }
    const b = body.data;

    try {
      const [rij] = await db
        .insert(loonAfsprakenTable)
        .values({
          inkomstenverhoudingId: b.inkomstenverhouding_id,
          ingangsdatum: b.ingangsdatum instanceof Date
            ? b.ingangsdatum.toISOString().slice(0, 10)
            : String(b.ingangsdatum),
          loonsoort: b.loonsoort,
          bedragCents: b.bedrag_cents,
          schaal: b.schaal ?? null,
          trede: b.trede ?? null,
          vasteToeslagen: b.vaste_toeslagen,
          loonheffingskorting: b.loonheffingskorting,
          tabelkeuze: b.tabelkeuze,
          anoniementarief: b.anoniementarief,
          vastgelegdDoorId: req.session?.userId ?? null,
        })
        .returning();
      if (!rij) return void res.status(500).json({ message: "Aanmaken mislukt" });
      return void res.status(201).json(mapAfspraak(rij));
    } catch (err) {
      if (isPgUniqueViolation(err)) {
        return void res.status(409).json({ message: "Er bestaat al een loonafspraak voor deze ingangsdatum" });
      }
      if (isPgInputViolation(err)) {
        return void res.status(400).json({ message: "Loonafspraak of inkomstenverhouding is ongeldig" });
      }
      throw err;
    }
  },
);

// ── Jaarparameters (jaarsets) ─────────────────────────────────────────────────

function mapJaarsetSamenvatting(
  r: typeof loonJaarsetsTable.$inferSelect,
  bronBestandsnaam: string | null,
) {
  return {
    id: r.id,
    jaar: r.jaar,
    versie: r.versie,
    status: r.status,
    volledig: r.volledig,
    parameter_aantal: r.parameterAantal,
    fouten: r.fouten as { sleutel?: string | null; reden: string }[],
    geladen_op: isoOf(r.geladenOp),
    bron_bestandsnaam: bronBestandsnaam,
  };
}

router.get(
  "/loonfundament/jaarparameters",
  lezen,
  async (_req: Request, res: Response): Promise<void> => {
    const sets = await db
      .select()
      .from(loonJaarsetsTable)
      .orderBy(loonJaarsetsTable.jaar, loonJaarsetsTable.versie);

    const resultaten = await Promise.all(
      sets.map(async (s) => {
        const [primair] = await db
          .select({ naam: loonJaarbronnenTable.officieleBestandsnaam })
          .from(loonJaarbronnenTable)
          .where(
            and(
              eq(loonJaarbronnenTable.jaarsetId, s.id),
              eq(loonJaarbronnenTable.bronsoort, "primaire_xlsx"),
            ),
          );
        return mapJaarsetSamenvatting(s, primair?.naam ?? null);
      }),
    );
    return void res.json(resultaten);
  },
);

router.get(
  "/loonfundament/jaarparameters/:jaar",
  lezen,
  async (req: Request, res: Response): Promise<void> => {
    const params = GetLoonJaarparametersParams.safeParse(req.params);
    if (!params.success) return void res.status(400).json({ message: "Ongeldig jaar" });
    const query = GetLoonJaarparametersQueryParams.safeParse(req.query);
    if (!query.success) return void res.status(400).json({ message: "Ongeldige queryparameters" });
    const toonAlle = query.data.alle;

    const { jaar } = params.data;

    // Haal de meest recente jaarset op voor dit jaar (hoogste versie, niet vervangen tenzij alle=true)
    const sets = await db
      .select()
      .from(loonJaarsetsTable)
      .where(eq(loonJaarsetsTable.jaar, jaar))
      .orderBy(desc(loonJaarsetsTable.versie));

    // De nieuwste import is beslissend; nooit stil terugvallen op een oudere set.
    const set = sets[0];
    if (!set) {
      return void res.status(404).json({ message: "Geen import gevonden voor dit jaar" });
    }

    const bronnen = await db
      .select()
      .from(loonJaarbronnenTable)
      .where(eq(loonJaarbronnenTable.jaarsetId, set.id))
      .orderBy(loonJaarbronnenTable.bronsoort);

    const parameterFilter = toonAlle
      ? eq(loonJaarparametersTable.jaarsetId, set.id)
      : and(
          eq(loonJaarparametersTable.jaarsetId, set.id),
          eq(loonJaarparametersTable.rekenstatus, "niet_berekend"),
        );
    const params2 = await db
      .select()
      .from(loonJaarparametersTable)
      .where(parameterFilter)
      .orderBy(loonJaarparametersTable.sleutel);

    const primair = bronnen.find((b) => b.bronsoort === "primaire_xlsx");

    return void res.json({
      ...mapJaarsetSamenvatting(set, primair?.officieleBestandsnaam ?? null),
      bronnen: bronnen.map((b) => ({
        id: b.id,
        bronsoort: b.bronsoort,
        bron_url: b.bronUrl,
        officiele_bestandsnaam: b.officieleBestandsnaam,
        officiele_versie: b.officieleVersie,
        sha256: b.sha256,
        mime_type: b.mimeType,
        bestandsgrootte: b.bestandsgrootte,
        vindplaats: b.vindplaats,
        geladen_op: b.geladenOp.toISOString(),
      })),
      parameters: params2.map((p) => ({
        id: p.id,
        sleutel: p.sleutel,
        datatype: p.datatype,
        waarde: p.waarde,
        rekenstatus: p.rekenstatus,
        reden: p.reden ?? null,
        bron_id: p.bronId ?? null,
        vindplaats: p.vindplaats ?? null,
      })),
    });
  },
);

// ── Gereedheid ────────────────────────────────────────────────────────────────
//
// Retourneert NOOIT een ander jaar dan gevraagd. Gereed = true uitsluitend als:
//  - status === 'volledig'
//  - exact 7 bronnen aanwezig
//  - alle hashes aanwezig (64 hex)
//  - parameterAantal > 0
//  - GEEN parameters met rekenstatus niet_berekend

router.get(
  "/loonfundament/jaarparameters/:jaar/gereedheid",
  lezen,
  async (req: Request, res: Response): Promise<void> => {
    const params = GetLoonJaarGereedheidParams.safeParse(req.params);
    if (!params.success) return void res.status(400).json({ message: "Ongeldig jaar" });
    const { jaar } = params.data;

    const redenen: string[] = [];

    // Zoek de actieve (niet-vervangen) jaarset voor dit jaar
    const sets = await db
      .select()
      .from(loonJaarsetsTable)
      .where(eq(loonJaarsetsTable.jaar, jaar))
      .orderBy(desc(loonJaarsetsTable.versie));

    const set = sets[0];

    if (!set || set.status !== "volledig" || !set.volledig) {
      const heeftSet = !!set;
      const status = set?.status === "bron_gewijzigd"
        ? "bron_gewijzigd"
        : set
          ? "onvolledig"
          : "ontbreekt";
      return void res.json({
        jaar,
        gereed: false,
        status,
        redenen: heeftSet
          ? [`Nieuwste jaarset voor ${jaar} is niet volledig; huidige status: ${set.status}`]
          : [`Geen jaarset gevonden voor ${jaar}`],
        jaarset_id: set?.id ?? null,
      });
    }

    // Controleer 7 bronnen
    const bronnen = await db
      .select()
      .from(loonJaarbronnenTable)
      .where(eq(loonJaarbronnenTable.jaarsetId, set.id));

    if (bronnen.length !== 7) {
      redenen.push(`Verwacht 7 bronnen, ${bronnen.length} aanwezig`);
    }
    const bronsoorten = new Set(bronnen.map((bron) => bron.bronsoort));
    for (const vereist of VEREISTE_BRONSOORTEN) {
      if (!bronsoorten.has(vereist)) {
        redenen.push(`Verplichte bron ontbreekt: ${vereist}`);
      }
    }

    // Controleer hashes
    for (const bron of bronnen) {
      if (!/^[0-9a-f]{64}$/.test(bron.sha256)) {
        redenen.push(`SHA-256 ontbreekt of ongeldig voor bron ${bron.bronsoort}`);
      }
    }

    // Controleer parameterAantal
    if (set.parameterAantal <= 0) {
      redenen.push("Geen parameters geladen (parameterAantal = 0)");
    }

    // Controleer niet_berekend parameters
    const nietBerekend = await db
      .select({ id: loonJaarparametersTable.id })
      .from(loonJaarparametersTable)
      .where(
        and(
          eq(loonJaarparametersTable.jaarsetId, set.id),
          eq(loonJaarparametersTable.rekenstatus, "niet_berekend"),
        ),
      );
    if (nietBerekend.length > 0) {
      redenen.push(`${nietBerekend.length} parameter(s) hebben rekenstatus niet_berekend`);
    }
    const alleParameters = await db
      .select({
        bronId: loonJaarparametersTable.bronId,
        vindplaats: loonJaarparametersTable.vindplaats,
      })
      .from(loonJaarparametersTable)
      .where(eq(loonJaarparametersTable.jaarsetId, set.id));
    if (alleParameters.length !== set.parameterAantal) {
      redenen.push(
        `Parameteraantal wijkt af: jaarset vermeldt ${set.parameterAantal}, database bevat ${alleParameters.length}`,
      );
    }
    const nietHerleidbaar = alleParameters.filter(
      (parameter) => parameter.bronId === null || !parameter.vindplaats,
    ).length;
    if (nietHerleidbaar > 0) {
      redenen.push(`${nietHerleidbaar} parameter(s) missen bron of vindplaats`);
    }

    const gereed = redenen.length === 0;
    return void res.json({
      jaar,
      gereed,
      status: gereed ? "volledig" : "niet_herleidbaar",
      redenen,
      jaarset_id: set.id,
    });
  },
);

// ── Jaarparameters import ─────────────────────────────────────────────────────

router.post(
  "/loonfundament/jaarparameters/import",
  beheer,
  async (req: Request, res: Response): Promise<void> => {
    const body = ImportLoonJaarparametersBody.safeParse(req.body);
    if (!body.success) {
      return void res.status(400).json({ message: "Ongeldige invoer", errors: body.error.issues });
    }
    const { jaar, bronnen } = body.data;
    const geladenDoorId = req.session?.userId ?? null;

    try {
      const resultaat = await voerImportUit({
        jaar,
        bronnen: bronnen.map((b) => ({
          bronsoort: b.bronsoort,
          bron_url: b.bron_url,
          officiele_bestandsnaam: b.officiele_bestandsnaam,
          officiele_versie: b.officiele_versie,
          verwachte_sha256: b.verwachte_sha256,
          vindplaats: b.vindplaats,
        })),
        geladenDoorId,
      });

      // Haal de volledige jaarset-samenvatting op voor de response
      const [jaarset] = await db
        .select()
        .from(loonJaarsetsTable)
        .where(eq(loonJaarsetsTable.id, resultaat.jaarsetId));
      if (!jaarset) return void res.status(500).json({ message: "Import geslaagd maar jaarset niet teruggevonden" });

      const [primair] = await db
        .select({ naam: loonJaarbronnenTable.officieleBestandsnaam })
        .from(loonJaarbronnenTable)
        .where(
          and(
            eq(loonJaarbronnenTable.jaarsetId, jaarset.id),
            eq(loonJaarbronnenTable.bronsoort, "primaire_xlsx"),
          ),
        );

      return void res.status(201).json(mapJaarsetSamenvatting(jaarset, primair?.naam ?? null));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (err instanceof JaarImportConflictError || msg.includes("SHA-256 mismatch")) {
        return void res.status(409).json({ message: msg });
      }
      return void res.status(400).json({ message: msg });
    }
  },
);

// ── Loonstaten ────────────────────────────────────────────────────────────────

async function mapLoonstaat(r: typeof loonStatenTable.$inferSelect) {
  const tijdvakregels = await db
    .select()
    .from(loonStaatTijdvakregelsTable)
    .where(eq(loonStaatTijdvakregelsTable.loonstaatId, r.id))
    .orderBy(loonStaatTijdvakregelsTable.tijdvaknummer);

  const [ikv] = await db
    .select({
      werkgeverNaam: werkgeversTable.naam,
      medewerkerNaam: medewerkersTable.naam,
    })
    .from(loonInkomstenverhoudingenTable)
    .leftJoin(werkgeversTable, eq(werkgeversTable.id, loonInkomstenverhoudingenTable.werkgeverId))
    .leftJoin(medewerkersTable, eq(medewerkersTable.id, loonInkomstenverhoudingenTable.medewerkerId))
    .where(eq(loonInkomstenverhoudingenTable.id, r.inkomstenverhoudingId));

  return {
    id: r.id,
    inkomstenverhouding_id: r.inkomstenverhoudingId,
    medewerker_naam: ikv?.medewerkerNaam ?? `Medewerker #${r.inkomstenverhoudingId}`,
    werkgever_naam: ikv?.werkgeverNaam ?? `Werkgever #${r.inkomstenverhoudingId}`,
    kalenderjaar: r.kalenderjaar,
    tijdvak: r.tijdvak,
    status: r.status,
    tijdvakregels: tijdvakregels.map((t) => ({
      id: t.id,
      loonstaat_id: t.loonstaatId,
      tijdvaknummer: t.tijdvaknummer,
      periode_start: t.periodeStart,
      periode_einde: t.periodeEinde,
      rekenstatus: t.rekenstatus,
      reden: t.reden ?? null,
      vindplaats: t.vindplaats ?? null,
      tijdvak_waarden: t.tijdvakWaarden as Record<string, unknown>,
      cumulatieven: t.cumulatieven as Record<string, unknown>,
    })),
    aangemaakt_op: r.aangemaaktOp.toISOString(),
  };
}

router.get(
  "/loonfundament/loonstaten",
  lezen,
  async (req: Request, res: Response): Promise<void> => {
    const query = ListLoonStatenQueryParams.safeParse(req.query);
    if (!query.success) {
      return void res.status(400).json({ message: "Ongeldige queryparameters" });
    }
    const { kalenderjaar, inkomstenverhouding_id } = query.data;

    const filters = [];
    if (kalenderjaar) filters.push(eq(loonStatenTable.kalenderjaar, kalenderjaar));
    if (inkomstenverhouding_id) filters.push(eq(loonStatenTable.inkomstenverhoudingId, inkomstenverhouding_id));

    const rows = await db
      .select()
      .from(loonStatenTable)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(loonStatenTable.id);

    const resultaten = await Promise.all(rows.map(mapLoonstaat));
    return void res.json(resultaten);
  },
);

router.post(
  "/loonfundament/loonstaten",
  schrijven,
  async (req: Request, res: Response): Promise<void> => {
    const body = CreateLoonStaatBody.safeParse(req.body);
    if (!body.success) {
      return void res.status(400).json({ message: "Ongeldige invoer", errors: body.error.issues });
    }
    const b = body.data;

    // Controleer of inkomstenverhouding bestaat
    const [ikv] = await db
      .select({ id: loonInkomstenverhoudingenTable.id })
      .from(loonInkomstenverhoudingenTable)
      .where(eq(loonInkomstenverhoudingenTable.id, b.inkomstenverhouding_id));
    if (!ikv) {
      return void res.status(400).json({ message: "Inkomstenverhouding niet gevonden" });
    }

    try {
      const [rij] = await db
        .insert(loonStatenTable)
        .values({
          inkomstenverhoudingId: b.inkomstenverhouding_id,
          kalenderjaar: b.kalenderjaar,
          tijdvak: b.tijdvak,
        })
        .returning();
      if (!rij) return void res.status(500).json({ message: "Aanmaken mislukt" });
      return void res.status(201).json(await mapLoonstaat(rij));
    } catch (err) {
      if (isPgUniqueViolation(err)) {
        return void res.status(409).json({ message: "Loonstaat bestaat al voor deze inkomstenverhouding en dit jaar" });
      }
      throw err;
    }
  },
);

// ── Loonstaat tijdvakregels ───────────────────────────────────────────────────

router.post(
  "/loonfundament/loonstaten/:id/tijdvakregels",
  schrijven,
  async (req: Request, res: Response): Promise<void> => {
    const params = CreateLoonStaatTijdvakregelParams.safeParse(req.params);
    if (!params.success) return void res.status(400).json({ message: "Ongeldig id" });
    const ruweBody = req.body as Record<string, unknown>;
    const heeftBerekendeInhoud =
      ruweBody.rekenstatus === "berekend" ||
      (typeof ruweBody.tijdvak_waarden === "object" &&
        ruweBody.tijdvak_waarden !== null &&
        Object.keys(ruweBody.tijdvak_waarden as Record<string, unknown>).length > 0) ||
      (typeof ruweBody.cumulatieven === "object" &&
        ruweBody.cumulatieven !== null &&
        Object.keys(ruweBody.cumulatieven as Record<string, unknown>).length > 0);
    if (heeftBerekendeInhoud) {
      return void res.status(422).json({
        message: "LOON_02A bewaart alleen niet-berekende tijdvakregels; berekende waarden worden pas door LOON_02B server-side vastgelegd",
      });
    }
    const body = CreateLoonStaatTijdvakregelBody.safeParse(req.body);
    if (!body.success) return void res.status(400).json({ message: "Ongeldige invoer", errors: body.error.issues });

    const { id } = params.data;
    const b = body.data;

    // Controleer of loonstaat bestaat
    const [staat] = await db
      .select({
        id: loonStatenTable.id,
        tijdvak: loonStatenTable.tijdvak,
        kalenderjaar: loonStatenTable.kalenderjaar,
      })
      .from(loonStatenTable)
      .where(eq(loonStatenTable.id, id));
    if (!staat) return void res.status(404).json({ message: "Loonstaat niet gevonden" });

    const maximaalTijdvak = staat.tijdvak === "maand" ? 12 : 13;
    if (b.tijdvaknummer > maximaalTijdvak) {
      return void res.status(400).json({
        message: `Tijdvaknummer moet voor ${staat.tijdvak} tussen 1 en ${maximaalTijdvak} liggen`,
      });
    }
    const periodeStart = b.periode_start instanceof Date
      ? b.periode_start.toISOString().slice(0, 10)
      : String(b.periode_start);
    const periodeEinde = b.periode_einde instanceof Date
      ? b.periode_einde.toISOString().slice(0, 10)
      : String(b.periode_einde);
    if (
      !periodeStart.startsWith(`${staat.kalenderjaar}-`) ||
      !periodeEinde.startsWith(`${staat.kalenderjaar}-`)
    ) {
      return void res.status(400).json({
        message: "De tijdvakperiode moet volledig binnen het kalenderjaar van de loonstaat vallen",
      });
    }

    try {
      const [rij] = await db
        .insert(loonStaatTijdvakregelsTable)
        .values({
          loonstaatId: id,
          tijdvaknummer: b.tijdvaknummer,
          periodeStart,
          periodeEinde,
          rekenstatus: "niet_berekend",
          reden: b.reden,
          vindplaats: b.vindplaats ?? null,
          tijdvakWaarden: {},
          cumulatieven: {},
        })
        .returning();
      if (!rij) return void res.status(500).json({ message: "Aanmaken mislukt" });

      return void res.status(201).json({
        id: rij.id,
        loonstaat_id: rij.loonstaatId,
        tijdvaknummer: rij.tijdvaknummer,
        periode_start: rij.periodeStart,
        periode_einde: rij.periodeEinde,
        rekenstatus: rij.rekenstatus,
        reden: rij.reden ?? null,
        vindplaats: rij.vindplaats ?? null,
        tijdvak_waarden: rij.tijdvakWaarden as Record<string, unknown>,
        cumulatieven: rij.cumulatieven as Record<string, unknown>,
      });
    } catch (err) {
      if (isPgUniqueViolation(err)) {
        return void res.status(409).json({ message: "Tijdvaknummer bestaat al voor deze loonstaat" });
      }
      if (isPgInputViolation(err)) {
        return void res.status(400).json({ message: "Tijdvakregel is ongeldig of niet herleidbaar" });
      }
      throw err;
    }
  },
);

export default router;
