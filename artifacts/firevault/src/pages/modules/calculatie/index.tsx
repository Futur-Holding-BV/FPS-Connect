import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  useListModCalculaties,
  useDeleteModCalculatie,
  useDupliceerModCalculatie,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, MoreHorizontal, Copy, Trash2, Calculator, TrendingUp, Building2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const STATUS_LABEL: Record<string, string> = {
  concept: "Concept",
  intern_akkoord: "Intern akkoord",
  aangeboden: "Aangeboden",
  gewonnen: "Gewonnen",
  verloren: "Verloren",
};

const STATUS_KLEUR: Record<string, string> = {
  concept: "bg-slate-100 text-slate-700 border-slate-200",
  intern_akkoord: "bg-blue-100 text-blue-800 border-blue-200",
  aangeboden: "bg-amber-100 text-amber-800 border-amber-200",
  gewonnen: "bg-green-100 text-green-800 border-green-200",
  verloren: "bg-red-100 text-red-800 border-red-200",
};

function formatBedrag(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

function formatDatum(s: string) {
  return new Date(s).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

export default function ModulesCalculatie() {
  const [, navigate] = useLocation();
  const [zoek, setZoek] = useState("");
  const [statusFilter, setStatusFilter] = useState("alle");
  const [teVerwijderen, setTeVerwijderen] = useState<number | null>(null);

  const queryClient = useQueryClient();
  const { data: calculaties = [], isLoading } = useListModCalculaties(undefined, {
    query: { queryKey: ["mod-calculaties"] },
  });
  const deleteMut = useDeleteModCalculatie({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mod-calculaties"] }),
    },
  });
  const dupliceerMut = useDupliceerModCalculatie({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mod-calculaties"] }),
    },
  });

  const gefilterd = calculaties.filter((c) => {
    if (statusFilter !== "alle" && c.status !== statusFilter) return false;
    if (zoek) {
      const q = zoek.toLowerCase();
      return (
        c.naam.toLowerCase().includes(q) ||
        (c.klant_naam ?? "").toLowerCase().includes(q) ||
        (c.project_naam ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totaalWaarde = gefilterd.reduce((s, c) => s + (c.totaal_na_opslagen ?? 0), 0);
  const aantalGewonnen = calculaties.filter((c) => c.status === "gewonnen").length;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Calculaties</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Kostprijsbegrotingen voor brandpreventie- en bouwwerkzaamheden
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate("/modules/calculatie/leveranciers")}>
            <Building2 className="h-4 w-4 mr-2" />
            Leveranciers & artikelen
          </Button>
          <Button onClick={() => navigate("/modules/calculatie/nieuw")}>
            <Plus className="h-4 w-4 mr-2" />
            Nieuwe calculatie
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Calculator className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Totaal calculaties</p>
                <p className="text-2xl font-semibold">{calculaties.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-50 p-2">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Gewonnen</p>
                <p className="text-2xl font-semibold">{aantalGewonnen}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div>
              <p className="text-sm text-muted-foreground">Waarde gefilterde selectie</p>
              <p className="text-2xl font-semibold">{formatBedrag(totaalWaarde)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Zoek op naam, klant of project..."
                value={zoek}
                onChange={(e) => setZoek(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle statussen</SelectItem>
                {Object.entries(STATUS_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : gefilterd.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <Calculator className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Geen calculaties gevonden</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                  <th className="px-6 py-3 text-left font-medium">Naam</th>
                  <th className="px-4 py-3 text-left font-medium">Klant / Project</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Subtotaal</th>
                  <th className="px-4 py-3 text-right font-medium">Totaal (na opslagen)</th>
                  <th className="px-4 py-3 text-left font-medium">Aangemaakt</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {gefilterd.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3.5">
                      <Link href={`/modules/calculatie/${c.id}`}>
                        <span className="font-medium text-slate-900 hover:text-primary cursor-pointer">
                          {c.naam}
                        </span>
                      </Link>
                      {c.referentie && (
                        <p className="text-xs text-muted-foreground">{c.referentie}</p>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {c.klant_naam && <p className="text-slate-700">{c.klant_naam}</p>}
                      {c.project_naam && <p className="text-xs text-muted-foreground">{c.project_naam}</p>}
                      {!c.klant_naam && !c.project_naam && <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge className={`text-xs border ${STATUS_KLEUR[c.status] ?? STATUS_KLEUR.concept}`}>
                        {STATUS_LABEL[c.status] ?? c.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums">
                      {formatBedrag(c.subtotaal ?? 0)}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums font-medium">
                      {formatBedrag(c.totaal_na_opslagen ?? 0)}
                    </td>
                    <td className="px-4 py-3.5 text-muted-foreground text-xs">
                      {formatDatum(c.aangemaakt_op)}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/modules/calculatie/${c.id}`)}>
                            Openen
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => dupliceerMut.mutate({ id: c.id })}
                          >
                            <Copy className="h-3.5 w-3.5 mr-2" />
                            Dupliceren
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setTeVerwijderen(c.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" />
                            Verwijderen
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={teVerwijderen !== null} onOpenChange={() => setTeVerwijderen(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Calculatie verwijderen</AlertDialogTitle>
            <AlertDialogDescription>
              Weet u zeker dat u deze calculatie wilt verwijderen? Alle regels worden ook verwijderd.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (teVerwijderen) deleteMut.mutate({ id: teVerwijderen });
                setTeVerwijderen(null);
              }}
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
