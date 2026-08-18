/**
 * BEHEERSTATUS_01 — meldingsblok "Systeembewaking" op het dashboard.
 *
 * Alleen zichtbaar voor het echte hoofdbeheerder-profiel (René), ook niet
 * tijdens "Bekijken als persoon". Toont het aantal openstaande storingen en
 * de zwaarste stand uit het FPS-Beheercentrum; klikken opent het
 * beheercentrum in een nieuw tabblad op de betreffende storing.
 *
 * Er wordt niets opgeslagen: elke weergave is een live opvraging via de
 * server (die met een alleen-lezen sleutel bij het beheercentrum aanklopt).
 * Zonder antwoord toont het blok "geen verbinding" — nooit groen, nooit leeg.
 */
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldAlert, ShieldCheck, TriangleAlert, WifiOff, ChevronRight } from "lucide-react";
import { useRol } from "@/context/rol-context";

interface BeheerStatus {
  verbinding: boolean;
  reden?: string;
  zwaarste?: "rood" | "aandacht" | "rustig";
  aantalStoringen?: number;
  aantalAandacht?: number;
  doelUrl?: string;
  storingen?: Array<{ naam: string; url: string }>;
}

async function haalBeheerStatus(): Promise<BeheerStatus> {
  const res = await fetch("/api/beheer-status", { credentials: "include" });
  if (!res.ok) return { verbinding: false, reden: `Fout ${res.status}` };
  return (await res.json()) as BeheerStatus;
}

export function BeheerStatusBlok() {
  const { echteRol, persoon } = useRol();
  // Alleen het echte beheerdersprofiel; verbergen tijdens impersonatie zodat
  // "bekijken als" exact toont wat het teamlid ziet.
  const zichtbaar = echteRol === "hoofdbeheerder" && !persoon;

  const { data, isPending, isError } = useQuery({
    queryKey: ["beheer-status"],
    queryFn: haalBeheerStatus,
    refetchInterval: 60_000,
    enabled: zichtbaar,
  });

  if (!zichtbaar) return null;

  const status: BeheerStatus =
    isError || !data ? { verbinding: false, reden: "Geen antwoord." } : data;

  let inhoud: ReactNode;
  let rand = "border-muted";
  if (isPending) {
    inhoud = <div className="text-sm text-muted-foreground">Status ophalen…</div>;
  } else if (!status.verbinding) {
    rand = "border-amber-300 bg-amber-50";
    inhoud = (
      <div className="flex items-center gap-3">
        <WifiOff className="h-5 w-5 shrink-0 text-amber-600" />
        <div>
          <div className="font-semibold text-sm text-amber-900">Geen verbinding met het beheercentrum</div>
          {status.reden && <p className="text-xs text-amber-800 mt-0.5">{status.reden}</p>}
        </div>
      </div>
    );
  } else if (status.zwaarste === "rood") {
    rand = "border-red-300 bg-red-50";
    inhoud = (
      <div className="flex items-center gap-3">
        <ShieldAlert className="h-5 w-5 shrink-0 text-red-600" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-red-900">
            {status.aantalStoringen === 1
              ? "1 openstaande storing"
              : `${status.aantalStoringen} openstaande storingen`}
          </div>
          <p className="text-xs text-red-700 mt-0.5">Klik op een storing om die te openen in het beheercentrum</p>
        </div>
        <ChevronRight className="h-4 w-4 text-red-400" />
      </div>
    );
  } else if (status.zwaarste === "aandacht") {
    rand = "border-amber-300 bg-amber-50";
    inhoud = (
      <div className="flex items-center gap-3">
        <TriangleAlert className="h-5 w-5 shrink-0 text-amber-600" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-amber-900">
            Aandacht nodig ({status.aantalAandacht ?? 0})
          </div>
          <p className="text-xs text-amber-800 mt-0.5">Geen storingen, wel aandachtspunten</p>
        </div>
        <ChevronRight className="h-4 w-4 text-amber-400" />
      </div>
    );
  } else {
    rand = "border-emerald-200 bg-emerald-50/50";
    inhoud = (
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-emerald-900">Alles rustig</div>
          <p className="text-xs text-emerald-700 mt-0.5">Geen openstaande storingen</p>
        </div>
        <ChevronRight className="h-4 w-4 text-emerald-400" />
      </div>
    );
  }

  const storingen = status.verbinding ? (status.storingen ?? []) : [];
  const kaart = (
    <Card className={`cursor-pointer hover:bg-muted/40 transition-colors ${rand}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Systeembewaking</CardTitle>
      </CardHeader>
      <CardContent>
        {inhoud}
        {storingen.length > 1 && (
          <ul className="mt-3 space-y-1 border-t border-red-200 pt-2">
            {storingen.map((s) => (
              <li key={s.url}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs font-medium text-red-800 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ChevronRight className="h-3 w-3 shrink-0" />
                  {s.naam}
                </a>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );

  // Zonder verbinding valt er niets te openen; met verbinding opent een klik
  // het beheercentrum in een nieuw tabblad op de betreffende storing.
  if (!status.verbinding || !status.doelUrl) return kaart;
  return (
    <a href={status.doelUrl} target="_blank" rel="noopener noreferrer" className="block">
      {kaart}
    </a>
  );
}
