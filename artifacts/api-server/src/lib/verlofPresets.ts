/**
 * Verlof-presets — idempotente seeding bij serverstart
 *
 * Zaait:
 * 1. Verlofsoorten per CAO (Metaal & Techniek, Bouw & Infra, Geen CAO) + bijzonder verlof
 * 2. Nationale feestdagen 2025–2027
 * 3. Jaarafsluiting-regels voor het lopende en komende jaar
 *
 * Alle inserts zijn idempotent (check-first). Mislukt niet-blokkerend.
 */
import { db } from "@workspace/db";
import {
  verlofsoortenTable,
  feestdagenTable,
  jaarAfsluitingRegelsTable,
} from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { logger } from "./logger";

// ── CAO-verlofsoorten ─────────────────────────────────────────────────────────

type VerlofsoortPreset = {
  naam: string;
  categorie: string;
  hoofdcategorie: string;
  cao: string | null;
  opbouwUrenPerJaar: number | null;
  vervalRegel: string | null;
  juridischKader: string | null;
  toelichting: string | null;
  betaald: boolean;
  isTijdVoorTijd: boolean;
  collectief: boolean;
  // Jaarafsluiting: max uren overdracht (null = alles, 0 = niets)
  maxOverdrachtUren: number | null | 0;
  // ISO-datum-template: {JAAR} wordt vervangen door het afsluiting-jaar+1 ("2026" bij afsluiting 2025)
  overdrachtVervalDatumTemplate: string | null;
};

