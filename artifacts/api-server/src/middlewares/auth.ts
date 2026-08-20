import type { Request, Response, NextFunction, RequestHandler } from "express";
import {
  db,
  gebruikersTable,
  externeAdviseursTable,
  profielenTable,
  gebruikerProfielenTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { leesToken } from "../lib/token";
import { type ModuleId } from "@workspace/permissies";
import { PermissieService } from "../lib/permissie-service";
import { effectieveContext } from "../utils/rol";

declare module "express-session" {
  interface SessionData {
    rol?: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      permissies?: PermissieService;
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (req.session.userId) {
    next();
    return;
  }
  // Mobiele app: bearer-token in plaats van sessie-cookie.
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    const payload = leesToken(header.slice(7));
    if (payload) {
      try {
        const [g] = await db
          .select({
            actief: gebruikersTable.actief,
            rol: gebruikersTable.rol,
            tokenVersie: gebruikersTable.tokenVersie,
          })
          .from(gebruikersTable)
          .where(eq(gebruikersTable.id, payload.uid));
        // tokenVersie moet exact overeenkomen — een admin-wachtwoordreset of
        // "sessies beëindigen" hoogt de kolom op en trekt zo alle eerder
        // uitgegeven tokens in, zonder blocklist.
        if (g && g.actief && g.tokenVersie === payload.tv) {
          req.session.userId = payload.uid;
          req.session.rol = g.rol;
          next();
          return;
        }
      } catch (err) {
        req.log.error(err);
        res.status(500).json({ error: "Interne serverfout" });
        return;
      }
    }
  }
  res.status(401).json({ error: "Niet ingelogd" });
}

/**
 * Blokkeert alle data-routes zolang de gebruiker een verplichte
 * wachtwoordwijziging openstaand heeft (na een admin-reset of tijdelijk
 * wachtwoord). Fail-closed op de server — de frontend toont een blokkerende
 * modal, maar de daadwerkelijke afdwinging gebeurt hier, ongeacht wat de
 * client stuurt. `/auth/*` routes staan hier bewust buiten: die router is
 * vóór requireAuth geregistreerd en blijft dus altijd bereikbaar, zodat de
 * gebruiker zelf via POST /auth/wachtwoord-wijzigen (of de resetlink) weer
 * verder kan. Werkt op de ECHTE sessie-gebruiker, nooit op een impersonatie.
 */
export async function blokkeerBijWachtwoordWijzigenVereist(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const id = req.session.userId;
  if (!id) {
    next();
    return;
  }
  try {
    // Eén query voor twee poorten: verplichte wachtwoordwijziging én de harde
    // einddatum van externe adviseurs (GEBRUIKERS_01). De adviseurscheck moet
    // per request draaien — een websessie (12u) of mobiel bearer-token (30d)
    // die vóór de einddatum is uitgegeven, mag na het verstrijken van
    // toegang_tot geen data-route meer bereiken.
    const [g] = await db
      .select({
        moetWachtwoordWijzigen: gebruikersTable.moetWachtwoordWijzigen,
        adviseurToegangTot: externeAdviseursTable.toegangTot,
      })
      .from(gebruikersTable)
      .leftJoin(externeAdviseursTable, eq(externeAdviseursTable.gebruikerId, gebruikersTable.id))
      .where(eq(gebruikersTable.id, id));
    if (g?.moetWachtwoordWijzigen) {
      res.status(403).json({
        error: "Wachtwoord wijzigen is verplicht voordat u verdergaat",
        code: "WACHTWOORD_WIJZIGEN_VEREIST",
      });
      return;
    }
    if (g?.adviseurToegangTot) {
      // NL-kalenderdag; de einddag zelf blijft volledig geldig.
      const vandaag = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam" }).format(new Date());
      if (g.adviseurToegangTot < vandaag) {
        res.status(403).json({
          error: `De toegang van dit externe-adviseursaccount is verlopen op ${g.adviseurToegangTot}. Neem contact op met de beheerder om de toegang te verlengen.`,
          code: "ADVISEUR_TOEGANG_VERLOPEN",
        });
        return;
      }
    }
    next();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
}

export function requireRol(...toegestaneRollen: string[]): RequestHandler {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const id = req.session.userId;
    if (!id) {
      res.status(401).json({ error: "Niet ingelogd" });
      return;
    }
    try {
      const [g] = await db
        .select({ rol: gebruikersTable.rol })
        .from(gebruikersTable)
        .where(eq(gebruikersTable.id, id));
      if (!g || (g.rol !== "hoofdbeheerder" && !toegestaneRollen.includes(g.rol))) {
        res.status(403).json({ error: "Geen toegang" });
        return;
      }
      next();
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Interne serverfout" });
    }
  };
}

// Een weigering wegens ontbrekende bevoegdheid moet de WERKELIJKE reden geven
// (CALC-RECHTEN, René 18-08-2026): nooit een kaal "Geen toegang" dat de
// frontend tot een misleidend "probeer het opnieuw" verleidt. Het antwoord
// draagt module + vereist niveau + machineleesbare code, zodat schermen de
// echte reden kunnen tonen.
const NIVEAU_LABELS: Record<number, string> = { 1: "lezen", 2: "wijzigen", 3: "aanmaken", 4: "volledig beheer" };
function bevoegdheidGeweigerd(module: string, minNiveau: number) {
  const label = NIVEAU_LABELS[minNiveau] ?? String(minNiveau);
  return {
    error: `Geen bevoegdheid: hiervoor is voor de module '${module}' niveau ${minNiveau} (${label}) nodig. Vraag de beheerder om je rechten aan te passen.`,
    code: "BEVOEGDHEID_ONTBREEKT",
    module,
    vereist_niveau: minNiveau,
  };
}

export function requireBevoegdheid(module: ModuleId, minNiveau: number): RequestHandler {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const id = req.session.userId;
    if (!id) {
      res.status(401).json({ error: "Niet ingelogd" });
      return;
    }
    // Als laadPermissies al heeft gedraaid, gebruik de gecachte service — geen extra DB-ronde.
    if (req.permissies) {
      if (req.permissies.isHoofdbeheerder) { next(); return; }
      if (req.permissies.heeftModuleRecht(module, minNiveau)) { next(); return; }
      res.status(403).json(bevoegdheidGeweigerd(module, minNiveau));
      return;
    }
    try {
      const permissies = new PermissieService(id);
      await permissies.laad();
      req.permissies = permissies;
      if (
        !permissies.isHoofdbeheerder &&
        !permissies.heeftModuleRecht(module, minNiveau)
      ) {
        res.status(403).json(bevoegdheidGeweigerd(module, minNiveau));
        return;
      }
      next();
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Interne serverfout" });
    }
  };
}

