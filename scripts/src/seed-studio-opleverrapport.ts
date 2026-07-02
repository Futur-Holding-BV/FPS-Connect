// Seed van een goedgekeurd Document Studio-model voor het type "opleverrapport".
// Idempotent: alleen aanmaken als er nog geen model bestaat voor (werkgever_id, "opleverrapport").
// Draait: pnpm --filter @workspace/scripts run seed-studio-opleverrapport
import { db, documentStudioModellenTable, werkgeversTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const TEMPLATE_JSON = JSON.stringify({
  familie:    "A",
  koptekst: {
    logo_positie: "rechts",
    titel:        "Opleverrapport Brandpreventieve Voorzieningen",
    subinfo:      "Brandveiligheid door vakmanschap",
  },
  kleurschema: {
    primair:   "#F23B0D",
    secundair: "#212631",
    tekst:     "#1e293b",
  },
  secties: [
    {
      type:   "tekst",
      titel:  "Samenvatting",
      inhoud: "Dit rapport beschrijft de brandpreventieve voorzieningen die zijn aangebracht en opgeleverd in het betreffende pand.",
    },
    {
      type:   "tabel",
      titel:  "Overzicht voorzieningen",
      inhoud: "Type | Locatie | Status | Opmerking",
    },
    {
      type:   "ondertekening",
      titel:  "Ondertekening",
      inhoud: "Opgesteld door | Datum | Handtekening",
    },
  ],
  voettekst: "Brandveiligheid door vakmanschap — FPS Brandpreventie",
});

async function main() {
  const werkgevers = await db.select({ id: werkgeversTable.id, naam: werkgeversTable.naam }).from(werkgeversTable);

  let aangemaakt = 0;
  let overgeslagen = 0;

  for (const wg of werkgevers) {
    const [bestaand] = await db
      .select({ id: documentStudioModellenTable.id })
      .from(documentStudioModellenTable)
      .where(
        and(
          eq(documentStudioModellenTable.werkgeverId, wg.id),
          eq(documentStudioModellenTable.documentType, "opleverrapport"),
        ),
      );

    if (bestaand) {
      overgeslagen++;
      continue;
    }

    await db.insert(documentStudioModellenTable).values({
      werkgeverId:         wg.id,
      documentType:        "opleverrapport",
      naam:                `Opleverrapport — ${wg.naam}`,
      status:              "goedgekeurd",
      connectTemplateJson: TEMPLATE_JSON,
      versie:              1,
      goedgekeurdOp:       new Date(),
      goedgekeurdDoor:     null,
      bijgewerktOp:        new Date(),
    });

    aangemaakt++;
    console.log(`  Aangemaakt: opleverrapport-model voor "${wg.naam}" (id ${wg.id})`);
  }

  console.log(`Seed klaar: ${aangemaakt} modellen aangemaakt, ${overgeslagen} overgeslagen (reeds aanwezig).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
