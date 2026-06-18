/**
 * ObjectStorageService — backend-agnostische opslaglaag.
 *
 * Detecteert automatisch de juiste backend op basis van omgevingsvariabelen:
 *   - S3_BUCKET is ingesteld → S3-compatibele backend (productie)
 *   - Niet ingesteld         → Replit GCS-backend (ontwikkeling/test)
 *
 * Routes en de ACL-laag werken uitsluitend via dit service-object en de
 * StorageFile-interface; ze hoeven de onderliggende backend niet te kennen.
 */
import { Storage } from "@google-cloud/storage";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";
import { ObjectNotFoundError, type StorageFile } from "./objectStorageTypes";
import {
  S3StorageFile,
  createS3Client,
  getS3File,
  s3PresignedPut,
} from "./objectStorageS3";
import type { S3Client } from "@aws-sdk/client-s3";

// ─── Re-exports ───────────────────────────────────────────────────────────────

export { ObjectNotFoundError, type StorageFile };
export type BestandType = "foto" | "rapport" | "tekening" | "bijlage" | "algemeen";

// ─── Backend-detectie ─────────────────────────────────────────────────────────

function isS3Mode(): boolean {
  return Boolean(process.env.S3_BUCKET);
}

function getS3Bucket(): string {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error("S3_BUCKET is niet ingesteld");
  return bucket;
}

// GCS-client voor de Replit-backend (lazy init)
let _gcsStorage: Storage | null = null;
function getGcsStorage(): Storage {
  if (!_gcsStorage) {
    const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
    _gcsStorage = new Storage({
      credentials: {
        audience: "replit",
        subject_token_type: "access_token",
        token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
        type: "external_account",
        credential_source: {
          url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
          format: { type: "json", subject_token_field_name: "access_token" },
        },
        universe_domain: "googleapis.com",
      },
      projectId: "",
    });
  }
  return _gcsStorage;
}

// S3-client voor de productie-backend (lazy init)
let _s3Client: S3Client | null = null;
function getS3Client(): S3Client {
  if (!_s3Client) _s3Client = createS3Client();
  return _s3Client;
}

// ─── GCS-hulpfuncties ─────────────────────────────────────────────────────────

