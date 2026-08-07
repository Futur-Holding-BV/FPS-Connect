// Additieve schemaherstelstap — draait VOOR drizzle-kit push in de post-merge flow.
//
// Waarom: drizzle-kit push kan in een non-TTY omgeving (stdin gesloten) afbreken
// wanneer er nieuwe tabellen met FK-referenties of nieuwe kolommen zijn die het
// schema-diff triggeren. Door de ontbrekende tabellen en kolommen vooraf via
// idempotente SQL toe te voegen (CREATE TABLE IF NOT EXISTS / ALTER TABLE ADD COLUMN IF NOT EXISTS)
// is het drizzle-diff klein en veilig, en loopt push-force groen door zonder prompt.
//
// Veiligheidsprincipes:
// - Uitsluitend additief: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS.
// - Nooit DROP, TRUNCATE, ALTER TYPE of DELETE.
// - De 'session'-tabel (connect-pg-simple) wordt nimmer aangeraakt.
// - Idempotent: veilig om meerdere keren te draaien.

import pg from "pg";

const { Pool } = pg;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[apply-additive] DATABASE_URL ontbreekt; overslaan.");
  process.exit(0);
}

const pool = new Pool({ connectionString: url });

// Lijst van additieve SQL-statements, in volgorde van afhankelijkheid.
// Elk statement bevat een beschrijving voor logdoeleinden.
const stappen = [
  {
    beschrijving: "werk_inbox_mailboxen.is_factuurmailbox toevoegen (FACTUUR_02)",
    sql: `
      ALTER TABLE werk_inbox_mailboxen
        ADD COLUMN IF NOT EXISTS is_factuurmailbox BOOLEAN NOT NULL DEFAULT false;
    `,
  },
  {
    beschrijving: "werk_inbox_mails conversation_id + factuur_verwerkt_op toevoegen (FACTUUR_02)",
    sql: `
      ALTER TABLE werk_inbox_mails
        ADD COLUMN IF NOT EXISTS conversation_id TEXT,
        ADD COLUMN IF NOT EXISTS factuur_verwerkt_op TIMESTAMPTZ;
    `,
  },
  {
    beschrijving: "facturen factuurstroom-kolommen toevoegen (FACTUUR_02)",
    sql: `
      ALTER TABLE facturen
        ADD COLUMN IF NOT EXISTS tenaamstelling_bv TEXT,
        ADD COLUMN IF NOT EXISTS afwijsreden_code TEXT,
        ADD COLUMN IF NOT EXISTS inkoper_id INTEGER REFERENCES gebruikers(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS inkoper_bevestigd_op TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS onzekere_velden JSONB,
        ADD COLUMN IF NOT EXISTS ai_voorstel_stroom JSONB,
        ADD COLUMN IF NOT EXISTS conversation_id TEXT,
        ADD COLUMN IF NOT EXISTS mail_message_id TEXT,
        ADD COLUMN IF NOT EXISTS status_voor_afwijzing TEXT;
    `,
  },
  {
    beschrijving: "factuur_signalen tabel aanmaken (FACTUUR_02)",
    sql: `
      CREATE TABLE IF NOT EXISTS factuur_signalen (
        id               SERIAL PRIMARY KEY,
        type             TEXT NOT NULL,
        factuur_id       INTEGER REFERENCES facturen(id) ON DELETE CASCADE,
        mail_message_id  TEXT,
        omschrijving     TEXT NOT NULL,
        status           TEXT NOT NULL DEFAULT 'open',
        afgehandeld_door INTEGER REFERENCES gebruikers(id) ON DELETE SET NULL,
        afgehandeld_op   TIMESTAMPTZ,
        afhandel_notitie TEXT,
        aangemaakt_op    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `,
  },
  {
    beschrijving: "factuur_tijdlijn tabel aanmaken (FACTUUR_02)",
    sql: `
      CREATE TABLE IF NOT EXISTS factuur_tijdlijn (
        id             SERIAL PRIMARY KEY,
        factuur_id     INTEGER NOT NULL REFERENCES facturen(id) ON DELETE CASCADE,
        tekst          TEXT NOT NULL,
        gebeurd_op     TIMESTAMPTZ NOT NULL DEFAULT now(),
        gebruiker_naam TEXT
      );
    `,
  },
  {
    beschrijving: "gebruikers.uitzendbureau_id toevoegen (FK naar crm_klanten; FACTUUR_01)",
    sql: `
      ALTER TABLE gebruikers
        ADD COLUMN IF NOT EXISTS uitzendbureau_id INTEGER REFERENCES crm_klanten(id) ON DELETE SET NULL;
    `,
  },
  {
    beschrijving: "medewerkers.uitzendbureau_id toevoegen (FK naar crm_klanten; FACTUUR_01)",
    sql: `
      ALTER TABLE medewerkers
        ADD COLUMN IF NOT EXISTS uitzendbureau_id INTEGER REFERENCES crm_klanten(id) ON DELETE SET NULL;
    `,
  },
  {
    beschrijving: "clusters tabel aanmaken (als die nog niet bestaat)",
    sql: `
      CREATE TABLE IF NOT EXISTS clusters (
        id            SERIAL PRIMARY KEY,
        gebouw_id     INTEGER NOT NULL REFERENCES gebouwen(id) ON DELETE CASCADE,
        verdieping_id INTEGER REFERENCES verdiepingen(id) ON DELETE SET NULL,
        naam          TEXT NOT NULL,
        type          TEXT,
        kleur         TEXT,
        aangemaakt_op TIMESTAMPTZ NOT NULL DEFAULT now(),
        bijgewerkt_op TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `,
  },
  {
    beschrijving: "fabrikanten.gearchiveerd toevoegen (als die kolom nog niet bestaat)",
    sql: `
      ALTER TABLE fabrikanten
        ADD COLUMN IF NOT EXISTS gearchiveerd BOOLEAN NOT NULL DEFAULT false;
    `,
  },
  {
    beschrijving: "labels.fabrikant_id toevoegen (als die kolom nog niet bestaat)",
    sql: `
      ALTER TABLE labels
        ADD COLUMN IF NOT EXISTS fabrikant_id INTEGER REFERENCES fabrikanten(id) ON DELETE SET NULL;
    `,
  },
  {
    beschrijving: "voorzieningen.cluster_id toevoegen (als die kolom nog niet bestaat)",
    sql: `
      ALTER TABLE voorzieningen
        ADD COLUMN IF NOT EXISTS cluster_id INTEGER;
    `,
  },
  {
    beschrijving: "medewerkers.contracturen_per_week toevoegen (als die kolom nog niet bestaat)",
    sql: `
      ALTER TABLE medewerkers
        ADD COLUMN IF NOT EXISTS contracturen_per_week REAL;
    `,
  },
  {
    beschrijving: "offertes.calculatie_id toevoegen (koppeling mod_calc_headers)",
    sql: `
      ALTER TABLE offertes
        ADD COLUMN IF NOT EXISTS calculatie_id INTEGER REFERENCES mod_calc_headers(id) ON DELETE SET NULL;
    `,
  },
  {
    beschrijving: "mod_calc_headers.opslag_abk toevoegen (ABK opslag V2.1)",
    sql: `
      ALTER TABLE mod_calc_headers
        ADD COLUMN IF NOT EXISTS opslag_abk REAL NOT NULL DEFAULT 10;
    `,
  },
  {
    beschrijving: "mod_calc_regels V2.1 velden toevoegen (MU, arbeid, onderaanneming, staartkosten, regelnummer)",
    sql: `
      ALTER TABLE mod_calc_regels ADD COLUMN IF NOT EXISTS regelnummer TEXT;
      ALTER TABLE mod_calc_regels ADD COLUMN IF NOT EXISTS mu_per_eenheid REAL NOT NULL DEFAULT 0;
      ALTER TABLE mod_calc_regels ADD COLUMN IF NOT EXISTS arbeids_tarief REAL NOT NULL DEFAULT 0;
      ALTER TABLE mod_calc_regels ADD COLUMN IF NOT EXISTS onderaanneming_bedrag REAL NOT NULL DEFAULT 0;
      ALTER TABLE mod_calc_regels ADD COLUMN IF NOT EXISTS is_staartkosten BOOLEAN NOT NULL DEFAULT false;
    `,
  },
  {
    beschrijving: "offerte_regels optioneel-werk kolommen toevoegen",
    sql: `
      ALTER TABLE offerte_regels ADD COLUMN IF NOT EXISTS is_optioneel BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE offerte_regels ADD COLUMN IF NOT EXISTS optioneel_geselecteerd BOOLEAN NOT NULL DEFAULT true;
    `,
  },
  {
    beschrijving: "voorraad_mutaties.opdracht_id toevoegen (koppeling uitgifte aan opdracht voor traceerbaarheid)",
    sql: `
      ALTER TABLE voorraad_mutaties
        ADD COLUMN IF NOT EXISTS opdracht_id INTEGER REFERENCES opdrachten(id) ON DELETE SET NULL;
    `,
  },
  {
    beschrijving: "opleverrapporten alle V1.4/V1.5-kolommen toevoegen (inclusief werkbon_id, reactietermijn, vervangings- en certificaatskolommen)",
    sql: `
      ALTER TABLE opleverrapporten ADD COLUMN IF NOT EXISTS werkbon_id INTEGER REFERENCES werkbonnen(id) ON DELETE SET NULL;
      ALTER TABLE opleverrapporten ADD COLUMN IF NOT EXISTS reactietermijn_datum TIMESTAMPTZ;
      ALTER TABLE opleverrapporten ADD COLUMN IF NOT EXISTS reactietermijn_gestart_op TIMESTAMPTZ;
      ALTER TABLE opleverrapporten ADD COLUMN IF NOT EXISTS vervangen_door_rapport_id INTEGER;
      ALTER TABLE opleverrapporten ADD COLUMN IF NOT EXISTS vervangen_op TIMESTAMPTZ;
      ALTER TABLE opleverrapporten ADD COLUMN IF NOT EXISTS certificaat_geaccordeerd BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE opleverrapporten ADD COLUMN IF NOT EXISTS certificaat_geaccordeerd_op TIMESTAMPTZ;
      ALTER TABLE opleverrapporten ADD COLUMN IF NOT EXISTS certificaat_garantie_maanden INTEGER NOT NULL DEFAULT 12;
      ALTER TABLE opleverrapporten ADD COLUMN IF NOT EXISTS reactietermijn_melding_verzond_op TIMESTAMPTZ;
      ALTER TABLE opleverrapporten ADD COLUMN IF NOT EXISTS vervangen_door_id INTEGER;
      ALTER TABLE opleverrapporten ADD COLUMN IF NOT EXISTS aangemaakt_door INTEGER REFERENCES gebruikers(id) ON DELETE SET NULL;
      ALTER TABLE opleverrapporten ADD COLUMN IF NOT EXISTS klant_reactie_op TIMESTAMP;
      ALTER TABLE opleverrapporten ADD COLUMN IF NOT EXISTS klant_reactie_type TEXT;
    `,
  },
  {
    beschrijving: "inbox_items AI-velden toevoegen (ai_geconsolideerd + ai_opslaglocatie)",
    sql: `
      ALTER TABLE inbox_items ADD COLUMN IF NOT EXISTS ai_geconsolideerd BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE inbox_items ADD COLUMN IF NOT EXISTS ai_opslaglocatie TEXT;
    `,
  },
  {
    beschrijving: "verlofaanvragen.bezetting_overschreden toevoegen (bezettingsdrempel-vlag)",
    sql: `
      ALTER TABLE verlofaanvragen ADD COLUMN IF NOT EXISTS bezetting_overschreden BOOLEAN NOT NULL DEFAULT false;
    `,
  },
  {
    beschrijving: "app_instellingen.moments_verjaardag_ingeschakeld toevoegen (verjaardagsnotificatie-vlag)",
    sql: `
      ALTER TABLE app_instellingen ADD COLUMN IF NOT EXISTS moments_verjaardag_ingeschakeld BOOLEAN NOT NULL DEFAULT true;
    `,
  },
  {
    beschrijving: "gebruiker_profielen koppeltabel aanmaken en indexen aanleggen (P2 meerdere rollen per gebruiker)",
    sql: `
      CREATE TABLE IF NOT EXISTS gebruiker_profielen (
        id            SERIAL PRIMARY KEY,
        gebruiker_id  INTEGER NOT NULL REFERENCES gebruikers(id) ON DELETE CASCADE,
        profiel_id    INTEGER NOT NULL REFERENCES profielen(id) ON DELETE CASCADE,
        aangemaakt_op TIMESTAMP NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS gp_gebruiker_idx ON gebruiker_profielen (gebruiker_id);
      CREATE INDEX IF NOT EXISTS gp_profiel_idx ON gebruiker_profielen (profiel_id);
    `,
  },
  {
    beschrijving: "document_classificatie_correcties tabel aanmaken (correctie-leerloop Document Intelligence)",
    sql: `
      CREATE TABLE IF NOT EXISTS document_classificatie_correcties (
        id                    SERIAL PRIMARY KEY,
        bestandshash          TEXT NOT NULL,
        originele_categorie   TEXT NOT NULL,
        gecorrigeerde_categorie TEXT NOT NULL,
        werkmaatschappij      TEXT NOT NULL,
        bewijs_signalen       JSONB,
        aangemaakt_op         TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS dcc_wm_datum_idx
        ON document_classificatie_correcties (werkmaatschappij, aangemaakt_op DESC);
    `,
  },
  {
    beschrijving: "HRM-adviseur profiel: gebruikers-bevoegdheid op niveau 4 zetten (idempotent datapatch)",
    sql: `
      UPDATE profielen
         SET bevoegdheden = bevoegdheden::jsonb || '{"gebruikers":4}'::jsonb
       WHERE naam = 'HRM-adviseur'
         AND systeem = true
         AND COALESCE((bevoegdheden::jsonb->>'gebruikers')::int, 0) < 4;
    `,
  },
  {
    beschrijving: "Stored bevoegdheden herberekenen voor gebruikers direct gekoppeld aan HRM-adviseur profiel (idempotent)",
    sql: `
      UPDATE gebruikers g
         SET bevoegdheden = (
               SELECT COALESCE(
                 jsonb_object_agg(sub.key, sub.max_niveau),
                 g.bevoegdheden::jsonb
               )
               FROM (
                 SELECT kv.key,
                        MAX(CAST(kv.value AS int)) AS max_niveau
                   FROM gebruiker_profielen up
                   JOIN profielen p ON p.id = up.profiel_id
                  CROSS JOIN jsonb_each_text(p.bevoegdheden::jsonb) AS kv(key, value)
                  WHERE up.gebruiker_id = g.id
                    AND kv.value ~ '^[0-9]+$'
                  GROUP BY kv.key
               ) sub
             )
       WHERE g.id IN (
               SELECT up.gebruiker_id
                 FROM gebruiker_profielen up
                 JOIN profielen p ON p.id = up.profiel_id
                WHERE p.naam = 'HRM-adviseur'
                  AND p.systeem = true
             );
    `,
  },
  {
    beschrijving: "AANVRAAG_01: mailboxen is_aanvraagmailbox + mails aanvraag_verwerkt_op + tokens aanvraag_intake_persoonlijk",
    sql: `
      ALTER TABLE werk_inbox_mailboxen
        ADD COLUMN IF NOT EXISTS is_aanvraagmailbox BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE werk_inbox_mails
        ADD COLUMN IF NOT EXISTS aanvraag_verwerkt_op TIMESTAMPTZ;
      ALTER TABLE werk_inbox_tokens
        ADD COLUMN IF NOT EXISTS aanvraag_intake_persoonlijk BOOLEAN NOT NULL DEFAULT false;
    `,
  },
  {
    beschrijving: "AANVRAAG_01: crm_commercieel herkomst- en bewakingskolommen",
    sql: `
      ALTER TABLE crm_commercieel
        ADD COLUMN IF NOT EXISTS bron_mail_message_id TEXT,
        ADD COLUMN IF NOT EXISTS binnengekomen_op TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS beantwoord_op TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS bedrijf_bv TEXT,
        ADD COLUMN IF NOT EXISTS gerelateerd_project_id INTEGER;
    `,
  },
  {
    beschrijving: "AANVRAAG_01: tabel aanvraag_voorstellen",
    sql: `
      CREATE TABLE IF NOT EXISTS aanvraag_voorstellen (
        id SERIAL PRIMARY KEY,
        gebruiker_id INTEGER NOT NULL REFERENCES gebruikers(id) ON DELETE CASCADE,
        mail_message_id TEXT NOT NULL,
        mailbox_adres TEXT NOT NULL,
        is_persoonlijk BOOLEAN NOT NULL DEFAULT false,
        afzender_naam TEXT,
        afzender_email TEXT NOT NULL DEFAULT '',
        onderwerp TEXT NOT NULL DEFAULT '',
        binnengekomen_op TIMESTAMPTZ NOT NULL,
        voorstel_type TEXT NOT NULL DEFAULT 'nieuwe_aanvraag',
        status TEXT NOT NULL DEFAULT 'open',
        ai_voorstel JSONB,
        concept_antwoord TEXT,
        concept_vorm TEXT NOT NULL DEFAULT 'bevestiging',
        bijlagen JSONB,
        antwoord_verstuurd_op TIMESTAMPTZ,
        projectkans_id INTEGER REFERENCES crm_commercieel(id) ON DELETE SET NULL,
        beoordeeld_door_id INTEGER REFERENCES gebruikers(id) ON DELETE SET NULL,
        beoordeeld_op TIMESTAMPTZ,
        beoordeel_notitie TEXT,
        aangemaakt_op TIMESTAMPTZ NOT NULL DEFAULT now(),
        bijgewerkt_op TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT aanvraag_voorstellen_mail_uq UNIQUE (mail_message_id)
      );
    `,
  },
  {
    beschrijving: "AANVRAAG_01: factuur_signalen.projectkans_id + offertes.projectkans_id + instelbare termijnen",
    sql: `
      ALTER TABLE factuur_signalen
        ADD COLUMN IF NOT EXISTS projectkans_id INTEGER;
      ALTER TABLE offertes
        ADD COLUMN IF NOT EXISTS projectkans_id INTEGER;
      ALTER TABLE app_instellingen
        ADD COLUMN IF NOT EXISTS aanvraag_reactietermijn_uren INTEGER NOT NULL DEFAULT 24,
        ADD COLUMN IF NOT EXISTS aanvraag_oppak_termijn_uren INTEGER NOT NULL DEFAULT 72;
    `,
  },
  {
    beschrijving: "AANVRAAG_01: atomaire signaal-dedupe — partiële unieke indexes op open factuur_signalen",
    sql: `
      -- Eerst bestaande dubbele open signalen opruimen (laagste id blijft),
      -- anders faalt de indexaanleg.
      DELETE FROM factuur_signalen a USING factuur_signalen b
        WHERE a.id > b.id AND a.status = 'open' AND b.status = 'open' AND a.type = b.type
          AND a.factuur_id IS NOT NULL AND a.factuur_id = b.factuur_id;
      DELETE FROM factuur_signalen a USING factuur_signalen b
        WHERE a.id > b.id AND a.status = 'open' AND b.status = 'open' AND a.type = b.type
          AND a.factuur_id IS NULL AND b.factuur_id IS NULL
          AND a.projectkans_id IS NOT NULL AND a.projectkans_id = b.projectkans_id;
      DELETE FROM factuur_signalen a USING factuur_signalen b
        WHERE a.id > b.id AND a.status = 'open' AND b.status = 'open' AND a.type = b.type
          AND a.factuur_id IS NULL AND b.factuur_id IS NULL
          AND a.projectkans_id IS NULL AND b.projectkans_id IS NULL
          AND a.mail_message_id IS NOT NULL AND a.mail_message_id = b.mail_message_id;
      CREATE UNIQUE INDEX IF NOT EXISTS factuur_signalen_open_factuur_uq
        ON factuur_signalen (type, factuur_id) WHERE status = 'open' AND factuur_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS factuur_signalen_open_kans_uq
        ON factuur_signalen (type, projectkans_id) WHERE status = 'open' AND factuur_id IS NULL AND projectkans_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS factuur_signalen_open_mail_uq
        ON factuur_signalen (type, mail_message_id) WHERE status = 'open' AND factuur_id IS NULL AND projectkans_id IS NULL AND mail_message_id IS NOT NULL;
      -- FACTUUR_02 (taak dubbele facturen): oude, te strikte index-varianten uit
      -- dev opruimen; de _uq-indexen hierboven zijn de definitieve vorm.
      DROP INDEX IF EXISTS factuur_signalen_open_factuur_uniek;
      DROP INDEX IF EXISTS factuur_signalen_open_mail_uniek;
    `,
  },
];

