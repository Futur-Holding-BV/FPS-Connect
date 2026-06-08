import AsyncStorage from "@react-native-async-storage/async-storage";

const QUEUE_KEY = "fps_sync_queue_v1";

// Na dit aantal mislukte pogingen beschouwen we een item als definitief mislukt.
// Zulke items blijven niet eindeloos de wachtrij-teller opblazen en kunnen
// handmatig gewist worden.
export const MAX_POGINGEN = 5;

export type SyncActie =
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
    };

export type WachtrijItem = SyncActie & {
  id: string;
  aangemaaktOp: string;
  pogingen: number;
  fout?: string;
};

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

export async function aantalWachtrij(): Promise<number> {
  return (await laadWachtrij()).length;
}

// Items die nog opnieuw geprobeerd kunnen worden (echt "wachtend").
export async function aantalActief(): Promise<number> {
  return (await laadWachtrij()).filter((i) => i.pogingen < MAX_POGINGEN).length;
}

// Items die definitief mislukt zijn (maximaal aantal pogingen bereikt).
export async function aantalMislukt(): Promise<number> {
  return (await laadWachtrij()).filter((i) => i.pogingen >= MAX_POGINGEN).length;
}

// Verwijder definitief mislukte items uit de wachtrij.
export async function wisMislukteItems(): Promise<number> {
  const items = await laadWachtrij();
  const overgebleven = items.filter((i) => i.pogingen < MAX_POGINGEN);
  await slaWachtrijOp(overgebleven);
  return items.length - overgebleven.length;
}

// Synchroniseer de wachtrij: verwerk elk item via de opgegeven handler.
// Als het gebouw niet meer in toegestaneGebouwIds staat, wordt het item
// toch verwerkt (upload before removal), zodat data niet verloren gaat.
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
