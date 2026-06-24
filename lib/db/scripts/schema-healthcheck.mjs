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
    kolommen: ["id", "naam", "fabrikant", "norm", "testnorm", "fabrikant_id"],
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

  if (fouten > 0) {
    console.error(
      `[schema-healthcheck] ${fouten} check(s) mislukt — schema is niet volledig bijgewerkt.`,
    );
    console.error(
      `[schema-healthcheck] Controleer apply-additive.mjs en voeg ontbrekende kolommen toe.`,
    );
    process.exit(1);
  }

  console.log(
    `[schema-healthcheck] Alle ${checks.length} schema-checks geslaagd.`,
  );
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error("[schema-healthcheck] Onverwachte fout:", err.message);
    pool.end();
    process.exit(1);
  });
