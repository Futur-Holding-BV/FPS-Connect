import { useState } from "react";
import { useListWerkgevers, useUpdateWerkgever, useAiInvullenOrganisatie } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Building2, Sparkles, Save, Pencil, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

function VeldRij({ label, waarde }: { label: string; waarde: string | null | undefined }) {
  return (
    <div className="flex justify-between items-start py-2 border-b last:border-0">
      <span className="text-sm text-muted-foreground w-40 shrink-0">{label}</span>
      <span className="text-sm font-medium text-right">{waarde || <span className="text-muted-foreground italic">Niet ingevuld</span>}</span>
    </div>
  );
}

export default function BedrijfsgegevensPagina() {
  const { data: werkgevers = [], isLoading } = useListWerkgevers();
  const [actieveTab, setActieveTab] = useState<string | null>(null);
  const [bewerken, setBewerken] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [aiBezig, setAiBezig] = useState(false);
  const [aiVoorstellen, setAiVoorstellen] = useState<Record<number, Record<string, string | null>>>({});
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateWerkgever = useUpdateWerkgever();
  const aiInvullen = useAiInvullenOrganisatie();

  const huidigId = actieveTab ? parseInt(actieveTab, 10) : werkgevers[0]?.id ?? null;
  const werkgever = werkgevers.find((w) => w.id === huidigId) ?? werkgevers[0] ?? null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!werkgever) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bedrijfsgegevens</h1>
          <p className="text-muted-foreground mt-1">KVK-gegevens, IBAN, contactinformatie en stamgegevens per werkmaatschappij.</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <div className="p-4 rounded-full bg-muted">
              <Building2 className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">Nog geen werkmaatschappij aangemaakt. Ga naar Personeel &gt; Werkgevers.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const startBewerken = (id: number, wg: typeof werkgever) => {
    setBewerken(id);
    setForm({
      naam: wg.naam ?? "",
      kvk: wg.kvk ?? "",
      btw: wg.btw ?? "",
      adres: wg.adres ?? "",
      postcode: wg.postcode ?? "",
      plaats: wg.plaats ?? "",
      telefoon: wg.telefoon ?? "",
      email: wg.email ?? "",
      website: wg.website ?? "",
      boekhouder_naam: wg.boekhouder_naam ?? "",
      boekhouder_email: wg.boekhouder_email ?? "",
      intern_contact_naam: wg.intern_contact_naam ?? "",
      intern_contact_email: wg.intern_contact_email ?? "",
    });
  };

  const annuleer = () => {
    setBewerken(null);
    setForm({});
  };

  const slaOp = async () => {
    if (!bewerken) return;
    try {
      await updateWerkgever.mutateAsync({
        id: bewerken,
        data: {
          naam: form.naam,
          kvk: form.kvk || undefined,
          btw: form.btw || undefined,
          adres: form.adres || undefined,
          postcode: form.postcode || undefined,
          plaats: form.plaats || undefined,
          telefoon: form.telefoon || undefined,
          email: form.email || undefined,
          website: form.website || undefined,
          boekhouder_naam: form.boekhouder_naam || undefined,
          boekhouder_email: form.boekhouder_email || undefined,
          intern_contact_naam: form.intern_contact_naam || undefined,
          intern_contact_email: form.intern_contact_email || undefined,
        } as Parameters<typeof updateWerkgever.mutateAsync>[0]["data"],
      });
      queryClient.invalidateQueries({ queryKey: ["listWerkgevers"] });
      setBewerken(null);
      setForm({});
      toast({ title: "Bedrijfsgegevens opgeslagen" });
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  };

  const aiPrefill = async (id: number, naam: string) => {
    setAiBezig(true);
    try {
      const result = await aiInvullen.mutateAsync({ data: { bedrijfsnaam: naam, sector: "brandpreventie en bouw" } });
      const velden = (result as { velden: Record<string, string | null> }).velden ?? {};
      setAiVoorstellen((prev) => ({ ...prev, [id]: velden }));
      toast({ title: "AI heeft velden voorgesteld", description: "Controleer de suggesties en klik op Overnemen om ze in het formulier te zetten." });
    } catch {
      toast({ title: "AI niet beschikbaar", variant: "destructive" });
    } finally {
      setAiBezig(false);
    }
  };

  const neemAiOver = (id: number) => {
    const v = aiVoorstellen[id] ?? {};
    setForm((prev) => {
      const nieuw = { ...prev };
      for (const [k, val] of Object.entries(v)) {
        if (val && k in nieuw) nieuw[k] = val;
      }
      return nieuw;
    });
    setAiVoorstellen((prev) => {
      const kopie = { ...prev };
      delete kopie[id];
      return kopie;
    });
    toast({ title: "AI-suggesties overgenomen in formulier" });
  };

  const renderFormulier = (wg: typeof werkgever) => {
    const id = wg.id;
    const ai = aiVoorstellen[id];
    return (
      <div className="space-y-6">
        {ai && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-700 font-medium text-sm">
                <Sparkles className="h-4 w-4" />
                AI-suggesties beschikbaar
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setAiVoorstellen((p) => { const k = { ...p }; delete k[id]; return k; })}>
                  Negeren
                </Button>
                <Button size="sm" onClick={() => neemAiOver(id)}>
                  Overnemen in formulier
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs text-amber-800">
              {Object.entries(ai).filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="bg-amber-100 rounded px-2 py-1">
                  <span className="font-medium">{k}:</span> {v}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          {bewerken === id ? (
            <>
              <Button variant="outline" size="sm" onClick={annuleer}>
                <X className="h-4 w-4 mr-1" />
                Annuleren
              </Button>
              <Button
                size="sm"
                disabled={!aiBezig && false}
                onClick={() => aiPrefill(id, form.naam || wg.naam)}
                variant="outline"
              >
                {aiBezig ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
                AI invullen
              </Button>
              <Button size="sm" onClick={slaOp} disabled={updateWerkgever.isPending}>
                {updateWerkgever.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                Opslaan
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => startBewerken(id, wg)}>
              <Pencil className="h-4 w-4 mr-1" />
              Bewerken
            </Button>
          )}
        </div>

        {bewerken === id ? (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold mb-3">Algemene gegevens</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Bedrijfsnaam</Label>
                  <Input value={form.naam ?? ""} onChange={(e) => setForm((p) => ({ ...p, naam: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>KVK-nummer</Label>
                  <Input value={form.kvk ?? ""} onChange={(e) => setForm((p) => ({ ...p, kvk: e.target.value }))} placeholder="12345678" />
                </div>
                <div className="space-y-1.5">
                  <Label>BTW-nummer</Label>
                  <Input value={form.btw ?? ""} onChange={(e) => setForm((p) => ({ ...p, btw: e.target.value }))} placeholder="NL999999999B01" />
                </div>
              </div>
            </div>
            <Separator />
            <div>
              <h3 className="text-sm font-semibold mb-3">Adresgegevens</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5 md:col-span-2">
                  <Label>Straat en huisnummer</Label>
                  <Input value={form.adres ?? ""} onChange={(e) => setForm((p) => ({ ...p, adres: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Postcode</Label>
                  <Input value={form.postcode ?? ""} onChange={(e) => setForm((p) => ({ ...p, postcode: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Plaats</Label>
                  <Input value={form.plaats ?? ""} onChange={(e) => setForm((p) => ({ ...p, plaats: e.target.value }))} />
                </div>
              </div>
            </div>
            <Separator />
            <div>
              <h3 className="text-sm font-semibold mb-3">Contactgegevens</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Telefoonnummer</Label>
                  <Input value={form.telefoon ?? ""} onChange={(e) => setForm((p) => ({ ...p, telefoon: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>E-mailadres</Label>
                  <Input value={form.email ?? ""} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} type="email" />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label>Website</Label>
                  <Input value={form.website ?? ""} onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))} placeholder="https://..." />
                </div>
              </div>
            </div>
            <Separator />
            <div>
              <h3 className="text-sm font-semibold mb-3">Boekhouder</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Naam boekhouder / accountant</Label>
                  <Input value={form.boekhouder_naam ?? ""} onChange={(e) => setForm((p) => ({ ...p, boekhouder_naam: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>E-mail boekhouder</Label>
                  <Input value={form.boekhouder_email ?? ""} onChange={(e) => setForm((p) => ({ ...p, boekhouder_email: e.target.value }))} type="email" />
                </div>
              </div>
            </div>
            <Separator />
            <div>
              <h3 className="text-sm font-semibold mb-3">Intern aanspreekpunt</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Naam contactpersoon</Label>
                  <Input value={form.intern_contact_naam ?? ""} onChange={(e) => setForm((p) => ({ ...p, intern_contact_naam: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>E-mail contactpersoon</Label>
                  <Input value={form.intern_contact_email ?? ""} onChange={(e) => setForm((p) => ({ ...p, intern_contact_email: e.target.value }))} type="email" />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold mb-3">Algemene gegevens</h3>
              <div className="space-y-0">
                <VeldRij label="Bedrijfsnaam" waarde={wg.naam} />
                <VeldRij label="KVK-nummer" waarde={wg.kvk} />
                <VeldRij label="BTW-nummer" waarde={wg.btw} />
                <VeldRij label="CAO" waarde={wg.cao} />
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-3">Adres</h3>
              <div className="space-y-0">
                <VeldRij label="Straat" waarde={wg.adres} />
                <VeldRij label="Postcode" waarde={wg.postcode} />
                <VeldRij label="Plaats" waarde={wg.plaats} />
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-3">Contact</h3>
              <div className="space-y-0">
                <VeldRij label="Telefoon" waarde={wg.telefoon} />
                <VeldRij label="E-mail" waarde={wg.email} />
                <VeldRij label="Website" waarde={wg.website} />
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-3">Boekhouder</h3>
              <div className="space-y-0">
                <VeldRij label="Naam" waarde={wg.boekhouder_naam} />
                <VeldRij label="E-mail" waarde={wg.boekhouder_email} />
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-3">Intern aanspreekpunt</h3>
              <div className="space-y-0">
                <VeldRij label="Naam" waarde={wg.intern_contact_naam} />
                <VeldRij label="E-mail" waarde={wg.intern_contact_email} />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Bedrijfsgegevens</h1>
        <p className="text-muted-foreground mt-1">
          KVK-gegevens, IBAN, contactinformatie en stamgegevens per werkmaatschappij.
        </p>
      </div>

      {werkgevers.length > 1 ? (
        <Tabs
          value={actieveTab ?? String(werkgevers[0]?.id)}
          onValueChange={setActieveTab}
        >
          <TabsList>
            {werkgevers.map((wg) => (
              <TabsTrigger key={wg.id} value={String(wg.id)}>
                {wg.naam}
              </TabsTrigger>
            ))}
          </TabsList>
          {werkgevers.map((wg) => (
            <TabsContent key={wg.id} value={String(wg.id)}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    {wg.naam}
                    <Badge variant={wg.actief ? "default" : "secondary"} className="ml-2">
                      {wg.actief ? "Actief" : "Inactief"}
                    </Badge>
                  </CardTitle>
                  <CardDescription>Stamgegevens en contactinformatie</CardDescription>
                </CardHeader>
                <CardContent>{renderFormulier(wg)}</CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {werkgever.naam}
              <Badge variant={werkgever.actief ? "default" : "secondary"} className="ml-2">
                {werkgever.actief ? "Actief" : "Inactief"}
              </Badge>
            </CardTitle>
            <CardDescription>Stamgegevens en contactinformatie</CardDescription>
          </CardHeader>
          <CardContent>{renderFormulier(werkgever)}</CardContent>
        </Card>
      )}
    </div>
  );
}
