import { useEffect, useMemo, useState } from "react";
import {
  useUpdateVoorziening,
  useListVerdiepingen,
  useListLabels,
  getListVerdiepingenQueryKey,
} from "@workspace/api-client-react";
import type { VoorzieningDetail, Label } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label as UiLabel } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle } from "lucide-react";
import { ApplicatiePicker } from "@/components/applicatie-picker";
import { ToepassingMultiSelect } from "@/components/toepassing-multi-select";
import { useRol } from "@/context/rol-context";

const GEEN_VERDIEPING = "__geen__";
const GEEN_WERENDHEID = "__geen__";
const GEEN_RUIMTE = "__geen__";

const WERENDHEID_OPTIES = [
  { waarde: "WRD30", label: "WRD 30 — rookwerend 30 min" },
  { waarde: "EW20", label: "EW 20 — brandwerend WBDBO 20 min" },
  { waarde: "EW30", label: "EW 30 — brandwerend WBDBO 30 min" },
  { waarde: "EW60", label: "EW 60 — brandwerend WBDBO 60 min" },
  { waarde: "EI30", label: "EI 30 — brandwerend 30 min" },
  { waarde: "EI60", label: "EI 60 — brandwerend 60 min" },
];

const RUIMTE_STANDAARD = [
  "entree",
  "keuken",
  "badkamer",
  "toilet",
  "slaapkamer",
  "woonkamer",
  "trappenhuis",
  "gang",
  "meterkast",
  "zolder",
  "berging",
  "kelder",
  "parkeergarage",
  "buitenruimte",
];

function getRuimteVolgorde(): string[] {
  try {
    const raw = localStorage.getItem("fps_ruimte_gebruik");
    if (!raw) return RUIMTE_STANDAARD;
    const counts: Record<string, number> = JSON.parse(raw);
    return [...RUIMTE_STANDAARD].sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0));
  } catch {
    return RUIMTE_STANDAARD;
  }
}

function registreerRuimteGebruik(ruimte: string) {
  if (!RUIMTE_STANDAARD.includes(ruimte)) return;
  try {
    const raw = localStorage.getItem("fps_ruimte_gebruik");
    const counts: Record<string, number> = raw ? JSON.parse(raw) : {};
    counts[ruimte] = (counts[ruimte] ?? 0) + 1;
    localStorage.setItem("fps_ruimte_gebruik", JSON.stringify(counts));
  } catch { /* ignore */ }
}

function toWerendheid(classificatie: string, wbdbo?: string | null, wrd?: string | null): string {
  if (wrd) return `WRD${wrd}`;
  if (wbdbo) return `EW${wbdbo}`;
  if (classificatie) return `EI${classificatie}`;
  return GEEN_WERENDHEID;
}

function fromWerendheid(w: string): { classificatie: string; wbdbo?: string; wrd?: string } {
  if (w.startsWith("WRD")) return { classificatie: "60", wrd: w.slice(3) };
  if (w.startsWith("EW")) return { classificatie: "60", wbdbo: w.slice(2) };
  if (w.startsWith("EI")) return { classificatie: w.slice(2) };
  return { classificatie: "60" };
}

interface Velden {
  type: string;
  werendheid: string;
  verdieping_id: string;
  ruimte: string;
  huisnummer: string;
  materialen: string;
  installatie_datum: string;
  opmerkingen: string;
}

function tekst(v: string | number | null | undefined): string {
  return v == null ? "" : String(v);
}

function uitVoorziening(v: VoorzieningDetail): Velden {
  return {
    type: tekst(v.type) || "",
    werendheid: toWerendheid(
      tekst(v.classificatie),
      (v as any).wbdbo,
      (v as any).wrd,
    ),
    verdieping_id: v.verdieping_id != null ? String(v.verdieping_id) : "",
    ruimte: tekst(v.ruimte),
    huisnummer: tekst((v as any).huisnummer),
    materialen: tekst((v as any).materialen),
    installatie_datum: tekst((v as any).installatie_datum),
    opmerkingen: tekst((v as any).opmerkingen),
  };
}

