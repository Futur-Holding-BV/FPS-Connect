import { useState } from "react";
import {
  useGetMailStatus,
  useGetMailLogboek,
  useTestMailVerbinding,
  useSendTestmail,
  useSendOpdrachtbevestigingDemo,
  useGetInfoInstellingen,
  useUpdateInfoInstellingen,
  type MailActieResultaat,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import {
  Mail, ShieldCheck, ShieldAlert, Send, PlugZap, RefreshCw,
  CheckCircle2, XCircle, Loader2, ClipboardCheck, FlaskConical,
} from "lucide-react";

const SOORT_LABEL: Record<string, string> = {
  test: "Testbericht",
  uitnodiging: "Uitnodiging",
  wachtwoord_reset: "Wachtwoord opnieuw",
  offerte: "Offerte",
  klantvraag: "Klantvraag",
  ondertekening: "Ondertekening",
  inkoopbon: "Inkoopbon",
  opdrachtbevestiging: "Opdrachtbevestiging",
};

const FOUT_LABEL: Record<string, string> = {
  niet_geconfigureerd: "Niet geconfigureerd",
  token_verlopen: "Aanmelden mislukt",
  onvoldoende_rechten: "Onvoldoende Microsoft-rechten",
  mailbox_onbereikbaar: "Postbus onbereikbaar",
  rate_limit: "Tijdelijk geblokkeerd",
  verzendfout: "Verzendfout",
};

function MailResultaat({ resultaat }: { resultaat: MailActieResultaat }) {
  if (resultaat.ok) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{resultaat.melding}</span>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-medium">{resultaat.melding}</p>
        {resultaat.detail && (
          <p className="mt-1 break-words text-xs text-red-600">{resultaat.detail}</p>
        )}
      </div>
    </div>
  );
}

