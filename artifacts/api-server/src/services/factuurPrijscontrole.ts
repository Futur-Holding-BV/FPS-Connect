// ─── PRIJS_01 §6: factuurcontrole tegen de prijsafspraak ───
//
// Bij het verwerken van een inkoopfactuur wordt per factuurregel gezocht naar
// een geldige prijsafspraak bij die leverancier op de factuurdatum. De uitkomst
// per regel (§6-tabel):
//   - klopt (binnen marge)     → niets
//   - boven marge              → prijsafwijking via de goedkeuringsmotor
//   - geen afspraak            → niets (normaal)
//   - artikel niet herkend     → 'niet_te_toetsen' in de respons; nooit ophouden
//
// Harde regels (§9): NOOIT stil corrigeren — de factuurregel blijft ongewijzigd.
// Een afwijking is een oordeel, geen fout. De factuur wordt nooit geblokkeerd.

import {
  db,
  facturenTable,
  factuurRegelsTable,
  prijsafsprakenTable,
  leveranciersTable,
  appInstellingenTable,
  type Prijsafspraak,
} from "@workspace/db";
import { and, eq, isNull, lte, gte, sql } from "drizzle-orm";
import { dienIn, haalOpenAanvraag, type GoedkeuringActor } from "./goedkeuring-engine";
import { logger } from "../lib/logger";

// Uitkomst per factuurregel.
export type RegelToetsUitkomst =
  | "klopt"
  | "afwijking"
  | "geen_afspraak"
  | "niet_te_toetsen";

export type RegelToetsResultaat = {
  regel_id: number;
  regelnummer: number;
  omschrijving: string;
  hoeveelheid: number | null;
  factuur_stukprijs: number | null;
  uitkomst: RegelToetsUitkomst;
  afgesproken_prijs: number | null;
  afspraak_id: number | null;
  afspraak_leverancier: string | null;
  verschil_per_stuk: number | null; // factuur - afspraak, per stuk
  verschil_totaal: number | null;   // verschil_per_stuk * hoeveelheid
  marge_pct: number;
};

export type FactuurPrijscontrole = {
  factuur_id: number;
  getoetst_op: string;
  marge_pct: number;
  aantal_regels: number;
  aantal_afwijkingen: number;
  aantal_niet_te_toetsen: number;
  totaal_meer_betaald: number; // som van positieve verschil_totaal boven de marge
  regels: RegelToetsResultaat[];
};

