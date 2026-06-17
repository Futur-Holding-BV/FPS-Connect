import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart3, FileBadge, Clock, CheckCircle2, Construction } from "lucide-react";

const GEPLANDE_FUNCTIES = [
  { icoon: BarChart3, titel: "Opleverrapporten", omschrijving: "Definitieve brandpreventierapportages per gebouw met spotdetails en plattegronden." },
  { icoon: FileBadge, titel: "Inspectiestatus", omschrijving: "Real-time inzicht in inspectiestatus, afkeuringen en herstelacties." },
  { icoon: Clock, titel: "Reactietermijnen", omschrijving: "Overzicht van openstaande punten met verplichte reactietermijnen." },
  { icoon: CheckCircle2, titel: "Opleverstatus", omschrijving: "Formele opleverstatus per gebouw — van concept tot definitief." },
];

export default function OneRapporten() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6 md:p-8">
        <Badge className="mb-4 bg-white/10 text-white border-white/20 hover:bg-white/20">
          FPS One — Klantomgeving
        </Badge>
        <h1 className="text-3xl font-bold tracking-tight">Rapporten</h1>
        <p className="text-slate-300 mt-2 max-w-xl">
          Inzicht in brandpreventiestatus per gebouw via formele opleverrapporten en inspecties.
        </p>
        <div className="mt-5 flex items-center gap-2 text-sm text-amber-400">
          <Construction className="h-4 w-4 shrink-0" />
          <span>Deze module volgt op de V1.5 Rapportenmodule in FPS Connect.</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {GEPLANDE_FUNCTIES.map((f) => (
          <Card key={f.titel} className="border-dashed opacity-70">
            <CardContent className="pt-5 flex items-start gap-4">
              <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                <f.icoon className="h-5 w-5 text-slate-500" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm">{f.titel}</p>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                    In voorbereiding
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{f.omschrijving}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
