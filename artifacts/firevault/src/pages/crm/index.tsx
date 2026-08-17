import { Link } from "wouter";
import {
  useGetCrmDashboard,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2, Users, Target, AlertCircle, Clock,
  ChevronRight, ArrowRight, Handshake, Newspaper, TrendingUp, Megaphone,
  ClipboardList, Sparkles, BookOpen, Inbox,
} from "lucide-react";

const FASE_KLEUR: Record<string, string> = {
  signaal: "bg-slate-100 text-slate-700 border-slate-200",
  eerste_contact: "bg-blue-100 text-blue-700 border-blue-200",
  afspraak: "bg-purple-100 text-purple-700 border-purple-200",
  calculatie: "bg-yellow-100 text-yellow-700 border-yellow-200",
  offerte: "bg-orange-100 text-orange-700 border-orange-200",
  onderhandeling: "bg-red-100 text-red-700 border-red-200",
  gewonnen: "bg-emerald-100 text-emerald-700 border-emerald-200",
  verloren: "bg-gray-100 text-gray-500 border-gray-200",
};

const FASE_LABEL: Record<string, string> = {
  signaal: "Signaal", eerste_contact: "Eerste contact", afspraak: "Afspraak",
  calculatie: "Calculatie", offerte: "Offerte", onderhandeling: "Onderhandeling",
  gewonnen: "Gewonnen", verloren: "Verloren",
};

function euro(v: number) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
}

export default function CrmDashboardPagina() {
  const { data: dash, isLoading } = useGetCrmDashboard();

  const nav = [
    { href: "/crm/organisaties", label: "Organisaties", icon: Building2, beschrijving: "Klanten, prospects en partners" },
    { href: "/crm/contactpersonen", label: "Contactpersonen", icon: Users, beschrijving: "Relaties per organisatie" },
    { href: "/crm/aanvragen", label: "Aanvragen", icon: Inbox, beschrijving: "Prijsaanvragen uit de mail, ter accordering" },
    { href: "/crm/projectkansen", label: "Projectkansen", icon: Target, beschrijving: "Pipeline en lopende trajecten" },
    { href: "/crm/concurrenten", label: "Concurrenten", icon: Handshake, beschrijving: "Marktpositie en analyse" },
    { href: "/crm/marktintelligentie", label: "Marktinzicht", icon: Newspaper, beschrijving: "Nieuws, aanbestedingen en signalen" },
    { href: "/crm/taken", label: "Taken", icon: ClipboardList, beschrijving: "Acties en opvolging" },
    { href: "/crm/relatievoorstellen", label: "AI-relatievoorstellen", icon: Sparkles, beschrijving: "Voorgestelde contacten ter beoordeling" },
    { href: "/crm/marketing", label: "Marketing", icon: Megaphone, beschrijving: "Doelgroepen, sjablonen en campagnes" },
    { href: "/crm/kennisbibliotheek", label: "Kennisbibliotheek", icon: BookOpen, beschrijving: "Documenten en naslag" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">CRM & Marktinzicht</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Relatiebeheer, pipeline en marktpositie</p>
      </div>

      {/* Statistieken */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : dash && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Organisaties</p>
                  <p className="text-3xl font-bold mt-1">{dash.totaal_organisaties}</p>
                </div>
                <Building2 className="w-5 h-5 text-muted-foreground mt-0.5" />
              </div>
              <p className="text-xs text-muted-foreground mt-2">{dash.key_accounts ?? 0} key accounts</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Open kansen</p>
                  <p className="text-3xl font-bold mt-1">{dash.open_kansen}</p>
                </div>
                <Target className="w-5 h-5 text-muted-foreground mt-0.5" />
              </div>
              <p className="text-xs text-muted-foreground mt-2">{dash.gewonnen_dit_jaar ?? 0} gewonnen dit jaar</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Gewogen pijplijn</p>
                  <p className="text-2xl font-bold mt-1">{euro(dash.totaal_pijplijn_gewogen)}</p>
                </div>
                <TrendingUp className="w-5 h-5 text-muted-foreground mt-0.5" />
              </div>
              <p className="text-xs text-muted-foreground mt-2">Gecorrigeerd voor kans%</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Aandacht nodig</p>
                  <p className="text-3xl font-bold mt-1">{dash.geen_contact_60_dagen ?? 0}</p>
                </div>
                <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5" />
              </div>
              <p className="text-xs text-muted-foreground mt-2">Geen contact &gt; 60 dagen</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Navigatiekaarten */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {nav.map(({ href, label, icon: Icon, beschrijving }) => (
          <Link key={href} href={href}>
            <Card className="cursor-pointer hover:shadow-md hover:border-primary/40 transition-all">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{beschrijving}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Volgende acties + Top open kansen */}
      {dash && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {(dash.volgende_acties as Array<{ id: number; titel: string; actie: string; fase: string; verwachte_datum?: string }>)?.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="w-4 h-4" /> Volgende acties
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {(dash.volgende_acties as Array<{ id: number; titel: string; actie: string; fase: string; verwachte_datum?: string }>).map((item) => (
                    <Link key={item.id} href="/crm/projectkansen">
                      <div className="px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{item.titel}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.actie}</p>
                          </div>
                          <Badge className={`text-xs shrink-0 border ${FASE_KLEUR[item.fase] ?? ""}`} variant="outline">
                            {FASE_LABEL[item.fase] ?? item.fase}
                          </Badge>
                        </div>
                        {item.verwachte_datum && (
                          <p className="text-xs text-muted-foreground mt-0.5">Streefdatum: {item.verwachte_datum}</p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {(dash.open_kansen_top as Array<{ id: number; titel: string; fase: string; waarde?: number; kans?: number; organisatie_naam?: string }>)?.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Target className="w-4 h-4" /> Top open kansen
                  </CardTitle>
                  <Link href="/crm/projectkansen">
                    <Button variant="ghost" size="sm" className="text-xs h-7">
                      Alle kansen <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {(dash.open_kansen_top as Array<{ id: number; titel: string; fase: string; waarde?: number; kans?: number; organisatie_naam?: string }>).map((kans) => (
                    <Link key={kans.id} href="/crm/projectkansen">
                      <div className="px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{kans.titel}</p>
                            {kans.organisatie_naam && <p className="text-xs text-muted-foreground">{kans.organisatie_naam}</p>}
                          </div>
                          <div className="text-right shrink-0">
                            {kans.waarde && <p className="text-xs font-semibold">{euro(kans.waarde)}</p>}
                            {kans.kans && <p className="text-xs text-muted-foreground">{kans.kans}% kans</p>}
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
