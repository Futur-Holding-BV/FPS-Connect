/**
 * Reproduceerbare herbeoordelingsmotor voor de 213 open technische punten uit
 * de ochtendmeting van 20 augustus 2026.
 *
 * Bewijskracht: groene bewijsscript-run > huidige code > meetrapport >
 * antwoorddocument. Scriptpromoties lopen uitsluitend via
 * registreerGroenBewijs(); deze motor kan zo'n groene run niet nabootsen.
 */
import "./lib/prodGuard";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import {
  ACCEPTATIEREGISTER_HERGRADEER_LOCK,
  acceptatieRegisterHergradeerRunsTable,
  acceptatieRegisterTable,
  db,
} from "@workspace/db";
import { and, asc, eq, lt, or, sql } from "drizzle-orm";
import {
  acceptatieregisterHerbeoordeling,
  opdrachtDocumentPad,
  valideerHerbeoordeling,
} from "./data/acceptatieregister-herbeoordeling";
import { isBronActueel, laatsteGitWijziging } from "./lib/acceptatieregisterBewijs";

const DRY_RUN = process.argv.includes("--dry-run");
const EENMALIG_PRODUCTIE = process.argv.includes("--eenmalig-productie");
const GEEN_RAPPORTBESTAND = process.argv.includes("--geen-rapportbestand");
const auditArgument = process.argv.find((argument) => argument.startsWith("--audit-op="));
const AUDIT_OP = auditArgument ? new Date(auditArgument.slice("--audit-op=".length)) : new Date();
if (Number.isNaN(AUDIT_OP.getTime())) {
  throw new Error("--audit-op moet een geldige ISO-datumtijd zijn.");
}
const VERWACHT_AANTAL = 213;
const OCHTEND = {
  gehaald: 209,
  niet_gebouwd: 23,
  onbewezen: 190,
  wacht_op_rene: 16,
} as const;

type Stand = keyof typeof OCHTEND;
type HergradeerSamenvatting = {
  modus: "dry-run" | "toegepast";
  herbeoordeeld: number;
  recentGecontroleerd: number;
  padGecontroleerd: number;
  nietControleerbaar: number;
  staleGecorrigeerd: number;
  wachtOpGroeneRun: number;
  overgeslagenNieuwereOordelen: number;
  totalen: Record<Stand, number>;
};

const PRODUCTIE_RUN_SLEUTEL = "acceptatieregister-hergrading-2026-08-20-v1";
type Basisversies = Record<string, string>;

function leesBasisversies(samenvatting: unknown): Basisversies | null {
  if (!samenvatting || typeof samenvatting !== "object" || Array.isArray(samenvatting)) return null;
  const basisversies = (samenvatting as { basisversies?: unknown }).basisversies;
  if (!basisversies || typeof basisversies !== "object" || Array.isArray(basisversies)) return null;
  if (Object.values(basisversies).some((waarde) => typeof waarde !== "string")) return null;
  return basisversies as Basisversies;
}

