import { Card, CardContent } from "@/components/ui/card";
import { Building2 } from "lucide-react";

export default function BedrijfsgegevensPagina() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Bedrijfsgegevens</h1>
        <p className="text-muted-foreground mt-1">
          KVK-gegevens, IBAN, contactinformatie en overige stamgegevens van de organisatie.
        </p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <div className="p-4 rounded-full bg-muted">
            <Building2 className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold">Bedrijfsgegevens is nog niet beschikbaar</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Deze module is in voorbereiding. Hier komen straks KVK-nummer, vestigingen,
              btw-nummer, bankgegevens en contactgegevens per werkmaatschappij.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
