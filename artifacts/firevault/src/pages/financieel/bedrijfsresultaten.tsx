import { Card, CardContent } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

export default function BedrijfsresultatenPagina() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Bedrijfsresultaten</h1>
        <p className="text-muted-foreground mt-1">
          Overzichten van omzet, marge, kosten en resultaat per periode en werkmaatschappij.
        </p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <div className="p-4 rounded-full bg-muted">
            <BarChart3 className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold">Bedrijfsresultaten is nog niet beschikbaar</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Deze module is in voorbereiding. Hier komen straks omzetoverzichten,
              margeanalyses, kostenverdelingen en resultaten per boekperiode.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
