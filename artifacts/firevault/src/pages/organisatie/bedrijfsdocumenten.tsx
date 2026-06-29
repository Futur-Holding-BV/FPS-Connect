import { useState } from "react";
import {
  useListOrgBedrijfsdocumenten,
  useCreateOrgBedrijfsdocument,
  useUpdateOrgBedrijfsdocument,
  useDeleteOrgBedrijfsdocument,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Files,
  Plus,
  Pencil,
  Trash2,
  FileText,
  ShieldCheck,
  Award,
  BookMarked,
  FolderOpen,
} from "lucide-react";

const CATEGORIEEN: { waarde: string; label: string; icoon: typeof FileText }[] = [
  { waarde: "contract", label: "Contracten", icoon: FileText },
  { waarde: "vergunning", label: "Vergunningen", icoon: ShieldCheck },
  { waarde: "certificaat", label: "Certificaten", icoon: Award },
  { waarde: "kwaliteitshandboek", label: "Kwaliteitshandboeken", icoon: BookMarked },
  { waarde: "overig", label: "Overig", icoon: FolderOpen },
];

const STATUS_KLEUREN: Record<string, string> = {
  actief: "bg-green-100 text-green-700",
  verlopen: "bg-red-100 text-red-700",
  ingetrokken: "bg-gray-100 text-gray-700",
};

const leegForm = {
  naam: "",
  categorie: "contract",
  omschrijving: "",
  uitgever: "",
  referentie: "",
  ingangsdatum: "",
  vervaldatum: "",
  status: "actief",
  opmerkingen: "",
};

type Bedrijfsdocument = {
  id: number;
  naam: string;
  categorie: string;
  omschrijving?: string | null;
  uitgever?: string | null;
  referentie?: string | null;
  ingangsdatum?: string | null;
  vervaldatum?: string | null;
  status: string;
  document_id?: number | null;
  opmerkingen?: string | null;
};

function isVerlopen(datum: string | null | undefined): boolean {
  if (!datum) return false;
  return new Date(datum) < new Date();
}

