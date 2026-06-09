import { useState } from "react";
import {
  useListLabels,
  useCreateLabel,
  useUpdateLabel,
  useListVoorzieningTypes,
  getListLabelsQueryKey,
} from "@workspace/api-client-react";
import type { Label, VoorzieningType } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label as UiLabel } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Archive, ArchiveRestore, Plus, Tag } from "lucide-react";

const GEEN_TYPE = "__alle__";

export default function ToepassingenBeheer() {
  const queryClient = useQueryClient();

  const [typeFilter, setTypeFilter] = useState(GEEN_TYPE);
  const [inclGearchiveerd, setInclGearchiveerd] = useState(false);
  const [nieuwOpen, setNieuwOpen] = useState(false);

  const { data: typen = [] } = useListVoorzieningTypes();
  const { data: labels = [], isLoading } = useListLabels({
    type_code: typeFilter === GEEN_TYPE ? undefined : typeFilter,
    inclusief_gearchiveerd: inclGearchiveerd || undefined,
  });

  const maakLabel = useCreateLabel();
  const wijzigLabel = useUpdateLabel();

  const [nieuw, setNieuw] = useState({
    type_code: "",
    naam: "",
    fabrikant: "",
    testnorm: "",
  });

  async function bewaarNieuw() {
    if (!nieuw.type_code || !nieuw.naam.trim()) return;
    await maakLabel.mutateAsync({
      data: {
        type_code: nieuw.type_code,
        naam: nieuw.naam.trim(),
        fabrikant: nieuw.fabrikant.trim() || undefined,
        testnorm: nieuw.testnorm.trim() || undefined,
      },
    });
    await queryClient.invalidateQueries({ queryKey: getListLabelsQueryKey() });
    setNieuw({ type_code: "", naam: "", fabrikant: "", testnorm: "" });
    setNieuwOpen(false);
  }

  async function toggleArchief(l: Label) {
    await wijzigLabel.mutateAsync({
      id: l.id,
      data: { gearchiveerd: !l.gearchiveerd },
    });
    await queryClient.invalidateQueries({ queryKey: getListLabelsQueryKey() });
  }

  const typeLookup = Object.fromEntries(
    (typen as VoorzieningType[]).map((t) => [t.code, t])
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Toepassingen</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Beheer de label-catalogus van geteste producten en systemen per applicatie-type.
          </p>
        </div>
        <Button onClick={() => setNieuwOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nieuwe toepassing
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-48">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter op applicatie-type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={GEEN_TYPE}>Alle types</SelectItem>
                  {(typen as VoorzieningType[]).map((t) => (
                    <SelectItem key={t.code} value={t.code}>
                      <span className="font-mono text-xs mr-2 text-muted-foreground">
                        {t.code}
                      </span>
                      {t.naam}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="incl-gearchiveerd"
                checked={inclGearchiveerd}
                onCheckedChange={setInclGearchiveerd}
              />
              <UiLabel htmlFor="incl-gearchiveerd" className="text-sm cursor-pointer">
                Inclusief gearchiveerd
              </UiLabel>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-10 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : (labels as Label[]).length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              <Tag className="h-8 w-8 mx-auto mb-2 opacity-30" />
              Geen toepassingen gevonden.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left p-3 font-medium text-muted-foreground">Type</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Naam</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Fabrikant</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Testnorm</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {(labels as Label[]).map((l) => (
                  <tr
                    key={l.id}
                    className={`border-b last:border-0 hover:bg-muted/20 transition-colors ${
                      l.gearchiveerd ? "opacity-50" : ""
                    }`}
                  >
                    <td className="p-3">
                      {typeLookup[l.type_code] ? (
                        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                          {l.type_code}
                        </span>
                      ) : (
                        <span className="text-muted-foreground font-mono text-xs">{l.type_code}</span>
                      )}
                    </td>
                    <td className="p-3 font-medium">{l.naam}</td>
                    <td className="p-3 text-muted-foreground">{l.fabrikant ?? "—"}</td>
                    <td className="p-3">
                      {l.testnorm ? (
                        <Badge variant="outline" className="text-xs font-normal">
                          {l.testnorm}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-3">
                      {l.gearchiveerd ? (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          Gearchiveerd
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-green-700 border-green-300 bg-green-50">
                          Actief
                        </Badge>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => toggleArchief(l)}
                        disabled={wijzigLabel.isPending}
                      >
                        {l.gearchiveerd ? (
                          <>
                            <ArchiveRestore className="h-3.5 w-3.5" />
                            Herstellen
                          </>
                        ) : (
                          <>
                            <Archive className="h-3.5 w-3.5" />
                            Archiveren
                          </>
                        )}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={nieuwOpen} onOpenChange={setNieuwOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nieuwe toepassing</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <UiLabel>Applicatie-type *</UiLabel>
              <Select
                value={nieuw.type_code}
                onValueChange={(v) => setNieuw((n) => ({ ...n, type_code: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Kies een type" />
                </SelectTrigger>
                <SelectContent>
                  {(typen as VoorzieningType[]).filter((t) => t.actief).map((t) => (
                    <SelectItem key={t.code} value={t.code}>
                      <span className="font-mono text-xs mr-2 text-muted-foreground">
                        {t.code}
                      </span>
                      {t.naam}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <UiLabel htmlFor="nieuw-naam">Naam *</UiLabel>
              <Input
                id="nieuw-naam"
                placeholder="Bijv. Hilti CP 611A"
                value={nieuw.naam}
                onChange={(e) => setNieuw((n) => ({ ...n, naam: e.target.value }))}
              />
            </div>
            <div>
              <UiLabel htmlFor="nieuw-fabrikant">Fabrikant</UiLabel>
              <Input
                id="nieuw-fabrikant"
                placeholder="Optioneel"
                value={nieuw.fabrikant}
                onChange={(e) => setNieuw((n) => ({ ...n, fabrikant: e.target.value }))}
              />
            </div>
            <div>
              <UiLabel htmlFor="nieuw-testnorm">Testnorm</UiLabel>
              <Input
                id="nieuw-testnorm"
                placeholder="Bijv. EN 1366-2 (optioneel)"
                value={nieuw.testnorm}
                onChange={(e) => setNieuw((n) => ({ ...n, testnorm: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNieuwOpen(false)}>
              Annuleren
            </Button>
            <Button
              onClick={bewaarNieuw}
              disabled={!nieuw.type_code || !nieuw.naam.trim() || maakLabel.isPending}
            >
              {maakLabel.isPending ? "Opslaan..." : "Toevoegen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