const EXTERNE_BOEKHOUDER_PROFIEL = "Externe boekhouder";

/**
 * De identiteitspoort van LOON_02A. Een los, handmatig toegekend
 * loonfundamentrecht is nadrukkelijk niet voldoende: alleen de hoofdbeheerder
 * of een gebruiker die daadwerkelijk aan het meegeleverde systeemprofiel
 * "Externe boekhouder" is gekoppeld mag loondata benaderen.
 */
export async function heeftLoonfundamentIdentiteit(gebruikerId: number): Promise<boolean> {
  const [gebruiker] = await db
    .select({
      rol: gebruikersTable.rol,
      herkomstProfielNaam: profielenTable.naam,
      herkomstProfielSysteem: profielenTable.systeem,
    })
    .from(gebruikersTable)
    .leftJoin(
      profielenTable,
      eq(profielenTable.id, gebruikersTable.herkomstProfielId),
    )
    .where(eq(gebruikersTable.id, gebruikerId));

  if (!gebruiker) return false;
  if (gebruiker.rol === "hoofdbeheerder") return true;
  if (
    gebruiker.herkomstProfielSysteem === true &&
    gebruiker.herkomstProfielNaam === EXTERNE_BOEKHOUDER_PROFIEL
  ) {
    return true;
  }

  const [gekoppeldProfiel] = await db
    .select({ id: gebruikerProfielenTable.id })
    .from(gebruikerProfielenTable)
    .innerJoin(
      profielenTable,
      eq(profielenTable.id, gebruikerProfielenTable.profielId),
    )
    .where(
      and(
        eq(gebruikerProfielenTable.gebruikerId, gebruikerId),
        eq(profielenTable.naam, EXTERNE_BOEKHOUDER_PROFIEL),
        eq(profielenTable.systeem, true),
      ),
    )
    .limit(1);
  return Boolean(gekoppeldProfiel);
}

/**
 * Combineert de niet-toekenbare identiteitspoort met het niveaurecht.
 * effectieveContext zorgt dat "Bekijken als" dezelfde fail-closed grens
 * gebruikt als de rest van de API.
 */
export function requireLoonfundamentToegang(minNiveau: number): RequestHandler {
  const controleerNiveau = requireBevoegdheid("loonfundament", minNiveau);
  return async (req, res, next): Promise<void> => {
    try {
      const context = await effectieveContext(req);
      if (!(await heeftLoonfundamentIdentiteit(context.userId))) {
        res.status(403).json({
          error: "Geen toegang tot het loonfundament",
          code: "LOONFUNDAMENT_IDENTITEIT_VEREIST",
        });
        return;
      }
      await controleerNiveau(req, res, next);
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Interne serverfout" });
    }
  };
}

