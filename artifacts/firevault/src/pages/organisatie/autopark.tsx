import { Card, CardContent } from "@/components/ui/card";
import { Car } from "lucide-react";

export default function AutoparkPagina() {
  return (
    <div className="space-y-6">
      <div>
        <h1 data-paginatitel className="text-2xl font-bold tracking-tight">Autopark</h1>
        <p className="text-muted-foreground mt-1">
          Overzicht en beheer van bedrijfsvoertuigen, leasewagens en bijbehorende documenten.
        </p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <div className="p-4 rounded-full bg-muted">
            <Car className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold">Autopark is nog niet beschikbaar</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Deze module is in voorbereiding. Hier komen straks bedrijfsvoertuigen,
              kentekens, leasebeheer en keuringsdocumenten.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