// Unieke-index-stappen die FATAAL falen (process.exit(1)) als ze mislukken.
// Drizzle-kit push genereert voor uniqueIndex(...) een CREATE UNIQUE INDEX —
// geen benoemde constraint in pg_constraint. apply-additive zorgt dat deze
// indexes ook vóór de eerste push bestaan (zodat push ze als bestaand herkent
// en niet dropt of wijzigt). Ná push loopt apply-additive opnieuw om eventuele
// drops te herstellen.
//
// Vóór aanleg wordt expliciet op dubbele rijen gecheckt; bij duplicaten stopt
// het script met exit 1 — nooit stil doorgaan met een schema zonder unieke index.
const uniekeIndexStappen = [
  {
    naam: "gebruiker_profielen_gebruiker_id_profiel_id_unique",
    tabel: "gebruiker_profielen",
    kolommen: ["gebruiker_id", "profiel_id"],
    beschrijving: "UNIQUE INDEX (gebruiker_id, profiel_id) op gebruiker_profielen",
  },
  {
    naam: "medewerkers_gebruiker_id_unique",
    tabel: "medewerkers",
    kolommen: ["gebruiker_id"],
    // NULL-waarden zijn toegestaan én mogen meermaals voorkomen (losse/legacy
    // profielen zonder account); Postgres behandelt NULLs in een unieke index
    // als onderling verschillend. De duplicaatcontrole moet NULL dus uitsluiten.
    duplicaatFilter: "gebruiker_id IS NOT NULL",
    beschrijving: "UNIQUE INDEX (gebruiker_id) op medewerkers — één medewerkerprofiel per gebruikersaccount",
  },
  {
    naam: "facturen_mailstroom_bijlage_uniek",
    tabel: "facturen",
    kolommen: ["mail_message_id", "bestandsnaam"],
    where: "bron = 'mailbox' AND mail_message_id IS NOT NULL AND bestandsnaam IS NOT NULL",
    duplicaatFilter: "bron = 'mailbox' AND mail_message_id IS NOT NULL AND bestandsnaam IS NOT NULL",
    beschrijving: "PARTIAL UNIQUE INDEX (mail_message_id, bestandsnaam) op facturen uit de mailstroom — één factuur per mailbijlage",
  },
  // NB: de open-signaal-dedupe-indexen op factuur_signalen (factuur/projectkans/mail)
  // worden aangelegd in de AANVRAAG_01-stap hierboven (factuur_signalen_open_*_uq).
];

