import { db, governanceChecksTable, governanceWachtrijTable } from "@workspace/db";
import { desc, eq, gte, and, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

export type RisicoNiveau = "groen" | "geel" | "oranje" | "rood" | "kritiek";

export interface GovernanceContext {
  gebruikerId: number | null;
  gebruikerNaam: string | null;
  rol: string | null;
  methode: string;
  route: string;
  ipAdres: string | null;
  userAgent: string | null;
}

export interface GovernanceBeoordeling {
  niveau: RisicoNiveau;
  score: number;
  motivatie: string;
  factoren: string[];
  afhandeling: "automatisch" | "goedkeuring_vereist" | "geblokkeerd";
  module: string;
  entiteit: string;
}

// ── Methode basisscores ──────────────────────────────────────────────────────

const METHODE_SCORE: Record<string, number> = {
  DELETE: 30,
  PUT: 8,
  PATCH: 8,
  POST: 4,
};

// ── Kritieke routes — altijd score 90 (blokkeer niet-hoofdbeheerder) ─────────

interface RoutePatroon {
  methode?: string;
  regex: RegExp;
  bonus: number;
  label: string;
}

const KRITIEK_PATRONEN: RoutePatroon[] = [
  { methode: "DELETE", regex: /^\/gebouwen\/\d+$/, bonus: 60, label: "Volledig gebouwrecord verwijderen" },
  { methode: "DELETE", regex: /^\/gebruikers\/\d+$/, bonus: 60, label: "Gebruikersaccount verwijderen" },
  { regex: /\/backups\/\d+\/herstel/, bonus: 86, label: "Databaseherstel uitvoeren" },
];

// ── Domeinbonussen — worden opgeteld bij methodescore ────────────────────────

const DOMEIN_PATRONEN: RoutePatroon[] = [
  { regex: /\/salaris|\/salarismutaties|\/loon-output/, bonus: 45, label: "Salarisgegevens" },
  { regex: /\/hrm\/|\/medewerkers\/\d+|\/aanstellingen\//, bonus: 38, label: "HRM-module" },
  { regex: /\/contracten\/\d+/, bonus: 36, label: "Contractrecord" },
  { regex: /\/offertes\/\d+/, bonus: 34, label: "Offerterecord" },
  { regex: /\/projecten\/\d+/, bonus: 34, label: "Projectrecord" },
  { regex: /\/dossiers\/\d+/, bonus: 34, label: "Dossierrecord" },
  { regex: /\/definitief|\/archiveer|\/definitief-maken/, bonus: 42, label: "Definitief-/archiveringactie" },
  { regex: /\/bulk|\/import\//, bonus: 40, label: "Bulk-/importoperatie" },
  { regex: /\/facturen\/\d+/, bonus: 28, label: "Factuurrecord" },
  { regex: /\/onderhoudscontracten\/\d+/, bonus: 30, label: "Onderhoudscontract" },
  { regex: /\/snagstream\/rapporten\/\d+/, bonus: 28, label: "Snagstream-rapport" },
  { regex: /\/avg\/|\/privacy\//, bonus: 22, label: "AVG/Privacy" },
  { regex: /\/documenten\/\d+/, bonus: 20, label: "Document" },
  { regex: /\/gebruikers\//, bonus: 22, label: "Gebruikersbeheer" },
  { regex: /\/pdm\/|\/pim\//, bonus: 18, label: "PIM/PDM-module" },
];

// ── Paden volledig vrijgesteld van governance ────────────────────────────────

const UITGESLOTEN_PADEN = new Set([
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/totp-verify",
  "/api/auth/totp-setup",
  "/api/muis-gebeurtenissen",
  "/api/mijn/online",
]);

const UITGESLOTEN_PREFIXEN = [
  "/api/auth/",
  "/api/governance/",
  "/api/slim-upload/log",
];

export function isGovernanceUitgesloten(pad: string): boolean {
  if (UITGESLOTEN_PADEN.has(pad)) return true;
  return UITGESLOTEN_PREFIXEN.some((p) => pad.startsWith(p));
}

// ── Kernfunctie: synchrone risicobeoordeling ─────────────────────────────────

export function beoordeelRisico(ctx: GovernanceContext): GovernanceBeoordeling {
  const { methode, route } = ctx;
  const routeZonderApi = route.replace(/^\/api/, "");

  let score = METHODE_SCORE[methode] ?? 4;
  const factoren: string[] = [`Methode ${methode} (basisscore ${score})`];

  // Kritieke patronen — overschrijven score naar minimum 90
  for (const p of KRITIEK_PATRONEN) {
    if (p.methode && p.methode !== methode) continue;
    if (p.regex.test(routeZonderApi)) {
      score = Math.max(score + p.bonus, 90);
      factoren.push(`${p.label} (+${p.bonus})`);
      break;
    }
  }

  // Domeinbonussen
  if (score < 90) {
    for (const p of DOMEIN_PATRONEN) {
      if (p.methode && p.methode !== methode) continue;
      if (p.regex.test(routeZonderApi)) {
        score += p.bonus;
        factoren.push(`${p.label} (+${p.bonus})`);
      }
    }
  }

  score = Math.min(score, 100);

  // Niveau bepalen
  let niveau: RisicoNiveau;
  if (score >= 85) niveau = "kritiek";
  else if (score >= 66) niveau = "rood";
  else if (score >= 46) niveau = "oranje";
  else if (score >= 26) niveau = "geel";
  else niveau = "groen";

  // Module + entiteit afleiden
  const segmenten = routeZonderApi.replace(/^\//, "").split("/").filter(Boolean);
  const module = segmenten[0] ?? "onbekend";
  const entiteit = segmenten.filter((s) => !/^\d+$/.test(s)).pop() ?? module;

  // Motivatie genereren
  const motivatie = maakMotivatie(niveau, methode, factoren, entiteit);

  // Afhandeling
  let afhandeling: GovernanceBeoordeling["afhandeling"] = "automatisch";
  if (niveau === "kritiek") afhandeling = "geblokkeerd";
  else if (niveau === "rood") afhandeling = "goedkeuring_vereist";

  return { niveau, score, motivatie, factoren, afhandeling, module, entiteit };
}

function maakMotivatie(
  niveau: RisicoNiveau,
  methode: string,
  factoren: string[],
  entiteit: string,
): string {
  const actie =
    methode === "DELETE" ? "verwijdering"
    : methode === "POST" ? "aanmaak"
    : "wijziging";

  const domeinFactoren = factoren.slice(1).join("; ");

  switch (niveau) {
    case "groen":
      return `Standaard ${actie} in module ${entiteit}. Automatisch verwerkt.`;
    case "geel":
      return `Normale ${actie} met beperkte impact. Automatisch verwerkt met logging.`;
    case "oranje":
      return `${actie.charAt(0).toUpperCase() + actie.slice(1)} heeft relevante impact: ${domeinFactoren}. Verwerkt; registratie aangemaakt voor beoordeling.`;
    case "rood":
      return `Significante ${actie}: ${domeinFactoren}. Actie is verwerkt maar staat ter beoordeling in de goedkeuringswachtrij.`;
    case "kritiek":
      return `Kritieke operatie: ${domeinFactoren}. Goedkeuring van de hoofdbeheerder is vereist vóór uitvoering.`;
  }
}

// ── Async logging naar DB ─────────────────────────────────────────────────────

interface LogInvoer extends GovernanceContext, GovernanceBeoordeling {
  geblokkeerd: boolean;
  statuscode?: number;
}

export async function logGovernanceCheck(invoer: LogInvoer): Promise<number | null> {
  try {
    const [rij] = await db
      .insert(governanceChecksTable)
      .values({
        gebruikerId: invoer.gebruikerId,
        gebruikerNaam: invoer.gebruikerNaam,
        rol: invoer.rol,
        methode: invoer.methode,
        route: invoer.route,
        module: invoer.module,
        entiteit: invoer.entiteit,
        risicoNiveau: invoer.niveau,
        risicoScore: invoer.score,
        motivatie: invoer.motivatie,
        risicoFactoren: invoer.factoren as unknown as Record<string, unknown>[],
        afhandeling: invoer.afhandeling,
        geblokkeerd: invoer.geblokkeerd,
        statuscode: invoer.statuscode ?? null,
        ipAdres: invoer.ipAdres,
        userAgent: invoer.userAgent,
      })
      .returning({ id: governanceChecksTable.id });

    const checkId = rij?.id ?? null;

    // Rood/Kritiek → wachtrij-entry aanmaken
    if (checkId && (invoer.niveau === "rood" || invoer.niveau === "kritiek")) {
      const vereistRol = invoer.niveau === "kritiek" ? "hoofdbeheerder" : "beheerder";
      await db.insert(governanceWachtrijTable).values({
        checkId,
        vereistRol,
        aangevraagdVanRol: invoer.rol,
        status: invoer.geblokkeerd ? "wacht" : "ter_beoordeling",
      });
    }

    return checkId;
  } catch (err) {
    logger.warn({ err }, "Governance-log mislukt");
    return null;
  }
}

// ── Dashboard-statistieken ───────────────────────────────────────────────────

export async function haalGovernanceDashboard(): Promise<{
  totaalVandaag: number;
  perNiveau: Record<RisicoNiveau, number>;
  geblokkeerd: number;
  wachtrijOpen: number;
  recenteChecks: unknown[];
}> {
  const vandaag = new Date();
  vandaag.setHours(0, 0, 0, 0);

  const [niveauCounts, geblokkeerd, wachtrijOpen, recenteChecks] = await Promise.all([
    db
      .select({ niveau: governanceChecksTable.risicoNiveau, aantal: sql<number>`count(*)::int` })
      .from(governanceChecksTable)
      .where(gte(governanceChecksTable.aangemaaktOp, vandaag))
      .groupBy(governanceChecksTable.risicoNiveau),
    db
      .select({ aantal: sql<number>`count(*)::int` })
      .from(governanceChecksTable)
      .where(and(gte(governanceChecksTable.aangemaaktOp, vandaag), eq(governanceChecksTable.geblokkeerd, true))),
    db
      .select({ aantal: sql<number>`count(*)::int` })
      .from(governanceWachtrijTable)
      .where(eq(governanceWachtrijTable.status, "wacht")),
    db
      .select()
      .from(governanceChecksTable)
      .orderBy(desc(governanceChecksTable.aangemaaktOp))
      .limit(20),
  ]);

  const perNiveau: Record<RisicoNiveau, number> = {
    groen: 0, geel: 0, oranje: 0, rood: 0, kritiek: 0,
  };
  let totaalVandaag = 0;
  for (const r of niveauCounts) {
    const n = r.niveau as RisicoNiveau;
    if (n in perNiveau) perNiveau[n] = r.aantal;
    totaalVandaag += r.aantal;
  }

  return {
    totaalVandaag,
    perNiveau,
    geblokkeerd: geblokkeerd[0]?.aantal ?? 0,
    wachtrijOpen: wachtrijOpen[0]?.aantal ?? 0,
    recenteChecks,
  };
}
