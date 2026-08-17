// SOCIAL_01 — publicatieplanner (deel C) en verloopbewaking (deel E).
//
// Publicatieplanner: elke minuut worden geplande berichten waarvan het moment
// is aangebroken per kanaal afgehandeld. Claim gebeurt atomair (UPDATE ...
// WHERE plaatsing_status='wachtend') zodat een dubbele planner-tick nooit
// dubbel plaatst. Mag het kanaal rechtstreeks publiceren, dan publiceert
// Connect; mag dat niet (modus 'klaarzetten', geen koppeling, of API-fout),
// dan wordt het bericht als concept klaargezet wanneer dat kan en komt er
// ALTIJD een werkbak-taak voor degene die het bericht plande. Tijdelijke
// storingen worden eerst opnieuw geprobeerd (max 3 pogingen) vóór het een
// taak wordt. Nooit een bericht dat stilzwijgend niet geplaatst is.
import { db, socialBerichtenTable, socialBerichtKanalenTable, socialKoppelingenTable, werkgeversTable } from "@workspace/db";
import type { SocialKanaal } from "@workspace/db";
import { and, eq, lte, sql, isNotNull, gte, inArray } from "drizzle-orm";
import { kanaalAdapter, KANAAL_EISEN } from "../lib/socialKanalen";
import { meldWerkbakItem } from "../lib/werkbakService";

const MAX_POGINGEN = 3;

// ── Daglimiet (Instagram 25/dag per account) — gebruikt bij plannen én plaatsen ──
export async function telBerichtenOpDag(werkgeverId: number, kanaal: SocialKanaal, moment: Date, uitgezonderdBerichtId?: number): Promise<number> {
  const dagStart = new Date(moment); dagStart.setHours(0, 0, 0, 0);
  const dagEind = new Date(dagStart); dagEind.setDate(dagEind.getDate() + 1);
  const rijen = await db
    .select({ id: socialBerichtKanalenTable.id })
    .from(socialBerichtKanalenTable)
    .innerJoin(socialBerichtenTable, eq(socialBerichtKanalenTable.berichtId, socialBerichtenTable.id))
    .where(and(
      eq(socialBerichtenTable.werkgeverId, werkgeverId),
      eq(socialBerichtKanalenTable.kanaal, kanaal),
      inArray(socialBerichtenTable.status, ["gepland", "geplaatst"]),
      isNotNull(socialBerichtenTable.geplandOp),
      gte(socialBerichtenTable.geplandOp, dagStart),
      lte(socialBerichtenTable.geplandOp, dagEind),
      ...(uitgezonderdBerichtId ? [sql`${socialBerichtenTable.id} <> ${uitgezonderdBerichtId}`] : []),
    ));
  return rijen.length;
}

async function maakPublicatieTaak(opties: {
  berichtId: number; kanaalRijId: number; kanaal: SocialKanaal;
  plannerId: number | null; werkgeverNaam: string; uitkomst: "concept" | "mislukt"; reden: string;
}): Promise<void> {
  await meldWerkbakItem({
    soort: "doen",
    bron: "social_publicatie",
    titel: opties.uitkomst === "concept"
      ? `Social bericht afmaken op ${KANAAL_EISEN[opties.kanaal].naam} (${opties.werkgeverNaam})`
      : `Social bericht kon niet geplaatst worden op ${KANAAL_EISEN[opties.kanaal].naam} (${opties.werkgeverNaam})`,
    omschrijving: opties.uitkomst === "concept"
      ? `Connect heeft het bericht klaargezet als concept op het account. Maak het af in de app van het kanaal. Reden: ${opties.reden}`
      : `Plaatsen is na ${MAX_POGINGEN} pogingen niet gelukt. Plaats het bericht handmatig. Reden: ${opties.reden}`,
    gebruikerId: opties.plannerId ?? undefined,
    vereisteModule: opties.plannerId ? undefined : "crm",
    vereistNiveau: opties.plannerId ? undefined : 4,
    actiePad: `/crm/social?bericht=${opties.berichtId}`,
    actieType: "navigeren",
    herkomstType: "social_bericht_kanaal",
    herkomstId: opties.kanaalRijId,
    dedupSleutel: `social_publicatie:${opties.kanaalRijId}`,
  });
  await db.update(socialBerichtKanalenTable)
    .set({ taakGemaakt: true, bijgewerktOp: new Date() })
    .where(eq(socialBerichtKanalenTable.id, opties.kanaalRijId));
}

