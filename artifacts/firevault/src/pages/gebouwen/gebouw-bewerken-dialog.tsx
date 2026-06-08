import { useEffect, useState } from "react";
import { useUpdateGebouw } from "@workspace/api-client-react";
import type { Gebouw } from "@workspace/api-client-react";
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
import { Loader2, AlertCircle } from "lucide-react";

interface Velden {
  naam: string;
  adres: string;
  stad: string;
  postcode: string;
  omschrijving: string;
  bouwjaar: string;
  gebouw_type: string;
  aantal_verdiepingen: string;
  hoogte: string;
  breedte: string;
  diepte: string;
  oppervlakte: string;
}

function tekst(v: string | number | null | undefined): string {
  return v == null ? "" : String(v);
}

function getalOfNull(v: string): number | null {
  if (!v.trim()) return null;
  const n = parseFloat(v.replace(",", "."));
  return isFinite(n) ? n : null;
}

function uitGebouw(gebouw: Gebouw): Velden {
  return {
    naam: tekst(gebouw.naam),
    adres: tekst(gebouw.adres),
    stad: tekst(gebouw.stad),
    postcode: tekst(gebouw.postcode),
    omschrijving: tekst(gebouw.omschrijving),
    bouwjaar: tekst(gebouw.bouwjaar),
    gebouw_type: tekst(gebouw.gebouw_type),
    aantal_verdiepingen: tekst(gebouw.aantal_verdiepingen),
    hoogte: tekst(gebouw.hoogte),
    breedte: tekst(gebouw.breedte),
    diepte: tekst(gebouw.diepte),
    oppervlakte: tekst(gebouw.oppervlakte),
  };
}

interface Props {
  gebouw: Gebouw;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GebouwBewerkenDialog({ gebouw, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const wijzigGebouw = useUpdateGebouw();

  const [velden, setVelden] = useState<Velden>(() => uitGebouw(gebouw));
  const [foutmelding, setFoutmelding] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setVelden(uitGebouw(gebouw));
      setFoutmelding(null);
    }
  }, [open, gebouw]);

  function zet<K extends keyof Velden>(key: K, waarde: string) {
    setVelden((v) => ({ ...v, [key]: waarde }));
  }

  async function bewaar() {
    setFoutmelding(null);
    if (!velden.naam.trim() || !velden.adres.trim()) {
      setFoutmelding("Naam en adres zijn verplicht.");
      return;
    }
    try {
      await wijzigGebouw.mutateAsync({
        id: gebouw.id,
        data: {
          naam: velden.naam,
          adres: velden.adres,
          stad: velden.stad || null,
          postcode: velden.postcode || null,
          omschrijving: velden.omschrijving || null,
          bouwjaar: getalOfNull(velden.bouwjaar),
          gebouw_type: velden.gebouw_type || null,
          aantal_verdiepingen: getalOfNull(velden.aantal_verdiepingen),
          hoogte: getalOfNull(velden.hoogte),
          breedte: getalOfNull(velden.breedte),
          diepte: getalOfNull(velden.diepte),
          oppervlakte: getalOfNull(velden.oppervlakte),
        },
      });
      await queryClient.invalidateQueries();
      onOpenChange(false);
    } catch {
      setFoutmelding("Gebouw kon niet worden opgeslagen.");
    }
  }

  const bezig = wijzigGebouw.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gebouw bewerken</DialogTitle>
          <DialogDescription>
            Pas de gegevens van dit gebouw aan en sla de wijzigingen op.
          </DialogDescription>
        </DialogHeader>

        {foutmelding && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" /> {foutmelding}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="b-naam">Naam *</Label>
            <Input
              id="b-naam"
              value={velden.naam}
              onChange={(e) => zet("naam", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-adres">Adres *</Label>
            <Input
              id="b-adres"
              placeholder="Coolsingel 40"
              value={velden.adres}
              onChange={(e) => zet("adres", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-postcode">Postcode</Label>
            <Input
              id="b-postcode"
              placeholder="3011 AD"
              value={velden.postcode}
              onChange={(e) => zet("postcode", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-stad">Stad</Label>
            <Input
              id="b-stad"
              placeholder="Rotterdam"
              value={velden.stad}
              onChange={(e) => zet("stad", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-type">Type</Label>
            <Input
              id="b-type"
              placeholder="kantoor, woonhuis..."
              value={velden.gebouw_type}
              onChange={(e) => zet("gebouw_type", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-bouwjaar">Bouwjaar</Label>
            <Input
              id="b-bouwjaar"
              inputMode="numeric"
              value={velden.bouwjaar}
              onChange={(e) => zet("bouwjaar", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-verdiepingen">Aantal verdiepingen</Label>
            <Input
              id="b-verdiepingen"
              inputMode="numeric"
              value={velden.aantal_verdiepingen}
              onChange={(e) => zet("aantal_verdiepingen", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-hoogte">Hoogte (m)</Label>
            <Input
              id="b-hoogte"
              inputMode="decimal"
              value={velden.hoogte}
              onChange={(e) => zet("hoogte", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-breedte">Breedte (m)</Label>
            <Input
              id="b-breedte"
              inputMode="decimal"
              value={velden.breedte}
              onChange={(e) => zet("breedte", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-diepte">Diepte (m)</Label>
            <Input
              id="b-diepte"
              inputMode="decimal"
              value={velden.diepte}
              onChange={(e) => zet("diepte", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-oppervlakte">Oppervlakte (m²)</Label>
            <Input
              id="b-oppervlakte"
              inputMode="decimal"
              value={velden.oppervlakte}
              onChange={(e) => zet("oppervlakte", e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="b-omschrijving">Omschrijving</Label>
          <Textarea
            id="b-omschrijving"
            rows={3}
            value={velden.omschrijving}
            onChange={(e) => zet("omschrijving", e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={bezig}>
            Annuleren
          </Button>
          <Button onClick={bewaar} disabled={bezig}>
            {bezig ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Opslaan...
              </>
            ) : (
              "Wijzigingen opslaan"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
