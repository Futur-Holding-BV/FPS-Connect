/**
 * Importmanifest-formulier — invulscherm voor de 7 officiële bronregels.
 * Losgekoppeld van de tab zodat beide bestanden onder de regelgrens blijven.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useImportLoonJaarparameters,
  getListLoonJaarparametersQueryKey,
  LoonJaarImportBronInputBronsoort,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Info, Save } from "lucide-react";
import {
  BRON_VOLGORDE,
  BRONSOORT_LABELS,
  HUIDIG_JAAR,
  BronVeldWaarden,
  leegBronnenRecord,
} from "./helpers";

type Props = {
  onSluiten: () => void;
};

export function ImportmanifestForm({ onSluiten }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [importJaar, setImportJaar] = useState(String(HUIDIG_JAAR));
  const [bronnen, setBronnen] = useState<Record<string, BronVeldWaarden>>(
    leegBronnenRecord(),
  );

  const importMutation = useImportLoonJaarparameters({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListLoonJaarparametersQueryKey() });
        toast({ title: "Import geregistreerd" });
        onSluiten();
      },
      onError: () =>
        toast({ title: "Import mislukt", variant: "destructive" }),
    },
  });

  function setBron(soort: string, veld: keyof BronVeldWaarden, waarde: string) {
    setBronnen((prev) => ({
      ...prev,
      [soort]: { ...prev[soort], [veld]: waarde },
    }));
  }

  function submitImport() {
    const invoer = BRON_VOLGORDE.map((soort) => {
      const b = bronnen[soort];
      if (
        !b.bron_url ||
        !b.officiele_bestandsnaam ||
        !b.officiele_versie ||
        !b.verwachte_sha256 ||
        !b.vindplaats
      ) {
        return null;
      }
      return {
        bronsoort: soort as LoonJaarImportBronInputBronsoort,
        bron_url: b.bron_url,
        officiele_bestandsnaam: b.officiele_bestandsnaam,
        officiele_versie: b.officiele_versie,
        verwachte_sha256: b.verwachte_sha256,
        vindplaats: b.vindplaats,
      };
    });

    if (invoer.some((b) => b === null)) {
      toast({
        title: "Vul alle 7 bronregels volledig in.",
        variant: "destructive",
      });
      return;
    }

    importMutation.mutate({
      data: {
        jaar: Number(importJaar),
        bronnen: invoer as NonNullable<(typeof invoer)[number]>[],
      },
    });
  }

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Importmanifest registreren</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1 w-40">
          <Label>Jaar</Label>
          <Input
            type="number"
            value={importJaar}
            onChange={(e) => setImportJaar(e.target.value)}
          />
        </div>

        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Info className="w-3.5 h-3.5" />
          Vul exact 7 officiële bronregels in (alle velden verplicht).
        </p>

        {BRON_VOLGORDE.map((soort, idx) => (
          <div key={soort} className="border rounded p-3 space-y-3 bg-muted/20">
            <h4 className="text-xs font-semibold">
              {idx + 1}. {BRONSOORT_LABELS[soort]}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">URL</Label>
                <Input
                  placeholder="https://…"
                  value={bronnen[soort].bron_url}
                  onChange={(e) => setBron(soort, "bron_url", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Officiële bestandsnaam</Label>
                <Input
                  placeholder="bijv. cao-loonparameters-2025.xlsx"
                  value={bronnen[soort].officiele_bestandsnaam}
                  onChange={(e) =>
                    setBron(soort, "officiele_bestandsnaam", e.target.value)
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Versie</Label>
                <Input
                  placeholder="bijv. v1.0 / 2025-01-15"
                  value={bronnen[soort].officiele_versie}
                  onChange={(e) =>
                    setBron(soort, "officiele_versie", e.target.value)
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">SHA-256 hash (64 hex-tekens)</Label>
                <Input
                  placeholder="a3f…"
                  maxLength={64}
                  value={bronnen[soort].verwachte_sha256}
                  onChange={(e) =>
                    setBron(soort, "verwachte_sha256", e.target.value)
                  }
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Vindplaats</Label>
                <Input
                  placeholder="bijv. Belastingdienst, publicatie 15 jan 2025"
                  value={bronnen[soort].vindplaats}
                  onChange={(e) => setBron(soort, "vindplaats", e.target.value)}
                />
              </div>
            </div>
          </div>
        ))}

        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={submitImport}
            disabled={importMutation.isPending}
          >
            <Save className="w-3.5 h-3.5 mr-1.5" />
            {importMutation.isPending
              ? "Registreren…"
              : "Importmanifest opslaan"}
          </Button>
          <Button variant="outline" size="sm" onClick={onSluiten}>
            Annuleren
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
