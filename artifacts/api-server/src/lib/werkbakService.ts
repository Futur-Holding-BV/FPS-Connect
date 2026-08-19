// WERKBAK_01 — centrale schrijf-/reconciliatiehelper voor de werkbak.
// Eén open item per dedup-sleutel (partiële unieke index, DB-afgedwongen).
// Items verdwijnen nooit vanzelf: alleen afhandelen of bewust wegzetten.
// Bron-reconciliatie: als de bron zelf is opgelost (bijv. verlofaanvraag in de
// HRM-module goedgekeurd) wordt het werkbak-item afgehandeld gemarkeerd —
// dat is afhandeling met herleidbare oorzaak, geen uitdoven.
import { db, werkbakItemsTable } from "@workspace/db";
import { and, eq, inArray, notInArray } from "drizzle-orm";

export type WerkbakSoort = "doen" | "weten";

export type WerkbakInvoer = {
  soort: WerkbakSoort;
  bron: string;
  titel: string;
  omschrijving?: string | null;
  gebruikerId?: number | null;
  vereisteModule?: string | null;
  vereistNiveau?: number | null;
  alleenHoofdbeheerder?: boolean;
  gewicht?: number;
  actiePad?: string | null;
  actieType?: string | null;
  herkomstType: string;
  herkomstId?: number | null;
  dedupSleutel: string;
  // WERKBAK_02 — alleen voor bron "eigen": verplichte einddatum, meewerkers
  // (bijwerken maar niet afronden) en de koppeling aan het overleg.
  deadline?: string | null;
  meewerkerIds?: number[];
  overlegId?: number | null;
};

// Vaste bronnenlijst (§5 WERKBAK_01). Niets erin buiten deze lijst om —
// uitbreiden is een besluit, geen module die zichzelf toevoegt.
export const WERKBAK_BRONNEN = [
  "goedkeuringsaanvraag",
  "verlofaanvraag",
  "factuur_goedkeuring",
  "betaalbatch",
  "conceptantwoord",
  "mail_antwoord",
  "contractbesluit",
  "poortwachter",
  "verloopdatum",
  "verlofverjaring",
  "factuursignaal",
  "contract_verlenging",
  "bewakingsloop",
  // ADMINISTRATIE_01: BV zonder rekeningschema = boekingspoort staat open.
  "rekeningschema_open",
  // WAGENPARK_01 §6.1: garagemail die niet verstuurd kon worden mag nooit stil blijven.
  "wagenpark_garagemail",
  // LEVERANCIER_01 §3.3: inkoopfactuur zonder koppeling aan het leveranciersregister.
  "factuur_zonder_leverancier",
  // FINANCIEEL_KETEN_01: toestanden die op een mens wachten mogen niet in een
  // submenu blijven hangen — geblokkeerd geld, mislukte exports, verlopen
  // verkoopfacturen en afgesloten projecten met open OHW komen naar de werkbak.
  "factuur_geblokkeerd",
  "factuur_exportfout",
  "verkoopfactuur_vervallen",
  "ohw_signaal",
  // BOUW_01 §4: meer-/minderwerkmelding vanaf de bouwplaats → werkvoorbereider (doen) + vaste cc projectleider (weten).
  "meerwerk_melding",
  // BOUW_01 §5: materiaalaanvraag "wijkt af" of "weet ik niet" → eerst de werkvoorbereider.
  "materiaal_afwijking",
  // BOUW_01 §6: toebehoren-aanvraag (verbruik, kostenrubriek gereedschap-toebehoren) → werkvoorbereider.
  "toebehoren_aanvraag",
  // UREN_01 §4.3: monteur vraagt toestemming voor overwerk → projectleider + René.
  "overwerk_toestemming",
  // UREN_01 §6: wekelijkse volledigheidscontrole — eerst de medewerker, dan HRM.
  "weekstaat_onvolledig",
  // UREN_01 §6.3: meer dan norm+2 zonder open slot → HRM en René.
  "weekstaat_overwerk_overtreding",
  // UREN_01 §5: tijd-voor-tijd staat langer dan een maand open (herinnering, geen verval).
  "tvt_opname_herinnering",
  // UREN_01 §6b: urenregel "staat niet in de begroting" → signaal aan werkvoorbereider (cc projectleider).
  "uren_niet_in_begroting",
  // WERKBAK_02 §4: door een mens aangemaakte taak — altijd één eigenaar + datum.
  "eigen",
  // WERKBAK_02 §3.1: spot met een openstaande status, ouder dan de drempel → uitvoerder + werkvoorbereider.
  "voorziening_openstaand",
  // WERKBAK_02 §3.2: actieve regie-opdracht met niet-gefactureerde regels → werkvoorbereider.
  "regie_openstaand",
  // AI_01 §3.1: calculatieregel wijkt ≥30% af van de eigen historische mediaan → calculator.
  "ai_calculatie_afwijking",
  // AI_01 §3.2: inkoopfactuurregel wijkt ≥30% af van de verwachte prijs → werkvoorbereider.
  "ai_inkoop_afwijking",
  // AI_01 §3.3: artikel onder minimumvoorraad → magazijn (bestelsuggestie).
  "ai_magazijn_bestelsuggestie",
  // AI_01 §3.4: functie waarvan alle medewerkers tegelijk afwezig zijn → HRM (bezetting).
  "ai_hrm_capaciteit",
  // AI_01 §3.5: actieve opdracht met materiaalregels zonder leverancier/inkoopkoppeling → werkvoorbereider.
  "ai_werkvoorbereiding_signaal",
  // PRIJS_01 §7: prijsafspraak (jaarprijs) loopt binnenkort af → financieel (doen),
  // en leverancier met uitsluitend verlopen afspraken maar recente facturen → financieel (weten).
  "prijsafspraak_verloopt",
  "leverancier_afspraak_verlopen",
  // PRIJS_01 §8.2: bij het inladen van een nieuwe prijslijst werden artikelen
  // duurder → 'weten'-item dat naar de marktspiegel verwijst (geen automatische run).
  "prijsverhoging_import",
  // BEWAKING_02 §6: zes voeders op de commerciële keten.
  "offerte_geen_reactie",           // V1 — verzonden, geen reactie na drempel (doen)
  "offerte_bekeken_niet_getekend",  // V2 — klant opende portaal, tekende niet (doen)
  "offerte_verlopen",               // V3 — geldigheid verstreken zonder eindstatus (weten)
  "opname_zonder_calculatie",       // V4 — opname zonder gekoppelde calculatie (doen)
  "calculatie_zonder_offerte",      // V5 — definitieve calculatie zonder offerte (weten)
  "opdracht_zonder_akkoord",        // V6 — actieve opdracht zonder akkoordgrond (weten)
  // SOCIAL_01 deel C: bericht kon niet (volledig) automatisch geplaatst worden —
  // concept klaargezet of mislukt → taak voor de planner, nooit stilzwijgend.
  "social_publicatie",
  // SOCIAL_01 deel E: kanaal-toegang verloopt binnenkort en kan niet automatisch
  // vernieuwd worden → taak ruim vóór het verlopen, geen storing achteraf.
  "social_koppeling_verloopt",
  // HRM_01 §2.3: uiterste aanzegdatum (Wet Aanzegging) of ZZP/Wet DBA-deadline
  // nadert binnen 30 dagen (of DBA-duurgrens bereikt) → HRM-beheerder (doen).
  "cruciale_deadlines_hrm",
  // UITROL_BEWAKING_01: productie draait een andere commit dan de laatst
  // gemelde uitrol verwachtte → actiepunt voor de hoofdbeheerder, mét de
  // falende stap erbij. Sluit zichzelf zodra een volgende uitrol slaagt.
  "uitrol_achterloop",
  // CI_SIGNAAL_01 — bouwcontrole (Typecheck & build) op main is rood.
  "ci_rood",
] as const;

