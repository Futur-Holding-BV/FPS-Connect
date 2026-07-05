import { useState, useRef, useCallback } from "react";
import type { UppyFile } from "@uppy/core";

interface UploadMetadata {
  name: string;
  size: number;
  contentType: string;
}

interface UploadResponse {
  uploadURL: string;
  objectPath: string;
  metadata: UploadMetadata;
}

interface UseUploadOptions {
  /** Base path where object storage routes are mounted (default: "/api/storage") */
  basePath?: string;
  /** Koppel de upload aan een gebouw voor ACL-routing */
  gebouw_id?: number;
  /** Bestandstype voor directory-structuur (foto | tekening | rapport | bijlage | algemeen) */
  bestand_type?: string;
  onSuccess?: (response: UploadResponse) => void;
  onError?: (error: Error) => void;
}

export type UploadFoutType = "netwerk" | "bestandstype" | "overig" | null;

const MAX_DIM = 1920;
const JPEG_QUALITY = 0.85;

const MAX_POGINGEN = 3;
const BACKOFF_MS: [number, number] = [500, 1000];

/** Comprimeer een afbeelding client-side via Canvas (max 1920×1920, JPEG 0.85). */
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  const img = new Image();
  const url = URL.createObjectURL(file);

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Afbeelding laden mislukt"));
    img.src = url;
  });
  URL.revokeObjectURL(url);

  const { naturalWidth: w, naturalHeight: h } = img;
  const scale = Math.min(1, MAX_DIM / Math.max(w, h));
  const outW = Math.round(w * scale);
  const outH = Math.round(h * scale);

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, outW, outH);

  return new Promise<File>((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          resolve(file);
          return;
        }
        const naam = file.name.replace(/\.[^.]+$/, ".jpg");
        resolve(new File([blob], naam, { type: "image/jpeg" }));
      },
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}

interface UploadFout extends Error {
  foutType: UploadFoutType;
}

function maakUploadFout(bericht: string, type: UploadFoutType): UploadFout {
  const fout = new Error(bericht) as UploadFout;
  fout.foutType = type;
  return fout;
}

/**
 * React hook voor bestandsuploads via presigned URLs.
 *
 * Tweestaps-flow:
 * 1. Vraag een presigned URL aan bij de backend (stuurt JSON-metadata).
 * 2. Upload het bestand rechtstreeks naar de presigned URL.
 *
 * Afbeeldingen worden automatisch gecomprimeerd (max 1920×1920, JPEG 0.85).
 * Bij netwerkverlies tijdens de PUT wordt automatisch tot 3 pogingen gedaan
 * (exponentiële backoff 500 ms / 1000 ms). Na definitief falen blijft het
 * laatste bestand beschikbaar via retryUpload().
 */
export function useUpload(options: UseUploadOptions = {}) {
  const basePath = options.basePath ?? "/api/storage";
  const gebouwId = options.gebouw_id;
  const bestandType = options.bestand_type;

  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [uploadFoutType, setUploadFoutType] = useState<UploadFoutType>(null);
  const [progress, setProgress] = useState(0);

  const lastFileRef = useRef<File | null>(null);

  const requestUploadUrl = useCallback(
    async (file: File): Promise<UploadResponse> => {
      const response = await fetch(`${basePath}/uploads/request-url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type || "application/octet-stream",
          ...(gebouwId != null && { gebouw_id: gebouwId }),
          ...(bestandType != null && { bestand_type: bestandType }),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Ophalen upload-URL mislukt");
      }

      return response.json();
    },
    [basePath, gebouwId, bestandType],
  );

  const uploadToPresignedUrl = useCallback(
    async (file: File, uploadURL: string): Promise<void> => {
      const contentType = file.type || "application/octet-stream";
      let lastErr: Error | null = null;

      for (let poging = 1; poging <= MAX_POGINGEN; poging++) {
        try {
          const response = await fetch(uploadURL, {
            method: "PUT",
            body: file,
            headers: { "Content-Type": contentType },
          });

          if (!response.ok) {
            if (response.status >= 400 && response.status < 500) {
              throw maakUploadFout(
                `Bestand geweigerd door de opslag (HTTP ${response.status}). Controleer het bestandstype of de bestandsinhoud.`,
                "bestandstype",
              );
            }
            throw new Error(`HTTP ${response.status}`);
          }
          return;
        } catch (err) {
          const e = err instanceof Error ? err : new Error("Onbekende fout");
          if ((e as UploadFout).foutType === "bestandstype") throw e;
          lastErr = e;
          if (poging < MAX_POGINGEN) {
            await new Promise<void>((resolve) =>
              setTimeout(resolve, BACKOFF_MS[poging - 1]),
            );
          }
        }
      }

      const isNetwerkFout =
        lastErr instanceof TypeError ||
        lastErr?.message === "Failed to fetch" ||
        lastErr?.message === "NetworkError when attempting to fetch resource.";

      throw maakUploadFout(
        isNetwerkFout
          ? `Verbinding tijdelijk weggevallen na ${MAX_POGINGEN} pogingen. Controleer uw netwerk en klik op "Opnieuw proberen".`
          : `Upload definitief mislukt na ${MAX_POGINGEN} pogingen (${lastErr?.message ?? "onbekende fout"}). Klik op "Opnieuw proberen".`,
        isNetwerkFout ? "netwerk" : "overig",
      );
    },
    [],
  );

  const uploadFile = useCallback(
    async (file: File): Promise<UploadResponse | null> => {
      setIsUploading(true);
      setError(null);
      setUploadFoutType(null);
      setProgress(0);
      lastFileRef.current = file;

      try {
        setProgress(5);
        const compressed = await compressImage(file);

        setProgress(10);
        const uploadResponse = await requestUploadUrl(compressed);

        setProgress(30);
        await uploadToPresignedUrl(compressed, uploadResponse.uploadURL);

        setProgress(100);
        options.onSuccess?.(uploadResponse);
        return uploadResponse;
      } catch (err) {
        const uploadError =
          err instanceof Error ? err : new Error("Upload mislukt");
        const type =
          (uploadError as UploadFout).foutType ?? "overig";
        setError(uploadError);
        setUploadFoutType(type);
        options.onError?.(uploadError);
        return null;
      } finally {
        setIsUploading(false);
      }
    },
    [requestUploadUrl, uploadToPresignedUrl, options],
  );

  const retryUpload = useCallback(async (): Promise<UploadResponse | null> => {
    if (!lastFileRef.current) return null;
    return uploadFile(lastFileRef.current);
  }, [uploadFile]);

  const getUploadParameters = useCallback(
    async (
      file: UppyFile<Record<string, unknown>, Record<string, unknown>>,
    ): Promise<{
      method: "PUT";
      url: string;
      headers?: Record<string, string>;
    }> => {
      const response = await fetch(`${basePath}/uploads/request-url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type || "application/octet-stream",
          ...(gebouwId != null && { gebouw_id: gebouwId }),
          ...(bestandType != null && { bestand_type: bestandType }),
        }),
      });

      if (!response.ok) {
        throw new Error("Ophalen upload-URL mislukt");
      }

      const data = await response.json();
      return {
        method: "PUT",
        url: data.uploadURL,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      };
    },
    [basePath, gebouwId, bestandType],
  );

  return {
    uploadFile,
    retryUpload,
    getUploadParameters,
    isUploading,
    error,
    uploadFoutType,
    progress,
  };
}
