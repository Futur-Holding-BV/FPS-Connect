import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@workspace/db";
import { sql, type SQL } from "drizzle-orm";

export type HerstartImpactCategorie = "verwijderen" | "anonimiseren" | "ontkoppelen" | "behouden";

export interface HerstartImpactRegel {
  categorie: HerstartImpactCategorie;
  label: string;
  aantal: number;
  toelichting: string;
}

export interface HerstartBlokkade {
  code: string;
  omschrijving: string;
  aantal: number;
  voorbeelden: string[];
}

export interface HerstartVoorvertoning {
  adviseur_id: number;
  gebruiker_id: number;
  naam: string;
  email: string;
  bevestigingstekst: string;
  impact_token: string;
  uitvoerbaar: boolean;
  impact: HerstartImpactRegel[];
  blokkades: HerstartBlokkade[];
}

interface DoelRij {
  adviseur_id: number;
  gebruiker_id: number;
  naam: string;
  email: string;
  rol: string;
  token_versie: number;
}

interface TellingRij extends Record<string, unknown> {
  profielen: number;
  afwijkingen: number;
  object_rechten: number;
  voorkeuren: number;
  reset_tokens: number;
  push_tokens: number;
  oauth_tokens: number;
  mailbox_toegang: number;
  workflow_sterren: number;
  chat_deelnames: number;
  achievements: number;
  bewaarde_dossiers: number;
  bewaarde_auditregels: number;
  bewaarde_mailgegevens: number;
}

type SqlUitvoerder = Pick<typeof db, "execute">;

export class HerstartFout extends Error {
  constructor(
    public readonly status: number,
    boodschap: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(boodschap);
  }
}

async function rijen<T>(uitvoerder: SqlUitvoerder, query: SQL): Promise<T[]> {
  const resultaat = await uitvoerder.execute(query);
  return (resultaat as unknown as { rows: T[] }).rows;
}

function geheim(): string {
  const waarde = process.env.SESSION_SECRET;
  if (!waarde) throw new HerstartFout(500, "De herstartbeveiliging is niet geconfigureerd.");
  return waarde;
}

export function maakBevestigingstekst(naam: string): string {
  return `HERSTART ${naam.trim()}`;
}

export function gelijkeToken(verwacht: string, ontvangen: string): boolean {
  const a = Buffer.from(verwacht);
  const b = Buffer.from(ontvangen);
  return a.length === b.length && timingSafeEqual(a, b);
}

function maakImpactToken(inhoud: unknown): string {
  return createHmac("sha256", geheim()).update(JSON.stringify(inhoud)).digest("hex");
}

async function leesDoel(uitvoerder: SqlUitvoerder, adviseurId: number): Promise<DoelRij> {
  const [doel] = await rijen<DoelRij>(uitvoerder, sql`
    SELECT ea.id AS adviseur_id, u.id AS gebruiker_id, u.naam, u.email, u.rol,
           u.token_versie
      FROM externe_adviseurs ea
      JOIN gebruikers u ON u.id = ea.gebruiker_id
     WHERE ea.id = ${adviseurId}
     LIMIT 1
  `);
  if (!doel) throw new HerstartFout(404, "Externe adviseur niet gevonden.");
  return doel;
}

