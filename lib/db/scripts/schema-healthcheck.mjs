// Schema-healthcheck — draait NA drizzle-kit push in de post-merge flow.
//
// Waarom: drizzle-kit push --force kan bij FK-afhankelijkheden of een non-TTY
// omgeving stil eindigen terwijl niet alle kolommen daadwerkelijk zijn aangemaakt.
// Dit script voert per kerntabel een SELECT uit op de kritieke kolommen
// (inclusief recent toegevoegde kolommen die in het verleden ontbraken).
// Bij een ontbrekende tabel of kolom faalt het script direct met een duidelijke
// foutmelding, zodat de merge-fout meteen zichtbaar is — vóórdat list-endpoints
// kapot gaan.
//
// Puur lezend: geen INSERT, UPDATE, DELETE of DDL. Veilig voor productie.

import pg from "pg";

const { Pool } = pg;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[schema-healthcheck] DATABASE_URL ontbreekt; overslaan.");
  process.exit(0);
}

const pool = new Pool({ connectionString: url });

// Elke check bevat een tabel en de kolommen die gevalideerd worden.
// SELECT met LIMIT 0 leest geen rijen — alleen de kolomdefinities worden gecontroleerd.
const checks = [
  {
    tabel: "labels",
    kolommen: ["id", "naam", "fabrikant", "testnorm", "fabrikant_id"],
    beschrijving: "labels (inclusief fabrikant_id FK)",
  },
  {
    tabel: "fabrikanten",
    kolommen: ["id", "naam", "gearchiveerd"],
    beschrijving: "fabrikanten (inclusief gearchiveerd-vlag)",
  },
  {
    tabel: "voorzieningen",
    kolommen: [
      "id",
      "objectnummer",
      "type",
      "status",
      "gebouw_id",
      "verdieping_id",
      "cluster_id",
      "monteur_id",
      "maker_monteur_id",
      "parent_spot_id",
      "gearchiveerd",
    ],
    beschrijving: "voorzieningen (inclusief cluster_id, maker_monteur_id, parent_spot_id)",
  },
  {
    tabel: "clusters",
    kolommen: ["id", "gebouw_id", "verdieping_id", "naam", "type", "kleur"],
    beschrijving: "clusters (complete tabel)",
  },
  {
    tabel: "medewerkers",
    kolommen: [
      "id",
      "naam",
      "email",
      "werkmaatschappij",
      "werkgever_id",
      "functie_id",
      "contracturen_per_week",
      "in_dienst_sinds",
    ],
    beschrijving: "medewerkers (inclusief contracturen_per_week)",
  },
  {
    tabel: "opleverrapporten",
    kolommen: [
      "id",
      "gebouw_id",
      "werkbon_id",
      "rapport_type",
      "versie",
      "status",
      "reactietermijn_datum",
      "reactietermijn_gestart_op",
      "vervangen_door_rapport_id",
      "vervangen_op",
      "certificaat_geaccordeerd",
      "certificaat_garantie_maanden",
      "klant_reactie_op",
      "klant_reactie_type",
      "aangemaakt_door",
      "aangemaakt_op",
      "bijgewerkt_op",
    ],
    beschrijving: "opleverrapporten (inclusief werkbon_id, reactietermijn-, vervangings- en klant-reactiekolommen V1.4/V1.5)",
  },
  {
    tabel: "inbox_items",
    kolommen: ["id", "ai_geconsolideerd", "ai_opslaglocatie"],
    beschrijving: "inbox_items (inclusief ai_geconsolideerd en ai_opslaglocatie)",
  },
  {
    tabel: "verlofaanvragen",
    kolommen: ["id", "bezetting_overschreden"],
    beschrijving: "verlofaanvragen (inclusief bezetting_overschreden-vlag)",
  },
  {
    tabel: "app_instellingen",
    kolommen: ["id", "moments_verjaardag_ingeschakeld"],
    beschrijving: "app_instellingen (inclusief moments_verjaardag_ingeschakeld-vlag)",
  },
  {
    tabel: "gebruiker_profielen",
    kolommen: ["id", "gebruiker_id", "profiel_id", "aangemaakt_op"],
    beschrijving: "gebruiker_profielen (P2 koppeltabel meerdere rollen per gebruiker)",
  },
  {
    tabel: "document_classificatie_correcties",
    kolommen: ["id", "bestandshash", "originele_categorie", "gecorrigeerde_categorie", "werkmaatschappij", "bewijs_signalen", "aangemaakt_op"],
    beschrijving: "document_classificatie_correcties (correctie-leerloop Document Intelligence)",
  },
];

// Unieke indexes die via apply-additive.mjs worden aangelegd en die drizzle-kit
// push eveneens genereert als CREATE UNIQUE INDEX (uniqueIndex in het schema).
// Gecontroleerd via pg_indexes — NIET pg_constraint, want drizzle maakt geen
// benoemde constraint-records aan, alleen een unique index in pg_indexes.
// apply-additive.mjs draait vóór én na push (zie Dockerfile.migrate) zodat
// de index altijd aanwezig is wanneer deze healthcheck loopt.
const uniekeIndexChecks = [
  {
    naam: "gebruiker_profielen_gebruiker_id_profiel_id_unique",
    tabel: "gebruiker_profielen",
    beschrijving: "UNIQUE INDEX (gebruiker_id, profiel_id) op gebruiker_profielen",
  },
];

function quoteIdent(id) {
  return '"' + String(id).replace(/"/g, '""') + '"';
}

async function main() {
  let fouten = 0;

  for (const check of checks) {
    const kolomLijst = check.kolommen.map(quoteIdent).join(", ");
    const sql = `SELECT ${kolomLijst} FROM ${quoteIdent(check.tabel)} LIMIT 0`;

    try {
      await pool.query(sql);
      console.log(`[schema-healthcheck] OK: ${check.beschrijving}`);
    } catch (err) {
      console.error(
        `[schema-healthcheck] FOUT bij "${check.beschrijving}": ${err.message}`,
      );
      fouten++;
    }
  }

  for (const check of uniekeIndexChecks) {
    try {
      const res = await pool.query(
        "SELECT 1 FROM pg_indexes WHERE indexname = $1 AND tablename = $2",
        [check.naam, check.tabel],
      );
      if (res.rowCount > 0) {
        console.log(`[schema-healthcheck] OK: unieke index ${check.beschrijving}`);
      } else {
        console.error(
          `[schema-healthcheck] FOUT: unieke index ontbreekt — ${check.beschrijving} (${check.naam}). ` +
          `apply-additive.mjs legt deze aan; controleer of de migrate-image correct is gebouwd.`,
        );
        fouten++;
      }
    } catch (err) {
      console.error(
        `[schema-healthcheck] FOUT bij unieke-index-check "${check.beschrijving}": ${err.message}`,
      );
      fouten++;
    }
  }

  if (fouten > 0) {
    console.error(
      `[schema-healthcheck] ${fouten} check(s) mislukt — schema is niet volledig bijgewerkt.`,
    );
    console.error(
      `[schema-healthcheck] Controleer apply-additive.mjs en voeg ontbrekende stappen toe.`,
    );
    process.exit(1);
  }

  console.log(
    `[schema-healthcheck] Alle ${checks.length + uniekeIndexChecks.length} checks geslaagd.`,
  );
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error("[schema-healthcheck] Onverwachte fout:", err.message);
    pool.end();
    process.exit(1);
  });
