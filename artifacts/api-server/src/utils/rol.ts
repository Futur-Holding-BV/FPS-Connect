import type { Request } from "express";
import { db, gebruikersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function gebruikerVan(userId: number): Promise<{ rol: string; actief: boolean } | null> {
  const [g] = await db
    .select({ rol: gebruikersTable.rol, actief: gebruikersTable.actief })
    .from(gebruikersTable)
    .where(eq(gebruikersTable.id, userId));
  return g ?? null;
}

export type EffectieveContext = {
  userId: number;
  rol: string;
  impersonatie: boolean;
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
  const echteRol = echte?.rol ?? "viewer";
  if (echteRol !== "hoofdbeheerder") {
    return { userId: echteUserId, rol: echteRol, impersonatie: false };
  }
  const header = req.headers["x-gebruiker-override"];
  const impId = typeof header === "string" ? Number.parseInt(header, 10) : NaN;
  if (!Number.isInteger(impId) || impId === echteUserId) {
    return { userId: echteUserId, rol: echteRol, impersonatie: false };
  }
  const imp = await gebruikerVan(impId);
  if (!imp || !imp.actief || imp.rol === "viewer") {
    return { userId: echteUserId, rol: echteRol, impersonatie: false };
  }
  return { userId: impId, rol: imp.rol, impersonatie: true };
}