async function telImpact(uitvoerder: SqlUitvoerder, gebruikerId: number): Promise<TellingRij> {
  const [telling] = await rijen<TellingRij>(uitvoerder, sql`
    SELECT
      (SELECT count(*)::int FROM gebruiker_profielen WHERE gebruiker_id = ${gebruikerId}) AS profielen,
      (SELECT count(*)::int FROM gebruiker_bevoegdheid_afwijkingen WHERE gebruiker_id = ${gebruikerId}) AS afwijkingen,
      (SELECT count(*)::int FROM object_rechten WHERE gebruiker_id = ${gebruikerId}) AS object_rechten,
      (SELECT count(*)::int FROM gebruiker_voorkeuren WHERE gebruiker_id = ${gebruikerId}) AS voorkeuren,
      (SELECT count(*)::int FROM wachtwoord_reset_tokens WHERE gebruiker_id = ${gebruikerId}) AS reset_tokens,
      (SELECT count(*)::int FROM push_tokens WHERE gebruiker_id = ${gebruikerId}) AS push_tokens,
      (SELECT count(*)::int FROM werk_inbox_tokens WHERE gebruiker_id = ${gebruikerId}) AS oauth_tokens,
      (SELECT count(*)::int FROM werk_inbox_mailbox_toegang WHERE gebruiker_id = ${gebruikerId}) AS mailbox_toegang,
      (SELECT count(*)::int FROM workflow_sterren WHERE gebruiker_id = ${gebruikerId}) AS workflow_sterren,
      (SELECT count(*)::int FROM chat_deelnemers WHERE gebruiker_id = ${gebruikerId}) AS chat_deelnames,
      (SELECT count(*)::int FROM monteur_achievements WHERE gebruiker_id = ${gebruikerId}) AS achievements,
      ((SELECT count(*) FROM document_logboek WHERE gebruiker_id = ${gebruikerId})
        + (SELECT count(*) FROM financiele_document_log WHERE gebruiker_id = ${gebruikerId}))::int AS bewaarde_dossiers,
      ((SELECT count(*) FROM audit_log WHERE gebruiker_id = ${gebruikerId})
        + (SELECT count(*) FROM activiteiten WHERE gebruiker_id = ${gebruikerId}))::int AS bewaarde_auditregels,
      ((SELECT count(*) FROM werk_inbox_mails WHERE gebruiker_id = ${gebruikerId})
        + (SELECT count(*) FROM werk_inbox_notities WHERE gebruiker_id = ${gebruikerId})
        + (SELECT count(*) FROM werk_inbox_koppelingen WHERE gebruiker_id = ${gebruikerId}))::int AS bewaarde_mailgegevens
  `);
  return telling;
}

