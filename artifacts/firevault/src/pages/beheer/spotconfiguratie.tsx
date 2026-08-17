import { useState } from "react";
import { useListSpotStatusConfiguratie, useUpdateSpotStatusConfiguratie } from "@workspace/api-client-react";
import type { SpotStatusConfiguratie } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil, Check, X, SlidersHorizontal } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const faseGroepLabel: Record<string, string> = {
  operationeel: "Operationeel",
  uitvoering: "Uitvoering",
  oplevering: "Oplevering",
  calculatie: "Calculatie",
};

const faseGroepKleur: Record<string, string> = {
  operationeel: "bg-slate-100 text-slate-700",
  uitvoering: "bg-blue-100 text-blue-800",
  oplevering: "bg-green-100 text-green-800",
  calculatie: "bg-violet-100 text-violet-800",
};

function StatusRij({ item }: { item: SpotStatusConfiguratie }) {
  const queryClient = useQueryClient();
  const bijwerken = useUpdateSpotStatusConfiguratie();
  const [bewerken, setBewerken] = useState(false);
  const [naam, setNaam] = useState(item.weergave_naam);
  const [opslaan, setOpslaan] = useState(false);

  async function toggleActief(actief: boolean) {
    await bijwerken.mutateAsync({ statusCode: item.status_code, data: { actief } });
    queryClient.invalidateQueries({ queryKey: ["/api/spot-status-configuratie"] });
  }

  async function slaOp() {
    if (!naam.trim()) return;
    setOpslaan(true);
    try {
      await bijwerken.mutateAsync({ statusCode: item.status_code, data: { weergave_naam: naam.trim() } });
      queryClient.invalidateQueries({ queryKey: ["/api/spot-status-configuratie"] });
      setBewerken(false);
    } finally {
      setOpslaan(false);
    }
  }

  function annuleer() {
    setNaam(item.weergave_naam);
    setBewerken(false);
  }

  return (
    <div className={`flex items-center gap-4 py-3 border-b last:border-0 ${!item.actief ? "opacity-60" : ""}`}>
      <div className="w-6 text-xs text-muted-foreground text-center font-mono">{item.volgorde}</div>
      <div className="flex-1 min-w-0">
        {bewerken ? (
          <div className="flex items-center gap-2">
            <Input
              value={naam}
              onChange={(e) => setNaam(e.target.value)}
              className="h-7 text-sm"
              onKeyDown={(e) => { if (e.key === "Enter") slaOp(); if (e.key === "Escape") annuleer(); }}
            />
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={slaOp} disabled={opslaan}>
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={annuleer}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{item.weergave_naam}</span>
            <span className="text-xs text-muted-foreground font-mono">({item.status_code})</span>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 opacity-0 group-hover:opacity-100"
              onClick={() => { setNaam(item.weergave_naam); setBewerken(true); }}
            >
              <Pencil className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
      <Badge variant="outline" className={`text-xs ${faseGroepKleur[item.fase_groep] ?? "bg-gray-100 text-gray-700"}`}>
        {faseGroepLabel[item.fase_groep] ?? item.fase_groep}
      </Badge>
      <Switch
        checked={item.actief}
        onCheckedChange={toggleActief}
        disabled={bijwerken.isPending}
        aria-label={`Status ${item.weergave_naam} ${item.actief ? "uitschakelen" : "inschakelen"}`}
      />
    </div>
  );
}

function FaseGroepSectie({ naam, items }: { naam: string; items: SpotStatusConfiguratie[] }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {faseGroepLabel[naam] ?? naam}
        </h3>
        <Badge variant="outline" className={`text-xs ${faseGroepKleur[naam] ?? ""}`}>
          {items.filter((i) => i.actief).length}/{items.length} actief
        </Badge>
      </div>
      <div className="group">
        {items.map((item) => (
          <StatusRij key={item.status_code} item={item} />
        ))}
      </div>
    </div>
  );
}

export default function SpotconfiguratieBeheer() {
  const { data: statussen = [], isLoading } = useListSpotStatusConfiguratie({
    query: { queryKey: ["/api/spot-status-configuratie"] },
  });

  const gegroepeerd = statussen.reduce<Record<string, SpotStatusConfiguratie[]>>((acc, s) => {
    const groep = s.fase_groep ?? "operationeel";
    if (!acc[groep]) acc[groep] = [];
    acc[groep].push(s);
    return acc;
  }, {});

  const volgorde = ["operationeel", "uitvoering", "oplevering", "calculatie"];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 data-paginatitel className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <SlidersHorizontal className="h-6 w-6" /> Spotconfiguratie
        </h1>
        <p className="text-muted-foreground mt-1">
          Beheer de beschikbare statussen voor spots. Schakel statussen in of uit en pas de weergavenaam aan.
          Calculatie-statussen zijn standaard uitgeschakeld en worden pas actief wanneer de Calculatie-module live gaat.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Spot-statusflow</CardTitle>
          <CardDescription>
            De volgorde bepaalt de weergave in het statusmenu. Uitgeschakelde statussen zijn niet selecteerbaar voor monteurs en beheerders.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-10 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : statussen.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Geen statussen geconfigureerd.
            </div>
          ) : (
            <div className="space-y-6">
              {volgorde.map((groep) =>
                gegroepeerd[groep]?.length ? (
                  <FaseGroepSectie key={groep} naam={groep} items={gegroepeerd[groep]} />
                ) : null
              )}
              {Object.keys(gegroepeerd)
                .filter((g) => !volgorde.includes(g))
                .map((groep) => (
                  <FaseGroepSectie key={groep} naam={groep} items={gegroepeerd[groep]} />
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
