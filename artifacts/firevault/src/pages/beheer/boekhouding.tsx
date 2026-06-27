import { useState } from "react";
import {
  useGetAccountviewInstellingen,
  useUpdateAccountviewInstellingen,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Building2, Settings, Wifi, WifiOff, CheckCircle2, AlertTriangle, Loader2, Eye, EyeOff, Info } from "lucide-react";
import type { AccountviewInstellingen } from "@workspace/api-client-react";

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
    <div className="p-6 space-y-6 max-w-3xl">
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

      {/* Testmodus banner */}
      {(veld("testmodus", inst?.testmodus) as boolean) && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Testmodus actief</p>
            <p>Exportpogingen worden gelogd maar <strong>niet</strong> naar AccountView verzonden.</p>
          </div>
        </div>
      )}

      {/* API-verbinding */}
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

          {/* Test verbinding */}
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

      {/* Dagboeken & grootboek */}
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

      {/* BTW-codes */}
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

      {/* Debiteuren/crediteuren */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Debiteuren & crediteuren mapping</CardTitle>
          <CardDescription>Relatiecodes in AccountView gekoppeld aan Connect-namen (JSON)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Crediteurencode mapping</Label>
              <textarea
                className="mt-1 w-full min-h-16 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                placeholder='{ "Leverancier BV": "LEV001" }'
                value={veld("crediteur_mapping", JSON.stringify(inst?.crediteur_mapping ?? {}, null, 2)) as string}
                onChange={(e) => setVeld("crediteur_mapping", e.target.value)}
              />
            </div>
            <div>
              <Label>Debiteurencode mapping</Label>
              <textarea
                className="mt-1 w-full min-h-16 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                placeholder='{ "Klant BV": "KLA001" }'
                value={veld("debiteur_mapping", JSON.stringify(inst?.debiteur_mapping ?? {}, null, 2)) as string}
                onChange={(e) => setVeld("debiteur_mapping", e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Opslaan */}
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
    </div>
  );
}
