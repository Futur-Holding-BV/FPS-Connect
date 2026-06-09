import type { Request } from "express";

const WISSELBARE_ROLLEN = ["beheerder", "monteur", "controleur", "klant"] as const;

/**
 * Wanneer een hoofdbeheerder "Bekijken als <rol>" gebruikt, stuurt de frontend
 * de header X-Rol-Override. Deze helper lost de effectieve rol op voor
 * data-filteringsdoeleinden (NIET voor permissie-gating — permissies blijven
 * altijd gebaseerd op de echte sessie-rol).
 */
export function resolveRolOverride(req: Request, echteRol: string): string {
  if (echteRol !== "hoofdbeheerder") return echteRol;
  const header = req.headers["x-rol-override"];
  if (
    typeof header === "string" &&
    (WISSELBARE_ROLLEN as readonly string[]).includes(header)
  ) {
    return header;
  }
  return echteRol;
}
