import {
  db,
  facturenTable,
  factuurImportInstellingenTable,
  factuurImportLogTable,
  leveranciersTable,
} from "@workspace/db";
import { eq, ilike } from "drizzle-orm";
import { randomUUID, createHash } from "crypto";
import type { Logger } from "pino";
import { haalGraphAppToken, isGeconfigureerd as mailIsGeconfigureerd } from "./email";
import { ObjectStorageService } from "../lib/objectStorage";
import { leesFactuurUitMetAi } from "./factuurUitlezen";

const objectStorage = new ObjectStorageService();

// Herkende factuurformaten in mailbijlagen.
const PDF_EXT = [".pdf"];
const XML_EXT = [".xml", ".ubl"];
const BEELD_EXT = [".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".gif"];

function bepaalFormaat(naam: string, contentType: string): "pdf" | "ubl_xml" | "afbeelding" | "overig" {
  const lower = naam.toLowerCase();
  if (PDF_EXT.some((e) => lower.endsWith(e)) || contentType.includes("pdf")) return "pdf";
  if (XML_EXT.some((e) => lower.endsWith(e)) || contentType.includes("xml")) return "ubl_xml";
  if (BEELD_EXT.some((e) => lower.endsWith(e)) || contentType.startsWith("image/")) return "afbeelding";
  return "overig";
}

type GraphBijlage = {
  "@odata.type"?: string;
  id: string;
  name: string;
  contentType: string;
  contentBytes?: string;
};
type GraphBericht = {
  id: string;
  subject?: string;
  from?: { emailAddress?: { address?: string; name?: string } };
  hasAttachments?: boolean;
};

async function graphGet<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const tekst = await res.text().catch(() => "");
    throw new Error(`Graph ${res.status}: ${tekst.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

// ── UBL/XML lichte extractie ────────────────────────────────────────────────
// Haalt de kernvelden uit een UBL/e-factuur zonder externe XML-parser: voldoende
// om een factuurrecord voor te vullen; een mens controleert alles alsnog.
function xmlWaarde(xml: string, tags: string[]): string | null {
  for (const tag of tags) {
    const m = xml.match(new RegExp(`<[^>]*${tag}[^>]*>([^<]+)</[^>]*${tag}[^>]*>`, "i"));
    if (m && m[1]) return m[1].trim();
  }
  return null;
}

function parseUbl(xml: string): {
  factuurnummer: string | null; factuurdatum: string | null; vervaldatum: string | null;
  relatienaam: string | null; iban: string | null;
  bedragExclBtw: string | null; btwBedrag: string | null; bedragInclBtw: string | null;
} {
  // Leveranciersnaam: eerste RegistrationName / PartyName Name binnen AccountingSupplierParty
  let relatienaam: string | null = null;
  const supplierBlok = xml.match(/AccountingSupplierParty[\s\S]*?<\/[^>]*AccountingSupplierParty>/i);
  if (supplierBlok) {
    relatienaam = xmlWaarde(supplierBlok[0], ["RegistrationName", "Name"]);
  }
  if (!relatienaam) relatienaam = xmlWaarde(xml, ["RegistrationName"]);

  const iban = xmlWaarde(xml, ["PaymentMeansID"]) ?? (() => {
    const m = xml.match(/PayeeFinancialAccount[\s\S]*?<[^>]*ID[^>]*>([^<]+)</i);
    return m && m[1] ? m[1].trim() : null;
  })();

  return {
    factuurnummer: xmlWaarde(xml, ["ID"]),
    factuurdatum: xmlWaarde(xml, ["IssueDate"]),
    vervaldatum: xmlWaarde(xml, ["DueDate"]),
    relatienaam,
    iban: iban ? iban.replace(/\s/g, "") : null,
    bedragExclBtw: xmlWaarde(xml, ["TaxExclusiveAmount", "LineExtensionAmount"]),
    btwBedrag: xmlWaarde(xml, ["TaxAmount"]),
    bedragInclBtw: xmlWaarde(xml, ["PayableAmount", "TaxInclusiveAmount"]),
  };
}

export interface ImportResultaat {
  ok: boolean;
  gecontroleerd: number;
  aangemaakt: number;
  overgeslagen: number;
  mislukt: number;
  melding: string;
}

/**
 * Poll de geconfigureerde financiële postbus, maak per herkende factuurbijlage een
 * factuurrecord aan (bron = mailbox), lees PDF/afbeelding uit via AI en UBL/XML via
 * lichte extractie. Dedupliceert op (messageId + bijlagenaam). AI stelt voor; een
 * mens beoordeelt — er wordt niets automatisch geboekt of verstuurd.
 */
export async function synchroniseerMailboxFacturen(log: Logger): Promise<ImportResultaat> {
  const [inst] = await db.select().from(factuurImportInstellingenTable).limit(1);
  if (!inst || !inst.actief) {
    return { ok: false, gecontroleerd: 0, aangemaakt: 0, overgeslagen: 0, mislukt: 0, melding: "Mailbox-import is niet ingeschakeld." };
  }
  const mailbox = inst.mailboxAdres?.trim();
  if (!mailbox) {
    return { ok: false, gecontroleerd: 0, aangemaakt: 0, overgeslagen: 0, mislukt: 0, melding: "Geen postbusadres ingesteld." };
  }
  if (!mailIsGeconfigureerd()) {
    return { ok: false, gecontroleerd: 0, aangemaakt: 0, overgeslagen: 0, mislukt: 0, melding: "Microsoft 365 is niet geconfigureerd." };
  }

  let aangemaakt = 0, overgeslagen = 0, mislukt = 0, gecontroleerd = 0;

  try {
    const token = await haalGraphAppToken();
    const lijstUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/mailFolders/inbox/messages?$filter=hasAttachments eq true&$top=25&$select=id,subject,from,hasAttachments&$orderby=receivedDateTime desc`;
    const lijst = await graphGet<{ value: GraphBericht[] }>(lijstUrl, token);

    for (const bericht of lijst.value ?? []) {
      const afzender = bericht.from?.emailAddress?.address ?? null;
      const bijlagenUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages/${bericht.id}/attachments`;
      const bijlagen = await graphGet<{ value: GraphBijlage[] }>(bijlagenUrl, token);

      for (const bijlage of bijlagen.value ?? []) {
        if (bijlage["@odata.type"] && !bijlage["@odata.type"].includes("fileAttachment")) continue;
        const formaat = bepaalFormaat(bijlage.name, bijlage.contentType ?? "");
        if (formaat === "overig") continue;
        gecontroleerd++;

        const inhoud = bijlage.contentBytes ? Buffer.from(bijlage.contentBytes, "base64") : null;
        if (!inhoud) { continue; }
        const hash = createHash("sha256").update(inhoud).digest("hex");

        try {
          // Atomair claimen via unieke constraint (messageId + bijlageNaam)
          const [logRij] = await db.insert(factuurImportLogTable).values({
            messageId: bericht.id,
            bijlageNaam: bijlage.name,
            bijlageHash: hash,
            formaat,
            afzender,
            onderwerp: bericht.subject ?? null,
            status: "verwerkt",
          }).onConflictDoNothing().returning();

          if (!logRij) { overgeslagen++; continue; } // al eerder verwerkt

          // Uploaden naar object storage
          const ext = bijlage.name.includes(".") ? bijlage.name.slice(bijlage.name.lastIndexOf(".")) : "";
          const subPath = `algemeen/factuur-import/${randomUUID()}${ext}`;
          const pdfUrl = await objectStorage.uploadBestand(subPath, inhoud, bijlage.contentType ?? "application/octet-stream");

          // Factuurrecord aanmaken
          const [factuur] = await db.insert(facturenTable).values({
            type: "inkoop",
            bron: "mailbox",
            status: "ontvangen",
            pdfUrl,
            bestandsnaam: bijlage.name,
            omschrijving: bericht.subject ?? null,
          }).returning();

          if (!factuur) { mislukt++; continue; }

          if (formaat === "ubl_xml") {
            const xml = inhoud.toString("utf-8");
            const u = parseUbl(xml);
            let leverancierId: number | null = null;
            if (u.iban) {
              const [lev] = await db.select({ id: leveranciersTable.id }).from(leveranciersTable)
                .where(eq(leveranciersTable.iban, u.iban)).limit(1);
              leverancierId = lev?.id ?? null;
            }
            if (!leverancierId && u.relatienaam) {
              const [lev] = await db.select({ id: leveranciersTable.id }).from(leveranciersTable)
                .where(ilike(leveranciersTable.naam, `%${u.relatienaam}%`)).limit(1);
              leverancierId = lev?.id ?? null;
            }
            await db.update(facturenTable).set({
              factuurnummer: u.factuurnummer,
              factuurdatum: u.factuurdatum,
              vervaldatum: u.vervaldatum,
              relatienaam: u.relatienaam,
              bedragExclBtw: u.bedragExclBtw,
              btwBedrag: u.btwBedrag,
              bedragInclBtw: u.bedragInclBtw,
              ibanUitgelezen: u.iban,
              leverancierId,
              aiMetadata: { bron: "ubl", ...u } as Record<string, unknown>,
              status: "te_beoordelen_pl",
              bijgewerktOp: new Date(),
            }).where(eq(facturenTable.id, factuur.id));
          } else {
            // PDF of afbeelding → AI-uitlezing (zelfde motor als handmatig)
            const res = await leesFactuurUitMetAi(factuur.id, log);
            if (!res.ok) {
              await db.update(factuurImportLogTable).set({ foutmelding: res.error }).where(eq(factuurImportLogTable.id, logRij.id));
            }
          }

          await db.update(factuurImportLogTable).set({ factuurId: factuur.id }).where(eq(factuurImportLogTable.id, logRij.id));
          aangemaakt++;
        } catch (err) {
          mislukt++;
          log.error(err, "factuur-import bijlage mislukt");
        }
      }
    }

    const melding = `Import voltooid: ${aangemaakt} aangemaakt, ${overgeslagen} overgeslagen, ${mislukt} mislukt (${gecontroleerd} bijlagen gecontroleerd).`;
    await db.update(factuurImportInstellingenTable).set({
      laatsteSyncOp: new Date(),
      laatsteSyncResultaat: melding,
      bijgewerktOp: new Date(),
    }).where(eq(factuurImportInstellingenTable.id, inst.id));

    return { ok: true, gecontroleerd, aangemaakt, overgeslagen, mislukt, melding };
  } catch (err) {
    log.error(err, "factuur-mailbox-import mislukt");
    const melding = err instanceof Error ? err.message : "Onbekende fout bij mailbox-import.";
    await db.update(factuurImportInstellingenTable).set({
      laatsteSyncOp: new Date(),
      laatsteSyncResultaat: `Mislukt: ${melding}`,
      bijgewerktOp: new Date(),
    }).where(eq(factuurImportInstellingenTable.id, inst.id));
    return { ok: false, gecontroleerd, aangemaakt, overgeslagen, mislukt, melding };
  }
}