export default function MailBeheer() {
  const { heeftNiveau } = useBevoegdheid();
  const { toast } = useToast();

  const magBekijken = heeftNiveau("systeem", 1);
  const magBeheren = heeftNiveau("systeem", 2);

  const [testEmail, setTestEmail] = useState("");
  const [verbindingResultaat, setVerbindingResultaat] = useState<MailActieResultaat | null>(null);
  const [testmailResultaat, setTestmailResultaat] = useState<MailActieResultaat | null>(null);

  const [demoEmail, setDemoEmail] = useState("");
  const [demoOfferteId, setDemoOfferteId] = useState("");
  const [demoResultaat, setDemoResultaat] = useState<MailActieResultaat | null>(null);

  const statusQuery = useGetMailStatus();
  const logboekQuery = useGetMailLogboek();
  const verbindingTest = useTestMailVerbinding();
  const testmail = useSendTestmail();
  const demoMutation = useSendOpdrachtbevestigingDemo();

  const instellingenQuery = useGetInfoInstellingen();
  const updateInstellingen = useUpdateInfoInstellingen();

  const autoVerzenden = instellingenQuery.data?.opdrachtbevestiging_auto_verzenden ?? false;

  async function toggleAutoVerzenden(nieuw: boolean) {
    try {
      await updateInstellingen.mutateAsync({
        data: { opdrachtbevestiging_auto_verzenden: nieuw },
      });
      instellingenQuery.refetch();
      toast({
        title: nieuw
          ? "Automatisch verzenden ingeschakeld"
          : "Automatisch verzenden uitgeschakeld",
      });
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  }

  if (!magBekijken) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">U heeft geen toegang tot deze pagina.</p>
      </div>
    );
  }

  const status = statusQuery.data;

  async function verbindingTesten() {
    setVerbindingResultaat(null);
    try {
      const r = await verbindingTest.mutateAsync();
      setVerbindingResultaat(r);
      statusQuery.refetch();
    } catch {
      toast({ title: "Verbindingstest mislukt", variant: "destructive" });
    }
  }

  async function testmailVersturen() {
    setTestmailResultaat(null);
    try {
      const r = await testmail.mutateAsync({ data: { naar_email: testEmail.trim() } });
      setTestmailResultaat(r);
      if (r.ok) toast({ title: "Testbericht verstuurd" });
      logboekQuery.refetch();
    } catch {
      toast({ title: "Versturen mislukt", description: "Controleer het e-mailadres.", variant: "destructive" });
    }
  }

  async function demoVersturen() {
    setDemoResultaat(null);
    const offerteIdNum = parseInt(demoOfferteId, 10);
    if (!demoEmail.includes("@") || isNaN(offerteIdNum) || offerteIdNum < 1) return;
    try {
      const r = await demoMutation.mutateAsync({
        data: { naar_email: demoEmail.trim(), offerte_id: offerteIdNum },
      });
      setDemoResultaat(r);
      if (r.ok) toast({ title: "Demo-opdrachtbevestiging verstuurd" });
      logboekQuery.refetch();
    } catch {
      toast({ title: "Demo versturen mislukt", variant: "destructive" });
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Mail className="h-5 w-5" />
        </div>
        <div>
          <h1 data-paginatitel className="text-2xl font-bold">Mailinstellingen</h1>
          <p className="text-sm text-muted-foreground">
            Microsoft 365-koppeling voor uitgaande e-mail en opdrachtbevestigingen.
          </p>
        </div>
      </div>

      {/* Configuratiestatus */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuratie</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {statusQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Laden…
            </div>
          ) : status ? (
            <>
              <div className="flex items-center gap-2">
                {status.geconfigureerd ? (
                  <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
                    <ShieldCheck className="h-3.5 w-3.5" /> Geconfigureerd
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1">
                    <ShieldAlert className="h-3.5 w-3.5" /> Niet geconfigureerd
                  </Badge>
                )}
              </div>
              <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                <div className="flex justify-between gap-4 border-b py-1.5">
                  <dt className="text-muted-foreground">Zichtbare afzender</dt>
                  <dd className="font-medium">{status.afzender}</dd>
                </div>
                <div className="flex justify-between gap-4 border-b py-1.5">
                  <dt className="text-muted-foreground">Postbus (Microsoft 365)</dt>
                  <dd className="font-medium">{status.postbus}</dd>
                </div>
              </dl>
              {status.ontbrekende_secrets.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <p className="font-medium">Ontbrekende instellingen</p>
                  <p className="mt-1">
                    De volgende waarden ontbreken nog en moeten als beveiligde omgevingsvariabelen worden ingesteld:
                  </p>
                  <ul className="mt-2 list-inside list-disc font-mono text-xs">
                    {status.ontbrekende_secrets.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Status kon niet worden geladen.</p>
          )}
        </CardContent>
      </Card>

      {/* Opdrachtbevestiging-instellingen */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Opdrachtbevestiging</CardTitle>
          </div>
          <CardDescription>
            Na digitale ondertekening van een offerte kan het systeem automatisch een professionele
            bevestigingsmail sturen naar de klant met de vervolgstappen.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {magBeheren ? (
            <>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">Automatisch verzenden na ondertekening</p>
                  <p className="text-xs text-muted-foreground">
                    Als ingeschakeld wordt de opdrachtbevestiging direct verstuurd wanneer de klant ondertekent,
                    mits het CRM-record van de klant een e-mailadres bevat.
                    Als uitgeschakeld wordt er geen bevestiging verstuurd.
                  </p>
                </div>
                <Switch
                  checked={autoVerzenden}
                  onCheckedChange={toggleAutoVerzenden}
                  disabled={updateInstellingen.isPending || instellingenQuery.isLoading}
                />
              </div>

              {autoVerzenden && (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                  <p className="font-medium">Automatisch verzenden is ingeschakeld</p>
                  <p className="mt-1 text-emerald-700">
                    Na elke ondertekening ontvangt de klant automatisch een bevestigingsmail met de vijf vervolgstappen,
                    een projectlink en de contactgegevens van de behandelaar.
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-md border p-4">
              <p className="text-sm font-medium">Automatisch verzenden</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {autoVerzenden ? "Ingeschakeld" : "Uitgeschakeld"}
              </p>
            </div>
          )}

          {/* Demo-verzending */}
          {magBeheren && (
            <div className="space-y-3 rounded-lg border border-dashed p-4">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">Demo-opdrachtbevestiging testen</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Stuur een voorbeeld-opdrachtbevestiging op basis van een bestaande offerte.
                De gegevens worden uit de offerte geladen; de mail gaat naar het opgegeven adres.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="demo-email" className="text-xs">Ontvanger</Label>
                  <Input
                    id="demo-email"
                    type="email"
                    placeholder="naam@voorbeeld.nl"
                    value={demoEmail}
                    onChange={(e) => setDemoEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="demo-offerte" className="text-xs">Offerte-ID</Label>
                  <Input
                    id="demo-offerte"
                    type="number"
                    placeholder="bijv. 42"
                    value={demoOfferteId}
                    onChange={(e) => setDemoOfferteId(e.target.value)}
                  />
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={demoVersturen}
                disabled={
                  demoMutation.isPending ||
                  !demoEmail.includes("@") ||
                  !demoOfferteId ||
                  parseInt(demoOfferteId, 10) < 1
                }
              >
                {demoMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Demo versturen
              </Button>
              {demoResultaat && <MailResultaat resultaat={demoResultaat} />}
            </div>
          )}
        </CardContent>
      </Card>

      {magBeheren && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Verbindingstest */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Verbinding testen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Controleert het aanmelden bij Microsoft 365 en of de postbus bereikbaar is. Er wordt geen e-mail verstuurd.
              </p>
              <Button onClick={verbindingTesten} disabled={verbindingTest.isPending}>
                {verbindingTest.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PlugZap className="h-4 w-4" />
                )}
                Verbinding testen
              </Button>
              {verbindingResultaat && <MailResultaat resultaat={verbindingResultaat} />}
            </CardContent>
          </Card>

          {/* Testmail */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Testbericht versturen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="testmail">Ontvanger</Label>
                <Input
                  id="testmail"
                  type="email"
                  placeholder="naam@voorbeeld.nl"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                />
              </div>
              <Button
                onClick={testmailVersturen}
                disabled={testmail.isPending || !testEmail.includes("@")}
              >
                {testmail.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Testbericht versturen
              </Button>
              {testmailResultaat && <MailResultaat resultaat={testmailResultaat} />}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Logboek */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Verzendlogboek (laatste 100)</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => logboekQuery.refetch()}
            disabled={logboekQuery.isFetching}
          >
            <RefreshCw className={`h-4 w-4 ${logboekQuery.isFetching ? "animate-spin" : ""}`} />
            Vernieuwen
          </Button>
        </CardHeader>
        <CardContent>
          {logboekQuery.isLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Laden…
            </div>
          ) : (logboekQuery.data?.length ?? 0) === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nog geen verzendpogingen geregistreerd.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Datum</TableHead>
                    <TableHead>Soort</TableHead>
                    <TableHead>Ontvanger</TableHead>
                    <TableHead>Onderwerp</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logboekQuery.data?.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(r.aangemaakt_op).toLocaleString("nl-NL", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </TableCell>
                      <TableCell className="text-sm">{SOORT_LABEL[r.soort] ?? r.soort}</TableCell>
                      <TableCell className="text-sm">
                        <div className="font-medium">{r.naar_naam ?? r.naar_email}</div>
                        {r.naar_naam && (
                          <div className="text-xs text-muted-foreground">{r.naar_email}</div>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[18rem] truncate text-sm" title={r.onderwerp}>
                        {r.onderwerp}
                      </TableCell>
                      <TableCell>
                        {r.status === "verzonden" ? (
                          <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
                            <CheckCircle2 className="h-3 w-3" /> Verzonden
                          </Badge>
                        ) : (
                          <div className="space-y-1">
                            <Badge variant="destructive" className="gap-1">
                              <XCircle className="h-3 w-3" /> Mislukt
                            </Badge>
                            {r.fout_categorie && (
                              <div className="text-xs text-muted-foreground">
                                {FOUT_LABEL[r.fout_categorie] ?? r.fout_categorie}
                              </div>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