/**
 * Laat door zodra de gebruiker aan TEN MINSTE EEN van de opgegeven
 * (module, niveau)-eisen voldoet. Voor endpoints die door meerdere modules
 * worden gedeeld — bijvoorbeeld een minimale lijst met toewijsbare personen
 * die zowel bij gebouwteams, spot-uitvoering als onderhoud nodig is — zodat een
 * gebruiker met gebouw- of voorzieningenrechten kan toewijzen zonder de
 * volledige gebruikersbevoegdheid te hebben. Hoofdbeheerder mag altijd.
 */
/**
 * Laadt de PermissieService voor de effectieve gebruiker (incl. impersonatie)
 * en koppelt hem als req.permissies. Altijd na requireAuth plaatsen.
 */
export async function laadPermissies(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const id = req.session.userId;
  if (!id) {
    next();
    return;
  }
  try {
    const ctx = await effectieveContext(req);
    const svc = new PermissieService(ctx.userId);
    await svc.laad();
    req.permissies = svc;
    next();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
}

/**
 * Factory die een RequestHandler maakt die controleert of de gebruiker een
 * actief object-recht heeft op het object waarvan het id uit een route-parameter
 * komt. Valt terug op module-recht als dat voldoende is (heeftToegang).
 *
 * Gebruik: router.get("/:id/detail", requireObjectRecht("gebouw", "id"), handler)
 */
export function requireObjectRecht(
  objectType: string,
  idParam: string,
  module: string,
  minNiveau = 1,
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const rawParam = req.params[idParam];
    const objectId = parseInt(typeof rawParam === "string" ? rawParam : "", 10);
    if (isNaN(objectId)) {
      res.status(400).json({ error: "Ongeldig object-id" });
      return;
    }
    const permissies = req.permissies;
    if (!permissies) {
      res.status(401).json({ error: "Niet ingelogd" });
      return;
    }
    if (!permissies.heeftToegang(objectType, objectId, module, minNiveau)) {
      res.status(403).json({ error: "Geen toegang" });
      return;
    }
    next();
  };
}

export function requireEnigeBevoegdheid(
  eisen: Array<[ModuleId, number]>,
): RequestHandler {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const id = req.session.userId;
    if (!id) {
      res.status(401).json({ error: "Niet ingelogd" });
      return;
    }
    // Als laadPermissies al heeft gedraaid, gebruik de gecachte service — die
    // is impersonatie-bewust ("Bekijken als"): de effectieve gebruiker telt.
    if (req.permissies) {
      if (req.permissies.isHoofdbeheerder) { next(); return; }
      if (eisen.some(([module, minNiveau]) => req.permissies!.heeftModuleRecht(module, minNiveau))) {
        next();
        return;
      }
      res.status(403).json({ error: "Geen toegang" });
      return;
    }
    try {
      const permissies = new PermissieService(id);
      await permissies.laad();
      req.permissies = permissies;
      if (
        permissies.isHoofdbeheerder ||
        eisen.some(([module, minNiveau]) =>
          permissies.heeftModuleRecht(module, minNiveau),
        )
      ) {
        next();
        return;
      }
      res.status(403).json({ error: "Geen toegang" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Interne serverfout" });
    }
  };
}

/**
 * Lees het geauthenticeerde userId uit de sessie — getypeerd, zonder cast.
 * Gebruik deze helper overal waar je req.session.userId nodig hebt zodat
 * typefouten (bijv. "gebruikerId") at compile-time worden gevangen in plaats
 * van stilletjes null/undefined te leveren.
 */
export function getSessionUserId(req: Request): number | null {
  return req.session.userId ?? null;
}

/**
 * Zoek de weergavenaam van de ingelogde gebruiker op uit de database.
 * Gebruik dit in routes die de naam moeten opslaan of loggen — nooit
 * session["naam"] of session["gebruikerNaam"] lezen (die velden bestaan niet).
 * Geeft null terug als de gebruiker niet ingelogd is of niet gevonden wordt.
 */
export async function getSessionGebruikerNaam(req: Request): Promise<string | null> {
  const id = req.session.userId;
  if (!id) return null;
  try {
    const [g] = await db
      .select({ naam: gebruikersTable.naam })
      .from(gebruikersTable)
      .where(eq(gebruikersTable.id, id));
    return g?.naam ?? null;
  } catch {
    return null;
  }
}
