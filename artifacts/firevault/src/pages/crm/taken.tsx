import { useState } from "react";
import {
  useListCrmTaken,
  useCreateCrmTaak,
  useUpdateCrmTaak,
  useDeleteCrmTaak,
  useListToewijsbareGebruikers,
  getListCrmTakenQueryKey,
  type CrmTaak,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { ClipboardList, Plus, Trash2, User, Link2, Calendar } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  bezig: "Bezig",
  afgerond: "Afgerond",
  geannuleerd: "Geannuleerd",
};

const STATUS_KLEUR: Record<string, string> = {
  open: "bg-blue-100 text-blue-700 border-blue-200",
  bezig: "bg-amber-100 text-amber-700 border-amber-200",
  afgerond: "bg-emerald-100 text-emerald-700 border-emerald-200",
  geannuleerd: "bg-gray-100 text-gray-500 border-gray-200",
};

const PRIORITEIT_LABEL: Record<string, string> = {
  laag: "Laag",
  normaal: "Normaal",
  hoog: "Hoog",
  urgent: "Urgent",
};

const PRIORITEIT_KLEUR: Record<string, string> = {
  laag: "bg-slate-100 text-slate-600 border-slate-200",
  normaal: "bg-slate-100 text-slate-700 border-slate-200",
  hoog: "bg-orange-100 text-orange-700 border-orange-200",
  urgent: "bg-red-100 text-red-700 border-red-200",
};

const KOPPELING_LABEL: Record<string, string> = {
  crm_organisatie: "Organisatie",
  crm_contactpersoon: "Contactpersoon",
  crm_projectkans: "Projectkans",
};

function datum(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("nl-NL");
}

function isVerlopen(t: CrmTaak): boolean {
  if (!t.vervaldatum || t.status === "afgerond" || t.status === "geannuleerd") return false;
  const d = new Date(t.vervaldatum);
  return !Number.isNaN(d.getTime()) && d.getTime() < Date.now();
}