function parseGCSObjectPath(path: string): { bucketName: string; objectName: string } {
  if (!path.startsWith("/")) path = `/${path}`;
  const parts = path.split("/");
  if (parts.length < 3) throw new Error("Ongeldig pad: minimaal een bucketnaam vereist");
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

async function gcsSignedUrl({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bucket_name: bucketName,
        object_name: objectName,
        method,
        expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) {
    throw new Error(
      `GCS signing mislukt (${response.status}). Draai je op Replit?`,
    );
  }
  const { signed_url } = (await response.json()) as { signed_url: string };
  return signed_url;
}

/**
 * Parse het gebouw-ID uit een genormaliseerd object-pad.
 * `/objects/{gebouwId}/{type}/{uuid}` → gebouwId (number)
 * `/objects/uploads/...` of `/objects/algemeen/...` → null
 */
export function parseGebouwIdFromObjectPath(objectPath: string): number | null {
  if (!objectPath.startsWith("/objects/")) return null;
  const rest = objectPath.slice("/objects/".length);
  const firstSegment = rest.split("/")[0];
  const num = parseInt(firstSegment, 10);
  if (isNaN(num) || num <= 0) return null;
  return num;
}

// ─── ObjectStorageService ─────────────────────────────────────────────────────

export class ObjectStorageService {
  // ── Configuratie-helpers (GCS-backend) ──────────────────────────────────────

  private getPublicObjectSearchPaths(): string[] {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS ?? "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean),
      ),
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS is niet ingesteld.",
      );
    }
    return paths;
  }

  private getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR ?? "";
    if (!dir) throw new Error("PRIVATE_OBJECT_DIR is niet ingesteld.");
    return dir;
  }

  // ── Publieke objecten ────────────────────────────────────────────────────────

  /**
   * Zoek een publiek object op in de geconfigureerde PUBLIC_OBJECT_SEARCH_PATHS.
   * In S3-modus: publieke assets worden niet via deze API geserveerd; gebruik een CDN.
   */
  async searchPublicObject(filePath: string): Promise<StorageFile | null> {
    if (isS3Mode()) return null;

    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;
      const { bucketName, objectName } = parseGCSObjectPath(fullPath);
      const bucket = getGcsStorage().bucket(bucketName);
      const file = bucket.file(objectName);
      const [exists] = await file.exists();
      if (exists) return file as unknown as StorageFile;
    }
    return null;
  }

  // ── Objecten ophalen/downloaden ──────────────────────────────────────────────

  /**
   * Haal een privé-object op als StorageFile.
   * Gooit ObjectNotFoundError als het object niet bestaat.
   */
  async getObjectEntityFile(objectPath: string): Promise<StorageFile> {
    if (!objectPath.startsWith("/objects/")) throw new ObjectNotFoundError();

    if (isS3Mode()) {
      const key = objectPath.slice("/objects/".length);
      return getS3File(getS3Client(), getS3Bucket(), key);
    }

    // GCS-backend
    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) throw new ObjectNotFoundError();
    const entityId = parts.slice(1).join("/");
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) entityDir = `${entityDir}/`;
    const { bucketName, objectName } = parseGCSObjectPath(`${entityDir}${entityId}`);
    const bucket = getGcsStorage().bucket(bucketName);
    const objectFile = bucket.file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) throw new ObjectNotFoundError();
    return objectFile as unknown as StorageFile;
  }

  /**
   * Download een StorageFile en retourneer een Web API Response.
   * isPublic bepaalt de Cache-Control header.
   */
  async downloadObject(
    file: StorageFile,
    opts?: { isPublic?: boolean; cacheTtlSec?: number },
  ): Promise<Response> {
    const cacheTtlSec = opts?.cacheTtlSec ?? 3600;
    let isPublic = opts?.isPublic ?? false;

    // GCS-backend: haal ACL-policy op voor cache-instelling
    if (!isS3Mode() && !opts?.isPublic) {
      const aclPolicy = await getObjectAclPolicy(file);
      isPublic = aclPolicy?.visibility === "public";
    }

    const [metadata] = await file.getMetadata();
    const nodeStream = file.createReadStream();
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    const headers: Record<string, string> = {
      "Content-Type": (metadata.contentType as string) || "application/octet-stream",
      "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
    };
    if (metadata.size) {
      headers["Content-Length"] = String(metadata.size);
    }

    return new Response(webStream, { headers });
  }

  // ── Upload-URL genereren ────────────────────────────────────────────────────

  /**
   * Genereer een presigned PUT-URL voor directe upload naar object storage.
   *
   * Retourneert zowel uploadURL (voor de client) als objectPath (/objects/...)
   * voor opslag in de database.
   *
   * Padstructuur:
   *   Met gebouwId + type: {gebouwId}/{type}s/{uuid}
   *   Zonder (of type=algemeen): algemeen/{uuid}
   */
  async getObjectEntityUploadURL(
    gebouwId?: number | null,
    bestandType?: BestandType | null,
  ): Promise<{ uploadURL: string; objectPath: string }> {
    const objectId = randomUUID();
    let subPath: string;
    if (gebouwId != null && bestandType && bestandType !== "algemeen") {
      subPath = `${gebouwId}/${bestandType}s/${objectId}`;
    } else {
      subPath = `algemeen/${objectId}`;
    }
    const objectPath = `/objects/${subPath}`;

    if (isS3Mode()) {
      const uploadURL = await s3PresignedPut(
        getS3Client(),
        getS3Bucket(),
        subPath,
        900,
      );
      return { uploadURL, objectPath };
    }

    // GCS-backend
    const privateObjectDir = this.getPrivateObjectDir();
    const fullPath = `${privateObjectDir}/${subPath}`;
    const { bucketName, objectName } = parseGCSObjectPath(fullPath);
    const uploadURL = await gcsSignedUrl({ bucketName, objectName, method: "PUT", ttlSec: 900 });
    return { uploadURL, objectPath };
  }

  /**
   * Normaliseer een GCS-opslagURL naar een genormaliseerd object-pad.
   * Verouderd: gebruik het objectPath dat getObjectEntityUploadURL retourneert.
   */
  normalizeObjectEntityPath(rawPath: string): string {
    if (!rawPath.startsWith("https://storage.googleapis.com/")) {
      return rawPath;
    }
    const url = new URL(rawPath);
    const rawObjectPath = url.pathname;
    let objectEntityDir = this.getPrivateObjectDir();
    if (!objectEntityDir.endsWith("/")) objectEntityDir = `${objectEntityDir}/`;
    if (!rawObjectPath.startsWith(objectEntityDir)) return rawObjectPath;
    const entityId = rawObjectPath.slice(objectEntityDir.length);
    return `/objects/${entityId}`;
  }

  // ── ACL-hulpfuncties ────────────────────────────────────────────────────────

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy,
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) return normalizedPath;
    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: StorageFile;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}

// Geëxporteerd voor backward-compatibiliteit (gebruik ObjectStorageService)
export const objectStorageClient = isS3Mode() ? null : getGcsStorage();
