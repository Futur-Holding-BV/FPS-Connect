import type { Request } from "express";
import {
  db,
  gebouwenTable,
  calculatiesTable,
  crmKlantenTable,
  dossiersTable,
  documentenTable,
  documentKoppelingenTable,
  offertesTable,
  opdrachtenTable,
  prijsafsprakenTable,
  voertuigenTable,
  voorzieningenTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import {
  isKoppelingDoelType,
  zichtbareProductrapportDocumentIds,
} from "./documenten";

const CONTEXT_MODULE: Record<string, string> = {
  gebouw: "gebouwen",
  klant: "crm",
  offerte: "offertes",
  dossier: "projecten",
  voorziening: "voorzieningen",
  opdracht: "projecten",
  voertuig: "wagenpark",
  prijsafspraak: "inkoop",
  calculatie: "calculaties",
};

export async function magContextDoel(
  req: Request,
  doelType: string,
  doelId: number,
  niveau: 1 | 2 | 3 | 4,
): Promise<boolean> {
  const permissies = req.permissies;
  const moduleId = CONTEXT_MODULE[doelType];
  if (
    !permissies ||
    !moduleId ||
    !Number.isInteger(doelId) ||
    doelId <= 0 ||
    (!permissies.isHoofdbeheerder &&
      !permissies.heeftModuleRecht(moduleId as never, niveau))
  ) {
    return false;
  }

  let bestaat = false;
  let gebouwId: number | null | undefined;
  if (doelType === "gebouw") {
    const [row] = await db
      .select({ id: gebouwenTable.id })
      .from(gebouwenTable)
      .where(eq(gebouwenTable.id, doelId));
    bestaat = Boolean(row);
    gebouwId = doelId;
  } else if (doelType === "opdracht") {
    const [row] = await db
      .select({ gebouwId: opdrachtenTable.gebouwId })
      .from(opdrachtenTable)
      .where(eq(opdrachtenTable.id, doelId));
    bestaat = Boolean(row);
    gebouwId = row?.gebouwId;
  } else if (doelType === "calculatie") {
    const [row] = await db
      .select({ gebouwId: calculatiesTable.gebouwId })
      .from(calculatiesTable)
      .where(eq(calculatiesTable.id, doelId));
    bestaat = Boolean(row);
    gebouwId = row?.gebouwId;
  } else if (doelType === "offerte") {
    const [row] = await db
      .select({ gebouwId: offertesTable.gebouwId })
      .from(offertesTable)
      .where(eq(offertesTable.id, doelId));
    bestaat = Boolean(row);
    gebouwId = row?.gebouwId;
  } else if (doelType === "voorziening") {
    const [row] = await db
      .select({ gebouwId: voorzieningenTable.gebouwId })
      .from(voorzieningenTable)
      .where(eq(voorzieningenTable.id, doelId));
    bestaat = Boolean(row);
    gebouwId = row?.gebouwId;
  } else if (doelType === "dossier") {
    const [row] = await db
      .select({ gebouwId: dossiersTable.gebouwId })
      .from(dossiersTable)
      .where(eq(dossiersTable.id, doelId));
    bestaat = Boolean(row);
    gebouwId = row?.gebouwId;
  } else if (doelType === "klant") {
    const [row] = await db
      .select({ id: crmKlantenTable.id })
      .from(crmKlantenTable)
      .where(eq(crmKlantenTable.id, doelId));
    bestaat = Boolean(row);
  } else if (doelType === "voertuig") {
    const [row] = await db
      .select({ id: voertuigenTable.id })
      .from(voertuigenTable)
      .where(eq(voertuigenTable.id, doelId));
    bestaat = Boolean(row);
  } else if (doelType === "prijsafspraak") {
    const [row] = await db
      .select({ id: prijsafsprakenTable.id })
      .from(prijsafsprakenTable)
      .where(eq(prijsafsprakenTable.id, doelId));
    bestaat = Boolean(row);
  }

  return (
    bestaat &&
    (gebouwId == null || permissies.magBijGebouw(gebouwId))
  );
}

export async function haalZichtbaarProductrapport(id: number) {
  if (!Number.isInteger(id) || id <= 0) return null;
  const [document] = await db
    .select()
    .from(documentenTable)
    .where(eq(documentenTable.id, id));
  if (!document) return null;
  const zichtbaar = await zichtbareProductrapportDocumentIds();
  return zichtbaar.has(id) ? document : null;
}

export async function magDocumentLezen(
  req: Request,
  documentId: number,
): Promise<boolean> {
  const productrapport = await haalZichtbaarProductrapport(documentId);
  if (
    productrapport &&
    (req.permissies?.isHoofdbeheerder === true ||
      req.permissies?.heeftModuleRecht("bibliotheek", 1) === true)
  ) {
    return true;
  }
  if (productrapport) return false;

  const koppelingen = await db
    .select({
      doelType: documentKoppelingenTable.doelType,
      doelId: documentKoppelingenTable.doelId,
    })
    .from(documentKoppelingenTable)
    .where(eq(documentKoppelingenTable.documentId, documentId));
  for (const koppeling of koppelingen) {
    if (
      isKoppelingDoelType(koppeling.doelType) &&
      (await magContextDoel(req, koppeling.doelType, koppeling.doelId, 1))
    ) {
      return true;
    }
  }
  return false;
}

export async function magDocumentObjectZien(
  req: Request,
  objectPath: string,
): Promise<boolean | null> {
  const rest = objectPath.startsWith("/objects/")
    ? objectPath.slice("/objects/".length)
    : objectPath;
  const documenten = await db
    .select({ id: documentenTable.id })
    .from(documentenTable)
    .where(
      inArray(documentenTable.pdfUrl, [
        objectPath,
        `/api/storage/objects/${rest}`,
      ]),
    );
  if (documenten.length === 0) return null;
  for (const document of documenten) {
    if (await magDocumentLezen(req, document.id)) return true;
  }
  return false;
}