const CAO_VERLOFSOORTEN: VerlofsoortPreset[] = [
  // ── CAO Metaal & Techniek (norm 38 uur/week) ─────────────────────────────
  {
    naam: "Wettelijk vakantieverlof",
    categorie: "wettelijk",
    hoofdcategorie: "vakantie",
    cao: "Metaal & Techniek",
    opbouwUrenPerJaar: 152, // 20 vakantiedagen × 7,6 uur
    vervalRegel: "30 juni volgend jaar",
    juridischKader: "Art. 7:640a BW — wettelijk vakantieverlof vervalt 6 maanden na het opbouwjaar",
    toelichting: "20 vakantiedagen per jaar bij voltijds 38 uur per week. Pro rata bij deeltijd.",
    betaald: true,
    isTijdVoorTijd: false,
    collectief: false,
    maxOverdrachtUren: null,
    overdrachtVervalDatumTemplate: "{JAAR}-06-30",
  },
  {
    naam: "Bovenwettelijk vakantieverlof",
    categorie: "bovenwettelijk",
    hoofdcategorie: "vakantie",
    cao: "Metaal & Techniek",
    opbouwUrenPerJaar: 38, // 5 bovenwettelijke vakantiedagen × 7,6 uur
    vervalRegel: "5 jaar na opbouwjaar",
    juridischKader: "Art. 7:642 BW — bovenwettelijk verlof verjaart na 5 jaar",
    toelichting: "5 bovenwettelijke vakantiedagen per jaar bij voltijds 38 uur per week.",
    betaald: true,
    isTijdVoorTijd: false,
    collectief: false,
    maxOverdrachtUren: null,
    overdrachtVervalDatumTemplate: null, // geen vaste vervaldatum (5 jaar)
  },
  // ── CAO Bouw & Infra (norm 40 uur/week) ──────────────────────────────────
  {
    naam: "Wettelijk vakantieverlof",
    categorie: "wettelijk",
    hoofdcategorie: "vakantie",
    cao: "Bouw & Infra",
    opbouwUrenPerJaar: 160, // 20 vakantiedagen × 8 uur
    vervalRegel: "30 juni volgend jaar",
    juridischKader: "Art. 7:640a BW — wettelijk vakantieverlof vervalt 6 maanden na het opbouwjaar",
    toelichting: "20 vakantiedagen per jaar bij voltijds 40 uur per week. Pro rata bij deeltijd.",
    betaald: true,
    isTijdVoorTijd: false,
    collectief: false,
    maxOverdrachtUren: null,
    overdrachtVervalDatumTemplate: "{JAAR}-06-30",
  },
  {
    naam: "Bovenwettelijk vakantieverlof",
    categorie: "bovenwettelijk",
    hoofdcategorie: "vakantie",
    cao: "Bouw & Infra",
    opbouwUrenPerJaar: 40, // 5 bovenwettelijke vakantiedagen × 8 uur
    vervalRegel: "5 jaar na opbouwjaar",
    juridischKader: "Art. 7:642 BW — bovenwettelijk verlof verjaart na 5 jaar",
    toelichting: "5 bovenwettelijke vakantiedagen per jaar bij voltijds 40 uur per week.",
    betaald: true,
    isTijdVoorTijd: false,
    collectief: false,
    maxOverdrachtUren: null,
    overdrachtVervalDatumTemplate: null,
  },
  {
    naam: "ADV / roostervrij",
    categorie: "adv",
    hoofdcategorie: "adv_atv",
    cao: "Bouw & Infra",
    opbouwUrenPerJaar: 152, // ~3,8 uur/week × netto werkweken ≈ 152 uur/jaar
    vervalRegel: "31 december (geen overdracht naar volgend jaar)",
    juridischKader: "CAO Bouw & Infra — ADV-uren vervallen aan het einde van het kalenderjaar",
    toelichting: "Arbeidsduurverkorting. Wordt berekend naar rato van gewerkte weken. Vervalt per 31 december.",
    betaald: true,
    isTijdVoorTijd: false,
    collectief: false,
    maxOverdrachtUren: 0, // geen overdracht
    overdrachtVervalDatumTemplate: null,
  },
  // ── Geen CAO (wettelijk minimum, norm 40 uur/week) ───────────────────────
  {
    naam: "Wettelijk vakantieverlof",
    categorie: "wettelijk",
    hoofdcategorie: "vakantie",
    cao: "Geen CAO",
    opbouwUrenPerJaar: 160, // 20 vakantiedagen × 8 uur
    vervalRegel: "30 juni volgend jaar",
    juridischKader: "Art. 7:640a BW — wettelijk vakantieverlof vervalt 6 maanden na het opbouwjaar",
    toelichting: "Wettelijk minimum: 20 vakantiedagen per jaar bij voltijds 40 uur per week.",
    betaald: true,
    isTijdVoorTijd: false,
    collectief: false,
    maxOverdrachtUren: null,
    overdrachtVervalDatumTemplate: "{JAAR}-06-30",
  },
  {
    naam: "Bovenwettelijk vakantieverlof",
    categorie: "bovenwettelijk",
    hoofdcategorie: "vakantie",
    cao: "Geen CAO",
    opbouwUrenPerJaar: 40, // 5 bovenwettelijke vakantiedagen × 8 uur
    vervalRegel: "5 jaar na opbouwjaar",
    juridischKader: "Art. 7:642 BW — bovenwettelijk verlof verjaart na 5 jaar",
    toelichting: "5 extra vakantiedagen boven het wettelijk minimum.",
    betaald: true,
    isTijdVoorTijd: false,
    collectief: false,
    maxOverdrachtUren: null,
    overdrachtVervalDatumTemplate: null,
  },
  // ── Bijzonder verlof (CAO-onafhankelijk) ─────────────────────────────────
  {
    naam: "Geboorteverlof partner",
    categorie: "bijzonder",
    hoofdcategorie: "bijzonder",
    cao: null,
    opbouwUrenPerJaar: null,
    vervalRegel: "Op te nemen binnen 4 weken na geboorte",
    juridischKader: "Wet invoering extra geboorteverlof (WIEG) — 1 werkweek volledig betaald",
    toelichting: "Eén werkweek (contracturen) volledig betaald door werkgever. Op te nemen in de eerste 4 weken na de geboorte.",
    betaald: true,
    isTijdVoorTijd: false,
    collectief: false,
    maxOverdrachtUren: null,
    overdrachtVervalDatumTemplate: null,
  },
  {
    naam: "Aanvullend geboorteverlof",
    categorie: "bijzonder",
    hoofdcategorie: "bijzonder",
    cao: null,
    opbouwUrenPerJaar: null,
    vervalRegel: "Op te nemen binnen 6 maanden na geboorte",
    juridischKader: "WIEG — maximaal 5 werkweken à 70% via UWV",
    toelichting: "Partner kan tot 5 extra weken opnemen in de eerste 6 maanden. Werkgever vraagt voor rekening van de werknemer UWV-uitkering aan (70% dagloon).",
    betaald: false,
    isTijdVoorTijd: false,
    collectief: false,
    maxOverdrachtUren: null,
    overdrachtVervalDatumTemplate: null,
  },
  {
    naam: "Bijzonder verlof — huwelijk",
    categorie: "bijzonder",
    hoofdcategorie: "bijzonder",
    cao: null,
    opbouwUrenPerJaar: null,
    vervalRegel: "Op te nemen op trouwdag en omliggende dagen",
    juridischKader: "CAO-afhankelijk / gebruikelijk in Nederland",
    toelichting: "Doorgaans 2 werkdagen bij eigen huwelijk. Controleer de toepasselijke CAO.",
    betaald: true,
    isTijdVoorTijd: false,
    collectief: false,
    maxOverdrachtUren: null,
    overdrachtVervalDatumTemplate: null,
  },
  {
    naam: "Bijzonder verlof — overlijden eerstegraads",
    categorie: "bijzonder",
    hoofdcategorie: "bijzonder",
    cao: null,
    opbouwUrenPerJaar: null,
    vervalRegel: "Op te nemen rondom uitvaart",
    juridischKader: "Art. 4:1 WAZO en CAO-afspraken",
    toelichting: "4 werkdagen bij overlijden van partner, kind of ouder.",
    betaald: true,
    isTijdVoorTijd: false,
    collectief: false,
    maxOverdrachtUren: null,
    overdrachtVervalDatumTemplate: null,
  },
  {
    naam: "Bijzonder verlof — overlijden tweedegraads",
    categorie: "bijzonder",
    hoofdcategorie: "bijzonder",
    cao: null,
    opbouwUrenPerJaar: null,
    vervalRegel: "Op te nemen rondom uitvaart",
    juridischKader: "Art. 4:1 WAZO en CAO-afspraken",
    toelichting: "2 werkdagen bij overlijden van broer, zus, schoonouder of grootouder.",
    betaald: true,
    isTijdVoorTijd: false,
    collectief: false,
    maxOverdrachtUren: null,
    overdrachtVervalDatumTemplate: null,
  },
  {
    naam: "Kortdurend zorgverlof",
    categorie: "bijzonder",
    hoofdcategorie: "bijzonder",
    cao: null,
    opbouwUrenPerJaar: null,
    vervalRegel: "Per kalenderjaar: maximaal 2× wekelijkse contracturen",
    juridischKader: "Art. 5:1 WAZO — kortdurend zorgverlof bij ziekte naaste",
    toelichting: "Tot 2× de wekelijkse contracturen per jaar bij ziekte van partner, kind of ouder. Werkgever betaalt minimaal 70% loon.",
    betaald: true,
    isTijdVoorTijd: false,
    collectief: false,
    maxOverdrachtUren: null,
    overdrachtVervalDatumTemplate: null,
  },
];

