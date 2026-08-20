// LOON_02A — Gedeeld harnas voor bewijs-modules.
//
// Exporteert: check(), eis(), opruimStapel, registreerOpruimen(), opruimen(),
//             resetTellers(), aantalGeslaagd, aantalMislukt.

export let aantalGeslaagd = 0;
export let aantalMislukt = 0;

export function resetTellers(): void {
  aantalGeslaagd = 0;
  aantalMislukt = 0;
}

export function check(naam: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    console.log(`  ✅ ${naam}${detail !== undefined ? ` — ${String(detail)}` : ""}`);
    aantalGeslaagd++;
  } else {
    console.error(`  ❌ ${naam}${detail !== undefined ? ` — ${String(detail)}` : ""}`);
    aantalMislukt++;
  }
}

export function eis(ok: boolean, naam: string, detail?: unknown): void {
  if (!ok) {
    throw new Error(
      `KRITIEKE EIS MISLUKT: ${naam}${detail !== undefined ? ` — ${String(detail)}` : ""}`,
    );
  }
}

export function isPostgresCode(err: unknown, code: string): boolean {
  let huidig: unknown = err;
  for (let diepte = 0; diepte < 5; diepte++) {
    if (typeof huidig !== "object" || huidig === null) return false;
    const fout = huidig as { code?: unknown; cause?: unknown };
    if (fout.code === code) return true;
    huidig = fout.cause;
  }
  return false;
}

// ── Transactionele opruim-stapel (LIFO) ──────────────────────────────────────

const opruimStappen: Array<() => Promise<void>> = [];

export function registreerOpruimen(fn: () => Promise<void>): void {
  opruimStappen.push(fn);
}

export async function opruimen(): Promise<void> {
  for (const fn of [...opruimStappen].reverse()) {
    try {
      await fn();
    } catch (err) {
      console.warn(`  ⚠️  opruimen: ${String(err)}`);
    }
  }
  opruimStappen.length = 0;
}
