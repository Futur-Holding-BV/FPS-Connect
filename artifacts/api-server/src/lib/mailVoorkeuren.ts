// Helperfuncties voor per-gebruiker e-mailmeldingsvoorkeuren.
//
// Alle voorkeuren lopen via het bestaande gebruiker_voorkeuren-mechanisme
// (PANEEL_01 §4.4 / MENU_01 §4.3). Sleutels hebben de prefix "email.".
//
// Standaard (geen rij aanwezig): mailing versturen (fail-open).
// Uitgeschakeld: waarde === false.
//
// Kritieke escalaties (uitnodiging, wachtwoord-reset) vallen buiten dit
// mechanisme en worden altijd verstuurd.

import { db, gebruikerVoorkeurenTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

// ── Categorieën ───────────────────────────────────────────────────────────────
// Elke categorie heeft een machineleesbare sleutel en een gebruiksvriendelijk label.
export type MailCategorie =
  | "email.planning_melding"
  | "email.reactietermijn_melding"
  | "email.portaal_klantvraag"
  | "email.portaal_ondertekening"
  | "email.portaal_afwijzing";

export const MAIL_CATEGORIE_LABELS: Record<MailCategorie, { titel: string; beschrijving: string }> =
  {
    "email.planning_melding": {
      titel: "Planning-herinneringen",
      beschrijving:
        "Dagelijks overzicht van aanvraag-planningsdeadlines die binnen 4 dagen vervallen.",
    },
    "email.reactietermijn_melding": {
      titel: "Verstreken reactietermijn",
      beschrijving:
        "Melding wanneer een reactietermijn op een definitief rapport is verstreken zonder klantreactie.",
    },
    "email.portaal_klantvraag": {
      titel: "Klantvragen via portaal",
      beschrijving:
        "Notificatie wanneer een klant een vraag of wijzigingsverzoek indient via het offerteportaal.",
    },
    "email.portaal_ondertekening": {
      titel: "Offerte ondertekend",
      beschrijving:
        "Notificatie wanneer een klant een offerte ondertekent via het portaal.",
    },
    "email.portaal_afwijzing": {
      titel: "Offerte afgewezen",
      beschrijving:
        "Notificatie wanneer een klant een offerte afwijst via het portaal.",
    },
  };

// ── Enkelvoudige check ────────────────────────────────────────────────────────

/**
 * Controleert of een gebruiker e-mail wil ontvangen voor een bepaalde categorie.
 * Fail-open: geen rij of onverwacht type → true (versturen).
 * Uitgeschakeld: expliciet `false` → false (niet versturen).
 */
export async function magMailSturen(userId: number, categorie: MailCategorie): Promise<boolean> {
  try {
    const [rij] = await db
      .select({ waarde: gebruikerVoorkeurenTable.waarde })
      .from(gebruikerVoorkeurenTable)
      .where(
        and(
          eq(gebruikerVoorkeurenTable.gebruikerId, userId),
          eq(gebruikerVoorkeurenTable.sleutel, categorie),
        ),
      )
      .limit(1);

    if (!rij) return true; // geen voorkeur ingesteld → versturen
    return rij.waarde !== false;
  } catch {
    return true; // DB-fout → fail-open, versturen
  }
}

// ── Bulk-check voor meerdere gebruikers ──────────────────────────────────────

/**
 * Geeft terug welke userId's in de lijst e-mail willen ontvangen voor de categorie.
 * Fail-open per gebruiker: bij fout blijft alle gebruikers in de resultatenlijst.
 */
export async function filterMailOntvangers<T extends { id: number; email: string }>(
  gebruikers: T[],
  categorie: MailCategorie,
): Promise<T[]> {
  if (gebruikers.length === 0) return [];

  try {
    const ids = gebruikers.map((g) => g.id);

    // Haal alle opt-out rijen op voor deze categorie en deze users in één query.
    const rijen = await db
      .select({
        gebruikerId: gebruikerVoorkeurenTable.gebruikerId,
        waarde: gebruikerVoorkeurenTable.waarde,
      })
      .from(gebruikerVoorkeurenTable)
      .where(eq(gebruikerVoorkeurenTable.sleutel, categorie));

    const optUitSet = new Set(
      rijen
        .filter((r) => ids.includes(r.gebruikerId) && r.waarde === false)
        .map((r) => r.gebruikerId),
    );

    return gebruikers.filter((g) => !optUitSet.has(g.id));
  } catch {
    return gebruikers; // fail-open bij DB-fout
  }
}
