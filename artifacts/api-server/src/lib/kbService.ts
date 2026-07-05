import { db } from "@workspace/db";
import { and, avg, count, desc, eq, inArray } from "drizzle-orm";
import {
  leveranciersTable,
  artikelenTable,
  fpsBedrijfsstandaardenTable,
  leverancierPrestatiesdTable,
  opdrachtgeverVoorkeurenTable,
} from "@workspace/db/schema";

export interface KbContextOpties {
  klantId?: number;
  categorieen?: string[];
  alleenGoedgekeurdeArtikelen?: boolean;
}

/**
 * Assembleert KB-context als Markdown-blok voor prompt-injection.
 * Geen AI-aanroepen — puur dataverzameling.
 */
export async function assembleKbContext(opties: KbContextOpties = {}): Promise<string> {
  const { klantId, categorieen, alleenGoedgekeurdeArtikelen = false } = opties;

  const blokken: string[] = [];

  // ── 1. Bedrijfsstandaarden ────────────────────────────────────────────────
  const standaarden = await db
    .select()
    .from(fpsBedrijfsstandaardenTable)
    .where(
      categorieen && categorieen.length > 0
        ? and(
            eq(fpsBedrijfsstandaardenTable.actief, true),
            inArray(fpsBedrijfsstandaardenTable.categorie, categorieen),
          )
        : eq(fpsBedrijfsstandaardenTable.actief, true),
    )
    .orderBy(fpsBedrijfsstandaardenTable.categorie);

  if (standaarden.length > 0) {
    const secties = standaarden
      .map((s) => `### ${s.titel}\n_Categorie: ${s.categorie} | Sleutel: ${s.sleutel}_\n\n${s.inhoud}`)
      .join("\n\n---\n\n");
    blokken.push(`## FPS Bedrijfsstandaarden\n\n${secties}`);
  }

  // ── 2. Voorkeursleveranciers (actief, KB-velden) ──────────────────────────
  const leveranciers = await db
    .select({
      id: leveranciersTable.id,
      naam: leveranciersTable.naam,
      categorie: leveranciersTable.categorie,
      levertijdDagen: leveranciersTable.levertijdDagen,
      leveringsgebied: leveranciersTable.leveringsgebied,
      heeftRaamovereenkomst: leveranciersTable.heeftRaamovereenkomst,
      geschiktVoorSpoed: leveranciersTable.geschiktVoorSpoed,
      prijsniveau: leveranciersTable.prijsniveau,
      certificeringen: leveranciersTable.certificeringen,
      kbNotities: leveranciersTable.kbNotities,
    })
    .from(leveranciersTable)
    .where(eq(leveranciersTable.actief, true))
    .orderBy(leveranciersTable.naam)
    .limit(20);

  if (leveranciers.length > 0) {
    const levRegels = await Promise.all(
      leveranciers.map(async (lev) => {
        const [prestatieGem] = await db
          .select({
            gemKwaliteit: avg(leverancierPrestatiesdTable.kwaliteitScore),
            aantalMetingen: count(leverancierPrestatiesdTable.id),
          })
          .from(leverancierPrestatiesdTable)
          .where(eq(leverancierPrestatiesdTable.leverancierId, lev.id));

        const score =
          prestatieGem?.aantalMetingen && Number(prestatieGem.aantalMetingen) > 0
            ? ` | Score: ${Number(prestatieGem.gemKwaliteit ?? 0).toFixed(1)}/5 (${prestatieGem.aantalMetingen} metingen)`
            : "";

        const attrs: string[] = [];
        if (lev.levertijdDagen) attrs.push(`levertijd ${lev.levertijdDagen} d`);
        if (lev.heeftRaamovereenkomst) attrs.push("raamovereenkomst");
        if (lev.geschiktVoorSpoed) attrs.push("spoed mogelijk");
        if (lev.prijsniveau) attrs.push(`prijs: ${lev.prijsniveau}`);
        if (lev.certificeringen?.length) attrs.push(`cert: ${lev.certificeringen.join(", ")}`);

        const attrStr = attrs.length > 0 ? ` (${attrs.join("; ")})` : "";
        const notitie = lev.kbNotities ? `\n  > ${lev.kbNotities}` : "";

        return `- **${lev.naam}**${score}${attrStr}${notitie}`;
      }),
    );

    blokken.push(`## Actieve Leveranciers\n\n${levRegels.join("\n")}`);
  }

  // ── 3. Artikelencatalogus ─────────────────────────────────────────────────
  const artikelenWhere = alleenGoedgekeurdeArtikelen
    ? and(eq(artikelenTable.actief, true), eq(artikelenTable.goedgekeurdDoorFps, true))
    : eq(artikelenTable.actief, true);

  const artikelen = await db
    .select({
      id: artikelenTable.id,
      naam: artikelenTable.naam,
      code: artikelenTable.code,
      categorie: artikelenTable.categorie,
      toepassingsgebied: artikelenTable.toepassingsgebied,
      certificeringen: artikelenTable.certificeringen,
      goedgekeurdDoorFps: artikelenTable.goedgekeurdDoorFps,
      kbNotities: artikelenTable.kbNotities,
    })
    .from(artikelenTable)
    .where(artikelenWhere)
    .orderBy(desc(artikelenTable.goedgekeurdDoorFps), artikelenTable.naam)
    .limit(50);

  if (artikelen.length > 0) {
    const artRegels = artikelen
      .map((a) => {
        const goedgekeurd = a.goedgekeurdDoorFps ? " [FPS-goedgekeurd]" : "";
        const cert = a.certificeringen?.length ? ` | cert: ${a.certificeringen.join(", ")}` : "";
        const toepassing = a.toepassingsgebied ? ` | ${a.toepassingsgebied}` : "";
        const notitie = a.kbNotities ? `\n  > ${a.kbNotities}` : "";
        return `- **${a.naam}**${goedgekeurd} (${a.code ?? "—"}${toepassing}${cert})${notitie}`;
      })
      .join("\n");

    const titel = alleenGoedgekeurdeArtikelen
      ? "## FPS-Goedgekeurde Artikelen"
      : "## Artikelencatalogus (actief)";
    blokken.push(`${titel}\n\n${artRegels}`);
  }

  // ── 4. Opdrachtgever-voorkeuren (optioneel) ───────────────────────────────
  if (klantId) {
    const [voorkeur] = await db
      .select()
      .from(opdrachtgeverVoorkeurenTable)
      .where(eq(opdrachtgeverVoorkeurenTable.klantId, klantId));

    if (voorkeur) {
      const regels: string[] = [];
      if (voorkeur.rapportageEisen) regels.push(`**Rapportage-eisen:** ${voorkeur.rapportageEisen}`);
      if (voorkeur.documentvereisten) regels.push(`**Documentvereisten:** ${voorkeur.documentvereisten}`);
      if (voorkeur.uitvoeringsdetails) regels.push(`**Uitvoeringsdetails:** ${voorkeur.uitvoeringsdetails}`);
      if (voorkeur.keuringsvoorschriften) regels.push(`**Keuringsvoorschriften:** ${voorkeur.keuringsvoorschriften}`);
      if (voorkeur.onderhoudsafspraken) regels.push(`**Onderhoudsafspraken:** ${voorkeur.onderhoudsafspraken}`);
      if (voorkeur.kbNotities) regels.push(`**Interne notitie:** ${voorkeur.kbNotities}`);
      if (voorkeur.verplichtArtikelIds?.length) {
        regels.push(`**Verplichte artikelen (IDs):** ${voorkeur.verplichtArtikelIds.join(", ")}`);
      }
      if (voorkeur.verbodenArtikelIds?.length) {
        regels.push(`**Verboden artikelen (IDs):** ${voorkeur.verbodenArtikelIds.join(", ")}`);
      }

      if (regels.length > 0) {
        blokken.push(`## Opdrachtgever-voorkeuren (klant #${klantId})\n\n${regels.join("\n")}`);
      }
    }
  }

  if (blokken.length === 0) {
    return "";
  }

  return [
    "# FPS Knowledge Base Context",
    "_Gebruik deze context als aanvulling op de projectgebonden AI-context._",
    "",
    ...blokken,
  ].join("\n\n");
}

/**
 * @deprecated Gebruik assembleKbContext() direct. Stub voor achterwaartse compatibiliteit.
 */
export const kbService = {
  async assembleKbContext(opties?: KbContextOpties): Promise<string | null> {
    const result = await assembleKbContext(opties ?? {});
    return result || null;
  },
};
