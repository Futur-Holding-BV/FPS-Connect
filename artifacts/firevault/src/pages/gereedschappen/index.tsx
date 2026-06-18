import { useState } from "react";
import { Link } from "wouter";
import { useListGereedschappen, useCreateGereedschap } from "@workspace/api-client-react";
import type { GereedschapInput, Gereedschap } from "@workspace/api-client-react";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Wrench, Search, AlertTriangle } from "lucide-react";

const STATUSSEN = [
  "Beschikbaar", "In bruikleen", "Defect gemeld", "Beschadigd",
  "Ter keuring", "Afgekeurd", "In reparatie", "Vermist", "Afgeschreven",
];

const AANDRIJVINGEN = ["handgereedschap", "elektrisch", "accu", "machine", "overig"];

function statusKleur(status: string): string {
  switch (status) {
    case "Beschikbaar":   return "bg-green-100 text-green-800";
    case "In bruikleen":  return "bg-blue-100 text-blue-800";
    case "Defect gemeld": return "bg-orange-100 text-orange-800";
    case "Beschadigd":    return "bg-red-100 text-red-800";
    case "Ter keuring":   return "bg-yellow-100 text-yellow-800";
    case "Afgekeurd":     return "bg-red-200 text-red-900";
    case "In reparatie":  return "bg-amber-100 text-amber-800";
    case "Vermist":       return "bg-purple-100 text-purple-800";
    case "Afgeschreven":  return "bg-gray-100 text-gray-600";
    default:              return "bg-gray-100 text-gray-700";
  }
}

const leegFormulier: GereedschapInput = {
  omschrijving: "",
  categorie: "overig",
  aandrijving: "handgereedschap",
  gegraveerd_nummer: null,
  merk: null,
  type: null,
  serienummer: null,
  met_snoer: false,
  accu_inbegrepen: false,
  lader_inbegrepen: false,
  koffer_inbegrepen: false,
  aankoopdatum: null,
  aankoopprijs: null,
  leverancier: null,
  garantietermijn: null,
  status: "Beschikbaar",
  keuringsplichtig: false,
  locatie: null,
  laatste_keuring: null,
  volgende_keuring: null,
  opmerkingen: null,
  huidige_medewerker_id: null,
};