async function leesBlokkades(
  uitvoerder: SqlUitvoerder,
  gebruikerId: number,
): Promise<HerstartBlokkade[]> {
  const blokkades = await rijen<HerstartBlokkade>(uitvoerder, sql`
    SELECT code, omschrijving, aantal::int, voorbeelden
    FROM (
      SELECT 'medewerkerprofiel' AS code,
             'Dit account heeft onverwacht een medewerkerprofiel; los dit eerst op.' AS omschrijving,
             count(*) AS aantal,
             (array_agg('Medewerkerprofiel #' || id ORDER BY id))[1:5] AS voorbeelden
        FROM medewerkers WHERE gebruiker_id = ${gebruikerId}
      UNION ALL
      SELECT 'gebouw_toewijzing', 'Draag deze gebouwtoewijzingen eerst over.', count(*),
             (array_agg(coalesce(g.naam, 'Gebouw #' || gt.gebouw_id) || ' — ' || coalesce(gt.project_rol, 'toegewezen') ORDER BY gt.id))[1:5]
        FROM gebouw_toewijzingen gt JOIN gebouwen g ON g.id = gt.gebouw_id
       WHERE gt.gebruiker_id = ${gebruikerId}
      UNION ALL
      SELECT 'spot_verantwoordelijkheid', 'Draag deze spotverantwoordelijkheden eerst over.', count(*),
             (array_agg(coalesce(g.naam, 'Gebouw') || ' — spot ' || coalesce(v.objectnummer, '#' || v.id) ORDER BY v.id))[1:5]
        FROM voorzieningen v LEFT JOIN gebouwen g ON g.id = v.gebouw_id
       WHERE v.monteur_id = ${gebruikerId} OR v.controleur_id = ${gebruikerId}
      UNION ALL
      SELECT 'werkbon', 'Draag deze actieve werkbonnen eerst over.', count(*),
             (array_agg(w.werkbonnummer || ' — ' || w.titel ORDER BY w.id))[1:5]
        FROM werkbonnen w
       WHERE w.monteur_id = ${gebruikerId} AND w.status NOT IN ('afgerond', 'voltooid', 'geannuleerd')
      UNION ALL
      SELECT 'crm_verantwoordelijkheid', 'Draag deze commerciële verantwoordelijkheden eerst over.', count(*),
             (array_agg(c.titel || ' (#' || c.id || ')' ORDER BY c.id))[1:5]
        FROM crm_commercieel c
       WHERE c.verantwoordelijke_id = ${gebruikerId} AND c.fase NOT IN ('gewonnen', 'verloren', 'gesloten')
      UNION ALL
      SELECT 'goedkeuringsbeleid', 'Wijs voor deze actieve goedkeuringsregels eerst een vervanger aan.', count(*),
             (array_agg(gb.naam || ' (#' || gb.id || ')' ORDER BY gb.id))[1:5]
        FROM goedkeuring_beleidsregels gb
       WHERE gb.actief = true AND ${gebruikerId} IN
             (gb.goedkeurder_gebruiker_id, gb.vervanger_gebruiker_id,
              gb.escalatie_stap_1_gebruiker_id, gb.escalatie_stap_2_gebruiker_id)
      UNION ALL
      SELECT 'onboarding_taak', 'Draag deze open HRM-onboardingtaken eerst over.', count(*),
             (array_agg(h.naam || ' (#' || h.id || ')' ORDER BY h.id))[1:5]
        FROM hrm_onboarding_taken h
       WHERE h.verantwoordelijke_id = ${gebruikerId} AND h.status NOT IN ('afgerond', 'vervallen')
      UNION ALL
      SELECT 'uitvoerdersessie', 'Rond deze actieve uitvoerderssessies af of draag ze over.', count(*),
             (array_agg('Uitvoerdersessie #' || us.id ORDER BY us.id))[1:5]
        FROM uitvoerder_sessies us
       WHERE us.monteur_id = ${gebruikerId} AND us.status = 'actief'
      UNION ALL
      SELECT 'mail_toewijzing', 'Draag deze open toegewezen e-mails eerst over.', count(*),
             (array_agg(coalesce(wm.onderwerp, 'E-mail') || ' (' || wm.mailbox_adres || ')' ORDER BY wm.id))[1:5]
        FROM werk_inbox_mails wm
       WHERE wm.toegewezen_aan = ${gebruikerId} AND wm.samenwerk_status <> 'afgehandeld'
      UNION ALL
      SELECT 'werkbak', 'Handel deze persoonlijke werkbakitems af of draag ze over.', count(*),
             (array_agg(wi.titel || ' (#' || wi.id || ')' ORDER BY wi.id))[1:5]
        FROM werkbak_items wi
       WHERE wi.gebruiker_id = ${gebruikerId} AND wi.status = 'open'
      UNION ALL
      SELECT 'tijdelijke_upload', 'Voltooi of annuleer deze tijdelijke SnagStream-uploads eerst.', count(*),
             (array_agg(su.bestandsnaam || ' (#' || su.id || ')' ORDER BY su.id))[1:5]
        FROM snagstream_uploads su
       WHERE su.gebruiker_id = ${gebruikerId}
    ) b
    WHERE aantal > 0
    ORDER BY code
  `);
  return blokkades.map((b) => ({ ...b, voorbeelden: b.voorbeelden ?? [] }));
}