export async function meldWerkbakItem(invoer: WerkbakInvoer): Promise<boolean> {
  if (!(WERKBAK_BRONNEN as readonly string[]).includes(invoer.bron)) {
    throw new Error(`Onbekende werkbak-bron: ${invoer.bron} — uitbreiden vereist een besluit (WERKBAK_01 §5)`);
  }
  const rijen = await db
    .insert(werkbakItemsTable)
    .values({
      soort: invoer.soort,
      bron: invoer.bron,
      titel: invoer.titel,
      omschrijving: invoer.omschrijving ?? null,
      gebruikerId: invoer.gebruikerId ?? null,
      vereisteModule: invoer.vereisteModule ?? null,
      vereistNiveau: invoer.vereistNiveau ?? null,
      alleenHoofdbeheerder: invoer.alleenHoofdbeheerder ?? false,
      gewicht: invoer.gewicht ?? 0,
      actiePad: invoer.actiePad ?? null,
      actieType: invoer.actieType ?? null,
      herkomstType: invoer.herkomstType,
      herkomstId: invoer.herkomstId ?? null,
      dedupSleutel: invoer.dedupSleutel,
      deadline: invoer.deadline ?? null,
      meewerkerIds: invoer.meewerkerIds ?? [],
      overlegId: invoer.overlegId ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: werkbakItemsTable.id });
  return rijen.length > 0;
}

// Bron opgelost → open item(s) met deze sleutel afgehandeld markeren (systeem).
export async function handelBronAf(dedupSleutel: string): Promise<void> {
  await db
    .update(werkbakItemsTable)
    .set({ status: "afgehandeld", afgehandeldOp: new Date(), bijgewerktOp: new Date() })
    .where(and(eq(werkbakItemsTable.dedupSleutel, dedupSleutel), eq(werkbakItemsTable.status, "open")));
}

