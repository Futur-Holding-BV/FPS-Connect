import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import {
  ACCEPTATIEREGISTER_HERGRADEER_LOCK,
  ACCEPTATIE_BRONKRACHT,
  ACCEPTATIE_BRONSOORTEN,
  acceptatieRegisterTable,
  db,
  type AcceptatieBronsoort,
} from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";

export type BewijsKandidaat = {
  bronSoort: AcceptatieBronsoort;
  bronDatum: Date;
  laatsteCodeWijzigingOp: Date;
};

export function isBronActueel(bronDatum: Date, laatsteCodeWijzigingOp: Date): boolean {
  return bronDatum.getTime() >= laatsteCodeWijzigingOp.getTime();
}

export function kiesSterksteActueleBron<T extends BewijsKandidaat>(bronnen: T[]): T | null {
  return bronnen
    .filter((bron) => isBronActueel(bron.bronDatum, bron.laatsteCodeWijzigingOp))
    .sort((a, b) => {
      const kracht = ACCEPTATIE_BRONKRACHT[b.bronSoort] - ACCEPTATIE_BRONKRACHT[a.bronSoort];
      return kracht || b.bronDatum.getTime() - a.bronDatum.getTime();
    })[0] ?? null;
}

function werkruimtePad(bestand: string): string {
  return path.isAbsolute(bestand) ? bestand : path.resolve(process.cwd(), "..", bestand);
}

export function laatsteGitWijziging(paden: string[], auditOp = new Date()): Date {
  const cwd = path.resolve(process.cwd(), "..");
  const alleenGit = process.env.ACCEPTATIEREGISTER_GIT_ALLEEN === "1";
  const bestaandePaden = paden
    .map((bestand) => bestand.trim())
    .filter(Boolean)
    .filter((bestand) => {
      if (existsSync(werkruimtePad(bestand))) return true;
      if (!alleenGit) return false;
      try {
        execFileSync("git", ["cat-file", "-e", `HEAD:${bestand}`], { cwd, stdio: "ignore" });
        return true;
      } catch {
        return false;
      }
    });
  if (bestaandePaden.length === 0) {
    throw new Error("Geen bestaand relevant codepad opgegeven voor registerbewijs.");
  }
  const statusRegels = alleenGit
    ? []
    : execFileSync(
      "git",
      ["status", "--porcelain", "-uall", "--", ...bestaandePaden],
      { cwd, encoding: "utf8" },
    ).split("\n").filter(Boolean);
  const waarden: Date[] = [];
  // Een nog niet gecommitteerde relevante wijziging telt op de echte
  // bestands-mtime. Zo blijft een audit met expliciete --audit-op herhaalbaar.
  for (const bestand of bestaandePaden) {
    if (!statusRegels.some((regel) => regel.slice(3).endsWith(bestand))) continue;
    if (!existsSync(werkruimtePad(bestand))) continue;
    const mtime = statSync(werkruimtePad(bestand)).mtime;
    if (mtime <= auditOp) waarden.push(mtime);
  }
  const iso = execFileSync(
    "git",
    ["log", "-1", `--before=${auditOp.toISOString()}`, "--format=%cI", "--", ...bestaandePaden],
    { cwd, encoding: "utf8" },
  ).trim();
  if (iso) waarden.push(new Date(iso));
  if (waarden.length === 0) {
    throw new Error(`Geen git-wijzigingsdatum gevonden voor: ${bestaandePaden.join(", ")}.`);
  }
  return new Date(Math.max(...waarden.map((datum) => datum.getTime())));
}

export type RegistreerGroenBewijsInvoer = {
  opdrachtCode: string;
  puntNummers: number[];
  scriptPad: string;
  relevanteCodepaden: string[];
  volledigGeslaagd: boolean;
  toelichting: string;
  bronBestand?: string;
  runOp?: Date;
};

