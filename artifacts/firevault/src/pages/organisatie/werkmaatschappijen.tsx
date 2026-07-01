import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListWerkgevers,
  useCreateWerkgever,
  useUpdateWerkgever,
  useListCaoOpties,
  getListWerkgeversQueryKey,
} from "@workspace/api-client-react";
import type { Werkgever, WerkgeverInput } from "@workspace/api-client-react";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Building2, Pencil, Globe, Phone, Mail, MapPin } from "lucide-react";

const LEEG_FORM: WerkgeverInput = {
  naam: "",
  cao: "",
  personeelsbeleid: null,
  adres: null,
  postcode: null,
  plaats: null,
  kvk: null,
  btw: null,
  telefoon: null,
  email: null,
  website: null,
  voettekst: null,
  actief: true,
};

export default function WerkmaatschappijPagina() {
  const { heeftNiveau } = useBevoegdheid();
  const magSchrijven = heeftNiveau("personeel", 2);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: werkgevers = [], isLoading } = useListWerkgevers();
  const { data: caoOpties = [] } = useListCaoOpties();
  const maakWerkgever = useCreateWerkgever();
  const wijzigWerkgever = useUpdateWerkgever();

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<WerkgeverInput>(LEEG_FORM);

  function startNieuw() {
    setEditId(null);
    setForm(LEEG_FORM);
    setOpen(true);
  }

  function startBewerken(w: Werkgever) {
    setEditId(w.id);
    setForm({
      naam: w.naam,
      cao: w.cao,
      personeelsbeleid: w.personeelsbeleid ?? null,
      adres: w.adres ?? null,
      postcode: w.postcode ?? null,
      plaats: w.plaats ?? null,
      kvk: w.kvk ?? null,
      btw: w.btw ?? null,
      telefoon: w.telefoon ?? null,
      email: w.email ?? null,
      website: w.website ?? null,
      voettekst: w.voettekst ?? null,
      actief: w.actief,
    });
    setOpen(true);
  }

  async function opslaan() {
    if (!form.naam.trim()) {
      toast({ title: "Naam is verplicht", variant: "destructive" });
      return;
    }
    if (!form.cao) {
      toast({ title: "CAO is verplicht", variant: "destructive" });
      return;
    }
    const data: WerkgeverInput = { ...form, naam: form.naam.trim() };
    try {
      if (editId != null) {
        await wijzigWerkgever.mutateAsync({ id: editId, data });
      } else {
        await maakWerkgever.mutateAsync({ data });
      }
      await queryClient.invalidateQueries({ queryKey: getListWerkgeversQueryKey() });
      toast({ title: editId != null ? "Werkmaatschappij bijgewerkt" : "Werkmaatschappij aangemaakt" });
      setOpen(false);
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  }

  const bezig = maakWerkgever.isPending || wijzigWerkgever.isPending;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Koptekst */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Werkmaatschappijen</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Werkmaatschappijen binnen de FPS Groep. Medewerkers, functies, verlofsoorten en
            documenten worden aan een werkmaatschappij gekoppeld.
          </p>
        </div>
        {magSchrijven && (
          <Button onClick={startNieuw} className="shrink-0">
            <Plus className="h-4 w-4" />
            Nieuwe werkmaatschappij
          </Button>
        )}
      </div>

      {/* Lijst */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
          <Loader2 className="h-4 w-4 animate-spin" />
          Laden…
        </div>
      ) : werkgevers.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Building2 className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="font-medium">Nog geen werkmaatschappijen</p>
            {magSchrijven && (
              <p className="text-sm mt-1">
                Klik op "Nieuwe werkmaatschappij" om te beginnen.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {werkgevers.map((w) => (
            <Card key={w.id} className="flex flex-col">
              <CardContent className="p-5 flex flex-col gap-3 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-tight truncate">{w.naam}</p>
                    {w.cao && (
                      <p className="text-xs text-muted-foreground mt-0.5">CAO: {w.cao}</p>
                    )}
                  </div>
                  <Badge
                    variant={w.actief ? "outline" : "secondary"}
                    className={w.actief ? "border-emerald-200 text-emerald-700 shrink-0" : "shrink-0"}
                  >
                    {w.actief ? "actief" : "inactief"}
                  </Badge>
                </div>

                {/* Contactgegevens */}
                {(w.adres || w.plaats || w.telefoon || w.email || w.website) && (
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {(w.adres || w.plaats) && (
                      <p className="flex items-start gap-1.5">
                        <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span className="truncate">
                          {[w.adres, [w.postcode, w.plaats].filter(Boolean).join(" ")]
                            .filter(Boolean).join(", ")}
                        </span>
                      </p>
                    )}
                    {w.telefoon && (
                      <p className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 shrink-0" />
                        {w.telefoon}
                      </p>
                    )}
                    {w.email && (
                      <p className="flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{w.email}</span>
                      </p>
                    )}
                    {w.website && (
                      <p className="flex items-center gap-1.5">
                        <Globe className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{w.website}</span>
                      </p>
                    )}
                  </div>
                )}

                {w.kvk && (
                  <p className="text-xs text-muted-foreground">KVK: {w.kvk}</p>
                )}

                {w.personeelsbeleid && (
                  <p className="text-xs text-muted-foreground line-clamp-3 border-t pt-2">
                    {w.personeelsbeleid}
                  </p>
                )}

                {magSchrijven && (
                  <div className="mt-auto pt-2 flex justify-end border-t">
                    <Button size="sm" variant="outline" onClick={() => startBewerken(w)}>
                      <Pencil className="h-3.5 w-3.5" />
                      Bewerken
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialoog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editId != null ? "Werkmaatschappij bewerken" : "Nieuwe werkmaatschappij"}
            </DialogTitle>
            <DialogDescription>
              Een werkmaatschappij binnen de FPS Groep met eigen CAO en personeelsbeleid.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <Label>Naam *</Label>
              <Input
                value={form.naam}
                onChange={(e) => setForm({ ...form, naam: e.target.value })}
                placeholder="bijv. FPS Brandpreventie B.V."
              />
            </div>

            <div className="space-y-1.5">
              <Label>CAO *</Label>
              <Select
                value={form.cao || undefined}
                onValueChange={(v) => setForm({ ...form, cao: v })}
              >
                <SelectTrigger><SelectValue placeholder="Kies CAO" /></SelectTrigger>
                <SelectContent>
                  {caoOpties.map((c) => (
                    <SelectItem key={c.naam} value={c.naam}>{c.naam}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Personeelsbeleid</Label>
              <Textarea
                rows={3}
                placeholder="Toelichting op arbeidsvoorwaarden, beleid…"
                value={form.personeelsbeleid ?? ""}
                onChange={(e) => setForm({ ...form, personeelsbeleid: e.target.value || null })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label>Adres</Label>
                <Input
                  value={form.adres ?? ""}
                  onChange={(e) => setForm({ ...form, adres: e.target.value || null })}
                  placeholder="Straat + huisnummer"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Postcode</Label>
                <Input
                  value={form.postcode ?? ""}
                  onChange={(e) => setForm({ ...form, postcode: e.target.value || null })}
                  placeholder="1234 AB"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Plaats</Label>
                <Input
                  value={form.plaats ?? ""}
                  onChange={(e) => setForm({ ...form, plaats: e.target.value || null })}
                  placeholder="Enschede"
                />
              </div>
              <div className="space-y-1.5">
                <Label>KVK-nummer</Label>
                <Input
                  value={form.kvk ?? ""}
                  onChange={(e) => setForm({ ...form, kvk: e.target.value || null })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>BTW-nummer</Label>
                <Input
                  value={form.btw ?? ""}
                  onChange={(e) => setForm({ ...form, btw: e.target.value || null })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Telefoon</Label>
                <Input
                  value={form.telefoon ?? ""}
                  onChange={(e) => setForm({ ...form, telefoon: e.target.value || null })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>E-mailadres</Label>
                <Input
                  value={form.email ?? ""}
                  onChange={(e) => setForm({ ...form, email: e.target.value || null })}
                />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Website</Label>
                <Input
                  value={form.website ?? ""}
                  onChange={(e) => setForm({ ...form, website: e.target.value || null })}
                  placeholder="https://"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Voettekst (op documenten)</Label>
              <Textarea
                rows={2}
                value={form.voettekst ?? ""}
                onChange={(e) => setForm({ ...form, voettekst: e.target.value || null })}
                placeholder="bijv. Ingeschreven bij KVK Oost-Nederland…"
              />
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={form.actief ?? true}
                onCheckedChange={(c) => setForm({ ...form, actief: c === true })}
              />
              Actief
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuleren</Button>
            <Button onClick={opslaan} disabled={bezig}>
              {bezig ? <><Loader2 className="h-4 w-4 animate-spin" /> Bezig…</> : "Opslaan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