// Lease-duur: een kanaalrij die langer dan dit op 'bezig' staat is van een
// gecrashte/vastgelopen tick en wordt teruggezet naar 'wachtend'.
const LEASE_MINUTEN = 10;

/** Crash-herstel: verlopen leases terug naar wachtend. */
async function herstelVerlopenLeases(nu: Date): Promise<void> {
  const grens = new Date(nu.getTime() - LEASE_MINUTEN * 60_000);
  await db.update(socialBerichtKanalenTable)
    .set({ plaatsingStatus: "wachtend", bijgewerktOp: nu })
    .where(and(
      eq(socialBerichtKanalenTable.plaatsingStatus, "bezig"),
      lte(socialBerichtKanalenTable.laatstePogingOp, grens),
    ));
}

/**
 * Crash-herstel voor de invariant "nooit stilzwijgend niet geplaatst": een
 * terminale kanaalrij (mislukt/concept_klaargezet) zonder werkbak-taak krijgt
 * er alsnog één. Dekt een crash tussen status-write en taak-aanmaak.
 */
async function reconcileerOntbrekendeTaken(): Promise<void> {
  const rijen = await db
    .select({ kanaalRij: socialBerichtKanalenTable, bericht: socialBerichtenTable, werkgeverNaam: werkgeversTable.naam })
    .from(socialBerichtKanalenTable)
    .innerJoin(socialBerichtenTable, eq(socialBerichtKanalenTable.berichtId, socialBerichtenTable.id))
    .innerJoin(werkgeversTable, eq(socialBerichtenTable.werkgeverId, werkgeversTable.id))
    .where(and(
      inArray(socialBerichtKanalenTable.plaatsingStatus, ["mislukt", "concept_klaargezet"]),
      eq(socialBerichtKanalenTable.taakGemaakt, false),
    ));
  for (const { kanaalRij, bericht, werkgeverNaam } of rijen) {
    await maakPublicatieTaak({
      berichtId: bericht.id, kanaalRijId: kanaalRij.id, kanaal: kanaalRij.kanaal as SocialKanaal,
      plannerId: bericht.plannerId, werkgeverNaam,
      uitkomst: kanaalRij.plaatsingStatus === "concept_klaargezet" ? "concept" : "mislukt",
      reden: kanaalRij.laatsteFout ?? "onbekend (hersteld na onderbreking)",
    });
  }
}

/**
 * Eerlijke uitkomststatus van het bericht zodra geen kanaalrij meer
 * wachtend/bezig is: alle kanalen geplaatst → geplaatst; minstens één
 * geplaatst of klaargezet concept → deels_geplaatst; anders mislukt.
 */
async function werkBerichtStatusBij(berichtId: number, nu: Date): Promise<void> {
  const rijen = await db.select({ status: socialBerichtKanalenTable.plaatsingStatus })
    .from(socialBerichtKanalenTable).where(eq(socialBerichtKanalenTable.berichtId, berichtId));
  if (rijen.some((r) => r.status === "wachtend" || r.status === "bezig")) return;
  const statussen = rijen.map((r) => r.status);
  const uitkomst = statussen.every((s) => s === "geplaatst") ? "geplaatst"
    : statussen.some((s) => s === "geplaatst" || s === "concept_klaargezet") ? "deels_geplaatst"
    : "mislukt";
  await db.update(socialBerichtenTable)
    .set({ status: uitkomst, geplaatstOp: uitkomst === "mislukt" ? null : nu, bijgewerktOp: nu })
    .where(and(eq(socialBerichtenTable.id, berichtId), eq(socialBerichtenTable.status, "gepland")));
}

