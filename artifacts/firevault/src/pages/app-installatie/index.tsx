import { useEffect, useState } from "react";
import { Loader2, Smartphone, Download, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/**
 * Publieke installatiepagina voor de FPS Monteur-app (route /app).
 *
 * Deze link wordt door beheerders per WhatsApp/e-mail naar medewerkers
 * gestuurd. Zodra MONTEUR_APP_STORE_URL is ingesteld (app gepubliceerd),
 * verwijst de pagina automatisch door naar de store; tot die tijd legt hij
 * netjes uit dat de app er bijna is. De link zelf blijft dus altijd geldig.
 */
export default function AppInstallatiePagina() {
  const [laden, setLaden] = useState(true);
  const [storeUrl, setStoreUrl] = useState<string | null>(null);
  const [playStoreUrl, setPlayStoreUrl] = useState<string | null>(null);

  // Sinds MONTEUR_NU_01 serveert de webserver op /app de echte
  // monteuromgeving (Expo web-export). Deze SPA-pagina kan alleen nog
  // verschijnen via een verouderde service-worker-cache of in een omgeving
  // zonder die webuitvoer. Is de monteuromgeving bereikbaar, dan sturen we
  // hard door zodat de gebruiker nooit op de wachtpagina blijft hangen.
  useEffect(() => {
    fetch("/app/versie.json", { cache: "no-store" })
      .then(async (r) => {
        // Alleen doorsturen als versie.json aantoonbaar van de Expo-export
        // komt: in dev geeft Vite voor onbekende paden gewoon SPA-HTML met
        // status 200 terug — dat zou hier een redirectlus veroorzaken.
        if (!r.ok) return;
        const tekst = await r.text();
        try {
          const data = JSON.parse(tekst) as Record<string, unknown>;
          if (data && typeof data === "object") window.location.replace("/app/");
        } catch {
          // Geen JSON → geen monteur-export aanwezig; op deze pagina blijven.
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    fetch(`${BASE}/api/auth/app-installatie-info`)
      .then((r) => (r.ok ? r.json() : { store_url: null, play_store_url: null }))
      .then((d: { store_url: string | null; play_store_url: string | null }) => {
        setStoreUrl(d.store_url);
        setPlayStoreUrl(d.play_store_url ?? null);
      })
      .catch(() => { setStoreUrl(null); setPlayStoreUrl(null); })
      .finally(() => setLaden(false));
  }, []);

  return (
    <div className="min-h-screen bg-[#212631] flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F23B0D] shadow-lg mb-4">
            <Smartphone className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-white">FPS Monteur</h1>
          <p className="text-sm text-white/50 mt-1">De app voor monteurs van FPS Brandpreventie</p>
        </div>

        <div className="rounded-2xl bg-white p-7 shadow-xl">
          {laden ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            </div>
          ) : storeUrl || playStoreUrl ? (
            <div className="space-y-4 text-center">
              <h2 className="text-lg font-semibold text-zinc-900">Installeer de app</h2>
              <p className="text-sm text-zinc-500">
                {storeUrl && playStoreUrl
                  ? "Kies hieronder uw telefoon om de FPS Monteur-app te installeren."
                  : "Tik op de knop hieronder om de FPS Monteur-app op uw telefoon te installeren."}
              </p>
              {storeUrl && (
                <Button
                  className="w-full bg-[#F23B0D] hover:bg-[#F23B0D]/90 text-white h-11 text-base"
                  onClick={() => { window.location.href = storeUrl; }}
                >
                  <Download className="h-4 w-4 mr-2" />
                  {playStoreUrl ? "Installeren op iPhone (App Store)" : "App installeren"}
                </Button>
              )}
              {playStoreUrl && (
                <Button
                  className="w-full bg-[#F23B0D] hover:bg-[#F23B0D]/90 text-white h-11 text-base"
                  onClick={() => { window.location.href = playStoreUrl; }}
                >
                  <Download className="h-4 w-4 mr-2" />
                  {storeUrl ? "Installeren op Android (Google Play)" : "App installeren"}
                </Button>
              )}
              <p className="text-xs text-zinc-400">
                Na installatie logt u in met uw FPS Connect-account. Vragen? Neem contact op met uw beheerder.
              </p>
            </div>
          ) : (
            <div className="space-y-4 text-center">
              <div className="flex justify-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-100">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
              </div>
              <h2 className="text-lg font-semibold text-zinc-900">De app komt eraan</h2>
              <p className="text-sm text-zinc-500">
                De FPS Monteur-app staat nog niet in de App Store. Bewaar deze link — zodra de app
                gepubliceerd is, kunt u hem via deze zelfde pagina direct installeren.
              </p>
              <p className="text-xs text-zinc-400">
                Vragen? Neem contact op met uw beheerder.
              </p>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-white/30 mt-6">FPS Brandpreventie © 2026</p>
      </div>
    </div>
  );
}