interface Props {
  voorziening: VoorzieningDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VoorzieningBewerkenDialog({
  voorziening,
  open,
  onOpenChange,
}: Props) {
  const queryClient = useQueryClient();
  const wijzigVoorziening = useUpdateVoorziening();
  const { echteRol } = useRol();
  const magLabelsAanmaken =
    echteRol === "beheerder" || echteRol === "hoofdbeheerder";

  const [velden, setVelden] = useState<Velden>(() => uitVoorziening(voorziening));
  const [labelIds, setLabelIds] = useState<number[]>([]);
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [ruimteOpties] = useState(() => getRuimteVolgorde());

  const vandaag = new Date().toISOString().slice(0, 10);

  const { data: verdiepingen } = useListVerdiepingen(voorziening.gebouw_id, {
    query: {
      enabled: open && !!voorziening.gebouw_id,
      queryKey: getListVerdiepingenQueryKey(voorziening.gebouw_id),
    },
  });

  const { data: labelData = [] } = useListLabels(
    velden.type ? { type_code: velden.type } : {},
  );

  const fabrikanten = useMemo(() => {
    if (!labelIds.length) return [];
    const geselecteerd = (labelData as Label[]).filter(
      (l) => labelIds.includes(l.id) && l.fabrikant,
    );
    return [...new Set(geselecteerd.map((l) => l.fabrikant as string))];
  }, [labelData, labelIds]);

  useEffect(() => {
    if (open) {
      const init = uitVoorziening(voorziening);
      if (!init.installatie_datum) init.installatie_datum = vandaag;
      setVelden(init);
      const bestaandLabels = (voorziening as any).labels;
      setLabelIds(
        Array.isArray(bestaandLabels)
          ? bestaandLabels.map((l: any) => l.id)
          : []
      );
      setFoutmelding(null);
    }
  }, [open, voorziening]);

  const set =
    (k: keyof Velden) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setVelden((f) => ({ ...f, [k]: e.target.value }));

  async function verstuur() {
    setFoutmelding(null);
    try {
      if (velden.ruimte && velden.ruimte !== GEEN_RUIMTE) {
        registreerRuimteGebruik(velden.ruimte);
      }
      const werendheidVelden = fromWerendheid(velden.werendheid);
      await wijzigVoorziening.mutateAsync({
        id: voorziening.id,
        data: {
          type: velden.type || undefined,
          classificatie: werendheidVelden.classificatie,
          wbdbo: werendheidVelden.wbdbo,
          wrd: werendheidVelden.wrd,
          verdieping_id: velden.verdieping_id
            ? Number(velden.verdieping_id)
            : undefined,
          ruimte: velden.ruimte && velden.ruimte !== GEEN_RUIMTE
            ? velden.ruimte
            : undefined,
          huisnummer: velden.huisnummer.trim() || undefined,
          materialen: velden.materialen.trim() || undefined,
          installatie_datum: velden.installatie_datum || undefined,
          opmerkingen: velden.opmerkingen.trim() || undefined,
          label_ids: labelIds,
        },
      });
      await queryClient.invalidateQueries();
      onOpenChange(false);
    } catch {
      setFoutmelding("De spot kon niet worden bijgewerkt. Probeer het opnieuw.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Spot bewerken</DialogTitle>
          <DialogDescription>
            Werk de gegevens van {voorziening.objectnummer} bij.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <UiLabel>Applicatie (type)</UiLabel>
              <ApplicatiePicker
                value={velden.type}
                onValueChange={(v) => {
                  setVelden((f) => ({ ...f, type: v }));
                  setLabelIds([]);
                }}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Kies de applicatie uit de centrale bibliotheek.
              </p>
            </div>

            {velden.type && (
              <div className="col-span-2 border rounded-lg p-4 space-y-2">
                <p className="text-sm font-medium">Toepassing</p>
                <p className="text-xs text-muted-foreground">
                  Selecteer de gebruikte producten of systemen bij deze spot.
                </p>
                <ToepassingMultiSelect
                  typeCode={velden.type}
                  selectedIds={labelIds}
                  onSelectionChange={setLabelIds}
                  magLabelsAanmaken={magLabelsAanmaken}
                />
                {fabrikanten.length > 0 && (
                  <p className="text-xs text-muted-foreground pt-1 border-t">
                    <span className="font-medium">Fabrikant(en):</span>{" "}
                    {fabrikanten.join(", ")}
                  </p>
                )}
              </div>
            )}

            <div className="col-span-2">
              <UiLabel>Brand- of rookwerendheid</UiLabel>
              <Select
                value={velden.werendheid || GEEN_WERENDHEID}
                onValueChange={(v) =>
                  setVelden((f) => ({ ...f, werendheid: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Kies werendheid..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={GEEN_WERENDHEID}>Niet opgegeven</SelectItem>
                  {WERENDHEID_OPTIES.map((w) => (
                    <SelectItem key={w.waarde} value={w.waarde}>
                      <span className="font-mono text-xs mr-2">{w.waarde}</span>
                      {w.label.split(" — ")[1]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <UiLabel>Verdieping</UiLabel>
              <Select
                value={velden.verdieping_id || GEEN_VERDIEPING}
                onValueChange={(v) =>
                  setVelden((f) => ({
                    ...f,
                    verdieping_id: v === GEEN_VERDIEPING ? "" : v,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Kies verdieping" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={GEEN_VERDIEPING}>Geen verdieping</SelectItem>
                  {verdiepingen?.map((v: { id: number; naam: string }) => (
                    <SelectItem key={v.id} value={String(v.id)}>
                      {v.naam}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <UiLabel>Ruimte</UiLabel>
              <Select
                value={velden.ruimte || GEEN_RUIMTE}
                onValueChange={(v) =>
                  setVelden((f) => ({
                    ...f,
                    ruimte: v === GEEN_RUIMTE ? "" : v,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Kies ruimte..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={GEEN_RUIMTE}>Niet opgegeven</SelectItem>
                  {ruimteOpties.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <UiLabel htmlFor="bw-huisnummer">Huisnummer (optioneel)</UiLabel>
              <Input
                id="bw-huisnummer"
                value={velden.huisnummer}
                onChange={set("huisnummer")}
                placeholder="Bijv. 12 of 4B"
              />
            </div>

            <div>
              <UiLabel htmlFor="bw-inst">Installatiedatum</UiLabel>
              <Input
                id="bw-inst"
                type="date"
                value={velden.installatie_datum}
                onChange={set("installatie_datum")}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Standaard de datum van vandaag.
              </p>
            </div>

            <div className="col-span-2">
              <UiLabel htmlFor="bw-mat">Materialen (optioneel)</UiLabel>
              <Input
                id="bw-mat"
                value={velden.materialen}
                onChange={set("materialen")}
                placeholder="Bijv. Hilti CP 611A brandmortel"
              />
            </div>

            <div className="col-span-2">
              <UiLabel htmlFor="bw-opm">Opmerkingen</UiLabel>
              <Textarea
                id="bw-opm"
                value={velden.opmerkingen}
                onChange={set("opmerkingen")}
                placeholder="Optionele opmerkingen..."
                rows={3}
              />
            </div>
          </div>

          {foutmelding && (
            <div className="flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{foutmelding}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuleren
          </Button>
          <Button onClick={verstuur} disabled={wijzigVoorziening.isPending}>
            {wijzigVoorziening.isPending ? "Opslaan..." : "Wijzigingen opslaan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