async function claimEenmaligeProductierun(): Promise<Basisversies | null> {
  if (process.env.ACCEPTATIEREGISTER_HERGRADEER_PRODUCTIE !== "1") {
    throw new Error(
      "--eenmalig-productie vereist ACCEPTATIEREGISTER_HERGRADEER_PRODUCTIE=1 als expliciete vrijgave.",
    );
  }
  if (DRY_RUN) throw new Error("--dry-run en --eenmalig-productie kunnen niet samen worden gebruikt.");

  const nu = new Date();
  const basisRijen = await db
    .select({ id: acceptatieRegisterTable.id, bijgewerktOp: acceptatieRegisterTable.bijgewerktOp })
    .from(acceptatieRegisterTable);
  const nieuweBasisversies = Object.fromEntries(
    basisRijen.map((rij) => [String(rij.id), rij.bijgewerktOp.toISOString()]),
  );
  const ingevoegd = await db
    .insert(acceptatieRegisterHergradeerRunsTable)
    .values({
      sleutel: PRODUCTIE_RUN_SLEUTEL,
      status: "bezig",
      gestartOp: nu,
      samenvatting: { basisversies: nieuweBasisversies },
    })
    .onConflictDoNothing()
    .returning({ sleutel: acceptatieRegisterHergradeerRunsTable.sleutel });
  if (ingevoegd.length === 1) return nieuweBasisversies;

  const [bestaand] = await db
    .select()
    .from(acceptatieRegisterHergradeerRunsTable)
    .where(eq(acceptatieRegisterHergradeerRunsTable.sleutel, PRODUCTIE_RUN_SLEUTEL));
  if (bestaand?.status === "voltooid") {
    console.log(JSON.stringify({
      modus: "overgeslagen",
      reden: "eenmalige productierun is al voltooid",
      sleutel: PRODUCTIE_RUN_SLEUTEL,
      voltooidOp: bestaand.voltooidOp?.toISOString() ?? null,
    }, null, 2));
    return null;
  }
  const bestaandeBasisversies = leesBasisversies(bestaand?.samenvatting);
  if (!bestaandeBasisversies) {
    throw new Error("Bestaande hergradeerrun mist een geldige baseline; hervatten is fail-closed geweigerd.");
  }

  const herstartGrens = new Date(nu.getTime() - 60 * 60 * 1_000);
  const herclaimd = await db
    .update(acceptatieRegisterHergradeerRunsTable)
    .set({ status: "bezig", gestartOp: nu, voltooidOp: null })
    .where(and(
      eq(acceptatieRegisterHergradeerRunsTable.sleutel, PRODUCTIE_RUN_SLEUTEL),
      or(
        eq(acceptatieRegisterHergradeerRunsTable.status, "mislukt"),
        and(
          eq(acceptatieRegisterHergradeerRunsTable.status, "bezig"),
          lt(acceptatieRegisterHergradeerRunsTable.gestartOp, herstartGrens),
        ),
      ),
    ))
    .returning({ sleutel: acceptatieRegisterHergradeerRunsTable.sleutel });
  if (herclaimd.length === 1) return bestaandeBasisversies;
  throw new Error("Een andere acceptatieregister-hergrading is nog bezig; probeer later opnieuw.");
}

async function markeerProductierun(
  database: typeof db,
  status: "mislukt" | "voltooid",
  samenvatting?: HergradeerSamenvatting,
): Promise<void> {
  await database
    .update(acceptatieRegisterHergradeerRunsTable)
    .set({
      status,
      voltooidOp: status === "voltooid" ? new Date() : null,
      ...(status === "voltooid" ? { samenvatting: samenvatting ?? null } : {}),
    })
    .where(eq(acceptatieRegisterHergradeerRunsTable.sleutel, PRODUCTIE_RUN_SLEUTEL));
}

function ontdekRecenteCodepadenPerOpdracht(codes: string[], sinds: Date): Map<string, string[]> {
  const uitvoer = execFileSync(
    "git",
    [
      "log",
      `--since=${sinds.toISOString()}`,
      `--until=${AUDIT_OP.toISOString()}`,
      "--format=@@@%s",
      "--name-only",
    ],
    { cwd: path.resolve(process.cwd(), ".."), encoding: "utf8" },
  );
  const gevonden = new Map<string, Set<string>>();
  let actieveCodes: string[] = [];
  for (const regel of uitvoer.split("\n")) {
    if (regel.startsWith("@@@")) {
      const onderwerp = regel.slice(3).toUpperCase();
      actieveCodes = codes.filter((code) => onderwerp.includes(code.toUpperCase()));
      continue;
    }
    const bestand = regel.trim();
    if (
      !bestand
      || actieveCodes.length === 0
      || bestand.startsWith("docs/")
      || bestand.startsWith(".agents/")
      || bestand.startsWith("attached_assets/")
      || bestand.includes("/generated/")
      || !bestand.match(/\.(ts|tsx|js|mjs|sql|yaml|yml)$/)
    ) continue;
    for (const code of actieveCodes) {
      const set = gevonden.get(code) ?? new Set<string>();
      set.add(bestand);
      gevonden.set(code, set);
    }
  }
  return new Map([...gevonden].map(([code, paden]) => [code, [...paden].sort()]));
}