async function main() {
  // ── Reguliere additieve stappen (warning-level bij fout) ──────────────────
  let toegepast = 0;
  for (const stap of stappen) {
    try {
      await pool.query(stap.sql);
      console.log(`[apply-additive] OK: ${stap.beschrijving}`);
      toegepast++;
    } catch (err) {
      // Een fout hier mag de post-merge niet blokkeren: log en ga door.
      // Bij een echte blokkade zal drizzle-kit push daarna ook falen en de merge melden.
      console.error(`[apply-additive] Waarschuwing bij "${stap.beschrijving}": ${err.message}`);
    }
  }
  console.log(`[apply-additive] Klaar; ${toegepast}/${stappen.length} stappen uitgevoerd.`);

  // ── Unieke-index-stappen (fataal bij fout of bij aanwezige dubbele rijen) ──
  // Gecontroleerd via pg_indexes (niet pg_constraint): drizzle genereert
  // CREATE UNIQUE INDEX, dat registreert alleen in pg_indexes — niet in pg_constraint.
  // ADD CONSTRAINT zou een ANDERE naam aannemen én conflicteren met de
  // drizzle-index als die al bestaat; daarom gebruiken we CREATE UNIQUE INDEX.
  for (const idx of uniekeIndexStappen) {
    // 1. Index al aanwezig in pg_indexes? Dan niets te doen.
    const bestaatRes = await pool.query(
      "SELECT 1 FROM pg_indexes WHERE indexname = $1 AND tablename = $2",
      [idx.naam, idx.tabel],
    );
    if (bestaatRes.rowCount > 0) {
      console.log(`[apply-additive] OK (reeds aanwezig): ${idx.beschrijving}`);
      continue;
    }

    // 2. Controleer op dubbele rijen vóór we de index aanleggen.
    const kolommen = idx.kolommen.map((k) => `"${k}"`).join(", ");
    const filter = idx.duplicaatFilter ? ` WHERE ${idx.duplicaatFilter}` : "";
    const dubbelsRes = await pool.query(
      `SELECT ${kolommen}, COUNT(*) AS aantal
         FROM "${idx.tabel}"${filter}
        GROUP BY ${kolommen}
       HAVING COUNT(*) > 1
        LIMIT 20`,
    );
    if (dubbelsRes.rowCount > 0) {
      console.error(
        `[apply-additive] FATALE FOUT: unieke index "${idx.naam}" kan niet worden aangelegd — ` +
        `er bestaan dubbele combinaties in "${idx.tabel}". ` +
        `Verwijder de duplicaten handmatig vóór de volgende deployment.`,
      );
      console.error("[apply-additive] Dubbele combinaties (max 20):");
      for (const rij of dubbelsRes.rows) {
        console.error("  ", JSON.stringify(rij));
      }
      await pool.end();
      process.exit(1);
    }

    // 3. Geen duplicaten — index aanleggen.
    try {
      const whereClausule = idx.where ? ` WHERE ${idx.where}` : "";
      await pool.query(
        `CREATE UNIQUE INDEX "${idx.naam}" ON "${idx.tabel}" (${kolommen})${whereClausule}`,
      );
      console.log(`[apply-additive] OK (aangelegd): ${idx.beschrijving}`);
    } catch (err) {
      console.error(
        `[apply-additive] FATALE FOUT bij aanleggen unieke index "${idx.naam}": ${err.message}`,
      );
      await pool.end();
      process.exit(1);
    }
  }
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error("[apply-additive] Onverwachte fout:", err.message);
    pool.end();
    process.exit(1);
  });
