import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useListToewijsbareGebruikers } from "@workspace/api-client-react";
import { MeldingKaart } from "@/components/wagenpark/melding-kaart";
import {
  type VoertuigMelding,
  MELDING_TYPE_LABELS,
  MELDING_STATUS_LABELS,
} from "@/lib/wagenpark-melding-types";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { PaginaHulp } from "@/components/pagina-hulp";

export default function WagenparkMeldingenPagina() {
  const [typeFilter, setTypeFilter] = useState<string>("alle");
  const [statusFilter, setStatusFilter] = useState<string>("alle");

  const qc = useQueryClient();

  const { data: meldingen = [], isLoading } = useQuery<VoertuigMelding[]>({
    queryKey: ["wagenpark-meldingen-overzicht"],
    queryFn: async () => {
      const r = await fetch("/api/wagenpark/meldingen", { credentials: "include" });
      if (!r.ok) return [];
      return r.json() as Promise<VoertuigMelding[]>;
    },
    refetchInterval: 30000,
  });

  const { data: toewijsbareGebruikers = [] } = useListToewijsbareGebruikers();

  const patchMelding = useMutation({
    mutationFn: async ({ id, ...waarden }: {
      id: number;
      status?: string;
      admin_notitie?: string;
      toegewezen_beheerder_id?: number | null;
      onderhoud_id?: number | null;
      opvolg_notitie?: string;
    }) => {
      const r = await fetch(`/api/wagenpark/meldingen/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(waarden),
      });
      if (!r.ok) throw new Error("Bijwerken mislukt");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["wagenpark-meldingen-overzicht"] }),
  });

  const gefilterd = meldingen
    .filter((m) => typeFilter === "alle" || m.type === typeFilter)
    .filter((m) => statusFilter === "alle" || m.status === statusFilter);

  const openCount = meldingen.filter(
    (m) => m.status === "nieuw" || m.status === "in_beoordeling" || m.status === "actie_nodig",
  ).length;

  return (
    <div className="p-6 space-y-6 max-w-screen-xl">
      <PaginaHulp pagina="wagenpark-meldingen" />
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/wagenpark">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Terug naar wagenpark
          </Link>
        </Button>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary" />
            Meldingen
          </h1>
          <p className="text-sm text-muted-foreground">
            Storingen, schades, kwartaalcontroles en overige meldingen van alle voertuigen — {openCount} open.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle typen</SelectItem>
              {Object.entries(MELDING_TYPE_LABELS).map(([waarde, label]) => (
                <SelectItem key={waarde} value={waarde}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle statussen</SelectItem>
              {Object.entries(MELDING_STATUS_LABELS).map(([waarde, label]) => (
                <SelectItem key={waarde} value={waarde}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Meldingen laden...</p>
        ) : gefilterd.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Geen meldingen gevonden voor deze filters.
          </p>
        ) : (
          gefilterd.map((m) => (
            <MeldingKaart
              key={m.id}
              melding={m}
              toewijsbareGebruikers={toewijsbareGebruikers}
              toonVoertuigLink
              onPatch={(waarden) => patchMelding.mutate({ id: m.id, ...waarden })}
            />
          ))
        )}
      </div>
    </div>
  );
}
