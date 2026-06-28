import { Card, CardContent } from "@/components/ui/card";
import { BookOpen } from "lucide-react";

export default function JaarverslagenPagina() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Jaarverslagen &amp; Rekeningen</h1>
        <p className="text-muted-foreground mt-1">
          Jaarrekeningen, jaarverslagen en financiële rapportages per boekjaar.
        </p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <div className="p-4 rounded-full bg-muted">
            <BookOpen className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold">Jaarverslagen &amp; Rekeningen is nog niet beschikbaar</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Deze module is in voorbereiding. Hier komen straks jaarrekeningen,
              jaarverslagen en financiële overzichten per boekjaar en werkmaatschappij.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
