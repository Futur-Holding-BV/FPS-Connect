import {
  db,
  facturenTable,
  factuurRegelsTable,
  leveranciersTable,
  leverancierCategorisatieTable,
  opdrachtenTable,
} from "@workspace/db";
import { eq, and, ilike, desc } from "drizzle-orm";
import type { Logger } from "pino";
import { aiGateway } from "../lib/aiGateway";
import { normaliseerStorageUrl } from "../lib/storageObjectsUrl";
import { FACTUUR_UITLEZEN_PROMPT } from "../lib/aiPrompts";

export type ParsedRegel = {
  regelnummer?: number; omschrijving?: string; hoeveelheid?: number | null;
  eenheid?: string | null; stukprijs?: string | null; bedrag_excl_btw?: string | null;
  btw_code?: string | null; btw_percentage?: number | null; btw_bedrag?: string | null;
  grootboekrekening?: string | null;
};
export type ParsedFactuur = {
  factuurnummer?: string | null; factuurdatum?: string | null; vervaldatum?: string | null;
  relatienaam?: string | null; relatie_adres?: string | null; relatie_iban?: string | null;
  relatie_btwnummer?: string | null; omschrijving?: string | null;
  bedrag_excl_btw?: string | null; btw_bedrag?: string | null; bedrag_incl_btw?: string | null;
  btw_code?: string | null; type?: string; regels?: ParsedRegel[];
  controle_nodig?: boolean; controle_reden?: string | null; confidence?: number;
  werknummer?: string | null;
};

export interface UitleesSamenvatting {
  regels_gevonden: number;
  leverancier_herkend: boolean;
  leverancier_naam: string | null;
  iban_afwijking: boolean;
  g_rekening_van_toepassing: boolean;
  confidence: number | null;
  geleerde_categorisatie_toegepast: boolean;
}

export type UitleesResultaat =
  | { ok: true; factuur: typeof facturenTable.$inferSelect; samenvatting: UitleesSamenvatting }
  | { ok: false; status: number; error: string };

/**
 * Zoekt het meest gebruikte categorisatiepatroon dat mensen eerder voor deze
 * leverancier hebben bevestigd (zelflerende leverancierscategorisatie). Retourneert
 * null als er nog geen leerpatroon is.
 */
export async function haalGeleerdeCategorisatie(leverancierId: number): Promise<{
  grootboekrekening: string | null; kostenplaats: string | null;
  categorie: string | null; btwCode: string | null; aantal: number;
} | null> {
  const [top] = await db.select().from(leverancierCategorisatieTable)
    .where(eq(leverancierCategorisatieTable.leverancierId, leverancierId))
    .orderBy(desc(leverancierCategorisatieTable.aantal), desc(leverancierCategorisatieTable.laatstBevestigdOp))
    .limit(1);
  if (!top || top.aantal < 2) return null; // pas voorstellen na herhaalde bevestiging
  return {
    grootboekrekening: top.grootboekrekening,
    kostenplaats: top.kostenplaats,
    categorie: top.categorie,
    btwCode: top.btwCode,
    aantal: top.aantal,
  };
}

/**
 * Leest een reeds aangemaakte factuur (met pdfUrl / afbeelding) uit via de AI-
 * gateway, herkent de leverancier (IBAN → fuzzy naam), controleert het IBAN,
 * berekent G-rekening, neemt leverancier-presets én geleerde categorisatie over,
 * matcht op werknummer en slaat factuurregels op. Gedeeld door de handmatige
 * ai-uitlezen route en de automatische mailbox-import.
 */
