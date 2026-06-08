import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Info, Scale, History, ShieldCheck } from "lucide-react";
import {
  APP_VERSIE,
  APP_UITGEBRACHT_OP,
  APP_LEVERANCIER,
  WIJZIGINGSLOGBOEK,
} from "@/lib/app-info";

function formatDatum(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function InfoPagina() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 text-primary p-2 rounded-lg">
          <Info className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">App-informatie</h1>
          <p className="text-sm text-muted-foreground">
            Versiebeheer en juridische verantwoordelijkheid
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Over de applicatie
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Applicatie</dt>
              <dd className="text-sm font-medium">{APP_LEVERANCIER}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Versie</dt>
              <dd className="text-sm font-medium">
                <Badge variant="outline" className="font-mono">
                  v{APP_VERSIE}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Uitgebracht op</dt>
              <dd className="text-sm font-medium">{formatDatum(APP_UITGEBRACHT_OP)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Leverancier</dt>
              <dd className="text-sm font-medium">{APP_LEVERANCIER}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Scale className="h-5 w-5 text-primary" />
            Juridische verantwoordelijkheid
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            {APP_LEVERANCIER} is een hulpmiddel voor het registreren, beheren en
            inspecteren van brandpreventieve gebouwvoorzieningen. De applicatie
            ondersteunt bij het vastleggen en plannen van werkzaamheden, maar
            vervangt niet het professionele oordeel van bevoegde inspecteurs,
            monteurs of de verantwoordelijke gebouweigenaar.
          </p>
          <p>
            De gebruiker en de gebouweigenaar blijven te allen tijde zelf
            verantwoordelijk voor het naleven van de geldende wet- en regelgeving
            op het gebied van brandveiligheid, waaronder het Bouwbesluit en de
            van toepassing zijnde NEN-normen. {APP_LEVERANCIER} aanvaardt geen
            aansprakelijkheid voor schade die voortvloeit uit onjuiste, onvolledige
            of verouderde gegevens, noch uit beslissingen die op basis van de in de
            applicatie getoonde informatie zijn genomen.
          </p>
          <p>
            Gegevens worden vertrouwelijk behandeld en uitsluitend gebruikt voor
            het functioneren van het platform. Controleer ingevoerde gegevens
            zorgvuldig en raadpleeg bij twijfel altijd een gecertificeerde
            specialist.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-5 w-5 text-primary" />
            Versiebeheer
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-5">
            {WIJZIGINGSLOGBOEK.map((wijziging) => (
              <div key={wijziging.versie} className="border-l-2 border-primary/30 pl-4">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono">
                    v{wijziging.versie}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDatum(wijziging.datum)}
                  </span>
                </div>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                  {wijziging.punten.map((punt, i) => (
                    <li key={i}>{punt}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <p className="pt-2 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} {APP_LEVERANCIER} · v{APP_VERSIE}
      </p>
    </div>
  );
}
