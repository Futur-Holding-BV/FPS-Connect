import AsyncStorage from "@react-native-async-storage/async-storage";

const QUEUE_KEY = "fps_sync_queue_v2";

// Na dit aantal mislukte pogingen beschouwen we een item als definitief mislukt.
export const MAX_POGINGEN = 5;

// ─── Alle actie-typen ────────────────────────────────────────────────────────
export type SyncActie =
  // Bestaand (backward compatible)
  | {
      type: "create_voorziening";
      payload: Record<string, unknown>;
      gebouwId: number;
      gebouwNaam: string;
    }
  | {
      type: "add_foto";
      voorzieningId: number;
      payload: { fase: string; url: string };
      gebouwId: number;
      gebouwNaam: string;
    }
  // Werkdag-status offline wijzigen
  | {
      type: "patch_werkdag_status";
      werkdagId: number;
      nieuweStatus: string;
    }
  // Voorziening velden offline patchen (status, notities, materialen)
  | {
      type: "patch_voorziening";
      voorzieningId: number;
      gebouwId: number;
      velden: Record<string, unknown>;
    }
  // Opname-item offline patchen (notities, afgerond, bereikbaarheid, etc.)
  | {
      type: "patch_opname_item";
      itemId: number;
      velden: Record<string, unknown>;
    }
  // Foto offline bewaren en later uploaden
  | {
      type: "upload_foto_lokaal";
      lokaalPad: string;
      itemId: number;
      fase: string;
    }
  // Uren aanmaken terwijl offline — payload is de volledige API-body
  | {
      type: "create_uren";
      lokaalId: string;
      datum: string;
      payload: Record<string, unknown>;
    }
  // Uren bijwerken terwijl offline
  | {
      type: "update_uren";
      urenId: number;
      velden: Record<string, unknown>;
    }
  // Uren verwijderen terwijl offline
  | {
      type: "delete_uren";
      urenId: number;
    }
  // Handtekening (SVG) opslaan en later uploaden
  | {
      type: "create_handtekening";
      lokaalPad: string;
      werkdagId: number;
      positie: "medewerker" | "klant";
    };

export type WachtrijItem = SyncActie & {
  id: string;
  aangemaaktOp: string;
  pogingen: number;
  fout?: string;
};

// ─── Interne helpers ──────────────────────────────────────────────────────────
function uuid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function laadWachtrij(): Promise<WachtrijItem[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as WachtrijItem[];
  } catch {
    return [];
  }
}

async function slaWachtrijOp(items: WachtrijItem[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

// ─── Publieke API ─────────────────────────────────────────────────────────────
export async function voegToeAanWachtrij(actie: SyncActie): Promise<string> {
  const items = await laadWachtrij();
  const item: WachtrijItem = {
    ...actie,
    id: uuid(),
    aangemaaktOp: new Date().toISOString(),
    pogingen: 0,
  };
  await slaWachtrijOp([...items, item]);
  return item.id;
}

export async function verwijderUitWachtrij(id: string): Promise<void> {
  const items = await laadWachtrij();
  await slaWachtrijOp(items.filter((i) => i.id !== id));
}

export async function markeerFout(id: string, fout: string): Promise<void> {
  const items = await laadWachtrij();
  await slaWachtrijOp(
    items.map((i) =>
      i.id === id ? { ...i, pogingen: i.pogingen + 1, fout } : i,
    ),
  );
}

export async function aantalActief(): Promise<number> {
  return (await laadWachtrij()).filter((i) => i.pogingen < MAX_POGINGEN).length;
}

export async function aantalMislukt(): Promise<number> {
  return (await laadWachtrij()).filter((i) => i.pogingen >= MAX_POGINGEN).length;
}

export async function wisMislukteItems(): Promise<number> {
  const items = await laadWachtrij();
  const overgebleven = items.filter((i) => i.pogingen < MAX_POGINGEN);
  await slaWachtrijOp(overgebleven);
  return items.length - overgebleven.length;
}

// Verwerk de wachtrij via de opgegeven handler (de SyncContext levert deze).
export async function verwerkWachtrij(
  handler: (item: WachtrijItem) => Promise<void>,
  opties?: { maxPogingen?: number },
): Promise<{ verwerkt: number; mislukt: number }> {
  const items = await laadWachtrij();
  const maxPogingen = opties?.maxPogingen ?? MAX_POGINGEN;
  let verwerkt = 0;
  let mislukt = 0;

  for (const item of items) {
    if (item.pogingen >= maxPogingen) {
      mislukt++;
      continue;
    }
    try {
      await handler(item);
      await verwijderUitWachtrij(item.id);
      verwerkt++;
    } catch (err) {
      const foutTekst = err instanceof Error ? err.message : String(err);
      await markeerFout(item.id, foutTekst);
      mislukt++;
    }
  }
  return { verwerkt, mislukt };
}