// Normaliseert een omschrijving/artikelcode voor een eenduidige match: kleine
// letters, alle niet-alfanumerieke tekens weg, spaties samengevoegd.
function normaliseer(tekst: string | null | undefined): string {
  if (!tekst) return "";
  return tekst.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

// Zoekt de geldige afspraak voor deze regel bij deze leverancier op de
// factuurdatum. Match uitsluitend als er EEN eenduidige treffer is op de
// genormaliseerde leverancier_artikelcode of leverancier_omschrijving.
function kiesEenduidigeAfspraak(
  regelOmschrijving: string,
  afspraken: Prijsafspraak[],
): Prijsafspraak | null {
  const genorm = normaliseer(regelOmschrijving);
  if (!genorm) return null;

  // 1) exacte match op genormaliseerde leverancier_artikelcode.
  const opCode = afspraken.filter((a) => a.leverancierArtikelcode && genorm.includes(normaliseer(a.leverancierArtikelcode)));
  const uniekeCodes = new Set(opCode.map((a) => normaliseer(a.leverancierArtikelcode)));
  if (opCode.length > 0 && uniekeCodes.size === 1) {
    // Bij meerdere staffels binnen dezelfde code: kies de basisstaffel (0),
    // anders de laagste staffel.
    return opCode.sort((a, b) => a.staffelVanaf - b.staffelVanaf)[0]!;
  }

  // 2) exacte match op genormaliseerde leverancier_omschrijving.
  const opOms = afspraken.filter((a) => a.leverancierOmschrijving && normaliseer(a.leverancierOmschrijving) === genorm);
  const uniekeOms = new Set(opOms.map((a) => normaliseer(a.leverancierOmschrijving)));
  if (opOms.length > 0 && uniekeOms.size === 1) {
    return opOms.sort((a, b) => a.staffelVanaf - b.staffelVanaf)[0]!;
  }

  return null;
}

// Kiest, gegeven een set kandidaten met dezelfde sleutel, de geldende staffel
// voor de gegeven hoeveelheid (hoogste staffel_vanaf <= hoeveelheid).
function kiesStaffel(kandidaten: Prijsafspraak[], hoeveelheid: number): Prijsafspraak | null {
  const passend = kandidaten
    .filter((a) => a.staffelVanaf <= hoeveelheid)
    .sort((a, b) => b.staffelVanaf - a.staffelVanaf);
  return passend[0] ?? null;
}

/**
 * Toetst alle regels van een factuur tegen de geldige prijsafspraken.
 * - Slaat het resultaat op in facturen.prijscontrole (cache; §9: de factuurregel
 *   zelf wordt nooit gewijzigd).
 * - Dient per afwijking boven de marge een 'prijsafwijking' in via de
 *   goedkeuringsmotor (idempotent: geen dubbele open aanvraag per factuur).
 * - Blokkeert de factuur nooit.
 *
 * `actor` is nodig om via de goedkeuringsmotor te kunnen indienen. Is er geen
 * actor (systeemstroom), dan wordt wel getoetst en gecachet maar geen aanvraag
 * ingediend — de afwijking blijft dan zichtbaar via het resultaat en wordt bij
 * een volgende, gebruikersgestuurde toets alsnog ingediend.
 */
export async function controleerFactuurRegels(
  factuurId: number,
  actor?: GoedkeuringActor | null,
): Promise<FactuurPrijscontrole | null> {
  const [factuur] = await db.select().from(facturenTable).where(eq(facturenTable.id, factuurId)).limit(1);
  if (!factuur) return null;

  const [inst] = await db.select({ marge: appInstellingenTable.prijsafwijkingMargePct }).from(appInstellingenTable).orderBy(appInstellingenTable.id).limit(1);
  const margePct = inst?.marge ?? 2;

  const regels = await db.select().from(factuurRegelsTable).where(eq(factuurRegelsTable.factuurId, factuurId));

  const factuurdatum = factuur.factuurdatum ?? new Date().toISOString().slice(0, 10);
  const leverancierId = factuur.leverancierId ?? null;

  let leverancierNaam: string | null = null;
  let geldigeAfspraken: Prijsafspraak[] = [];
  if (leverancierId != null) {
    const [lev] = await db.select({ naam: leveranciersTable.naam }).from(leveranciersTable).where(eq(leveranciersTable.id, leverancierId)).limit(1);
    leverancierNaam = lev?.naam ?? null;
    geldigeAfspraken = await db
      .select()
      .from(prijsafsprakenTable)
      .where(and(
        isNull(prijsafsprakenTable.teruggedraaidOp),
        eq(prijsafsprakenTable.leverancierId, leverancierId),
        lte(prijsafsprakenTable.geldigVan, factuurdatum),
        gte(prijsafsprakenTable.geldigTot, factuurdatum),
      ));
  }

  const resultaten: RegelToetsResultaat[] = [];
  let aantalAfwijkingen = 0;
  let aantalNietTeToetsen = 0;
  let totaalMeerBetaald = 0;

  for (const regel of regels) {
    const hoeveelheid = regel.hoeveelheid ?? null;
    const factuurStukprijs = regel.stukprijs != null ? parseFloat(regel.stukprijs) : null;

    const basis: RegelToetsResultaat = {
      regel_id: regel.id,
      regelnummer: regel.regelnummer,
      omschrijving: regel.omschrijving,
      hoeveelheid,
      factuur_stukprijs: factuurStukprijs,
      uitkomst: "geen_afspraak",
      afgesproken_prijs: null,
      afspraak_id: null,
      afspraak_leverancier: leverancierNaam,
      verschil_per_stuk: null,
      verschil_totaal: null,
      marge_pct: margePct,
    };

    // Geen leverancier of geen afspraken: niets te toetsen tegen — 'geen_afspraak'.
    if (leverancierId == null || geldigeAfspraken.length === 0) {
      resultaten.push(basis);
      continue;
    }

    // Eenduidige match zoeken; geen eenduidige treffer = artikel niet herkend.
    const gekozenEenheid = kiesEenduidigeAfspraak(regel.omschrijving, geldigeAfspraken);
    if (!gekozenEenheid) {
      aantalNietTeToetsen++;
      resultaten.push({ ...basis, uitkomst: "niet_te_toetsen" });
      continue;
    }

    // Alle staffels van dezelfde sleutel als de gekozen match, dan de geldende
    // staffel op de hoeveelheid kiezen.
    const sleutel = gekozenEenheid.leverancierArtikelcode
      ? normaliseer(gekozenEenheid.leverancierArtikelcode)
      : normaliseer(gekozenEenheid.leverancierOmschrijving);
    const zelfdeSleutel = geldigeAfspraken.filter((a) => {
      const k = a.leverancierArtikelcode ? normaliseer(a.leverancierArtikelcode) : normaliseer(a.leverancierOmschrijving);
      return k === sleutel;
    });
    const afspraak = kiesStaffel(zelfdeSleutel, hoeveelheid ?? 0) ?? gekozenEenheid;
    const afgesprokenPrijs = parseFloat(afspraak.prijs);

    if (factuurStukprijs == null) {
      // Wel een afspraak, maar geen factuurprijs om tegen te toetsen.
      resultaten.push({ ...basis, uitkomst: "niet_te_toetsen", afgesproken_prijs: afgesprokenPrijs, afspraak_id: afspraak.id });
      aantalNietTeToetsen++;
      continue;
    }

    const verschilPerStuk = Math.round((factuurStukprijs - afgesprokenPrijs) * 10000) / 10000;
    const verschilTotaal = hoeveelheid != null ? Math.round(verschilPerStuk * hoeveelheid * 100) / 100 : null;
    const bovenMarge = afgesprokenPrijs > 0
      ? factuurStukprijs > afgesprokenPrijs * (1 + margePct / 100)
      : factuurStukprijs > 0;

    const res: RegelToetsResultaat = {
      ...basis,
      afgesproken_prijs: afgesprokenPrijs,
      afspraak_id: afspraak.id,
      verschil_per_stuk: verschilPerStuk,
      verschil_totaal: verschilTotaal,
      uitkomst: bovenMarge ? "afwijking" : "klopt",
    };
    if (bovenMarge) {
      aantalAfwijkingen++;
      if (verschilTotaal != null && verschilTotaal > 0) totaalMeerBetaald += verschilTotaal;
    }
    resultaten.push(res);
  }

  totaalMeerBetaald = Math.round(totaalMeerBetaald * 100) / 100;

  const resultaat: FactuurPrijscontrole = {
    factuur_id: factuurId,
    getoetst_op: new Date().toISOString(),
    marge_pct: margePct,
    aantal_regels: regels.length,
    aantal_afwijkingen: aantalAfwijkingen,
    aantal_niet_te_toetsen: aantalNietTeToetsen,
    totaal_meer_betaald: totaalMeerBetaald,
    regels: resultaten,
  };

  // Cache opslaan naast de factuur — de factuurregel zelf blijft ongewijzigd (§9).
  try {
    await db.update(facturenTable)
      .set({ prijscontrole: resultaat as unknown as Record<string, unknown>, bijgewerktOp: new Date() })
      .where(eq(facturenTable.id, factuurId));
  } catch (err) {
    logger.error({ err, factuurId }, "Kon prijscontrole-cache niet opslaan");
  }

  // Bij afwijking(en) boven de marge: één 'prijsafwijking'-aanvraag per factuur
  // via de goedkeuringsmotor (idempotent). Nooit blokkeren.
  if (aantalAfwijkingen > 0 && actor) {
    try {
      const afwijkendeRegels = resultaten.filter((r) => r.uitkomst === "afwijking");
      const omschrijvingDelen = afwijkendeRegels.slice(0, 5).map((r) =>
        `${r.omschrijving}: factuur €${r.factuur_stukprijs?.toFixed(2)} vs jaarprijs €${r.afgesproken_prijs?.toFixed(2)} (+€${(r.verschil_per_stuk ?? 0).toFixed(2)}/stuk${r.verschil_totaal != null ? `, +€${r.verschil_totaal.toFixed(2)} totaal` : ""})`,
      );
      const omschrijving = `Prijsafwijking t.o.v. de jaarprijs${leverancierNaam ? ` van ${leverancierNaam}` : ""}: ${aantalAfwijkingen} regel(s), samen €${totaalMeerBetaald.toFixed(2)} boven afgesproken. ${omschrijvingDelen.join("; ")}`;

      // Idempotentie onder concurrency (§6/§9): de check-then-insert
      // (haalOpenAanvraag → dienIn) moet atomair zijn, anders kunnen twee
      // gelijktijdige toetsen van dezelfde factuur beide "geen open aanvraag"
      // zien en samen twee aanvragen indienen. Per factuur nemen we daarom een
      // transactie-scoped advisory lock (hash op 'prijscontrole' + factuurId);
      // een tweede toets wacht tot de eerste klaar is en ziet dan de aanvraag.
      await db.transaction(async (tx) => {
        // tx voldoet aan het generieke Db-contract van de goedkeuringsmotor;
        // de cast volgt hetzelfde patroon als workflow-engine.ts.
        const txDb = tx as unknown as typeof db;
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtext('prijscontrole'), ${factuurId})`,
        );
        const bestaand = await haalOpenAanvraag(txDb, "factuur_prijsafwijking", factuurId);
        if (!bestaand) {
          // Eigen objectType (niet 'prijsafwijking'): dit is een oordeel NAAST de
          // factuurstroom, niet de factuur zelf. Zo botst het niet met de
          // stroom-gate en verandert een goedkeuring de factuurstatus niet ongewild
          // (§6/§9). documentType blijft 'prijsafwijking' zodat de beleidsregel klopt.
          await dienIn(txDb, {
            objectType: "factuur_prijsafwijking",
            objectId: factuurId,
            documentType: "prijsafwijking",
            omschrijving,
            bedrag: totaalMeerBetaald,
            werkmaatschappijId: null,
            actor,
          });
        }
      });
    } catch (err) {
      // De factuur mag nooit ophouden op een falende aanvraag.
      logger.error({ err, factuurId }, "Kon prijsafwijking-goedkeuring niet indienen");
    }
  }

  return resultaat;
}
