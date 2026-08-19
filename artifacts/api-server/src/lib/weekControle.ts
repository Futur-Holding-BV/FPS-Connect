// UREN_01 §5.3 + §6 — wekelijkse volledigheidscontrole en het
// tijd-voor-tijd-opnamesignaal, als voeders in de bestaande bewakingsloop
// (geen eigen planner). De loop draait dagelijks; door de dedup-sleutel per
// medewerker+week valt de melding effectief op maandagochtend over de week
// ervoor en nooit dubbel.
//
// De norm is contracturen_per_week uit de hoofdaanstelling (fallback:
// medewerkers.contracturen_per_week) — niet het vaste getal 40.
// Wat meetelt: gewerkte uren + goedgekeurd verlof + feestdagen + ziekte.
// Alleen op netto_uren toetsen is verboden (§7): elke vakantieweek zou
// vals alarm geven.
//
// Er wordt niets automatisch aangevuld of voorgevuld (§6.4).

import { db } from "@workspace/db";
import {
  medewerkersTable,
  functiesTable,
  medewerkerAanstellingenTable,
  urenRegistratiesTable,
  weekStatenTable,
  verlofAanvragenTable,
  verlofsoortenTable,
  feestdagenTable,
  ziekmeldingenTable,
  overwerkSlotenTable,
} from "@workspace/db/schema";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { WerkbakInvoer } from "./werkbakService";
import { overwerkGrens } from "./caoInstellingen";
import { selecteerBuitendienstVoorWeekcontrole } from "./weekControleBeleid";

function isoWeek(datum: Date): { jaar: number; week: number } {
  const d = new Date(Date.UTC(datum.getUTCFullYear(), datum.getUTCMonth(), datum.getUTCDate()));
  const dag = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dag);
  const jaarStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - jaarStart.getTime()) / 86400000 + 1) / 7);
  return { jaar: d.getUTCFullYear(), week };
}

function weekGrenzen(jaar: number, week: number): { van: string; tot: string } {
  const jan4 = new Date(Date.UTC(jaar, 0, 4));
  const dag = jan4.getUTCDay() || 7;
  const maandag = new Date(jan4);
  maandag.setUTCDate(jan4.getUTCDate() - dag + 1 + (week - 1) * 7);
  const zondag = new Date(maandag);
  zondag.setUTCDate(maandag.getUTCDate() + 6);
  return { van: maandag.toISOString().slice(0, 10), tot: zondag.toISOString().slice(0, 10) };
}

