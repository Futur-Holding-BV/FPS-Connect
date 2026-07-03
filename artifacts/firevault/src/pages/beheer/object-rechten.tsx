import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trash2, Plus, ShieldCheck, Clock, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, isAfter } from "date-fns";
import { nl } from "date-fns/locale";

interface ObjectRecht {
  id: number;
  objectType: string;
  objectId: number;
  objectNaam: string | null;
  moduleId: string | null;
  niveau: number;
  niveauLabel: string;
  geldigVan: string | null;
  geldigTot: string | null;
  tijdelijk: boolean;
  verlopen: boolean;
  reden: string | null;
  verleendDoorNaam: string | null;
  aangemaaktOp: string;
}

interface Gebruiker {
  id: number;
  naam: string;
  email: string;
  rol: string;
}

const OBJECT_TYPES: Record<string, string> = {
  gebouw: "Gebouw",
  project: "Project",
  document: "Document",
  medewerker: "Medewerker",
  offerte: "Offerte",
  dossier: "Dossier",
  onderhoudscontract: "Onderhoudscontract",
};

const NIVEAUS = [
  { value: "0", label: "Geen toegang" },
  { value: "1", label: "Lezen" },
  { value: "2", label: "Bewerken" },
  { value: "3", label: "Volledig" },
  { value: "4", label: "Beheren" },
];

function niveauKleur(niveau: number, verlopen: boolean): "default" | "secondary" | "destructive" | "outline" {
  if (verlopen) return "outline";
  if (niveau >= 3) return "default";
  if (niveau >= 1) return "secondary";
  return "destructive";
}