async function voerHerbeoordelingUit(
  database: typeof db = db,
  basisversies?: Basisversies,
): Promise<HergradeerSamenvatting> {
  const validatie = valideerHerbeoordeling();
  if (!validatie.geldig || validatie.aantalRegels !== VERWACHT_AANTAL) {
    throw new Error(
      `Herbeoordelingsinventaris ongeldig: ${validatie.aantalRegels}/${VERWACHT_AANTAL}; ${validatie.fouten.join("; ")}`,
    );
  }

  const alleRijen = await database
    .select()
    .from(acceptatieRegisterTable)
    .orderBy(asc(acceptatieRegisterTable.opdrachtCode), asc(acceptatieRegisterTable.puntNummer));
  const perSleutel = new Map(alleRijen.map((rij) => [`${rij.opdrachtCode}#${rij.puntNummer}`, rij]));
  const ontbrekend = acceptatieregisterHerbeoordeling.filter(
    (regel) => !perSleutel.has(`${regel.opdracht_code}#${regel.punt_nummer}`),
  );
  if (ontbrekend.length > 0) {
    throw new Error(`Register mist inventarispunten: ${ontbrekend.map((r) => `${r.opdracht_code}#${r.punt_nummer}`).join(", ")}`);
  }

  const beoordeeldOp = AUDIT_OP;
  const sinds = new Date(AUDIT_OP);
  sinds.setUTCDate(sinds.getUTCDate() - 14);
  const codes = [...new Set(alleRijen.map((rij) => rij.opdrachtCode))];
  const recentOntdektePaden = ontdekRecenteCodepadenPerOpdracht(codes, sinds);
  const inventarisPadenPerCode = new Map<string, Set<string>>();
  for (const regel of acceptatieregisterHerbeoordeling) {
    const set = inventarisPadenPerCode.get(regel.opdracht_code) ?? new Set<string>();
    for (const codepad of regel.relevante_codepaden) set.add(codepad);
    if (regel.bron_soort === "bewijsscript") {
      set.add(regel.bewijs_vindplaats);
      set.add("scripts/src/lib/acceptatieregisterBewijs.ts");
    }
    for (const codepad of recentOntdektePaden.get(regel.opdracht_code) ?? []) set.add(codepad);
    inventarisPadenPerCode.set(regel.opdracht_code, set);
  }
  const inventarisDatumPerCode = new Map<string, Date>();
  let gewijzigd = 0;
  let wachtOpGroeneRun = 0;
  const details: string[] = [];
  const doorMotorBijgewerkt = new Set<number>();
  const overgeslagenNieuwereOordelen = new Set<number>();
  const testFaalNa = Number(process.env.ACCEPTATIEREGISTER_HERGRADEER_TEST_FAAL_NA ?? "0");
  if (
    testFaalNa > 0
    && (!EENMALIG_PRODUCTIE || process.env.NODE_ENV !== "test")
  ) {
    throw new Error("De geforceerde hergradeerfout mag uitsluitend in de eenmalige testmodus worden gebruikt.");
  }
  let testMutaties = 0;
  const magBijwerken = (rij: typeof acceptatieRegisterTable.$inferSelect): boolean => {
    if (!basisversies || doorMotorBijgewerkt.has(rij.id)) return true;
    return basisversies[String(rij.id)] === rij.bijgewerktOp.toISOString();
  };
  const registreerMotorMutatie = (id: number): void => {
    doorMotorBijgewerkt.add(id);
    testMutaties++;
    if (testFaalNa > 0 && testMutaties >= testFaalNa) {
      throw new Error(`Geforceerde hergradeertestfout na ${testMutaties} mutatie(s).`);
    }
  };

  for (const regel of acceptatieregisterHerbeoordeling) {
    const huidig = perSleutel.get(`${regel.opdracht_code}#${regel.punt_nummer}`)!;
    if (!magBijwerken(huidig)) {
      overgeslagenNieuwereOordelen.add(huidig.id);
      details.push(`${regel.opdracht_code}#${regel.punt_nummer}: overgeslagen — nieuwer oordeel sinds eerste productieclaim`);
      continue;
    }
    const relevanteCodepaden = [...inventarisPadenPerCode.get(regel.opdracht_code)!].sort();
    let laatsteCodeWijzigingOp = inventarisDatumPerCode.get(regel.opdracht_code);
    if (!laatsteCodeWijzigingOp) {
      laatsteCodeWijzigingOp = laatsteGitWijziging(relevanteCodepaden, AUDIT_OP);
      inventarisDatumPerCode.set(regel.opdracht_code, laatsteCodeWijzigingOp);
    }

    // Een scriptvermelding in de inventaris is nog geen groene run. Alleen de
    // centrale helper mag deze punten promoveren. Is de helper al groen
    // gedraaid, dan blijft dat actuele oordeel staan.
    const scriptAlGroen =
      regel.aanbevolen_stand === "gehaald"
      && regel.bron_soort === "bewijsscript"
      && huidig.stand === "gehaald"
      && huidig.bronSoort === "bewijsscript"
      && huidig.bewijsVindplaats === regel.bewijs_vindplaats
      && isBronActueel(huidig.bronDatum, laatsteCodeWijzigingOp);

    if (scriptAlGroen) {
      if (!DRY_RUN) {
        await database.update(acceptatieRegisterTable).set({
          laatsteCodeWijzigingOp,
          relevanteCodepaden,
          beoordeeldOp,
          bijgewerktOp: beoordeeldOp,
        }).where(eq(acceptatieRegisterTable.id, huidig.id));
        registreerMotorMutatie(huidig.id);
      }
      gewijzigd++;
      details.push(`${regel.opdracht_code}#${regel.punt_nummer}: gehaald — actuele groene script-run`);
      continue;
    }

    const stand: Stand =
      regel.aanbevolen_stand === "gehaald" ? "onbewezen" : regel.aanbevolen_stand;
    if (regel.aanbevolen_stand === "gehaald") wachtOpGroeneRun++;

    // Voor de negatieve/onbewezen oordelen is de huidige code-audit de sterkste
    // bron. Het oorspronkelijke opdrachtbestand blijft apart staan als
    // bron_bestand, zodat zichtbaar blijft welk criterium is beoordeeld.
    const bewijsVindplaats = regel.relevante_codepaden.join("; ");
    const toelichting = regel.aanbevolen_stand === "gehaald"
      ? `${regel.toelichting} Promotie wacht op een volledig groene run van ${regel.bewijs_vindplaats}.`
      : regel.toelichting;
    if (!DRY_RUN) {
      await database.update(acceptatieRegisterTable).set({
        stand,
        bewijsVindplaats,
        bronBestand: regel.bron_bestand,
        bronSoort: "code",
        bronDatum: laatsteCodeWijzigingOp,
        laatsteCodeWijzigingOp,
        relevanteCodepaden,
        beoordeeldOp,
        toelichting,
        bijgewerktOp: beoordeeldOp,
      }).where(eq(acceptatieRegisterTable.id, huidig.id));
      registreerMotorMutatie(huidig.id);
    }
    gewijzigd++;
    details.push(`${regel.opdracht_code}#${regel.punt_nummer}: ${stand} — huidige code`);
  }

  // Pad-gebaseerde actualiteitscontrole over alle registerregels. De auditgrens
  // staat expliciet in het rapport en kan via --audit-op exact worden herhaald.
  // De veertiendaagse telling is een deelverzameling; stale bewijs wordt ook
  // buiten dat venster fail-closed gecorrigeerd.
  const teAuditen = DRY_RUN
    ? alleRijen
    : await database.select().from(acceptatieRegisterTable);
  let recentGecontroleerd = 0;
  let padGecontroleerd = 0;
  let staleGecorrigeerd = 0;
  const nietControleerbaar: string[] = [];
  const auditPadenPerCode = new Map<string, Set<string>>();
  for (const rij of teAuditen) {
    const set = auditPadenPerCode.get(rij.opdrachtCode) ?? new Set<string>();
    for (const codepad of rij.relevanteCodepaden) set.add(codepad);
    for (const codepad of recentOntdektePaden.get(rij.opdrachtCode) ?? []) set.add(codepad);
    auditPadenPerCode.set(rij.opdrachtCode, set);
  }
  const auditDatumPerCode = new Map<string, Date | null>();
  for (const huidig of teAuditen) {
    if (!magBijwerken(huidig)) {
      overgeslagenNieuwereOordelen.add(huidig.id);
      continue;
    }
    const relevanteCodepaden = [...(auditPadenPerCode.get(huidig.opdrachtCode) ?? [])].sort();
    const bewijsVindplaats = huidig.bewijsVindplaats?.trim()
      || (huidig.bronBestand
        ? (huidig.bronBestand.includes("/") ? huidig.bronBestand : opdrachtDocumentPad(huidig.bronBestand))
        : relevanteCodepaden.join("; "));
    const vindplaatsAangevuld = Boolean(bewijsVindplaats) && bewijsVindplaats !== huidig.bewijsVindplaats;
    if (relevanteCodepaden.length === 0) {
      nietControleerbaar.push(`${huidig.opdrachtCode}#${huidig.puntNummer}`);
      if (!DRY_RUN && (huidig.stand === "gehaald" || vindplaatsAangevuld)) {
        await database.update(acceptatieRegisterTable).set({
          ...(huidig.stand === "gehaald" ? { stand: "onbewezen" } : {}),
          ...(bewijsVindplaats ? { bewijsVindplaats } : {}),
          beoordeeldOp,
          bijgewerktOp: beoordeeldOp,
          ...(huidig.stand === "gehaald" ? {
            toelichting: `${huidig.toelichting ? `${huidig.toelichting} ` : ""}Hergrading: geen concrete relevante codepaden beschikbaar; actueel bewijs kan niet fail-closed worden vastgesteld.`,
          } : {}),
        }).where(eq(acceptatieRegisterTable.id, huidig.id));
        registreerMotorMutatie(huidig.id);
        if (huidig.stand === "gehaald") staleGecorrigeerd++;
      }
      continue;
    }
    let codeDatum = auditDatumPerCode.get(huidig.opdrachtCode);
    if (codeDatum === undefined) {
      try {
        codeDatum = laatsteGitWijziging(relevanteCodepaden, AUDIT_OP);
      } catch {
        codeDatum = null;
      }
      auditDatumPerCode.set(huidig.opdrachtCode, codeDatum);
    }
    if (!codeDatum) {
      nietControleerbaar.push(`${huidig.opdrachtCode}#${huidig.puntNummer}`);
      if (!DRY_RUN && (huidig.stand === "gehaald" || vindplaatsAangevuld)) {
        await database.update(acceptatieRegisterTable).set({
          ...(huidig.stand === "gehaald" ? { stand: "onbewezen" } : {}),
          ...(bewijsVindplaats ? { bewijsVindplaats } : {}),
          relevanteCodepaden,
          beoordeeldOp,
          bijgewerktOp: beoordeeldOp,
          ...(huidig.stand === "gehaald" ? {
            toelichting: `${huidig.toelichting ? `${huidig.toelichting} ` : ""}Hergrading: de relevante codepaden zijn niet herleidbaar naar versiebeheer; nieuwe meting vereist.`,
          } : {}),
        }).where(eq(acceptatieRegisterTable.id, huidig.id));
        registreerMotorMutatie(huidig.id);
        if (huidig.stand === "gehaald") staleGecorrigeerd++;
      }
      continue;
    }
    let bronDatum = huidig.bronDatum;
    const isTechnischeBootstrap =
      Math.abs(huidig.bronDatum.getTime() - huidig.aangemaaktOp.getTime()) < 1_000;
    if (isTechnischeBootstrap) {
      if (huidig.bronSoort === "code") {
        bronDatum = codeDatum;
      } else {
        const bronPaden = [
          ...(huidig.bewijsVindplaats?.split(";").map((waarde) => waarde.trim()) ?? []),
          ...(huidig.bronBestand ? [huidig.bronBestand] : []),
        ];
        try {
          bronDatum = laatsteGitWijziging([...new Set(bronPaden)], AUDIT_OP);
        } catch {
          nietControleerbaar.push(`${huidig.opdrachtCode}#${huidig.puntNummer}:bron`);
          if (!DRY_RUN && (huidig.stand === "gehaald" || vindplaatsAangevuld)) {
            await database.update(acceptatieRegisterTable).set({
              ...(huidig.stand === "gehaald" ? { stand: "onbewezen" } : {}),
              ...(bewijsVindplaats ? { bewijsVindplaats } : {}),
              relevanteCodepaden,
              laatsteCodeWijzigingOp: codeDatum,
              beoordeeldOp,
              bijgewerktOp: beoordeeldOp,
              ...(huidig.stand === "gehaald" ? {
                toelichting: `${huidig.toelichting ? `${huidig.toelichting} ` : ""}Hergrading: de technisch gemigreerde brondatum kon niet naar het oorspronkelijke bewijs worden herleid; nieuwe meting vereist.`,
              } : {}),
            }).where(eq(acceptatieRegisterTable.id, huidig.id));
            registreerMotorMutatie(huidig.id);
            if (huidig.stand === "gehaald") staleGecorrigeerd++;
          }
          continue;
        }
      }
    }
    padGecontroleerd++;
    if (codeDatum >= sinds) recentGecontroleerd++;
    const isStaleGehaald = huidig.stand === "gehaald" && !isBronActueel(bronDatum, codeDatum);
    if (!DRY_RUN) {
      await database.update(acceptatieRegisterTable).set({
        ...(isStaleGehaald ? { stand: "onbewezen" } : {}),
        ...(bewijsVindplaats ? { bewijsVindplaats } : {}),
        bronDatum,
        laatsteCodeWijzigingOp: codeDatum,
        relevanteCodepaden,
        beoordeeldOp,
        bijgewerktOp: beoordeeldOp,
        ...(isStaleGehaald ? {
          toelichting: `${huidig.toelichting ? `${huidig.toelichting} ` : ""}Hergrading: bestaand bewijs is ouder dan de laatste wijziging van de vastgelegde relevante codepaden; nieuwe meting vereist.`,
        } : {}),
      }).where(eq(acceptatieRegisterTable.id, huidig.id));
      registreerMotorMutatie(huidig.id);
    }
    if (isStaleGehaald) staleGecorrigeerd++;
  }

  const na = DRY_RUN
    ? alleRijen
    : await database.select().from(acceptatieRegisterTable);
  const totalen = na.reduce<Record<Stand, number>>(
    (acc, rij) => {
      if (rij.stand in acc) acc[rij.stand as Stand]++;
      return acc;
    },
    { gehaald: 0, niet_gebouwd: 0, onbewezen: 0, wacht_op_rene: 0 },
  );

  const datum = beoordeeldOp.toISOString().slice(0, 10);
  const rapport = [
    `# Herbeoordeling acceptatieregister — ${datum}`,
    "",
    `- Modus: ${DRY_RUN ? "DRY-RUN" : "GEMETEN en toegepast"}`,
    `- Inventaris: ${validatie.aantalRegels} open technische punten, elk exact één keer beoordeeld`,
    `- Auditgrens (herhaalbaar met --audit-op): ${AUDIT_OP.toISOString()}`,
    `- Pad-gebaseerde code-audit: ${padGecontroleerd} registerregels gecontroleerd`,
    `- Veertiendaagse deelcontrole: ${recentGecontroleerd} regels met een relevante padwijziging in het venster`,
    `- Niet pad-gebaseerd controleerbaar: ${nietControleerbaar.length}${nietControleerbaar.length ? ` (${nietControleerbaar.join(", ")})` : ""}`,
    `- Verouderde gehaalde oordelen gecorrigeerd: ${staleGecorrigeerd}`,
    `- Scriptpromoties die nog op een groene run wachten: ${wachtOpGroeneRun}`,
    `- Beoordeeld op: ${beoordeeldOp.toISOString()}`,
    `- Commit: ${execFileSync("git", ["rev-parse", "HEAD"], { cwd: path.resolve(process.cwd(), ".."), encoding: "utf8" }).trim()}`,
    "",
    "## Verdeling",
    "",
    "| Stand | Nieuw | Verschil sinds ochtendmeting |",
    "| --- | ---: | ---: |",
    ...(["gehaald", "niet_gebouwd", "onbewezen", "wacht_op_rene"] as Stand[]).map(
      (stand) => `| ${stand} | ${totalen[stand]} | ${totalen[stand] - OCHTEND[stand] >= 0 ? "+" : ""}${totalen[stand] - OCHTEND[stand]} |`,
    ),
    "",
    "## Herbeoordeelde technische punten",
    "",
    ...details.map((regel) => `- ${regel}`),
    "",
  ].join("\n");
  if (!DRY_RUN && !GEEN_RAPPORTBESTAND) {
    writeFileSync(
      path.resolve(process.cwd(), "..", "docs", "metingen", `ACCEPTATIEREGISTER_HERGRAAD_${datum}.md`),
      rapport,
    );
  }

  const samenvatting: HergradeerSamenvatting = {
    modus: DRY_RUN ? "dry-run" : "toegepast",
    herbeoordeeld: gewijzigd,
    recentGecontroleerd,
    padGecontroleerd,
    nietControleerbaar: nietControleerbaar.length,
    staleGecorrigeerd,
    wachtOpGroeneRun,
    overgeslagenNieuwereOordelen: overgeslagenNieuwereOordelen.size,
    totalen,
  };
  console.log(JSON.stringify(samenvatting, null, 2));
  return samenvatting;
}

async function main(): Promise<void> {
  if (!EENMALIG_PRODUCTIE) {
    await voerHerbeoordelingUit();
    return;
  }
  const basisversies = await claimEenmaligeProductierun();
  if (!basisversies) return;
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${ACCEPTATIEREGISTER_HERGRADEER_LOCK})`);
      const testPauzeMs = Number(process.env.ACCEPTATIEREGISTER_HERGRADEER_TEST_PAUZE_MS ?? "0");
      if (testPauzeMs > 0) {
        if (process.env.NODE_ENV !== "test") {
          throw new Error("De hergradeerpauze mag uitsluitend in testmodus worden gebruikt.");
        }
        console.log("[hergradeertest] exclusief slot verkregen");
        await new Promise((resolve) => setTimeout(resolve, testPauzeMs));
      }
      const transactioneleDb = tx as unknown as typeof db;
      const samenvatting = await voerHerbeoordelingUit(transactioneleDb, basisversies);
      await markeerProductierun(transactioneleDb, "voltooid", samenvatting);
    });
  } catch (error) {
    await markeerProductierun(db, "mislukt").catch(() => {});
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});