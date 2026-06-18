import {
  MessageSquare, Users, Image, FileText, Pencil, Clock,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const FUNCTIES = [
  {
    icoon: MessageSquare,
    titel: "1-op-1 berichten",
    beschrijving: "Directe berichten tussen twee medewerkers — kantoor of buitendienst.",
  },
  {
    icoon: Users,
    titel: "Groepsgesprekken",
    beschrijving: "Maak groepschats aan per project, team of werkmaatschappij.",
  },
  {
    icoon: Image,
    titel: "Foto's en camera",
    beschrijving: "Verstuur foto's of maak ze direct vanuit de app. Voeg een tekening of opmerking toe op de foto voor snelle terugkoppeling.",
  },
  {
    icoon: FileText,
    titel: "Documenten",
    beschrijving: "Deel werkbonnen, instructies en andere bestanden direct in het gesprek.",
  },
  {
    icoon: Pencil,
    titel: "Annotaties op foto's",
    beschrijving: "Teken of schrijf rechtstreeks op een foto om een afwijking of instructie te markeren.",
  },
  {
    icoon: Clock,
    titel: "Beschikbaarheid",
    beschrijving: "Desktop voor kantoormedewerkers, mobiel voor buitendienst (inclusief inleenpersoneel).",
  },
];

export default function BerichtenPagina() {
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Berichten</h1>
          <Badge variant="outline" className="text-xs border-amber-400 text-amber-700 bg-amber-50">
            In ontwikkeling
          </Badge>
        </div>
        <p className="text-muted-foreground">
          Communicatieplatform voor kantoor en buitendienst — snel, direct en veilig binnen FPS Connect.
        </p>
      </div>

      <Card className="border-amber-200 bg-amber-50/40">
        <CardContent className="pt-5 pb-4">
          <p className="text-sm text-amber-800">
            Deze module is in ontwerp. De onderstaande functies zijn vastgelegd en worden in een volgende fase gebouwd.
            De naam, exacte indeling en mobiele weergave worden nog definitief bepaald.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {FUNCTIES.map(({ icoon: Icoon, titel, beschrijving }) => (
          <Card key={titel}>
            <CardContent className="pt-5 pb-4 flex gap-4 items-start">
              <div className="mt-0.5 shrink-0 rounded-md bg-muted p-2">
                <Icoon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="space-y-0.5">
                <div className="font-medium text-sm">{titel}</div>
                <div className="text-xs text-muted-foreground leading-relaxed">{beschrijving}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Bereikbaar op desktop voor alle kantoormedewerkers en op mobiel voor alle buitendienstmedewerkers (inclusief inleenpersoneel).
      </p>
    </div>
  );
}