function ObjectRechtRij({
  recht,
  onVerwijder,
}: {
  recht: ObjectRecht;
  onVerwijder: (id: number) => void;
}) {
  return (
    <TableRow className={recht.verlopen ? "opacity-50" : ""}>
      <TableCell>
        <span className="font-medium">
          {OBJECT_TYPES[recht.objectType] ?? recht.objectType}
        </span>
        {recht.objectNaam && (
          <span className="ml-2 text-muted-foreground text-sm">— {recht.objectNaam}</span>
        )}
        <span className="ml-2 text-xs text-muted-foreground">#{recht.objectId}</span>
      </TableCell>
      <TableCell>
        <Badge variant={niveauKleur(recht.niveau, recht.verlopen)}>
          {recht.niveauLabel}
        </Badge>
      </TableCell>
      <TableCell className="text-sm">
        {recht.tijdelijk ? (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {recht.geldigTot
              ? format(new Date(recht.geldigTot), "d MMM yyyy", { locale: nl })
              : "—"}
            {recht.verlopen && (
              <span className="ml-1 text-destructive text-xs">verlopen</span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">Permanent</span>
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {recht.reden ?? "—"}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {recht.verleendDoorNaam ?? "—"}
      </TableCell>
      <TableCell>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={() => onVerwijder(recht.id)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function NieuwRechtDialog({
  open,
  gebruikerId,
  onClose,
}: {
  open: boolean;
  gebruikerId: number;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [objectType, setObjectType] = useState("gebouw");
  const [objectId, setObjectId] = useState("");
  const [niveau, setNiveau] = useState("1");
  const [tijdelijk, setTijdelijk] = useState(false);
  const [geldigTot, setGeldigTot] = useState("");
  const [reden, setReden] = useState("");

  const verlenen = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/gebruikers/${gebruikerId}/object-rechten`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objectType,
          objectId: parseInt(objectId, 10),
          niveau: parseInt(niveau, 10),
          geldigTot: tijdelijk && geldigTot ? geldigTot : null,
          reden: reden || null,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Onbekende fout");
      }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["object-rechten", gebruikerId] });
      toast({ title: "Recht verleend" });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Fout", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Recht verlenen</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Object-type</Label>
            <Select value={objectType} onValueChange={setObjectType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(OBJECT_TYPES).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Object-id</Label>
            <Input
              type="number"
              min={1}
              value={objectId}
              onChange={(e) => setObjectId(e.target.value)}
              placeholder="bijv. 42"
            />
          </div>
          <div>
            <Label>Niveau</Label>
            <Select value={niveau} onValueChange={setNiveau}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NIVEAUS.map((n) => (
                  <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="tijdelijk"
              checked={tijdelijk}
              onChange={(e) => setTijdelijk(e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="tijdelijk">Tijdelijk recht</Label>
          </div>
          {tijdelijk && (
            <div>
              <Label>Geldig tot</Label>
              <Input
                type="date"
                value={geldigTot}
                onChange={(e) => setGeldigTot(e.target.value)}
              />
            </div>
          )}
          <div>
            <Label>Reden (optioneel)</Label>
            <Input
              value={reden}
              onChange={(e) => setReden(e.target.value)}
              placeholder="bijv. Tijdelijke vervanging"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuleren</Button>
          <Button
            onClick={() => verlenen.mutate()}
            disabled={verlenen.isPending || !objectId}
          >
            Verlenen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GebruikerRechtenPaneel({ gebruiker }: { gebruiker: Gebruiker }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [nieuwOpen, setNieuwOpen] = useState(false);

  const { data: rechten = [], isLoading } = useQuery<ObjectRecht[]>({
    queryKey: ["object-rechten", gebruiker.id],
    queryFn: async () => {
      const r = await fetch(`/api/gebruikers/${gebruiker.id}/object-rechten`);
      if (!r.ok) throw new Error("Laden mislukt");
      return r.json();
    },
  });

  const verwijder = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/object-rechten/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Verwijderen mislukt");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["object-rechten", gebruiker.id] });
      toast({ title: "Recht ingetrokken" });
    },
  });

  const actief = rechten.filter((r) => !r.verlopen);
  const verlopen = rechten.filter((r) => r.verlopen);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">{gebruiker.naam}</p>
          <p className="text-sm text-muted-foreground">{gebruiker.email}</p>
        </div>
        <Button size="sm" onClick={() => setNieuwOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Recht verlenen
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Laden…</p>}

      {!isLoading && rechten.length === 0 && (
        <div className="flex flex-col items-center py-8 text-muted-foreground gap-2">
          <ShieldCheck className="h-8 w-8" />
          <p className="text-sm">Geen object-rechten voor deze gebruiker</p>
        </div>
      )}

      {actief.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Object</TableHead>
              <TableHead>Niveau</TableHead>
              <TableHead>Geldigheid</TableHead>
              <TableHead>Reden</TableHead>
              <TableHead>Verleend door</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {actief.map((r) => (
              <ObjectRechtRij
                key={r.id}
                recht={r}
                onVerwijder={(id) => verwijder.mutate(id)}
              />
            ))}
          </TableBody>
        </Table>
      )}

      {verlopen.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground py-2">
            {verlopen.length} verlopen recht{verlopen.length !== 1 ? "en" : ""}
          </summary>
          <Table>
            <TableBody>
              {verlopen.map((r) => (
                <ObjectRechtRij
                  key={r.id}
                  recht={r}
                  onVerwijder={(id) => verwijder.mutate(id)}
                />
              ))}
            </TableBody>
          </Table>
        </details>
      )}

      {nieuwOpen && (
        <NieuwRechtDialog
          open
          gebruikerId={gebruiker.id}
          onClose={() => setNieuwOpen(false)}
        />
      )}
    </div>
  );
}

export default function ObjectRechtenBeheer() {
  const [geselecteerdeGebruiker, setGeselecteerdeGebruiker] = useState<Gebruiker | null>(null);

  const { data: gebruikers = [] } = useQuery<Gebruiker[]>({
    queryKey: ["gebruikers-lijst"],
    queryFn: async () => {
      const r = await fetch("/api/gebruikers");
      if (!r.ok) throw new Error("Laden mislukt");
      return r.json();
    },
  });

  const { data: alleRechten = [], isLoading: laadtAlle } = useQuery<ObjectRecht[]>({
    queryKey: ["alle-object-rechten"],
    queryFn: async () => {
      const r = await fetch("/api/object-rechten");
      if (!r.ok) throw new Error("Laden mislukt");
      return r.json();
    },
  });

  const qc = useQueryClient();
  const { toast } = useToast();

  const verwijder = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/object-rechten/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Verwijderen mislukt");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alle-object-rechten"] });
      toast({ title: "Recht ingetrokken" });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Object-rechten</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Verleen gebruikers extra toegang tot specifieke objecten (gebouwen, projecten, dossiers)
          onafhankelijk van hun module-bevoegdheden. Tijdelijke rechten vervallen automatisch.
        </p>
      </div>

      <Tabs defaultValue="per-gebruiker">
        <TabsList>
          <TabsTrigger value="per-gebruiker">Per gebruiker</TabsTrigger>
          <TabsTrigger value="alle">Alle actieve rechten</TabsTrigger>
        </TabsList>

        <TabsContent value="per-gebruiker" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Selecteer een gebruiker</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select
                value={geselecteerdeGebruiker?.id.toString() ?? ""}
                onValueChange={(v) => {
                  const g = gebruikers.find((u) => u.id.toString() === v) ?? null;
                  setGeselecteerdeGebruiker(g);
                }}
              >
                <SelectTrigger className="max-w-sm">
                  <SelectValue placeholder="Kies een gebruiker…" />
                </SelectTrigger>
                <SelectContent>
                  {gebruikers.map((g) => (
                    <SelectItem key={g.id} value={g.id.toString()}>
                      {g.naam} — {g.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {geselecteerdeGebruiker && (
                <GebruikerRechtenPaneel gebruiker={geselecteerdeGebruiker} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alle" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Alle actieve object-rechten</CardTitle>
            </CardHeader>
            <CardContent>
              {laadtAlle && <p className="text-sm text-muted-foreground">Laden…</p>}
              {!laadtAlle && alleRechten.length === 0 && (
                <div className="flex flex-col items-center py-8 text-muted-foreground gap-2">
                  <AlertCircle className="h-8 w-8" />
                  <p className="text-sm">Geen object-rechten verleend</p>
                </div>
              )}
              {alleRechten.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Object</TableHead>
                      <TableHead>Niveau</TableHead>
                      <TableHead>Geldigheid</TableHead>
                      <TableHead>Reden</TableHead>
                      <TableHead>Verleend door</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alleRechten.map((r) => (
                      <ObjectRechtRij
                        key={r.id}
                        recht={r}
                        onVerwijder={(id) => verwijder.mutate(id)}
                      />
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="border-dashed">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <ShieldCheck className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Hoe werken object-rechten?</p>
              <p>
                Object-rechten geven een gebruiker extra toegang tot een specifiek object
                (bijv. gebouw #42) zonder zijn module-bevoegdheden te verhogen.
                Ze worden gecombineerd met de bestaande module-rechten: toegang als
                <em> ten minste een</em> van beide geldt.
              </p>
              <p>
                Tijdelijke rechten vervallen automatisch na de opgegeven datum en worden
                grijs weergegeven. Ze worden niet automatisch verwijderd.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
