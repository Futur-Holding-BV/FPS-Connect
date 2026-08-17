import { useState, useEffect } from "react";
import { Smartphone, QrCode, CheckCircle2, XCircle, Copy, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/auth-context";

interface PwaStatus {
  serviceWorkerOndersteund: boolean;
  serviceWorkerGeregistreerd: boolean;
  manifestAanwezig: boolean;
  standalone: boolean;
}

export default function PwaTest() {
  const { gebruiker } = useAuth();
  const { toast } = useToast();
  const [appUrl, setAppUrl] = useState<string>("");
  const [pwaStatus, setPwaStatus] = useState<PwaStatus>({
    serviceWorkerOndersteund: false,
    serviceWorkerGeregistreerd: false,
    manifestAanwezig: false,
    standalone: false,
  });
  const [qrLaden, setQrLaden] = useState(true);
  const [qrFout, setQrFout] = useState(false);

  // URL ophalen via API
  useEffect(() => {
    fetch("/api/auth/pwa-url")
      .then((r) => r.json())
      .then((d) => setAppUrl(d.url ?? window.location.origin + "/connect/planning"))
      .catch(() => setAppUrl(window.location.origin + "/connect/planning"));
  }, []);

  // PWA-status controleren
  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;

    const manifestEl = document.querySelector<HTMLLinkElement>("link[rel='manifest']");

    setPwaStatus({
      serviceWorkerOndersteund: "serviceWorker" in navigator,
      serviceWorkerGeregistreerd: false,
      manifestAanwezig: !!manifestEl,
      standalone,
    });

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        setPwaStatus((prev) => ({
          ...prev,
          serviceWorkerGeregistreerd: regs.length > 0,
        }));
      });
    }
  }, []);

  function kopieerUrl() {
    if (!appUrl) return;
    navigator.clipboard.writeText(appUrl).then(() => {
      toast({ title: "Gekopieerd", description: "URL staat in het klembord." });
    });
  }

  const isHoofdtester = gebruiker?.is_hoofdtester === true;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Smartphone className="h-6 w-6 text-primary" />
        <div>
          <h1 data-paginatitel className="text-xl font-semibold">Mobiele test — FPS Connect PWA</h1>
          <p className="text-sm text-muted-foreground">
            Interne testpagina voor hoofdbeheerders
          </p>
        </div>
      </div>

      {isHoofdtester && (
        <Badge variant="secondary" className="gap-1">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
          Aangemerkt als hoofdtester
        </Badge>
      )}

      {/* PWA-status */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">PWA-status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <StatusRegel
            label="Service Worker ondersteund"
            actief={pwaStatus.serviceWorkerOndersteund}
          />
          <StatusRegel
            label="Service Worker geregistreerd"
            actief={pwaStatus.serviceWorkerGeregistreerd}
          />
          <StatusRegel
            label="Manifest aanwezig"
            actief={pwaStatus.manifestAanwezig}
          />
          <StatusRegel
            label="Standalone modus (app toegevoegd)"
            actief={pwaStatus.standalone}
          />
        </CardContent>
      </Card>

      {/* QR-code */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <QrCode className="h-4 w-4" />
            Scan om te openen op telefoon
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-center">
            {qrFout ? (
              <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                <XCircle className="h-8 w-8 text-destructive" />
                <span className="text-sm">QR-code kon niet worden geladen</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setQrFout(false); setQrLaden(true); }}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  Opnieuw
                </Button>
              </div>
            ) : (
              <div className="relative">
                {qrLaden && (
                  <div className="absolute inset-0 flex items-center justify-center bg-muted rounded">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                )}
                <img
                  src="/api/auth/pwa-qr"
                  alt="QR-code voor FPS Connect"
                  className="rounded border border-border"
                  style={{ width: 200, height: 200 }}
                  onLoad={() => setQrLaden(false)}
                  onError={() => { setQrLaden(false); setQrFout(true); }}
                />
              </div>
            )}
          </div>

          {appUrl && (
            <div className="flex items-center gap-2 bg-muted/50 rounded px-3 py-2">
              <span className="text-xs font-mono text-muted-foreground flex-1 truncate">
                {appUrl}
              </span>
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={kopieerUrl}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Installatie-instructies */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Installatie-instructie</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <p className="font-medium mb-1">iPhone / iPad (Safari)</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Scan de QR-code met de Camera-app of open de URL in Safari</li>
              <li>Tik op het deelicoon onderaan het scherm</li>
              <li>Kies &ldquo;Zet op beginscherm&rdquo;</li>
              <li>Bevestig met &ldquo;Voeg toe&rdquo;</li>
            </ol>
          </div>
          <div>
            <p className="font-medium mb-1">Android (Chrome)</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Scan de QR-code of open de URL in Chrome</li>
              <li>Tik op het menu (drie puntjes) rechtsboven</li>
              <li>Kies &ldquo;App installeren&rdquo; of &ldquo;Toevoegen aan beginscherm&rdquo;</li>
              <li>Bevestig de installatie</li>
            </ol>
          </div>
          <p className="text-xs text-muted-foreground border-t pt-2">
            Na installatie start de app in volledig scherm, zonder adresbalk.
            Internetverbinding is vereist voor alle gegevens.
          </p>
        </CardContent>
      </Card>

      {/* Beschikbare mobiele schermen */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Beschikbare schermen (mobiel)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <SchermRegel label="Planning bekijken (weekoverzicht)" beschikbaar />
          <SchermRegel label="Eigen dagplanning (filter op naam)" beschikbaar />
          <SchermRegel label="Projectinformatie (gebouwdetail)" beschikbaar />
          <SchermRegel label="Uitvoeringsplanning — tabblad Medewerkers" beschikbaar />
          <SchermRegel label="Uitvoeringsplanning — tabblad Projecten" beschikbaar />
          <SchermRegel label="Uitvoeringsplanning — tabblad Capaciteit" beschikbaar />
          <SchermRegel label="Uren invoeren (tijdregistratie)" beschikbaar={false} />
        </CardContent>
      </Card>

      {/* Ontbrekende schermen */}
      <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-amber-800 dark:text-amber-200">
            Nog te bouwen voor echte urenregistratie
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-amber-700 dark:text-amber-300">
          <p>De planning is leesbaar op mobiel, maar tijdregistratie (uren invoeren) vereist nog:</p>
          <ul className="list-disc list-inside space-y-0.5 mt-1">
            <li>Tijdregistratietabel in de database (<code>tijdregistraties</code>)</li>
            <li>API-endpoints voor uren opvoeren per planningsblok</li>
            <li>Mobiel formulier: datum, start/eindtijd, project, pauze</li>
            <li>Weekoverzicht met totaaluren per medewerker</li>
            <li>Goedkeuringsflow voor leidinggevende</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusRegel({ label, actief }: { label: string; actief: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {actief ? (
        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
      ) : (
        <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
      )}
      <span className={actief ? "" : "text-muted-foreground"}>{label}</span>
    </div>
  );
}

function SchermRegel({ label, beschikbaar }: { label: string; beschikbaar: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {beschikbaar ? (
        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
      ) : (
        <XCircle className="h-4 w-4 text-amber-500 shrink-0" />
      )}
      <span className={beschikbaar ? "" : "text-muted-foreground"}>{label}</span>
    </div>
  );
}
