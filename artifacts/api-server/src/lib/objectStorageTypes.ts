/**
 * Gedeelde typen voor de storage-abstractielaag.
 * Wordt geïmporteerd door zowel objectStorage.ts als objectStorageS3.ts
 * om circulaire afhankelijkheden te vermijden.
 */

/**
 * Generieke storage-bestand interface.
 * Geïmplementeerd door de GCS-backend (Replit-dev) en de S3-backend (productie).
 */
export interface StorageFile {
  /** Volledig pad/key in de opslagbackend (zonder bucket-naam) */
  readonly name: string;

  /**
   * Haal metadata op van het object.
   * Retourneert [metadata] met minimaal contentType en size.
   * Optioneel: user-defined metadata onder .metadata.
   */
  getMetadata(): Promise<
    [{ contentType?: string; size?: string | number; metadata?: Record<string, string | undefined> }]
  >;

  /** Stream de bestandsinhoud als Node.js ReadableStream */
  createReadStream(): NodeJS.ReadableStream;

  /** Controleer of het object bestaat. Retourneert [boolean] (GCS-compatibel) */
  exists(): Promise<[boolean]>;

  /**
   * Sla user-defined metadata op bij het object.
   * GCS: setMetadata({ metadata: { ... } })
   * S3: CopyObject-to-self (MetadataDirective: REPLACE)
   */
  setMetadata(options: { metadata: Record<string, string> }): Promise<unknown>;
}

/** Gegooid wanneer een object niet bestaat in de storage-backend */
export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}
