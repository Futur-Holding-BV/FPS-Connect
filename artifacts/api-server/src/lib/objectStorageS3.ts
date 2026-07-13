/**
 * S3-compatibele storage-backend voor productieomgevingen.
 *
 * Werkt met AWS S3, Cloudflare R2, DigitalOcean Spaces en MinIO.
 * Configureer via environment-variabelen:
 *
 *   S3_BUCKET            - bucketnaam
 *   S3_REGION            - regio (bijv. eu-west-1; gebruik "auto" voor R2)
 *   S3_ACCESS_KEY_ID     - access key
 *   S3_SECRET_ACCESS_KEY - secret key
 *   S3_ENDPOINT          - custom endpoint (verplicht voor R2/MinIO/DO Spaces)
 *   S3_PUBLIC_ENDPOINT   - optioneel: publiek bereikbaar endpoint voor presigned
 *                          URLs (browser-uploads). Nodig wanneer S3_ENDPOINT een
 *                          intern adres is (bijv. http://minio:9000 in Docker):
 *                          de browser kan dat niet bereiken. De reverse proxy
 *                          moet {S3_PUBLIC_ENDPOINT}/{bucket}/* doorsturen naar
 *                          de interne S3-server MET behoud van de Host-header
 *                          (anders klopt de SigV4-handtekening niet).
 *
 * Objectpaden: {gebouwId}/{type}s/{uuid} of algemeen/{uuid}
 */
import { PassThrough } from "stream";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
  type GetObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ObjectNotFoundError, type StorageFile } from "./objectStorageTypes";

/** Bouw een S3Client op basis van environment-variabelen */
export function createS3Client(): S3Client {
  const region = process.env.S3_REGION ?? "auto";
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "S3_ACCESS_KEY_ID en S3_SECRET_ACCESS_KEY zijn verplicht voor de S3-backend.",
    );
  }

  return new S3Client({
    region,
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    credentials: { accessKeyId, secretAccessKey },
  });
}

/**
 * Bouw een S3Client die uitsluitend gebruikt wordt voor het ondertekenen van
 * presigned URLs richting de browser. Gebruikt S3_PUBLIC_ENDPOINT als die is
 * ingesteld, anders identiek aan createS3Client().
 */
export function createS3PresignClient(): S3Client {
  const publicEndpoint = process.env.S3_PUBLIC_ENDPOINT;
  if (!publicEndpoint) return createS3Client();

  const region = process.env.S3_REGION ?? "auto";
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "S3_ACCESS_KEY_ID en S3_SECRET_ACCESS_KEY zijn verplicht voor de S3-backend.",
    );
  }

  return new S3Client({
    region,
    endpoint: publicEndpoint,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
}

/** StorageFile-implementatie voor S3-compatibele opslag */
export class S3StorageFile implements StorageFile {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
    public readonly name: string,
  ) {}

  async getMetadata(): Promise<
    [{ contentType?: string; size?: string | number; metadata?: Record<string, string | undefined> }]
  > {
    const resp = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: this.name }),
    );
    return [
      {
        contentType: resp.ContentType,
        size: resp.ContentLength,
        metadata: resp.Metadata as Record<string, string | undefined>,
      },
    ];
  }

  createReadStream(): NodeJS.ReadableStream {
    const pass = new PassThrough();
    this.client
      .send(new GetObjectCommand({ Bucket: this.bucket, Key: this.name }))
      .then((resp: GetObjectCommandOutput) => {
        const body = resp.Body;
        if (body && typeof (body as NodeJS.ReadableStream).pipe === "function") {
          (body as NodeJS.ReadableStream).pipe(pass);
        } else {
          pass.end();
        }
      })
      .catch((err) =>
        pass.destroy(err instanceof Error ? err : new Error(String(err))),
      );
    return pass;
  }

  async exists(): Promise<[boolean]> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: this.name }),
      );
      return [true];
    } catch {
      return [false];
    }
  }

  async setMetadata(options: { metadata: Record<string, string> }): Promise<void> {
    // S3 vereist een copy-to-self om metadata te overschrijven.
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${this.name}`,
        Key: this.name,
        Metadata: options.metadata,
        MetadataDirective: "REPLACE",
      }),
    );
  }
}

/** Haal een S3StorageFile op; gooit ObjectNotFoundError als het object niet bestaat */
export async function getS3File(
  client: S3Client,
  bucket: string,
  key: string,
): Promise<S3StorageFile> {
  const file = new S3StorageFile(client, bucket, key);
  const [exists] = await file.exists();
  if (!exists) throw new ObjectNotFoundError();
  return file;
}

/** Genereer een presigned PUT-URL voor directe upload naar S3 */
export async function s3PresignedPut(
  client: S3Client,
  bucket: string,
  key: string,
  ttlSec: number,
): Promise<string> {
  const cmd = new PutObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(client, cmd, { expiresIn: ttlSec });
}
