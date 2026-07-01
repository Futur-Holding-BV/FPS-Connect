import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListWerkgevers,
  useCreateWerkgever,
  useUpdateWerkgever,
  useListCaoOpties,
  useAiInvullenOrganisatie,
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
import { Loader2, Plus, Building2, Pencil, Globe, Phone, Mail, MapPin, Sparkles } from "lucide-react";

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

const VELDLABELS: Partial<Record<keyof WerkgeverInput, string>> = {
  adres: "Adres",
  postcode: "Postcode",
  plaats: "Plaats",
  kvk: "KVK-nummer",
  btw: "BTW-nummer",
  telefoon: "Telefoon",
  email: "E-mailadres",
  website: "Website",
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
  const aiInvullen = useAiInvullenOrganisatie();

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<WerkgeverInput>(LEEG_FORM);
  const [aiBezig, setAiBezig] = useState(false);
  const [aiVoorstel, setAiVoorstel] = useState<Record<string, string | null> | null>(null);

  function startNieuw() {
    setEditId(null);
    setForm(LEEG_FORM);
    setAiVoorstel(null);
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
    setAiVoorstel(null);
    setOpen(true);
  }

  async function aiPrefill() {
    const naam = form.naam.trim();
    if (!naam) {
      toast({ title: "Vul eerst de naam in", description: "De AI heeft een bedrijfsnaam nodig als startpunt.", variant: "destructive" });
      return;
    }
    setAiBezig(true);
    try {
      const result = await aiInvullen.mutateAsync({ data: { bedrijfsnaam: naam, sector: "brandpreventie en bouw" } });
      const velden = (result as { velden: Record<string, string | null> }).velden ?? {};
      const relevante = Object.fromEntries(
        Object.entries(velden).filter(([k, v]) => v && k in VELDLABELS),
      );
      if (Object.keys(relevante).length === 0) {
        toast({ title: "AI heeft geen gegevens gevonden", description: "Probeer een volledigere bedrijfsnaam." });
      } else {
        setAiVoorstel(relevante);
        toast({ title: "AI heeft gegevens gevonden", description: "Controleer de suggesties en klik op Overnemen." });
      }
    } catch {
      toast({ title: "AI niet beschikbaar", variant: "destructive" });
    } finally {
      setAiBezig(false);
    }
  }

  function neemAiOver() {
    if (!aiVoorstel) return;
    setForm((prev) => {
      const nieuw = { ...prev };
      for (const [k, v] of Object.entries(aiVoorstel)) {
        if (v && k in nieuw) {
          (nieuw as Record<string, unknown>)[k] = v;
        }
      }
      return nieuw;
    });
    setAiVoorstel(null);
    toast({ title: "AI-suggesties overgenomen" });
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
              <p className="text-sm mt-1">Klik op "Nieuwe werkmaatschappij" om te beginnen.</p>
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

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setAiVoorstel(null); }}>
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
            {/* Naam + AI-knop naast elkaar */}
            <div className="space-y-1.5">
              <Label>Naam *</Label>
              <div className="flex gap-2">
                <Input
                  className="flex-1"
                  value={form.naam}
                  onChange={(e) => setForm({ ...form, naam: e.target.value })}
                  placeholder="bijv. FPS Brandpreventie B.V."
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5 text-amber-700 border-amber-300 hover:bg-amber-50"
                  disabled={aiBezig || !form.naam.trim()}
                  onClick={() => void aiPrefill()}
                  title="AI vult adres, KVK, BTW, telefoon, e-mail en website automatisch in op basis van de bedrijfsnaam"
                >
                  {aiBezig
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Sparkles className="h-3.5 w-3.5" />}
                  AI invullen
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Vul de naam in en klik op "AI invullen" — het systeem zoekt automatisch adres, KVK, BTW, contactgegevens en website op.
              </p>
            </div>

            {/* AI-suggesties paneel */}
            {aiVoorstel && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-amber-700 font-medium text-sm">
                    <Sparkles className="h-3.5 w-3.5" />
                    AI-suggesties gevonden
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAiVoorstel(null)}>
                      Negeren
                    </Button>
                    <Button size="sm" className="h-7 text-xs" onClick={neemAiOver}>
                      Overnemen
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-xs text-amber-800">
                  {Object.entries(aiVoorstel).map(([k, v]) => (
                    <div key={k} className="bg-amber-100 rounded px-2 py-1">
                      <span className="font-medium">{VELDLABELS[k as keyof WerkgeverInput] ?? k}:</span>{" "}
                      <span className="break-all">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
            <Button onClick={() => void opslaan()} disabled={bezig}>
              {bezig ? <><Loader2 className="h-4 w-4 animate-spin" /> Bezig…</> : "Opslaan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