/** Eén planner-tick: alle rijp-geplande kanaalrijen afhandelen. */
export async function draaiSocialPublicaties(nu = new Date()): Promise<{ verwerkt: number }> {
  await herstelVerlopenLeases(nu);
  await reconcileerOntbrekendeTaken();
  const rijp = await db
    .select({
      kanaalRij: socialBerichtKanalenTable,
      bericht: socialBerichtenTable,
      werkgeverNaam: werkgeversTable.naam,
    })
    .from(socialBerichtKanalenTable)
    .innerJoin(socialBerichtenTable, eq(socialBerichtKanalenTable.berichtId, socialBerichtenTable.id))
    .innerJoin(werkgeversTable, eq(socialBerichtenTable.werkgeverId, werkgeversTable.id))
    .where(and(
      eq(socialBerichtenTable.status, "gepland"),
      isNotNull(socialBerichtenTable.geplandOp),
      lte(socialBerichtenTable.geplandOp, nu),
      eq(socialBerichtKanalenTable.plaatsingStatus, "wachtend"),
    ));

  let verwerkt = 0;
  for (const { kanaalRij, bericht, werkgeverNaam } of rijp) {
    // Backoff: na een tijdelijke fout minstens 2 minuten wachten per poging.
    if (kanaalRij.laatstePogingOp && nu.getTime() - kanaalRij.laatstePogingOp.getTime() < kanaalRij.pogingen * 2 * 60_000) continue;

    // Atomaire lease-claim: zolang de rij 'bezig' is kan geen tweede tick 'm
    // oppakken — ook niet als de adaptercall traag is. Verlopen leases worden
    // aan het begin van de tick hersteld.
    const geclaimd = await db.update(socialBerichtKanalenTable)
      .set({ plaatsingStatus: "bezig", laatstePogingOp: nu, pogingen: sql`${socialBerichtKanalenTable.pogingen} + 1`, bijgewerktOp: nu })
      .where(and(eq(socialBerichtKanalenTable.id, kanaalRij.id), eq(socialBerichtKanalenTable.plaatsingStatus, "wachtend"), eq(socialBerichtKanalenTable.pogingen, kanaalRij.pogingen)))
      .returning({ id: socialBerichtKanalenTable.id });
    if (geclaimd.length === 0) continue;
    verwerkt++;

    const kanaal = kanaalRij.kanaal as SocialKanaal;
    const koppeling = (await db.select().from(socialKoppelingenTable)
      .where(and(eq(socialKoppelingenTable.werkgeverId, bericht.werkgeverId), eq(socialKoppelingenTable.kanaal, kanaal))))[0] ?? null;

    const invoer = {
      tekst: (kanaalRij.tekstOverride ?? bericht.tekst).trim(),
      mediaPad: bericht.mediaPad,
      mediaType: bericht.mediaType,
    };

    let uitkomst: Awaited<ReturnType<ReturnType<typeof kanaalAdapter>["publiceer"]>>;
    let viaConcept = false;
    if (!koppeling || koppeling.status !== "actief") {
      uitkomst = { ok: false, tijdelijk: false, reden: koppeling ? `koppeling is ${koppeling.status}` : "geen koppeling voor dit kanaal" };
    } else if (koppeling.modus === "publiceren") {
      uitkomst = await kanaalAdapter(kanaal).publiceer(koppeling, invoer);
    } else {
      viaConcept = true;
      uitkomst = await kanaalAdapter(kanaal).zetConceptKlaar(koppeling, invoer);
    }

    if (uitkomst.ok && !viaConcept) {
      await db.update(socialBerichtKanalenTable)
        .set({ plaatsingStatus: "geplaatst", externId: uitkomst.externId, geplaatstOp: nu, laatsteFout: null, bijgewerktOp: nu })
        .where(eq(socialBerichtKanalenTable.id, kanaalRij.id));
    } else if (uitkomst.ok && viaConcept) {
      // Concept staat op het account → taak om het af te maken (deel C).
      await db.update(socialBerichtKanalenTable)
        .set({ plaatsingStatus: "concept_klaargezet", externId: uitkomst.externId, conceptKlaargezetOp: nu, laatsteFout: null, bijgewerktOp: nu })
        .where(eq(socialBerichtKanalenTable.id, kanaalRij.id));
      await maakPublicatieTaak({ berichtId: bericht.id, kanaalRijId: kanaalRij.id, kanaal, plannerId: bericht.plannerId, werkgeverNaam, uitkomst: "concept", reden: "kanaal staat alleen klaarzetten toe" });
    } else if (!uitkomst.ok && uitkomst.tijdelijk && kanaalRij.pogingen + 1 < MAX_POGINGEN) {
      // Tijdelijke storing: lease teruggeven, Connect probeert het zelf
      // opnieuw (met backoff) vóór het een taak wordt.
      await db.update(socialBerichtKanalenTable)
        .set({ plaatsingStatus: "wachtend", laatsteFout: uitkomst.reden, bijgewerktOp: nu })
        .where(eq(socialBerichtKanalenTable.id, kanaalRij.id));
    } else {
      const reden = uitkomst.ok ? "" : uitkomst.reden;
      await db.update(socialBerichtKanalenTable)
        .set({ plaatsingStatus: "mislukt", laatsteFout: reden, bijgewerktOp: nu })
        .where(eq(socialBerichtKanalenTable.id, kanaalRij.id));
      await maakPublicatieTaak({ berichtId: bericht.id, kanaalRijId: kanaalRij.id, kanaal, plannerId: bericht.plannerId, werkgeverNaam, uitkomst: "mislukt", reden });
    }

    // Eerlijke uitkomststatus zodra geen kanaalrij meer wachtend/bezig is.
    await werkBerichtStatusBij(bericht.id, nu);
  }
  return { verwerkt };
}