function impactRegels(t: TellingRij): HerstartImpactRegel[] {
  const toegangsKoppelingen =
    t.profielen + t.afwijkingen + t.object_rechten + t.mailbox_toegang;
  const persoonlijkeData =
    t.voorkeuren + t.reset_tokens + t.push_tokens + t.oauth_tokens +
    t.workflow_sterren + t.chat_deelnames + t.achievements;
  return [
    {
      categorie: "verwijderen",
      label: "Externe-adviseurregistratie",
      aantal: 1,
      toelichting: "De registratie die een nieuwe adviseur-onboarding blokkeert wordt verwijderd.",
    },
    {
      categorie: "verwijderen",
      label: "Toegangs- en rechtenkoppelingen",
      aantal: toegangsKoppelingen,
      toelichting: "Profielen, afwijkingen, objectrechten en persoonlijke mailboxrechten worden opnieuw opgebouwd.",
    },
    {
      categorie: "verwijderen",
      label: "Persoonlijke tokens en voorkeuren",
      aantal: persoonlijkeData,
      toelichting: "Reset-, push- en Microsoft-tokens, persoonlijke UI-voorkeuren, chatlidmaatschap, mijlpalen en workflowsterren worden gewist.",
    },
    {
      categorie: "anonimiseren",
      label: "Oud gebruikersaccount",
      aantal: 1,
      toelichting: "Het account blijft alleen als afgeschermd bewijsanker bestaan; naam, e-mail, contact- en beveiligingsgegevens worden geneutraliseerd.",
    },
    {
      categorie: "behouden",
      label: "Document- en financiële historie",
      aantal: t.bewaarde_dossiers,
      toelichting: "Bedrijfsdocumenten, financiële historie en wettelijke bewijsgegevens worden niet verwijderd.",
    },
    {
      categorie: "behouden",
      label: "Audit- en activiteitenbewijs",
      aantal: t.bewaarde_auditregels,
      toelichting: "Auditregels blijven bestaan; zichtbare persoonsgegevens worden afgeschermd.",
    },
    {
      categorie: "behouden",
      label: "Zakelijke mailgegevens",
      aantal: t.bewaarde_mailgegevens,
      toelichting: "Zakelijke mailmetadata, notities en entiteitskoppelingen blijven als bedrijfsdossier behouden.",
    },
  ];
}

export async function berekenHerstartVoorvertoning(
  uitvoerder: SqlUitvoerder,
  adviseurId: number,
  actorId: number,
): Promise<HerstartVoorvertoning> {
  const [actor] = await rijen<{ rol: string }>(uitvoerder, sql`
    SELECT rol FROM gebruikers WHERE id = ${actorId} LIMIT 1
  `);
  if (actor?.rol !== "hoofdbeheerder") {
    throw new HerstartFout(403, "Alleen een hoofdbeheerder mag een adviseur opnieuw laten beginnen.");
  }
  const doel = await leesDoel(uitvoerder, adviseurId);
  if (doel.gebruiker_id === actorId) {
    throw new HerstartFout(409, "U kunt uw eigen account niet opnieuw laten beginnen.");
  }
  if (doel.rol === "hoofdbeheerder") {
    throw new HerstartFout(409, "Een hoofdbeheerderaccount kan niet opnieuw worden gestart.");
  }
  const [telling, blokkades] = await Promise.all([
    telImpact(uitvoerder, doel.gebruiker_id),
    leesBlokkades(uitvoerder, doel.gebruiker_id),
  ]);
  const impact = impactRegels(telling);
  const bevestigingstekst = maakBevestigingstekst(doel.naam);
  const tokenInhoud = {
    adviseurId: doel.adviseur_id,
    gebruikerId: doel.gebruiker_id,
    naam: doel.naam,
    email: doel.email,
    tokenVersie: doel.token_versie,
    impact,
    blokkades,
  };
  return {
    adviseur_id: doel.adviseur_id,
    gebruiker_id: doel.gebruiker_id,
    naam: doel.naam,
    email: doel.email,
    bevestigingstekst,
    impact_token: maakImpactToken(tokenInhoud),
    uitvoerbaar: blokkades.length === 0,
    impact,
    blokkades,
  };
}

export interface HerstartResultaat {
  bericht: string;
  oude_gebruiker_id: number;
  vrijgegeven_email: string;
  sessies_beeindigd: number;
  verwijderde_koppelingen: number;
  geanonimiseerd: boolean;
}

