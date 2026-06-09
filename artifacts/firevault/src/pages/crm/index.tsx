import { useState } from "react";
import { Link } from "wouter";
import {
  useListCrmKlanten,
  useCreateCrmKlant,
  getListCrmKlantenQueryKey,
} from "@workspace/api-client-react";
import type { CrmKlantInput } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Building2, Plus, Search, Phone, Mail, MapPin, ChevronRight } from "lucide-react";

const STATUSSEN = ["prospect", "actief", "inactief"] as const;

const STATUS_KLEUR: Record<string, string> = {
  prospect: "bg-amber-100 text-amber-800 border-amber-200",
  actief: "bg-emerald-100 text-emerald-800 border-emerald-200",
  inactief: "bg-muted text-muted-foreground border-border",
};

const LEEG: CrmKlantInput = {
  naam: "",
  kvk: "",
  adres: "",
  postcode: "",
  stad: "",
  telefoon: "",
  email: "",
  website: "",
  branche: "",
  status: "prospect",
  opmerkingen: "",
};

export default function CrmKlanten() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: klanten, isLoading } = useListCrmKlanten();
  const maakKlant = useCreateCrmKlant();

  const [zoek, setZoek] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CrmKlantInput>(LEEG);

  const gefilterd = (klanten ?? []).filter((k) => {
    const t = zoek.trim().toLowerCase();
    if (!t) return true;
    return (
      k.naam.toLowerCase().includes(t) ||
      (k.stad ?? "").toLowerCase().includes(t) ||
      (k.branche ?? "").toLowerCase().includes(t)
    );
  });

  async function opslaan() {
    if (!form.naam.trim()) {
      toast({ title: "Naam is verplicht", variant: "destructive" });
      return;
    }
    try {
      const schoon: CrmKlantInput = { naam: form.naam.trim(), status: form.status };
      (Object.keys(form) as (keyof CrmKlantInput)[]).forEach((key) => {
        const waarde = form[key];
        if (key === "naam" || key === "status") return;
        if (typeof waarde === "string" && waarde.trim()) {
          schoon[key] = waarde.trim();
        }
      });
      await maakKlant.mutateAsync({ data: schoon });
      await queryClient.invalidateQueries({ queryKey: getListCrmKlantenQueryKey() });
      toast({ title: "Klant toegevoegd" });
      setForm(LEEG);
      setOpen(false);
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">CRM — Klanten</h1>
          <p className="text-sm text-muted-foreground">
            Beheer klanten, contactpersonen, opdrachten en commerciële opvolging.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Nieuwe klant
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Zoek op naam, stad of branche…"
          value={zoek}
          onChange={(e) => setZoek(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : gefilterd.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Building2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>Geen klanten gevonden.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {gefilterd.map((k) => (
            <Link key={k.id} href={`/crm/${k.id}`}>
              <Card className="cursor-pointer transition-colors hover:border-primary/50 h-full">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="bg-primary/10 text-primary rounded p-2 flex-shrink-0">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{k.naam}</div>
                        {k.branche && (
                          <div className="text-xs text-muted-foreground truncate">{k.branche}</div>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  </div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {(k.stad || k.adres) && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3 w-3" />
                        <span className="truncate">{[k.adres, k.stad].filter(Boolean).join(", ")}</span>
                      </div>
                    )}
                    {k.telefoon && (
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3 w-3" /> <span className="truncate">{k.telefoon}</span>
                      </div>
                    )}
                    {k.email && (
                      <div className="flex items-center gap-1.5">
                        <Mail className="h-3 w-3" /> <span className="truncate">{k.email}</span>
                      </div>
                    )}
                  </div>
                  <Badge variant="outline" className={STATUS_KLEUR[k.status] ?? ""}>
                    {k.status}
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nieuwe klant</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Naam *</Label>
              <Input value={form.naam} onChange={(e) => setForm({ ...form, naam: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>KvK</Label>
              <Input value={form.kvk ?? ""} onChange={(e) => setForm({ ...form, kvk: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Branche</Label>
              <Input value={form.branche ?? ""} onChange={(e) => setForm({ ...form, branche: e.target.value })} />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Adres</Label>
              <Input value={form.adres ?? ""} onChange={(e) => setForm({ ...form, adres: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Postcode</Label>
              <Input value={form.postcode ?? ""} onChange={(e) => setForm({ ...form, postcode: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Stad</Label>
              <Input value={form.stad ?? ""} onChange={(e) => setForm({ ...form, stad: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Telefoon</Label>
              <Input value={form.telefoon ?? ""} onChange={(e) => setForm({ ...form, telefoon: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Website</Label>
              <Input value={form.website ?? ""} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSSEN.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Opmerkingen</Label>
              <Textarea
                value={form.opmerkingen ?? ""}
                onChange={(e) => setForm({ ...form, opmerkingen: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuleren</Button>
            <Button onClick={opslaan} disabled={maakKlant.isPending}>
              {maakKlant.isPending ? "Bezig…" : "Opslaan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
