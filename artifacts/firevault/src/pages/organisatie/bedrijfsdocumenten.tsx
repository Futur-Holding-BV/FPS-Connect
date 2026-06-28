import { Card, CardContent } from "@/components/ui/card";
import { Files } from "lucide-react";

export default function BedrijfsdocumentenPagina() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Bedrijfsdocumenten</h1>
        <p className="text-muted-foreground mt-1">
          Centrale bibliotheek voor contracten, certificaten, vergunningen en overige bedrijfsdocumenten.
        </p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <div className="p-4 rounded-full bg-muted">
            <Files className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold">Bedrijfsdocumenten is nog niet beschikbaar</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Deze module is in voorbereiding. Hier komen straks contracten, vergunningen,
              certificaten en overige interne bedrijfsdocumenten.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
