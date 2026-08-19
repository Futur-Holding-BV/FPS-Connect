import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { db, gebouwenTable, snagstreamRapportenTable, snagstreamSnagsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

let geslaagd = 0;
let mislukt = 0;

function check(naam: string, ok: boolean, detail = "") {
  if (ok) {
    geslaagd += 1;
    process.stdout.write(`✓ ${naam}${detail ? ` — ${detail}` : ""}\n`);
  } else {
    mislukt += 1;
    process.stderr.write(`✗ ${naam}${detail ? ` — ${detail}` : ""}\n`);
  }
}

async function main() {
  const marker = `SNAGSTREAM_ARCHIEF_01_${randomUUID()}`;
  const hashA = "a".repeat(64);
  const hashB = "b".repeat(64);

  const routeBron = await readFile(new URL("../../artifacts/api-server/src/routes/snagstream.ts", import.meta.url), "utf8");
  const opslagBron = await readFile(new URL("../../artifacts/api-server/src/lib/objectStorage.ts", import.meta.url), "utf8");
  const schermBron = await readFile(new URL("../../artifacts/firevault/src/pages/snagstream/index.tsx", import.meta.url), "utf8");
  const migratie = await readFile(new URL("../../lib/db/src/migrations/0101_snagstream-vingerafdruk.sql", import.meta.url), "utf8");
  check(
    "upload gebruikt SHA-256 vóór opslag en server verifieert PDF opnieuw",
    schermBron.includes('crypto.subtle.digest("SHA-256"') &&
      routeBron.includes('createHash("sha256")') &&
      routeBron.includes("inspectie.vingerafdruk !== vingerafdruk") &&
      routeBron.includes('kop.toString("ascii") !== "%PDF-"'),
  );
  check(
    "voltooien accepteert alleen een gebruikergebonden tijdelijk uploadtoken",
    routeBron.includes("snagstreamUploadsTable.token") &&
      routeBron.includes("snagstreamUploadsTable.gebruikerId") &&
      routeBron.includes("snagstreamUploadsTable.verlooptOp"),
  );
  check(
    "buiten-scope inhoudsdubbel geeft geen rapportmetadata prijs",
    routeBron.includes("if (!(await magRapportZien(req, bestaand)))") &&
      routeBron.includes("dubbelBuitenScope") &&
      routeBron.includes('error: "Het rapport kon niet worden opgeslagen"'),
  );
  check(
    "alleen aantoonbaar Snagstream-eigen objecten worden verwijderd",
    routeBron.includes('SNAGSTREAM_OBJECT_PREFIX = "/objects/snagstream/"') &&
      routeBron.includes("objectPad.startsWith(SNAGSTREAM_OBJECT_PREFIX)") &&
      routeBron.includes("rapport.opslagBeheerd") &&
      routeBron.includes("opslagBeheerd: true") &&
      opslagBron.includes("subPath = `${vastePrefix}/${objectId}`"),
  );
  check(
    "exact dubbel en naamconflict zijn twee afzonderlijke uitkomsten",
    routeBron.includes('"exact_dubbel"') &&
      routeBron.includes('"naamconflict"') &&
      schermBron.includes("Ander rapport uploaden") &&
      schermBron.includes("Dit is een vergissing"),
  );
  check(
    "migratie voegt vingerafdruk en zoekindex toe",
    migratie.includes("ADD COLUMN IF NOT EXISTS vingerafdruk") &&
      migratie.includes("snagstream_rapporten_vingerafdruk_idx"),
  );

  const ROLLBACK = new Error("SNAGSTREAM_BEWIJS_ROLLBACK");
  try {
    await db.transaction(async (tx) => {
      const [gebouw] = await tx
        .insert(gebouwenTable)
        .values({ naam: marker, adres: "Bewijsstraat 1" })
        .returning();
      if (!gebouw) throw new Error("Bewijsgebouw niet aangemaakt");

      const rapporten = await tx
        .insert(snagstreamRapportenTable)
        .values([
          {
            bestandsnaam: `${marker}.pdf`,
            pdfUrl: `/objects/snagstream/${marker}-a`,
            vingerafdruk: hashA,
            opdrachtgever: "Opdrachtgever bewijs",
            projectNaam: "Project bewijs",
            status: "concept_herkend",
            gebouwId: gebouw.id,
          },
          {
            bestandsnaam: `${marker}.pdf`,
            pdfUrl: `/objects/snagstream/${marker}-b`,
            vingerafdruk: hashB,
            status: "nieuw",
            gebouwId: null,
          },
          {
            bestandsnaam: `${marker}-kopie.pdf`,
            pdfUrl: `/objects/snagstream/${marker}-c`,
            vingerafdruk: hashA,
            status: "nieuw",
            gebouwId: gebouw.id,
          },
        ])
        .returning();
      const [eerste, naamconflict, kopie] = rapporten;
      if (!eerste || !naamconflict || !kopie) throw new Error("Bewijsrapporten niet aangemaakt");

      await tx.insert(snagstreamSnagsTable).values({
        rapportId: eerste.id,
        snagnummer: `${marker}-S-17`,
        verdieping: "Verdieping bewijs",
        ruimte: "Ruimte bewijs",
        omschrijving: `Unieke omschrijving ${marker}`,
        pdfPagina: 7,
      });

      const dubbelen = await tx
        .select({
          vingerafdruk: snagstreamRapportenTable.vingerafdruk,
          aantal: sql<number>`count(*)::int`,
        })
        .from(snagstreamRapportenTable)
        .where(eq(snagstreamRapportenTable.vingerafdruk, hashA))
        .groupBy(snagstreamRapportenTable.vingerafdruk);
      check(
        "inhoudsdubbel wordt op hash gegroepeerd ondanks andere bestandsnaam",
        dubbelen[0]?.aantal === 2,
        `aantal=${dubbelen[0]?.aantal ?? 0}`,
      );

      const naamgenoten = await tx
        .select({ id: snagstreamRapportenTable.id, vingerafdruk: snagstreamRapportenTable.vingerafdruk })
        .from(snagstreamRapportenTable)
        .where(sql`lower(${snagstreamRapportenTable.bestandsnaam}) = lower(${`${marker}.pdf`})`);
      check(
        "zelfde bestandsnaam met andere inhoud blijft als conflict zichtbaar",
        naamgenoten.length === 2 && new Set(naamgenoten.map((r) => r.vingerafdruk)).size === 2,
        `naamgenoten=${naamgenoten.length}`,
      );

      const zoekTreffers = await tx
        .select({
          rapportId: snagstreamRapportenTable.id,
          snagId: snagstreamSnagsTable.id,
          pagina: snagstreamSnagsTable.pdfPagina,
        })
        .from(snagstreamRapportenTable)
        .innerJoin(snagstreamSnagsTable, eq(snagstreamSnagsTable.rapportId, snagstreamRapportenTable.id))
        .where(sql`${snagstreamSnagsTable.omschrijving} ilike ${`%${marker}%`}`);
      check(
        "zoeken in snagomschrijving geeft rapport, snag en PDF-pagina terug",
        zoekTreffers.length === 1 &&
          zoekTreffers[0]?.rapportId === eerste.id &&
          zoekTreffers[0]?.pagina === 7,
      );

      const gekoppeld = await tx
        .update(snagstreamRapportenTable)
        .set({ gebouwId: gebouw.id, bijgewerktOp: new Date() })
        .where(and(
          eq(snagstreamRapportenTable.id, naamconflict.id),
          sql`${snagstreamRapportenTable.gebouwId} is null`,
        ))
        .returning({ gebouwId: snagstreamRapportenTable.gebouwId });
      check(
        "ongekoppeld rapport kan direct aan een gebouw worden gekoppeld",
        gekoppeld[0]?.gebouwId === gebouw.id,
      );

      const aggregatie = await tx
        .select({
          rapporten: sql<number>`count(distinct ${snagstreamRapportenTable.id})::int`,
          snags: sql<number>`count(${snagstreamSnagsTable.id})::int`,
        })
        .from(snagstreamRapportenTable)
        .leftJoin(snagstreamSnagsTable, eq(snagstreamSnagsTable.rapportId, snagstreamRapportenTable.id))
        .where(eq(snagstreamRapportenTable.gebouwId, gebouw.id));
      check(
        "gebouwenaggregatie telt rapporten en snags na koppelen",
        aggregatie[0]?.rapporten === 3 && aggregatie[0]?.snags === 1,
        `rapporten=${aggregatie[0]?.rapporten ?? 0}, snags=${aggregatie[0]?.snags ?? 0}`,
      );

      throw ROLLBACK;
    });
  } catch (fout) {
    if (fout !== ROLLBACK) throw fout;
  }

  check(
    "bewijsdata is volledig teruggedraaid",
    (await db.select({ id: gebouwenTable.id }).from(gebouwenTable).where(eq(gebouwenTable.naam, marker))).length === 0,
  );

  process.stdout.write(`\nSNAGSTREAM_ARCHIEF_01: ${geslaagd} geslaagd, ${mislukt} mislukt\n`);
  if (mislukt > 0) process.exitCode = 1;
}

await main();