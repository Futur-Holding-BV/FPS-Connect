import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, Search, FolderOpen, Download, Lock, Construction } from "lucide-react";

const GEPLANDE_FUNCTIES = [
  { icoon: FolderOpen, titel: "Documentenbibliotheek", omschrijving: "Alle brandpreventierapportages op één plek, geordend per gebouw en datum." },
  { icoon: Search, titel: "Zoeken en filteren", omschrijving: "Snel zoeken op gebouw, type document, datum en status." },
  { icoon: Download, titel: "Downloaden", omschrijving: "Documenten direct downloaden als PDF." },
  { icoon: Lock, titel: "Beveiligd toegang", omschrijving: "Alleen uw eigen documenten zijn zichtbaar — volledig afgeschermd per klant." },
];

export default function OneDocumenten() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6 md:p-8">
        <Badge className="mb-4 bg-white/10 text-white border-white/20 hover:bg-white/20">
          FPS One — Klantomgeving
        </Badge>
        <h1 className="text-3xl font-bold tracking-tight">Documenten</h1>
        <p className="text-slate-300 mt-2 max-w-xl">
          Uw brandpreventierapportages, certificaten en inspectiepapieren op een veilige, centrale plek.
        </p>
        <div className="mt-5 flex items-center gap-2 text-sm text-amber-400">
          <Construction className="h-4 w-4 shrink-0" />
          <span>Deze module is in voorbereiding en wordt binnenkort beschikbaar gesteld.</span>
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
