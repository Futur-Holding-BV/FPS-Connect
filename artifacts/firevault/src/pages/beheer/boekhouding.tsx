import { useState } from "react";
import {
  useGetAccountviewInstellingen,
  useUpdateAccountviewInstellingen,
  useListWerkgevers,
  useListRelatieMapping,
  useCreateRelatieMapping,
  useUpdateRelatieMapping,
  useDeleteRelatieMapping,
  useListProjectMapping,
  useCreateProjectMapping,
  useUpdateProjectMapping,
  useDeleteProjectMapping,
  useListGrootboekrekeningen,
  useSyncGrootboekAccountview,
  useImportGrootboekrekeningen,
  useGetGrootboekGebruik,
} from "@workspace/api-client-react";
import { GrootboekSelect } from "@/components/grootboek-select";
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
  Loader2, Eye, EyeOff, Info, Plus, Pencil, Trash2, Users, FolderOpen, Hash,
} from "lucide-react";
import { useEffect } from "react";
import type {
  AccountviewInstellingen,
  AccountviewRelatieMapping,
  AccountviewProjectMapping,
} from "@workspace/api-client-react";
import { PaginaHulp } from "@/components/pagina-hulp";

export default function BoekhoudingBeheer() {
  const queryClient = useQueryClient();

  const { data: instellingen, isLoading } = useGetAccountviewInstellingen({
    query: { queryKey: ["accountview-instellingen"] },
  });
  const { data: werkgevers } = useListWerkgevers();

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
    // werkgever_id gaat als number of null (leeg = bewust ontkoppeld → boeken geblokkeerd)
    if ("werkgever_id" in payload) {
      payload["werkgever_id"] = payload["werkgever_id"] === "" ? null : Number(payload["werkgever_id"]);
    }
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
      <PaginaHulp pagina="boekhouding" />
      {/* Koptekst */}
      <div>
        <h1 data-paginatitel className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
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
          <TabsTrigger value="rekeningschema" className="flex items-center gap-1.5">
            <Hash className="h-3.5 w-3.5" />Rekeningschema
          </TabsTrigger>
          <TabsTrigger value="factuurnummers" className="flex items-center gap-1.5">
            <Hash className="h-3.5 w-3.5" />Factuurnummers
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
                  <Label>Werkmaatschappij van deze administratie</Label>
                  <select
                    data-testid="select-accountview-werkgever"
                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                    value={String(veld("werkgever_id", inst?.werkgever_id == null ? "" : String(inst.werkgever_id)))}
                    onChange={(e) => setVeld("werkgever_id", e.target.value)}
                  >
                    <option value="">— Niet ingesteld (boeken geblokkeerd) —</option>
                    {(werkgevers ?? []).map((w) => (
                      <option key={w.id} value={String(w.id)}>{w.naam}</option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Voor welke BV deze administratie boekt. Zolang dit leeg is, of een factuur bij een
                    andere BV hoort, wordt boeken naar AccountView geweigerd.
                  </p>
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
                  <GrootboekSelect
                    className="mt-1"
                    value={veld("grootboek_standaard", inst?.grootboek_standaard) as string}
                    onChange={(v) => setVeld("grootboek_standaard", v ?? "")}
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

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Magazijn</CardTitle>
              <CardDescription>Grootboekrekeningen en exportinstellingen voor voorraadmutaties</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Grootboekrekening voorraad</Label>
                  <GrootboekSelect
                    className="mt-1"
                    value={veld("grootboek_voorraad", inst?.grootboek_voorraad) as string}
                    onChange={(v) => setVeld("grootboek_voorraad", v ?? "")}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Debet-rekening bij inkoop (bijv. 3000)</p>
                </div>
                <div>
                  <Label>Grootboekrekening inkoopkosten</Label>
                  <GrootboekSelect
                    className="mt-1"
                    value={veld("grootboek_inkoop_kosten", inst?.grootboek_inkoop_kosten) as string}
                    onChange={(v) => setVeld("grootboek_inkoop_kosten", v ?? "")}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Credit-rekening bij inkoop (bijv. 7000)</p>
                </div>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Magazijnmutaties automatisch exporteren</p>
                  <p className="text-xs text-muted-foreground">Sta toe dat magazijnmutaties handmatig of via batch naar AccountView worden gezonden</p>
                </div>
                <Switch
                  checked={veld("magazijn_export_actief", inst?.magazijn_export_actief) as boolean}
                  onCheckedChange={(v) => setVeld("magazijn_export_actief", v)}
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

        {/* Tab: Rekeningschema */}
        <TabsContent value="rekeningschema" className="mt-4">
          <RekeningschemaTab werkgeverId={inst?.werkgever_id ?? null} />
        </TabsContent>

        {/* Tab: Relatie-mapping */}
        <TabsContent value="relaties" className="mt-4">
          <RelateMappingTab />
        </TabsContent>

        {/* Tab: Project-mapping */}
        <TabsContent value="projecten" className="mt-4">
          <ProjectMappingTab />
        </TabsContent>

        {/* Tab: Factuurnummer-tellers */}
        <TabsContent value="factuurnummers" className="mt-4">
          <FactuurnummerTellersTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Tab: Rekeningschema (ADMINISTRATIE_01) ────────────────────────────────────
// Rekeningschema per werkmaatschappij: ophalen uit AccountView (meting: de
// pagina meldt exact of de koppeling dat toestaat) of een lijst inlezen.
// Daaronder de gebruiksmeting: welke nummers zijn in gebruik en welke staan
// niet in het schema (de aangeleerde typefouten).
function RekeningschemaTab({ werkgeverId }: { werkgeverId: number | null }) {
  const queryClient = useQueryClient();
  const invalideer = () => {
    queryClient.invalidateQueries({ queryKey: ["grootboekrekeningen"] });
    queryClient.invalidateQueries({ queryKey: ["grootboek-gebruik"] });
  };
  const { data: rekeningen } = useListGrootboekrekeningen(
    werkgeverId != null ? { werkgever_id: werkgeverId } : undefined,
    { query: { queryKey: ["grootboekrekeningen", werkgeverId ?? "alle"] } },
  );
  const { data: gebruik } = useGetGrootboekGebruik({ query: { queryKey: ["grootboek-gebruik"] } });
  const syncMut = useSyncGrootboekAccountview({ mutation: { onSuccess: invalideer } });
  const importMut = useImportGrootboekrekeningen({ mutation: { onSuccess: invalideer } });
  const [importTekst, setImportTekst] = useState("");
  const [importFout, setImportFout] = useState<string | null>(null);
  const syncResultaat = syncMut.data as { beschikbaar?: boolean; reden?: string | null; http_status?: number | null; aantal?: number } | undefined;

  async function lijstInlezen() {
    setImportFout(null);
    if (werkgeverId == null) {
      setImportFout("Stel eerst bij Instellingen in voor welke werkmaatschappij deze administratie boekt.");
      return;
    }
    try {
      await importMut.mutateAsync({ data: { werkgever_id: werkgeverId, regels: importTekst } });
      setImportTekst("");
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setImportFout(e.response?.data?.error ?? String(err));
    }
  }

  const actieveRekeningen = (rekeningen ?? []).filter((r) => r.actief);
  const typefouten = (gebruik?.items ?? []).filter((i) => i.in_schema === false);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rekeningschema vullen</CardTitle>
          <CardDescription>
            Grootboekrekening is overal een keuzelijst uit dit schema — vrije tekst is vervallen.
            Haal het schema op uit AccountView, of lees een lijst in (één rekening per regel: nummer;omschrijving;soort).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Button onClick={() => syncMut.mutate()} disabled={syncMut.isPending}>
              {syncMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wifi className="h-4 w-4 mr-2" />}
              Ophalen uit AccountView
            </Button>
            {syncResultaat && (
              syncResultaat.beschikbaar
                ? <span className="flex items-center gap-1 text-sm text-green-700">
                    <CheckCircle2 className="h-4 w-4" /> {syncResultaat.aantal} rekeningen opgehaald uit AccountView
                  </span>
                : <span className="flex items-start gap-1 text-sm text-amber-700">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>De koppeling staat dit (nu) niet toe{syncResultaat.http_status ? ` (HTTP ${syncResultaat.http_status})` : ""}: {syncResultaat.reden ?? "onbekende reden"} Lees hieronder een lijst in.</span>
                  </span>
            )}
          </div>
          <Separator />
          <div>
            <Label>Lijst inlezen{werkgeverId == null ? " (koppel eerst een werkmaatschappij bij Instellingen)" : ""}</Label>
            <textarea
              className="mt-1 w-full min-h-32 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              placeholder={"4000;Inkoop materialen;kosten\n4100;Uitbesteed werk;kosten\n8000;Omzet montage;opbrengsten"}
              value={importTekst}
              onChange={(e) => setImportTekst(e.target.value)}
            />
            <div className="mt-2 flex items-center gap-3">
              <Button onClick={lijstInlezen} disabled={importMut.isPending || !importTekst.trim()}>
                {importMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                Lijst inlezen
              </Button>
              {importMut.isSuccess && !importFout && (
                <span className="flex items-center gap-1 text-sm text-green-700">
                  <CheckCircle2 className="h-4 w-4" /> Ingelezen
                </span>
              )}
              {importFout && <span className="text-sm text-red-600">{importFout}</span>}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Schema ({actieveRekeningen.length} rekeningen)</CardTitle>
          <CardDescription>Nummer, omschrijving en soort per rekening. Rekeningen die uit de bron verdwijnen worden gedeactiveerd, niet gewist.</CardDescription>
        </CardHeader>
        <CardContent>
          {actieveRekeningen.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nog geen rekeningschema ingelezen.</p>
          ) : (
            <div className="max-h-96 overflow-y-auto border rounded-md">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Nummer</th>
                    <th className="px-3 py-2 text-left font-medium">Omschrijving</th>
                    <th className="px-3 py-2 text-left font-medium">Soort</th>
                    <th className="px-3 py-2 text-left font-medium">Bron</th>
                  </tr>
                </thead>
                <tbody>
                  {actieveRekeningen.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="px-3 py-1.5 font-mono">{r.nummer}</td>
                      <td className="px-3 py-1.5">{r.omschrijving || "—"}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{r.soort ?? "—"}</td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground">{r.bron}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gebruikte rekeningnummers</CardTitle>
          <CardDescription>
            Alle nummers die nu in Connect in gebruik zijn (facturen, factuurregels, leveranciers, aangeleerde
            categorisaties en instellingen) — en welke daarvan niet in het schema voorkomen.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {gebruik == null ? (
            <p className="text-sm text-muted-foreground">Laden…</p>
          ) : (
            <>
              {gebruik.schema_aantal === 0 ? (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  Er is nog geen schema ingelezen — typefouten kunnen pas worden aangewezen zodra het schema gevuld is.
                </div>
              ) : typefouten.length === 0 ? (
                <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  Alle gebruikte nummers staan in het schema.
                </div>
              ) : (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{typefouten.length} nummer{typefouten.length !== 1 ? "s" : ""} in gebruik dat niet in het schema staat: <span className="font-mono">{typefouten.map((t) => t.nummer).join(", ")}</span></span>
                </div>
              )}
              <div className="max-h-72 overflow-y-auto border rounded-md">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="px-3 py-2 text-left font-medium">Nummer</th>
                      <th className="px-3 py-2 text-right font-medium">Aantal</th>
                      <th className="px-3 py-2 text-left font-medium">Waar</th>
                      <th className="px-3 py-2 text-left font-medium">In schema</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(gebruik.items ?? []).map((i) => (
                      <tr key={i.nummer} className="border-b last:border-0">
                        <td className="px-3 py-1.5 font-mono">{i.nummer}</td>
                        <td className="px-3 py-1.5 text-right">{i.totaal}</td>
                        <td className="px-3 py-1.5 text-xs text-muted-foreground">
                          {Object.entries(i.bronnen ?? {}).map(([b, n]) => `${b} (${n})`).join(", ")}
                        </td>
                        <td className="px-3 py-1.5">
                          {i.in_schema == null
                            ? <span className="text-xs text-muted-foreground">n.v.t.</span>
                            : i.in_schema
                              ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                              : <span className="flex items-center gap-1 text-xs text-red-700"><AlertTriangle className="h-3.5 w-3.5" /> nee</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
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

type TellerRij = {
  werkgever_id: number;
  naam: string;
  kenmerk_prefix: string | null;
  laatste_nummer: number;
  volgend_nummer: string;
  bijgewerkt_op: string | null;
  heeft_definitieve_facturen: boolean;
};

function FactuurnummerTellersTab() {
  const [tellers, setTellers] = useState<TellerRij[]>([]);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState<string | null>(null);
  const [dialoogOpen, setDialoogOpen] = useState(false);
  const [gekozenRij, setGekozenRij] = useState<TellerRij | null>(null);
  const [nieuweWaarde, setNieuweWaarde] = useState("");
  const [reden, setReden] = useState("");
  const [opslaan, setOpslaan] = useState(false);
  const [opslaanFout, setOpslaanFout] = useState<string | null>(null);

  async function laadTellers() {
    setLaden(true);
    setFout(null);
    try {
      const resp = await fetch("/api/facturen/factuurnummer-tellers");
      if (!resp.ok) { setFout("Ophalen mislukt"); return; }
      setTellers(await resp.json() as TellerRij[]);
    } catch {
      setFout("Netwerk- of serverfout");
    } finally {
      setLaden(false);
    }
  }

  useEffect(() => { void laadTellers(); }, []);

  function openDialoog(rij: TellerRij) {
    setGekozenRij(rij);
    setNieuweWaarde(String(rij.laatste_nummer));
    setReden("");
    setOpslaanFout(null);
    setDialoogOpen(true);
  }

  async function slaOp() {
    if (!gekozenRij) return;
    const val = parseInt(nieuweWaarde, 10);
    if (isNaN(val) || val < 0) { setOpslaanFout("Voer een geldig niet-negatief getal in"); return; }
    if (!reden.trim()) { setOpslaanFout("Een reden is verplicht"); return; }
    setOpslaan(true);
    setOpslaanFout(null);
    try {
      const resp = await fetch(`/api/facturen/factuurnummer-tellers/${gekozenRij.werkgever_id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nieuwe_waarde: val, reden: reden.trim() }),
      });
      const data = await resp.json() as { error?: string; detail?: string };
      if (!resp.ok) {
        setOpslaanFout(data.error ?? "Opslaan mislukt");
        return;
      }
      setDialoogOpen(false);
      await laadTellers();
    } catch {
      setOpslaanFout("Netwerk- of serverfout");
    } finally {
      setOpslaan(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Hash className="h-4 w-4 text-primary" />
            Fiscale factuurnummer-tellers per BV
          </CardTitle>
          <CardDescription>
            Stel hier per werkmaatschappij het startpunt van de fiscale nummerreeks in <strong>vóór</strong> de
            eerste definitieve factuur in Connect. Het volgende definitieve nummer is de waarde hieronder&nbsp;+&nbsp;1.
            Zodra er definitieve facturen zijn, kan de teller niet meer worden verlaagd.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {laden && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />Ophalen…
            </div>
          )}
          {!laden && fout && (
            <div className="text-sm text-destructive flex items-center gap-2 py-4">
              <AlertTriangle className="h-4 w-4" />{fout}
            </div>
          )}
          {!laden && !fout && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="px-4 py-2 text-left font-medium">Werkmaatschappij</th>
                    <th className="px-4 py-2 text-left font-medium">Prefix</th>
                    <th className="px-4 py-2 text-right font-medium">Huidig (laatste)</th>
                    <th className="px-4 py-2 text-right font-medium">Volgend nummer</th>
                    <th className="px-4 py-2 text-left font-medium">Bijgewerkt</th>
                    <th className="px-4 py-2 text-right font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {tellers.map((rij) => (
                    <tr key={rij.werkgever_id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">{rij.naam}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{rij.kenmerk_prefix ?? "—"}</td>
                      <td className="px-4 py-3 text-right font-mono">
                        {rij.laatste_nummer === 0 ? (
                          <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5 text-xs">
                            <AlertTriangle className="h-3 w-3" />Nog niet ingesteld
                          </span>
                        ) : (
                          <span className="font-mono">{String(rij.laatste_nummer).padStart(5, "0")}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold">{rij.volgend_nummer}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {rij.bijgewerkt_op ? new Date(rij.bijgewerkt_op).toLocaleString("nl-NL") : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant={rij.heeft_definitieve_facturen ? "outline" : "default"}
                          className="h-7 text-xs"
                          onClick={() => openDialoog(rij)}
                        >
                          <Pencil className="h-3 w-3 mr-1" />
                          {rij.heeft_definitieve_facturen ? "Aanpassen" : "Instellen"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="pt-4 pb-3">
          <div className="flex items-start gap-2 text-sm text-blue-800">
            <Info className="h-4 w-4 mt-0.5 shrink-0 text-blue-600" />
            <div className="space-y-1">
              <p className="font-medium">Wanneer moet ik dit instellen?</p>
              <p>
                Vóór de eerste definitieve factuur vanuit Connect. Als de BV in het oude pakket bijvoorbeeld
                al 142 facturen heeft verstuurd, stel je de teller in op&nbsp;<code className="font-mono bg-blue-100 px-1 rounded">142</code>.
                De eerstvolgende definitieve factuur in Connect krijgt dan nummer&nbsp;<code className="font-mono bg-blue-100 px-1 rounded">00143</code>.
              </p>
              <p className="text-blue-700">
                Als de teller al op 0 staat en er nog geen definitieve facturen zijn, start Connect automatisch bij 00001.
                Instellen is dan alleen nodig als de BV een bestaande reeks heeft.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialoogOpen} onOpenChange={setDialoogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {gekozenRij?.heeft_definitieve_facturen ? "Teller aanpassen" : "Startteller instellen"} — {gekozenRij?.naam}
            </DialogTitle>
          </DialogHeader>
          {gekozenRij?.heeft_definitieve_facturen && (
            <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              Er zijn al definitieve facturen voor deze BV. De teller kan alleen worden verhoogd.
            </div>
          )}
          <div className="space-y-3">
            <div>
              <Label>Laatste gebruikte nummer (uit oud pakket)</Label>
              <Input
                className="mt-1 font-mono"
                type="number"
                min={0}
                placeholder="bijv. 142"
                value={nieuweWaarde}
                onChange={(e) => setNieuweWaarde(e.target.value)}
              />
              {nieuweWaarde && !isNaN(parseInt(nieuweWaarde, 10)) && parseInt(nieuweWaarde, 10) >= 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Eerstvolgende Connect-factuur krijgt nummer&nbsp;
                  <strong className="font-mono">{String(parseInt(nieuweWaarde, 10) + 1).padStart(5, "0")}</strong>
                </p>
              )}
            </div>
            <div>
              <Label>Reden / toelichting <span className="text-destructive">*</span></Label>
              <Input
                className="mt-1"
                placeholder="bijv. Laatste nummer uit oud pakket vóór overstap op Connect"
                value={reden}
                onChange={(e) => setReden(e.target.value)}
              />
            </div>
            {opslaanFout && (
              <div className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" />{opslaanFout}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialoogOpen(false)}>Annuleren</Button>
            <Button
              disabled={!nieuweWaarde.trim() || !reden.trim() || opslaan}
              onClick={slaOp}
            >
              {opslaan ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Opslaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