// ── Nationale feestdagen 2025–2027 ────────────────────────────────────────────

const NATIONALE_FEESTDAGEN: Array<{ jaar: number; datum: string; naam: string }> = [
  // 2025
  { jaar: 2025, datum: "2025-01-01", naam: "Nieuwjaarsdag" },
  { jaar: 2025, datum: "2025-04-18", naam: "Goede Vrijdag" },
  { jaar: 2025, datum: "2025-04-20", naam: "Eerste Paasdag" },
  { jaar: 2025, datum: "2025-04-21", naam: "Tweede Paasdag" },
  { jaar: 2025, datum: "2025-04-26", naam: "Koningsdag" }, // 27 april is zondag → 26 april
  { jaar: 2025, datum: "2025-05-05", naam: "Bevrijdingsdag" },
  { jaar: 2025, datum: "2025-05-29", naam: "Hemelvaartsdag" },
  { jaar: 2025, datum: "2025-06-08", naam: "Eerste Pinksterdag" },
  { jaar: 2025, datum: "2025-06-09", naam: "Tweede Pinksterdag" },
  { jaar: 2025, datum: "2025-12-25", naam: "Eerste Kerstdag" },
  { jaar: 2025, datum: "2025-12-26", naam: "Tweede Kerstdag" },
  // 2026
  { jaar: 2026, datum: "2026-01-01", naam: "Nieuwjaarsdag" },
  { jaar: 2026, datum: "2026-04-03", naam: "Goede Vrijdag" },
  { jaar: 2026, datum: "2026-04-05", naam: "Eerste Paasdag" },
  { jaar: 2026, datum: "2026-04-06", naam: "Tweede Paasdag" },
  { jaar: 2026, datum: "2026-04-27", naam: "Koningsdag" },
  { jaar: 2026, datum: "2026-05-05", naam: "Bevrijdingsdag" },
  { jaar: 2026, datum: "2026-05-14", naam: "Hemelvaartsdag" },
  { jaar: 2026, datum: "2026-05-24", naam: "Eerste Pinksterdag" },
  { jaar: 2026, datum: "2026-05-25", naam: "Tweede Pinksterdag" },
  { jaar: 2026, datum: "2026-12-25", naam: "Eerste Kerstdag" },
  { jaar: 2026, datum: "2026-12-26", naam: "Tweede Kerstdag" },
  // 2027
  { jaar: 2027, datum: "2027-01-01", naam: "Nieuwjaarsdag" },
  { jaar: 2027, datum: "2027-03-26", naam: "Goede Vrijdag" },
  { jaar: 2027, datum: "2027-03-28", naam: "Eerste Paasdag" },
  { jaar: 2027, datum: "2027-03-29", naam: "Tweede Paasdag" },
  { jaar: 2027, datum: "2027-04-27", naam: "Koningsdag" },
  { jaar: 2027, datum: "2027-05-05", naam: "Bevrijdingsdag" },
  { jaar: 2027, datum: "2027-05-06", naam: "Hemelvaartsdag" },
  { jaar: 2027, datum: "2027-05-16", naam: "Eerste Pinksterdag" },
  { jaar: 2027, datum: "2027-05-17", naam: "Tweede Pinksterdag" },
  { jaar: 2027, datum: "2027-12-25", naam: "Eerste Kerstdag" },
  { jaar: 2027, datum: "2027-12-27", naam: "Tweede Kerstdag" }, // 26 dec is zaterdag
];