export default function BedrijfsdocumentenPagina() {
  const { data: documenten = [], isLoading } = useListOrgBedrijfsdocumenten();
  const createDoc = useCreateOrgBedrijfsdocument();
  const updateDoc = useUpdateOrgBedrijfsdocument();
  const deleteDoc = useDeleteOrgBedrijfsdocument();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [dialoogOpen, setDialoogOpen] = useState(false);
  const [bewerkId, setBewerkId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...leegForm });
  const [verwijderBevestiging, setVerwijderBevestiging] = useState<number | null>(null);
  const [actieveCat, setActieveCat] = useState<string>("alle");

  const setFormVeld = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const openNieuw = (cat?: string) => {
    setBewerkId(null);
    setForm({ ...leegForm, categorie: cat ?? "contract" });
    setDialoogOpen(true);
  };

  const openBewerken = (d: Bedrijfsdocument) => {
    setBewerkId(d.id);
    setForm({
      naam: d.naam ?? "",
      categorie: d.categorie ?? "overig",
      omschrijving: d.omschrijving ?? "",
      uitgever: d.uitgever ?? "",
      referentie: d.referentie ?? "",
      ingangsdatum: d.ingangsdatum ?? "",
      vervaldatum: d.vervaldatum ?? "",
      status: d.status ?? "actief",
      opmerkingen: d.opmerkingen ?? "",
    });
    setDialoogOpen(true);
  };

  const slaOp = async () => {
    if (!form.naam || !form.categorie) {
      toast({ title: "Naam en categorie zijn verplicht", variant: "destructive" });
      return;
    }
    const payload = {
      naam: form.naam.trim(),
      categorie: form.categorie,
      omschrijving: form.omschrijving || undefined,
      uitgever: form.uitgever || undefined,
      referentie: form.referentie || undefined,
      ingangsdatum: form.ingangsdatum || undefined,
      vervaldatum: form.vervaldatum || undefined,
      status: form.status,
      opmerkingen: form.opmerkingen || undefined,
    };
    try {
      if (bewerkId) {
        await updateDoc.mutateAsync({ id: bewerkId, data: payload });
        toast({ title: "Document bijgewerkt" });
      } else {
        await createDoc.mutateAsync({ data: payload });
        toast({ title: "Document geregistreerd" });
      }
      queryClient.invalidateQueries({ queryKey: ["listOrgBedrijfsdocumenten"] });
      setDialoogOpen(false);
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  };

  const verwijder = async (id: number) => {
    try {
      await deleteDoc.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: ["listOrgBedrijfsdocumenten"] });
      setVerwijderBevestiging(null);
      toast({ title: "Document verwijderd" });
    } catch {
      toast({ title: "Verwijderen mislukt", variant: "destructive" });
    }
  };

  const gefilterdeDocumenten =
    actieveCat === "alle" ? documenten : documenten.filter((d) => d.categorie === actieveCat);

  const aantalVerlopend = documenten.filter(
    (d) => d.vervaldatum && isVerlopen(d.vervaldatum) && d.status === "actief"
  ).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bedrijfsdocumenten</h1>
          <p className="text-muted-foreground mt-1">
            Contracten, vergunningen, certificaten en overige interne bedrijfsdocumenten.
          </p>
        </div>
        <Button onClick={() => openNieuw()}>
          <Plus className="h-4 w-4 mr-2" />
          Document toevoegen
        </Button>
      </div>

      {aantalVerlopend > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-red-500 shrink-0" />
          <p className="text-sm text-red-700">
            <span className="font-medium">{aantalVerlopend} {aantalVerlopend === 1 ? "document is verlopen" : "documenten zijn verlopen"}</span> — controleer de vervaldatums en vernieuw of pas de status aan.
          </p>
        </div>
      )}

      {/* Statistieken */}
      {documenten.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {CATEGORIEEN.map(({ waarde, label, icoon: Icoon }) => {
            const aantal = documenten.filter((d) => d.categorie === waarde).length;
            return (
              <button
                key={waarde}
                onClick={() => setActieveCat(actieveCat === waarde ? "alle" : waarde)}
                className={`rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 ${actieveCat === waarde ? "border-primary bg-primary/5" : ""}`}
              >
                <Icoon className="h-4 w-4 text-muted-foreground mb-1" />
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-xl font-bold">{aantal}</p>
              </button>
            );
          })}
        </div>
      )}

      {documenten.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <div className="p-4 rounded-full bg-muted">
              <Files className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">Nog geen bedrijfsdocumenten geregistreerd</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                Registreer contracten, vergunningen, certificaten en kwaliteitshandboeken.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => openNieuw()}>
              <Plus className="h-4 w-4 mr-1" />
              Eerste document toevoegen
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {(actieveCat === "alle" ? CATEGORIEEN : CATEGORIEEN.filter((c) => c.waarde === actieveCat)).map(
            ({ waarde, label, icoon: Icoon }) => {
              const docs = documenten.filter((d) => d.categorie === waarde);
              if (docs.length === 0 && actieveCat === "alle") return null;
              return (
                <Card key={waarde}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Icoon className="h-4 w-4" />
                      {label}
                      <span className="text-sm font-normal text-muted-foreground">({docs.length})</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {docs.length === 0 ? (
                      <div className="flex items-center justify-between py-2">
                        <p className="text-sm text-muted-foreground italic">Geen documenten in deze categorie.</p>
                        <Button size="sm" variant="outline" onClick={() => openNieuw(waarde)}>
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Toevoegen
                        </Button>
                      </div>
                    ) : (
                      <div className="divide-y">
                        {docs.map((d) => {
                          const verlopen = isVerlopen(d.vervaldatum) && d.status === "actief";
                          return (
                            <div key={d.id} className="py-3 flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-sm">{d.naam}</span>
                                  <Badge
                                    className={verlopen ? "bg-red-100 text-red-700" : (STATUS_KLEUREN[d.status] ?? "")}
                                    variant="outline"
                                  >
                                    {verlopen ? "Verlopen" : d.status}
                                  </Badge>
                                </div>
                                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                                  {d.uitgever && <span className="text-xs text-muted-foreground">{d.uitgever}</span>}
                                  {d.referentie && <span className="text-xs text-muted-foreground">Ref. {d.referentie}</span>}
                                  {d.ingangsdatum && <span className="text-xs text-muted-foreground">Ingangsdatum: {d.ingangsdatum}</span>}
                                  {d.vervaldatum && (
                                    <span className={`text-xs ${verlopen ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                                      Verloopt: {d.vervaldatum}
                                    </span>
                                  )}
                                  {d.omschrijving && <span className="text-xs text-muted-foreground">{d.omschrijving}</span>}
                                </div>
                              </div>
                              <div className="flex gap-1 shrink-0">
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openBewerken(d)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => setVerwijderBevestiging(d.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            }
          )}
        </div>
      )}

      <Dialog open={dialoogOpen} onOpenChange={setDialoogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{bewerkId ? "Document bewerken" : "Document registreren"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5 md:col-span-2">
                <Label>Naam document</Label>
                <Input value={form.naam} onChange={(e) => setFormVeld("naam", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Categorie</Label>
                <Select value={form.categorie} onValueChange={(v) => setFormVeld("categorie", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIEEN.map(({ waarde, label }) => (
                      <SelectItem key={waarde} value={waarde}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setFormVeld("status", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="actief">Actief</SelectItem>
                    <SelectItem value="verlopen">Verlopen</SelectItem>
                    <SelectItem value="ingetrokken">Ingetrokken</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Uitgever / Instantie</Label>
                <Input value={form.uitgever} onChange={(e) => setFormVeld("uitgever", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Referentienummer</Label>
                <Input value={form.referentie} onChange={(e) => setFormVeld("referentie", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Ingangsdatum</Label>
                <Input type="date" value={form.ingangsdatum} onChange={(e) => setFormVeld("ingangsdatum", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Vervaldatum</Label>
                <Input type="date" value={form.vervaldatum} onChange={(e) => setFormVeld("vervaldatum", e.target.value)} />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Omschrijving</Label>
                <Textarea value={form.omschrijving} onChange={(e) => setFormVeld("omschrijving", e.target.value)} rows={2} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialoogOpen(false)}>Annuleren</Button>
            <Button onClick={slaOp} disabled={createDoc.isPending || updateDoc.isPending}>
              {(createDoc.isPending || updateDoc.isPending) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {bewerkId ? "Opslaan" : "Registreren"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={verwijderBevestiging !== null} onOpenChange={() => setVerwijderBevestiging(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Document verwijderen</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Weet u zeker dat u dit document wilt verwijderen uit de registratie?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerwijderBevestiging(null)}>Annuleren</Button>
            <Button
              variant="destructive"
              onClick={() => verwijderBevestiging && verwijder(verwijderBevestiging)}
              disabled={deleteDoc.isPending}
            >
              Verwijderen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
