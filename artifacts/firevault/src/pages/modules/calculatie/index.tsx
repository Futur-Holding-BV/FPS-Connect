import { useState } from "react";
import { useLocation } from "wouter";
import {
  useListModCalculaties,
  useDeleteModCalculatie,
  useDupliceerModCalculatie,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus, Search, MoreHorizontal, Copy, Trash2, Calculator, TrendingUp, Building2,
  ArrowRight,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  concept: "Concept",
  intern_akkoord: "Intern akkoord",
  aangeboden: "Aangeboden",
  gewonnen: "Gewonnen",
  verloren: "Verloren",
};

const STATUS_KLEUR: Record<string, string> = {
  concept: "bg-muted text-muted-foreground border-border",
  intern_akkoord: "bg-blue-100 text-blue-800 border-blue-200",
  aangeboden: "bg-amber-100 text-amber-800 border-amber-200",
  gewonnen: "bg-green-100 text-green-800 border-green-200",
  verloren: "bg-red-100 text-red-800 border-red-200",
};

function formatBedrag(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("nl-NL", {
    style: "currency", currency: "EUR",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

function formatDatum(s: string) {
  return new Date(s).toLocaleDateString("nl-NL", {
    day: "numeric", month: "short", year: "numeric",
  });
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
      {/* Paginakop */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Calculaties</h1>
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

      {/* Statistieken */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card shadow-sm p-5 flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2.5 shrink-0">
            <Calculator className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Totaal calculaties</p>
            <p className="text-2xl font-semibold">{calculaties.length}</p>
          </div>
        </div>
        <div className="rounded-xl border bg-card shadow-sm p-5 flex items-center gap-3">
          <div className="rounded-lg bg-green-50 p-2.5 shrink-0">
            <TrendingUp className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Gewonnen</p>
            <p className="text-2xl font-semibold">{aantalGewonnen}</p>
          </div>
        </div>
        <div className="rounded-xl border bg-card shadow-sm p-5">
          <p className="text-sm text-muted-foreground">Waarde gefilterde selectie</p>
          <p className="text-2xl font-semibold">{formatBedrag(totaalWaarde)}</p>
        </div>
      </div>

      {/* Filter balk */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Zoek op naam, klant of project..."
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
            className="pl-9 bg-white"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44 bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle statussen</SelectItem>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {zoek || statusFilter !== "alle" ? (
          <p className="text-xs text-muted-foreground">
            {gefilterd.length} van {calculaties.length}
          </p>
        ) : null}
      </div>

      {/* Lijst */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : gefilterd.length === 0 ? (
        <div className="rounded-xl border bg-card py-20 text-center text-muted-foreground shadow-sm">
          <Calculator className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">Geen calculaties gevonden</p>
          {zoek && (
            <p className="text-xs mt-1">Probeer een andere zoekterm of wis het filter.</p>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {gefilterd.map((c) => (
            <div
              key={c.id}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/modules/calculatie/${c.id}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  navigate(`/modules/calculatie/${c.id}`);
                }
              }}
              className={cn(
                "group relative flex items-center gap-5 rounded-xl border bg-card px-5 py-4",
                "cursor-pointer shadow-sm",
                "hover:shadow-md hover:-translate-y-px hover:bg-muted/30",
                "transition-all duration-150 ease-out",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              )}
            >
              {/* Status-streepje links */}
              <div
                className={cn(
                  "absolute left-0 top-3 bottom-3 w-1 rounded-r-full",
                  c.status === "gewonnen"      ? "bg-green-400" :
                  c.status === "intern_akkoord" ? "bg-blue-400" :
                  c.status === "aangeboden"    ? "bg-amber-400" :
                  c.status === "verloren"      ? "bg-red-300" :
                  "bg-border"
                )}
              />

              {/* Naam + referentie */}
              <div className="min-w-0 flex-[2]">
                <p className="font-semibold text-foreground truncate leading-snug">
                  {c.naam}
                </p>
                {c.referentie ? (
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">{c.referentie}</p>
                ) : null}
              </div>

              {/* Klant / Project */}
              <div className="min-w-0 flex-[2] hidden sm:block">
                {c.klant_naam && (
                  <p className="text-sm text-foreground/80 truncate">{c.klant_naam}</p>
                )}
                {c.project_naam && (
                  <p className="text-xs text-muted-foreground truncate">{c.project_naam}</p>
                )}
                {!c.klant_naam && !c.project_naam && (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </div>

              {/* Status */}
              <div className="shrink-0">
                <Badge className={`text-xs border ${STATUS_KLEUR[c.status] ?? STATUS_KLEUR.concept}`}>
                  {STATUS_LABEL[c.status] ?? c.status}
                </Badge>
              </div>

              {/* Subtotaal */}
              <div className="shrink-0 text-right hidden md:block w-28">
                <p className="text-xs text-muted-foreground mb-0.5">Subtotaal</p>
                <p className="text-sm tabular-nums font-medium">{formatBedrag(c.subtotaal ?? 0)}</p>
              </div>

              {/* Totaal */}
              <div className="shrink-0 text-right w-32">
                <p className="text-xs text-muted-foreground mb-0.5">Totaal (na opslagen)</p>
                <p className="text-sm tabular-nums font-semibold text-foreground">
                  {formatBedrag(c.totaal_na_opslagen ?? 0)}
                </p>
              </div>

              {/* Datum */}
              <div className="shrink-0 text-right hidden lg:block w-24">
                <p className="text-xs text-muted-foreground">{formatDatum(c.aangemaakt_op)}</p>
              </div>

              {/* Pijl (hover indicator) */}
              <ArrowRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground/70 transition-colors shrink-0 hidden lg:block" />

              {/* Actiemenu — stopPropagation zodat de kaart niet opent */}
              <div
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                className="shrink-0"
              >
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                      tabIndex={-1}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => navigate(`/modules/calculatie/${c.id}`)}>
                      Openen
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => dupliceerMut.mutate({ id: c.id })}
                    >
                      <Copy className="h-3.5 w-3.5 mr-2" />
                      Dupliceren
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setTeVerwijderen(c.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" />
                      Verwijderen
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Verwijder dialoog */}
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