// MATERIAAL_01 fase 1: bron-afhandeling op herkomst (type + id). Sluit alle
// open items die uit dezelfde bronentiteit voortkwamen, ongeacht dedup-sleutel
// (materiaal-afwijking én toebehoren delen herkomstType "materiaal_aanvraag").
// Systeemafhandeling: geen afgehandeldDoorId, net als handelBronAf.
export async function handelHerkomstAf(
  herkomstType: string,
  herkomstId: number,
  uitvoerder: Pick<typeof db, "update"> = db,
): Promise<number> {
  const rijen = await uitvoerder
    .update(werkbakItemsTable)
    .set({ status: "afgehandeld", afgehandeldOp: new Date(), bijgewerktOp: new Date() })
    .where(and(
      eq(werkbakItemsTable.herkomstType, herkomstType),
      eq(werkbakItemsTable.herkomstId, herkomstId),
      eq(werkbakItemsTable.status, "open"),
    ))
    .returning({ id: werkbakItemsTable.id });
  return rijen.length;
}

// Set-based variant voor herstelrondes: sluit in één keer alle open items van
// meerdere herkomst-id's. Zelfde semantiek als handelHerkomstAf (alleen status
// 'open', systeemafhandeling zonder afgehandeldDoorId); idempotent.
export async function handelHerkomstenAf(herkomstType: string, herkomstIds: number[]): Promise<number> {
  if (herkomstIds.length === 0) return 0;
  const rijen = await db
    .update(werkbakItemsTable)
    .set({ status: "afgehandeld", afgehandeldOp: new Date(), bijgewerktOp: new Date() })
    .where(and(
      eq(werkbakItemsTable.herkomstType, herkomstType),
      inArray(werkbakItemsTable.herkomstId, herkomstIds),
      eq(werkbakItemsTable.status, "open"),
    ))
    .returning({ id: werkbakItemsTable.id });
  return rijen.length;
}

// Reconciliatie per bron: alles wat open staat in de werkbak maar waarvan de
// bron niet meer in de actuele open-set zit, wordt afgehandeld gemarkeerd.
export async function reconcilieerBron(bron: string, actueleSleutels: string[]): Promise<number> {
  const voorwaarden = [eq(werkbakItemsTable.bron, bron), eq(werkbakItemsTable.status, "open")];
  const stale = actueleSleutels.length > 0
    ? and(...voorwaarden, notInArray(werkbakItemsTable.dedupSleutel, actueleSleutels))
    : and(...voorwaarden);
  const rijen = await db
    .update(werkbakItemsTable)
    .set({ status: "afgehandeld", afgehandeldOp: new Date(), bijgewerktOp: new Date() })
    .where(stale)
    .returning({ id: werkbakItemsTable.id });
  return rijen.length;
}

// Sync-helper: zet de volledige actuele open-set voor een bron (aanmaken wat
// nieuw is, afhandelen wat verdwenen is). Idempotent.
export async function syncBron(bron: string, items: WerkbakInvoer[]): Promise<{ nieuw: number; afgehandeld: number }> {
  for (const item of items) {
    if (!(WERKBAK_BRONNEN as readonly string[]).includes(item.bron)) {
      throw new Error(`Onbekende werkbak-bron: ${item.bron} — uitbreiden vereist een besluit (WERKBAK_01 §5)`);
    }
  }
  // Transactioneel: aanmaken en reconciliëren als één geheel, zodat een
  // overlappende draai nooit een zojuist aangemaakte set als stale afsluit.
  return db.transaction(async (tx) => {
    let nieuw = 0;
    for (const item of items) {
      const rijen = await tx
        .insert(werkbakItemsTable)
        .values({
          soort: item.soort,
          bron: item.bron,
          titel: item.titel,
          omschrijving: item.omschrijving ?? null,
          gebruikerId: item.gebruikerId ?? null,
          vereisteModule: item.vereisteModule ?? null,
          vereistNiveau: item.vereistNiveau ?? null,
          alleenHoofdbeheerder: item.alleenHoofdbeheerder ?? false,
          gewicht: item.gewicht ?? 0,
          actiePad: item.actiePad ?? null,
          actieType: item.actieType ?? null,
          herkomstType: item.herkomstType,
          herkomstId: item.herkomstId ?? null,
          dedupSleutel: item.dedupSleutel,
        })
        .onConflictDoNothing()
        .returning({ id: werkbakItemsTable.id });
      if (rijen.length > 0) nieuw += 1;
    }
    const actueleSleutels = items.map((i) => i.dedupSleutel);
    const voorwaarden = [eq(werkbakItemsTable.bron, bron), eq(werkbakItemsTable.status, "open")];
    const stale = actueleSleutels.length > 0
      ? and(...voorwaarden, notInArray(werkbakItemsTable.dedupSleutel, actueleSleutels))
      : and(...voorwaarden);
    const afgehandeldRijen = await tx
      .update(werkbakItemsTable)
      .set({ status: "afgehandeld", afgehandeldOp: new Date(), bijgewerktOp: new Date() })
      .where(stale)
      .returning({ id: werkbakItemsTable.id });
    return { nieuw, afgehandeld: afgehandeldRijen.length };
  });
}

export async function haalOpenItems(ids: number[]) {
  if (ids.length === 0) return [];
  return db.select().from(werkbakItemsTable)
    .where(and(inArray(werkbakItemsTable.id, ids), eq(werkbakItemsTable.status, "open")));
}
