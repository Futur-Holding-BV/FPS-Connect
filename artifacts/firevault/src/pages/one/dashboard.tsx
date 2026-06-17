import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LayoutDashboard, Building, FileText, BarChart3, CreditCard, Construction } from "lucide-react";

const MODULE_ITEMS = [
  {
    icoon: Building,
    titel: "Mijn gebouwen",
    omschrijving: "Overzicht van uw brandpreventieve objecten per locatie.",
    beschikbaar: false,
  },
  {
    icoon: FileText,
    titel: "Documenten",
    omschrijving: "Toegang tot uw brandpreventierapportages en certificaten.",
    beschikbaar: false,
  },
  {
    icoon: BarChart3,
    titel: "Rapporten",
    omschrijving: "Opleverrapporten, inspecties en statusoverzichten per gebouw.",
    beschikbaar: false,
  },
  {
    icoon: CreditCard,
    titel: "Abonnementen",
    omschrijving: "Uw abonnementspakket, facturen en contactgegevens.",
    beschikbaar: false,
  },
];

export default function OneDashboard() {
  return (
    <div className="space-y-6">
      {/* FPS One Header */}
      <div className="rounded-xl border bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6 md:p-8">
        <Badge className="mb-4 bg-white/10 text-white border-white/20 hover:bg-white/20">
          FPS One — Klantomgeving
        </Badge>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-slate-300 mt-2 max-w-xl">
          Welkom in FPS One — uw persoonlijke omgeving voor het beheren en inzien van brandpreventieve
          informatie per gebouw.
        </p>
        <div className="mt-5 flex items-center gap-2 text-sm text-amber-400">
          <Construction className="h-4 w-4 shrink-0" />
          <span>FPS One is momenteel in voorbereiding. De modules worden stapsgewijs beschikbaar gesteld.</span>
        </div>
      </div>

      {/* Module cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {MODULE_ITEMS.map((item) => (
          <Card key={item.titel} className="border-dashed opacity-70">
            <CardContent className="pt-5 flex items-start gap-4">
              <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                <item.icoon className="h-5 w-5 text-slate-500" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm">{item.titel}</p>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                    In voorbereiding
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{item.omschrijving}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-xs text-muted-foreground text-center">
        FPS One wordt beschikbaar gesteld aan klanten van FPS Brandpreventie.
        Neem contact op met uw contactpersoon voor meer informatie.
      </p>
    </div>
  );
}