export default function CrmTakenPagina() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("actief");
  const [dialoogOpen, setDialoogOpen] = useState(false);

  const { data: takenRuw = [], isLoading } = useListCrmTaken();
  const { data: gebruikers = [] } = useListToewijsbareGebruikers();

  const invalideer = () => qc.invalidateQueries({ queryKey: getListCrmTakenQueryKey() });

  const maak = useCreateCrmTaak({ mutation: { onSuccess: () => { invalideer(); setDialoogOpen(false); toast({ title: "Taak aangemaakt" }); } } });
  const wijzig = useUpdateCrmTaak({ mutation: { onSuccess: () => invalideer() } });
  const verwijder = useDeleteCrmTaak({ mutation: { onSuccess: () => { invalideer(); toast({ title: "Taak verwijderd" }); } } });

  const [nieuw, setNieuw] = useState({
    titel: "", omschrijving: "", prioriteit: "normaal", vervaldatum: "",
    toegewezen_aan_id: "", koppeling_type: "", koppeling_id: "",
  });

  const taken = takenRuw.filter((t) => {
    if (statusFilter === "alle") return true;
    if (statusFilter === "actief") return t.status !== "afgerond" && t.status !== "geannuleerd";
    return t.status === statusFilter;
  });

  const verstuurNieuw = () => {
    if (!nieuw.titel.trim()) { toast({ title: "Titel is verplicht", variant: "destructive" }); return; }
    maak.mutate({
      data: {
        titel: nieuw.titel.trim(),
        omschrijving: nieuw.omschrijving || undefined,
        prioriteit: nieuw.prioriteit,
        vervaldatum: nieuw.vervaldatum || null,
        toegewezen_aan_id: nieuw.toegewezen_aan_id ? Number(nieuw.toegewezen_aan_id) : null,
      },
    });
    setNieuw({ titel: "", omschrijving: "", prioriteit: "normaal", vervaldatum: "", toegewezen_aan_id: "", koppeling_type: "", koppeling_id: "" });
  };

  const wijzigStatus = (t: CrmTaak, status: string) => {
    wijzig.mutate({ id: t.id, data: { titel: t.titel, status } });
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="w-6 h-6" /> Taken
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Acties en opvolging binnen het CRM</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="actief">Actief</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="bezig">Bezig</SelectItem>
              <SelectItem value="afgerond">Afgerond</SelectItem>
              <SelectItem value="geannuleerd">Geannuleerd</SelectItem>
              <SelectItem value="alle">Alle</SelectItem>
            </SelectContent>
          </Select>
          <Dialog open={dialoogOpen} onOpenChange={setDialoogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-1" /> Nieuwe taak</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nieuwe taak</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Titel</Label>
                  <Input value={nieuw.titel} onChange={(e) => setNieuw({ ...nieuw, titel: e.target.value })} placeholder="Wat moet er gebeuren?" />
                </div>
                <div>
                  <Label>Omschrijving</Label>
                  <Textarea value={nieuw.omschrijving} onChange={(e) => setNieuw({ ...nieuw, omschrijving: e.target.value })} rows={3} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Prioriteit</Label>
                    <Select value={nieuw.prioriteit} onValueChange={(v) => setNieuw({ ...nieuw, prioriteit: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="laag">Laag</SelectItem>
                        <SelectItem value="normaal">Normaal</SelectItem>
                        <SelectItem value="hoog">Hoog</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Vervaldatum</Label>
                    <Input type="date" value={nieuw.vervaldatum} onChange={(e) => setNieuw({ ...nieuw, vervaldatum: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label>Toegewezen aan</Label>
                  <Select value={nieuw.toegewezen_aan_id || "geen"} onValueChange={(v) => setNieuw({ ...nieuw, toegewezen_aan_id: v === "geen" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="Niemand" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="geen">Niemand</SelectItem>
                      {gebruikers.map((g) => (
                        <SelectItem key={g.id} value={String(g.id)}>{g.naam}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialoogOpen(false)}>Annuleren</Button>
                <Button onClick={verstuurNieuw} disabled={maak.isPending}>Aanmaken</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : taken.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Geen taken gevonden.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {taken.map((t) => (
            <Card key={t.id} className={isVerlopen(t) ? "border-red-200" : ""}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Checkbox
                    className="mt-1"
                    checked={t.status === "afgerond"}
                    onCheckedChange={(c) => wijzigStatus(t, c ? "afgerond" : "open")}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`font-medium ${t.status === "afgerond" ? "line-through text-muted-foreground" : ""}`}>{t.titel}</p>
                      <Badge variant="outline" className={`text-xs border ${PRIORITEIT_KLEUR[t.prioriteit] ?? ""}`}>{PRIORITEIT_LABEL[t.prioriteit] ?? t.prioriteit}</Badge>
                      <Badge variant="outline" className={`text-xs border ${STATUS_KLEUR[t.status] ?? ""}`}>{STATUS_LABEL[t.status] ?? t.status}</Badge>
                    </div>
                    {t.omschrijving && <p className="text-sm text-muted-foreground mt-1">{t.omschrijving}</p>}
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                      {t.toegewezen_aan_naam && <span className="flex items-center gap-1"><User className="w-3 h-3" />{t.toegewezen_aan_naam}</span>}
                      {t.vervaldatum && <span className={`flex items-center gap-1 ${isVerlopen(t) ? "text-red-600 font-medium" : ""}`}><Calendar className="w-3 h-3" />{datum(t.vervaldatum)}</span>}
                      {t.koppeling_type && <span className="flex items-center gap-1"><Link2 className="w-3 h-3" />{KOPPELING_LABEL[t.koppeling_type] ?? t.koppeling_type}{t.koppeling_naam ? `: ${t.koppeling_naam}` : ""}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Select value={t.status} onValueChange={(v) => wijzigStatus(t, v)}>
                      <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="bezig">Bezig</SelectItem>
                        <SelectItem value="afgerond">Afgerond</SelectItem>
                        <SelectItem value="geannuleerd">Geannuleerd</SelectItem>
                      </SelectContent>
                    </Select>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-600"><Trash2 className="w-4 h-4" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Taak verwijderen?</AlertDialogTitle>
                          <AlertDialogDescription>Deze taak wordt definitief verwijderd.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annuleren</AlertDialogCancel>
                          <AlertDialogAction onClick={() => verwijder.mutate({ id: t.id })}>Verwijderen</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