// ── Verloopbewaking koppelingen (deel E): taak ruim vóór het verlopen ────────
const VERLOOP_WAARSCHUWING_DAGEN = 14;

export async function bewaakKoppelingVerloop(nu = new Date()): Promise<void> {
  const grens = new Date(nu.getTime() + VERLOOP_WAARSCHUWING_DAGEN * 24 * 3600_000);
  const rijen = await db
    .select({ k: socialKoppelingenTable, werkgeverNaam: werkgeversTable.naam })
    .from(socialKoppelingenTable)
    .innerJoin(werkgeversTable, eq(socialKoppelingenTable.werkgeverId, werkgeversTable.id))
    .where(and(eq(socialKoppelingenTable.status, "actief"), isNotNull(socialKoppelingenTable.verlooptOp), lte(socialKoppelingenTable.verlooptOp, grens)));
  for (const { k, werkgeverNaam } of rijen) {
    // Dedupe: één taak per verloopmoment.
    if (k.verloopTaakOp && k.verlooptOp && k.verloopTaakOp.getTime() >= k.verlooptOp.getTime() - VERLOOP_WAARSCHUWING_DAGEN * 24 * 3600_000) continue;
    await meldWerkbakItem({
      soort: "doen",
      bron: "social_koppeling_verloopt",
      titel: `${KANAAL_EISEN[k.kanaal as SocialKanaal].naam}-toegang van ${werkgeverNaam} verloopt ${k.verlooptOp!.toLocaleDateString("nl-NL")}`,
      omschrijving: "Vernieuw de koppeling in het beheerscherm vóór hij verloopt, anders stopt het publiceren voor dit kanaal.",
      vereisteModule: "crm",
      vereistNiveau: 4,
      actiePad: "/crm/social?tab=koppelingen",
      actieType: "navigeren",
      herkomstType: "social_koppeling",
      herkomstId: k.id,
      dedupSleutel: `social_koppeling_verloopt:${k.id}:${k.verlooptOp!.toISOString().slice(0, 10)}`,
    });
    await db.update(socialKoppelingenTable).set({ verloopTaakOp: nu, bijgewerktOp: nu }).where(eq(socialKoppelingenTable.id, k.id));
  }
  // Verlopen koppelingen markeren (zichtbaar in beheerscherm; planner faalt er fail-closed op).
  await db.update(socialKoppelingenTable)
    .set({ status: "verlopen", bijgewerktOp: nu })
    .where(and(eq(socialKoppelingenTable.status, "actief"), isNotNull(socialKoppelingenTable.verlooptOp), lte(socialKoppelingenTable.verlooptOp, nu)));
}

// ── Planner (elke minuut) — idempotente start volgens het bestaande patroon ──
let plannerGestart = false;

export function planSocialPublicaties(): void {
  if (plannerGestart) return;
  plannerGestart = true;
  const tick = async () => {
    try {
      await draaiSocialPublicaties();
      // Verloopbewaking hoeft niet per minuut; één keer per uur is ruim.
      if (new Date().getMinutes() === 0) await bewaakKoppelingVerloop();
    } catch (e) {
      console.error("[social] planner-tick mislukt:", e);
    }
    setTimeout(tick, 60_000).unref();
  };
  setTimeout(tick, 15_000).unref();
  console.log("[social] publicatieplanner actief (elke 60s)");
}