export async function leesFactuurUitMetAi(factuurId: number, log: Logger): Promise<UitleesResultaat> {
  const [factuur] = await db.select().from(facturenTable).where(eq(facturenTable.id, factuurId)).limit(1);
  if (!factuur) return { ok: false, status: 404, error: "Niet gevonden" };
  if (!factuur.pdfUrl) return { ok: false, status: 422, error: "Geen PDF gekoppeld aan deze factuur" };

  const devDomain = process.env["REPLIT_DEV_DOMAIN"];
  const genormaliseerdePdfUrl = normaliseerStorageUrl(factuur.pdfUrl);
  // Alleen relatieve (interne) paden krijgen het dev-domein ervoor; een externe
  // http(s)-URL blijft ongewijzigd.
  const downloadUrl = devDomain && genormaliseerdePdfUrl.startsWith("/")
    ? `https://${devDomain}${genormaliseerdePdfUrl}`
    : genormaliseerdePdfUrl;

  try {
    await db.update(facturenTable).set({ status: "ai_gelezen", bijgewerktOp: new Date() }).where(eq(facturenTable.id, factuurId));

    const facturenChatResultaat = await aiGateway.chat("default", {
      max_tokens: 4000,
      messages: [
        { role: "system", content: FACTUUR_UITLEZEN_PROMPT.tekst },
        {
          role: "user",
          content: [
            { type: "text", text: "Lees deze factuur volledig uit inclusief alle regellijnen en het IBAN van de leverancier." },
            { type: "image_url", image_url: { url: downloadUrl, detail: "high" } },
          ],
        },
      ],
    }, undefined, {
      module: "facturen",
      functie: "leesFactuurUitMetAi",
      entiteitstype: "factuur",
      entiteitId: factuurId,
      promptNaam: FACTUUR_UITLEZEN_PROMPT.naam,
      promptVersie: FACTUUR_UITLEZEN_PROMPT.versie,
    });

    const rawText = facturenChatResultaat.ok ? facturenChatResultaat.inhoud : "{}";
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    let parsed: ParsedFactuur = {};
    if (jsonMatch) {
      try { parsed = JSON.parse(jsonMatch[0]) as ParsedFactuur; } catch { /* laat leeg */ }
    }

    // ── Leverancierherkenning: IBAN-match → naam-match (fuzzy) ────────────────
    let leverancier: typeof leveranciersTable.$inferSelect | null = null;
    const uitgelezenIban = parsed.relatie_iban?.replace(/\s/g, "") ?? null;

    if (uitgelezenIban) {
      const [gevonden] = await db.select().from(leveranciersTable)
        .where(eq(leveranciersTable.iban, uitgelezenIban)).limit(1);
      leverancier = gevonden ?? null;
    }
    if (!leverancier && parsed.relatienaam) {
      const naam = parsed.relatienaam.trim();
      const [gevonden] = await db.select().from(leveranciersTable)
        .where(ilike(leveranciersTable.naam, `%${naam}%`)).limit(1);
      leverancier = gevonden ?? null;
      if (!gevonden) {
        const [gevondenNauw] = await db.select().from(leveranciersTable)
          .where(ilike(leveranciersTable.naam, `${naam.split(" ")[0]}%`)).limit(1);
        leverancier = gevondenNauw ?? null;
      }
    }

    // ── IBAN-verificatie ──────────────────────────────────────────────────────
    const leveranciersIban = leverancier?.iban?.replace(/\s/g, "") ?? null;
    const ibanAfwijking = !!(uitgelezenIban && leveranciersIban && uitgelezenIban !== leveranciersIban);

    // ── G-rekening-signalering (voorstel, niet definitief) ────────────────────
    const gRekeningVanToepassing = leverancier?.gRekeningVanToepassing ?? false;
    let gRekeningBedrag: string | null = null;
    let normaalBedrag: string | null = null;
    const totaalInclBtw = parsed.bedrag_incl_btw ? parseFloat(parsed.bedrag_incl_btw) : null;
    if (gRekeningVanToepassing && leverancier?.gRekeningPercentage && totaalInclBtw) {
      const perc = leverancier.gRekeningPercentage / 100;
      gRekeningBedrag = (totaalInclBtw * perc).toFixed(2);
      normaalBedrag = (totaalInclBtw * (1 - perc)).toFixed(2);
    }

    // ── Presets: factuur zelf → leverancier-preset → geleerd patroon ──────────
    const geleerd = leverancier ? await haalGeleerdeCategorisatie(leverancier.id) : null;
    const grootboekPreset = factuur.grootboekrekening ?? leverancier?.grootboekrekening ?? geleerd?.grootboekrekening ?? null;
    const kostenplaatsPreset = factuur.kostenplaats ?? leverancier?.kostenplaats ?? geleerd?.kostenplaats ?? null;
    const btwCodePreset = parsed.btw_code ?? factuur.btwCode ?? leverancier?.btwCodeDefault ?? geleerd?.btwCode ?? null;
    const categoriePreset = factuur.categorie ?? leverancier?.factuurCategorie ?? geleerd?.categorie ?? null;
    const geleerdToegepast = !!geleerd && (
      (!!geleerd.grootboekrekening && grootboekPreset === geleerd.grootboekrekening && !factuur.grootboekrekening && !leverancier?.grootboekrekening) ||
      (!!geleerd.categorie && categoriePreset === geleerd.categorie && !factuur.categorie && !leverancier?.factuurCategorie)
    );

    // ── Werknummer → opdracht-koppeling ───────────────────────────────────────
    let opdrachtId: number | null = factuur.opdrachtId ?? null;
    if (!opdrachtId && parsed.werknummer) {
      const [gevondenOpdracht] = await db.select({ id: opdrachtenTable.id }).from(opdrachtenTable)
        .where(ilike(opdrachtenTable.werknummer, `%${parsed.werknummer}%`)).limit(1);
      if (gevondenOpdracht) opdrachtId = gevondenOpdracht.id;
    }

    // ── Factuurregels opslaan ─────────────────────────────────────────────────
    const regels = Array.isArray(parsed.regels) ? parsed.regels : [];
    if (regels.length > 0) {
      await db.delete(factuurRegelsTable).where(
        and(eq(factuurRegelsTable.factuurId, factuurId), eq(factuurRegelsTable.bron, "ai")),
      );
      for (let i = 0; i < regels.length; i++) {
        const r = regels[i]!;
        await db.insert(factuurRegelsTable).values({
          factuurId,
          regelnummer: r.regelnummer ?? i + 1,
          omschrijving: r.omschrijving?.trim() || `Regel ${i + 1}`,
          hoeveelheid: r.hoeveelheid ?? null,
          eenheid: r.eenheid ?? null,
          stukprijs: r.stukprijs ?? null,
          bedragExclBtw: r.bedrag_excl_btw ?? null,
          btwCode: r.btw_code ?? null,
          btwPercentage: r.btw_percentage ?? null,
          btwBedrag: r.btw_bedrag ?? null,
          grootboekrekening: r.grootboekrekening ?? null,
          bron: "ai",
          aiVertrouwen: parsed.confidence ?? null,
        });
      }
    }

    // ── Auto-akkoord + status ─────────────────────────────────────────────────
    const bedragCents = parsed.bedrag_incl_btw ? Math.round(parseFloat(String(parsed.bedrag_incl_btw)) * 100) : null;
    const autoAkkoord =
      !parsed.controle_nodig && !ibanAfwijking &&
      leverancier?.autoAkkoordDrempelCents != null && bedragCents != null &&
      bedragCents <= leverancier.autoAkkoordDrempelCents;
    const nieuweStatus = parsed.controle_nodig || ibanAfwijking
      ? "controle_nodig"
      : autoAkkoord ? "klaar_voor_boeking" : "te_beoordelen_pl";

    const [updated] = await db.update(facturenTable).set({
      aiMetadata: parsed as Record<string, unknown>,
      factuurnummer: parsed.factuurnummer ?? factuur.factuurnummer ?? null,
      factuurdatum: parsed.factuurdatum ?? factuur.factuurdatum ?? null,
      vervaldatum: parsed.vervaldatum ?? factuur.vervaldatum ?? null,
      relatienaam: parsed.relatienaam ?? factuur.relatienaam ?? null,
      relatieAdres: parsed.relatie_adres ?? factuur.relatieAdres ?? null,
      omschrijving: parsed.omschrijving ?? factuur.omschrijving ?? null,
      bedragExclBtw: parsed.bedrag_excl_btw ?? factuur.bedragExclBtw ?? null,
      btwBedrag: parsed.btw_bedrag ?? factuur.btwBedrag ?? null,
      bedragInclBtw: parsed.bedrag_incl_btw ?? factuur.bedragInclBtw ?? null,
      btwCode: btwCodePreset,
      grootboekrekening: grootboekPreset,
      kostenplaats: kostenplaatsPreset,
      categorie: categoriePreset,
      leverancierId: leverancier?.id ?? factuur.leverancierId ?? null,
      ibanUitgelezen: uitgelezenIban ?? factuur.ibanUitgelezen ?? null,
      ibanAfwijking,
      gRekeningVanToepassing,
      gRekeningBedrag: gRekeningBedrag ?? factuur.gRekeningBedrag ?? null,
      normaalBedrag: normaalBedrag ?? factuur.normaalBedrag ?? null,
      opdrachtId,
      projectCode: factuur.projectCode ?? parsed.werknummer ?? null,
      aiGelezen: true,
      aiVertrouwen: parsed.confidence ?? null,
      status: nieuweStatus,
      bijgewerktOp: new Date(),
    }).where(eq(facturenTable.id, factuurId)).returning();

    // PRIJS_01 §6 — toets de zojuist ingelezen regels tegen de prijsafspraken en
    // cache de uitkomst. Geen request-actor in deze AI-stroom, dus geen
    // goedkeuringsaanvraag hier; die volgt bij de (gebruikersgestuurde)
    // inkoper-bevestiging. Nooit ophouden op een falende toets.
    try {
      const { controleerFactuurRegels } = await import("./factuurPrijscontrole");
      await controleerFactuurRegels(factuurId, null);
    } catch (err) {
      log.error(err);
    }

    return {
      ok: true,
      factuur: updated,
      samenvatting: {
        regels_gevonden: regels.length,
        leverancier_herkend: !!leverancier,
        leverancier_naam: leverancier?.naam ?? null,
        iban_afwijking: ibanAfwijking,
        g_rekening_van_toepassing: gRekeningVanToepassing,
        confidence: parsed.confidence ?? null,
        geleerde_categorisatie_toegepast: geleerdToegepast,
      },
    };
  } catch (err) {
    log.error(err);
    await db.update(facturenTable).set({ status: "controle_nodig", bijgewerktOp: new Date() }).where(eq(facturenTable.id, factuurId));
    return { ok: false, status: 500, error: "AI-uitlezing mislukt" };
  }
}
