import type { Request } from "express";
import { db, gebruikersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  niveauVan,
  bevoegdhedenVoorLegacyRol,
  type Bevoegdheden,
} from "@workspace/permissies";

async function gebruikerVan(
  userId: number,
): Promise<{ rol: string; actief: boolean; bevoegdheden: Bevoegdheden } | null> {
  const [g] = await db
    .select({
      rol: gebruikersTable.rol,
      actief: gebruikersTable.actief,
      bevoegdheden: gebruikersTable.bevoegdheden,
    })
    .from(gebruikersTable)
    .where(eq(gebruikersTable.id, userId));
  if (!g) return null;
  return {
    rol: g.rol,
    actief: g.actief,
    bevoegdheden: effectieveBevoegdheden(g.rol, g.bevoegdheden),
  };
}

// Leidt de effectieve bevoegdheden-matrix af voor een gebruiker, identiek aan de
// requireBevoegdheid-middleware: klant heeft geen interne toegang; niet-gemigreerde
// accounts (lege matrix) vallen terug op de legacy-rolvertaling.
function effectieveBevoegdheden(rol: string, ruwe: unknown): Bevoegdheden {
  if (rol === "klant") return {};
  const bev = (ruwe as Bevoegdheden | null) ?? {};
  if (Object.keys(bev).length === 0) return bevoegdhedenVoorLegacyRol(rol);
  return bev;
}

// Drempel voor toewijzingsbeperking: wie de gebouwen-module hooguit mag lezen
// (niveau < 2) is een veldgebruiker en ziet/muteert uitsluitend de aan hem
// toegewezen gebouwen. Wie gebouwen mag beheren (niveau >= 2) heeft
// projectbrede toegang. Dit vervangt de oude harde rollijst (monteur/controleur).
const GEBOUW_BEHEER_NIVEAU = 2;

// Of een gebruiker met deze rol + matrix beperkt is tot toegewezen gebouwen.
// hoofdbeheerder omzeilt de matrix volledig en is nooit beperkt.
function isBeperkt(rol: string, bevoegdheden: Bevoegdheden): boolean {
  if (rol === "hoofdbeheerder") return false;
  return niveauVan(bevoegdheden, "gebouwen") < GEBOUW_BEHEER_NIVEAU;
}

export type EffectieveContext = {
  userId: number;
  rol: string;
  impersonatie: boolean;
  // true => deze gebruiker ziet alleen de aan hem toegewezen gebouwen.
  beperkt: boolean;
};

/**
 * Lost de effectieve identiteit op voor data-filtering. Een hoofdbeheerder kan
 * via "Bekijken als" een specifiek teamlid nabootsen (header X-Gebruiker-Override
 * met diens id). De effectieve gebruiker bepaalt zowel de rol als de
 * toewijzings-scope, zodat de hoofdbeheerder exact ziet wat dat teamlid ziet.
 *
 * Permissie-gating (requireRol) blijft ALTIJD op de echte sessie-rol gebaseerd;
 * deze helper beïnvloedt uitsluitend welke data zichtbaar is.
 */
export async function effectieveContext(req: Request): Promise<EffectieveContext> {
  const echteUserId = req.session.userId!;
  const echte = await gebruikerVan(echteUserId);
  const echteRol = echte?.rol ?? "gebruiker";
  if (echteRol !== "hoofdbeheerder") {
    return {
      userId: echteUserId,
      rol: echteRol,
      impersonatie: false,
      beperkt: isBeperkt(echteRol, echte?.bevoegdheden ?? {}),
    };
  }
  const header = req.headers["x-gebruiker-override"];
  const impId = typeof header === "string" ? Number.parseInt(header, 10) : NaN;
  if (!Number.isInteger(impId) || impId === echteUserId) {
    return { userId: echteUserId, rol: echteRol, impersonatie: false, beperkt: false };
  }
  const imp = await gebruikerVan(impId);
  if (!imp || !imp.actief) {
    return { userId: echteUserId, rol: echteRol, impersonatie: false, beperkt: false };
  }
  return {
    userId: impId,
    rol: imp.rol,
    impersonatie: true,
    beperkt: isBeperkt(imp.rol, imp.bevoegdheden),
  };
}

/**
 * Of een gebruiker (op zijn ECHTE id, zonder impersonatie) beperkt is tot zijn
 * toegewezen gebouwen. Gebruik dit voor object-level write-guards, waar de
 * autorisatie altijd op de werkelijke gebruiker gebaseerd moet blijven.
 */
export async function isBeperktTotToegewezen(userId: number): Promise<boolean> {
  const g = await gebruikerVan(userId);
  if (!g) return true;
  return isBeperkt(g.rol, g.bevoegdheden);
}
