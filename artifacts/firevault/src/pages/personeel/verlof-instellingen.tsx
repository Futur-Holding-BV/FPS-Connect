import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListVerlofInstellingen,
  useCreateVerlofInstellingen,
  useUpdateVerlofInstellingen,
  useDeleteVerlofInstellingen,
  useListFeestdagen,
  useCreateFeestdag,
  useUpdateFeestdag,
  useDeleteFeestdag,
  useListWerkgevers,
} from "@workspace/api-client-react";
import type { VerlofInstellingen, Feestdag } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Settings, CalendarDays } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const HUIDIG_JAAR = new Date().getFullYear();

export default function VerlofInstellingenPagina() {
  const qc = useQueryClient();
  const [jaar, setJaar] = useState(HUIDIG_JAAR);
  const [instDialog, setInstDialog] = useState(false);
  const [feestdagDialog, setFeestdagDialog] = useState(false);
  const [bewerkInst, setBewerkInst] = useState<VerlofInstellingen | null>(null);
  const [bewerkFeestdag, setBewerkFeestdag] = useState<Feestdag | null>(null);

  const { data: instellingen = [] } = useListVerlofInstellingen({ jaar });
  const { data: feestdagen = [] } = useListFeestdagen({ jaar });
  const { data: werkgevers = [] } = useListWerkgevers();

  const createInst = useCreateVerlofInstellingen();
  const updateInst = useUpdateVerlofInstellingen();
  const deleteInst = useDeleteVerlofInstellingen();
  const createFd = useCreateFeestdag();
  const updateFd = useUpdateFeestdag();
  const deleteFd = useDeleteFeestdag();

  // ── Instellingen formulier ──
  const [instForm, setInstForm] = useState({
    werkgever_id: "",
    jaar: String(HUIDIG_JAAR),
    max_aaneengesloten: "",
    aanvraag_termijn_dagen: "",
    goedkeuring_automatisch: false,
    auto_goedkeuring_drempel_uren: "",
    notificatie_email: "",
    opmerking: "",
  });

  function openInstDialog(inst?: VerlofInstellingen) {
    if (inst) {
      setBewerkInst(inst);
      setInstForm({
        werkgever_id: inst.werkgever_id != null ? String(inst.werkgever_id) : "",
        jaar: String(inst.jaar),
        max_aaneengesloten: inst.max_aaneengesloten != null ? String(inst.max_aaneengesloten) : "",
        aanvraag_termijn_dagen: inst.aanvraag_termijn_dagen != null ? String(inst.aanvraag_termijn_dagen) : "",
        goedkeuring_automatisch: inst.goedkeuring_automatisch,
        auto_goedkeuring_drempel_uren: inst.auto_goedkeuring_drempel_uren != null ? String(inst.auto_goedkeuring_drempel_uren) : "",
        notificatie_email: inst.notificatie_email ?? "",
        opmerking: inst.opmerking ?? "",
      });
    } else {
      setBewerkInst(null);
      setInstForm({
        werkgever_id: "",
        jaar: String(jaar),
        max_aaneengesloten: "",
        aanvraag_termijn_dagen: "",
        goedkeuring_automatisch: false,
        auto_goedkeuring_drempel_uren: "",
        notificatie_email: "",
        opmerking: "",
      });
    }
    setInstDialog(true);
  }

  async function bewaarInstellingen() {
    const body = {
      werkgever_id: instForm.werkgever_id ? Number(instForm.werkgever_id) : null,
      jaar: Number(instForm.jaar) || HUIDIG_JAAR,
      max_aaneengesloten: instForm.max_aaneengesloten ? Number(instForm.max_aaneengesloten) : null,
      aanvraag_termijn_dagen: instForm.aanvraag_termijn_dagen ? Number(instForm.aanvraag_termijn_dagen) : null,
      goedkeuring_automatisch: instForm.goedkeuring_automatisch,
      auto_goedkeuring_drempel_uren: instForm.auto_goedkeuring_drempel_uren ? Number(instForm.auto_goedkeuring_drempel_uren) : null,
      notificatie_email: instForm.notificatie_email || null,
      opmerking: instForm.opmerking || null,
    };
    try {
      if (bewerkInst) {
        await updateInst.mutateAsync({ id: bewerkInst.id, data: body });
      } else {
        await createInst.mutateAsync({ data: body });
      }
      toast({ title: "Instellingen opgeslagen" });
      setInstDialog(false);
      qc.invalidateQueries({ queryKey: ["listVerlofInstellingen"] });
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  }

  // ── Feestdag formulier ──
  const [fdForm, setFdForm] = useState({ werkgever_id: "", jaar: String(HUIDIG_JAAR), datum: "", naam: "" });

  function openFeestdagDialog(fd?: Feestdag) {
    if (fd) {
      setBewerkFeestdag(fd);
      setFdForm({
        werkgever_id: fd.werkgever_id != null ? String(fd.werkgever_id) : "",
        jaar: String(fd.jaar),
        datum: fd.datum,
        naam: fd.naam,
      });
    } else {
      setBewerkFeestdag(null);
      setFdForm({ werkgever_id: "", jaar: String(jaar), datum: "", naam: "" });
    }
    setFeestdagDialog(true);
  }

  async function bewaarFeestdag() {
    const body = {
      werkgever_id: fdForm.werkgever_id ? Number(fdForm.werkgever_id) : null,
      jaar: Number(fdForm.jaar) || HUIDIG_JAAR,
      datum: fdForm.datum,
      naam: fdForm.naam,
    };
    if (!body.datum || !body.naam) {
      toast({ title: "Datum en naam zijn verplicht", variant: "destructive" });
      return;
    }
    try {
      if (bewerkFeestdag) {
        await updateFd.mutateAsync({ id: bewerkFeestdag.id, data: body });
      } else {
        await createFd.mutateAsync({ data: body });
      }
      toast({ title: "Feestdag opgeslagen" });
      setFeestdagDialog(false);
      qc.invalidateQueries({ queryKey: ["listFeestdagen"] });
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  }

  async function verwijderFeestdag(id: number) {
    if (!confirm("Feestdag verwijderen?")) return;
    try {
      await deleteFd.mutateAsync({ id });
      qc.invalidateQueries({ queryKey: ["listFeestdagen"] });
      toast({ title: "Feestdag verwijderd" });
    } catch {
      toast({ title: "Verwijderen mislukt", variant: "destructive" });
    }
  }

  async function verwijderInstellingen(id: number) {
    if (!confirm("Instellingen verwijderen?")) return;
    try {
      await deleteInst.mutateAsync({ id });
      qc.invalidateQueries({ queryKey: ["listVerlofInstellingen"] });
      toast({ title: "Instellingen verwijderd" });
    } catch {
      toast({ title: "Verwijderen mislukt", variant: "destructive" });
    }
  }

  const JAREN = [HUIDIG_JAAR - 1, HUIDIG_JAAR, HUIDIG_JAAR + 1];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Verlof-instellingen</h1>
          <p className="text-muted-foreground text-sm mt-1">Aanvraagtermijnen, feestdagen en automatische goedkeuring</p>
        </div>
        <Select value={String(jaar)} onValueChange={(v) => setJaar(Number(v))}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {JAREN.map((j) => (
              <SelectItem key={j} value={String(j)}>{j}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="instellingen">
        <TabsList>
          <TabsTrigger value="instellingen">
            <Settings className="h-4 w-4 mr-1.5" />
            Instellingen
          </TabsTrigger>
          <TabsTrigger value="feestdagen">
            <CalendarDays className="h-4 w-4 mr-1.5" />
            Feestdagen
          </TabsTrigger>
        </TabsList>

        <TabsContent value="instellingen" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Verlofbeleid {jaar}</CardTitle>
                <Button size="sm" onClick={() => openInstDialog()}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  Toevoegen
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {instellingen.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  Geen instellingen voor {jaar} — klik op Toevoegen om te beginnen
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Werkgever</TableHead>
                      <TableHead>Max. aaneengesloten</TableHead>
                      <TableHead>Aanvraagtermijn</TableHead>
                      <TableHead>Auto. goedkeuring</TableHead>
                      <TableHead>Notificatie e-mail</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {instellingen.map((inst) => (
                      <TableRow key={inst.id}>
                        <TableCell>
                          {inst.werkgever_id
                            ? (werkgevers.find((w) => w.id === inst.werkgever_id)?.naam ?? `Werkgever ${inst.werkgever_id}`)
                            : <span className="text-muted-foreground italic">Alle werkgevers</span>}
                        </TableCell>
                        <TableCell>{inst.max_aaneengesloten != null ? `${inst.max_aaneengesloten} dagen` : "—"}</TableCell>
                        <TableCell>{inst.aanvraag_termijn_dagen != null ? `${inst.aanvraag_termijn_dagen} dagen` : "—"}</TableCell>
                        <TableCell>
                          {inst.goedkeuring_automatisch
                            ? <span className="text-green-700 text-sm">Ja{inst.auto_goedkeuring_drempel_uren != null ? ` (max ${inst.auto_goedkeuring_drempel_uren}u)` : ""}</span>
                            : <span className="text-muted-foreground text-sm">Nee</span>}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{inst.notificatie_email ?? "—"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openInstDialog(inst)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-600" onClick={() => verwijderInstellingen(inst.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="feestdagen" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Feestdagen {jaar}</CardTitle>
                <Button size="sm" onClick={() => openFeestdagDialog()}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  Toevoegen
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {feestdagen.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  Geen feestdagen voor {jaar} — klik op Toevoegen om te beginnen
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Datum</TableHead>
                      <TableHead>Naam</TableHead>
                      <TableHead>Werkgever</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {feestdagen.map((fd) => (
                      <TableRow key={fd.id}>
                        <TableCell className="tabular-nums">{fd.datum}</TableCell>
                        <TableCell className="font-medium">{fd.naam}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {fd.werkgever_id
                            ? (werkgevers.find((w) => w.id === fd.werkgever_id)?.naam ?? `Werkgever ${fd.werkgever_id}`)
                            : <span className="italic">Nationaal</span>}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openFeestdagDialog(fd)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-600" onClick={() => verwijderFeestdag(fd.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Instellingen dialoog */}
      <Dialog open={instDialog} onOpenChange={setInstDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{bewerkInst ? "Instellingen bewerken" : "Instellingen toevoegen"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Jaar</Label>
                <Input type="number" value={instForm.jaar} onChange={(e) => setInstForm((f) => ({ ...f, jaar: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Werkgever</Label>
                <Select value={instForm.werkgever_id || "alle"} onValueChange={(v) => setInstForm((f) => ({ ...f, werkgever_id: v === "alle" ? "" : v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Alle werkgevers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alle">Alle werkgevers</SelectItem>
                    {werkgevers.map((w) => (
                      <SelectItem key={w.id} value={String(w.id)}>{w.naam}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Max. aaneengesloten (dagen)</Label>
                <Input type="number" placeholder="Geen limiet" value={instForm.max_aaneengesloten} onChange={(e) => setInstForm((f) => ({ ...f, max_aaneengesloten: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Aanvraagtermijn (dagen van tevoren)</Label>
                <Input type="number" placeholder="Geen vereiste" value={instForm.aanvraag_termijn_dagen} onChange={(e) => setInstForm((f) => ({ ...f, aanvraag_termijn_dagen: e.target.value }))} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="auto-goedkeuring"
                checked={instForm.goedkeuring_automatisch}
                onCheckedChange={(v) => setInstForm((f) => ({ ...f, goedkeuring_automatisch: Boolean(v) }))}
              />
              <Label htmlFor="auto-goedkeuring">Automatische goedkeuring</Label>
            </div>
            {instForm.goedkeuring_automatisch && (
              <div className="space-y-1.5">
                <Label>Drempelwaarde automatisch goedkeuren (uren)</Label>
                <Input type="number" placeholder="Bijv. 8" value={instForm.auto_goedkeuring_drempel_uren} onChange={(e) => setInstForm((f) => ({ ...f, auto_goedkeuring_drempel_uren: e.target.value }))} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Notificatie e-mailadres</Label>
              <Input type="email" placeholder="hrm@fps.nl" value={instForm.notificatie_email} onChange={(e) => setInstForm((f) => ({ ...f, notificatie_email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Opmerking</Label>
              <Textarea placeholder="Optionele toelichting" value={instForm.opmerking} onChange={(e) => setInstForm((f) => ({ ...f, opmerking: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInstDialog(false)}>Annuleren</Button>
            <Button onClick={bewaarInstellingen} disabled={createInst.isPending || updateInst.isPending}>Opslaan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Feestdag dialoog */}
      <Dialog open={feestdagDialog} onOpenChange={setFeestdagDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{bewerkFeestdag ? "Feestdag bewerken" : "Feestdag toevoegen"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Datum</Label>
                <DatePicker value={fdForm.datum} onChange={(v) => setFdForm((f) => ({ ...f, datum: v }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Jaar</Label>
                <Input type="number" value={fdForm.jaar} onChange={(e) => setFdForm((f) => ({ ...f, jaar: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Naam</Label>
              <Input placeholder="Bijv. Koningsdag" value={fdForm.naam} onChange={(e) => setFdForm((f) => ({ ...f, naam: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Werkgever (leeg = nationaal)</Label>
              <Select value={fdForm.werkgever_id || "nationaal"} onValueChange={(v) => setFdForm((f) => ({ ...f, werkgever_id: v === "nationaal" ? "" : v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Nationaal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nationaal">Nationaal (alle werkgevers)</SelectItem>
                  {werkgevers.map((w) => (
                    <SelectItem key={w.id} value={String(w.id)}>{w.naam}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFeestdagDialog(false)}>Annuleren</Button>
            <Button onClick={bewaarFeestdag} disabled={createFd.isPending || updateFd.isPending}>Opslaan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