export async function voerHerstartUitBinnenTransactie(
  uitvoerder: SqlUitvoerder,
  adviseurId: number,
  actorId: number,
  bevestiging: string,
  impactToken: string,
): Promise<HerstartResultaat> {
    const tx = uitvoerder;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(1174, ${adviseurId})`);
    // Een FOR UPDATE-lock op de doelgebruiker blokkeert gelijktijdige FK-
    // toewijzingen (die een KEY SHARE-lock nodig hebben) tot na de commit.
    await tx.execute(sql`
      SELECT u.id
        FROM gebruikers u
        JOIN externe_adviseurs ea ON ea.gebruiker_id = u.id
       WHERE ea.id = ${adviseurId}
       FOR UPDATE OF u
    `);
    // Vergrendel óók reeds gekoppelde rijen, ongeacht hun huidige status. Zo kan
    // een afgeronde/vervallen koppeling niet tussen controle en commit opnieuw
    // operationeel worden gemaakt zonder op deze transactie te wachten.
    await tx.execute(sql`
      SELECT m.id FROM medewerkers m
      JOIN externe_adviseurs ea ON ea.gebruiker_id = m.gebruiker_id
      WHERE ea.id = ${adviseurId} FOR UPDATE OF m
    `);
    await tx.execute(sql`
      SELECT gt.id FROM gebouw_toewijzingen gt
      JOIN externe_adviseurs ea ON ea.gebruiker_id = gt.gebruiker_id
      WHERE ea.id = ${adviseurId} FOR UPDATE OF gt
    `);
    await tx.execute(sql`
      SELECT v.id FROM voorzieningen v
      JOIN externe_adviseurs ea ON ea.gebruiker_id IN (v.monteur_id, v.controleur_id)
      WHERE ea.id = ${adviseurId} FOR UPDATE OF v
    `);
    await tx.execute(sql`
      SELECT w.id FROM werkbonnen w
      JOIN externe_adviseurs ea ON ea.gebruiker_id = w.monteur_id
      WHERE ea.id = ${adviseurId} FOR UPDATE OF w
    `);
    await tx.execute(sql`
      SELECT c.id FROM crm_commercieel c
      JOIN externe_adviseurs ea ON ea.gebruiker_id = c.verantwoordelijke_id
      WHERE ea.id = ${adviseurId} FOR UPDATE OF c
    `);
    await tx.execute(sql`
      SELECT gb.id FROM goedkeuring_beleidsregels gb
      JOIN externe_adviseurs ea ON ea.gebruiker_id IN (
        gb.goedkeurder_gebruiker_id, gb.vervanger_gebruiker_id,
        gb.escalatie_stap_1_gebruiker_id, gb.escalatie_stap_2_gebruiker_id
      )
      WHERE ea.id = ${adviseurId} FOR UPDATE OF gb
    `);
    await tx.execute(sql`
      SELECT h.id FROM hrm_onboarding_taken h
      JOIN externe_adviseurs ea ON ea.gebruiker_id = h.verantwoordelijke_id
      WHERE ea.id = ${adviseurId} FOR UPDATE OF h
    `);
    await tx.execute(sql`
      SELECT us.id FROM uitvoerder_sessies us
      JOIN externe_adviseurs ea ON ea.gebruiker_id = us.monteur_id
      WHERE ea.id = ${adviseurId} FOR UPDATE OF us
    `);
    await tx.execute(sql`
      SELECT wm.id FROM werk_inbox_mails wm
      JOIN externe_adviseurs ea ON ea.gebruiker_id = wm.toegewezen_aan
      WHERE ea.id = ${adviseurId} FOR UPDATE OF wm
    `);
    await tx.execute(sql`
      SELECT wi.id FROM werkbak_items wi
      JOIN externe_adviseurs ea ON ea.gebruiker_id = wi.gebruiker_id
      WHERE ea.id = ${adviseurId} FOR UPDATE OF wi
    `);
    await tx.execute(sql`
      SELECT su.id FROM snagstream_uploads su
      JOIN externe_adviseurs ea ON ea.gebruiker_id = su.gebruiker_id
      WHERE ea.id = ${adviseurId} FOR UPDATE OF su
    `);
    const preview = await berekenHerstartVoorvertoning(tx as SqlUitvoerder, adviseurId, actorId);
    if (!gelijkeToken(preview.impact_token, impactToken)) {
      throw new HerstartFout(409, "De voorvertoning is gewijzigd. Controleer de nieuwe impact en bevestig opnieuw.", {
        code: "VEROUDERDE_VOORVERTONING",
      });
    }
    if (preview.blokkades.length > 0) {
      throw new HerstartFout(409, "De onboarding kan pas opnieuw beginnen nadat alle verantwoordelijkheden zijn overgedragen.", {
        code: "OPERATIONELE_BLOKKADES",
        blokkades: preview.blokkades,
      });
    }
    if (bevestiging !== preview.bevestigingstekst) {
      throw new HerstartFout(400, `Typ exact: ${preview.bevestigingstekst}`);
    }

    const [sessies] = await rijen<{ aantal: number }>(tx as SqlUitvoerder, sql`
      WITH verwijderd AS (
        DELETE FROM "session"
         WHERE sess::jsonb->>'userId' = ${String(preview.gebruiker_id)}
            OR sess::jsonb->>'pendingUserId' = ${String(preview.gebruiker_id)}
        RETURNING 1
      )
      SELECT count(*)::int AS aantal FROM verwijderd
    `);

    const [verwijderd] = await rijen<{ aantal: number }>(tx as SqlUitvoerder, sql`
      WITH
        a AS (DELETE FROM externe_adviseurs WHERE id = ${adviseurId} AND gebruiker_id = ${preview.gebruiker_id} RETURNING 1),
        b AS (DELETE FROM gebruiker_profielen WHERE gebruiker_id = ${preview.gebruiker_id} RETURNING 1),
        c AS (DELETE FROM gebruiker_bevoegdheid_afwijkingen WHERE gebruiker_id = ${preview.gebruiker_id} RETURNING 1),
        d AS (DELETE FROM object_rechten WHERE gebruiker_id = ${preview.gebruiker_id} RETURNING 1),
        e AS (DELETE FROM gebruiker_voorkeuren WHERE gebruiker_id = ${preview.gebruiker_id} RETURNING 1),
        f AS (DELETE FROM wachtwoord_reset_tokens WHERE gebruiker_id = ${preview.gebruiker_id} RETURNING 1),
        g AS (DELETE FROM push_tokens WHERE gebruiker_id = ${preview.gebruiker_id} RETURNING 1),
        h AS (DELETE FROM werk_inbox_tokens WHERE gebruiker_id = ${preview.gebruiker_id} RETURNING 1),
        i AS (DELETE FROM werk_inbox_mailbox_toegang WHERE gebruiker_id = ${preview.gebruiker_id} RETURNING 1),
        j AS (DELETE FROM workflow_sterren WHERE gebruiker_id = ${preview.gebruiker_id} RETURNING 1),
        k AS (DELETE FROM chat_deelnemers WHERE gebruiker_id = ${preview.gebruiker_id} RETURNING 1),
        l AS (DELETE FROM monteur_achievements WHERE gebruiker_id = ${preview.gebruiker_id} RETURNING 1)
      SELECT ((SELECT count(*) FROM a) + (SELECT count(*) FROM b) + (SELECT count(*) FROM c)
        + (SELECT count(*) FROM d) + (SELECT count(*) FROM e) + (SELECT count(*) FROM f)
        + (SELECT count(*) FROM g) + (SELECT count(*) FROM h) + (SELECT count(*) FROM i)
        + (SELECT count(*) FROM j) + (SELECT count(*) FROM k) + (SELECT count(*) FROM l))::int AS aantal
    `);

    await tx.execute(sql`
      UPDATE activiteiten SET gebruiker_naam = 'Verwijderde adviseur'
       WHERE gebruiker_id = ${preview.gebruiker_id}
    `);
    await tx.execute(sql`
      UPDATE audit_log SET gebruiker_naam = 'Verwijderde adviseur'
       WHERE gebruiker_id = ${preview.gebruiker_id}
    `);
    await tx.execute(sql`
      UPDATE document_logboek SET gebruiker_naam = 'Verwijderde adviseur'
       WHERE gebruiker_id = ${preview.gebruiker_id}
    `);
    await tx.execute(sql`
      UPDATE goedkeuring_stappen SET gebruiker_naam = 'Verwijderde adviseur'
       WHERE gebruiker_id = ${preview.gebruiker_id}
    `);
    await tx.execute(sql`
      UPDATE goedkeuring_escalaties SET naar_gebruiker_naam = 'Verwijderde adviseur'
       WHERE naar_gebruiker_id = ${preview.gebruiker_id}
    `);

    const pseudoEmail = `herstart-${preview.gebruiker_id}-${Date.now()}@anon.invalid`;
    const bijgewerkt = await rijen<{ id: number }>(tx as SqlUitvoerder, sql`
      UPDATE gebruikers
         SET naam = ${`Verwijderde adviseur #${preview.gebruiker_id}`},
             initialen = NULL,
             email = ${pseudoEmail},
             telefoon = NULL,
             bedrijf = NULL,
             wachtwoord = NULL,
             totp_secret = NULL,
             twee_factor_ingeschakeld = false,
             twee_factor_vrijgesteld = false,
             actief = false,
             gearchiveerd = true,
             avatar_url = NULL,
             bedrijfslogo_url = NULL,
             bedrijfskleuren = NULL,
             uitnodiging_status = 'niet_uitgenodigd',
             uitnodiging_verstuurd_op = NULL,
             uitnodiging_token = NULL,
             uitnodiging_verloopt_op = NULL,
             uitnodiging_geopend_op = NULL,
             uitnodiging_opnieuw_verstuurd_op = NULL,
             uitnodiging_geaccepteerd_op = NULL,
             functietitels = '{}'::text[],
             bevoegdheden = '{}'::jsonb,
             herkomst_profiel_id = NULL,
             herkomst_automatisch = false,
             dienstverband = 'intern',
             bedrijf_uitzendbureau = NULL,
             uitzendbureau_id = NULL,
             geanonimiseerd = 'externe_adviseur_herstart',
             token_versie = token_versie + 1,
             moet_wachtwoord_wijzigen = false,
             mislukte_pogingen = 0,
             vergrendeld_tot = NULL,
             gedeactiveerd_op = NOW(),
             laatst_online = NULL
       WHERE id = ${preview.gebruiker_id}
       RETURNING id
    `);
    if (!bijgewerkt[0]) throw new HerstartFout(409, "Het adviseuraccount is tijdens de herstart gewijzigd.");

    return {
      bericht: "De externe adviseur kan opnieuw worden uitgenodigd en onboard.",
      oude_gebruiker_id: preview.gebruiker_id,
      vrijgegeven_email: preview.email,
      sessies_beeindigd: sessies?.aantal ?? 0,
      verwijderde_koppelingen: verwijderd?.aantal ?? 0,
      geanonimiseerd: true,
    };
}

export async function voerHerstartUit(
  adviseurId: number,
  actorId: number,
  bevestiging: string,
  impactToken: string,
): Promise<HerstartResultaat> {
  return db.transaction(async (tx) => {
    return voerHerstartUitBinnenTransactie(
      tx as SqlUitvoerder,
      adviseurId,
      actorId,
      bevestiging,
      impactToken,
    );
  });
}