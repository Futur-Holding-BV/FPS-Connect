// Gedeelde kernlogica voor het aanmaken van een gebruiker: hashing, normalisatie
// en de insert zelf. Wordt aangeroepen vanuit POST /gebruikers (beheerder) en
// vanuit de eerste-installatie bootstrap (POST /installatie). Bevat bewust GEEN
// autorisatie-, zelf-escalatie- of uitnodigingslogica — die blijft in de
// aanroepende routes, zodat dit bestand voor beide contexten herbruikbaar is.
import bcrypt from "bcryptjs";
import { db, gebruikersTable } from "@workspace/db";

// Elke uitvoerder die dezelfde insert-interface heeft als `db` — dus zowel de
// gewone `db` als een `tx` binnen `db.transaction(...)`.
type Uitvoerder = Pick<typeof db, "insert">;

export interface GebruikerAanmakenInput {
  naam: string;
  email: string;
  rol: string;
  wachtwoord?: string | null;
  functietitels?: string[];
  telefoon?: string | null;
  bedrijf?: string | null;
  avatarUrl?: string | null;
  bedrijfslogoUrl?: string | null;
  bedrijfskleuren?: string | null;
  taal?: string;
  bevoegdheden?: Record<string, number>;
  herkomstProfielId?: number | null;
  herkomstAutomatisch?: boolean;
  uitnodigingStatus?: string;
  dienstverband?: string;
  bedrijfUitzendbureau?: string | null;
  uitzendbureauId?: number | null;
}

// Postgres unique-violation (23505) op het e-mailadres — dezelfde detectie die
// voorheen inline in de routes stond.
export function isEmailConflictFout(err: unknown): boolean {
  const e = err as { cause?: { code?: string }; message?: string } | null | undefined;
  return e?.cause?.code === "23505" || Boolean(e?.message?.includes("gebruikers_email_unique"));
}

export async function maakGebruikerAan(
  uitvoerder: Uitvoerder,
  input: GebruikerAanmakenInput,
) {
  const gehasht = input.wachtwoord ? await bcrypt.hash(String(input.wachtwoord), 10) : null;
  const [gebruiker] = await uitvoerder
    .insert(gebruikersTable)
    .values({
      naam: input.naam,
      email: String(input.email).trim().toLowerCase(),
      rol: input.rol,
      functietitels: input.functietitels ?? [],
      telefoon: input.telefoon ?? null,
      bedrijf: input.bedrijf ?? null,
      wachtwoord: gehasht,
      avatarUrl: input.avatarUrl ?? null,
      bedrijfslogoUrl: input.bedrijfslogoUrl ?? null,
      bedrijfskleuren: input.bedrijfskleuren ?? null,
      taal: input.taal || "nl",
      bevoegdheden: input.bevoegdheden ?? {},
      herkomstProfielId: input.herkomstProfielId ?? null,
      herkomstAutomatisch: input.herkomstAutomatisch ?? false,
      uitnodigingStatus: input.uitnodigingStatus ?? "niet_uitgenodigd",
      dienstverband: input.dienstverband || "intern",
      bedrijfUitzendbureau: input.bedrijfUitzendbureau ?? null,
      uitzendbureauId: input.uitzendbureauId ?? null,
    })
    .returning();
  return gebruiker;
}
