import { Link } from "wouter";
import {
  useGetHrmStats,
  useListMedewerkers,
  useListAlleVerlofAanvragen,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users, Briefcase, GraduationCap, CalendarClock,
  ChevronRight, UserCheck, Clock, ArrowRight,
} from "lucide-react";

function StatKaart({
  titel,
  waarde,
  icoon: Icoon,
  sub,
}: {
  titel: string;
  waarde: string | number;
  icoon: React.ElementType;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{titel}</p>
            <p className="text-3xl font-bold mt-1">{waarde}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Icoon className="h-6 w-6 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ConnectHrm() {
  const { data: stats, isLoading: statLaden } = useGetHrmStats();
  const { data: medewerkers, isLoading: medLaden } = useListMedewerkers();
  const { data: verlof, isLoading: verlofLaden } = useListAlleVerlofAanvragen();

  const openVerlof = (verlof ?? []).filter(
    (v) => (v as { status?: string }).status === "aangevraagd",
  ).length;

  const actiefAantal = (medewerkers ?? []).filter((m) => m.actief !== false).length;
  const recentMedewerkers = (medewerkers ?? [])
    .filter((m) => m.actief !== false)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">HRM</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Personeelsoverzicht en HR-beheer
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs px-2 py-1">
            <Users className="h-3 w-3 mr-1" />
            FPS Connect
          </Badge>
          <Link href="/personeel">
            <Button size="sm" variant="outline" className="gap-1">
              Volledige HRM-module
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Statistieken */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statLaden ? (
          <>
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardContent className="pt-6">
                  <Skeleton className="h-8 w-16 mb-2" />
                  <Skeleton className="h-4 w-24" />
                </CardContent>
              </Card>
            ))}
          </>
        ) : (
          <>
            <StatKaart
              titel="Actieve medewerkers"
              waarde={actiefAantal}
              icoon={UserCheck}
              sub={`van ${(medewerkers ?? []).length} totaal`}
            />
            <StatKaart
              titel="Functies"
              waarde={(stats as { functies_totaal?: number })?.functies_totaal ?? "—"}
              icoon={Briefcase}
            />
            <StatKaart
              titel="Opleidingen"
              waarde={(stats as { opleidingen_totaal?: number })?.opleidingen_totaal ?? "—"}
              icoon={GraduationCap}
            />
            <StatKaart
              titel="Open verlofaanvragen"
              waarde={verlofLaden ? "..." : openVerlof}
              icoon={CalendarClock}
              sub="wachten op goedkeuring"
            />
          </>
        )}
      </div>

      {/* Recente medewerkers */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Medewerkers</CardTitle>
          <Link href="/personeel">
            <Button size="sm" variant="ghost" className="text-xs gap-1">
              Alle medewerkers
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="pt-0">
          {medLaden ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded" />)}
            </div>
          ) : recentMedewerkers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nog geen medewerkers aangemaakt.
            </p>
          ) : (
            <div className="space-y-1">
              {recentMedewerkers.map((m) => (
                <Link key={m.id} href={`/personeel/${m.id}`}>
                  <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent/30 transition-colors cursor-pointer group">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary shrink-0">
                      {m.naam.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{m.naam}</p>
                      <p className="text-xs text-muted-foreground">{m.werkmaatschappij}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Snelkoppelingen naar bestaande HRM-module */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { href: "/personeel", icoon: Users, titel: "Medewerkers", omschrijving: "Profielen, contracten en verlof" },
          { href: "/personeel", icoon: Briefcase, titel: "Functiehuis", omschrijving: "Functies, niveaus en bekwaamheden" },
          { href: "/personeel", icoon: GraduationCap, titel: "Opleidingen", omschrijving: "Certificaten en bijscholing" },
        ].map((link) => (
          <Link key={link.href + link.titel} href={link.href}>
            <Card className="hover:border-primary/40 hover:bg-accent/10 transition-colors cursor-pointer group">
              <CardContent className="pt-5 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <link.icoon className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm">{link.titel}</p>
                  <p className="text-xs text-muted-foreground">{link.omschrijving}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
