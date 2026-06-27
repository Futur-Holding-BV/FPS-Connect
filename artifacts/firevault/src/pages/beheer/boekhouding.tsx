import { useState } from "react";
import {
  useGetAccountviewInstellingen,
  useUpdateAccountviewInstellingen,
  useListRelatieMapping,
  useCreateRelatieMapping,
  useUpdateRelatieMapping,
  useDeleteRelatieMapping,
  useListProjectMapping,
  useCreateProjectMapping,
  useUpdateProjectMapping,
  useDeleteProjectMapping,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Building2, Settings, Wifi, WifiOff, CheckCircle2, AlertTriangle,
  Loader2, Eye, EyeOff, Info, Plus, Pencil, Trash2, Users, FolderOpen,
} from "lucide-react";
import type {
  AccountviewInstellingen,
  AccountviewRelatieMapping,
  AccountviewProjectMapping,
} from "@workspace/api-client-react";

export default function BoekhoudingBeheer() {
  const queryClient = useQueryClient();

  const { data: instellingen, isLoading } = useGetAccountviewInstellingen({
    query: { queryKey: ["accountview-instellingen"] },
  });

  const updateMut = useUpdateAccountviewInstellingen({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["accountview-instellingen"] }) },
  });

  const inst = instellingen as AccountviewInstellingen | undefined;

  const [form, setForm] = useState<Record<string, string | boolean>>({});
  const [apiKeyGetoond, setApiKeyGetoond] = useState(false);
  const [testVerbindingStatus, setTestVerbindingStatus] = useState<"idle" | "bezig" | "ok" | "fout">("idle");
  const [testVerbindingFout, setTestVerbindingFout] = useState<string | null>(null);
  const [opgeslagen, setOpgeslagen] = useState(false);

  function veld(naam: string, fallback: string | boolean | null | undefined = "") {
    if (naam in form) return form[naam];
    return fallback ?? "";
  }

  function setVeld(naam: string, waarde: string | boolean) {
    setForm((f) => ({ ...f, [naam]: waarde }));
  }

  async function opslaan() {
    const payload: Record<string, unknown> = { ...form };
    await updateMut.mutateAsync({ data: payload as Parameters<typeof updateMut.mutateAsync>[0]["data"] });
    setOpgeslagen(true);
    setTimeout(() => setOpgeslagen(false), 3000);
  }

  async function testVerbinding() {
    setTestVerbindingStatus("bezig");
    setTestVerbindingFout(null);
    try {
      const resp = await fetch("/api/instellingen/accountview/test-verbinding", { method: "POST" });
      const data = await resp.json() as { bereikbaar?: boolean; fout?: string };
      if (data.bereikbaar) {
        setTestVerbindingStatus("ok");
      } else {
        setTestVerbindingStatus("fout");
        setTestVerbindingFout(data.fout ?? "Verbinding mislukt");
      }
    } catch (err) {
      setTestVerbindingStatus("fout");
      setTestVerbindingFout(String(err));
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Laden...
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Koptekst */}
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
          <Building2 className="h-6 w-6 text-primary" />
          Boekhouding — AccountView
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configureer de koppeling met AccountView voor het doorsturen van factuurboekingen.
        </p>
      </div>

      <Tabs defaultValue="instellingen">
        <TabsList>
          <TabsTrigger value="instellingen" className="flex items-center gap-1.5">
            <Settings className="h-3.5 w-3.5" />Instellingen
          </TabsTrigger>
          <TabsTrigger value="relaties" className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />Relatie-mapping
          </TabsTrigger>
          <TabsTrigger value="projecten" className="flex items-center gap-1.5">
            <FolderOpen className="h-3.5 w-3.5" />Project-mapping
          </TabsTrigger>
        </TabsList>

        {/* Tab: Instellingen */}
        <TabsContent value="instellingen" className="space-y-6 mt-4">
          {(veld("testmodus", inst?.testmodus) as boolean) && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Testmodus actief</p>
                <p>Exportpogingen worden gelogd maar <strong>niet</strong> naar AccountView verzonden.</p>
              </div>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="h-4 w-4" />
                API-verbinding
              </CardTitle>
              <CardDescription>Toegangsgegevens voor de AccountView web-API</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label>API-endpoint</Label>
                  <Input
                    className="mt-1 font-mono text-sm"
                    placeholder="https://server.accountview.net/api"
                    value={veld("api_endpoint", inst?.api_endpoint) as string}
                    onChange={(e) => setVeld("api_endpoint", e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Het basis-URL van de AccountView web-API installatie</p>
                </div>
                <div>
                  <Label>Administratiecode</Label>
                  <Input
                    className="mt-1"
                    placeholder="MIJN"
                    value={veld("administratiecode", inst?.administratiecode) as string}
                    onChange={(e) => setVeld("administratiecode", e.target.value)}
                  />
                </div>
                <div>
                  <Label>API-gebruiker</Label>
                  <Input
                    className="mt-1"
                    placeholder="api_user"
                    value={veld("api_gebruiker", inst?.api_gebruiker) as string}
                    onChange={(e) => setVeld("api_gebruiker", e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <Label>API-sleutel / secret</Label>
                  <div className="relative mt-1">
                    <Input
                      className="font-mono pr-10"
                      type={apiKeyGetoond ? "text" : "password"}
                      placeholder={inst?.api_gebruiker ? "••••••••••• (ingevuld)" : "Voer API-sleutel in"}
                      value={veld("api_key", "") as string}
                      onChange={(e) => setVeld("api_key", e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setApiKeyGetoond(!apiKeyGetoond)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {apiKeyGetoond ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {inst?.api_gebruiker ? "API-sleutel is ingesteld. Vul alleen in om te wijzigen." : "Nog niet ingesteld"}
                  </p>
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Testmodus</p>
                  <p className="text-xs text-muted-foreground">In testmodus worden geen boekingen naar AccountView verzonden</p>
                </div>
                <Switch
                  checked={veld("testmodus", inst?.testmodus) as boolean}
                  onCheckedChange={(v) => setVeld("testmodus", v)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Export actief</p>
                  <p className="text-xs text-muted-foreground">Sta toe dat geaccordeerde facturen naar AccountView worden gezonden</p>
                </div>
                <Switch
                  checked={veld("export_actief", inst?.export_actief) as boolean}
                  onCheckedChange={(v) => setVeld("export_actief", v)}
                />
              </div>

              <div className="flex items-center gap-3 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={testVerbinding}
                  disabled={testVerbindingStatus === "bezig"}
                >
                  {testVerbindingStatus === "bezig"
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Verbinden...</>
                    : <><Wifi className="h-3.5 w-3.5 mr-1.5" />Test verbinding</>}
                </Button>
                {testVerbindingStatus === "ok" && (
                  <span className="flex items-center gap-1 text-sm text-green-600">
                    <CheckCircle2 className="h-4 w-4" /> Verbinding geslaagd
                  </span>
                )}
                {testVerbindingStatus === "fout" && (
                  <span className="flex items-center gap-1 text-sm text-red-600">
                    <WifiOff className="h-4 w-4" /> {testVerbindingFout}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dagboeken & grootboek</CardTitle>
              <CardDescription>Standaard dagboek- en grootboekrekening voor nieuwe boekingen</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Dagboek inkoop</Label>
                  <Input
                    className="mt-1"
                    placeholder="INK"
                    value={veld("dagboek_inkoop", inst?.dagboek_inkoop) as string}
                    onChange={(e) => setVeld("dagboek_inkoop", e.target.value)}
                  />
                </div>
                <div>
                  <Label>Dagboek verkoop</Label>
                  <Input
                    className="mt-1"
                    placeholder="VRK"
                    value={veld("dagboek_verkoop", inst?.dagboek_verkoop) as string}
                    onChange={(e) => setVeld("dagboek_verkoop", e.target.value)}
                  />
                </div>
                <div>
                  <Label>Standaard grootboekrekening</Label>
                  <Input
                    className="mt-1"
                    placeholder="4000"
                    value={veld("grootboek_standaard", inst?.grootboek_standaard) as string}
                    onChange={(e) => setVeld("grootboek_standaard", e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">BTW-codes & kostenplaatsen</CardTitle>
              <CardDescription>Mapping van Connect-codes naar AccountView-codes (JSON)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800 flex items-start gap-2">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                Voer de mapping in als JSON-object. Voorbeeld BTW-codes: {`{ "21": "H", "9": "L", "0": "V" }`}
              </div>
              <div>
                <Label>BTW-codes mapping</Label>
                <textarea
                  className="mt-1 w-full min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                  placeholder='{ "21": "H21", "9": "L9", "0": "V0" }'
                  value={veld("btw_codes", JSON.stringify(inst?.btw_codes ?? {}, null, 2)) as string}
                  onChange={(e) => setVeld("btw_codes", e.target.value)}
                />
              </div>
              <div>
                <Label>Kostenplaatsen/projectcodes mapping</Label>
                <textarea
                  className="mt-1 w-full min-h-16 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                  placeholder='{ "brand": "BP001", "onderhoud": "OH001" }'
                  value={veld("kostenplaatsen", JSON.stringify(inst?.kostenplaatsen ?? {}, null, 2)) as string}
                  onChange={(e) => setVeld("kostenplaatsen", e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center gap-3 pb-4">
            <Button onClick={opslaan} disabled={updateMut.isPending}>
              {updateMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Instellingen opslaan
            </Button>
            {opgeslagen && (
              <span className="flex items-center gap-1 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4" /> Opgeslagen
              </span>
            )}
          </div>
        </TabsContent>

        {/* Tab: Relatie-mapping */}
        <TabsContent value="relaties" className="mt-4">
          <RelateMappingTab />
        </TabsContent>

        {/* Tab: Project-mapping */}
        <TabsContent value="projecten" className="mt-4">
          <ProjectMappingTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RelateMappingTab() {
  const queryClient = useQueryClient();
  const { data: items = [], isLoading } = useListRelatieMapping({
    query: { queryKey: ["relatie-mapping"] },
  });
  const createMut = useCreateRelatieMapping({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["relatie-mapping"] }) },
  });
  const updateMut = useUpdateRelatieMapping({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["relatie-mapping"] }) },
  });
  const deleteMut = useDeleteRelatieMapping({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["relatie-mapping"] }) },
  });

  const [open, setOpen] = useState(false);
  const [bewerkId, setBewerkId] = useState<number | null>(null);
  const [form, setForm] = useState({ connect_relatienaam: "", accountview_code: "", type: "crediteur" as "crediteur" | "debiteur", opmerking: "" });

  function nieuw() {
    setBewerkId(null);
    setForm({ connect_relatienaam: "", accountview_code: "", type: "crediteur", opmerking: "" });
    setOpen(true);
  }

  function bewerk(item: AccountviewRelatieMapping) {
    setBewerkId(item.id);
    setForm({
      connect_relatienaam: item.connect_relatienaam,
      accountview_code: item.accountview_code,
      type: item.type as "crediteur" | "debiteur",
      opmerking: item.opmerking ?? "",
    });
    setOpen(true);
  }

  async function opslaan() {
    const data = { ...form, opmerking: form.opmerking || null };
    if (bewerkId) {
      await updateMut.mutateAsync({ id: bewerkId, data });
    } else {
      await createMut.mutateAsync({ data });
    }
    setOpen(false);
  }

  const lijst = items as AccountviewRelatieMapping[];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Relatie-mapping</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Koppel Connect-relatienamen aan AccountView crediteur- of debiteurnummers.
          </p>
        </div>
        <Button size="sm" onClick={nieuw}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />Toevoegen
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-6">
          <Loader2 className="h-4 w-4 animate-spin" /> Laden...
        </div>
      ) : lijst.length === 0 ? (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          Nog geen relatie-mappings. Klik op &ldquo;Toevoegen&rdquo; om te beginnen.
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-slate-600">Connect-naam</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-600">AccountView code</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-600">Type</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-600">Notitie</th>
                <th className="px-4 py-2.5 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {lijst.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-medium">{item.connect_relatienaam}</td>
                  <td className="px-4 py-3 font-mono text-xs bg-slate-50">{item.accountview_code}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${item.type === "crediteur" ? "bg-slate-100 text-slate-600" : "bg-blue-50 text-blue-600"}`}>
                      {item.type === "crediteur" ? "Crediteur" : "Debiteur"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{item.opmerking ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => bewerk(item)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        disabled={deleteMut.isPending}
                        onClick={() => deleteMut.mutate({ id: item.id })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{bewerkId ? "Relatie-mapping bewerken" : "Relatie-mapping toevoegen"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Connect-naam (relatienaam)</Label>
              <Input className="mt-1" placeholder="Bijv. Leverancier BV" value={form.connect_relatienaam} onChange={(e) => setForm((f) => ({ ...f, connect_relatienaam: e.target.value }))} />
            </div>
            <div>
              <Label>AccountView code</Label>
              <Input className="mt-1 font-mono" placeholder="LEV001" value={form.accountview_code} onChange={(e) => setForm((f) => ({ ...f, accountview_code: e.target.value }))} />
            </div>
            <div>
              <Label>Type</Label>
              <select
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as "crediteur" | "debiteur" }))}
              >
                <option value="crediteur">Crediteur (inkoopfactuur)</option>
                <option value="debiteur">Debiteur (verkoopfactuur)</option>
              </select>
            </div>
            <div>
              <Label>Opmerking (optioneel)</Label>
              <Input className="mt-1" placeholder="Interne toelichting" value={form.opmerking} onChange={(e) => setForm((f) => ({ ...f, opmerking: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuleren</Button>
            <Button
              disabled={!form.connect_relatienaam.trim() || !form.accountview_code.trim() || createMut.isPending || updateMut.isPending}
              onClick={opslaan}
            >
              {createMut.isPending || updateMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Opslaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProjectMappingTab() {
  const queryClient = useQueryClient();
  const { data: items = [], isLoading } = useListProjectMapping({
    query: { queryKey: ["project-mapping"] },
  });
  const createMut = useCreateProjectMapping({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project-mapping"] }) },
  });
  const updateMut = useUpdateProjectMapping({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project-mapping"] }) },
  });
  const deleteMut = useDeleteProjectMapping({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project-mapping"] }) },
  });

  const [open, setOpen] = useState(false);
  const [bewerkId, setBewerkId] = useState<number | null>(null);
  const [form, setForm] = useState({ connect_project_code: "", accountview_projectcode: "", opmerking: "" });

  function nieuw() {
    setBewerkId(null);
    setForm({ connect_project_code: "", accountview_projectcode: "", opmerking: "" });
    setOpen(true);
  }

  function bewerk(item: AccountviewProjectMapping) {
    setBewerkId(item.id);
    setForm({
      connect_project_code: item.connect_project_code,
      accountview_projectcode: item.accountview_projectcode ?? "",
      opmerking: item.opmerking ?? "",
    });
    setOpen(true);
  }

  async function opslaan() {
    const data = { ...form, opmerking: form.opmerking || null, accountview_projectcode: form.accountview_projectcode || null };
    if (bewerkId) {
      await updateMut.mutateAsync({ id: bewerkId, data });
    } else {
      await createMut.mutateAsync({ data });
    }
    setOpen(false);
  }

  const lijst = items as AccountviewProjectMapping[];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Project-mapping</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Koppel Connect-projectcodes aan AccountView-projectcodes voor correcte kostenplaatsstoewijzing.
          </p>
        </div>
        <Button size="sm" onClick={nieuw}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />Toevoegen
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-6">
          <Loader2 className="h-4 w-4 animate-spin" /> Laden...
        </div>
      ) : lijst.length === 0 ? (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          Nog geen project-mappings. Klik op &ldquo;Toevoegen&rdquo; om te beginnen.
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-slate-600">Connect-projectcode</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-600">AccountView-projectcode</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-600">Omschrijving</th>
                <th className="px-4 py-2.5 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {lijst.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-mono font-medium">{item.connect_project_code}</td>
                  <td className="px-4 py-3 font-mono text-xs">{item.accountview_projectcode ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground text-sm">{item.opmerking ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => bewerk(item)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        disabled={deleteMut.isPending}
                        onClick={() => deleteMut.mutate({ id: item.id })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{bewerkId ? "Project-mapping bewerken" : "Project-mapping toevoegen"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Connect-projectcode</Label>
              <Input className="mt-1 font-mono" placeholder="BP-2024-001" value={form.connect_project_code} onChange={(e) => setForm((f) => ({ ...f, connect_project_code: e.target.value }))} />
            </div>
            <div>
              <Label>AccountView-projectcode</Label>
              <Input className="mt-1 font-mono" placeholder="AV-BP001" value={form.accountview_projectcode} onChange={(e) => setForm((f) => ({ ...f, accountview_projectcode: e.target.value }))} />
            
            </div>
            <div>
              <Label>Opmerking (optioneel)</Label>
              <Input className="mt-1" placeholder="Interne toelichting" value={form.opmerking} onChange={(e) => setForm((f) => ({ ...f, opmerking: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuleren</Button>
            <Button
              disabled={!form.connect_project_code.trim() || createMut.isPending || updateMut.isPending}
              onClick={opslaan}
            >
              {createMut.isPending || updateMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Opslaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
