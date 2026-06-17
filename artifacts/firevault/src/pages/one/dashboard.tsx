import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, FileText, BarChart3, CreditCard } from "lucide-react";

const MODULE_ITEMS = [
  {
    icoon: Building2,
    titel: "Mijn gebouwen",
    omschrijving: "Overzicht van uw brandpreventieve objecten per locatie.",
    href: "/one/gebouwen",
    beschikbaar: true,
  },
  {
    icoon: FileText,
    titel: "Documenten",
    omschrijving: "Toegang tot uw brandpreventierapportages en certificaten.",
    href: "/one/documenten",
    beschikbaar: true,
  },
  {
    icoon: BarChart3,
    titel: "Rapporten",
    omschrijving: "Opleverrapporten, inspecties en statusoverzichten per gebouw.",
    href: "/one/rapporten",
    beschikbaar: true,
  },
  {
    icoon: CreditCard,
    titel: "Abonnementen",
    omschrijving: "Uw abonnementspakket, facturen en contactgegevens.",
    href: "/one/abonnementen",
    beschikbaar: true,
  },
];

export default function OneDashboard() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6 md:p-8">
        <Badge className="mb-4 bg-white/10 text-white border-white/20 hover:bg-white/20">
          FPS One — Klantomgeving
        </Badge>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-slate-300 mt-2 max-w-xl">
          Welkom in FPS One — uw persoonlijke omgeving voor het beheren en inzien van brandpreventieve
          informatie per gebouw.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {MODULE_ITEMS.map((item) => (
          <Link key={item.titel} href={item.href}>
            <Card className="hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer group">
              <CardContent className="pt-5 flex items-start gap-4">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/15 transition-colors">
                  <item.icoon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">{item.titel}</p>
                  <p className="text-xs text-muted-foreground mt-1">{item.omschrijving}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <p className="text-xs text-muted-foreground text-center">
        FPS One — uw brandpreventie-informatie op een veilige, centrale plek.
      </p>
    </div>
  );
}
