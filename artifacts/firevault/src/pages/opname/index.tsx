import { useState } from "react";
import { Link } from "wouter";
import {
  useListOpnames,
  useListGebouwen,
  useCreateOpname,
  useDeleteOpname,
  useSluitOpnameAf,
  type OpnameSamenvatting,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  ClipboardList,
  Plus,
  Building2,
  Calendar,
  User,
  List,
  Lock,
  Trash2,
  Search,
  CheckCircle2,
} from "lucide-react";

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  concept: { label: "Concept", variant: "secondary" },
  definitief: { label: "Definitief", variant: "default" },
};

function OpnameKaart({
  opname,
  onDefinitief,
  onVerwijder,
}: {
  opname: OpnameSamenvatting;
  onDefinitief: () => void;
  onVerwijder: () => void;
}) {
  const st = STATUS_BADGE[opname.status] ?? STATUS_BADGE.concept;
  const isDefinitief = opname.status === "definitief";

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <Link href={`/opname/${opname.id}`} className="block mb-3">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate hover:text-primary transition-colors">{opname.naam}</p>
              {opname.gebouw_naam && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Building2 className="w-3 h-3" />
                  {opname.gebouw_naam}
                </p>
              )}
            </div>
            <Badge variant={st.variant} className="shrink-0">
              {st.label}
            </Badge>
          </div>

          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {opname.datum}
            </span>
            <span className="flex items-center gap-1">
              <List className="w-3 h-3" />
              {opname.aantal_items} {opname.aantal_items === 1 ? "item" : "items"}
            </span>
            {opname.aangemaakt_door_naam && (
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" />
                {opname.aangemaakt_door_naam}
              </span>
            )}
          </div>

          {opname.notities && (
            <p className="text-xs text-muted-foreground bg-muted rounded px-2 py-1 mt-2 line-clamp-2">
              {opname.notities}
            </p>
          )}
        </Link>

        <div className="flex gap-2 pt-2 border-t">
          {!isDefinitief && (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => { e.preventDefault(); onDefinitief(); }}
              className="flex-1 text-xs gap-1"
            >
              <Lock className="w-3 h-3" />
              Definitief
            </Button>
          )}
          {isDefinitief && (
            <div className="flex-1 flex items-center gap-1 text-xs text-green-700">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Definitief
            </div>
          )}
          {!isDefinitief && (
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => { e.preventDefault(); onVerwijder(); }}
              className="text-destructive hover:text-destructive hover:bg-destructive/10 px-2"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function OpnamePagina() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [zoek, setZoek] = useState("");
  const [gebouwFilter, setGebouwFilter] = useState<string>("alle");
  const [dialogOpen, setDialogOpen] = useState(false);

  const [nieuwNaam, setNieuwNaam] = useState("");
  const [nieuwGebouwId, setNieuwGebouwId] = useState("");
  const [nieuwDatum, setNieuwDatum] = useState(new Date().toISOString().slice(0, 10));
  const [nieuwNotities, setNieuwNotities] = useState("");

  const { data: opnames, isLoading } = useListOpnames(
    gebouwFilter !== "alle" ? { gebouw_id: Number(gebouwFilter) } : undefined,
  );
  const { data: gebouwen } = useListGebouwen();
  const maakAan = useCreateOpname();
  const verwijder = useDeleteOpname();
  const sluitAf = useSluitOpnameAf();

  const gefilterd = (opnames ?? []).filter((o) => {
    if (!zoek.trim()) return true;
    const q = zoek.toLowerCase();
    return (
      o.naam.toLowerCase().includes(q) ||
      (o.gebouw_naam ?? "").toLowerCase().includes(q) ||
      (o.aangemaakt_door_naam ?? "").toLowerCase().includes(q)
    );
  });

  async function aanmaken() {
    if (!nieuwNaam.trim() || !nieuwGebouwId) return;
    try {
      await maakAan.mutateAsync({
        data: {
          naam: nieuwNaam.trim(),
          gebouw_id: Number(nieuwGebouwId),
          datum: nieuwDatum,
          notities: nieuwNotities || undefined,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["listOpnames"] });
      setDialogOpen(false);
      setNieuwNaam("");
      setNieuwGebouwId("");
      setNieuwDatum(new Date().toISOString().slice(0, 10));
      setNieuwNotities("");
      toast({ title: "Opname aangemaakt" });
    } catch {
      toast({ title: "Fout bij aanmaken", variant: "destructive" });
    }
  }

  async function definitiefMaken(id: number) {
    try {
      await sluitAf.mutateAsync({ id });
      await queryClient.invalidateQueries({ queryKey: ["listOpnames"] });
      toast({ title: "Opname definitief gemaakt" });
    } catch {
      toast({ title: "Fout", variant: "destructive" });
    }
  }

  async function verwijderen(id: number) {
    if (!confirm("Opname en alle items definitief verwijderen?")) return;
    try {
      await verwijder.mutateAsync({ id });
      await queryClient.invalidateQueries({ queryKey: ["listOpnames"] });
      toast({ title: "Opname verwijderd" });
    } catch {
      toast({ title: "Fout bij verwijderen", variant: "destructive" });
    }
  }

  const aantalConcept = (opnames ?? []).filter((o) => o.status === "concept").length;
  const aantalDefinitief = (opnames ?? []).filter((o) => o.status === "definitief").length;
  const totaalItems = (opnames ?? []).reduce((s, o) => s + o.aantal_items, 0);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Paginakop */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <ClipboardList className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 data-paginatitel className="text-xl font-bold">Opname</h1>
            <p className="text-sm text-muted-foreground">Veldopnames voor de calculatiefase</p>
          </div>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Nieuwe opname
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nieuwe opname aanmaken</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label htmlFor="naam">Naam</Label>
                <Input
                  id="naam"
                  value={nieuwNaam}
                  onChange={(e) => setNieuwNaam(e.target.value)}
                  placeholder="Bijv. Begane grond inventarisatie"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="gebouw">Gebouw</Label>
                <Select value={nieuwGebouwId} onValueChange={setNieuwGebouwId}>
                  <SelectTrigger id="gebouw" className="mt-1">
                    <SelectValue placeholder="Selecteer een gebouw..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(gebouwen ?? []).map((g) => (
                      <SelectItem key={g.id} value={String(g.id)}>
                        {g.naam}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="datum">Datum</Label>
                <DatePicker
                  id="datum"
                  value={nieuwDatum}
                  onChange={setNieuwDatum}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="notities">Notities (optioneel)</Label>
                <Textarea
                  id="notities"
                  value={nieuwNotities}
                  onChange={(e) => setNieuwNotities(e.target.value)}
                  placeholder="Extra informatie over deze opname..."
                  className="mt-1"
                  rows={3}
                />
              </div>
              <Button
                onClick={aanmaken}
                disabled={!nieuwNaam.trim() || !nieuwGebouwId || maakAan.isPending}
                className="w-full"
              >
                {maakAan.isPending ? "Bezig..." : "Opname aanmaken"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Statistieken */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Totaal</p>
            <p className="text-2xl font-bold">{(opnames ?? []).length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Concept</p>
            <p className="text-2xl font-bold text-amber-600">{aantalConcept}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Totaal items</p>
            <p className="text-2xl font-bold">{totaalItems}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
            placeholder="Zoek opname, gebouw of medewerker..."
            className="pl-9"
          />
        </div>
        <Select value={gebouwFilter} onValueChange={setGebouwFilter}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle gebouwen</SelectItem>
            {(gebouwen ?? []).map((g) => (
              <SelectItem key={g.id} value={String(g.id)}>
                {g.naam}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Lijst */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : gefilterd.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">
              {zoek || gebouwFilter !== "alle" ? "Geen opnames gevonden" : "Nog geen opnames aangemaakt"}
            </p>
            <p className="text-sm mt-1">
              {zoek || gebouwFilter !== "alle"
                ? "Pas de filters aan of maak een nieuwe opname aan"
                : "Gebruik de mobiele app om een opname te starten in het veld"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {gefilterd.map((o) => (
            <OpnameKaart
              key={o.id}
              opname={o}
              onDefinitief={() => definitiefMaken(o.id)}
              onVerwijder={() => verwijderen(o.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
