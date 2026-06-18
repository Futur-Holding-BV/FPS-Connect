import { useState, useCallback } from "react";
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

const MAX_DIM = 1920;
const JPEG_QUALITY = 0.85;

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

/**
 * React hook voor bestandsuploads via presigned URLs.
 *
 * Tweestaps-flow:
 * 1. Vraag een presigned URL aan bij de backend (stuurt JSON-metadata).
 * 2. Upload het bestand rechtstreeks naar de presigned URL.
 *
 * Afbeeldingen worden automatisch gecomprimeerd (max 1920×1920, JPEG 0.85).
 */
export function useUpload(options: UseUploadOptions = {}) {
  const basePath = options.basePath ?? "/api/storage";
  const gebouwId = options.gebouw_id;
  const bestandType = options.bestand_type;

  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [progress, setProgress] = useState(0);

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
      const response = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
      });

      if (!response.ok) {
        throw new Error("Uploaden naar opslag mislukt");
      }
    },
    [],
  );

  const uploadFile = useCallback(
    async (file: File): Promise<UploadResponse | null> => {
      setIsUploading(true);
      setError(null);
      setProgress(0);

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
        setError(uploadError);
        options.onError?.(uploadError);
        return null;
      } finally {
        setIsUploading(false);
      }
    },
    [requestUploadUrl, uploadToPresignedUrl, options],
  );

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
    getUploadParameters,
    isUploading,
    error,
    progress,
  };
}
