import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── Versie & prefix ────────────────────────────────────────────────────────
const V = "v1";
const P = `fps_offline_${V}`;

// ─── Sleutelconstructors ─────────────────────────────────────────────────────
const PLANNING_KEY = `${P}:planning`;
const WERKORDERS_KEY = `${P}:werkorders`;
const OFFLINE_UREN_KEY = `${P}:offline_uren`;
const META_KEY = `${P}:meta`;

function werkorderKey(id: number) { return `${P}:werkorder:${id}`; }
function voorzieningenKey(id: number) { return `${P}:voorzieningen:${id}`; }
function opnameItemKey(id: number) { return `${P}:opname_item:${id}`; }

// ─── Generieke helpers ───────────────────────────────────────────────────────
async function lees<T>(sleutel: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(sleutel);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function sla<T>(sleutel: string, data: T): Promise<void> {
  await AsyncStorage.setItem(sleutel, JSON.stringify(data));
}

// ─── Cache-metadata ──────────────────────────────────────────────────────────
export type CacheMeta = { gecachedOp: string; versie: string };

export async function slaMetaOp(): Promise<void> {
  await sla<CacheMeta>(META_KEY, {
    gecachedOp: new Date().toISOString(),
    versie: V,
  });
}

export async function leesMeta(): Promise<CacheMeta | null> {
  return lees<CacheMeta>(META_KEY);
}

// ─── Dagplanning (MijnWerkGebouw[]) ─────────────────────────────────────────
export async function slaPlanningOp(data: unknown[]): Promise<void> {
  await sla(PLANNING_KEY, data);
  await slaMetaOp();
}

export async function leesPlanning(): Promise<unknown[] | null> {
  return lees(PLANNING_KEY);
}

// ─── Werkorders van vandaag (WerkdagItem[]) ──────────────────────────────────
export async function slaWerkordersOp(data: unknown[]): Promise<void> {
  await sla(WERKORDERS_KEY, data);
}

export async function leesWerkorders(): Promise<unknown[] | null> {
  return lees(WERKORDERS_KEY);
}

// ─── Enkel werkorder detail ───────────────────────────────────────────────────
export async function slaWerkorderOp(id: number, data: unknown): Promise<void> {
  await sla(werkorderKey(id), data);
}

export async function leesWerkorder(id: number): Promise<unknown | null> {
  return lees(werkorderKey(id));
}

export async function patchWerkorderStatusLokaal(
  id: number,
  nieuweStatus: string,
): Promise<void> {
  const item = (await leesWerkorder(id)) as Record<string, unknown> | null;
  if (item) {
    await slaWerkorderOp(id, { ...item, uitvoering_status: nieuweStatus });
  }
  const lijst = await leesWerkorders();
  if (lijst) {
    await slaWerkordersOp(
      lijst.map((w) => {
        const e = w as Record<string, unknown>;
        return e.id === id ? { ...e, uitvoering_status: nieuweStatus } : w;
      }),
    );
  }
}

// ─── Voorzieningen per gebouw ────────────────────────────────────────────────
export async function slaVoorzieningenOp(
  gebouwId: number,
  data: unknown[],
): Promise<void> {
  await sla(voorzieningenKey(gebouwId), data);
}

export async function leesVoorzieningen(
  gebouwId: number,
): Promise<unknown[] | null> {
  return lees(voorzieningenKey(gebouwId));
}

export async function patchVoorzieningLokaal(
  gebouwId: number,
  voorzieningId: number,
  update: Record<string, unknown>,
): Promise<void> {
  const lijst = await leesVoorzieningen(gebouwId);
  if (!lijst) return;
  await slaVoorzieningenOp(
    gebouwId,
    lijst.map((v) => {
      const item = v as Record<string, unknown>;
      return item.id === voorzieningId ? { ...item, ...update } : v;
    }),
  );
}

// ─── Opname-item cache ────────────────────────────────────────────────────────
export async function slaOpnameItemOp(id: number, data: unknown): Promise<void> {
  await sla(opnameItemKey(id), data);
}

export async function leesOpnameItem(id: number): Promise<unknown | null> {
  return lees(opnameItemKey(id));
}

export async function patchOpnameItemLokaal(
  id: number,
  update: Record<string, unknown>,
): Promise<void> {
  const item = (await leesOpnameItem(id)) as Record<string, unknown> | null;
  if (item) {
    await slaOpnameItemOp(id, { ...item, ...update });
  }
}

// ─── Offline uren (aangemaakt zonder verbinding) ─────────────────────────────
export type OfflineUren = {
  lokaalId: string;
  datum: string;
  omschrijving?: string;
  payload: Record<string, unknown>;
  aangemaakt: string;
};

export async function leesOfflineUren(): Promise<OfflineUren[]> {
  return (await lees<OfflineUren[]>(OFFLINE_UREN_KEY)) ?? [];
}

export async function voegOfflineUrenToe(
  datum: string,
  payload: Record<string, unknown>,
  omschrijving?: string,
): Promise<OfflineUren> {
  const lijst = await leesOfflineUren();
  const nieuw: OfflineUren = {
    lokaalId: `offline_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    datum,
    omschrijving,
    payload,
    aangemaakt: new Date().toISOString(),
  };
  await sla(OFFLINE_UREN_KEY, [...lijst, nieuw]);
  return nieuw;
}

export async function verwijderOfflineUren(lokaalId: string): Promise<void> {
  const lijst = await leesOfflineUren();
  await sla(
    OFFLINE_UREN_KEY,
    lijst.filter((u) => u.lokaalId !== lokaalId),
  );
}

// ─── Artikelen cache ──────────────────────────────────────────────────────────
const ARTIKELEN_KEY = `${P}:artikelen`;

export type CachedArtikel = {
  id: number;
  naam: string;
  barcode: string | null;
  eenheid: string;
  categorie: string | null;
  code: string | null;
};

export async function slaArtikelenOp(data: CachedArtikel[]): Promise<void> {
  await sla(ARTIKELEN_KEY, data);
}

export async function leesArtikelen(): Promise<CachedArtikel[] | null> {
  return lees<CachedArtikel[]>(ARTIKELEN_KEY);
}

// ─── Mijn auto (WAGENPARK_01 §3) ──────────────────────────────────────────────
const MIJN_AUTO_KEY = `${P}:mijn_auto`;

export async function slaMijnAutoOp<T>(data: T): Promise<void> {
  await sla(MIJN_AUTO_KEY, data);
}

export async function leesMijnAuto<T>(): Promise<T | null> {
  return lees<T>(MIJN_AUTO_KEY);
}

// ─── Volledige cache wissen ───────────────────────────────────────────────────
export async function wisOfflineCache(): Promise<void> {
  const all = await AsyncStorage.getAllKeys();
  const mine = all.filter((k) => k.startsWith(P));
  if (mine.length > 0) await AsyncStorage.multiRemove(mine);
}
