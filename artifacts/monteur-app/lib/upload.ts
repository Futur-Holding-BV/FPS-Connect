import {
  requestUploadUrl,
  type UploadUrlRequestBestandType,
} from "@workspace/api-client-react";

/**
 * Upload een lokaal foto-bestand (file:// URI) via de presigned-URL-flow.
 * 1. Vraag een upload-URL aan bij de API (bearer-token wordt automatisch toegevoegd).
 * 2. PUT de bytes rechtstreeks naar de presigned URL (geen auth).
 * Retourneert het objectPath (begint met /objects/...) voor opslag bij de foto.
 */
export async function uploadFoto(
  localUri: string,
  gebouwId?: number,
  bestandType?: UploadUrlRequestBestandType,
): Promise<string> {
  const resp = await fetch(localUri);
  const blob = await resp.blob();
  const naam =
    localUri.split("/").pop()?.split("?")[0] || `foto_${Date.now()}.jpg`;
  const contentType = blob.type || "image/jpeg";

  const up = await requestUploadUrl({
    name: naam,
    size: blob.size || 1,
    contentType,
    ...(gebouwId != null && { gebouw_id: gebouwId }),
    ...(bestandType != null && { bestand_type: bestandType }),
  });

  const put = await fetch(up.uploadURL, {
    method: "PUT",
    body: blob,
    headers: { "Content-Type": contentType },
  });
  if (!put.ok) {
    throw new Error("Foto-upload mislukt");
  }
  return up.objectPath;
}