// ── Seeding ───────────────────────────────────────────────────────────────────

export async function zaaiVerlofPresets(): Promise<{
  verlofsoorten: number;
  feestdagen: number;
  jaarAfsluitingRegels: number;
}> {
  let aantalVerlofsoorten = 0;
  let aantalFeestdagen = 0;
  let aantalJaarRegels = 0;

  // 1. Verlofsoorten — idempotent op naam + CAO
  const geslaagdeIds: Map<string, number> = new Map();

  for (const preset of CAO_VERLOFSOORTEN) {
    const sleutel = `${preset.naam}||${preset.cao ?? ""}`;
    const bestaand = await db
      .select({ id: verlofsoortenTable.id })
      .from(verlofsoortenTable)
      .where(
        and(
          eq(verlofsoortenTable.naam, preset.naam),
          preset.cao ? eq(verlofsoortenTable.cao, preset.cao) : isNull(verlofsoortenTable.cao),
        ),
      )
      .limit(1);

    if (bestaand.length > 0) {
      geslaagdeIds.set(sleutel, bestaand[0].id);
    } else {
      const [nieuw] = await db
        .insert(verlofsoortenTable)
        .values({
          naam: preset.naam,
          categorie: preset.categorie,
          hoofdcategorie: preset.hoofdcategorie,
          cao: preset.cao ?? undefined,
          opbouwUrenPerJaar: preset.opbouwUrenPerJaar ?? undefined,
          vervalRegel: preset.vervalRegel ?? undefined,
          juridischKader: preset.juridischKader ?? undefined,
          toelichting: preset.toelichting ?? undefined,
          betaald: preset.betaald,
          isTijdVoorTijd: preset.isTijdVoorTijd,
          collectief: preset.collectief,
          actief: true,
        })
        .returning({ id: verlofsoortenTable.id });
      geslaagdeIds.set(sleutel, nieuw.id);
      aantalVerlofsoorten++;
    }
  }

  // 2. Feestdagen — idempotent op datum + werkgever=null
  for (const dag of NATIONALE_FEESTDAGEN) {
    const bestaand = await db
      .select({ id: feestdagenTable.id })
      .from(feestdagenTable)
      .where(
        and(
          eq(feestdagenTable.datum, dag.datum),
          isNull(feestdagenTable.werkgeverId),
        ),
      )
      .limit(1);
    if (bestaand.length === 0) {
      await db.insert(feestdagenTable).values({
        werkgeverId: undefined,
        jaar: dag.jaar,
        datum: dag.datum,
        naam: dag.naam,
      });
      aantalFeestdagen++;
    }
  }

  // 3. Jaarafsluiting-regels — huidig jaar + volgend jaar, voor elk CAO-verlofsoort
  //    met een overdracht-/vervaldatum-template. Idempotent op jaar + verlofsoort_id.
  const huidigJaar = new Date().getFullYear();

  for (const jaar of [huidigJaar, huidigJaar + 1]) {
    const volgendJaar = jaar + 1;

    for (const preset of CAO_VERLOFSOORTEN) {
      // Sla bijzonder verlof (geen opbouw, geen jaarafsluiting) over
      if (preset.hoofdcategorie === "bijzonder") continue;
      // Sla over als er niets te regelen valt
      if (preset.maxOverdrachtUren === null && preset.overdrachtVervalDatumTemplate === null) continue;

      const sleutel = `${preset.naam}||${preset.cao ?? ""}`;
      const verlofsoortId = geslaagdeIds.get(sleutel);
      if (!verlofsoortId) continue;

      const bestaandRegel = await db
        .select({ id: jaarAfsluitingRegelsTable.id })
        .from(jaarAfsluitingRegelsTable)
        .where(
          and(
            eq(jaarAfsluitingRegelsTable.jaar, jaar),
            eq(jaarAfsluitingRegelsTable.verlofsoortId, verlofsoortId),
            isNull(jaarAfsluitingRegelsTable.werkgeverId),
          ),
        )
        .limit(1);

      if (bestaandRegel.length === 0) {
        const vervalDatum = preset.overdrachtVervalDatumTemplate
          ? preset.overdrachtVervalDatumTemplate.replace("{JAAR}", String(volgendJaar))
          : null;

        await db.insert(jaarAfsluitingRegelsTable).values({
          werkgeverId: undefined,
          jaar,
          verlofsoortId,
          maxOverdrachtUren: typeof preset.maxOverdrachtUren === "number" ? preset.maxOverdrachtUren : null,
          overdrachtVervalDatum: vervalDatum ?? undefined,
          opmerking: `CAO-preset: ${preset.cao ?? "algemeen"} — automatisch aangemaakt`,
        });
        aantalJaarRegels++;
      }
    }
  }

  return { verlofsoorten: aantalVerlofsoorten, feestdagen: aantalFeestdagen, jaarAfsluitingRegels: aantalJaarRegels };
}

export async function startVerlofPresets(): Promise<void> {
  try {
    const resultaat = await zaaiVerlofPresets();
    const totaal = resultaat.verlofsoorten + resultaat.feestdagen + resultaat.jaarAfsluitingRegels;
    if (totaal > 0) {
      logger.info(resultaat, "verlof-presets: seeding voltooid");
    }
  } catch (err) {
    logger.warn({ err }, "verlof-presets: seeding mislukt (niet-blokkerend)");
  }
}