/**
 * De enige schrijfroute voor automatische scriptpromotie.
 *
 * De aanroeper roept dit pas aan nadat álle controles groen zijn. Een falende
 * of gedeeltelijke run muteert nooit een registerregel. Herhaald aanroepen is
 * idempotent en ververst uitsluitend het actuele, herleidbare bewijs.
 */
export async function registreerGroenBewijs(invoer: RegistreerGroenBewijsInvoer): Promise<number> {
  if (!invoer.volledigGeslaagd) return 0;
  if (invoer.puntNummers.length === 0 || new Set(invoer.puntNummers).size !== invoer.puntNummers.length) {
    throw new Error("Bewijsscript moet één of meer unieke puntnummers koppelen.");
  }
  if (!invoer.scriptPad.startsWith("scripts/src/")) {
    throw new Error("Bewijsvindplaats moet een versiebeheerbaar scripts/src-pad zijn.");
  }
  const relevanteCodepaden = [...new Set([
    ...invoer.relevanteCodepaden,
    invoer.scriptPad,
    "scripts/src/lib/acceptatieregisterBewijs.ts",
  ])];
  const laatsteCodeWijzigingOp = laatsteGitWijziging(relevanteCodepaden);
  const runOp = invoer.runOp ?? new Date();
  if (!isBronActueel(runOp, laatsteCodeWijzigingOp)) {
    throw new Error(
      `Bewijsrun ${runOp.toISOString()} is ouder dan codewijziging ${laatsteCodeWijzigingOp.toISOString()}.`,
    );
  }

  return db.transaction(async (tx) => {
    // De eenmalige historische hergrading neemt hetzelfde slot exclusief.
    // Groene scripts delen het onderling, maar kunnen daardoor nooit midden in
    // een hergrading promoveren en vervolgens door die motor worden overschreven.
    await tx.execute(sql`SELECT pg_advisory_xact_lock_shared(${ACCEPTATIEREGISTER_HERGRADEER_LOCK})`);
    const bestaande = await tx
      .select({
        puntNummer: acceptatieRegisterTable.puntNummer,
        bronBestand: acceptatieRegisterTable.bronBestand,
      })
      .from(acceptatieRegisterTable)
      .where(and(
        eq(acceptatieRegisterTable.opdrachtCode, invoer.opdrachtCode),
        inArray(acceptatieRegisterTable.puntNummer, invoer.puntNummers),
      ));
    if (bestaande.length !== invoer.puntNummers.length) {
      const gevonden = new Set(bestaande.map((punt) => punt.puntNummer));
      const ontbrekend = invoer.puntNummers.filter((nummer) => !gevonden.has(nummer));
      throw new Error(`Registerpunten ontbreken voor ${invoer.opdrachtCode}: ${ontbrekend.join(", ")}.`);
    }

    let gewijzigd = 0;
    for (const punt of bestaande) {
      const rijen = await tx
        .update(acceptatieRegisterTable)
        .set({
          stand: "gehaald",
          bewijsVindplaats: invoer.scriptPad,
          bronBestand: invoer.bronBestand ?? punt.bronBestand ?? invoer.scriptPad,
          bronSoort: "bewijsscript",
          bronDatum: runOp,
          laatsteCodeWijzigingOp,
          relevanteCodepaden,
          beoordeeldOp: runOp,
          toelichting: invoer.toelichting,
          bijgewerktOp: runOp,
        })
        .where(and(
          eq(acceptatieRegisterTable.opdrachtCode, invoer.opdrachtCode),
          eq(acceptatieRegisterTable.puntNummer, punt.puntNummer),
        ))
        .returning({ id: acceptatieRegisterTable.id });
      gewijzigd += rijen.length;
    }
    return gewijzigd;
  });
}

export function assertGeldigeBronsoort(bronSoort: string): asserts bronSoort is AcceptatieBronsoort {
  if (!(ACCEPTATIE_BRONSOORTEN as readonly string[]).includes(bronSoort)) {
    throw new Error(`Ongeldige bronsoort: ${bronSoort}.`);
  }
}