export default function GereedschappenPagina() {
  const { heeftNiveau } = useBevoegdheid();
  const magSchrijven = heeftNiveau("gereedschappen", 2);

  const [zoek, setZoek] = useState("");
  const [statusFilter, setStatusFilter] = useState("alle");
  const [nieuwOpen, setNieuwOpen] = useState(false);
  const [formulier, setFormulier] = useState<GereedschapInput>(leegFormulier);
  const [opslaan, setOpslaan] = useState(false);

  const queryClient = useQueryClient();

  const params = {
    ...(statusFilter !== "alle" && { status: statusFilter }),
    ...(zoek && { zoek }),
  };

  const { data: gereedschappen, isLoading } = useListGereedschappen(
    Object.keys(params).length > 0 ? params : undefined
  );

  const maakAan = useCreateGereedschap({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["listGereedschappen"] });
        setNieuwOpen(false);
        setFormulier(leegFormulier);
        setOpslaan(false);
      },
      onError: () => setOpslaan(false),
    },
  });

  function handleOpslaan() {
    if (!formulier.omschrijving) return;
    setOpslaan(true);
    maakAan.mutate({ data: formulier });
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Wrench className="h-6 w-6 text-[#F23B0D]" />
          <div>
            <h1 className="text-xl font-bold">Gereedschappen</h1>
            <p className="text-sm text-muted-foreground">Centraal register voor machines en gereedschappen</p>
          </div>
        </div>
        {magSchrijven && (
          <Button onClick={() => setNieuwOpen(true)} className="bg-[#F23B0D] hover:bg-[#d43309] text-white">
            <Plus className="h-4 w-4 mr-2" />
            Registreren
          </Button>
        )}
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Zoeken op omschrijving, volgnummer of merk..."
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Alle statussen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle statussen</SelectItem>
            {STATUSSEN.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Volgnummer</TableHead>
              <TableHead>Omschrijving</TableHead>
              <TableHead>Merk / Type</TableHead>
              <TableHead>Categorie</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Huidige medewerker</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Laden...</TableCell>
              </TableRow>
            ) : !gereedschappen || gereedschappen.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Wrench className="h-8 w-8 opacity-30" />
                    <p>Geen gereedschappen gevonden</p>
                    {magSchrijven && (
                      <Button variant="outline" size="sm" onClick={() => setNieuwOpen(true)}>
                        <Plus className="h-4 w-4 mr-1" />
                        Eerste registreren
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              gereedschappen.map((item: Gereedschap) => (
                <TableRow key={item.id} className="cursor-pointer hover:bg-muted/50">
                  <TableCell>
                    <Link href={`/gereedschappen/${item.id}`} className="font-mono text-sm font-medium text-[#F23B0D]">
                      {item.volgnummer}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/gereedschappen/${item.id}`} className="hover:underline font-medium">
                      {item.omschrijving}
                    </Link>
                    {item.gegraveerd_nummer && (
                      <p className="text-xs text-muted-foreground">Gegraveerd: {item.gegraveerd_nummer}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {[item.merk, item.type].filter(Boolean).join(" / ") || "—"}
                  </TableCell>
                  <TableCell className="text-sm">{item.categorie}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusKleur(item.status)}`}>
                      {item.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {item.huidige_medewerker_naam ?? "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {gereedschappen && gereedschappen.length > 0 && (
        <p className="text-sm text-muted-foreground">{gereedschappen.length} gereedschap{gereedschappen.length !== 1 ? "pen" : ""}</p>
      )}

      <Dialog open={nieuwOpen} onOpenChange={setNieuwOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gereedschap registreren</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Omschrijving <span className="text-red-500">*</span></Label>
              <Input
                placeholder="bijv. Boormachine, Slijptol"
                value={formulier.omschrijving}
                onChange={(e) => setFormulier((f) => ({ ...f, omschrijving: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Categorie <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="bijv. boormachine, zaag"
                  value={formulier.categorie ?? ""}
                  onChange={(e) => setFormulier((f) => ({ ...f, categorie: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Aandrijving <span className="text-red-500">*</span></Label>
                <Select
                  value={formulier.aandrijving ?? "handgereedschap"}
                  onValueChange={(v) => setFormulier((f) => ({ ...f, aandrijving: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AANDRIJVINGEN.map((a) => (
                      <SelectItem key={a} value={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Merk</Label>
                <Input
                  placeholder="bijv. Makita, Bosch"
                  value={formulier.merk ?? ""}
                  onChange={(e) => setFormulier((f) => ({ ...f, merk: e.target.value || null }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Type / Model</Label>
                <Input
                  placeholder="bijv. DHP484"
                  value={formulier.type ?? ""}
                  onChange={(e) => setFormulier((f) => ({ ...f, type: e.target.value || null }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Serienummer</Label>
                <Input
                  value={formulier.serienummer ?? ""}
                  onChange={(e) => setFormulier((f) => ({ ...f, serienummer: e.target.value || null }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Gegraveerd nummer</Label>
                <Input
                  value={formulier.gegraveerd_nummer ?? ""}
                  onChange={(e) => setFormulier((f) => ({ ...f, gegraveerd_nummer: e.target.value || null }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Leverancier</Label>
                <Input
                  value={formulier.leverancier ?? ""}
                  onChange={(e) => setFormulier((f) => ({ ...f, leverancier: e.target.value || null }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Aankoopdatum</Label>
                <Input
                  type="date"
                  value={formulier.aankoopdatum ?? ""}
                  onChange={(e) => setFormulier((f) => ({ ...f, aankoopdatum: e.target.value || null }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Aankoopprijs (EUR)</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={formulier.aankoopprijs ?? ""}
                  onChange={(e) => setFormulier((f) => ({ ...f, aankoopprijs: e.target.value ? parseFloat(e.target.value) : null }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Locatie</Label>
                <Input
                  placeholder="bijv. magazijn, depot"
                  value={formulier.locatie ?? ""}
                  onChange={(e) => setFormulier((f) => ({ ...f, locatie: e.target.value || null }))}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-4 pt-1">
              {[
                { key: "met_snoer", label: "Met snoer" },
                { key: "accu_inbegrepen", label: "Accu inbegrepen" },
                { key: "lader_inbegrepen", label: "Lader inbegrepen" },
                { key: "koffer_inbegrepen", label: "Koffer inbegrepen" },
                { key: "keuringsplichtig", label: "Keuringsplichtig" },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={(formulier as unknown as Record<string, unknown>)[key] as boolean ?? false}
                    onChange={(e) => setFormulier((f) => ({ ...f, [key]: e.target.checked }))}
                    className="rounded"
                  />
                  {label}
                </label>
              ))}
            </div>
            <div className="space-y-1">
              <Label>Opmerkingen</Label>
              <Input
                value={formulier.opmerkingen ?? ""}
                onChange={(e) => setFormulier((f) => ({ ...f, opmerkingen: e.target.value || null }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNieuwOpen(false)}>Annuleren</Button>
            <Button
              onClick={handleOpslaan}
              disabled={!formulier.omschrijving || opslaan}
              className="bg-[#F23B0D] hover:bg-[#d43309] text-white"
            >
              {opslaan ? "Registreren..." : "Registreren"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
