import type { Request } from "express";
import { db, gebruikersTable, gebouwToewijzingenTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { niveauVan, type Bevoegdheden } from "@workspace/permissies";
import { berekenEffectieveBevoegdhedenBatch } from "../lib/effectieve-bevoegdheden";

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
  const kaart = await berekenEffectieveBevoegdhedenBatch([
    { id: userId, rol: g.rol, storedBevoegdheden: g.bevoegdheden },
  ]);
  return {
    rol: g.rol,
    actief: g.actief,
    bevoegdheden: kaart.get(userId) ?? {},
  };
}

// Drempel voor projectbrede gebouwtoegang: wie de gebouwen-module mag beheren
// (niveau >= 2) heeft sowieso de hele portefeuille in beeld.
const GEBOUW_BEHEER_NIVEAU = 2;

// Minimaal leesrecht op de gebouwen-module. Zonder dit recht (niveau 0) mag een
// gebruiker de portefeuille nooit projectbreed zien en blijft hij beperkt tot
// zijn toegewezen gebouwen, ongeacht eventuele rechten op andere modules.
const GEBOUW_LEZEN_NIVEAU = 1;

// Veldgebruikers voeren daadwerkelijk werk uit op locatie: zij muteren spots,
// onderhoud of inspecties (niveau >= 2 op een van deze modules). Alleen zij
// worden tot hun toegewezen gebouwen beperkt.
const VELD_UITVOERING_MODULES = ["voorzieningen", "onderhoud", "inspecties"] as const;
const VELD_UITVOERING_NIVEAU = 2;

function isVeldUitvoerder(bevoegdheden: Bevoegdheden): boolean {
  return VELD_UITVOERING_MODULES.some(
    (m) => niveauVan(bevoegdheden, m) >= VELD_UITVOERING_NIVEAU,
  );
}

// Of een gebruiker met deze rol + matrix beperkt is tot toegewezen gebouwen.
// hoofdbeheerder omzeilt de matrix volledig en is nooit beperkt.
// Zonder leesrecht op de gebouwen-module (niveau 0) blijft
// een gebruiker altijd beperkt tot toegewezen gebouwen, ook al heeft hij rechten
// op gebouw-gescopete modules (voorzieningen/onderhoud/inspecties). Wie gebouwen
// mag beheren (>= 2) is niet beperkt. Bij alleen-leesrecht op gebouwen (niveau 1)
// maken we onderscheid: een veldgebruiker (voert spots/onderhoud/inspecties uit)
// blijft beperkt tot zijn toegewezen gebouwen, maar kantoorpersoneel met enkel
// leesrechten (bv. commercieel, calculatie) ziet de hele portefeuille.
function isBeperkt(rol: string, bevoegdheden: Bevoegdheden): boolean {
  if (rol === "hoofdbeheerder") return false;
  const gebouwNiveau = niveauVan(bevoegdheden, "gebouwen");
  if (gebouwNiveau < GEBOUW_LEZEN_NIVEAU) return true;
  if (gebouwNiveau >= GEBOUW_BEHEER_NIVEAU) return false;
  return isVeldUitvoerder(bevoegdheden);
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

// ── Gedeelde gebouwtoeganghelpers (centrale implementatie) ─────────────────

/**
 * Laadt de gebouwtoewijzingen voor een gebruiker uit de database.
 * Gecentraliseerd hier om duplicatie in de afzonderlijke route-bestanden te
 * vermijden.
 */
export async function toegewezenGebouwIds(userId: number): Promise<number[]> {
  const rows = await db
    .select({ gebouwId: gebouwToewijzingenTable.gebouwId })
    .from(gebouwToewijzingenTable)
    .where(eq(gebouwToewijzingenTable.gebruikerId, userId));
  return rows.map((r) => r.gebouwId);
}

/**
 * Centrale toewijzingsguard op basis van de inkomende request (ondersteunt
 * impersonatie via X-Gebruiker-Override). Gebruik dit in GET/PUT/PATCH/DELETE
 * handlers die per-gebouw scopen.
 *
 * Geeft true als:
 *   - De effectieve gebruiker NIET beperkt is (brede matrix-toegang), OF
 *   - Het gebouw in zijn toewijzingenlijst staat, OF
 *   - Hij een actief object-recht heeft op dit gebouw (via PermissieService).
 */
export async function magBijGebouw(
  req: Request,
  gebouwId: number | null,
): Promise<boolean> {
  const { userId, beperkt } = await effectieveContext(req);
  if (!beperkt) return true;
  if (gebouwId == null) return false;
  const ids = await toegewezenGebouwIds(userId);
  return ids.includes(gebouwId);
}

/**
 * Vereenvoudigde variant op basis van userId (zonder impersonatie).
 * Gebruik voor write-guards op de ECHTE sessie-gebruiker.
 */
export async function magBijGebouwVoorId(
  userId: number,
  gebouwId: number | null,
): Promise<boolean> {
  if (!(await isBeperktTotToegewezen(userId))) return true;
  if (gebouwId == null) return false;
  return (await toegewezenGebouwIds(userId)).includes(gebouwId);
}