/** Aantal werkdagen (ma-vr) in de overlap van [start,eind] met [van,tot]. */
function werkdagenInOverlap(start: string, eind: string | null, van: string, tot: string): number {
  const a = start > van ? start : van;
  const b = eind == null || eind > tot ? tot : eind;
  if (a > b) return 0;
  let n = 0;
  const d = new Date(a + "T00:00:00Z");
  const e = new Date(b + "T00:00:00Z");
  while (d <= e) {
    const dag = d.getUTCDay();
    if (dag >= 1 && dag <= 5) n++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}

export interface WeekControleResultaat {
  medewerker_id: number;
  medewerker_naam: string;
  gebruiker_id: number | null;
  jaar: number;
  week: number;
  norm: number;
  gewerkt: number;
  verlof: number;
  feestdagen: number;
  ziekte: number;
  geteld: number;
  ingediend: boolean;
  volledig: boolean;
  tweede_keer_op_rij: boolean;
  overtreding_uren: number; // uren boven grens+0 die NIET door een open slot gedekt zijn
}

async function beoordeelWeek(
  m: { id: number; naam: string; gebruikerId: number | null; contracturenPerWeek: number | null; cao: string | null },
  normUren: number,
  jaar: number,
  week: number,
): Promise<Omit<WeekControleResultaat, "tweede_keer_op_rij">> {
  const { van, tot } = weekGrenzen(jaar, week);

  const uren = await db
    .select({ nettoUren: urenRegistratiesTable.nettoUren, datum: urenRegistratiesTable.datum, projectId: urenRegistratiesTable.projectId })
    .from(urenRegistratiesTable)
    .where(and(
      eq(urenRegistratiesTable.medewerkerId, m.id),
      gte(urenRegistratiesTable.datum, van),
      lte(urenRegistratiesTable.datum, tot),
    ));
  const gewerkt = uren.reduce((a, r) => a + r.nettoUren, 0);

  // Goedgekeurd verlof met overlap in de week: uren pro-rata naar werkdagen-overlap.
  const verlofRijen = await db
    .select({ start: verlofAanvragenTable.startDatum, eind: verlofAanvragenTable.eindDatum, uren: verlofAanvragenTable.aantalUren })
    .from(verlofAanvragenTable)
    .where(and(
      eq(verlofAanvragenTable.medewerkerId, m.id),
      eq(verlofAanvragenTable.status, "goedgekeurd"),
      lte(verlofAanvragenTable.startDatum, tot),
      gte(verlofAanvragenTable.eindDatum, van),
    ));
  let verlof = 0;
  for (const v of verlofRijen) {
    const totaalDagen = Math.max(1, werkdagenInOverlap(v.start, v.eind, v.start, v.eind));
    const overlapDagen = werkdagenInOverlap(v.start, v.eind, van, tot);
    verlof += (v.uren ?? 0) * (overlapDagen / totaalDagen);
  }

  const dagNorm = normUren / 5;

  // Feestdagen op werkdagen in de week (werkgever-onafhankelijk geteld: elke
  // geregistreerde feestdag-datum telt één keer).
  const feestRijen = await db
    .select({ datum: feestdagenTable.datum })
    .from(feestdagenTable)
    .where(and(gte(feestdagenTable.datum, van), lte(feestdagenTable.datum, tot)));
  const feestDatums = [...new Set(feestRijen.map((f) => f.datum))]
    .filter((datum) => { const dag = new Date(datum + "T00:00:00Z").getUTCDay(); return dag >= 1 && dag <= 5; });
  const feestdagen = feestDatums.length * dagNorm;

  // Ziekte: werkdagen in de overlap van ziekmelding en week × dagnorm.
  const ziekRijen = await db
    .select({ start: ziekmeldingenTable.startDatum, eind: ziekmeldingenTable.eindDatum })
    .from(ziekmeldingenTable)
    .where(and(
      eq(ziekmeldingenTable.medewerkerId, m.id),
      lte(ziekmeldingenTable.startDatum, tot),
    ));
  let ziekte = 0;
  for (const z of ziekRijen) {
    ziekte += werkdagenInOverlap(z.start, z.eind, van, tot) * dagNorm;
  }

  const geteld = Math.round((gewerkt + verlof + feestdagen + ziekte) * 100) / 100;

  const [staat] = await db
    .select({ status: weekStatenTable.status })
    .from(weekStatenTable)
    .where(and(
      eq(weekStatenTable.medewerkerId, m.id),
      eq(weekStatenTable.jaar, jaar),
      eq(weekStatenTable.weekNummer, week),
    ))
    .limit(1);
  const ingediend = !!staat && staat.status !== "concept";

  // §6.3 derde melding: meer dan norm+2 gewerkt zonder dat het deel boven de
  // drempel gedekt is. Attributie zoals de invoertoets zelf werkt: regels op
  // datumvolgorde, het deel van elke regel dat de lopende teller boven de
  // drempel duwt moet gedekt zijn door een op DIE datum open slot voor DAT
  // project. Sloten die inmiddels gesloten zijn tellen mee als ze op de
  // regel-datum geldig waren (destijds rechtmatig geschreven overwerk).
  const drempel = normUren + 2;
  let overtreding = 0;
  if (gewerkt > drempel) {
    const sloten = await db.select().from(overwerkSlotenTable)
      .where(sql`${overwerkSlotenTable.status} IN ('open','gesloten')`);
    const isGedekt = (projectId: number | null, datum: string) =>
      projectId != null && sloten.some((s) =>
        s.geldigVan != null && s.geldigTot != null && s.geopendOp != null &&
        s.projectId === projectId && datum >= s.geldigVan && datum <= s.geldigTot);
    const gesorteerd = [...uren].sort((a, b) => a.datum.localeCompare(b.datum));
    let teller = 0;
    for (const r of gesorteerd) {
      const bovenDeel = Math.max(0, Math.min(r.nettoUren, teller + r.nettoUren - drempel));
      teller += r.nettoUren;
      if (bovenDeel > 0 && !isGedekt(r.projectId, r.datum)) overtreding += bovenDeel;
    }
    overtreding = Math.round(overtreding * 100) / 100;
  }

  return {
    medewerker_id: m.id,
    medewerker_naam: m.naam,
    gebruiker_id: m.gebruikerId,
    jaar, week,
    norm: normUren,
    gewerkt: Math.round(gewerkt * 100) / 100,
    verlof: Math.round(verlof * 100) / 100,
    feestdagen: Math.round(feestdagen * 100) / 100,
    ziekte: Math.round(ziekte * 100) / 100,
    geteld,
    ingediend,
    volledig: geteld >= normUren - 1e-9 && ingediend,
    overtreding_uren: overtreding,
  };
}

/** Beoordeel de vorige (afgesloten) week voor buitendienstmedewerkers met contracturen. */
export async function beoordeelVorigeWeek(referentie = new Date()): Promise<WeekControleResultaat[]> {
  const vorigeWeekDag = new Date(referentie.getTime() - 7 * 86400000);
  const { jaar, week } = isoWeek(vorigeWeekDag);
  const weekDaarvoorDag = new Date(referentie.getTime() - 14 * 86400000);
  const vorigVorig = isoWeek(weekDaarvoorDag);

  const kandidaten = await db
    .select({
      id: medewerkersTable.id,
      naam: medewerkersTable.naam,
      gebruikerId: medewerkersTable.gebruikerId,
      contracturenPerWeek: medewerkersTable.contracturenPerWeek,
      cao: medewerkersTable.cao,
      uitDienst: medewerkersTable.uitDienstPer,
      functieUitvoerend: functiesTable.uitvoerend,
    })
    .from(medewerkersTable)
    .leftJoin(functiesTable, eq(medewerkersTable.functieId, functiesTable.id))
    .where(sql`${medewerkersTable.uitDienstPer} IS NULL OR ${medewerkersTable.uitDienstPer} >= (now() - interval '30 days')::date::text`);

  const medewerkers = selecteerBuitendienstVoorWeekcontrole(kandidaten);
  const resultaten: WeekControleResultaat[] = [];
  for (const m of medewerkers) {
    // Norm uit de hoofdaanstelling; fallback het medewerkersveld. Geen norm → overslaan.
    const [hoofd] = await db
      .select({ uren: medewerkerAanstellingenTable.contracturenPerWeek })
      .from(medewerkerAanstellingenTable)
      .where(and(eq(medewerkerAanstellingenTable.medewerkerId, m.id), eq(medewerkerAanstellingenTable.isHoofd, true)))
      .limit(1);
    const norm = hoofd?.uren ?? m.contracturenPerWeek ?? 0;
    if (!norm || norm <= 0) continue;

    const huidige = await beoordeelWeek(m, norm, jaar, week);
    let tweedeKeer = false;
    if (!huidige.volledig) {
      const vorige = await beoordeelWeek(m, norm, vorigVorig.jaar, vorigVorig.week);
      tweedeKeer = !vorige.volledig;
    }
    resultaten.push({ ...huidige, tweede_keer_op_rij: tweedeKeer });
  }
  return resultaten;
}

/** Bouw de werkbak-items voor de weekcontrole (§6.3). */
export function bouwWeekControleItems(resultaten: WeekControleResultaat[]): WerkbakInvoer[] {
  const items: WerkbakInvoer[] = [];
  for (const r of resultaten) {
    const weekLabel = `week ${r.week} (${r.jaar})`;
    if (!r.volledig) {
      const detail = `Norm ${r.norm}u — geteld ${r.geteld}u (gewerkt ${r.gewerkt} + verlof ${r.verlof} + feestdagen ${r.feestdagen} + ziekte ${r.ziekte}).${r.ingediend ? "" : " De weekstaat is nog niet ingediend."}`;
      // Eerst de medewerker zelf — hij kan het oplossen.
      if (r.gebruiker_id != null) {
        items.push({
          soort: "doen", bron: "weekstaat_onvolledig",
          titel: `Uw ${weekLabel} is niet volledig`,
          omschrijving: `${detail} Vul uw uren aan of dien de weekstaat in.`,
          gebruikerId: r.gebruiker_id, gewicht: 40,
          actiePad: "/uren", herkomstType: "weekstaat_controle",
          herkomstId: r.medewerker_id,
          dedupSleutel: `weekstaat_onvolledig:${r.medewerker_id}:${r.jaar}-${r.week}:zelf`,
        });
      }
      // Pas bij twee keer op rij is het een probleem van iemand anders (HRM).
      if (r.tweede_keer_op_rij) {
        items.push({
          soort: "doen", bron: "weekstaat_onvolledig",
          titel: `${r.medewerker_naam}: tweede onvolledige week op rij (${weekLabel})`,
          omschrijving: detail,
          vereisteModule: "personeel", vereistNiveau: 2, gewicht: 50,
          actiePad: "/weekstaten", herkomstType: "weekstaat_controle",
          herkomstId: r.medewerker_id,
          dedupSleutel: `weekstaat_onvolledig:${r.medewerker_id}:${r.jaar}-${r.week}:hrm`,
        });
      }
    }
    if (r.overtreding_uren > 0) {
      // Regel overtreden: meer dan norm+2 zonder open slot → HRM én René.
      const titel = `${r.medewerker_naam}: ${r.overtreding_uren}u boven de weekgrens zonder open overwerkslot (${weekLabel})`;
      const omschrijving = `Gewerkt ${r.gewerkt}u; de uren boven de grens zijn niet (volledig) gedekt door een open overwerkslot op de betreffende projecten.`;
      items.push({
        soort: "weten", bron: "weekstaat_overwerk_overtreding",
        titel, omschrijving,
        vereisteModule: "personeel", vereistNiveau: 2, gewicht: 55,
        actiePad: "/uren/weekstaten", herkomstType: "weekstaat_controle", herkomstId: r.medewerker_id,
        dedupSleutel: `weekstaat_overwerk:${r.medewerker_id}:${r.jaar}-${r.week}:hrm`,
      });
      items.push({
        soort: "weten", bron: "weekstaat_overwerk_overtreding",
        titel, omschrijving,
        alleenHoofdbeheerder: true, gewicht: 55,
        actiePad: "/uren/weekstaten", herkomstType: "weekstaat_controle", herkomstId: r.medewerker_id,
        dedupSleutel: `weekstaat_overwerk:${r.medewerker_id}:${r.jaar}-${r.week}:hb`,
      });
    }
  }
  return items;
}

/**
 * UREN_01 §5 — tijd voor tijd dat langer dan een maand openstaat levert een
 * herinnering op (medewerker + projectleiders), geen blokkade en geen verval.
 */
export async function bouwTvtOpnameItems(plGebruikerIds: number[]): Promise<WerkbakInvoer[]> {
  const rijen = await db
    .select({
      id: verlofAanvragenTable.id,
      medewerkerId: verlofAanvragenTable.medewerkerId,
      start: verlofAanvragenTable.startDatum,
      uren: verlofAanvragenTable.aantalUren,
      status: verlofAanvragenTable.status,
      naam: medewerkersTable.naam,
      gebruikerId: medewerkersTable.gebruikerId,
    })
    .from(verlofAanvragenTable)
    .innerJoin(verlofsoortenTable, eq(verlofAanvragenTable.verlofsoortId, verlofsoortenTable.id))
    .leftJoin(medewerkersTable, eq(verlofAanvragenTable.medewerkerId, medewerkersTable.id))
    .where(and(
      eq(verlofsoortenTable.isTijdVoorTijd, true),
      sql`${verlofAanvragenTable.status} IN ('aangevraagd','goedgekeurd')`,
      sql`${verlofAanvragenTable.startDatum} <= (now() - interval '31 days')::date::text`,
      sql`${verlofAanvragenTable.eindDatum} >= now()::date::text`,
    ));

  const items: WerkbakInvoer[] = [];
  for (const r of rijen) {
    const omschrijving = `Tijd-voor-tijd van ${r.naam ?? "medewerker"} (${r.uren ?? 0} uur, vanaf ${r.start}) staat langer dan een maand open. Liefst binnen een maand opnemen — dit is een herinnering, het saldo vervalt niet.`;
    if (r.gebruikerId != null) {
      items.push({
        soort: "weten", bron: "tvt_opname_herinnering",
        titel: "Uw tijd-voor-tijd staat langer dan een maand open",
        omschrijving, gebruikerId: r.gebruikerId, gewicht: 25,
        actiePad: "/uren", herkomstType: "verlofaanvraag", herkomstId: r.id,
        dedupSleutel: `tvt_opname:${r.id}:zelf`,
      });
    }
    for (const plId of plGebruikerIds) {
      items.push({
        soort: "weten", bron: "tvt_opname_herinnering",
        titel: `Tijd-voor-tijd van ${r.naam ?? "medewerker"} staat langer dan een maand open`,
        omschrijving, gebruikerId: plId, gewicht: 20,
        actiePad: "/uren/weekstaten", herkomstType: "verlofaanvraag", herkomstId: r.id,
        dedupSleutel: `tvt_opname:${r.id}:pl:${plId}`,
      });
    }
  }
  return items;
}
