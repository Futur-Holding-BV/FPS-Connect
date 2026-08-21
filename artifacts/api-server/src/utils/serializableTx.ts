/**
 * Serializable-transactiehelper met begrensde retry op PostgreSQL
 * serialisatie-/deadlockconflicten.
 *
 * Gescheiden van de route zodat de conflictclassificatie en het retrygedrag
 * puur getest kunnen worden zonder een echte database.
 */
import { db } from "@workspace/db";

/**
 * PostgreSQL SQLSTATE-codes die bij een SERIALIZABLE-transactie op een
 * niet-fataal concurrency-conflict wijzen en veilig opnieuw geprobeerd mogen
 * worden:
 *   40001 = serialization_failure
 *   40P01 = deadlock_detected
 */
export function isSerialisatieConflict(err: unknown): boolean {
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? (err as { code?: string }).code
      : undefined;
  return code === "40001" || code === "40P01";
}

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Voert `fn` uit binnen een SERIALIZABLE-transactie en probeert bij een
 * serialisatie-/deadlockconflict tot `maxPogingen` keer opnieuw.
 *
 * Injecteerbaar `runner` (default: db.transaction) zodat het retrygedrag
 * getest kan worden zonder database.
 */
export async function metSerializableTransactie<T>(
  fn: (tx: Tx) => Promise<T>,
  maxPogingen = 3,
  runner: (
    cb: (tx: Tx) => Promise<T>,
    opts: { isolationLevel: "serializable" },
  ) => Promise<T> = (cb, opts) => db.transaction(cb, opts),
): Promise<T> {
  let laatsteFout: unknown;
  for (let poging = 0; poging < maxPogingen; poging++) {
    try {
      return await runner(fn, { isolationLevel: "serializable" });
    } catch (err) {
      laatsteFout = err;
      if (isSerialisatieConflict(err) && poging < maxPogingen - 1) {
        continue;
      }
      throw err;
    }
  }
  throw laatsteFout;
}
