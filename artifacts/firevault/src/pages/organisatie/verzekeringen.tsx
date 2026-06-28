import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";

export default function VerzekeringenPagina() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Verzekeringen</h1>
        <p className="text-muted-foreground mt-1">
          Bedrijfsverzekeringen, polis-overzichten en vervaldatums op één plek.
        </p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <div className="p-4 rounded-full bg-muted">
            <ShieldCheck className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold">Verzekeringen is nog niet beschikbaar</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Deze module is in voorbereiding. Hier komen straks polissen, premies,
              verzekeringstypes en automatische vervalmeldingen.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
