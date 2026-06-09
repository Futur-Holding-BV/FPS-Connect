import { useEffect, useState } from "react";
import {
  useUpdateVoorziening,
  useListVerdiepingen,
  getListVerdiepingenQueryKey,
} from "@workspace/api-client-react";
import type { VoorzieningDetail } from "@workspace/api-client-react";
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
import { Label } from "@/components/ui/label";
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
import { FabrikantSectie } from "@/components/fabrikant-sectie";
import { useRol } from "@/context/rol-context";

const GEEN_VERDIEPING = "__geen__";

interface Velden {
  type: string;
  classificatie: string;
  verdieping_id: string;
  ruimte: string;
  locatie_omschrijving: string;
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
    classificatie: tekst(v.classificatie) || "60",
    verdieping_id: v.verdieping_id != null ? String(v.verdieping_id) : "",
    ruimte: tekst(v.ruimte),
    locatie_omschrijving: tekst(v.locatie_omschrijving),
    materialen: tekst(v.materialen),
    installatie_datum: tekst(v.installatie_datum),
    opmerkingen: tekst(v.opmerkingen),
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

  const { data: verdiepingen } = useListVerdiepingen(voorziening.gebouw_id, {
    query: {
      enabled: open && !!voorziening.gebouw_id,
      queryKey: getListVerdiepingenQueryKey(voorziening.gebouw_id),
    },
  });

  useEffect(() => {
    if (open) {
      setVelden(uitVoorziening(voorziening));
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
      await wijzigVoorziening.mutateAsync({
        id: voorziening.id,
        data: {
          type: velden.type || undefined,
          classificatie: velden.classificatie,
          verdieping_id: velden.verdieping_id
            ? Number(velden.verdieping_id)
            : undefined,
          ruimte: velden.ruimte.trim() || undefined,
          locatie_omschrijving: velden.locatie_omschrijving.trim() || undefined,
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
              <Label>Applicatie (type)</Label>
              <ApplicatiePicker
                value={velden.type}
                onValueChange={(v) => {
                  setVelden((f) => ({ ...f, type: v }));
                  setLabelIds([]);
                }}
              />
            </div>

            <div className="col-span-2">
              <Label>Classificatie (EI)</Label>
              <Select
                value={velden.classificatie}
                onValueChange={(v) =>
                  setVelden((f) => ({ ...f, classificatie: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["30", "60", "90", "120"].map((v) => (
                    <SelectItem key={v} value={v}>
                      EI {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Verdieping</Label>
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
              <Label htmlFor="bw-ruimte">Ruimte</Label>
              <Input
                id="bw-ruimte"
                value={velden.ruimte}
                onChange={set("ruimte")}
                placeholder="Bijv. Trappenhal A"
              />
            </div>

            <div className="col-span-2">
              <Label htmlFor="bw-locatie">Locatieomschrijving</Label>
              <Input
                id="bw-locatie"
                value={velden.locatie_omschrijving}
                onChange={set("locatie_omschrijving")}
                placeholder="Bijv. Noord-oost muur"
              />
            </div>

            <div className="col-span-2">
              <Label htmlFor="bw-mat">Toegepaste materialen</Label>
              <Input
                id="bw-mat"
                value={velden.materialen}
                onChange={set("materialen")}
                placeholder="Bijv. Hilti CP 611A brandmortel"
              />
            </div>

            <div>
              <Label htmlFor="bw-inst">Installatiedatum</Label>
              <Input
                id="bw-inst"
                type="date"
                value={velden.installatie_datum}
                onChange={set("installatie_datum")}
              />
            </div>

            <div className="col-span-2">
              <Label htmlFor="bw-opm">Opmerkingen</Label>
              <Textarea
                id="bw-opm"
                value={velden.opmerkingen}
                onChange={set("opmerkingen")}
                placeholder="Optionele opmerkingen..."
                rows={3}
              />
            </div>
          </div>

          {velden.type && (
            <div className="border rounded-lg p-4 space-y-2">
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
            </div>
          )}

          <div className="border rounded-lg p-4 space-y-2">
            <p className="text-sm font-medium">Fabrikant- en systeeminformatie</p>
            <FabrikantSectie />
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
